#!/usr/bin/env python3
"""Generate comprehensive code audit report body PDF using ReportLab."""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, Frame, PageTemplate
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ─── Font Registration ───
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('Inter', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Inter-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('Inter', normal='Inter', bold='Inter-Bold')

# ─── Color Palette ───
PAGE_BG       = colors.HexColor('#f7f6f6')
SECTION_BG    = colors.HexColor('#f0f0ef')
CARD_BG       = colors.HexColor('#eeece8')
TABLE_STRIPE  = colors.HexColor('#f3f2f1')
HEADER_FILL   = colors.HexColor('#6e6444')
COVER_BLOCK   = colors.HexColor('#696046')
BORDER        = colors.HexColor('#d6d2c5')
ICON          = colors.HexColor('#7b6e45')
ACCENT        = colors.HexColor('#866f2c')
TEXT_PRIMARY   = colors.HexColor('#252421')
TEXT_MUTED     = colors.HexColor('#86847c')
SEM_SUCCESS   = colors.HexColor('#367e4e')
SEM_WARNING   = colors.HexColor('#937944')
SEM_ERROR     = colors.HexColor('#a1473e')
SEM_INFO      = colors.HexColor('#466c91')

# ─── Page Dimensions ───
PAGE_W, PAGE_H = A4  # 595.28 x 841.89 pt
MARGIN_TOP = 60
MARGIN_BOTTOM = 50
MARGIN_LEFT = 60
MARGIN_RIGHT = 60
CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT  # ~475pt

# ─── Styles ───
styles = getSampleStyleSheet()

style_h1 = ParagraphStyle(
    'AuditH1', parent=styles['Normal'],
    fontName='Inter-Bold', fontSize=20, leading=26,
    textColor=HEADER_FILL, spaceBefore=24, spaceAfter=10,
)
style_h2 = ParagraphStyle(
    'AuditH2', parent=styles['Normal'],
    fontName='Inter-Bold', fontSize=16, leading=21,
    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=8,
)
style_h3 = ParagraphStyle(
    'AuditH3', parent=styles['Normal'],
    fontName='Inter-Bold', fontSize=13, leading=17,
    textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=6,
)
style_body = ParagraphStyle(
    'AuditBody', parent=styles['Normal'],
    fontName='Inter', fontSize=10, leading=14,
    textColor=TEXT_PRIMARY, spaceBefore=3, spaceAfter=3,
    alignment=TA_JUSTIFY,
)
style_body_small = ParagraphStyle(
    'AuditBodySmall', parent=style_body,
    fontSize=9, leading=12,
)
style_muted = ParagraphStyle(
    'AuditMuted', parent=style_body,
    textColor=TEXT_MUTED,
)
style_toc_h1 = ParagraphStyle(
    'TOCH1', parent=styles['Normal'],
    fontName='Inter-Bold', fontSize=12, leading=18,
    leftIndent=0, textColor=TEXT_PRIMARY,
)
style_toc_h2 = ParagraphStyle(
    'TOCH2', parent=styles['Normal'],
    fontName='Inter', fontSize=10, leading=16,
    leftIndent=20, textColor=TEXT_MUTED,
)

# ─── Helpers ───
def hr():
    """Horizontal rule separator."""
    return HRFlowable(
        width="100%", thickness=0.5, color=BORDER,
        spaceBefore=6, spaceAfter=6,
    )

def severity_color(level):
    return {
        'CRITICAL': SEM_ERROR,
        'HIGH': SEM_WARNING,
        'MEDIUM': ACCENT,
        'LOW': SEM_INFO,
    }.get(level, TEXT_MUTED)

def severity_badge(level):
    """Return a colored paragraph for severity badge."""
    c = severity_color(level)
    r, g, b = int(c.red*255), int(c.green*255), int(c.blue*255)
    hex_c = f'#{r:02x}{g:02x}{b:02x}'
    return Paragraph(
        f'<font color="#ffffff"><b>{level}</b></font>',
        ParagraphStyle('badge', parent=style_body, fontSize=8, leading=10,
                       alignment=TA_CENTER, backColor=c, borderPadding=3)
    )

def finding_table(findings, col_widths=None):
    """Create a findings table with ID, Finding, Severity, Files columns."""
    if col_widths is None:
        col_widths = [35, CONTENT_W - 180, 60, 80]

    header = [
        Paragraph('<font color="#ffffff"><b>ID</b></font>',
                  ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER)),
        Paragraph('<font color="#ffffff"><b>Finding</b></font>',
                  ParagraphStyle('th', parent=style_body, fontSize=9)),
        Paragraph('<font color="#ffffff"><b>Severity</b></font>',
                  ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER)),
        Paragraph('<font color="#ffffff"><b>File(s)</b></font>',
                  ParagraphStyle('th', parent=style_body, fontSize=9)),
    ]
    data = [header]
    for fid, desc, sev, files in findings:
        data.append([
            Paragraph(f'<b>{fid}</b>', ParagraphStyle('td', parent=style_body, fontSize=9, alignment=TA_CENTER)),
            Paragraph(desc, ParagraphStyle('td', parent=style_body, fontSize=9, leading=12)),
            severity_badge(sev),
            Paragraph(f'<font color="#86847c"><i>{files}</i></font>',
                      ParagraphStyle('td', parent=style_body, fontSize=8, leading=11)),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Inter-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    # Stripe odd rows
    for i in range(2, len(data), 2):
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
    t.setStyle(TableStyle(style_cmds))
    return t


# ─── TocDocTemplate ───
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        """Register TOC entries with clickable links."""
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            text = flowable.getPlainText()
            if style in ('AuditH1', 'AuditH2'):
                # Use deterministic key based on text content
                key = 'bm_' + text.replace(' ', '_').replace('(', '').replace(')', '').replace('.', '')[:40]
                self.canv.bookmarkPage(key)
                level = 0 if style == 'AuditH1' else 1
                self.notify('TOCEntry', (level, text, self.page, key))


def header_footer(canvas, doc):
    """Draw page number footer and thin border lines."""
    canvas.saveState()
    # Page number
    page_num = canvas.getPageNumber()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawCentredString(PAGE_W / 2, 28, f"Page {page_num}")
    # Top border line
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_LEFT, PAGE_H - 40, PAGE_W - MARGIN_RIGHT, PAGE_H - 40)
    # Footer line
    canvas.line(MARGIN_LEFT, 42, PAGE_W - MARGIN_RIGHT, 42)
    canvas.restoreState()


# ─── Build Story ───
def build_story():
    story = []

    # ────────────── TOC Page ──────────────
    story.append(Paragraph('Table of Contents', style_h1))
    story.append(Spacer(1, 12))

    toc = TableOfContents()
    toc.levelStyles = [style_toc_h1, style_toc_h2]
    story.append(toc)
    story.append(PageBreak())

    # ══════════════════════════════════════
    # CHAPTER 1: Executive Summary
    # ══════════════════════════════════════
    story.append(Paragraph('1. Executive Summary', style_h1))
    story.append(hr())
    story.append(Paragraph(
        'This report presents a comprehensive security and code quality audit of three software projects '
        'developed under the ALO Labs umbrella. The audit was conducted in July 2025 and covers source code '
        'analysis, architectural review, dependency assessment, and security vulnerability identification. '
        'All three projects were found to be in early prototype or development stages with significant '
        'security gaps that must be addressed before any production deployment.',
        style_body
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        'The three audited projects are: <b>lab2.zip</b> (ALO Labs Command Center), <b>lab.zip</b> (CRM Pro), '
        'and <b>alo-labs-avatar-video-studio-ai-agent.zip</b> (ALO Labs Monorepo). Across all three codebases, '
        'the audit identified <b>11 Critical</b>, <b>21 High</b>, <b>30 Medium</b>, and multiple Low severity findings.',
        style_body
    ))
    story.append(Spacer(1, 12))

    # Summary table
    summary_data = [
        [Paragraph('<font color="#ffffff"><b>Project</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>Type</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>Risk Score</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>Critical</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>High</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>Medium</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white))],
        [Paragraph('<b>lab2.zip</b>', style_body),
         Paragraph('Next.js 16<br/>Command Center', style_body_small),
         Paragraph('<b>7.0 / 10</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>3</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>7</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>8</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER))],
        [Paragraph('<b>lab.zip</b>', style_body),
         Paragraph('Next.js 16<br/>CRM Pro', style_body_small),
         Paragraph('<b>7.5 / 10</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>4</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>7</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>12</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER))],
        [Paragraph('<b>alo-labs-monorepo</b>', style_body),
         Paragraph('Vite+Express<br/>Monorepo', style_body_small),
         Paragraph('<b>8.2 / 10</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>4</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>7</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>10</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER))],
    ]
    sw = [80, 85, 65, 55, 50, 50]
    st = Table(summary_data, colWidths=sw, repeatRows=1)
    st_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_STRIPE),
    ]
    st.setStyle(TableStyle(st_cmds))
    story.append(st)

    # ══════════════════════════════════════
    # CHAPTER 2: Project 1 - lab2.zip
    # ══════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph('2. Project 1: lab2.zip - ALO Labs Command Center', style_h1))
    story.append(hr())

    story.append(Paragraph('2.1 Project Overview', style_h2))
    story.append(Paragraph(
        'lab2.zip contains a <b>Next.js 16</b> application serving as the ALO Labs Command Center - a '
        'multi-tenant AI command center with 13 pages and 107 source files. The application features AI agent '
        'management, clearance-level based access control (client-side only), Prisma ORM integration, and '
        'Tailwind CSS styling. The project demonstrates significant feature scope but critically lacks server-side '
        'security controls.',
        style_body
    ))

    story.append(Paragraph('2.2 Critical Findings', style_h2))
    story.append(finding_table([
        ('C-01', 'Unauthenticated LLM Proxy - /api/agentos endpoint invokes paid LLM services with zero authentication. Any network-accessible user can send requests and incur costs.', 'CRITICAL', 'app/api/agentos/route.ts'),
        ('C-02', 'No Authentication Middleware - no middleware.ts exists. Authentication is implemented as a client-side boolean toggle only, trivially bypassable.', 'CRITICAL', '(missing) middleware.ts'),
        ('C-03', '.env file with database URL committed to the project directory, exposing internal database connection details.', 'CRITICAL', '.env'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('2.3 High Severity Findings', style_h2))
    story.append(finding_table([
        ('H-01', 'TypeScript build errors are silently ignored via ignoreBuildErrors: true in next.config.js, masking real type errors.', 'HIGH', 'next.config.mjs'),
        ('H-02', 'React Strict Mode is disabled (reactStrictMode: false), removing development-time warnings and double-rendering checks.', 'HIGH', 'next.config.mjs'),
        ('H-03', 'noImplicitAny: false in tsconfig.json allows implicit any types, defeating TypeScript\'s type safety.', 'HIGH', 'tsconfig.json'),
        ('H-04', 'Prisma Client is instantiated without a corresponding schema.prisma file, suggesting incomplete or broken database setup.', 'HIGH', 'lib/prisma.ts'),
        ('H-05', 'Conflicting type definitions for ClearanceLevel - defined in multiple files with incompatible values.', 'HIGH', 'types/, lib/auth-context.tsx'),
        ('H-06', 'Entire components/alo/modules/ directory is dead code - 14 files with broken imports that cannot resolve.', 'HIGH', 'components/alo/modules/'),
        ('H-07', 'Dynamic Tailwind classes (text-${n.tone}-500) will be purged at build time, causing runtime styling failures.', 'HIGH', 'components/agent/AgentCard.tsx'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('2.4 Medium Severity Findings', style_h2))
    story.append(finding_table([
        ('M-01', 'Fake authentication - login is purely client-side with a setTimeout to simulate delay; no server-side verification.', 'MEDIUM', 'lib/auth-context.tsx'),
        ('M-02', 'Raw LLM output is returned directly to the client without sanitization or validation, enabling potential injection.', 'MEDIUM', 'app/api/agentos/route.ts'),
        ('M-03', 'No input length validation on the Agentos API - arbitrarily large payloads can be sent to the LLM endpoint.', 'MEDIUM', 'app/api/agentos/route.ts'),
        ('M-04', 'No rate limiting on any API endpoint, allowing abuse and potential denial-of-service.', 'MEDIUM', 'app/api/'),
        ('M-05', '15+ unused dependencies including dnd-kit, react-hook-form, next-auth, next-intl, increasing attack surface.', 'MEDIUM', 'package.json'),
        ('M-06', 'Duplicate Toaster components exist in the codebase with slightly different implementations.', 'MEDIUM', 'components/ui/toaster.tsx'),
        ('M-07', 'Inline style tag embedded directly in the create-agent page component instead of using CSS modules.', 'MEDIUM', 'app/(dashboard)/create-agent/page.tsx'),
        ('M-08', 'Hardcoded server IP address appears in multiple locations, preventing environment-based configuration.', 'MEDIUM', 'Multiple files'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('2.5 Low Severity Findings', style_h2))
    story.append(Paragraph(
        'Additional low-severity findings include: inconsistent file naming conventions, missing JSDoc comments on '
        'public APIs, inconsistent use of default exports vs named exports, large component files that should be '
        'split (several exceeding 300 lines), console.log statements left in production code, hardcoded color values '
        'instead of using the design token system, and missing loading/error states on several pages.',
        style_body
    ))

    # ══════════════════════════════════════
    # CHAPTER 3: Project 2 - lab.zip
    # ══════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph('3. Project 2: lab.zip - CRM Pro', style_h1))
    story.append(hr())

    story.append(Paragraph('3.1 Project Overview', style_h2))
    story.append(Paragraph(
        'lab.zip contains a <b>Next.js 16</b> CRM application with a separate Bun mini-service running on port 3001. '
        'The project includes 13 CRM panel components and uses Prisma as its ORM. The frontend makes API calls to '
        '/api/crm endpoints, but critical route handlers are missing, rendering core functionality non-functional '
        'in standalone deployment. The application has severe security deficiencies including wildcard CORS, '
        'no authentication, and raw SQL injection vectors.',
        style_body
    ))

    story.append(Paragraph('3.2 Critical Findings', style_h2))
    story.append(finding_table([
        ('C-01', 'Missing /api/crm route - the frontend calls /api/crm?r=... but no corresponding API route handler exists, making the app non-functional standalone.', 'CRITICAL', 'app/api/crm/ (missing)'),
        ('C-02', 'Zero authentication or authorization on all endpoints - any user can perform full CRUD operations on all data.', 'CRITICAL', 'app/api/'),
        ('C-03', 'Wildcard CORS configuration (Access-Control-Allow-Origin: *) allows any origin to make requests to the API.', 'CRITICAL', 'server.ts / Caddyfile'),
        ('C-04', 'Internal error details are leaked to clients - raw error objects and stack traces are returned in 500 responses.', 'CRITICAL', 'Multiple API routes'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('3.3 High Severity Findings', style_h2))
    story.append(finding_table([
        ('H-01', 'Broken CrmProvider component - permanently stuck on "Loading..." state due to missing API endpoint, blocking all CRM functionality.', 'HIGH', 'components/CrmProvider.tsx'),
        ('H-02', '$executeRawUnsafe with table name interpolation - user-controlled input flows directly into SQL queries, enabling SQL injection.', 'HIGH', 'lib/db.ts'),
        ('H-03', 'Caddyfile SSRF vulnerability via XTransformPort query parameter - allows server-side requests to arbitrary ports.', 'HIGH', 'Caddyfile'),
        ('H-04', 'Stale Agent API route references a non-existent Prisma model, causing runtime errors.', 'HIGH', 'app/api/agent/route.ts'),
        ('H-05', 'Massive dead code in app-store.ts - 164 lines of unused store definitions.', 'HIGH', 'stores/app-store.ts'),
        ('H-06', 'No input validation on any API endpoint - all data is accepted and processed without schema validation.', 'HIGH', 'app/api/'),
        ('H-07', 'TypeScript strictness and ESLint are effectively disabled - noStrict, no unused checks, no lint enforcement.', 'HIGH', 'tsconfig.json, .eslintrc'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('3.4 Medium Severity Findings', style_h2))
    story.append(finding_table([
        ('M-01', '15+ unused npm dependencies inflate bundle size and attack surface.', 'MEDIUM', 'package.json'),
        ('M-02', 'Prisma schema design issues - no unique constraints, tags stored as String instead of Json, no onDelete cascade.', 'MEDIUM', 'prisma/schema.prisma'),
        ('M-03', 'Inconsistent DATABASE_URL paths across configuration files.', 'MEDIUM', '.env, docker-compose.yml'),
        ('M-04', 'Excessive data fetching for dropdown selectors - entire tables loaded into memory for simple select fields.', 'MEDIUM', 'Multiple components'),
        ('M-05', 'Dashboard displays random data for missing revenue figures using Math.random().', 'MEDIUM', 'components/Dashboard.tsx'),
        ('M-06', 'Notes pinning feature is in-memory only - pinned state is lost on page refresh.', 'MEDIUM', 'components/NotesPanel.tsx'),
        ('M-07', 'Settings are not persisted - all configuration changes are lost when the application restarts.', 'MEDIUM', 'components/SettingsPanel.tsx'),
        ('M-08', 'Toast remove delay is set to 1,000,000ms (11.5 days) - notification auto-dismiss is effectively broken.', 'MEDIUM', 'hooks/use-toast.ts'),
        ('M-09', 'use-toast hook has a useEffect dependency bug causing stale closure references.', 'MEDIUM', 'hooks/use-toast.ts'),
        ('M-10', 'getStatusCounts() recomputes on every render instead of being memoized.', 'MEDIUM', 'components/CrmProvider.tsx'),
        ('M-11', 'No AbortController usage - rapid navigation causes race conditions with stale data overwriting fresh data.', 'MEDIUM', 'Multiple components'),
        ('M-12', 'seed.mjs references non-existent models - 67KB of dead seed code.', 'MEDIUM', 'prisma/seed.mjs'),
    ]))

    # ══════════════════════════════════════
    # CHAPTER 4: Project 3 - alo-labs monorepo
    # ══════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph('4. Project 3: alo-labs-avatar-video-studio-ai-agent.zip - ALO Labs Monorepo', style_h1))
    story.append(hr())

    story.append(Paragraph('4.1 Project Overview', style_h2))
    story.append(Paragraph(
        'This project is a monorepo containing a <b>Vite+React</b> frontend, an <b>Express.js</b> backend with a '
        '1,131-line server.ts file, and a <b>Python/FastAPI</b> sub-project. The repository consists of 37 files total. '
        'It uses JSON files as its "database" and deploys via Docker Compose. The project has the highest risk score '
        'among the three audited codebases due to the concentration of hardcoded credentials, the complete absence of '
        'authentication on ~35 routes, and the use of insecure token generation.',
        style_body
    ))

    story.append(Paragraph('4.2 Critical Findings', style_h2))
    story.append(finding_table([
        ('C-01', 'No authentication or authorization on ANY endpoint - approximately 35 routes are completely unprotected, exposing all data and operations.', 'CRITICAL', 'server.ts, main.py'),
        ('C-02', 'Hardcoded production credentials in docker-compose.yml - 6 plaintext passwords for database, Redis, and other services.', 'CRITICAL', 'docker-compose.yml'),
        ('C-03', 'Hardcoded password "admin" with the UI displaying a hint showing this password to the user.', 'CRITICAL', 'server.ts, App.tsx'),
        ('C-04', 'Plaintext passwords stored in SQL seed data - default user password "admin123" inserted in plain text.', 'CRITICAL', 'init.sql'),
        ('C-05', 'Login endpoint ignores the password field entirely - authentication only checks if the email exists, accepting any password.', 'CRITICAL', 'server.ts'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('4.3 High Severity Findings', style_h2))
    story.append(finding_table([
        ('H-01', 'Insecure session token generation using Math.random() instead of crypto.randomBytes() - predictable and forgeable tokens.', 'HIGH', 'server.ts'),
        ('H-02', 'No CORS configuration on Express; wildcard CORS with credentials on FastAPI - both are insecure configurations.', 'HIGH', 'server.ts, main.py'),
        ('H-03', 'No security headers - no Helmet middleware, no Content-Security-Policy, no X-Frame-Options.', 'HIGH', 'server.ts'),
        ('H-04', 'XSS vulnerability via innerHTML in CRM HTML template - user input rendered directly as HTML.', 'HIGH', 'App.tsx'),
        ('H-05', 'No input validation on any endpoint - all user input is accepted without sanitization or schema validation.', 'HIGH', 'server.ts, main.py'),
        ('H-06', 'JSON file used as "database" with synchronous read/write operations - prone to data corruption and race conditions.', 'HIGH', 'server.ts (saveDb)'),
        ('H-07', 'All database ports (PostgreSQL, Redis, etc.) exposed to 0.0.0.0 in docker-compose.yml.', 'HIGH', 'docker-compose.yml'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('4.4 Medium Severity Findings', style_h2))
    story.append(finding_table([
        ('M-01', '7,938-line monolithic App.tsx component - extremely difficult to maintain, test, or review.', 'MEDIUM', 'src/App.tsx'),
        ('M-02', 'No TypeScript strict mode enabled; pervasive use of any types throughout the codebase.', 'MEDIUM', 'tsconfig.json'),
        ('M-03', 'Missing Dockerfiles referenced in docker-compose.yml - the containers cannot be built as configured.', 'MEDIUM', 'docker-compose.yml'),
        ('M-04', 'No requirements.txt for the Python backend - dependencies are not documented or reproducible.', 'MEDIUM', 'python/'),
        ('M-05', 'Significant mismatch between API schema/documentation and actual implementation.', 'MEDIUM', 'docs/, server.ts'),
        ('M-06', 'Real PII (email addresses, phone numbers) hardcoded in source code and seed data.', 'MEDIUM', 'Multiple files'),
        ('M-07', 'AI prompt injection vulnerability - user input is directly interpolated into system prompts sent to LLMs.', 'MEDIUM', 'server.ts'),
        ('M-08', 'Synchronous file I/O (fs.readFileSync/writeFileSync) blocking the Node.js event loop.', 'MEDIUM', 'server.ts'),
        ('M-09', 'No error handling on saveDb() - database write failures are silently ignored.', 'MEDIUM', 'server.ts'),
        ('M-10', 'No logging framework - all logging uses console.log with no structured output.', 'MEDIUM', 'server.ts'),
    ]))

    # ══════════════════════════════════════
    # CHAPTER 5: Cross-Project Analysis
    # ══════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph('5. Cross-Project Analysis', style_h1))
    story.append(hr())

    story.append(Paragraph('5.1 Common Vulnerability Patterns', style_h2))
    story.append(Paragraph(
        'The audit reveals systemic issues that span all three projects. These patterns suggest a common development '
        'approach - likely AI-assisted code generation - where security was treated as an afterthought rather than '
        'a foundational requirement. The following vulnerabilities are present across the portfolio:',
        style_body
    ))
    story.append(Spacer(1, 4))

    common_patterns = [
        ('Zero Authentication', 'All 3 projects have no server-side authentication. Access control, where it exists, is purely client-side and trivially bypassable.'),
        ('Wildcard CORS', '2 of 3 projects use Access-Control-Allow-Origin: *, and the third has no CORS configuration at all.'),
        ('Hardcoded Credentials', '2 of 3 projects contain plaintext passwords in source code, configuration files, and Docker Compose files.'),
        ('TypeScript Disabled', 'All Next.js projects have TypeScript strictness disabled (noImplicitAny: false, ignoreBuildErrors: true).'),
        ('No Input Validation', 'No project implements server-side input validation on any endpoint - all user input is processed without sanitization.'),
        ('Unused Dependencies', 'All projects contain 15+ unused npm packages, increasing bundle size and potential attack surface.'),
    ]
    for title, desc in common_patterns:
        story.append(Paragraph(f'<b>{title}:</b> {desc}', style_body_small))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 8))
    story.append(Paragraph('5.2 Architecture Comparison', style_h2))

    arch_data = [
        [Paragraph('<font color="#ffffff"><b>Aspect</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>lab2.zip</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>lab.zip</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white)),
         Paragraph('<font color="#ffffff"><b>alo-labs</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, alignment=TA_CENTER, textColor=colors.white))],
        [Paragraph('<b>Framework</b>', style_body_small),
         Paragraph('Next.js 16', style_body_small), Paragraph('Next.js 16', style_body_small), Paragraph('Vite + Express', style_body_small)],
        [Paragraph('<b>Language</b>', style_body_small),
         Paragraph('TypeScript', style_body_small), Paragraph('TypeScript', style_body_small), Paragraph('TypeScript + Python', style_body_small)],
        [Paragraph('<b>Database</b>', style_body_small),
         Paragraph('Prisma/PostgreSQL', style_body_small), Paragraph('Prisma/PostgreSQL', style_body_small), Paragraph('JSON files', style_body_small)],
        [Paragraph('<b>Authentication</b>', style_body_small),
         Paragraph('Client-side only', style_body_small), Paragraph('None', style_body_small), Paragraph('Broken (ignores password)', style_body_small)],
        [Paragraph('<b>Source Files</b>', style_body_small),
         Paragraph('107', style_body_small), Paragraph('~90', style_body_small), Paragraph('37', style_body_small)],
        [Paragraph('<b>Routing</b>', style_body_small),
         Paragraph('App Router (13 pages)', style_body_small), Paragraph('App Router + Bun srv', style_body_small), Paragraph('Express (~35 routes)', style_body_small)],
        [Paragraph('<b>Containerization</b>', style_body_small),
         Paragraph('Docker Compose', style_body_small), Paragraph('Docker + Caddy', style_body_small), Paragraph('Docker Compose', style_body_small)],
        [Paragraph('<b>Input Validation</b>', style_body_small),
         Paragraph('None', style_body_small), Paragraph('None', style_body_small), Paragraph('None', style_body_small)],
        [Paragraph('<b>Testing</b>', style_body_small),
         Paragraph('None', style_body_small), Paragraph('None', style_body_small), Paragraph('None', style_body_small)],
    ]
    aw = [75, 120, 120, 120]
    at = Table(arch_data, colWidths=aw, repeatRows=1)
    at_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_STRIPE),
        ('BACKGROUND', (0, 4), (-1, 4), TABLE_STRIPE),
        ('BACKGROUND', (0, 6), (-1, 6), TABLE_STRIPE),
        ('BACKGROUND', (0, 8), (-1, 8), TABLE_STRIPE),
    ]
    at.setStyle(TableStyle(at_cmds))
    story.append(at)

    story.append(Spacer(1, 12))
    story.append(Paragraph('5.3 Aggregate Risk Metrics', style_h2))

    risk_data = [
        [Paragraph('<font color="#ffffff"><b>Severity</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
         Paragraph('<font color="#ffffff"><b>lab2.zip</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
         Paragraph('<font color="#ffffff"><b>lab.zip</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
         Paragraph('<font color="#ffffff"><b>alo-labs</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
         Paragraph('<font color="#ffffff"><b>Total</b></font>', ParagraphStyle('th', parent=style_body, fontSize=9, textColor=colors.white, alignment=TA_CENTER))],
        [Paragraph('<b><font color="#a1473e">CRITICAL</font></b>', ParagraphStyle('tc', parent=style_body, fontSize=10, alignment=TA_CENTER)),
         Paragraph('3', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('4', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('5', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>12</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER, fontName='Inter-Bold'))],
        [Paragraph('<b><font color="#937944">HIGH</font></b>', ParagraphStyle('tc', parent=style_body, fontSize=10, alignment=TA_CENTER)),
         Paragraph('7', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('7', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('7', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>21</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER, fontName='Inter-Bold'))],
        [Paragraph('<b><font color="#866f2c">MEDIUM</font></b>', ParagraphStyle('tc', parent=style_body, fontSize=10, alignment=TA_CENTER)),
         Paragraph('8', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('12', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('10', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>30</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER, fontName='Inter-Bold'))],
        [Paragraph('<b><font color="#466c91">LOW</font></b>', ParagraphStyle('tc', parent=style_body, fontSize=10, alignment=TA_CENTER)),
         Paragraph('5+', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('5+', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('3+', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER)),
         Paragraph('<b>13+</b>', ParagraphStyle('tc', parent=style_body, alignment=TA_CENTER, fontName='Inter-Bold'))],
    ]
    rw = [80, 90, 90, 90, 90]
    rt = Table(risk_data, colWidths=rw, repeatRows=1)
    rt_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_STRIPE),
        ('BACKGROUND', (0, 4), (-1, 4), TABLE_STRIPE),
    ]
    rt.setStyle(TableStyle(rt_cmds))
    story.append(rt)

    # ══════════════════════════════════════
    # CHAPTER 6: Prioritized Remediation Roadmap
    # ══════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph('6. Prioritized Remediation Roadmap', style_h1))
    story.append(hr())

    story.append(Paragraph(
        'The following phased remediation plan addresses findings in order of risk impact. Each phase builds upon '
        'the previous one, ensuring that the most critical vulnerabilities are resolved first.',
        style_body
    ))
    story.append(Spacer(1, 8))

    # Phase 1
    story.append(Paragraph('Phase 1 - Immediate (Week 1)', style_h2))
    story.append(Paragraph(
        '<b>Objective:</b> Eliminate all Critical vulnerabilities that expose data and services to unauthorized access.',
        style_body
    ))
    phase1_items = [
        '<b>Implement authentication middleware</b> - Add NextAuth.js or similar auth library with proper session management to all three projects. Create middleware.ts for route protection.',
        '<b>Fix CORS configuration</b> - Replace wildcard CORS with explicit allowed origins. Remove credentials: true from wildcard configurations.',
        '<b>Rotate all hardcoded credentials</b> - Move all passwords, API keys, and database URLs to environment variables. Remove .env files from version control. Rotate all exposed credentials immediately.',
        '<b>Sanitize error responses</b> - Implement global error handlers that return generic error messages to clients while logging full details server-side.',
        '<b>Fix login endpoint</b> - The alo-labs login endpoint must properly validate passwords using bcrypt or argon2 hashing.',
    ]
    for item in phase1_items:
        story.append(Paragraph(f'  • {item}', style_body_small))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 6))

    # Phase 2
    story.append(Paragraph('Phase 2 - This Sprint (Weeks 2–3)', style_h2))
    story.append(Paragraph(
        '<b>Objective:</b> Address all High severity findings and improve input handling.',
        style_body
    ))
    phase2_items = [
        '<b>Add input validation</b> - Implement Zod or Joi schemas for all API endpoints. Validate request bodies, query parameters, and path parameters.',
        '<b>Implement rate limiting</b> - Add express-rate-limit or similar to prevent abuse and brute-force attacks on authentication endpoints.',
        '<b>Remove dead code</b> - Delete the 14-file dead modules directory (lab2), 164-line app-store.ts (lab), and 67KB seed.mjs (lab).',
        '<b>Fix TypeScript configuration</b> - Enable noImplicitAny, remove ignoreBuildErrors: true, and enable strict mode. Fix all resulting type errors.',
        '<b>Add security headers</b> - Implement Helmet middleware for Express; configure Next.js security headers.',
        '<b>Fix token generation</b> - Replace Math.random() with crypto.randomBytes() for session token generation.',
    ]
    for item in phase2_items:
        story.append(Paragraph(f'  • {item}', style_body_small))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 6))

    # Phase 3
    story.append(Paragraph('Phase 3 - Next Sprint (Weeks 4–5)', style_h2))
    story.append(Paragraph(
        '<b>Objective:</b> Resolve Medium severity findings, improve architecture, and optimize performance.',
        style_body
    ))
    phase3_items = [
        '<b>Cleanup unused dependencies</b> - Audit and remove all unused packages from package.json across all projects.',
        '<b>Fix Prisma schema design</b> - Add unique constraints, change tags from String to Json, add onDelete cascades.',
        '<b>Fix performance issues</b> - Memoize getStatusCounts(), add AbortController to fetch calls, replace synchronous file I/O.',
        '<b>Fix data persistence</b> - Make notes pinning and settings persistent. Replace Math.random() dashboard data with real aggregations.',
        '<b>Split monolithic components</b> - Break up the 7,938-line App.tsx and other oversized components.',
        '<b>Fix Toast bugs</b> - Correct the 11.5-day dismiss delay and useEffect dependency issue.',
    ]
    for item in phase3_items:
        story.append(Paragraph(f'  • {item}', style_body_small))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 6))

    # Phase 4
    story.append(Paragraph('Phase 4 - Ongoing', style_h2))
    story.append(Paragraph(
        '<b>Objective:</b> Establish sustainable development practices and prevent regression.',
        style_body
    ))
    phase4_items = [
        '<b>Add testing infrastructure</b> - Implement unit tests (Vitest/Jest), integration tests, and end-to-end tests (Playwright). Target minimum 70% coverage.',
        '<b>Create documentation</b> - Write API documentation (OpenAPI/Swagger), architecture decision records, and onboarding guides.',
        '<b>Setup CI/CD pipeline</b> - Configure automated testing, linting, type-checking, and security scanning (Snyk/Dependabot) on every pull request.',
        '<b>Implement monitoring</b> - Add application monitoring (Sentry), structured logging (Pino/Winston), and health check endpoints.',
        '<b>Establish security review process</b> - Require security review for all changes to authentication, authorization, and data handling code.',
    ]
    for item in phase4_items:
        story.append(Paragraph(f'  • {item}', style_body_small))
        story.append(Spacer(1, 2))

    # ══════════════════════════════════════
    # CHAPTER 7: Conclusion
    # ══════════════════════════════════════
    story.append(Spacer(1, 12))
    story.append(Paragraph('7. Conclusion', style_h1))
    story.append(hr())

    story.append(Paragraph(
        'All three audited projects are in an early prototype or development stage. <b>None are production-ready</b> '
        'in their current state. The most alarming finding is the complete absence of server-side authentication across '
        'the entire portfolio - a fundamental security requirement for any web application handling user data.',
        style_body
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'The common patterns observed - AI-generated code with security as an afterthought, disabled type checking, '
        'no input validation, hardcoded credentials, and missing tests - suggest a need for a fundamental shift in '
        'the development approach. While AI-assisted development can accelerate prototyping, it must be paired with '
        'proper security review, testing, and quality assurance processes.',
        style_body
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'We strongly recommend adopting <b>security-first development practices</b>: implement authentication and '
        'authorization before adding features, enable all compiler strictness options, add input validation to every '
        'endpoint, and establish automated testing from the start. The phased remediation roadmap in Section 6 provides '
        'a prioritized path to bringing these projects to a production-viable security posture.',
        style_body
    ))
    story.append(Spacer(1, 12))

    # Summary callout
    callout_data = [[Paragraph(
        '<b>Key Takeaway:</b> 12 Critical, 21 High, and 30 Medium severity findings were identified across '
        '3 projects. Immediate action is required on authentication, CORS, and credential management before '
        'any production deployment can be considered.',
        ParagraphStyle('callout', parent=style_body, fontSize=10, leading=14, textColor=HEADER_FILL)
    )]]
    callout = Table(callout_data, colWidths=[CONTENT_W - 20])
    callout.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(callout)

    return story


# ─── Main ───
OUTPUT_PATH = '/home/z/my-project/audit-report/body.pdf'

doc = TocDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    topMargin=MARGIN_TOP,
    bottomMargin=MARGIN_BOTTOM,
    leftMargin=MARGIN_LEFT,
    rightMargin=MARGIN_RIGHT,
    title='Comprehensive Code Audit Report',
    author='Z.ai Code Auditor',
)

# Build with TOC (pass onFirstPage/onLaterPages to multiBuild)
story = build_story()
doc.multiBuild(story, onFirstPage=header_footer, onLaterPages=header_footer)

print(f"✅ Body PDF generated: {OUTPUT_PATH}")
print(f"   File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")