/**
 * ALO Labs AgentOS — brand tokens.
 *
 * The single source of truth for everything in the brand & system guideline:
 * the palette and its gradients, the usage rules, the two typefaces, the
 * corporate contact block on the letterhead, the system flow, the mobile
 * command-centre tiles, and the company statistics.
 *
 * Surfaces (letterhead, invoice, brand book, panels) must read from here rather
 * than re-typing hex values, so a brand change is a one-file edit.
 */

// ─── Palette ─────────────────────────────────────────────────────────────────

export const BRAND = {
  /** Primary Brand — action, important, warning, highlight, primary buttons. */
  orange: '#FF6A00',
  /** Lighter stop of the orange gradient. */
  orangeLight: '#FF8A2B',
  /** System & Trust — trust, system, backgrounds, navigation, secondary buttons. */
  blue: '#003ABC',
  /**
   * Alternate blue carried by the second revision of the guideline sheet.
   * Kept as a named token so older collateral can be matched on request.
   */
  blueAlt: '#0D47A1',
  /** Deep end of the blue gradient. */
  blueDeep: '#001C6B',
  /** Bright end of the blue gradient. */
  blueLight: '#0077FF',
  /** Clean UI, cards, content area. */
  white: '#FFFFFF',
  /** Text, borders, disabled. */
  gray: '#64748B',
  graySoft: '#94A3B8',
  grayLine: '#E2E8F0',
  /** App background behind cards. */
  canvas: '#F8FAFC',
  ink: '#1E293B',
  /** Dark ground for the deep-blue placements (mobile shell, dark lockups). */
  navy: '#0A1B3D',
  /** Light blue tints used by the mobile surface and tinted rows. */
  tint: '#E8EFFB',
  tintLine: '#D7E2F6',
  tintSoft: '#F4F7FC',
} as const

export const GRADIENTS = {
  orange: { from: BRAND.orange, to: '#FFB300', css: 'linear-gradient(90deg, #FF6A00 0%, #FFB300 100%)' },
  blue: { from: BRAND.blue, to: BRAND.blueLight, css: 'linear-gradient(90deg, #003ABC 0%, #0077FF 100%)' },
  /** The mark's folded ribbon uses the diagonal form of the blue gradient. */
  ribbon: { from: BRAND.blueLight, to: BRAND.blueDeep, css: 'linear-gradient(135deg, #0077FF 0%, #001C6B 100%)' },
} as const

export interface UsageRule {
  swatch: string
  label: string
  detail: string
}

/** "USAGE GUIDE" block from the brand sheet. */
export const USAGE_RULES: UsageRule[] = [
  {
    swatch: BRAND.orange,
    label: 'Orange',
    detail: 'Action, important, warning, highlight, primary buttons.',
  },
  {
    swatch: BRAND.blue,
    label: 'Blue',
    detail: 'Trust, system, backgrounds, navigation, secondary buttons.',
  },
  {
    swatch: BRAND.white,
    label: 'White',
    detail: 'Clean UI, cards, content area.',
  },
  {
    swatch: '#CBD5E1',
    label: 'Gray',
    detail: 'Text, borders, disabled.',
  },
]

/** "BRAND USAGE RULES" checklist from the guideline sheet. */
export const BRAND_RULES: string[] = [
  'Always use the official logo.',
  'Maintain color consistency.',
  'Use orange for action, blue for system.',
  'Do not alter logo proportions.',
  'Keep UI clean, modern and professional.',
  'Ensure mobile-first responsive design.',
  'Follow security and approval protocols.',
  'All communications should reflect the ALO Labs brand.',
]

// ─── Typography ──────────────────────────────────────────────────────────────

export const BRAND_FONTS = {
  /** Primary font. */
  primary: {
    name: 'Inter',
    stack: "'Inter', 'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    cssVar: '--font-brand',
    use: 'Body copy, labels, tables, UI chrome.',
  },
  /** Secondary font. */
  secondary: {
    name: 'Poppins',
    stack: "'Poppins', 'Inter', ui-sans-serif, system-ui, sans-serif",
    cssVar: '--font-brand-display',
    use: 'Wordmark, headings, numerals that carry weight.',
  },
  specimen: 'Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz 0123456789',
} as const

// ─── Corporate identity ──────────────────────────────────────────────────────

