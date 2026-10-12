import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// ── Helpers ─────────────────────────────────────────────────────────
function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    pagination: { page, limit, total, pages },
  };
}

async function loadRecords(prefix: string) {
  const records = await db.settings.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  const results: Record<string, unknown>[] = [];
  for (const rec of records) {
    try {
      const parsed = JSON.parse(rec.value);
      results.push({ ...parsed, dbId: rec.id });
    } catch {
      // skip malformed records
    }
  }
  return results;
}

function filterByField(
  items: Record<string, unknown>[],
  field: string,
  value: string | null,
): Record<string, unknown>[] {
  if (!value || !field) return items;
  return items.filter((item) => {
    const v = item[field];
    if (Array.isArray(v)) return v.includes(value);
    if (typeof v === 'string') return v === value;
    return false;
  });
}

function filterByStatus(
  items: Record<string, unknown>[],
  status?: string | null,
): Record<string, unknown>[] {
  if (!status) return items;
  return items.filter((item) => item.status === status);
}

function filterBySearch(
  items: Record<string, unknown>[],
  search: string | null,
  fields: string[],
): Record<string, unknown>[] {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((item) =>
    fields.some((f) => {
      const v = item[f];
      return typeof v === 'string' && v.toLowerCase().includes(q);
    }),
  );
}

