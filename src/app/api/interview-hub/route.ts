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

function filterByScoreRange(
  items: Record<string, unknown>[],
  field: string,
  min?: number | null,
  max?: number | null,
): Record<string, unknown>[] {
  return items.filter((item) => {
    const v = item[field];
    if (typeof v !== 'number') return false;
    if (min !== null && min !== undefined && v < min) return false;
    if (max !== null && max !== undefined && v > max) return false;
    return true;
  });
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
    const difficulty = searchParams.get('difficulty');
    const candidate = searchParams.get('candidate');
    const category = searchParams.get('category');
    const minScore = searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) : null;
    const maxScore = searchParams.get('maxScore') ? parseFloat(searchParams.get('maxScore')!) : null;
    const search = searchParams.get('search');

    const allRecords = await loadRecords('interview_hub:');

    const sessions = allRecords.filter((r) => r._type === 'session');
    const feedback = allRecords.filter((r) => r._type === 'feedback');
    const practice = allRecords.filter((r) => r._type === 'practice');
    const interviewTypes = allRecords.filter((r) => r._type === 'interview_type');
    const scoringCriteria = allRecords.filter((r) => r._type === 'scoring_criteria');

    // Filter interview types
    let filteredTypes = interviewTypes;
    if (difficulty) filteredTypes = filterByField(filteredTypes, 'difficulty', difficulty);
    if (category) {
      filteredTypes = filteredTypes.filter((t) => {
        const cats = t.categories;
        return Array.isArray(cats) && cats.includes(category);
      });
    }
    filteredTypes = filterBySearch(filteredTypes, search, ['name', 'description']);

    // Filter sessions
    let filteredSessions = filterByStatus(sessions, status);
    if (type) filteredSessions = filterByField(filteredSessions, 'type', type);
    if (difficulty) filteredSessions = filterByField(filteredSessions, 'difficulty', difficulty);
    if (candidate) {
      const q = candidate.toLowerCase();
      filteredSessions = filteredSessions.filter(
        (s) => typeof s.candidate === 'string' && s.candidate.toLowerCase().includes(q),
      );
    }
    if (minScore !== null || maxScore !== null) {
      filteredSessions = filterByScoreRange(filteredSessions, 'score', minScore, maxScore);
    }
    filteredSessions = filterBySearch(filteredSessions, search, ['candidate', 'interviewType']);

    // Filter scoring criteria
    let filteredCriteria = scoringCriteria;
    if (category) {
      filteredCriteria = filteredCriteria.filter((c) => {
        const cats = c.categories;
        return Array.isArray(cats) && cats.includes(category);
      });
    }

    // Filter feedback
    let filteredFeedback = feedback;
    filteredFeedback = filterBySearch(filteredFeedback, search, ['candidate', 'summary']);
    if (minScore !== null || maxScore !== null) {
      filteredFeedback = filterByScoreRange(filteredFeedback, 'overallScore', minScore, maxScore);
    }

    // Filter practice
    let filteredPractice = practice;
    if (type) filteredPractice = filterByField(filteredPractice, 'type', type);
    filteredPractice = filterBySearch(filteredPractice, search, ['type']);

    // Compute stats from real data only
    const completedSessions = sessions.filter((s) => s.status === 'completed');
    const scores = completedSessions
      .filter((s) => typeof s.score === 'number')
      .map((s) => s.score as number);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    const stats = {
      totalInterviews: sessions.length,
      completedInterviews: completedSessions.length,
      inProgressInterviews: sessions.filter((s) => s.status === 'in-progress').length,
      scheduledInterviews: sessions.filter((s) => s.status === 'scheduled').length,
      avgScore,
      passRate: 0,
      avgDuration: '0 min',
      mostPopularType: '',
      topScorer: '',
      topScore: scores.length > 0 ? Math.max(...scores) : 0,
      practiceSessionsThisMonth: practice.length,
      practiceAvgImprovement: 0,
    };

    const data = {
      interviewTypes: paginate(filteredTypes, page, limit),
      sessions: paginate(filteredSessions, page, limit),
      scoringCriteria: paginate(filteredCriteria, page, limit),
      feedbackReports: paginate(filteredFeedback, page, limit),
      practiceHistory: paginate(filteredPractice, page, limit),
      stats,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Interview Hub GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, ...payload } = body as { action: string; [key: string]: unknown };

    // ── Action: create_session ──────────────────────────────────────
    if (action === 'create_session') {
      const { candidate, typeId, interviewType, scheduledDate, difficulty: sessDifficulty, note } = payload as {
        candidate?: string;
        typeId?: string;
        interviewType?: string;
        scheduledDate?: string;
        difficulty?: string;
        note?: string;
      };

      if (!typeId && !interviewType) {
        return NextResponse.json({ error: 'Either typeId or interviewType is required' }, { status: 400 });
      }

      // Look up the interview type from DB for metadata
      let matchedDifficulty = 'intermediate';
      let matchedName = interviewType || 'Custom Interview';
      const matchedTypeId = typeId || 'custom';

      if (typeId || interviewType) {
        const dbTypes = await db.settings.findMany({
          where: { key: { startsWith: 'interview_hub:type:' } },
        });
        for (const rec of dbTypes) {
          try {
            const parsed = JSON.parse(rec.value);
            if ((typeId && parsed.id === typeId) || (interviewType && parsed.name === interviewType)) {
              matchedDifficulty = parsed.difficulty || 'intermediate';
              matchedName = parsed.name || interviewType || 'Custom Interview';
              break;
            }
          } catch {
            // skip
          }
        }
      }

      const validDifficulties = ['beginner', 'intermediate', 'advanced', 'expert', 'adaptive'];
      const sessionDifficulty = validDifficulties.includes(sessDifficulty || '')
        ? sessDifficulty
        : matchedDifficulty;

      const sessionData = {
        _type: 'session' as const,
        id: `is-${Date.now()}`,
        candidate: candidate || user.name,
        interviewType: matchedName,
        type: matchedTypeId,
        status: 'scheduled',
        score: null,
        duration: null,
        date: scheduledDate || new Date().toISOString().split('T')[0],
        interviewer: 'AI Proctor',
        difficulty: sessionDifficulty,
        questionsAttempted: 0,
        questionsCorrect: null,
        strengths: null,
        weaknesses: null,
        note: note || '',
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const key = `interview_hub:session:${sessionData.id}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(sessionData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(sessionData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: sessionData });
    }

    // ── Action: submit_feedback ─────────────────────────────────────
    if (action === 'submit_feedback') {
      const { sessionId, overallScore, recommendation, summary, strengths, improvements } = payload as {
        sessionId: string;
        overallScore?: number;
        recommendation?: string;
        summary?: string;
        strengths?: string[];
        improvements?: string[];
      };

      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
      }

      // Verify session exists in DB
      const dbSession = await db.settings.findUnique({
        where: { key: `interview_hub:session:${sessionId}` },
      });
      if (!dbSession) {
        return NextResponse.json({ error: `Session ${sessionId} not found` }, { status: 404 });
      }

      let candidateName = 'Unknown Candidate';
      try {
        const sessionData = JSON.parse(dbSession.value);
        candidateName = sessionData.candidate || 'Unknown Candidate';
      } catch {
        // keep default
      }

      const validRecommendations = ['strong-hire', 'hire', 'no-hire', 'maybe'];
      const validatedRec = validRecommendations.includes(recommendation || '')
        ? recommendation
        : 'maybe';

      if (overallScore !== undefined && (overallScore < 0 || overallScore > 100)) {
        return NextResponse.json({ error: 'overallScore must be between 0 and 100' }, { status: 400 });
      }

      const feedbackData = {
        _type: 'feedback' as const,
        id: `fb-${Date.now()}`,
        sessionId,
        candidate: candidateName,
        overallScore: overallScore ?? null,
        recommendation: validatedRec,
        summary: summary || '',
        strengths: strengths || [],
        improvements: improvements || [],
        createdAt: new Date().toISOString(),
        createdBy: user.userId,
      };

      const key = `interview_hub:feedback:${sessionId}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(feedbackData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(feedbackData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: feedbackData });
    }

    // ── Action: start_practice_session ──────────────────────────────
    if (action === 'start_practice_session') {
      const { interviewType, difficulty: pracDifficulty, questionCount } = payload as {
        interviewType?: string;
        difficulty?: string;
        questionCount?: number;
      };

      // Look up the interview type from DB for metadata
      let matchedDifficulty = 'intermediate';
      let matchedName = interviewType || 'Technical Interview';
      let matchedQuestions = 10;

      if (interviewType) {
        const dbTypes = await db.settings.findMany({
          where: { key: { startsWith: 'interview_hub:type:' } },
        });
        for (const rec of dbTypes) {
          try {
            const parsed = JSON.parse(rec.value);
            if (parsed.id === interviewType || parsed.name === interviewType) {
              matchedDifficulty = parsed.difficulty || 'intermediate';
              matchedName = parsed.name || interviewType;
              matchedQuestions = parsed.questions || 10;
              break;
            }
          } catch {
            // skip
          }
        }
      }

      const validDifficulties = ['beginner', 'intermediate', 'advanced', 'expert', 'adaptive'];
      const practiceDifficulty = validDifficulties.includes(pracDifficulty || '')
        ? pracDifficulty
        : matchedDifficulty;

      const practiceData = {
        _type: 'practice' as const,
        id: `ph-${Date.now()}`,
        userId: user.userId,
        date: new Date().toISOString().split('T')[0],
        type: matchedName,
        score: 0,
        duration: '0:00',
        questionsAttempted: 0,
        questionsCorrect: 0,
        improvement: 'In progress',
        status: 'in-progress',
        difficulty: practiceDifficulty,
        questionCount: questionCount || matchedQuestions,
        startedAt: new Date().toISOString(),
        createdBy: user.userId,
      };

      const key = `interview_hub:practice:${practiceData.id}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(practiceData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(practiceData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: practiceData });
    }

    // ── Fallback ────────────────────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown action: ${action}. Supported: create_session, submit_feedback, start_practice_session` },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Interview Hub POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
