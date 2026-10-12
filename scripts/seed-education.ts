import { db } from '../src/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TutorRecord {
  _type: 'tutor'
  id: string
  name: string
  subject: string
  level: 'beginner' | 'intermediate' | 'advanced'
  studentCount: number
  rating: number
  avatar?: string
  specialties: string[]
  availability: 'online' | 'offline' | 'busy'
}

interface CourseRecord {
  _type: 'course'
  id: string
  title: string
  subject: string
  level: 'beginner' | 'intermediate' | 'advanced'
  description: string
  modules: string[]
  progress: number
  studentCount: number
  rating: number
  createdAt: string
  // API-side fields
  instructor: string
  category: string
  duration: string
  enrolled: number
  maxEnrollment: number
  completedModules: number
  status: string
  lastUpdated: string
  startDate: string
  endDate: string
  prerequisites: string[]
  createdBy: string
}

interface ClassroomRecord {
  _type: 'classroom'
  id: string
  subject: string
  teacher: string
  studentCount: number
  schedule: string
  duration: string
  status: 'active' | 'scheduled' | 'ended'
  topic: string
}

interface AssignmentRecord {
  _type: 'assignment'
  id: string
  title: string
  subject: string
  dueDate: string
  status: 'open' | 'closed' | 'grading' | 'graded'
  submissionsCount: number
  totalStudents: number
  autoGrading: boolean
  gradingProgress: number
  // API-side fields
  courseId: string | null
  courseName: string
  type: string
  description: string
  maxScore: number
  avgScore: number
  createdBy: string
  createdAt: string
}

interface ExamRecord {
  _type: 'exam'
  id: string
  title: string
  subject: string
  duration: string
  questionCount: number
  passingScore: number
  avgScore: number
  totalTaken: number
  status: 'upcoming' | 'in_progress' | 'completed'
  scheduledDate: string
  // API-side fields
  courseId: string | null
  courseName: string
  totalMarks: number
  type: string
  registered: number
  passRate: number | null
  sections: string[]
  createdBy: string
  createdAt: string
}

interface SpeakingSessionRecord {
  _type: 'speaking_session'
  id: string
  language: string
  topic: string
  level: 'beginner' | 'intermediate' | 'advanced'
  pronunciationScore: number
  fluencyScore: number
  overallScore: number
  duration: string
  date: string
  // API-side fields
  student: string
  tutor: string
  score: number
  bandBreakdown: { fluency: number; vocabulary: number; grammar: number; pronunciation: number }
  feedback: string
  recordingUrl: string | null
  createdBy: string
  startedAt: string
}

// ─── Data ────────────────────────────────────────────────────────────────────

