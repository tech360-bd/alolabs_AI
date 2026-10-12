# ALO Labs AgentOS — Brand System

Everything from the uploaded collateral, implemented in the product. One tokens
module drives every surface, so a brand change is a one-file edit.

**Live surfaces**

| Surface | URL | In the app |
|---|---|---|
| Brand book (logo, colour, type, flow, documents) | `/brand` | Marketing & Design → **Brand Book** |
| Invoice on the letterhead | `/invoice` | Marketing & Design → **Invoice** |
| Editorial diagram system | `/design` | Design system panel |

---

## 1. Logo

| Lockup | File | React |
|---|---|---|
| Mark (symbol only) | `public/brand/alo-mark.svg` | `<Mark size={40} />` |
| App icon (white tile) | `public/brand/alo-icon.svg`, `public/icons/icon-{192,512}.svg` | — |
| Horizontal | `public/brand/alo-logo-horizontal.svg` | `<AloLabsLogo variant="horizontal" />` |
| Stacked | `public/brand/alo-logo-stacked.svg` | `<AloLabsLogo variant="stacked" />` |
| Wordmark | `public/brand/alo-wordmark.svg` | `<AloLabsLogo variant="wordmark" />` |
| Circular badge (seal) | `public/brand/alo-badge.svg` | `<Badge size={120} />` |
| Divider — rule with dot | — | `<BrandRule width={160} />` |

```tsx
import { AloLabsLogo, Mark } from '@/components/brand/alo-logo'

<AloLabsLogo size={40} />                     // horizontal, light ground
<AloLabsLogo size={40} theme="dark" />        // on deep blue
<AloLabsLogo variant="mark" size={28} />      // favicon-sized
```

The **circular badge** is the seal from the sheet: circuit traces, the orange and
blue rim swooshes, the mark, then the stacked wordmark over a hairline rule with
the orange dot. Use it for documents, certificates and the website hero — it is
already in use on `/site` and offered as a download on `/brand`.

The **rule with dot** (`BrandRule`) is the divider that sits under the stacked
wordmark, available on its own for page blocks and footers.

Clear space is a quarter of the mark's height. Minimum sizes: icon 20 px, lockup
140 px. The app shell sidebar, the mobile header, the PWA icons, the favicon and
the OpenGraph image all use these files — not a placeholder.

## 2. Colour

| Role | Token | Value |
|---|---|---|
| Primary brand — action, important, warning, highlight, primary buttons | `BRAND.orange` | `#FF6A00` |
| System & trust — trust, system, backgrounds, navigation, secondary buttons | `BRAND.blue` | `#003ABC` |
| Second revision blue | `BRAND.blueAlt` | `#0D47A1` |
| Clean UI, cards, content area | `BRAND.white` | `#FFFFFF` |
| Text, borders, disabled | `BRAND.gray` / `graySoft` | `#64748B` / `#94A3B8` |
| Dark ground (mobile shell, dark lockups) | `BRAND.navy` | `#0A1B3D` |

Gradients: `GRADIENTS.orange` `#FF6A00 → #FFB300`, `GRADIENTS.blue`
`#003ABC → #0077FF`, `GRADIENTS.ribbon` (diagonal, mark only). CSS utilities:
`.alo-gradient-orange`, `.alo-gradient-blue`, `.alo-gradient-ribbon`,
`.alo-gradient-brand`.

## 3. Typography

| Register | Face | CSS var | Used for |
|---|---|---|---|
| Primary | **Inter** | `--font-brand` | Body, labels, tables, UI chrome |
| Secondary | **Poppins** | `--font-display` | Wordmark, headings, weighted numerals |

Both load from Google Fonts in `src/app/layout.tsx`. The editorial diagram system
keeps its own registers (Instrument Serif / Geist / Geist Mono) — the two systems
do not mix inside one figure.

## 4. Letterhead — the A4 pad

`src/components/brand/letterhead.tsx`

- A4 authored at 794 × 1123 px (96 dpi); prints to true A4 with zero margin.
- Orange outer rule, blue bands top and bottom with the diagonal cuts, inner
  keyline, masthead lockup, and the four-item contact strip across the foot.
- Wrap any document: `<Letterhead>{content}</Letterhead>`.

## 5. Invoice — the paid-API statement

`src/lib/brand/invoice.ts` (model + arithmetic) · `src/components/brand/invoice-document.tsx`

The house policy, implemented literally: **no fee for new attempts**, and the
document records what the same workload would have cost on paid APIs.

- Six line items on the sample (tokens, tool calls, voice minutes, crawl pages,
  vector store, OCR), each with quantity, unit and rate.
- Arithmetic: subtotal → contribution → tax → **balance due**, rounded once at
  the cent, clamped so a rate can never produce a negative total.
- Under the policy: balance **$0.00**, and **cost avoided** is the headline.
  Tick *Chargeable* in the app panel to turn it into a normal payable invoice.
- Print: `@page { size: A4; margin: 0 }`, chrome hidden via `.no-print`, the
  document grid collapsed to one column, scroll frame released.

```ts
import { computeInvoice, sampleInvoice, invoiceToText } from '@/lib/brand/invoice'

const totals = computeInvoice(sampleInvoice())
// { subtotal, discount, net, tax, total: 0, avoided: 0, lineCount: 6 }
```