export const COMPANY = {
  legalName: 'ALO Labs',
  product: 'AgentOS',
  tagline: 'AI Agent Operating System',
  /** Line one of the registered address, as printed on the letterhead. */
  entity: 'SOLE MBR',
  address: ['117 S LEXINGTON ST STE 100', 'HARRISONVILLE, MO 64701'],
  addressOneLine: '117 S Lexington St Ste 100, Harrisonville, MO 64701',
  phone: '+1 (347) 433 1200',
  phoneHref: 'tel:+13474331200',
  website: 'www.alolabs.net',
  websiteHref: 'https://www.alolabs.net',
  email: 'info@alolabs.net',
  emailHref: 'mailto:info@alolabs.net',
  /** Footer strip of the guideline sheet. */
  domains: [
    { label: 'Domain', value: 'alolabs.net' },
    { label: 'Command Center', value: 'command.alolabs.net' },
    { label: 'AgentOS Dashboard', value: 'agents.alolabs.net' },
    { label: 'API', value: 'api.alolabs.net' },
  ],
  promise: 'Secure. Smart. Scalable. Built for the Future.',
  promiseShort: 'Building the Future with AI',
} as const

/** "1 Command Center · 1020 AI Agents · 100+ Departments · Unlimited Possibilities" */
export const HEADLINE_STATS = [
  { value: '1', label: 'Command Center' },
  { value: '1020', label: 'AI Agents' },
  { value: '100+', label: 'Departments' },
  { value: 'Unlimited', label: 'Possibilities' },
] as const

// ─── System flow (orange & blue) ─────────────────────────────────────────────

export interface FlowNode {
  id: string
  label: string
  /** orange = action/highlight, blue = system, outline = branch */
  tone: 'orange' | 'blue' | 'outline'
  note?: string
  /** Rendered as a small chip inside a row of siblings. */
  branch?: boolean
}

export const SYSTEM_FLOW: FlowNode[] = [
  { id: 'admin', label: 'YOU (SUPER ADMIN)', tone: 'orange' },
  { id: 'command', label: 'ALO COMMAND CENTER', tone: 'blue' },
  { id: 'master', label: 'MASTER ROUTER', tone: 'blue' },
  { id: 'department', label: 'DEPARTMENT ROUTER', tone: 'blue' },
  { id: 'website', label: 'WEBSITE DEPARTMENT', tone: 'blue', branch: true },
  { id: 'crm', label: 'CRM DEPARTMENT', tone: 'blue', branch: true },
  { id: 'marketing', label: 'MARKETING DEPARTMENT', tone: 'blue', branch: true },
  { id: 'student', label: 'STUDENT OPS DEPARTMENT', tone: 'blue', branch: true },
  { id: 'finance', label: 'FINANCE DEPARTMENT', tone: 'blue', branch: true },
  { id: 'agents', label: '1020 AI AGENTS', tone: 'orange' },
  { id: 'memory', label: 'MEMORY SYSTEM', tone: 'blue' },
  { id: 'rag', label: 'HYBRID RAG ENGINE', tone: 'orange' },
  { id: 'classic', label: 'CLASSIC RAG', tone: 'outline', branch: true },
  { id: 'graph', label: 'GRAPH RAG', tone: 'outline', branch: true },
  { id: 'agentic', label: 'AGENTIC RAG', tone: 'outline', branch: true },
  { id: 'approval', label: 'APPROVAL ENGINE', tone: 'blue' },
  { id: 'execution', label: 'EXECUTION & AUTOMATION', tone: 'orange' },
  { id: 'result', label: 'RESULT / REPORT / ACTION', tone: 'blue' },
]

// ─── Mobile command centre ───────────────────────────────────────────────────

export const COMMAND_TILES = [
  'Dashboard', 'Agents', 'Tasks',
  'Approvals', 'Reports', 'Knowledge',
  'Students', 'Partners', 'Employees',
  'Marketing', 'Finance', 'Settings',
] as const

export const COMMAND_TAB_BAR = ['Home', 'Chat', 'Notifications', 'Profile'] as const

// ─── Letterhead geometry ─────────────────────────────────────────────────────

export const LETTERHEAD = {
  /** A4 in millimetres — the print contract. */
  widthMm: 210,
  heightMm: 297,
  /** Frame: orange rule outside, blue rule inside, both with rounded corners. */
  frame: { orange: BRAND.orange, blue: BRAND.blue, orangeWidth: 10, blueWidth: 16 },
  /** Clear space around the logo, expressed as a fraction of the mark size. */
  logoClearSpace: 0.25,
} as const

/** Next-step guidance for anyone producing collateral. */
export const BRAND_VERSION = {
  label: 'Final Brand & System Guideline',
  revision: '2026 — orange/blue master',
  marks: ['Primary logo (horizontal)', 'Stacked logo', 'Icon (symbol only)', 'App icon', 'Wordmark'],
} as const