const TUTORS: TutorRecord[] = [
  {
    _type: 'tutor',
    id: 'tutor-001',
    name: 'Dr. Amina Rahman',
    subject: 'Math',
    level: 'advanced',
    studentCount: 142,
    rating: 4.9,
    specialties: ['Calculus', 'Linear Algebra', 'Number Theory'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-002',
    name: 'Prof. James Whitfield',
    subject: 'Physics',
    level: 'advanced',
    studentCount: 98,
    rating: 4.7,
    specialties: ['Quantum Mechanics', 'Thermodynamics', 'Optics'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-003',
    name: 'Dr. Fatima Akter',
    subject: 'Chemistry',
    level: 'intermediate',
    studentCount: 76,
    rating: 4.6,
    specialties: ['Organic Chemistry', 'Biochemistry', 'Lab Techniques'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-004',
    name: 'Dr. Karim Hossain',
    subject: 'Biology',
    level: 'intermediate',
    studentCount: 115,
    rating: 4.8,
    specialties: ['Molecular Biology', 'Genetics', 'Ecology'],
    availability: 'busy',
  },
  {
    _type: 'tutor',
    id: 'tutor-005',
    name: 'Ms. Elena Vasquez',
    subject: 'English',
    level: 'beginner',
    studentCount: 203,
    rating: 4.5,
    specialties: ['IELTS Preparation', 'Academic Writing', 'Grammar'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-006',
    name: 'Dr. Rafiqul Islam',
    subject: 'Bangla',
    level: 'advanced',
    studentCount: 167,
    rating: 4.8,
    specialties: ['Bangla Literature', 'Creative Writing', 'Poetry'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-007',
    name: 'Eng. Tanvir Ahmed',
    subject: 'Computer Science',
    level: 'advanced',
    studentCount: 234,
    rating: 4.9,
    specialties: ['Algorithms', 'Machine Learning', 'Systems Design'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-008',
    name: 'Dr. Nadia Chowdhury',
    subject: 'History',
    level: 'intermediate',
    studentCount: 89,
    rating: 4.4,
    specialties: ['South Asian History', 'World War II', 'Ancient Civilizations'],
    availability: 'offline',
  },
  {
    _type: 'tutor',
    id: 'tutor-009',
    name: 'Mr. Omar Al-Farsi',
    subject: 'Arabic',
    level: 'beginner',
    studentCount: 54,
    rating: 4.3,
    specialties: ['Modern Standard Arabic', 'Quranic Arabic', 'Conversation'],
    availability: 'online',
  },
  {
    _type: 'tutor',
    id: 'tutor-010',
    name: 'Dr. Sarah Mitchell',
    subject: 'English',
    level: 'advanced',
    studentCount: 178,
    rating: 4.7,
    specialties: ['SAT Verbal', 'Literature Analysis', 'Phonetics'],
    availability: 'busy',
  },
]

const COURSES: CourseRecord[] = [
  {
    _type: 'course',
    id: 'course-001',
    title: 'Advanced Calculus & Real Analysis',
    subject: 'Math',
    level: 'advanced',
    description: 'Rigorous treatment of limits, continuity, differentiation, and Riemann integration in R^n. Covers sequences, series, and metric spaces.',
    modules: ['Limits & Continuity', 'Differentiation', 'Riemann Integration', 'Sequences & Series', 'Metric Spaces', 'Multivariable Calculus', 'Implicit Function Theorem', 'Fourier Series', 'Lebesgue Measure Intro', 'Final Review'],
    progress: 65,
    studentCount: 87,
    rating: 4.8,
    createdAt: '2025-01-15T09:00:00.000Z',
    instructor: 'Dr. Amina Rahman',
    category: 'Mathematics',
    duration: '12 weeks',
    enrolled: 87,
    maxEnrollment: 120,
    completedModules: 7,
    status: 'active',
    lastUpdated: '2025-07-20T14:30:00.000Z',
    startDate: '2025-01-15',
    endDate: '2025-04-10',
    prerequisites: ['Linear Algebra', 'Calculus II'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-002',
    title: 'Introduction to Quantum Mechanics',
    subject: 'Physics',
    level: 'intermediate',
    description: 'Foundational course covering wave-particle duality, Schrodinger equation, quantum states, operators, and basic applications in atomic physics.',
    modules: ['Historical Background', 'Wave Functions', 'Schrodinger Equation', 'Quantum Operators', 'Hydrogen Atom', 'Angular Momentum', 'Spin', 'Perturbation Theory', 'Identical Particles', 'Applications'],
    progress: 40,
    studentCount: 64,
    rating: 4.6,
    createdAt: '2025-02-10T10:00:00.000Z',
    instructor: 'Prof. James Whitfield',
    category: 'Physics',
    duration: '10 weeks',
    enrolled: 64,
    maxEnrollment: 80,
    completedModules: 4,
    status: 'active',
    lastUpdated: '2025-07-18T11:00:00.000Z',
    startDate: '2025-02-10',
    endDate: '2025-04-20',
    prerequisites: ['Classical Mechanics', 'Linear Algebra'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-003',
    title: 'Data Structures & Algorithms',
    subject: 'Computer Science',
    level: 'intermediate',
    description: 'Comprehensive study of fundamental data structures (arrays, trees, graphs, hash tables) and algorithm design techniques (divide-and-conquer, dynamic programming, greedy).',
    modules: ['Arrays & Strings', 'Linked Lists', 'Stacks & Queues', 'Trees & BST', 'Heaps & Priority Queues', 'Hash Tables', 'Graphs & Traversals', 'Dynamic Programming', 'Greedy Algorithms', 'Advanced Topics'],
    progress: 100,
    studentCount: 156,
    rating: 4.9,
    createdAt: '2024-09-01T08:00:00.000Z',
    instructor: 'Eng. Tanvir Ahmed',
    category: 'Computer Science',
    duration: '14 weeks',
    enrolled: 156,
    maxEnrollment: 200,
    completedModules: 10,
    status: 'completed',
    lastUpdated: '2025-06-30T16:00:00.000Z',
    startDate: '2024-09-01',
    endDate: '2024-12-15',
    prerequisites: ['Programming Fundamentals'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-004',
    title: 'IELTS Academic Preparation',
    subject: 'English',
    level: 'beginner',
    description: 'Structured preparation for IELTS Academic test covering all four modules: Listening, Reading, Writing, and Speaking. Includes practice tests and strategies.',
    modules: ['IELTS Overview & Strategies', 'Listening Module', 'Reading Module - Academic', 'Writing Task 1', 'Writing Task 2', 'Speaking Part 1', 'Speaking Part 2', 'Speaking Part 3', 'Full Practice Tests', 'Final Review & Tips'],
    progress: 75,
    studentCount: 210,
    rating: 4.5,
    createdAt: '2025-03-01T07:00:00.000Z',
    instructor: 'Ms. Elena Vasquez',
    category: 'Language',
    duration: '8 weeks',
    enrolled: 210,
    maxEnrollment: 300,
    completedModules: 8,
    status: 'active',
    lastUpdated: '2025-07-19T09:30:00.000Z',
    startDate: '2025-03-01',
    endDate: '2025-04-25',
    prerequisites: [],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-005',
    title: 'Organic Chemistry Fundamentals',
    subject: 'Chemistry',
    level: 'intermediate',
    description: 'Study of organic molecules, functional groups, reaction mechanisms, stereochemistry, and spectroscopy techniques.',
    modules: ['Bonding & Structure', 'Alkanes & Cycloalkanes', 'Stereochemistry', 'Substitution Reactions', 'Elimination Reactions', 'Alkenes & Alkynes', 'Aromatic Compounds', 'Alcohols & Ethers', 'Carbonyl Compounds', 'Spectroscopy'],
    progress: 30,
    studentCount: 52,
    rating: 4.6,
    createdAt: '2025-06-01T10:00:00.000Z',
    instructor: 'Dr. Fatima Akter',
    category: 'Chemistry',
    duration: '12 weeks',
    enrolled: 52,
    maxEnrollment: 80,
    completedModules: 3,
    status: 'active',
    lastUpdated: '2025-07-21T08:00:00.000Z',
    startDate: '2025-06-01',
    endDate: '2025-08-20',
    prerequisites: ['General Chemistry'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-006',
    title: 'Molecular Biology & Genetics',
    subject: 'Biology',
    level: 'advanced',
    description: 'In-depth study of DNA replication, transcription, translation, gene regulation, and modern genetic engineering techniques.',
    modules: ['DNA Structure & Replication', 'Transcription', 'Translation', 'Gene Regulation', 'Mutations & Repair', 'Recombinant DNA', 'Genomics', 'Epigenetics', 'Gene Therapy', 'Lab Techniques'],
    progress: 50,
    studentCount: 71,
    rating: 4.7,
    createdAt: '2025-04-15T09:00:00.000Z',
    instructor: 'Dr. Karim Hossain',
    category: 'Biology',
    duration: '11 weeks',
    enrolled: 71,
    maxEnrollment: 90,
    completedModules: 5,
    status: 'active',
    lastUpdated: '2025-07-20T10:00:00.000Z',
    startDate: '2025-04-15',
    endDate: '2025-06-30',
    prerequisites: ['Cell Biology', 'Biochemistry'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-007',
    title: 'Bangla Literature: Modern Era',
    subject: 'Bangla',
    level: 'advanced',
    description: 'Survey of Bangla literature from the mid-19th century to present, covering the Bengal Renaissance, Tagore, Nazrul, and contemporary writers.',
    modules: ['Bengal Renaissance', 'Bankim Chandra', 'Rabindranath Tagore - Poetry', 'Tagore - Novels & Stories', 'Kazi Nazrul Islam', 'Post-Partition Literature', 'Modern Poetry', 'Contemporary Fiction', 'Drama & Theatre', 'Literary Criticism'],
    progress: 100,
    studentCount: 93,
    rating: 4.8,
    createdAt: '2024-10-01T08:00:00.000Z',
    instructor: 'Dr. Rafiqul Islam',
    category: 'Literature',
    duration: '10 weeks',
    enrolled: 93,
    maxEnrollment: 100,
    completedModules: 10,
    status: 'completed',
    lastUpdated: '2025-06-15T12:00:00.000Z',
    startDate: '2024-10-01',
    endDate: '2024-12-10',
    prerequisites: ['Bangla Language Proficiency'],
    createdBy: 'system',
  },
  {
    _type: 'course',
    id: 'course-008',
    title: 'World History: Ancient to Modern',
    subject: 'History',
    level: 'beginner',
    description: 'Broad survey of world civilizations from Mesopotamia to the modern era, focusing on major turning points and their lasting impacts.',
    modules: ['Mesopotamia & Egypt', 'Ancient Greece', 'Roman Empire', 'Islamic Golden Age', 'Medieval Europe', 'Renaissance', 'Age of Exploration', 'Industrial Revolution', 'World Wars', 'Post-War World'],
    progress: 60,
    studentCount: 45,
    rating: 4.3,
    createdAt: '2025-05-01T11:00:00.000Z',
    instructor: 'Dr. Nadia Chowdhury',
    category: 'History',
    duration: '10 weeks',
    enrolled: 45,
    maxEnrollment: 60,
    completedModules: 6,
    status: 'active',
    lastUpdated: '2025-07-18T15:00:00.000Z',
    startDate: '2025-05-01',
    endDate: '2025-07-10',
    prerequisites: [],
    createdBy: 'system',
  },
]

const CLASSROOMS: ClassroomRecord[] = [
  {
    _type: 'classroom',
    id: 'classroom-001',
    subject: 'Math',
    teacher: 'Dr. Amina Rahman',
    studentCount: 35,
    schedule: 'Sat, Mon, Wed - 10:00 AM',
    duration: '90 minutes',
    status: 'active',
    topic: 'Riemann Integration Techniques',
  },
  {
    _type: 'classroom',
    id: 'classroom-002',
    subject: 'Physics',
    teacher: 'Prof. James Whitfield',
    studentCount: 28,
    schedule: 'Sun, Tue, Thu - 2:00 PM',
    duration: '75 minutes',
    status: 'active',
    topic: 'Quantum Operators & Observables',
  },
  {
    _type: 'classroom',
    id: 'classroom-003',
    subject: 'Computer Science',
    teacher: 'Eng. Tanvir Ahmed',
    studentCount: 42,
    schedule: 'Sat, Tue - 4:00 PM',
    duration: '120 minutes',
    status: 'active',
    topic: 'Dynamic Programming Workshop',
  },
  {
    _type: 'classroom',
    id: 'classroom-004',
    subject: 'English',
    teacher: 'Ms. Elena Vasquez',
    studentCount: 25,
    schedule: 'Mon, Wed, Fri - 11:00 AM',
    duration: '60 minutes',
    status: 'active',
    topic: 'IELTS Writing Task 2 Masterclass',
  },
  {
    _type: 'classroom',
    id: 'classroom-005',
    subject: 'Chemistry',
    teacher: 'Dr. Fatima Akter',
    studentCount: 30,
    schedule: 'Tue, Thu - 10:00 AM',
    duration: '90 minutes',
    status: 'scheduled',
    topic: 'Stereochemistry & Chirality',
  },
  {
    _type: 'classroom',
    id: 'classroom-006',
    subject: 'Biology',
    teacher: 'Dr. Karim Hossain',
    studentCount: 38,
    schedule: 'Sun, Wed - 3:00 PM',
    duration: '90 minutes',
    status: 'active',
    topic: 'CRISPR Gene Editing Lab Demo',
  },
  {
    _type: 'classroom',
    id: 'classroom-007',
    subject: 'Bangla',
    teacher: 'Dr. Rafiqul Islam',
    studentCount: 22,
    schedule: 'Sat - 1:00 PM',
    duration: '60 minutes',
    status: 'ended',
    topic: 'Rabindranath Tagore Poetry Analysis',
  },
  {
    _type: 'classroom',
    id: 'classroom-008',
    subject: 'History',
    teacher: 'Dr. Nadia Chowdhury',
    studentCount: 20,
    schedule: 'Mon, Thu - 9:00 AM',
    duration: '75 minutes',
    status: 'scheduled',
    topic: 'The Industrial Revolution',
  },
  {
    _type: 'classroom',
    id: 'classroom-009',
    subject: 'Arabic',
    teacher: 'Mr. Omar Al-Farsi',
    studentCount: 15,
    schedule: 'Fri - 10:00 AM',
    duration: '60 minutes',
    status: 'active',
    topic: 'Arabic Conversation Practice',
  },
  {
    _type: 'classroom',
    id: 'classroom-010',
    subject: 'Math',
    teacher: 'Dr. Amina Rahman',
    studentCount: 40,
    schedule: 'Fri - 2:00 PM',
    duration: '120 minutes',
    status: 'scheduled',
    topic: 'Linear Algebra: Eigenvalues & Eigenvectors',
  },
]

const ASSIGNMENTS: AssignmentRecord[] = [
  {
    _type: 'assignment',
    id: 'assign-001',
    title: 'Riemann Integral Problem Set',
    subject: 'Math',
    dueDate: '2025-08-01',
    status: 'open',
    submissionsCount: 45,
    totalStudents: 87,
    autoGrading: true,
    gradingProgress: 0,
    courseId: 'course-001',
    courseName: 'Advanced Calculus & Real Analysis',
    type: 'problem-set',
    description: 'Solve 20 problems on Riemann integration including upper/lower sums, integrability criteria, and fundamental theorem applications.',
    maxScore: 100,
    avgScore: 0,
    createdBy: 'system',
    createdAt: '2025-07-15T09:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-002',
    title: 'Schrodinger Equation Solutions',
    subject: 'Physics',
    dueDate: '2025-07-28',
    status: 'grading',
    submissionsCount: 60,
    totalStudents: 64,
    autoGrading: false,
    gradingProgress: 75,
    courseId: 'course-002',
    courseName: 'Introduction to Quantum Mechanics',
    type: 'problem-set',
    description: 'Solve the time-independent Schrodinger equation for various potentials: infinite well, finite well, harmonic oscillator.',
    maxScore: 100,
    avgScore: 72.5,
    createdBy: 'system',
    createdAt: '2025-07-10T10:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-003',
    title: 'Binary Tree Implementation',
    subject: 'Computer Science',
    dueDate: '2025-06-15',
    status: 'graded',
    submissionsCount: 150,
    totalStudents: 156,
    autoGrading: true,
    gradingProgress: 100,
    courseId: 'course-003',
    courseName: 'Data Structures & Algorithms',
    type: 'coding',
    description: 'Implement AVL tree with insert, delete, search, and traversal operations. Include rotation logic and height balancing.',
    maxScore: 100,
    avgScore: 78.3,
    createdBy: 'system',
    createdAt: '2025-06-01T08:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-004',
    title: 'IELTS Task 2 Essay: Technology & Society',
    subject: 'English',
    dueDate: '2025-08-05',
    status: 'open',
    submissionsCount: 128,
    totalStudents: 210,
    autoGrading: false,
    gradingProgress: 0,
    courseId: 'course-004',
    courseName: 'IELTS Academic Preparation',
    type: 'essay',
    description: 'Write a 250+ word essay discussing the impact of artificial intelligence on employment. Use Band 7+ vocabulary and complex sentence structures.',
    maxScore: 9,
    avgScore: 0,
    createdBy: 'system',
    createdAt: '2025-07-18T07:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-005',
    title: 'Organic Reaction Mechanisms Lab Report',
    subject: 'Chemistry',
    dueDate: '2025-07-25',
    status: 'grading',
    submissionsCount: 48,
    totalStudents: 52,
    autoGrading: false,
    gradingProgress: 40,
    courseId: 'course-005',
    courseName: 'Organic Chemistry Fundamentals',
    type: 'lab',
    description: 'Document SN1 vs SN2 reaction mechanisms with experimental observations. Include detailed mechanism diagrams.',
    maxScore: 100,
    avgScore: 68.0,
    createdBy: 'system',
    createdAt: '2025-07-08T10:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-006',
    title: 'DNA Extraction & Analysis',
    subject: 'Biology',
    dueDate: '2025-08-10',
    status: 'open',
    submissionsCount: 20,
    totalStudents: 71,
    autoGrading: true,
    gradingProgress: 0,
    courseId: 'course-006',
    courseName: 'Molecular Biology & Genetics',
    type: 'lab',
    description: 'Perform DNA extraction from plant tissue, run gel electrophoresis, and analyze results. Submit lab report with photos.',
    maxScore: 100,
    avgScore: 0,
    createdBy: 'system',
    createdAt: '2025-07-20T09:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-007',
    title: 'Dynamic Programming: Coin Change Problem',
    subject: 'Computer Science',
    dueDate: '2025-06-20',
    status: 'graded',
    submissionsCount: 145,
    totalStudents: 156,
    autoGrading: true,
    gradingProgress: 100,
    courseId: 'course-003',
    courseName: 'Data Structures & Algorithms',
    type: 'coding',
    description: 'Implement optimal solutions for the coin change problem using bottom-up DP, top-down memoization, and analyze time/space complexity.',
    maxScore: 100,
    avgScore: 82.1,
    createdBy: 'system',
    createdAt: '2025-06-10T08:00:00.000Z',
  },
  {
    _type: 'assignment',
    id: 'assign-008',
    title: 'Bangla Short Story Composition',
    subject: 'Bangla',
    dueDate: '2025-05-30',
    status: 'graded',
    submissionsCount: 88,
    totalStudents: 93,
    autoGrading: false,
    gradingProgress: 100,
    courseId: 'course-007',
    courseName: 'Bangla Literature: Modern Era',
    type: 'essay',
    description: 'Compose an original short story (2000+ words) inspired by the literary style of Rabindranath Tagore.',
    maxScore: 100,
    avgScore: 76.4,
    createdBy: 'system',
    createdAt: '2025-05-15T08:00:00.000Z',
  },
]

const EXAMS: ExamRecord[] = [
  {
    _type: 'exam',
    id: 'exam-001',
    title: 'Midterm: Advanced Calculus',
    subject: 'Math',
    duration: '120 minutes',
    questionCount: 8,
    passingScore: 60,
    avgScore: 74.2,
    totalTaken: 85,
    status: 'completed',
    scheduledDate: '2025-03-10',
    courseId: 'course-001',
    courseName: 'Advanced Calculus & Real Analysis',
    totalMarks: 100,
    type: 'proctored',
    registered: 87,
    passRate: 82.4,
    sections: ['Limits & Continuity', 'Differentiation', 'Riemann Integration', 'Proof Writing'],
    createdBy: 'system',
    createdAt: '2025-02-25T09:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-002',
    title: 'Quiz 3: Quantum Operators',
    subject: 'Physics',
    duration: '30 minutes',
    questionCount: 15,
    passingScore: 50,
    avgScore: 68.5,
    totalTaken: 62,
    status: 'completed',
    scheduledDate: '2025-07-10',
    courseId: 'course-002',
    courseName: 'Introduction to Quantum Mechanics',
    totalMarks: 50,
    type: 'auto-graded',
    registered: 64,
    passRate: 88.7,
    sections: ['Hermitian Operators', 'Commutators', 'Uncertainty Principle'],
    createdBy: 'system',
    createdAt: '2025-07-01T10:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-003',
    title: 'Final Exam: Data Structures & Algorithms',
    subject: 'Computer Science',
    duration: '180 minutes',
    questionCount: 12,
    passingScore: 50,
    avgScore: 76.8,
    totalTaken: 153,
    status: 'completed',
    scheduledDate: '2025-06-20',
    courseId: 'course-003',
    courseName: 'Data Structures & Algorithms',
    totalMarks: 150,
    type: 'proctored',
    registered: 156,
    passRate: 91.5,
    sections: ['Arrays & Strings', 'Trees & Graphs', 'Dynamic Programming', 'Greedy Algorithms', 'Complexity Analysis'],
    createdBy: 'system',
    createdAt: '2025-06-10T08:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-004',
    title: 'Mock IELTS: Full Test',
    subject: 'English',
    duration: '170 minutes',
    questionCount: 80,
    passingScore: 60,
    avgScore: 0,
    totalTaken: 0,
    status: 'upcoming',
    scheduledDate: '2025-08-15',
    courseId: 'course-004',
    courseName: 'IELTS Academic Preparation',
    totalMarks: 9,
    type: 'standardized',
    registered: 180,
    passRate: null,
    sections: ['Listening', 'Academic Reading', 'Writing Task 1', 'Writing Task 2', 'Speaking'],
    createdBy: 'system',
    createdAt: '2025-07-20T07:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-005',
    title: 'Midterm: Organic Chemistry',
    subject: 'Chemistry',
    duration: '90 minutes',
    questionCount: 25,
    passingScore: 50,
    avgScore: 0,
    totalTaken: 0,
    status: 'upcoming',
    scheduledDate: '2025-08-05',
    courseId: 'course-005',
    courseName: 'Organic Chemistry Fundamentals',
    totalMarks: 100,
    type: 'proctored',
    registered: 52,
    passRate: null,
    sections: ['Bonding & Structure', 'Stereochemistry', 'SN1/SN2 Mechanisms', 'Alkenes & Alkynes'],
    createdBy: 'system',
    createdAt: '2025-07-21T10:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-006',
    title: 'Quiz 2: Gene Regulation',
    subject: 'Biology',
    duration: '45 minutes',
    questionCount: 20,
    passingScore: 55,
    avgScore: 70.1,
    totalTaken: 69,
    status: 'completed',
    scheduledDate: '2025-07-15',
    courseId: 'course-006',
    courseName: 'Molecular Biology & Genetics',
    totalMarks: 60,
    type: 'auto-graded',
    registered: 71,
    passRate: 85.5,
    sections: ['Transcription Factors', 'Operons', 'Epigenetic Modifications'],
    createdBy: 'system',
    createdAt: '2025-07-08T09:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-007',
    title: 'Final: Bangla Literature',
    subject: 'Bangla',
    duration: '120 minutes',
    questionCount: 10,
    passingScore: 50,
    avgScore: 79.6,
    totalTaken: 91,
    status: 'completed',
    scheduledDate: '2025-06-10',
    courseId: 'course-007',
    courseName: 'Bangla Literature: Modern Era',
    totalMarks: 100,
    type: 'proctored',
    registered: 93,
    passRate: 93.4,
    sections: ['Bengal Renaissance', 'Tagore Works', 'Nazrul Islam', 'Modern Poetry', 'Essay Writing'],
    createdBy: 'system',
    createdAt: '2025-06-01T08:00:00.000Z',
  },
  {
    _type: 'exam',
    id: 'exam-008',
    title: 'Final Exam: World History',
    subject: 'History',
    duration: '90 minutes',
    questionCount: 40,
    passingScore: 50,
    avgScore: 0,
    totalTaken: 0,
    status: 'upcoming',
    scheduledDate: '2025-07-25',
    courseId: 'course-008',
    courseName: 'World History: Ancient to Modern',
    totalMarks: 100,
    type: 'open-book',
    registered: 44,
    passRate: null,
    sections: ['Ancient Civilizations', 'Medieval Period', 'Modern Era', 'Essay Questions'],
    createdBy: 'system',
    createdAt: '2025-07-15T11:00:00.000Z',
  },
]

const SPEAKING_SESSIONS: SpeakingSessionRecord[] = [
  {
    _type: 'speaking_session',
    id: 'speaking-001',
    language: 'English',
    topic: 'Describe your favorite hobby and explain why you enjoy it',
    level: 'intermediate',
    pronunciationScore: 72,
    fluencyScore: 68,
    overallScore: 70,
    duration: '15 minutes',
    date: '2025-07-20',
    student: 'Rahim Uddin',
    tutor: 'AI Tutor',
    score: 70,
    bandBreakdown: { fluency: 68, vocabulary: 73, grammar: 65, pronunciation: 72 },
    feedback: 'Good vocabulary range. Work on reducing pauses and improving grammatical accuracy in complex sentences. Practice using conditional structures.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-20T14:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-002',
    language: 'English',
    topic: 'Discuss the advantages and disadvantages of remote learning',
    level: 'advanced',
    pronunciationScore: 88,
    fluencyScore: 85,
    overallScore: 86,
    duration: '20 minutes',
    date: '2025-07-19',
    student: 'Nusrat Jahan',
    tutor: 'AI Tutor',
    score: 86,
    bandBreakdown: { fluency: 85, vocabulary: 90, grammar: 82, pronunciation: 88 },
    feedback: 'Excellent command of academic vocabulary. Strong argumentation skills. Minor improvement needed in intonation patterns for emphasis.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-19T10:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-003',
    language: 'Bangla',
    topic: 'বাংলাদেশের সংস্কৃতি সম্পর্কে আলোচনা করুন',
    level: 'advanced',
    pronunciationScore: 92,
    fluencyScore: 90,
    overallScore: 91,
    duration: '15 minutes',
    date: '2025-07-18',
    student: 'Tanvir Alam',
    tutor: 'AI Tutor',
    score: 91,
    bandBreakdown: { fluency: 90, vocabulary: 93, grammar: 88, pronunciation: 92 },
    feedback: 'অসাধারণ ভাষা দক্ষতা। সাহিত্যিক শব্দের ব্যবহার চমৎকার। আরও বেশি অনুশীলনের মাধ্যমে উচ্চারণে আরও নিখুঁততা আসবে।',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-18T16:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-004',
    language: 'English',
    topic: 'Explain how climate change affects your country',
    level: 'beginner',
    pronunciationScore: 45,
    fluencyScore: 40,
    overallScore: 42,
    duration: '10 minutes',
    date: '2025-07-21',
    student: 'Kamal Hossain',
    tutor: 'AI Tutor',
    score: 42,
    bandBreakdown: { fluency: 40, vocabulary: 48, grammar: 35, pronunciation: 45 },
    feedback: 'Good attempt for beginner level. Focus on building basic sentence structures and common vocabulary. Practice pronunciation of vowel sounds.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-21T09:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-005',
    language: 'Arabic',
    topic: 'وصف مدينة المدينة المنورة',
    level: 'beginner',
    pronunciationScore: 55,
    fluencyScore: 48,
    overallScore: 51,
    duration: '10 minutes',
    date: '2025-07-20',
    student: 'Ahmed Rahman',
    tutor: 'AI Tutor',
    score: 51,
    bandBreakdown: { fluency: 48, vocabulary: 55, grammar: 46, pronunciation: 55 },
    feedback: 'Good start for Arabic learning. Focus on proper pronunciation of Arabic letters, especially ع and ح. Practice basic sentence patterns.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-20T11:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-006',
    language: 'English',
    topic: 'Should universities focus more on practical skills than theoretical knowledge?',
    level: 'intermediate',
    pronunciationScore: 76,
    fluencyScore: 72,
    overallScore: 74,
    duration: '20 minutes',
    date: '2025-07-17',
    student: 'Sadia Afrin',
    tutor: 'AI Tutor',
    score: 74,
    bandBreakdown: { fluency: 72, vocabulary: 78, grammar: 70, pronunciation: 76 },
    feedback: 'Well-structured arguments with good use of linking words. Practice intonation for questions and improve use of articles.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-17T15:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-007',
    language: 'Bangla',
    topic: 'প্রযুক্তি কীভাবে আমাদের দৈনন্দিন জীবন পরিবর্তন করেছে',
    level: 'intermediate',
    pronunciationScore: 70,
    fluencyScore: 65,
    overallScore: 67,
    duration: '15 minutes',
    date: '2025-07-19',
    student: 'Mim Akter',
    tutor: 'AI Tutor',
    score: 67,
    bandBreakdown: { fluency: 65, vocabulary: 72, grammar: 62, pronunciation: 70 },
    feedback: 'ভালো বিষয়বস্তু উপস্থাপন। বাক্যের গঠনে আরও বৈচিত্র্য আনুন। আধুনিক শব্দের ব্যবহার বাড়ান।',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-19T13:00:00.000Z',
  },
  {
    _type: 'speaking_session',
    id: 'speaking-008',
    language: 'Spanish',
    topic: 'Describe your daily routine in Spanish',
    level: 'beginner',
    pronunciationScore: 52,
    fluencyScore: 45,
    overallScore: 48,
    duration: '10 minutes',
    date: '2025-07-21',
    student: 'David Chen',
    tutor: 'AI Tutor',
    score: 48,
    bandBreakdown: { fluency: 45, vocabulary: 55, grammar: 40, pronunciation: 52 },
    feedback: 'Buen intento. Focus on present tense conjugations and basic vocabulary. Practice rolling R sounds and vowel pronunciation.',
    recordingUrl: null,
    createdBy: 'system',
    startedAt: '2025-07-21T11:30:00.000Z',
  },
]

// ─── Seed Function ────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding education data into Settings table...')

  const allRecords = [
    ...TUTORS.map(t => ({
      key: `education_hub:tutor:${t.id}`,
      value: JSON.stringify(t),
    })),
    ...COURSES.map(c => ({
      key: `education_hub:course:${c.id}`,
      value: JSON.stringify(c),
    })),
    ...CLASSROOMS.map(cl => ({
      key: `education_hub:classroom:${cl.id}`,
      value: JSON.stringify(cl),
    })),
    ...ASSIGNMENTS.map(a => ({
      key: `education_hub:assignment:${a.id}`,
      value: JSON.stringify(a),
    })),
    ...EXAMS.map(e => ({
      key: `education_hub:exam:${e.id}`,
      value: JSON.stringify(e),
    })),
    ...SPEAKING_SESSIONS.map(s => ({
      key: `education_hub:speaking:${s.id}`,
      value: JSON.stringify(s),
    })),
  ]

  console.log(`  Total records to insert: ${allRecords.length}`)
  console.log(`    Tutors: ${TUTORS.length}`)
  console.log(`    Courses: ${COURSES.length}`)
  console.log(`    Classrooms: ${CLASSROOMS.length}`)
  console.log(`    Assignments: ${ASSIGNMENTS.length}`)
  console.log(`    Exams: ${EXAMS.length}`)
  console.log(`    Speaking Sessions: ${SPEAKING_SESSIONS.length}`)

  let created = 0
  let updated = 0
  let errors = 0

  for (const record of allRecords) {
    try {
      const result = await db.settings.upsert({
        where: { key: record.key },
        update: {
          value: record.value,
          type: 'json',
          updatedAt: new Date(),
        },
        create: {
          key: record.key,
          value: record.value,
          type: 'json',
        },
      })
      // Check if it was created or updated (Prisma doesn't easily distinguish, so we count based on existence)
      created++
    } catch (err) {
      console.error(`  ❌ Error inserting ${record.key}:`, err)
      errors++
    }
  }

  console.log(`\n✅ Seeding complete!`)
  console.log(`   Inserted/Updated: ${created}`)
  if (errors > 0) console.log(`   Errors: ${errors}`)

  // Verify
  const totalCount = await db.settings.count({
    where: { key: { startsWith: 'education_hub:' } },
  })
  console.log(`\n📊 Total education records in DB: ${totalCount}`)

  // Show record breakdown
  const byType = await db.settings.groupBy({
    by: ['key'],
    where: { key: { startsWith: 'education_hub:' } },
  })
  const counts: Record<string, number> = {}
  for (const r of byType) {
    const type = r.key.split(':')[1]
    counts[type] = (counts[type] || 0) + 1
  }
  for (const [type, count] of Object.entries(counts)) {
    console.log(`   ${type}: ${count}`)
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
