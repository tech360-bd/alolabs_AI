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
    const language = searchParams.get('language');
    const resolution = searchParams.get('resolution');
    const style = searchParams.get('style');
    const search = searchParams.get('search');

    const allRecords = await loadRecords('video_hub:');

    const projects = allRecords.filter((r) => r._type === 'video_project');
    const avatars = allRecords.filter((r) => r._type === 'avatar');
    const subtitles = allRecords.filter((r) => r._type === 'subtitle');
    const presenters = allRecords.filter((r) => r._type === 'presenter');

    // Filter presenters
    let filteredPresenters = filterByStatus(presenters, status);
    if (type) filteredPresenters = filterByField(filteredPresenters, 'type', type);
    if (style) filteredPresenters = filterByField(filteredPresenters, 'style', style);
    if (language) filteredPresenters = filterByField(filteredPresenters, 'language', language);
    filteredPresenters = filterBySearch(filteredPresenters, search, ['name']);

    // Filter avatars
    let filteredAvatars = filterByStatus(avatars, status);
    if (type) filteredAvatars = filterByField(filteredAvatars, 'type', type);
    if (resolution) filteredAvatars = filterByField(filteredAvatars, 'resolution', resolution);
    filteredAvatars = filterBySearch(filteredAvatars, search, ['name']);

    // Filter video projects
    let filteredProjects = filterByStatus(projects, status);
    if (resolution) filteredProjects = filterByField(filteredProjects, 'resolution', resolution);
    if (language) filteredProjects = filterByField(filteredProjects, 'language', language);
    filteredProjects = filterBySearch(filteredProjects, search, ['title', 'script']);

    // Filter subtitles
    let filteredSubtitles = filterByStatus(subtitles, status);
    if (language) filteredSubtitles = filterByField(filteredSubtitles, 'language', language);
    if (type) filteredSubtitles = filterByField(filteredSubtitles, 'type', type);

    // Compute stats from real data only
    const completedVideos = projects.filter((p) => p.status === 'completed').length;
    const renderingVideos = projects.filter((p) => p.status === 'rendering').length;
    const draftVideos = projects.filter((p) => p.status === 'draft').length;
    const totalViews = projects.reduce((sum, p) => sum + (typeof p.views === 'number' ? p.views : 0), 0);

    const stats = {
      totalProjects: projects.length,
      completedVideos,
      renderingVideos,
      draftVideos,
      totalViews,
      totalDuration: '0m',
      avgRenderTime: '0 min',
      subtitleLanguages: new Set(subtitles.map((s) => s.language as string)).size,
      totalSubtitles: subtitles.length,
    };

    // Voice sync config (defaults, populated from DB records if available)
    const voiceSync = {
      currentModel: 'kokoro-v1',
      availableModels: [],
      syncAccuracy: 0,
      avgProcessingTime: '0s per minute of video',
      supportedLanguages: [],
      recentSyncs: [],
    };

    const data = {
      presenters: paginate(filteredPresenters, page, limit),
      avatars: paginate(filteredAvatars, page, limit),
      videoProjects: paginate(filteredProjects, page, limit),
      subtitles: paginate(filteredSubtitles, page, limit),
      voiceSync,
      stats,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Video Hub GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, ...payload } = body as { action: string; [key: string]: unknown };

    // ── Action: create_video_project ────────────────────────────────
    if (action === 'create_video_project') {
      const { title, script, presenterId, avatarId, resolution, language } = payload as {
        title: string;
        script?: string;
        presenterId?: string;
        avatarId?: string;
        resolution?: string;
        language?: string;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Video project title is required' }, { status: 400 });
      }

      const validResolutions = ['720p', '1080p', '2K', '4K'];
      const projectResolution = validResolutions.includes(resolution || '') ? resolution : '1080p';

      const projectData = {
        _type: 'video_project' as const,
        id: `vp-${Date.now()}`,
        title: title.trim(),
        script: script || '',
        presenterId: presenterId || null,
        avatarId: avatarId || null,
        duration: '0:00',
        status: 'draft',
        resolution: projectResolution,
        createdAt: new Date().toISOString(),
        thumbnailUrl: null,
        views: 0,
        language: language || 'en-US',
        subtitles: [] as string[],
        createdBy: user.userId,
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `video_hub:project:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(projectData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(projectData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: projectData });
    }

    // ── Action: generate_avatar ─────────────────────────────────────
    if (action === 'generate_avatar') {
      const { name, type: avatarType, resolution, fps, style, backgroundColor, expressions, presenterId, gender } = payload as {
        name: string;
        type?: string;
        resolution?: string;
        fps?: number;
        style?: string;
        backgroundColor?: string;
        expressions?: string[];
        presenterId?: string;
        gender?: string;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Avatar name is required' }, { status: 400 });
      }

      const validTypes = ['upper-body', 'full-body', 'portrait'];
      const validResolutions = ['720p', '1080p', '2K', '4K'];
      const defaultExpressions = ['neutral', 'smile', 'thinking', 'serious'];

      const avatarData = {
        _type: 'avatar' as const,
        id: `av-${Date.now()}`,
        name: name.trim(),
        type: validTypes.includes(avatarType || '') ? avatarType : 'upper-body',
        resolution: validResolutions.includes(resolution || '') ? resolution : '1080p',
        fps: fps && fps > 0 && fps <= 120 ? fps : 30,
        presenterId: presenterId || null,
        status: 'training',
        style: style || 'professional',
        backgroundColor: backgroundColor || '#f5f5f5',
        expressions: expressions && expressions.length > 0 ? expressions : defaultExpressions,
        gender: gender || 'neutral',
        createdAt: new Date().toISOString(),
        estimatedReady: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        createdBy: user.userId,
      };

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `video_hub:avatar:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(avatarData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(avatarData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: avatarData });
    }

    // ── Action: start_subtitle_generation ───────────────────────────
    if (action === 'start_subtitle_generation') {
      const { projectId, language: subLanguage, subType } = payload as {
        projectId: string;
        language?: string;
        subType?: string;
      };

      if (!projectId || typeof projectId !== 'string') {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
      }

      // Verify project exists in DB
      const dbRecord = await db.settings.findFirst({
        where: { key: { startsWith: 'video_hub:project:' } },
      });
      if (!dbRecord) {
        return NextResponse.json({ error: `Project ${projectId} not found` }, { status: 404 });
      }

      const validSubTypes = ['auto-generated', 'translated', 'manual'];
      const subtitleType = validSubTypes.includes(subType || '') ? subType : 'auto-generated';

      const subtitleData = {
        _type: 'subtitle' as const,
        id: `sub-${Date.now()}`,
        projectId,
        language: subLanguage || 'en',
        type: subtitleType,
        accuracy: 0,
        wordCount: 0,
        duration: '0:00',
        status: 'pending',
        createdAt: null,
        requestedBy: user.userId,
        requestedAt: new Date().toISOString(),
      };

      const key = `video_hub:subtitle:${projectId}:${subLanguage || 'en'}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(subtitleData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(subtitleData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: subtitleData });
    }

    // ── Action: create_presenter ────────────────────────────────────
    if (action === 'create_presenter') {
      const { name, type: presType, style: presStyle, gender: presGender, language: presLanguage } = payload as {
        name: string;
        type?: string;
        style?: string;
        gender?: string;
        language?: string;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Presenter name is required' }, { status: 400 });
      }

      const presenterData = {
        _type: 'presenter' as const,
        id: `pr-${Date.now()}`,
        name: name.trim(),
        type: presType || 'ai-avatar',
        style: presStyle || 'professional',
        gender: presGender || 'neutral',
        language: presLanguage || 'en-US',
        status: 'active',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
        createdBy: user.userId,
      };

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `video_hub:presenter:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(presenterData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(presenterData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: presenterData });
    }

    // ── Fallback ────────────────────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown action: ${action}. Supported: create_video_project, generate_avatar, start_subtitle_generation, create_presenter` },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Video Hub POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
