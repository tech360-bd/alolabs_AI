import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { resolveMediaProvider } from '@/lib/media-generation/requests';
import { transcribe } from '@/lib/media-generation/transcribe';

/**
 * POST /api/video-studio/transcribe
 *
 * Speech-to-text for subtitles (the VideoCaptioner capability). Accepts
 * multipart `file` (audio or video, ≤25 MB — the provider limit), optional
 * `language` and `prompt`, and optional `projectId` to attach the generated
 * SRT to a Video Hub project as a `subtitle` record.
 *
 * Uses the OpenAI-compatible `/audio/transcriptions` contract through
 * `MEDIA_API_KEY` / `MEDIA_BASE_URL`; without a key it returns 503 instead of
 * an empty transcript.
 */

const MAX_BYTES = 25 * 1024 * 1024;

async function attachToProject(params: {
  projectId: string;
  language: string;
  srt: string;
  text: string;
  wordCount: number;
  durationSeconds: number;
  userId: string;
}): Promise<boolean> {
  const projectKeyPrefix = 'video_hub:project:';
  const projects = await db.settings.findMany({
    where: { key: { startsWith: projectKeyPrefix } },
    take: 500,
  });
  const project = projects.find((row) => {
    try {
      return (JSON.parse(row.value) as { id?: string }).id === params.projectId;
    } catch {
      return false;
    }
  });
  if (!project) return false;

  const minutes = Math.floor(params.durationSeconds / 60);
  const seconds = Math.floor(params.durationSeconds % 60);
  const key = `video_hub:subtitle:${params.projectId}:${params.language}`;
  const record = {
    _type: 'subtitle' as const,
    id: `sub-${Date.now()}`,
    projectId: params.projectId,
    language: params.language,
    type: 'auto-generated' as const,
    accuracy: 0,
    wordCount: params.wordCount,
    duration: `${minutes}:${String(seconds).padStart(2, '0')}`,
    status: 'ready',
    content: params.srt,
    text: params.text,
    source: 'whisper-compatible',
    createdAt: new Date().toISOString(),
    requestedBy: params.userId,
    requestedAt: new Date().toISOString(),
  };

  const value = JSON.stringify(record);
  await db.settings.upsert({
    where: { key },
    update: { value, type: 'json', updatedAt: new Date() },
    create: { key, value, type: 'json' },
  });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A "file" field is required' }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 25 MiB transcription limit' }, { status: 413 });
    }

    const { config } = resolveMediaProvider();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration required: set MEDIA_API_KEY (or OPENAI_API_KEY) to enable transcription' },
        { status: 503 },
      );
    }

    const language = String(form.get('language') ?? '').trim().slice(0, 12) || undefined;
    const prompt = String(form.get('prompt') ?? '').trim().slice(0, 1000) || undefined;
    const projectId = String(form.get('projectId') ?? '').trim();

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribe(config, {
      buffer,
      filename: file.name || 'audio.mp3',
      ...(file.type ? { mimeType: file.type } : {}),
      ...(language ? { language } : {}),
      ...(prompt ? { prompt } : {}),
    });

    let attached = false;
    if (projectId) {
      try {
        attached = await attachToProject({
          projectId: projectId.slice(0, 120),
          language: language || result.language || 'en',
          srt: result.srt,
          text: result.text,
          wordCount: result.text.split(/\s+/).filter(Boolean).length,
          durationSeconds: result.segments.length ? result.segments[result.segments.length - 1].end : 0,
          userId: user.userId,
        });
      } catch (error) {
        console.error('Subtitle attach failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      text: result.text,
      language: result.language,
      srt: result.srt,
      vtt: result.vtt,
      segments: result.segments,
      attached,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 502 },
    );
  }
}