## 6. Designs from the sheet, usable on the site

| Design | Component |
|---|---|
| System flow (orange & blue, with the five-department and three-RAG branches) | `<SystemFlow />` — `src/components/brand/system-flow.tsx` |
| Mobile command centre (blue theme, 12 tiles, 4-tab bar) | `<CommandCenterMobile />` |
| Agent specification cards (AGENT-0801 layout) | `<AgentSpecCard spec={…} />` + `SPEC_SAMPLE` |
| Brand usage rules checklist | `BRAND_RULES`, rendered on `/brand` → Documents |
| Master build prompt | `/brand` → Documents (kept with the assets) |

## 7. Corporate identity (single source)

```
ALO Labs · AgentOS · AI Agent Operating System
SOLE MBR · 117 S LEXINGTON ST STE 100 · HARRISONVILLE, MO 64701
+1 (347) 433 1200 · www.alolabs.net · info@alolabs.net
alolabs.net · command.alolabs.net · agents.alolabs.net · api.alolabs.net
1 Command Center · 1020 AI Agents · 100+ Departments · Unlimited Possibilities
```

Changing any of these in `src/lib/brand/tokens.ts` updates the letterhead,
invoice, brand book, mobile surface and shell together.

---

## Verification

```
npx vitest run src/__tests__/lib/brand-system.test.ts     # 45 passed
npx tsc --noEmit | grep -E "src/(lib|components)/brand"   # 0 errors
```

The suite pins the palette and gradient stops, the exact contact block, the
flow order and tones, on-brand hues inside every SVG, A4 geometry, the print
rules, and the invoice arithmetic (including rounding and the no-fee policy).

---

## দুই লাইনে (বাংলা)

আপনার পাঠানো লোগো, কালার সিস্টেম, টাইপোগ্রাফি, লেটারহেড ও ডিজাইনগুলো এখন সাইটে
যুক্ত হয়েছে — `/brand` পেজে পুরো ব্র্যান্ড বুক, আর `/invoice` পেজে আপনার
লেটারহেডেই ইনভয়েস (নতুন কাজের জন্য কোনো ফি নেই; কোন পেইড API ব্যবহার করলে কত
খরচ হতো, সেটাই “Cost avoided” হিসেবে দেখানো হয় এবং প্রিন্টে সঠিক A4 হয়)।
প্রতিটি রঙ, যোগাযোগের ঠিকানা ও লেখা একটিই ফাইল থেকে আসে —
`src/lib/brand/tokens.ts`।

---

# Part 2 — the website and sending the pad

## Public website — `/site`

The designs from the sheet are now used **on the website**, not just documented:

| Section | Design it uses |
|---|---|
| Hero | Lockup, headline statistics (1 / 1020 / 100+ / Unlimited), orange CTA + blue secondary, live command-centre panel |
| System | The orange-and-blue **system flow** plus routed-hop / department / RAG / approval stats |
| Agents | The **agent specification cards** (AGENT-0801 …) and the master-list framing |
| Mobile | The blue-theme **mobile command centre** on the deep-blue ground, with its four features |
| Departments | The five department branches and the four branded domains |
| Contact | The **letterhead contact strip** as page cards — address, phone, website, email |
| Footer | Dark ground lockup, the four platform links, head-office address, promise line |

Reachable at `/site`, and previewed inside the app under **Marketing & Design → Public Site**.

## The pad travels

Three ways to get the invoice out of the app, all from the same letterhead:

| Action | Where | What you get |
|---|---|---|
| **Print / save PDF** | `/invoice` and the Invoice panel | True A4 via `@page { size: A4; margin: 0 }`, chrome hidden, colours preserved |
| **Download as HTML** | `/invoice` | One self-contained file (`invoice-<number>.html`) — opens anywhere, prints as A4, no assets to ship |
| **Send by email** | Invoice panel | Emails the same document through the platform's own mail accounts |

`src/lib/brand/invoice-html.ts` renders the pad as portable HTML (`invoiceToHtml`,
`invoiceEmailSubject`, `invoiceEmailText`) with **tables and inline styles only** —
email clients and PDF renderers do not support flexbox or classes. The mark is
inline SVG, so the message needs no external asset.

Sending uses the existing infrastructure — `GET /api/email/accounts` to list the
deployment's mail accounts and `POST /api/email/send` to deliver — so the invoice
never leaves your own mail server. The sent message includes an HTML part and a
plain-text alternative, and is recorded in the email log like any other send.

```tsx
// inside the app
import { SendInvoiceDialog } from '@/components/brand/send-invoice-dialog'
<SendInvoiceDialog invoice={invoice} />
```

If no mail account is configured yet, the dialog says so and points to
**Settings → Email accounts** instead of failing silently.

## Verification

```
npx vitest run src/__tests__/lib/brand-system.test.ts   # 62 passed
npx tsc --noEmit                                         # 444 pre-existing only, 0 in brand files
curl /site /brand /invoice /design /                     # all 200
```

The new tests pin the portable pad (standalone document, table layout, no
classes, A4 print rules, every line and total, HTML escaping, contact strip
optional) and the website (composed from the shared design components, driven by
tokens, all four contact details, links to app/brand/invoice).
