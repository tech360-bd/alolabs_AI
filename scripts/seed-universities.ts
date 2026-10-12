import { db } from '../src/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UniData {
  name: string
  slug: string
  country: string
  city: string
  type: string
  foundedYear: number
  studentCount: number
  internationalStudents: number
  website: string
  description: string
  rankingQS: number
  rankingTHE: number
  acceptanceRate: number
  faculties: FacultyData[]
  scholarships: ScholarshipData[]
  accommodations: AccommodationData[]
}

interface FacultyData {
  name: string
  description: string
  departments: string[]
  courses: CourseData[]
}

interface CourseData {
  name: string
  level: string
  duration: string
  tuitionFeeUSD: number | null
  localCurrency: string
  tuitionFeeLocal: number | null
  intakeMonths: string[]
  entryRequirements: string[]
  description: string
}

interface ScholarshipData {
  name: string
  type: string
  coverage: string
  amountUSD: number | null
  eligibility: string[]
  deadline: string
  description: string
  website: string
}

interface AccommodationData {
  name: string
  type: string
  costPerWeekUSD: number
  amenities: string[]
  description: string
  capacity: number
}

// ─── University Data ────────────────────────────────────────────────────────

const universities: UniData[] = [
  // 1. University of Oxford
  {
    name: 'University of Oxford',
    slug: 'university-of-oxford',
    country: 'United Kingdom',
    city: 'Oxford',
    type: 'public',
    foundedYear: 1096,
    studentCount: 26000,
    internationalStudents: 11400,
    website: 'https://www.ox.ac.uk',
    description: 'The University of Oxford is the oldest university in the English-speaking world and the world\'s second-oldest university in continuous operation. It is consistently ranked among the top universities globally and is renowned for its tutorial-based teaching system.',
    rankingQS: 3,
    rankingTHE: 1,
    acceptanceRate: 15.3,
    faculties: [
      {
        name: 'Faculty of Engineering Science',
        description: 'One of the largest and most diverse engineering departments in the UK, covering a wide range of engineering disciplines.',
        departments: ['Department of Engineering Science', 'Department of Computer Science', 'Department of Materials'],
        courses: [
          {
            name: 'MEng Engineering Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 44000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 36800,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'A*AA at A-Level', 'Mathematics and Physics required'],
            description: 'A broad-based engineering programme covering core principles with specialization options in later years.',
          },
          {
            name: 'MSc in Computer Science',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 42000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 35200,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'First-class or strong upper second-class degree in Computer Science or related field'],
            description: 'An advanced programme covering algorithms, machine learning, systems engineering, and software verification.',
          },
          {
            name: 'DPhil in Engineering Science',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 25000,
            intakeMonths: ['October', 'January'],
            entryRequirements: ['IELTS 7.5', 'Strong master\'s degree in engineering or related field', 'Research proposal required'],
            description: 'Doctoral research programme with opportunities across all engineering disciplines.',
          },
          {
            name: 'MSc in Energy Systems',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 42000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 35200,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'Upper second-class degree in engineering, physics or related field'],
            description: 'Interdisciplinary programme focusing on the transition to sustainable energy systems.',
          },
        ],
      },
      {
        name: 'Medical Sciences Division',
        description: 'One of the largest biomedical research centres in Europe, with world-class facilities and research output.',
        departments: ['Department of Medicine', 'Department of Neuroscience', 'Nuffield Department of Clinical Medicine'],
        courses: [
          {
            name: 'BM BCh Medicine',
            level: 'undergraduate',
            duration: '6 years',
            tuitionFeeUSD: 46000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 38500,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'A*AA at A-Level including Chemistry and Biology', 'BMAT required'],
            description: 'The Oxford medical degree, combining pre-clinical and clinical study with a research component.',
          },
          {
            name: 'MSc in Clinical Neurology',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 44000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 36800,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'Medical degree or strong degree in neuroscience/biological sciences'],
            description: 'Advanced study of neurological diseases combining clinical and research perspectives.',
          },
          {
            name: 'DPhil in Medical Sciences',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 25000,
            intakeMonths: ['October', 'January'],
            entryRequirements: ['IELTS 7.5', 'Strong master\'s degree in medical sciences', 'Research proposal required'],
            description: 'Doctoral research across the full spectrum of medical sciences.',
          },
        ],
      },
      {
        name: 'Faculty of Law',
        description: 'One of the oldest and most prestigious law faculties in the English-speaking world.',
        departments: ['Faculty of Law', 'Oxford Institute of European and Comparative Law', 'Bonavero Institute of Human Rights'],
        courses: [
          {
            name: 'BA in Jurisprudence (Law)',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 41000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 34300,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'AAA at A-Level', 'LNAT required'],
            description: 'Oxford\'s undergraduate law degree, covering the core foundations of English law and legal theory.',
          },
          {
            name: 'BCL (Bachelor of Civil Law)',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 43000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 36000,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'First-class law degree', 'Outstanding academic record'],
            description: 'An elite postgraduate law programme for outstanding law graduates from around the world.',
          },
          {
            name: 'MSc in Law and Finance',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 48000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 40200,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'First-class degree in law or related discipline', 'Professional experience preferred'],
            description: 'Interdisciplinary programme combining law, finance, and economics for careers in financial regulation and markets.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Rhodes Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 70000,
        eligibility: ['Outstanding academic achievement', 'Commitment to service and leadership', 'Age 19-25', 'Citizenship of a Rhodes-eligible country'],
        deadline: 'October',
        description: 'One of the most prestigious international scholarships, funding postgraduate study at Oxford for exceptional students worldwide.',
        website: 'https://www.rhodeshouse.ox.ac.uk/scholarships/the-rhodes-scholarship/',
      },
      {
        name: 'Clarendon Fund Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 45000,
        eligibility: ['Academic excellence', 'All nationalities eligible', 'Applying for full-time graduate study'],
        deadline: 'January',
        description: 'Oxford\'s flagship graduate scholarship, covering tuition and living expenses for outstanding graduate students from any country.',
        website: 'https://www.ox.ac.uk/clarendon',
      },
      {
        name: 'Chevening Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 40000,
        eligibility: ['Citizenship of a Chevening-eligible country', 'Two years of work experience', 'Commitment to return home'],
        deadline: 'November',
        description: 'UK government global scholarship programme funded by the Foreign, Commonwealth and Development Office.',
        website: 'https://www.chevening.org/',
      },
    ],
    accommodations: [
      {
        name: 'Christ Church College Accommodation',
        type: 'halls',
        costPerWeekUSD: 350,
        amenities: ['WiFi', 'Laundry', 'Meals included', 'Common room', 'Library access', 'Garden'],
        description: 'Historic college accommodation in the heart of Oxford, offering rooms with meals provided in the college hall.',
        capacity: 400,
      },
      {
        name: 'Graduate Accommodation at Summertown',
        type: 'apartments',
        costPerWeekUSD: 280,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Bike storage', 'Parking'],
        description: 'Self-catered graduate accommodation located in the Summertown area, approximately 20 minutes walk from the city centre.',
        capacity: 250,
      },
    ],
  },

  // 2. University of Cambridge
  {
    name: 'University of Cambridge',
    slug: 'university-of-cambridge',
    country: 'United Kingdom',
    city: 'Cambridge',
    type: 'public',
    foundedYear: 1209,
    studentCount: 24000,
    internationalStudents: 9800,
    website: 'https://www.cam.ac.uk',
    description: 'The University of Cambridge is the second-oldest university in the English-speaking world. It is renowned for its academic excellence, research output, and the collegiate system that provides a supportive community for students.',
    rankingQS: 2,
    rankingTHE: 5,
    acceptanceRate: 18.2,
    faculties: [
      {
        name: 'Faculty of Mathematics',
        description: 'Home to one of the world\'s leading mathematics departments, with a distinguished history including Newton, Hawking, and Turing.',
        departments: ['Department of Pure Mathematics and Mathematical Statistics', 'Department of Applied Mathematics and Theoretical Physics'],
        courses: [
          {
            name: 'BA in Mathematics (Mathematical Tripos)',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 40000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 33500,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'A*A*A at A-Level including Further Mathematics', 'STEP Mathematics required'],
            description: 'The world-famous Mathematical Tripos, providing rigorous training in pure and applied mathematics.',
          },
          {
            name: 'MPhil in Applied Mathematics',
            level: 'postgraduate',
            duration: '11 months',
            tuitionFeeUSD: 38000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 31800,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'Strong first-class degree in mathematics or related field'],
            description: 'Advanced study in applied mathematics, theoretical physics, and mathematical modelling.',
          },
          {
            name: 'PhD in Mathematics',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 25000,
            intakeMonths: ['October', 'January'],
            entryRequirements: ['IELTS 7.5', 'Strong master\'s degree in mathematics', 'Research proposal required'],
            description: 'Full-time doctoral research under the supervision of leading mathematicians.',
          },
          {
            name: 'MASt in Applied Mathematics',
            level: 'postgraduate',
            duration: '10 months',
            tuitionFeeUSD: 38000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 31800,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'First-class degree in mathematics', 'Strong quantitative background'],
            description: 'An advanced taught master\'s programme serving as a preparation for PhD study.',
          },
        ],
      },
      {
        name: 'Faculty of Medicine',
        description: 'A world-leading medical school with strong partnerships with NHS hospitals and research institutions.',
        departments: ['Department of Clinical Medicine', 'Department of Medical Genetics', 'Cambridge Institute for Medical Research'],
        courses: [
          {
            name: 'MB BChir Medicine',
            level: 'undergraduate',
            duration: '6 years',
            tuitionFeeUSD: 45000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 37700,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'A*A*A at A-Level including Chemistry and Biology', 'BMAT required'],
            description: 'Cambridge\'s medical degree with a strong scientific foundation and clinical placements.',
          },
          {
            name: 'MPhil in Public Health',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 40000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 33500,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'Strong upper second-class degree in relevant field', 'Relevant experience preferred'],
            description: 'Advanced training in epidemiology, biostatistics, and public health research methods.',
          },
          {
            name: 'PhD in Clinical Medicine',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 25000,
            intakeMonths: ['October', 'January'],
            entryRequirements: ['IELTS 7.5', 'Strong master\'s degree in medicine or biomedical sciences'],
            description: 'Doctoral research in clinical medicine, translational research, and medical sciences.',
          },
        ],
      },
      {
        name: 'Cambridge Judge Business School',
        description: 'A world-class business school known for entrepreneurship, innovation, and leadership programmes.',
        departments: ['Department of Business and Management', 'Cambridge Centre for Alternative Finance', 'Entrepreneurship Centre'],
        courses: [
          {
            name: 'MBA',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 72000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 60400,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong undergraduate degree', 'GMAT/GRE score', '3+ years work experience'],
            description: 'An intensive one-year MBA with concentrations in entrepreneurship, finance, and technology.',
          },
          {
            name: 'MPhil in Management',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 45000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 37700,
            intakeMonths: ['October'],
            entryRequirements: ['IELTS 7.5', 'First-class degree in any discipline', 'Limited or no work experience'],
            description: 'A pre-experience management programme designed for recent graduates with leadership potential.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Gates Cambridge Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 45000,
        eligibility: ['Outstanding academic record', 'All nationalities eligible', 'Commitment to improving the lives of others', 'Applying for full-time postgraduate study'],
        deadline: 'January',
        description: 'Fully funded scholarship for outstanding applicants from outside the UK to pursue postgraduate study at Cambridge.',
        website: 'https://www.gatescambridge.org/',
      },
      {
        name: 'Cambridge Trust Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 40000,
        eligibility: ['Academic excellence', 'International students', 'Financial need may be considered'],
        deadline: 'December',
        description: 'Cambridge Trust provides scholarships for international students at both undergraduate and postgraduate level.',
        website: 'https://www.cambridgetrust.org/',
      },
      {
        name: 'Chevening Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 40000,
        eligibility: ['Citizenship of a Chevening-eligible country', 'Two years of work experience', 'Commitment to return home'],
        deadline: 'November',
        description: 'UK government global scholarship for full-time postgraduate study at Cambridge.',
        website: 'https://www.chevening.org/',
      },
    ],
    accommodations: [
      {
        name: 'Trinity College Accommodation',
        type: 'halls',
        costPerWeekUSD: 320,
        amenities: ['WiFi', 'Laundry', 'Meals included', 'Common room', 'Chapel', 'Library'],
        description: 'College-owned accommodation in one of Cambridge\'s most prestigious colleges, with meals provided in the dining hall.',
        capacity: 500,
      },
      {
        name: 'University of Cambridge Graduate Housing',
        type: 'apartments',
        costPerWeekUSD: 260,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Bike storage'],
        description: 'University-managed graduate housing in the West Cambridge site.',
        capacity: 350,
      },
    ],
  },

  // 3. Massachusetts Institute of Technology
  {
    name: 'Massachusetts Institute of Technology',
    slug: 'massachusetts-institute-of-technology',
    country: 'United States',
    city: 'Cambridge, Massachusetts',
    type: 'private',
    foundedYear: 1861,
    studentCount: 11500,
    internationalStudents: 3600,
    website: 'https://www.mit.edu',
    description: 'MIT is a world-renowned research university known for its strength in science, engineering, and technology. It has produced numerous Nobel laureates, Turing Award winners, and Fields Medalists.',
    rankingQS: 1,
    rankingTHE: 2,
    acceptanceRate: 3.9,
    faculties: [
      {
        name: 'School of Engineering',
        description: 'The largest school at MIT, comprising eight academic departments and numerous research centres.',
        departments: ['Department of Electrical Engineering and Computer Science', 'Department of Mechanical Engineering', 'Department of Chemical Engineering'],
        courses: [
          {
            name: 'BS in Computer Science and Engineering',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 57500,
            localCurrency: 'USD',
            tuitionFeeLocal: 57500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'SAT/ACT scores (test-optional)', 'Outstanding academics', 'STEM-focused application'],
            description: 'MIT\'s flagship undergraduate programme combining theory and practice in computer science and electrical engineering.',
          },
          {
            name: 'MEng in Electrical Engineering and Computer Science',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 57500,
            localCurrency: 'USD',
            tuitionFeeLocal: 57500,
            intakeMonths: ['September', 'February'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.7+', 'MIT undergraduate degree required (typically 5-year program)'],
            description: 'A one-year master\'s programme available to MIT undergraduates, offering advanced study in EECS.',
          },
          {
            name: 'PhD in Mechanical Engineering',
            level: 'phd',
            duration: '4-6 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.7+', 'Strong undergraduate and master\'s degree', 'Research experience'],
            description: 'Fully funded doctoral programme with full tuition waiver and stipend for all admitted students.',
          },
          {
            name: 'MS in Chemical Engineering',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 57500,
            localCurrency: 'USD',
            tuitionFeeLocal: 57500,
            intakeMonths: ['September', 'February'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'Bachelor\'s degree in chemical engineering or related field'],
            description: 'Advanced study in chemical engineering with research opportunities in energy, materials, and biotechnology.',
          },
        ],
      },
      {
        name: 'School of Science',
        description: 'MIT\'s School of Science encompasses six departments focused on fundamental scientific research.',
        departments: ['Department of Physics', 'Department of Mathematics', 'Department of Chemistry', 'Department of Biology'],
        courses: [
          {
            name: 'BS in Physics',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 57500,
            localCurrency: 'USD',
            tuitionFeeLocal: 57500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Exceptional academic record', 'SAT/ACT recommended', 'Strong mathematics background'],
            description: 'Rigorous undergraduate physics programme with access to world-class research facilities.',
          },
          {
            name: 'PhD in Mathematics',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Exceptional mathematical ability', 'Strong recommendation letters', 'Research statement'],
            description: 'Fully funded doctoral programme in pure and applied mathematics.',
          },
          {
            name: 'PhD in Chemistry',
            level: 'phd',
            duration: '5-6 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.7+', 'Bachelor\'s degree in chemistry or related field', 'Research experience'],
            description: 'Fully funded doctoral programme covering organic, inorganic, physical, and biological chemistry.',
          },
        ],
      },
      {
        name: 'Sloan School of Management',
        description: 'MIT\'s business school, known for its analytical approach to management and strong ties to technology.',
        departments: ['Department of Management', 'Finance Group', 'Entrepreneurship Group'],
        courses: [
          {
            name: 'MBA (Master of Business Administration)',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 82000,
            localCurrency: 'USD',
            tuitionFeeLocal: 82000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'GMAT/GRE', '5+ years work experience'],
            description: 'A two-year MBA programme known for its analytical rigor, action learning labs, and entrepreneurship focus.',
          },
          {
            name: 'Master of Finance',
            level: 'postgraduate',
            duration: '18 months',
            tuitionFeeUSD: 90000,
            localCurrency: 'USD',
            tuitionFeeLocal: 90000,
            intakeMonths: ['July'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'Strong quantitative background', '0-2 years experience'],
            description: 'An intensive STEM-designated finance programme preparing students for careers in quantitative finance.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'MIT Scholarship',
        type: 'need',
        coverage: 'full',
        amountUSD: 57500,
        eligibility: ['Demonstrated financial need', 'Academic merit', 'All nationalities'],
        deadline: 'February',
        description: 'MIT provides need-based financial aid to all admitted students, covering up to 100% of demonstrated need.',
        website: 'https://sfs.mit.edu/',
      },
      {
        name: 'Fulbright Foreign Student Program',
        type: 'merit',
        coverage: 'full',
        amountUSD: 50000,
        eligibility: ['Citizenship of a Fulbright-eligible country', 'Bachelor\'s degree', 'Proficiency in English'],
        deadline: 'October',
        description: 'U.S. government-sponsored programme providing funding for international students to study at U.S. universities.',
        website: 'https://fulbrightprogram.org/',
      },
    ],
    accommodations: [
      {
        name: 'MIT Graduate Residences (Simmons Hall)',
        type: 'halls',
        costPerWeekUSD: 320,
        amenities: ['WiFi', 'Laundry', 'Dining hall', 'Gym', 'Study rooms', 'Common areas'],
        description: 'Iconic graduate residence hall designed by architect Steven Holl, offering single rooms with meal plans.',
        capacity: 350,
      },
      {
        name: 'MIT Undergraduate Residence (Baker House)',
        type: 'halls',
        costPerWeekUSD: 300,
        amenities: ['WiFi', 'Laundry', 'Dining hall', 'Common room', 'River views'],
        description: 'One of MIT\'s most iconic undergraduate dormitories on the Charles River.',
        capacity: 320,
      },
    ],
  },

  // 4. Harvard University
  {
    name: 'Harvard University',
    slug: 'harvard-university',
    country: 'United States',
    city: 'Cambridge, Massachusetts',
    type: 'private',
    foundedYear: 1636,
    studentCount: 23700,
    internationalStudents: 5500,
    website: 'https://www.harvard.edu',
    description: 'Harvard University is the oldest institution of higher learning in the United States. It is globally recognized for its academic excellence, influential alumni network, and world-class research across all disciplines.',
    rankingQS: 4,
    rankingTHE: 4,
    acceptanceRate: 3.4,
    faculties: [
      {
        name: 'Harvard Business School',
        description: 'The world\'s most prestigious business school, pioneer of the case study method.',
        departments: ['Department of Business Administration', 'Entrepreneurship Division', 'Finance Division'],
        courses: [
          {
            name: 'MBA',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 75000,
            localCurrency: 'USD',
            tuitionFeeLocal: 75000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Bachelor\'s degree', 'GMAT/GRE', '4+ years work experience'],
            description: 'The world-renowned Harvard MBA using the case method, developing leadership and analytical skills.',
          },
          {
            name: 'DBA (Doctor of Business Administration)',
            level: 'phd',
            duration: '3-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'MBA or equivalent master\'s degree', 'Strong research interest', 'GMAT/GRE'],
            description: 'Fully funded doctoral programme for aspiring business scholars.',
          },
          {
            name: 'MS/MBA Biotechnology',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 78000,
            localCurrency: 'USD',
            tuitionFeeLocal: 78000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong science background', 'GMAT/GRE', 'Interest in biotech'],
            description: 'Joint degree combining business education with biotechnology expertise.',
          },
        ],
      },
      {
        name: 'Harvard Medical School',
        description: 'One of the most prestigious medical schools in the world, affiliated with top teaching hospitals.',
        departments: ['Department of Pathology', 'Department of Genetics', 'Department of Neurobiology'],
        courses: [
          {
            name: 'MD (Doctor of Medicine)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 65000,
            localCurrency: 'USD',
            tuitionFeeLocal: 65000,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 7.5', 'Bachelor\'s degree (any major)', 'MCAT score', 'Pre-med coursework'],
            description: 'The Harvard MD programme combining foundational medical science with clinical rotations at world-class hospitals.',
          },
          {
            name: 'PhD in Biomedical Sciences',
            level: 'phd',
            duration: '5-7 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong undergraduate degree in science', 'Research experience', 'GRE recommended'],
            description: 'Fully funded doctoral programme across all biomedical disciplines.',
          },
          {
            name: 'Master of Medical Sciences in Immunology',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 50000,
            localCurrency: 'USD',
            tuitionFeeLocal: 50000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong science background', 'Research experience preferred'],
            description: 'Advanced training in immunology research at one of the world\'s leading medical research institutions.',
          },
        ],
      },
      {
        name: 'Harvard John A. Paulson School of Engineering and Applied Sciences',
        description: 'Harvard\'s engineering school, rapidly growing with state-of-the-art facilities and interdisciplinary research.',
        departments: ['Department of Computer Science', 'Department of Electrical Engineering', 'Applied Mathematics'],
        courses: [
          {
            name: 'AB in Computer Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 54000,
            localCurrency: 'USD',
            tuitionFeeLocal: 54000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Exceptional academic record', 'SAT/ACT', 'Strong math background'],
            description: 'Harvard\'s undergraduate computer science programme covering algorithms, systems, AI, and theory.',
          },
          {
            name: 'MS in Data Science',
            level: 'postgraduate',
            duration: '1.5 years',
            tuitionFeeUSD: 54000,
            localCurrency: 'USD',
            tuitionFeeLocal: 54000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong quantitative background', 'Programming proficiency', 'GPA 3.5+'],
            description: 'Interdisciplinary data science programme combining statistics, computer science, and domain expertise.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Harvard Financial Aid Initiative',
        type: 'need',
        coverage: 'full',
        amountUSD: 54000,
        eligibility: ['Demonstrated financial need', 'Admitted to Harvard College', 'Families earning below $75,000 pay nothing'],
        deadline: 'March',
        description: 'Harvard\'s need-blind admissions policy ensures admitted students receive aid covering 100% of demonstrated need.',
        website: 'https://college.harvard.edu/financial-aid',
      },
      {
        name: 'Fulbright Foreign Student Program',
        type: 'merit',
        coverage: 'full',
        amountUSD: 50000,
        eligibility: ['Citizenship of a Fulbright-eligible country', 'Bachelor\'s degree', 'English proficiency'],
        deadline: 'October',
        description: 'U.S. government scholarship for international graduate students at Harvard.',
        website: 'https://fulbrightprogram.org/',
      },
      {
        name: 'Harvard University Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 60000,
        eligibility: ['Outstanding academic achievement', 'All nationalities', 'Admitted to a Harvard graduate program'],
        deadline: 'December',
        description: 'Merit-based scholarships for outstanding graduate students across all Harvard schools.',
        website: 'https://gsas.harvard.edu/financial-support',
      },
    ],
    accommodations: [
      {
        name: 'Harvard Yard Freshman Dormitories',
        type: 'halls',
        costPerWeekUSD: 350,
        amenities: ['WiFi', 'Laundry', 'Dining hall', 'Common rooms', 'Historic architecture'],
        description: 'First-year student housing in the historic Harvard Yard, the heart of campus life since the 17th century.',
        capacity: 1700,
      },
      {
        name: 'Harvard Graduate School of Arts and Sciences Housing',
        type: 'apartments',
        costPerWeekUSD: 400,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Furnished', 'Utilities included'],
        description: 'University-owned apartments for graduate students in the Cambridge area.',
        capacity: 500,
      },
    ],
  },

  // 5. Stanford University
  {
    name: 'Stanford University',
    slug: 'stanford-university',
    country: 'United States',
    city: 'Stanford, California',
    type: 'private',
    foundedYear: 1885,
    studentCount: 17500,
    internationalStudents: 3900,
    website: 'https://www.stanford.edu',
    description: 'Stanford University is a world-leading research university located in Silicon Valley. It is known for its entrepreneurial culture, cutting-edge research, and close ties to the technology industry.',
    rankingQS: 6,
    rankingTHE: 6,
    acceptanceRate: 3.6,
    faculties: [
      {
        name: 'School of Engineering',
        description: 'Stanford\'s largest school, home to pioneering research in computer science, AI, and engineering.',
        departments: ['Department of Computer Science', 'Department of Electrical Engineering', 'Department of Mechanical Engineering'],
        courses: [
          {
            name: 'BS in Computer Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 57000,
            localCurrency: 'USD',
            tuitionFeeLocal: 57000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Exceptional academics', 'SAT/ACT (test-optional)', 'Strong STEM background'],
            description: 'Stanford\'s world-renowned computer science programme with tracks in AI, systems, theory, and human-computer interaction.',
          },
          {
            name: 'MS in Computer Science (Artificial Intelligence)',
            level: 'postgraduate',
            duration: '1.5-2 years',
            tuitionFeeUSD: 57000,
            localCurrency: 'USD',
            tuitionFeeLocal: 57000,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'Strong programming and math background', 'GRE recommended'],
            description: 'Specialized master\'s in AI covering machine learning, NLP, computer vision, and robotics.',
          },
          {
            name: 'PhD in Computer Science',
            level: 'phd',
            duration: '4-6 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.7+', 'Research experience', 'Strong recommendation letters'],
            description: 'Fully funded doctoral programme with full tuition waiver, stipend, and health insurance.',
          },
          {
            name: 'MS in Electrical Engineering',
            level: 'postgraduate',
            duration: '1.5-2 years',
            tuitionFeeUSD: 57000,
            localCurrency: 'USD',
            tuitionFeeLocal: 57000,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'Bachelor\'s in EE or related field'],
            description: 'Advanced study in circuits, signal processing, communications, and hardware systems.',
          },
        ],
      },
      {
        name: 'Graduate School of Business',
        description: 'One of the world\'s top business schools, known for its leadership programmes and Silicon Valley connections.',
        departments: ['Department of Finance', 'Department of Organizational Behavior', 'Department of Strategy'],
        courses: [
          {
            name: 'MBA',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 74000,
            localCurrency: 'USD',
            tuitionFeeLocal: 74000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Bachelor\'s degree', 'GMAT/GRE', '3+ years work experience'],
            description: 'Stanford GSB\'s MBA programme emphasizing leadership, innovation, and entrepreneurial thinking.',
          },
          {
            name: 'MS in Management Science & Engineering',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 57000,
            localCurrency: 'USD',
            tuitionFeeLocal: 57000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'GPA 3.5+', 'Engineering or quantitative background'],
            description: 'Quantitative and analytical approach to management and operations research.',
          },
        ],
      },
      {
        name: 'School of Medicine',
        description: 'A leading medical school integrated with Stanford Health Care, known for research and clinical innovation.',
        departments: ['Department of Bioengineering', 'Department of Genetics', 'Department of Neurology'],
        courses: [
          {
            name: 'MD (Doctor of Medicine)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 63000,
            localCurrency: 'USD',
            tuitionFeeLocal: 63000,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 7.5', 'Bachelor\'s degree', 'MCAT score', 'Pre-med prerequisites'],
            description: 'Stanford\'s medical degree with an emphasis on research, clinical innovation, and diversity.',
          },
          {
            name: 'PhD in Biomedical Informatics',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'USD',
            tuitionFeeLocal: null,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'Strong quantitative and computational background', 'Research experience'],
            description: 'Fully funded doctoral programme at the intersection of medicine, biology, and data science.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Knight-Hennessy Scholars Program',
        type: 'merit',
        coverage: 'full',
        amountUSD: 80000,
        eligibility: ['Outstanding leadership potential', 'Civic commitment', 'All nationalities', 'Applying to any Stanford graduate program'],
        deadline: 'October',
        description: 'Stanford\'s flagship graduate scholarship developing the next generation of global leaders.',
        website: 'https://knight-hennessy.stanford.edu/',
      },
      {
        name: 'Stanford Financial Aid',
        type: 'need',
        coverage: 'full',
        amountUSD: 57000,
        eligibility: ['Demonstrated financial need', 'Admitted to Stanford', 'U.S. citizens and international students'],
        deadline: 'February',
        description: 'Need-based financial aid ensuring Stanford is affordable for all admitted students.',
        website: 'https://financialaid.stanford.edu/',
      },
    ],
    accommodations: [
      {
        name: 'Stanford Residential Halls',
        type: 'halls',
        costPerWeekUSD: 350,
        amenities: ['WiFi', 'Laundry', 'Dining hall', 'Common rooms', 'Study spaces', 'Fitness center'],
        description: 'Stanford\'s residential system with multiple houses offering a vibrant campus community.',
        capacity: 6500,
      },
      {
        name: 'Stanford Graduate Housing (Escondido Village)',
        type: 'apartments',
        costPerWeekUSD: 380,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Furnished', 'Playground', 'Pet-friendly options'],
        description: 'The largest graduate student housing complex in the U.S., offering apartment-style living for students with families.',
        capacity: 2000,
      },
    ],
  },

  // 6. Australian National University
  {
    name: 'Australian National University',
    slug: 'australian-national-university',
    country: 'Australia',
    city: 'Canberra',
    type: 'public',
    foundedYear: 1946,
    studentCount: 25500,
    internationalStudents: 6500,
    website: 'https://www.anu.edu.au',
    description: 'ANU is Australia\'s national university, consistently ranked as the top university in Australia. It is known for its research intensity and strengths in politics, international relations, and science.',
    rankingQS: 30,
    rankingTHE: 67,
    acceptanceRate: 35.0,
    faculties: [
      {
        name: 'ANU College of Engineering and Computer Science',
        description: 'Leading engineering and computing research institution with strong industry partnerships.',
        departments: ['School of Engineering', 'School of Computing', 'Research School of Information Sciences'],
        courses: [
          {
            name: 'Bachelor of Software Engineering (Honours)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 33000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 50600,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent', 'Mathematics prerequisite'],
            description: 'Professional software engineering degree accredited by Engineers Australia.',
          },
          {
            name: 'Master of Computing',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 37000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 56700,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree with computing prerequisites', 'GPA equivalent to ANU 5.0/7.0'],
            description: 'Professional computing master\'s with specializations in AI, data science, and cybersecurity.',
          },
          {
            name: 'PhD in Computer Science',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Research master\'s or honours degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research in computing with a competitive stipend.',
          },
        ],
      },
      {
        name: 'ANU College of Arts and Social Sciences',
        description: 'One of Australia\'s leading humanities and social sciences faculties, with particular strength in political science.',
        departments: ['School of Politics and International Relations', 'School of History', 'School of Philosophy'],
        courses: [
          {
            name: 'Bachelor of International Relations',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 28000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 42900,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 80+ or equivalent'],
            description: 'Comprehensive study of global politics, diplomacy, and international security.',
          },
          {
            name: 'Master of International Relations',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 46000,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree in relevant field'],
            description: 'Advanced study of international affairs, diplomacy, and global governance.',
          },
        ],
      },
      {
        name: 'ANU College of Science',
        description: 'A world-class science faculty with leading research in astronomy, physics, and environmental sciences.',
        departments: ['Research School of Physics', 'Research School of Earth Sciences', 'Research School of Biology'],
        courses: [
          {
            name: 'Bachelor of Science (Honours)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 31000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 47500,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent', 'Mathematics prerequisite'],
            description: 'Flexible science degree with majors across physical, biological, and environmental sciences.',
          },
          {
            name: 'PhD in Physics',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Honours or research master\'s in physics', 'Research proposal'],
            description: 'Fully funded doctoral research at one of the world\'s leading physics departments.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Australia Awards Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 45000,
        eligibility: ['Citizenship of eligible developing country', 'Leadership potential', 'Commitment to return home'],
        deadline: 'May',
        description: 'Australian government-funded scholarships for students from developing countries to study in Australia.',
        website: 'https://australiaawards.gov.au/',
      },
      {
        name: 'ANU Chancellor\'s International Scholarship',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 25000,
        eligibility: ['International student', 'Outstanding academic results', 'Applying for undergraduate or postgraduate coursework'],
        deadline: 'December',
        description: 'Merit-based tuition fee reduction for high-achieving international students at ANU.',
        website: 'https://www.anu.edu.au/study/scholarships',
      },
      {
        name: 'ANU Research Scholarship',
        type: 'research',
        coverage: 'full',
        amountUSD: 35000,
        eligibility: ['International student', 'Research potential', 'Applying for PhD or MPhil'],
        deadline: 'October',
        description: 'Fully funded research scholarship covering tuition, stipend, and overseas health cover.',
        website: 'https://www.anu.edu.au/study/scholarships',
      },
    ],
    accommodations: [
      {
        name: 'ANU Village (Burgmann College)',
        type: 'halls',
        costPerWeekUSD: 350,
        amenities: ['WiFi', 'Laundry', 'Meals provided', 'Common room', 'Library', 'Sports facilities'],
        description: 'A residential college providing a supportive community with academic support and cultural activities.',
        capacity: 450,
      },
      {
        name: 'ANU Graduate House',
        type: 'apartments',
        costPerWeekUSD: 280,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Study rooms', 'Garden'],
        description: 'Self-catered accommodation specifically for postgraduate students, close to campus.',
        capacity: 200,
      },
    ],
  },

  // 7. University of Toronto
  {
    name: 'University of Toronto',
    slug: 'university-of-toronto',
    country: 'Canada',
    city: 'Toronto',
    type: 'public',
    foundedYear: 1827,
    studentCount: 97000,
    internationalStudents: 25000,
    website: 'https://www.utoronto.ca',
    description: 'The University of Toronto is Canada\'s largest and most prestigious university, a global leader in research and teaching. It has three campuses in the Greater Toronto Area.',
    rankingQS: 25,
    rankingTHE: 21,
    acceptanceRate: 43.0,
    faculties: [
      {
        name: 'Faculty of Engineering',
        description: 'One of Canada\'s top engineering schools, known for innovation and research excellence.',
        departments: ['Department of Electrical and Computer Engineering', 'Department of Mechanical and Industrial Engineering', 'Department of Chemical Engineering'],
        courses: [
          {
            name: 'BASc in Engineering Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 42000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 57000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'High school GPA 90%+', 'Calculus and Physics prerequisites', 'Supplementary application'],
            description: 'An elite engineering programme with majors in aerospace, biomedical, electrical, and energy systems engineering.',
          },
          {
            name: 'MEng in Electrical and Computer Engineering',
            level: 'postgraduate',
            duration: '1-2 years',
            tuitionFeeUSD: 35000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 47500,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s in engineering', 'GPA 3.0+ (B average)'],
            description: 'Professional master\'s in ECE with specializations in AI, communications, and microelectronics.',
          },
          {
            name: 'PhD in Mechanical Engineering',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'CAD',
            tuitionFeeLocal: null,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Master\'s degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research in advanced manufacturing, robotics, and thermofluids.',
          },
          {
            name: 'MEng in Chemical Engineering',
            level: 'postgraduate',
            duration: '1-2 years',
            tuitionFeeUSD: 35000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 47500,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s in chemical engineering or related', 'GPA 3.0+'],
            description: 'Professional master\'s covering process engineering, polymers, and environmental engineering.',
          },
        ],
      },
      {
        name: 'Faculty of Medicine',
        description: 'One of the top medical schools in North America, with leading research in regenerative medicine and AI in healthcare.',
        departments: ['Department of Medicine', 'Department of Surgery', 'Department of Laboratory Medicine and Pathobiology'],
        courses: [
          {
            name: 'MD (Doctor of Medicine)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 52000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 70500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'MCAT score', 'Minimum GPA 3.6', 'Prerequisite courses'],
            description: 'The U of T MD programme with clinical rotations at Toronto\'s world-class teaching hospitals.',
          },
          {
            name: 'MSc in Biomedical Communications',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 30000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 40700,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'Portfolio required', 'GPA 3.0+'],
            description: 'Unique programme combining biomedical science with visual communication and design.',
          },
          {
            name: 'PhD in Molecular Genetics',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'CAD',
            tuitionFeeLocal: null,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Master\'s degree or equivalent', 'Research experience'],
            description: 'Fully funded doctoral research in genetics, genomics, and molecular biology.',
          },
        ],
      },
      {
        name: 'Rotman School of Management',
        description: 'Canada\'s leading business school, known for its strength in finance and integrative thinking.',
        departments: ['Department of Finance', 'Department of Strategy', 'Department of Management'],
        courses: [
          {
            name: 'MBA',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 72000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 97500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'GMAT/GRE', '2+ years work experience'],
            description: 'Full-time MBA with specializations in finance, consulting, and entrepreneurship.',
          },
          {
            name: 'Master of Finance',
            level: 'postgraduate',
            duration: '20 months',
            tuitionFeeUSD: 55000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 74500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s in commerce, finance, or related', 'Strong quantitative background'],
            description: 'Specialized finance master\'s for careers in investment banking, asset management, and fintech.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Lester B. Pearson International Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 55000,
        eligibility: ['International student', 'Outstanding academic achievement', 'Recognized as a leader', 'Nominated by school'],
        deadline: 'November',
        description: 'Canada\'s most prestigious international student scholarship, covering tuition, books, and residence for four years.',
        website: 'https://future.utoronto.ca/pearson/',
      },
      {
        name: 'University of Toronto International Student Award',
        type: 'need',
        coverage: 'partial',
        amountUSD: 20000,
        eligibility: ['International student', 'Demonstrated financial need', 'Strong academic record'],
        deadline: 'March',
        description: 'Need-based awards for international undergraduate students at the University of Toronto.',
        website: 'https://future.utoronto.ca/finances/',
      },
      {
        name: 'Ontario Graduate Scholarship (OGS)',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 12000,
        eligibility: ['Domestic or international student', 'GPA A- or above', 'Enrolled in graduate program'],
        deadline: 'February',
        description: 'Provincial merit-based scholarship for graduate students at Ontario universities.',
        website: 'https://www.sgs.utoronto.ca/',
      },
    ],
    accommodations: [
      {
        name: 'University College Residence',
        type: 'halls',
        costPerWeekUSD: 280,
        amenities: ['WiFi', 'Laundry', 'Meal plan', 'Common room', 'Study spaces'],
        description: 'Traditional residence in the heart of the St. George campus, offering single and double rooms with meal plans.',
        capacity: 750,
      },
      {
        name: 'Graduate House',
        type: 'apartments',
        costPerWeekUSD: 250,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Common room', 'Fitness room'],
        description: 'Apartment-style accommodation for graduate students in downtown Toronto.',
        capacity: 500,
      },
    ],
  },

  // 8. National University of Singapore
  {
    name: 'National University of Singapore',
    slug: 'national-university-of-singapore',
    country: 'Singapore',
    city: 'Singapore',
    type: 'public',
    foundedYear: 1905,
    studentCount: 40000,
    internationalStudents: 12000,
    website: 'https://www.nus.edu.sg',
    description: 'NUS is Singapore\'s flagship university and consistently ranked as the best university in Asia. It is a comprehensive research university with strengths in engineering, computing, business, and life sciences.',
    rankingQS: 8,
    rankingTHE: 19,
    acceptanceRate: 5.0,
    faculties: [
      {
        name: 'Faculty of Engineering',
        description: 'One of the largest engineering faculties in the world, with comprehensive programmes across all engineering disciplines.',
        departments: ['Department of Electrical and Computer Engineering', 'Department of Mechanical Engineering', 'Department of Chemical and Biomolecular Engineering'],
        courses: [
          {
            name: 'Bachelor of Engineering (Computer Engineering)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 25000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 33700,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 6.5', 'Strong A-Level or equivalent results', 'Mathematics and Physics'],
            description: 'Comprehensive computer engineering programme covering hardware, software, and systems design.',
          },
          {
            name: 'Master of Science in Artificial Intelligence',
            level: 'postgraduate',
            duration: '1.5 years',
            tuitionFeeUSD: 35000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 47300,
            intakeMonths: ['August', 'January'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in computing or related field', 'GPA 3.0+', 'Programming proficiency'],
            description: 'Specialized AI master\'s covering deep learning, NLP, computer vision, and AI ethics.',
          },
          {
            name: 'PhD in Engineering',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'SGD',
            tuitionFeeLocal: null,
            intakeMonths: ['August', 'January'],
            entryRequirements: ['IELTS 6.5', 'Strong master\'s degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research with monthly stipend for outstanding students.',
          },
          {
            name: 'Master of Science in Robotics',
            level: 'postgraduate',
            duration: '1.5 years',
            tuitionFeeUSD: 35000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 47300,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in engineering or related', 'GPA 3.0+'],
            description: 'Advanced robotics programme combining mechanical design, AI, and control systems.',
          },
        ],
      },
      {
        name: 'NUS Business School',
        description: 'One of Asia\'s top business schools, known for its international focus and strong industry connections.',
        departments: ['Department of Finance', 'Department of Strategy and Policy', 'Department of Marketing'],
        courses: [
          {
            name: 'BBA (Business Administration)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 24000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 32400,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 6.5', 'Strong A-Level or equivalent', 'Interview may be required'],
            description: 'Comprehensive business degree with specializations in finance, marketing, and operations.',
          },
          {
            name: 'MBA',
            level: 'postgraduate',
            duration: '17 months',
            tuitionFeeUSD: 65000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 87800,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'GMAT/GRE', '3+ years work experience'],
            description: 'Intensive MBA programme with Asian focus and global exchange opportunities.',
          },
          {
            name: 'Master of Science in Finance',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 50000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 67600,
            intakeMonths: ['August', 'January'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in finance, business, or related', 'Strong quantitative skills'],
            description: 'Quantitative finance programme preparing students for careers in banking and investment.',
          },
        ],
      },
      {
        name: 'Faculty of Science',
        description: 'A leading science faculty with world-class research in life sciences, chemistry, and physics.',
        departments: ['Department of Physics', 'Department of Chemistry', 'Department of Biological Sciences'],
        courses: [
          {
            name: 'Bachelor of Science (Data Science)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 24000,
            localCurrency: 'SGD',
            tuitionFeeLocal: 32400,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 6.5', 'Strong A-Level or equivalent', 'Mathematics required'],
            description: 'Interdisciplinary programme combining statistics, computer science, and domain knowledge.',
          },
          {
            name: 'PhD in Life Sciences',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'SGD',
            tuitionFeeLocal: null,
            intakeMonths: ['August', 'January'],
            entryRequirements: ['IELTS 6.5', 'Strong honours/master\'s degree', 'Research experience'],
            description: 'Fully funded doctoral research in biological sciences, molecular biology, and biomedicine.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'NUS Global Merit Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 40000,
        eligibility: ['International student', 'Outstanding academic results', 'Strong co-curricular record', 'Leadership potential'],
        deadline: 'March',
        description: 'NUS\'s premier scholarship for international undergraduates, covering full tuition and living allowance.',
        website: 'https://www.nus.edu.sg/oam/scholarships',
      },
      {
        name: 'ASEAN Graduate Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 30000,
        eligibility: ['ASEAN citizenship', 'Excellent academic record', 'Applying for graduate research program'],
        deadline: 'November',
        description: 'Fully funded scholarship for ASEAN nationals pursuing graduate research at NUS.',
        website: 'https://www.nus.edu.sg/oam/scholarships',
      },
      {
        name: 'NUS Research Scholarship',
        type: 'research',
        coverage: 'full',
        amountUSD: 28000,
        eligibility: ['International student', 'Research potential', 'Applying for PhD or MSc by research'],
        deadline: 'November',
        description: 'Fully funded research scholarship with monthly stipend for PhD and research master\'s students.',
        website: 'https://www.nus.edu.sg/oam/scholarships',
      },
    ],
    accommodations: [
      {
        name: 'NUS University Town (UTown) Residences',
        type: 'apartments',
        costPerWeekUSD: 200,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Gym', 'Study rooms', 'Common lounges'],
        description: 'Modern residential complex with apartment-style living, integrating residential and educational spaces.',
        capacity: 2400,
      },
      {
        name: 'Prince George\'s Park Residences',
        type: 'halls',
        costPerWeekUSD: 150,
        amenities: ['WiFi', 'Laundry', 'Canteen', 'Sports courts', 'Common room'],
        description: 'Single-room halls of residence located near the main campus, with communal facilities.',
        capacity: 3000,
      },
    ],
  },

  // 9. University of Melbourne
  {
    name: 'University of Melbourne',
    slug: 'university-of-melbourne',
    country: 'Australia',
    city: 'Melbourne',
    type: 'public',
    foundedYear: 1853,
    studentCount: 52000,
    internationalStudents: 18000,
    website: 'https://www.unimelb.edu.au',
    description: 'The University of Melbourne is Australia\'s second-oldest university and a member of the Group of Eight. It is globally recognized for its research excellence and the Melbourne Model of education.',
    rankingQS: 13,
    rankingTHE: 34,
    acceptanceRate: 35.0,
    faculties: [
      {
        name: 'Faculty of Engineering and Information Technology',
        description: 'A leading engineering and IT faculty with strong industry connections and research output.',
        departments: ['Department of Electrical and Electronic Engineering', 'Department of Computing and Information Systems', 'Department of Mechanical Engineering'],
        courses: [
          {
            name: 'Bachelor of Science (Computing and Software Systems)',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 34000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 52100,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent', 'Mathematics Methods prerequisite'],
            description: 'Computing major within the Melbourne Model Bachelor of Science, covering programming, algorithms, and systems.',
          },
          {
            name: 'Master of Engineering (Software)',
            level: 'postgraduate',
            duration: '3 years (or 2 with credit)',
            tuitionFeeUSD: 37000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 56700,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree with engineering prerequisites', 'GPA equivalent to 65%+'],
            description: 'Professional engineering master\'s accredited by Engineers Australia, with industry project component.',
          },
          {
            name: 'PhD in Computer Science',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Research master\'s or honours degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research in all areas of computer science and IT.',
          },
          {
            name: 'Master of Data Science',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 38000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 58200,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree with programming and statistics', 'GPA 65%+ equivalent'],
            description: 'Comprehensive data science programme covering statistics, machine learning, and big data technologies.',
          },
        ],
      },
      {
        name: 'Faculty of Medicine, Dentistry and Health Sciences',
        description: 'Australia\'s largest biomedical research faculty, affiliated with leading hospitals.',
        departments: ['Melbourne Medical School', 'School of Population and Global Health', 'Melbourne Dental School'],
        courses: [
          {
            name: 'Doctor of Medicine (MD)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 52000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 79700,
            intakeMonths: ['February'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'GAMSAT or MCAT', 'Prior degree with prerequisites'],
            description: 'Graduate-entry medical programme with clinical placements at Melbourne\'s top teaching hospitals.',
          },
          {
            name: 'Master of Public Health',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 32000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 49000,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree in health or related field', 'Relevant experience preferred'],
            description: 'Comprehensive public health programme with specializations in epidemiology, health policy, and global health.',
          },
          {
            name: 'PhD in Neuroscience',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Honours or research master\'s', 'Research proposal'],
            description: 'Fully funded doctoral research at the Melbourne Neuroscience Institute.',
          },
        ],
      },
      {
        name: 'Faculty of Business and Economics',
        description: 'One of Australia\'s leading business schools, accredited by AACSB, EQUIS, and AMBA.',
        departments: ['Department of Accounting', 'Department of Finance', 'Department of Management and Marketing'],
        courses: [
          {
            name: 'Bachelor of Commerce',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 33000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 50600,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent'],
            description: 'Comprehensive business degree with majors in accounting, finance, economics, and management.',
          },
          {
            name: 'Master of Management (Finance)',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 36000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 55200,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree in any discipline', 'GPA 65%+ equivalent'],
            description: 'Specialized finance programme for students seeking careers in financial services and corporate finance.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Melbourne Graduate Research Scholarship (MGRS)',
        type: 'research',
        coverage: 'full',
        amountUSD: 35000,
        eligibility: ['International student', 'Research potential', 'Applying for graduate research (MPhil/PhD)'],
        deadline: 'October',
        description: 'Fully funded scholarship covering tuition fee remission, living allowance, and health insurance.',
        website: 'https://scholarships.unimelb.edu.au/',
      },
      {
        name: 'Australia Awards Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 45000,
        eligibility: ['Citizenship of eligible developing country', 'Leadership potential', 'Commitment to return home'],
        deadline: 'May',
        description: 'Australian government scholarship for students from developing countries.',
        website: 'https://australiaawards.gov.au/',
      },
      {
        name: 'Melbourne International Undergraduate Scholarship (MIU)',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 15000,
        eligibility: ['International student', 'Outstanding academic results', 'Citizen of a non-Australian country'],
        deadline: 'December',
        description: 'Partial tuition fee scholarship for high-achieving international undergraduate students.',
        website: 'https://scholarships.unimelb.edu.au/',
      },
    ],
    accommodations: [
      {
        name: 'University College',
        type: 'halls',
        costPerWeekUSD: 370,
        amenities: ['WiFi', 'Laundry', 'Meals provided', 'Tutoring', 'Sports', 'Music rooms'],
        description: 'A residential college providing academic support, meals, and a vibrant student community.',
        capacity: 350,
      },
      {
        name: 'UniLodge on Swanston',
        type: 'apartments',
        costPerWeekUSD: 300,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Gym', 'Study rooms', 'Games room'],
        description: 'Modern student apartment complex located on Swanston Street, close to the main campus.',
        capacity: 600,
      },
    ],
  },

  // 10. University of British Columbia
  {
    name: 'University of British Columbia',
    slug: 'university-of-british-columbia',
    country: 'Canada',
    city: 'Vancouver',
    type: 'public',
    foundedYear: 1908,
    studentCount: 68000,
    internationalStudents: 18000,
    website: 'https://www.ubc.ca',
    description: 'UBC is one of Canada\'s top three universities, renowned for its stunning campus, research excellence, and strong programmes in forestry, earth sciences, and environmental studies.',
    rankingQS: 34,
    rankingTHE: 41,
    acceptanceRate: 46.0,
    faculties: [
      {
        name: 'Faculty of Applied Science (Engineering)',
        description: 'One of Canada\'s largest and most respected engineering faculties.',
        departments: ['Department of Electrical and Computer Engineering', 'Department of Mechanical Engineering', 'Department of Civil Engineering'],
        courses: [
          {
            name: 'Bachelor of Applied Science (Engineering)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 40000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 54200,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'High school GPA 85%+', 'Pre-calculus and Chemistry', 'Supplementary application'],
            description: 'Comprehensive engineering programme with 14 specializations including biomedical, environmental, and mining engineering.',
          },
          {
            name: 'Master of Engineering (MEng)',
            level: 'postgraduate',
            duration: '1-2 years',
            tuitionFeeUSD: 32000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 43400,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in engineering', 'GPA B+ equivalent'],
            description: 'Professional engineering master\'s with project-based learning and industry focus.',
          },
          {
            name: 'PhD in Engineering',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'CAD',
            tuitionFeeLocal: null,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 6.5', 'Master\'s degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research across all engineering disciplines.',
          },
          {
            name: 'Master of Data Science',
            level: 'postgraduate',
            duration: '10 months',
            tuitionFeeUSD: 38000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 51500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree', 'Programming experience', 'Statistics prerequisite'],
            description: 'Intensive professional master\'s in data science covering statistical modelling, machine learning, and data engineering.',
          },
        ],
      },
      {
        name: 'Faculty of Science',
        description: 'A leading science faculty with particular strengths in oceanography, biodiversity, and climate science.',
        departments: ['Department of Physics and Astronomy', 'Department of Chemistry', 'Department of Earth, Ocean and Atmospheric Sciences'],
        courses: [
          {
            name: 'Bachelor of Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 38000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 51500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'High school GPA 85%+', 'Mathematics and two sciences'],
            description: 'Flexible science degree with over 20 majors including biology, chemistry, physics, and data science.',
          },
          {
            name: 'Master of Science in Computer Science',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 28000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 38000,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in CS', 'GPA B+ equivalent', 'Research interest'],
            description: 'Research-oriented master\'s with thesis option in areas like AI, HCI, and systems.',
          },
          {
            name: 'PhD in Biology',
            level: 'phd',
            duration: '4-5 years',
            tuitionFeeUSD: null,
            localCurrency: 'CAD',
            tuitionFeeLocal: null,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 6.5', 'Master\'s degree in biology', 'Research proposal'],
            description: 'Fully funded doctoral research in biodiversity, ecology, genetics, and marine biology.',
          },
        ],
      },
      {
        name: 'Sauder School of Business',
        description: 'One of Canada\'s top business schools, known for its strength in international business and entrepreneurship.',
        departments: ['Finance Division', 'Marketing and Behavioural Science Division', 'Strategy and Business Ethics Division'],
        courses: [
          {
            name: 'Bachelor of Commerce (BCom)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 41000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 55600,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'High school GPA 90%+', 'Mathematics prerequisite', 'Supplementary application'],
            description: 'Comprehensive business degree with 10 specializations including finance, marketing, and real estate.',
          },
          {
            name: 'Master of Business Administration (MBA)',
            level: 'postgraduate',
            duration: '16 months',
            tuitionFeeUSD: 62000,
            localCurrency: 'CAD',
            tuitionFeeLocal: 84000,
            intakeMonths: ['August'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'GMAT/GRE', '3+ years work experience'],
            description: 'Intensive MBA with integrated career services, global immersion, and sustainability focus.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'UBC International Student Award',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 20000,
        eligibility: ['International student', 'Outstanding academic achievement', 'Entering undergraduate program'],
        deadline: 'December',
        description: 'Merit-based tuition scholarship for exceptional international undergraduate students.',
        website: 'https://you.ubc.ca/financial-planning/scholarships-awards/',
      },
      {
        name: 'UBC Graduate Fellowship',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 18000,
        eligibility: ['Domestic or international student', 'Outstanding academic record', 'Entering a graduate program'],
        deadline: 'January',
        description: 'Merit-based fellowship for graduate students across all disciplines.',
        website: 'https://www.grad.ubc.ca/prospective-students/scholarships-awards-funding',
      },
      {
        name: 'Canada Graduate Scholarships - Master\'s (CGS M)',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 14000,
        eligibility: ['Canadian citizen or permanent resident', 'High academic achievement', 'Research potential'],
        deadline: 'December',
        description: 'Federal government scholarship supporting high-calibre students in master\'s programs.',
        website: 'https://www.nserc-crsng.gc.ca/',
      },
    ],
    accommodations: [
      {
        name: 'UBC Vancouver - Place Vanier Residence',
        type: 'halls',
        costPerWeekUSD: 280,
        amenities: ['WiFi', 'Laundry', 'Meal plan', 'Common rooms', 'Gym access', 'Academic support'],
        description: 'First-year residence complex with 1,600 beds, located on the beautiful UBC Vancouver campus.',
        capacity: 1600,
      },
      {
        name: 'UBC Graduate Student Housing (St. John\'s College)',
        type: 'halls',
        costPerWeekUSD: 260,
        amenities: ['WiFi', 'Laundry', 'Meals available', 'Common room', 'Events', 'International community'],
        description: 'Graduate residential college fostering an international community of scholars with social and academic events.',
        capacity: 600,
      },
    ],
  },

  // 11. University of Edinburgh
  {
    name: 'University of Edinburgh',
    slug: 'university-of-edinburgh',
    country: 'United Kingdom',
    city: 'Edinburgh',
    type: 'public',
    foundedYear: 1583,
    studentCount: 44000,
    internationalStudents: 15500,
    website: 'https://www.ed.ac.uk',
    description: 'The University of Edinburgh is one of the world\'s most prestigious universities, known for its research excellence across medicine, informatics, and the humanities. It is a member of the Russell Group.',
    rankingQS: 22,
    rankingTHE: 30,
    acceptanceRate: 30.0,
    faculties: [
      {
        name: 'School of Informatics',
        description: 'One of the largest and most respected computer science departments in Europe.',
        departments: ['Institute for Language, Cognition and Computation', 'Institute for Adaptive and Neural Computation', 'Institute of Perception, Action and Behaviour'],
        courses: [
          {
            name: 'BSc in Computer Science',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 32000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 26800,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'A*AA at A-Level including Mathematics', 'Strong reference'],
            description: 'Comprehensive computer science degree covering algorithms, AI, systems, and theoretical computer science.',
          },
          {
            name: 'MSc in Artificial Intelligence',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 40000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 33500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'First or upper second-class degree in informatics or related field', 'Programming proficiency'],
            description: 'One of the world\'s oldest and most respected AI master\'s programmes, covering machine learning, robotics, and NLP.',
          },
          {
            name: 'PhD in Informatics',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 28000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 23500,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Strong master\'s degree', 'Research proposal', 'Supervisor agreement'],
            description: 'Doctoral research in AI, computational biology, cryptography, or robotics at one of Europe\'s top informatics schools.',
          },
          {
            name: 'MSc in Data Science',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 40000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 33500,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'Strong degree with quantitative background', 'Programming experience'],
            description: 'Interdisciplinary data science programme combining statistics, machine learning, and data engineering.',
          },
        ],
      },
      {
        name: 'Edinburgh Medical School',
        description: 'One of the UK\'s top medical schools, with a strong emphasis on research-led teaching.',
        departments: ['Department of Clinical Neurosciences', 'Centre for Inflammation Research', 'Usher Institute of Population Health Sciences'],
        courses: [
          {
            name: 'MBChB Medicine',
            level: 'undergraduate',
            duration: '5 years',
            tuitionFeeUSD: 38000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 31800,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.5', 'A*AA at A-Level including Chemistry and Biology', 'UCAT required'],
            description: 'Edinburgh\'s medical degree combining clinical skills with research-informed teaching.',
          },
          {
            name: 'MSc by Research in Clinical Sciences',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 36000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 30100,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Strong degree in medicine or biomedical sciences', 'Research proposal'],
            description: 'Research-focused master\'s preparing students for doctoral study in clinical sciences.',
          },
          {
            name: 'PhD in Molecular Medicine',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: 28000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 23500,
            intakeMonths: ['September', 'January'],
            entryRequirements: ['IELTS 7.0', 'Strong master\'s degree', 'Research experience'],
            description: 'Doctoral research in molecular mechanisms of disease at Edinburgh\'s world-class medical research facilities.',
          },
        ],
      },
      {
        name: 'Edinburgh Business School',
        description: 'A research-led business school with strengths in finance, accounting, and entrepreneurship.',
        departments: ['Department of Accounting and Finance', 'Department of Management', 'Department of Business Economics'],
        courses: [
          {
            name: 'MA (Hons) Business Studies',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 28000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 23400,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 6.5', 'AAB at A-Level', 'Strong GCSEs including Mathematics'],
            description: 'Flexible business degree with options to study abroad and undertake industry placements.',
          },
          {
            name: 'MSc in Finance',
            level: 'postgraduate',
            duration: '1 year',
            tuitionFeeUSD: 38000,
            localCurrency: 'GBP',
            tuitionFeeLocal: 31800,
            intakeMonths: ['September'],
            entryRequirements: ['IELTS 7.0', 'First or upper second-class degree', 'Strong quantitative background'],
            description: 'Specialized finance master\'s covering corporate finance, investment management, and financial technology.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Edinburgh Global Research Scholarship',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 15000,
        eligibility: ['International student', 'Outstanding academic record', 'Applying for PhD research'],
        deadline: 'February',
        description: 'Covers the difference between home and international tuition fees for outstanding PhD applicants.',
        website: 'https://www.ed.ac.uk/student-funding',
      },
      {
        name: 'Edinburgh Global Master\'s Scholarship',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 8000,
        eligibility: ['International student from eligible country', 'Outstanding academic record', 'Applying for on-campus master\'s'],
        deadline: 'March',
        description: 'Partial tuition fee scholarship for international master\'s students from specific countries.',
        website: 'https://www.ed.ac.uk/student-funding',
      },
      {
        name: 'Chevening Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 40000,
        eligibility: ['Citizenship of a Chevening-eligible country', 'Two years of work experience', 'Commitment to return home'],
        deadline: 'November',
        description: 'UK government scholarship for postgraduate study at Edinburgh.',
        website: 'https://www.chevening.org/',
      },
    ],
    accommodations: [
      {
        name: 'Pollock Halls of Residence',
        type: 'halls',
        costPerWeekUSD: 280,
        amenities: ['WiFi', 'Laundry', 'Catering options', 'Common room', 'Sports facilities', '24-hour security'],
        description: 'The main first-year student residence complex, set in beautiful grounds near Holyrood Park.',
        capacity: 2000,
      },
      {
        name: 'Edinburgh University Student Housing (Granton)',
        type: 'apartments',
        costPerWeekUSD: 250,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Furnished', 'Parking', 'Bike storage'],
        description: 'Self-catered apartment-style accommodation for returning and graduate students.',
        capacity: 400,
      },
    ],
  },

  // 12. University of Sydney
  {
    name: 'University of Sydney',
    slug: 'university-of-sydney',
    country: 'Australia',
    city: 'Sydney',
    type: 'public',
    foundedYear: 1850,
    studentCount: 63000,
    internationalStudents: 21000,
    website: 'https://www.sydney.edu.au',
    description: 'The University of Sydney is Australia\'s oldest university and a member of the Group of Eight. It is renowned for its research, teaching excellence, and iconic sandstone campus.',
    rankingQS: 19,
    rankingTHE: 54,
    acceptanceRate: 30.0,
    faculties: [
      {
        name: 'Faculty of Engineering',
        description: 'A leading engineering faculty with a strong focus on innovative research and industry engagement.',
        departments: ['School of Electrical and Information Engineering', 'School of Aerospace, Mechanical and Mechatronic Engineering', 'School of Civil Engineering'],
        courses: [
          {
            name: 'Bachelor of Engineering (Honours) (Software)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 35000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 53600,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent', 'Mathematics Advanced and Physics'],
            description: 'Accredited software engineering degree with industry projects and internship opportunities.',
          },
          {
            name: 'Master of Engineering (Software)',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 37000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 56700,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s in engineering or related', 'GPA 65%+ equivalent'],
            description: 'Advanced software engineering master\'s with specializations in AI, data engineering, and cybersecurity.',
          },
          {
            name: 'PhD in Engineering',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Honours or research master\'s', 'Research proposal', 'Supervisor agreement'],
            description: 'Fully funded doctoral research across all engineering disciplines.',
          },
          {
            name: 'Master of Data Science',
            level: 'postgraduate',
            duration: '1.5 years',
            tuitionFeeUSD: 38000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 58200,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree', 'Programming and statistics background'],
            description: 'Data science programme combining machine learning, statistics, and domain applications.',
          },
        ],
      },
      {
        name: 'Sydney Medical School',
        description: 'One of Australia\'s most prestigious medical schools, affiliated with leading Sydney hospitals.',
        departments: ['Central Clinical School', 'School of Public Health', 'School of Medical Sciences'],
        courses: [
          {
            name: 'Doctor of Medicine (MD)',
            level: 'undergraduate',
            duration: '4 years',
            tuitionFeeUSD: 55000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 84300,
            intakeMonths: ['February'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree', 'GAMSAT or MCAT', 'Prerequisite courses'],
            description: 'Graduate-entry medical programme with clinical placements at Sydney\'s top teaching hospitals.',
          },
          {
            name: 'Master of Public Health',
            level: 'postgraduate',
            duration: '1.5 years',
            tuitionFeeUSD: 33000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 50600,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Bachelor\'s degree in health or related', 'Relevant experience preferred'],
            description: 'Public health programme with strengths in epidemiology, health promotion, and global health.',
          },
          {
            name: 'PhD in Biomedical Sciences',
            level: 'phd',
            duration: '3-4 years',
            tuitionFeeUSD: null,
            localCurrency: 'AUD',
            tuitionFeeLocal: null,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'Honours or research master\'s', 'Research proposal'],
            description: 'Fully funded doctoral research in biomedical sciences at the Charles Perkins Centre and affiliated institutes.',
          },
        ],
      },
      {
        name: 'University of Sydney Business School',
        description: 'A leading Australian business school accredited by AACSB and AMBA.',
        departments: ['Discipline of Accounting', 'Discipline of Finance', 'Discipline of Strategy, Innovation and Entrepreneurship'],
        courses: [
          {
            name: 'Bachelor of Commerce',
            level: 'undergraduate',
            duration: '3 years',
            tuitionFeeUSD: 34000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 52100,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 6.5', 'ATAR 85+ or equivalent', 'Mathematics prerequisite'],
            description: 'Flexible commerce degree with majors in accounting, finance, marketing, and business analytics.',
          },
          {
            name: 'Master of Commerce',
            level: 'postgraduate',
            duration: '2 years',
            tuitionFeeUSD: 37000,
            localCurrency: 'AUD',
            tuitionFeeLocal: 56700,
            intakeMonths: ['February', 'July'],
            entryRequirements: ['IELTS 7.0', 'Bachelor\'s degree (any discipline)', 'GPA 65%+ equivalent'],
            description: 'Comprehensive business master\'s with 14 specialist majors including finance, data analytics, and innovation.',
          },
        ],
      },
    ],
    scholarships: [
      {
        name: 'Sydney Scholars Awards',
        type: 'merit',
        coverage: 'partial',
        amountUSD: 20000,
        eligibility: ['International student', 'Outstanding academic results', 'Applying for undergraduate study'],
        deadline: 'November',
        description: 'Merit-based scholarship for high-achieving international undergraduate students.',
        website: 'https://www.sydney.edu.au/scholarships/',
      },
      {
        name: 'Australia Awards Scholarship',
        type: 'merit',
        coverage: 'full',
        amountUSD: 45000,
        eligibility: ['Citizenship of eligible developing country', 'Leadership potential', 'Commitment to return home'],
        deadline: 'May',
        description: 'Australian government scholarship for students from developing countries.',
        website: 'https://australiaawards.gov.au/',
      },
      {
        name: 'University of Sydney International Research Scholarship (USydIS)',
        type: 'research',
        coverage: 'full',
        amountUSD: 35000,
        eligibility: ['International student', 'Research potential', 'Applying for PhD or MPhil'],
        deadline: 'October',
        description: 'Fully funded research scholarship covering tuition, stipend, and overseas student health cover.',
        website: 'https://www.sydney.edu.au/scholarships/',
      },
    ],
    accommodations: [
      {
        name: 'The University of Sydney (Wentworth Building)',
        type: 'halls',
        costPerWeekUSD: 340,
        amenities: ['WiFi', 'Laundry', 'Meals provided', 'Common room', 'Tutoring', 'Sports'],
        description: 'One of the university\'s traditional residential halls, offering a full collegiate experience with meals and academic support.',
        capacity: 500,
      },
      {
        name: 'UniLodge Darling Harbour',
        type: 'apartments',
        costPerWeekUSD: 320,
        amenities: ['WiFi', 'Laundry', 'Self-catering kitchen', 'Gym', 'Pool', 'Rooftop terrace'],
        description: 'Modern student apartments near Darling Harbour, a short commute to the main campus.',
        capacity: 700,
      },
    ],
  },
]