// ── GET ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const quality = searchParams.get('quality');
    const language = searchParams.get('language');
    const provider = searchParams.get('provider');
    const source = searchParams.get('source');
    const search = searchParams.get('search');

    const allRecords = await loadRecords('voice_system:');

    const voiceModels = allRecords.filter((r) => r._type === 'voice_model');
    const ttsJobs = allRecords.filter((r) => r._type === 'tts_job');
    const sttJobs = allRecords.filter((r) => r._type === 'stt_job');
    const voiceLibrary = allRecords.filter((r) => r._type === 'voice_library');

    // Filter voice models
    let filteredModels = filterByStatus(voiceModels, status);
    if (type) filteredModels = filterByField(filteredModels, 'type', type);
    if (quality) filteredModels = filterByField(filteredModels, 'quality', quality);
    if (provider) filteredModels = filterByField(filteredModels, 'provider', provider);
    if (language) filteredModels = filterByField(filteredModels, 'language', language);
    filteredModels = filterBySearch(filteredModels, search, ['name', 'provider']);

    // Filter voice library
    let filteredLibrary = filterByStatus(voiceLibrary, status);
    if (source) filteredLibrary = filterByField(filteredLibrary, 'source', source);
    if (language) filteredLibrary = filterByField(filteredLibrary, 'language', language);
    filteredLibrary = filterBySearch(filteredLibrary, search, ['name', 'style']);

    // Filter TTS jobs
    let filteredTtsJobs = filterByStatus(ttsJobs, status);

    // Filter STT jobs
    let filteredSttJobs = filterByStatus(sttJobs, status);

    // Compute stats from real data only
    const activeModels = voiceModels.filter((m) => m.status === 'active').length;
    const standbyModels = voiceModels.filter((m) => m.status === 'standby').length;
    const ttsModels = voiceModels.filter((m) => m.type === 'tts').length;
    const sttModels = voiceModels.filter((m) => m.type === 'stt').length;
    const activeLibrary = voiceLibrary.filter((v) => v.status === 'active').length;

    const stats = {
      totalModels: voiceModels.length,
      activeModels,
      standbyModels,
      ttsModels,
      sttModels,
      totalVoiceLibrary: voiceLibrary.length,
      activeVoiceLibrary: activeLibrary,
      ttsJobsTotal: ttsJobs.length,
      sttJobsTotal: sttJobs.length,
    };

    // TTS config (defaults, no preset voices)
    const ttsConfig = {
      defaultModel: 'kokoro-v1',
      defaultVoice: 'alloy',
      defaultSpeed: 1.0,
      defaultPitch: 1.0,
      sampleRate: 24000,
      outputFormat: 'mp3',
      maxTextLength: 5000,
      streamingEnabled: true,
      ssmlSupport: true,
      emotionsEnabled: true,
      voices: [],
    };

    // STT config (defaults)
    const sttConfig = {
      defaultModel: 'whisper-large',
      language: 'auto-detect',
      maxAudioLength: 600,
      supportedFormats: ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a'],
      diarizationEnabled: true,
      maxSpeakers: 10,
      wordLevelTimestamps: true,
      profanityFilter: false,
      customVocabulary: ['AgentOS', 'ALO Labs'],
      streamingEnabled: true,
      vadEnabled: true,
    };

    const data = {
      voiceModels: paginate(filteredModels, page, limit),
      ttsConfig,
      sttConfig,
      voiceLibrary: paginate(filteredLibrary, page, limit),
      ttsJobs: paginate(filteredTtsJobs, page, limit),
      sttJobs: paginate(filteredSttJobs, page, limit),
      stats,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Voice System GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, ...payload } = body as { action: string; [key: string]: unknown };

    // ── Action: create_voice_model_config ───────────────────────────
    if (action === 'create_voice_model_config') {
      const {
        name,
        modelType,
        provider,
        quality,
        maxConcurrency,
        parameters,
        gpuMemory,
        version,
        language: modelLang,
      } = payload as {
        name: string;
        modelType?: string;
        provider?: string;
        quality?: string;
        maxConcurrency?: number;
        parameters?: string;
        gpuMemory?: string;
        version?: string;
        language?: string;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Voice model name is required' }, { status: 400 });
      }

      const validTypes = ['tts', 'stt', 'both'];
      const validQualities = ['low', 'medium', 'high', 'ultra'];

      const modelData = {
        _type: 'voice_model' as const,
        id: `vm-${Date.now()}`,
        name: name.trim(),
        type: validTypes.includes(modelType || '') ? modelType : 'tts',
        provider: provider || 'custom',
        status: 'standby',
        quality: validQualities.includes(quality || '') ? quality : 'medium',
        maxConcurrency: maxConcurrency && maxConcurrency > 0 ? maxConcurrency : 5,
        currentUsage: 0,
        latencyP50: 0,
        latencyP95: 0,
        totalCalls: 0,
        language: modelLang || 'en-US',
        parameters: parameters || 'unknown',
        gpuMemory: gpuMemory || '0GB',
        version: version || '1.0.0',
        lastUpdated: new Date().toISOString().split('T')[0],
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `voice_system:model:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(modelData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(modelData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: modelData });
    }

    // ── Action: start_tts_job ───────────────────────────────────────
    if (action === 'start_tts_job') {
      const {
        text,
        voice,
        model,
        speed,
        pitch,
        outputFormat,
        language: ttsLang,
        ssml,
        emotion,
      } = payload as {
        text: string;
        voice?: string;
        model?: string;
        speed?: number;
        pitch?: number;
        outputFormat?: string;
        language?: string;
        ssml?: string;
        emotion?: string;
      };

      if (!text && !ssml) {
        return NextResponse.json({ error: 'Either text or ssml is required for TTS' }, { status: 400 });
      }

      if (text && text.length > 50000) {
        return NextResponse.json({ error: 'Text exceeds maximum length of 50000 characters' }, { status: 400 });
      }

      const validFormats = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
      const validatedVoice = voice || 'alloy';
      const validatedFormat = validFormats.includes(outputFormat || '') ? outputFormat : 'mp3';

      if (speed !== undefined && (speed < 0.25 || speed > 4.0)) {
        return NextResponse.json({ error: 'Speed must be between 0.25 and 4.0' }, { status: 400 });
      }

      const ttsJobData = {
        _type: 'tts_job' as const,
        id: `tts-${Date.now()}`,
        text: text || '',
        ssml: ssml || null,
        voice: validatedVoice,
        model: model || 'kokoro-v1',
        speed: speed ?? 1.0,
        pitch: pitch ?? 1.0,
        outputFormat: validatedFormat,
        language: ttsLang || 'en-US',
        emotion: emotion || null,
        status: 'queued',
        outputUrl: null,
        duration: null,
        charCount: (text || ssml || '').length,
        createdAt: new Date().toISOString(),
        createdBy: user.userId,
      };

      const key = `voice_system:tts:${ttsJobData.id}`;

      await db.settings.create({
        data: { key, value: JSON.stringify(ttsJobData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: ttsJobData });
    }

    // ── Action: start_stt_transcription ─────────────────────────────
    if (action === 'start_stt_transcription') {
      const {
        audioUrl,
        language: sttLang,
        model: sttModel,
        diarization,
        maxSpeakers,
        wordLevelTimestamps,
        profanityFilter,
        customVocabulary,
        vadEnabled,
      } = payload as {
        audioUrl?: string;
        language?: string;
        model?: string;
        diarization?: boolean;
        maxSpeakers?: number;
        wordLevelTimestamps?: boolean;
        profanityFilter?: boolean;
        customVocabulary?: string[];
        vadEnabled?: boolean;
      };

      if (!audioUrl) {
        return NextResponse.json({ error: 'audioUrl is required for STT transcription' }, { status: 400 });
      }

      if (maxSpeakers !== undefined && (maxSpeakers < 1 || maxSpeakers > 20)) {
        return NextResponse.json({ error: 'maxSpeakers must be between 1 and 20' }, { status: 400 });
      }

      const validSttModels = ['whisper-large', 'whisper-medium', 'whisper-small', 'whisper-tiny'];
      const validatedModel = validSttModels.includes(sttModel || '') ? sttModel : 'whisper-large';

      const sttJobData = {
        _type: 'stt_job' as const,
        id: `stt-${Date.now()}`,
        audioUrl,
        language: sttLang || 'auto-detect',
        model: validatedModel,
        diarization: diarization ?? true,
        maxSpeakers: maxSpeakers ?? 2,
        wordLevelTimestamps: wordLevelTimestamps ?? true,
        profanityFilter: profanityFilter ?? false,
        customVocabulary: customVocabulary || [],
        vadEnabled: vadEnabled ?? true,
        status: 'queued',
        transcription: null,
        confidence: null,
        duration: null,
        wordCount: 0,
        speakerCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: user.userId,
      };

      const key = `voice_system:stt:${sttJobData.id}`;

      await db.settings.create({
        data: { key, value: JSON.stringify(sttJobData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: sttJobData });
    }

    // ── Action: add_voice_to_library ────────────────────────────────
    if (action === 'add_voice_to_library') {
      const {
        name,
        source: voiceSource,
        model,
        language: voiceLang,
        gender: voiceGender,
        style: voiceStyle,
      } = payload as {
        name: string;
        source?: string;
        model?: string;
        language?: string;
        gender?: string;
        style?: string;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Voice library entry name is required' }, { status: 400 });
      }

      const validSources = ['cloned', 'preset', 'uploaded'];
      const validGenders = ['male', 'female', 'neutral'];

      const voiceData = {
        _type: 'voice_library' as const,
        id: `vl-${Date.now()}`,
        name: name.trim(),
        source: validSources.includes(voiceSource || '') ? voiceSource : 'cloned',
        model: model || 'kokoro-v1',
        language: voiceLang || 'en-US',
        gender: validGenders.includes(voiceGender || '') ? voiceGender : 'neutral',
        style: voiceStyle || 'professional',
        duration: null,
        quality: 0,
        status: 'processing',
        createdAt: new Date().toISOString().split('T')[0],
        usageCount: 0,
        createdBy: user.userId,
      };

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `voice_system:library:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(voiceData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(voiceData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: voiceData });
    }

    // ── Fallback ────────────────────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown action: ${action}. Supported: create_voice_model_config, start_tts_job, start_stt_transcription, add_voice_to_library` },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Voice System POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
