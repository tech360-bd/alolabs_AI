import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// ── Multi-language labels ────────────────────────────────────────────
const LABELS: Record<string, Record<string, string>> = {
  en: {
    tutors: 'Tutors',
    courses: 'Courses',
    classrooms: 'Classrooms',
    assignments: 'Assignments',
    exams: 'Exams',
    speakingSessions: 'Speaking Sessions',
    stats: 'Statistics',
  },
  bn: {
    tutors: 'শিক্ষকমণ্ডলী',
    courses: 'কোর্সসমূহ',
    classrooms: 'শ্রেণিকক্ষ',
    assignments: 'এসাইনমেন্ট',
    exams: 'পরীক্ষা',
    speakingSessions: 'কথা বলার সেশন',
    stats: 'পরিসংখ্যান',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function getLabels(lang: string) {
  return LABELS[lang] || LABELS.en;
}

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
    const lang = searchParams.get('lang') || 'en';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const level = searchParams.get('level');
    const type = searchParams.get('type');
    const courseId = searchParams.get('courseId');
    const search = searchParams.get('search');
    const labels = getLabels(lang);

    const allRecords = await loadRecords('education_hub:');

    const tutors = allRecords.filter((r) => r._type === 'tutor');
    const courses = allRecords.filter((r) => r._type === 'course');
    const classrooms = allRecords.filter((r) => r._type === 'classroom');
    const assignments = allRecords.filter((r) => r._type === 'assignment');
    const exams = allRecords.filter((r) => r._type === 'exam');
    const speakingSessions = allRecords.filter((r) => r._type === 'speaking_session');

    // Filter tutors
    let filteredTutors = tutors;
    if (status) filteredTutors = filterByField(filteredTutors, 'availability', status);
    filteredTutors = filterBySearch(filteredTutors, search, ['name', 'subjects']);

    // Filter courses
    let filteredCourses = filterByStatus(courses, status);
    if (category) filteredCourses = filterByField(filteredCourses, 'category', category);
    if (level) filteredCourses = filterByField(filteredCourses, 'level', level);
    filteredCourses = filterBySearch(filteredCourses, search, ['title', 'instructor']);

    // Filter classrooms
    let filteredClassrooms = filterByStatus(classrooms, status);

    // Filter assignments
    let filteredAssignments = filterByStatus(assignments, status);
    if (type) filteredAssignments = filterByField(filteredAssignments, 'type', type);
    if (courseId) filteredAssignments = filterByField(filteredAssignments, 'courseId', courseId);
    filteredAssignments = filterBySearch(filteredAssignments, search, ['title']);

    // Filter exams
    let filteredExams = filterByStatus(exams, status);
    if (type) filteredExams = filterByField(filteredExams, 'type', type);
    if (courseId) filteredExams = filterByField(filteredExams, 'courseId', courseId);
    filteredExams = filterBySearch(filteredExams, search, ['title']);

    // Filter speaking sessions
    let filteredSpeaking = speakingSessions;
    filteredSpeaking = filterBySearch(filteredSpeaking, search, ['student', 'topic']);

    // Compute stats from real data only
    const activeCourses = courses.filter((c) => c.status === 'active').length;
    const completedCourses = courses.filter((c) => c.status === 'completed').length;
    const tutorRatings = tutors.filter((t) => typeof t.rating === 'number').map((t) => t.rating as number);
    const avgTutorRating = tutorRatings.length > 0
      ? Math.round((tutorRatings.reduce((a, b) => a + b, 0) / tutorRatings.length) * 100) / 100
      : 0;
    const activeClassrooms = classrooms.filter((c) => c.status === 'active').length;
    const assignmentScores = assignments.filter((a) => typeof a.avgScore === 'number').map((a) => a.avgScore as number);
    const avgAssignmentScore = assignmentScores.length > 0
      ? Math.round((assignmentScores.reduce((a, b) => a + b, 0) / assignmentScores.length) * 10) / 10
      : 0;
    const examPassRates = exams.filter((e) => typeof e.passRate === 'number').map((e) => e.passRate as number);
    const examPassRate = examPassRates.length > 0
      ? Math.round((examPassRates.reduce((a, b) => a + b, 0) / examPassRates.length) * 10) / 10
      : 0;
    const speakingScores = speakingSessions.filter((s) => typeof s.score === 'number').map((s) => s.score as number);
    const speakingAvgScore = speakingScores.length > 0
      ? Math.round((speakingScores.reduce((a, b) => a + b, 0) / speakingScores.length) * 100) / 100
      : 0;

    const stats = {
      totalStudents: 0,
      activeCourses,
      completedCourses,
      totalTutors: tutors.length,
      avgTutorRating,
      totalSessionsThisMonth: 0,
      avgAssignmentScore,
      examPassRate,
      speakingAvgScore,
      activeClassrooms,
    };

    const data = {
      _labels: labels,
      tutors: paginate(filteredTutors, page, limit),
      courses: paginate(filteredCourses, page, limit),
      classrooms: paginate(filteredClassrooms, page, limit),
      assignments: paginate(filteredAssignments, page, limit),
      exams: paginate(filteredExams, page, limit),
      speakingSessions: paginate(filteredSpeaking, page, limit),
      stats,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Education Hub GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, ...payload } = body as { action: string; [key: string]: unknown };

    // ── Action: create_course ───────────────────────────────────────
    if (action === 'create_course') {
      const { title, description, instructor, category, level, duration, maxEnrollment, prerequisites, modules } = payload as {
        title: string;
        description?: string;
        instructor?: string;
        category?: string;
        level?: string;
        duration?: string;
        maxEnrollment?: number;
        prerequisites?: string[];
        modules?: number;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Course title is required' }, { status: 400 });
      }

      const validLevels = ['beginner', 'intermediate', 'advanced', 'all-levels'];
      const courseLevel = validLevels.includes(level || '') ? level : 'intermediate';

      const courseData = {
        _type: 'course' as const,
        id: `c-${Date.now()}`,
        title: title.trim(),
        description: description || '',
        instructor: instructor || user.name,
        category: category || 'General',
        level: courseLevel,
        duration: duration || '8 weeks',
        enrolled: 0,
        maxEnrollment: maxEnrollment || 100,
        progress: 0,
        status: 'draft',
        modules: modules || 10,
        completedModules: 0,
        rating: 0,
        lastUpdated: new Date().toISOString(),
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        prerequisites: prerequisites || [],
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `education_hub:course:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(courseData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(courseData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: courseData });
    }

    // ── Action: create_assignment ───────────────────────────────────
    if (action === 'create_assignment') {
      const { title, courseId, courseName, dueDate, type, description, maxScore } = payload as {
        title: string;
        courseId?: string;
        courseName?: string;
        dueDate?: string;
        type?: string;
        description?: string;
        maxScore?: number;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Assignment title is required' }, { status: 400 });
      }

      const validTypes = ['coding', 'problem-set', 'essay', 'lab', 'project', 'quiz'];
      const assignmentType = validTypes.includes(type || '') ? type : 'essay';

      const assignmentData = {
        _type: 'assignment' as const,
        id: `a-${Date.now()}`,
        title: title.trim(),
        courseId: courseId || null,
        courseName: courseName || 'General',
        dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        submitted: 0,
        total: 0,
        avgScore: 0,
        status: 'open',
        type: assignmentType,
        description: description || '',
        maxScore: maxScore || 100,
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `education_hub:assignment:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(assignmentData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(assignmentData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: assignmentData });
    }

    // ── Action: create_exam ─────────────────────────────────────────
    if (action === 'create_exam') {
      const { title, courseId, courseName, date, duration, totalMarks, type, sections } = payload as {
        title: string;
        courseId?: string;
        courseName?: string;
        date?: string;
        duration?: number;
        totalMarks?: number;
        type?: string;
        sections?: string[];
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Exam title is required' }, { status: 400 });
      }

      const validExamTypes = ['proctored', 'auto-graded', 'standardized', 'open-book', 'take-home'];
      const examType = validExamTypes.includes(type || '') ? type : 'auto-graded';

      const examData = {
        _type: 'exam' as const,
        id: `e-${Date.now()}`,
        title: title.trim(),
        courseId: courseId || null,
        courseName: courseName || 'General',
        date: date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        duration: duration || 60,
        totalMarks: totalMarks || 100,
        status: 'upcoming',
        type: examType,
        registered: 0,
        passRate: null,
        avgScore: null,
        sections: sections || [],
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `education_hub:exam:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(examData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(examData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: examData });
    }

    // ── Action: start_speaking_session ──────────────────────────────
    if (action === 'start_speaking_session') {
      const { student, tutor, topic, duration, language } = payload as {
        student?: string;
        tutor?: string;
        topic?: string;
        duration?: number;
        language?: string;
      };

      if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
        return NextResponse.json({ error: 'Speaking session topic is required' }, { status: 400 });
      }

      const sessionData = {
        _type: 'speaking_session' as const,
        id: `sp-${Date.now()}`,
        student: student || user.name,
        tutor: tutor || 'AI Tutor',
        topic: topic.trim(),
        language: language || 'en',
        date: new Date().toISOString().split('T')[0],
        duration: duration || 30,
        score: 0,
        bandBreakdown: { fluency: 0, vocabulary: 0, grammar: 0, pronunciation: 0 },
        feedback: '',
        recordingUrl: null,
        status: 'in-progress',
        createdBy: user.userId,
        startedAt: new Date().toISOString(),
      };

      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `education_hub:speaking:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(sessionData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(sessionData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: sessionData });
    }

    // ── Fallback ────────────────────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown action: ${action}. Supported: create_course, create_assignment, create_exam, start_speaking_session` },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Education Hub POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
