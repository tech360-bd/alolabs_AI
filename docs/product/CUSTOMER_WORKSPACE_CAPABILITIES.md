# Customer Workspace Capabilities

Status: honest capability catalogue · 2026-11-25

This page is written for customers. It states what the platform can do **now**, what
needs a connected account, and what is not available yet. It must not be expanded
with aspirational items; the source of truth is
`docs/audits/AGENTOS_CAPABILITY_INVENTORY_2026-11-25.md`.

Legend: ✅ works today · 🔌 needs a connected provider/account · 🧪 partial, verify
with support · 🚧 not available yet.

## Website and software

| Capability | State | Notes |
| --- | --- | --- |
| Analyse a website from its URL | 🚧 | Public analysis is not implemented; a URL does not grant modification rights |
| Redesign / fix a website | 🚧 | Requires a repository connection, which is not available yet |
| Build a web application | 🚧 | Model help and planning only; no repository execution |
| Audit SEO structure | 🚧 | Recommendations can be drafted from information you provide |
| Run tests / build verification | 🚧 | No sandbox executor yet |

## Documents and professional work

| Capability | State | Notes |
| --- | --- | --- |
| CV / résumé drafting and formatting | 🧪 | Document generation endpoints exist; templates vary |
| Cover letters, proposals, reports | ✅ | Generated through your workspace chat/agents |
| Presentation content | 🧪 | Text/outline generation only |
| PDF/office processing | 🧪 | Upload + extraction available through documents APIs |
| Legal, financial, medical documents | 🔌 | Draft only; human review required before use (policy `LEGAL-ADVICE-001`) and never professional advice |

## Marketing and SEO

| Capability | State | Notes |
| --- | --- | --- |
| Content strategy, blog drafts | ✅ | |
| SEO recommendations | 🧪 | Based on data you provide, not a live crawl |
| Email campaign copy | ✅ | Sending requires a connected email account (🔌) and approval |
| Social captions and calendars | ✅ | |
| Publishing to social platforms | 🔌 | Requires a connected, authorised account; confirmation comes from the platform |
| Campaign analytics | 🔌 | Requires analytics/search console connection |

## Images, video, audio

| Capability | State | Notes |
| --- | --- | --- |
| Image generation and editing | 🔌 | Requires a configured image model/provider and quota |
| Brand assets from a brand profile | ✅ | Logo, colours, typography storage |
| Video generation/editing | 🔌🧪 | Provider-dependent; not certified here |
| Voiceover / speech generation | ✅🔌 | Local/Bangla and TTS pipelines exist; provider config required |
| Transcription, subtitles | 🧪 | ASR jobs exist |
| Voice or likeness reproduction | 🔌 | Requires recorded consent; otherwise denied |

## Business operations

| Capability | State | Notes |
| --- | --- | --- |
| CRM contacts, deals, pipelines | ✅ | Tenant-isolated |
| Lead capture from the website | ✅ | Lead API v1 |
| Customer support tickets | 🧪 | Client portal tickets; no SLA/assignment yet |
| Workflow automation | 🧪 | Workflow engine + definitions; builder UI limited |
| Reporting | ✅ | Usage and cost dashboards |
| Invoicing/billing records | ✅ | Billing models and dashboards |

## Education

| Capability | State | Notes |
| --- | --- | --- |
| University/course research from the platform knowledge base | 🧪 | No live official-source verification yet |
| Student recruitment workflow | 🚧 | Not implemented end to end |
| Admissions advice | 🚧 | Never fabricate universities, fees, intakes or outcomes |

## AI assistance and workforce

| Capability | State | Notes |
| --- | --- | --- |
| Workspace chat with your organisation's knowledge | ✅ | Tenant-scoped retrieval |
| Specialised agents for defined tasks | ✅ | Configured agents only |
| Create a temporary specialist | ✅ | Owner/admin/manager; registered tools only; expires (≤ 24 h) |
| Run coding agents on your repository | 🚧 | Needs repository connection + sandbox |
| Research the web with citations | 🚧 | No browser/research subsystem yet |

## Platform guarantees

- Your data is isolated per organisation; cross-tenant access is denied by policy
  `SEC-TENANT-001` and by server-side query scoping.
- Paid AI providers are never used silently.
- Content is not published or sent externally without approval, unless you have
  configured an authorised automation for that action.
- Production deployment and destructive actions always require explicit approval
  and evidence.
- You can see why work is paused through the workspace status endpoint.
- Deleting your data follows the documented retention and backup policy; backups
  may retain records for their retention window.

## What we will not claim

- That every digital task is supported.
- That a URL grants the right to modify a site.
- That generated media gives unlimited commercial rights — provider terms apply.
- That legal/financial output is professional advice.
