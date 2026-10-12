import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

const SEO_TASK_TEMPLATES_30 = [
  'Set up Google Search Console and verify domain',
  'Install and configure Google Analytics 4',
  'Create XML sitemap and submit to search engines',
  'Set up robots.txt file',
  'Audit all existing page titles and meta descriptions',
  'Fix broken internal links (404 errors)',
  'Optimize homepage H1 tag and above-the-fold content',
  'Research top 10 competitor keywords',
  'Create content calendar for the next 30 days',
  'Write first SEO-optimized blog post',
  'Optimize all images (alt text, compression)',
  'Implement schema markup for key pages',
  'Set up Google Business Profile',
  'Create social media profiles and link back to site',
  'Write second SEO-optimized blog post',
  'Audit page load speed and Core Web Vitals',
  'Fix mobile usability issues',
  'Implement canonical tags on all pages',
  'Create pillar page for primary keyword',
  'Write third SEO-optimized blog post',
  'Build 5 quality backlinks through outreach',
  'Optimize URL structure across the site',
  'Set up email newsletter for content distribution',
  'Write fourth SEO-optimized blog post',
  'Analyze search console data and adjust strategy',
  'Create FAQ page targeting long-tail keywords',
  'Write fifth SEO-optimized blog post',
  'Audit internal linking structure',
  'Review and update old content',
  'Compile 30-day progress report',
];

function generateTasks(durationDays: number): Array<{ text: string; completed: boolean; completedAt: string | null }> {
  const taskCount = Math.min(durationDays, SEO_TASK_TEMPLATES_30.length);
  const tasks: Array<{ text: string; completed: boolean; completedAt: string | null }> = [];

  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      text: SEO_TASK_TEMPLATES_30[i % SEO_TASK_TEMPLATES_30.length],
      completed: false,
      completedAt: null,
    });
  }

  return tasks;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'seo:challenge:' } },
      orderBy: { createdAt: 'desc' },
    });

    let challenges: Array<Record<string, unknown>> = [];

    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value);
        if (status && parsed.status !== status) continue;

        const tasks = parsed.tasks || [];
        const completedTasks = tasks.filter((t: { completed: boolean }) => t.completed).length;
        const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

        const startDay = new Date(parsed.startDate);
        const endDay = new Date(startDay);
        endDay.setDate(endDay.getDate() + parsed.durationDays);
        const now = new Date();
        const daysElapsed = Math.max(0, Math.floor((now.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)));

        challenges.push({
          id: s.id,
          ...parsed,
          progress,
          completedTasks,
          totalTasks: tasks.length,
          daysElapsed,
          endDate: endDay.toISOString(),
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        });
      } catch {
        // skip
      }
    }

    const totalTasks = challenges.reduce((sum, c) => sum + ((c.totalTasks as number) || 0), 0);
    const completedAll = challenges.reduce((sum, c) => sum + ((c.completedTasks as number) || 0), 0);

    const stats = {
      active: challenges.filter((c) => c.status === 'active').length,
      completed: challenges.filter((c) => c.status === 'completed').length,
      paused: challenges.filter((c) => c.status === 'paused').length,
      totalChallenges: challenges.length,
      totalTasks,
      completedTasks: completedAll,
      avgScoreImprovement: 0,
    };

    return NextResponse.json({ challenges, stats });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO Challenges GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { title, targetKeywords, durationDays, websiteUrl } = body as {
      title: string;
      targetKeywords: string[];
      durationDays: number;
      websiteUrl: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!websiteUrl?.trim()) {
      return NextResponse.json({ error: 'Website URL is required' }, { status: 400 });
    }

    const validDurations = [30, 60, 90, 180, 365];
    if (!validDurations.includes(durationDays)) {
      return NextResponse.json({ error: 'Duration must be 30, 60, 90, 180, or 365 days' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const id = `seo:challenge:${Date.now()}`;
    const tasks = generateTasks(durationDays);

    const value = JSON.stringify({
      title: title.trim(),
      targetKeywords: targetKeywords || [],
      durationDays,
      websiteUrl: websiteUrl.trim(),
      startDate: ts,
      status: 'active',
      tasks,
      createdBy: user.name || user.email,
      createdAt: ts,
    });

    const setting = await db.settings.create({
      data: { key: id, value, type: 'json' },
    });

    return NextResponse.json({ success: true, id: setting.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO Challenges POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { id, addTask, markTaskComplete, status, title, targetKeywords } = body as {
      id: string;
      addTask?: string;
      markTaskComplete?: number;
      status?: string;
      title?: string;
      targetKeywords?: string[];
    };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('seo:challenge:')) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    const tasks = parsed.tasks || [];

    if (addTask?.trim()) {
      tasks.push({
        text: addTask.trim(),
        completed: false,
        completedAt: null,
      });
    }

    if (markTaskComplete !== undefined && markTaskComplete >= 0 && markTaskComplete < tasks.length) {
      tasks[markTaskComplete].completed = !tasks[markTaskComplete].completed;
      tasks[markTaskComplete].completedAt = tasks[markTaskComplete].completed
        ? new Date().toISOString()
        : null;
    }

    if (status) {
      if (!['active', 'completed', 'paused'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      parsed.status = status;
    }

    if (title !== undefined) parsed.title = title;
    if (targetKeywords !== undefined) parsed.targetKeywords = targetKeywords;
    parsed.tasks = tasks;

    await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(parsed) },
    });

    // Recalculate progress
    const completedCount = tasks.filter((t: { completed: boolean }) => t.completed).length;
    const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    return NextResponse.json({
      id,
      key: existing.key,
      ...parsed,
      progress,
      completedTasks: completedCount,
      totalTasks: tasks.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO Challenges PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}