// ─── Seed Function ──────────────────────────────────────────────────────────

async function seed() {
  console.log('🌍 Starting university data seeding...')
  const currentYear = new Date().getFullYear()

  let uniCount = 0
  let facCount = 0
  let courseCount = 0
  let scholCount = 0
  let accomCount = 0
  let intakeCount = 0

  for (const u of universities) {
    // Upsert university
    const university = await db.university.upsert({
      where: { slug: u.slug },
      update: {
        name: u.name,
        country: u.country,
        city: u.city,
        type: u.type,
        foundedYear: u.foundedYear,
        studentCount: u.studentCount,
        internationalStudents: u.internationalStudents,
        website: u.website,
        description: u.description,
        rankingQS: u.rankingQS,
        rankingTHE: u.rankingTHE,
        acceptanceRate: u.acceptanceRate,
      },
      create: {
        name: u.name,
        slug: u.slug,
        country: u.country,
        city: u.city,
        type: u.type,
        foundedYear: u.foundedYear,
        studentCount: u.studentCount,
        internationalStudents: u.internationalStudents,
        website: u.website,
        description: u.description,
        rankingQS: u.rankingQS,
        rankingTHE: u.rankingTHE,
        acceptanceRate: u.acceptanceRate,
      },
    })
    uniCount++
    console.log(`  ✓ University: ${u.name}`)

    // Seed faculties and their courses
    for (const f of u.faculties) {
      // Find existing faculty or create new
      const existingFac = await db.universityFaculty.findFirst({
        where: { universityId: university.id, name: f.name },
      })

      const faculty = existingFac
        ? await db.universityFaculty.update({
            where: { id: existingFac.id },
            data: {
              description: f.description,
              departments: JSON.stringify(f.departments),
            },
          })
        : await db.universityFaculty.create({
            data: {
              universityId: university.id,
              name: f.name,
              description: f.description,
              departments: JSON.stringify(f.departments),
            },
          })
      facCount++
      console.log(`    ✓ Faculty: ${f.name}`)

      // Seed courses for this faculty
      for (const c of f.courses) {
        const existingCourse = await db.universityCourse.findFirst({
          where: { universityId: university.id, name: c.name, facultyName: f.name },
        })

        if (existingCourse) {
          await db.universityCourse.update({
            where: { id: existingCourse.id },
            data: {
              level: c.level,
              duration: c.duration,
              tuitionFeeUSD: c.tuitionFeeUSD,
              tuitionFeeLocal: c.tuitionFeeLocal,
              localCurrency: c.localCurrency,
              intakeMonths: JSON.stringify(c.intakeMonths),
              entryRequirements: JSON.stringify(c.entryRequirements),
              description: c.description,
            },
          })
        } else {
          await db.universityCourse.create({
            data: {
              universityId: university.id,
              facultyName: f.name,
              name: c.name,
              slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
              level: c.level,
              duration: c.duration,
              tuitionFeeUSD: c.tuitionFeeUSD,
              tuitionFeeLocal: c.tuitionFeeLocal,
              localCurrency: c.localCurrency,
              intakeMonths: JSON.stringify(c.intakeMonths),
              entryRequirements: JSON.stringify(c.entryRequirements),
              description: c.description,
            },
          })
        }
        courseCount++
      }
    }

    // Seed scholarships
    for (const s of u.scholarships) {
      const existingSchol = await db.universityScholarship.findFirst({
        where: { universityId: university.id, name: s.name },
      })

      if (existingSchol) {
        await db.universityScholarship.update({
          where: { id: existingSchol.id },
          data: {
            type: s.type,
            coverage: s.coverage,
            amountUSD: s.amountUSD,
            eligibility: JSON.stringify(s.eligibility),
            deadline: s.deadline,
            description: s.description,
            website: s.website,
          },
        })
      } else {
        await db.universityScholarship.create({
          data: {
            universityId: university.id,
            name: s.name,
            type: s.type,
            coverage: s.coverage,
            amountUSD: s.amountUSD,
            eligibility: JSON.stringify(s.eligibility),
            deadline: s.deadline,
            description: s.description,
            website: s.website,
          },
        })
      }
      scholCount++
      console.log(`    ✓ Scholarship: ${s.name}`)
    }

    // Seed accommodations
    for (const a of u.accommodations) {
      const existingAccom = await db.universityAccommodation.findFirst({
        where: { universityId: university.id, name: a.name },
      })

      if (existingAccom) {
        await db.universityAccommodation.update({
          where: { id: existingAccom.id },
          data: {
            type: a.type,
            costPerWeekUSD: a.costPerWeekUSD,
            amenities: JSON.stringify(a.amenities),
            description: a.description,
            capacity: a.capacity,
          },
        })
      } else {
        await db.universityAccommodation.create({
          data: {
            universityId: university.id,
            name: a.name,
            type: a.type,
            costPerWeekUSD: a.costPerWeekUSD,
            amenities: JSON.stringify(a.amenities),
            description: a.description,
            capacity: a.capacity,
          },
        })
      }
      accomCount++
      console.log(`    ✓ Accommodation: ${a.name}`)
    }

    // Seed intakes (Fall and Spring for current and next year)
    const intakes = [
      { season: 'Fall', month: u.country === 'Australia' ? 'February' : u.country === 'Singapore' ? 'August' : 'September', deadline: u.country === 'Australia' ? 'November of previous year' : u.country === 'Singapore' ? 'March' : 'January', status: currentYear >= new Date().getFullYear() ? 'open' : 'closed' },
      { season: 'Spring', month: u.country === 'Australia' ? 'July' : u.country === 'Singapore' ? 'January' : 'January', deadline: u.country === 'Australia' ? 'May' : u.country === 'Singapore' ? 'September' : 'October', status: 'upcoming' },
    ]

    for (const intake of intakes) {
      const existingIntake = await db.universityIntake.findFirst({
        where: { universityId: university.id, season: intake.season, month: intake.month, year: currentYear + 1 },
      })

      if (!existingIntake) {
        await db.universityIntake.create({
          data: {
            universityId: university.id,
            season: intake.season,
            month: intake.month,
            year: currentYear + 1,
            deadline: intake.deadline,
            status: intake.season === 'Fall' ? 'open' : 'upcoming',
          },
        })
        intakeCount++
      }
    }

    // Also seed current year intakes
    for (const intake of intakes) {
      const existingIntake = await db.universityIntake.findFirst({
        where: { universityId: university.id, season: intake.season, month: intake.month, year: currentYear },
      })

      if (!existingIntake) {
        await db.universityIntake.create({
          data: {
            universityId: university.id,
            season: intake.season,
            month: intake.month,
            year: currentYear,
            deadline: intake.deadline,
            status: intake.season === 'Fall' ? 'closed' : 'open',
          },
        })
        intakeCount++
      }
    }

    console.log(`    ✓ Intakes seeded for ${u.name}`)
  }

  console.log('\n📊 Seed Summary:')
  console.log(`  Universities:      ${uniCount}`)
  console.log(`  Faculties:         ${facCount}`)
  console.log(`  Courses:           ${courseCount}`)
  console.log(`  Scholarships:      ${scholCount}`)
  console.log(`  Accommodations:    ${accomCount}`)
  console.log(`  Intakes:           ${intakeCount}`)
  console.log('\n✅ University data seeding complete!')
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
