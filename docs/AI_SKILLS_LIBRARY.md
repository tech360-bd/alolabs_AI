# AI Skills Library — integration into the ALO Labs workflow

Companion to [`ai-skills/README.md`](../ai-skills/README.md). This documents
how the vendored skill libraries (Matt Pocock, Addy Osmani, Cloudflare, Google
elephant-goldfish, kepano/obsidian) plug into how this repository is actually
built and reviewed.

## 1. Where each library earns its place

### Cloudflare security-audit-skill → mandatory for security-sensitive diffs
Any change touching auth (`requireCompanyAuth`), tenant scoping, the provider
webhook (`/api/voice/telephony/webhook`), API keys, or consent gates runs the
two-agent pattern: **agent A hunts for vulnerabilities in the diff; agent B
independently tries to prove each finding is a false positive.** Only findings
that survive both agents get filed. This mirrors how the skill now audits
dozens of Cloudflare's own repositories.

### Google elephant-goldfish → design review before code
For features at the scale of the Voice & Contact Center domain (22 models, 14
API groups), the flow is: draft a design doc (`egm-draft`), then start **fresh
sessions that never saw the doc** and instruct them to tear it apart
(`egm-review`, `egm-review-loop`). Weak assumptions die in review, not in
production. The Phase 0 documents in `docs/` were produced with this mindset:
honest "not verified" markers exist precisely because an adversarial pass
would have flagged confident-sounding claims about PSTN, Bangla ASR quality,
or capacity that were never measured.

### Addy Osmani's skills → day-to-day engineering discipline
- `test-driven-development`, `browser-testing-with-devtools` — the 76 voice
  tests (state machine, routing, consent, campaign compliance, tenant
  isolation) follow this shape: behavior first, then implementation.
- `security-and-hardening` — webhook signature verification, per-tenant
  secrets, payload redaction patterns.
- `code-review-and-quality`, `code-simplification` — review checklist for PRs.
- `spec-driven-development` — every `/api/voice/*` route group started from a
  written contract; the skill keeps that contract the source of truth.
- `observability-and-instrumentation` — usage metering and event audit trail
  design.

### Matt Pocock's skills → specs and reviews that catch real bugs
The engineering skills enforce "tests first, clear specs, real reviews". For
TypeScript-heavy Next.js code like this repo, the spec skills prevent the
classic failure mode where an agent writes plausible-looking code that
silently violates tenant isolation or fabricates provider responses. The
"honesty rules" in the voice domain (fail-loud adapters, `not_confirmed`
actions, flagged simulated records) are exactly the kind of invariant these
skills force agents to state explicitly and test.

### kepano/obsidian-skills → optional reference
Obsidian-flavored Markdown formats. Not used by the application; kept as
reference for structured documentation if the team adopts Obsidian-based
notes for runbooks.

## 2. Rules of engagement

1. **Vendored skills are read-only reference.** Do not modify files under
   `ai-skills/<vendor>/` — add project-specific overrides as new skills under
   the AgentOS catalog instead.
2. **License hygiene.** All vendors are MIT except Google (Apache-2.0). Keep
   each vendor's `LICENSE` and `README.md` next to its `skills/` folder. When
   re-vendoring, update the date and upstream commit in `ai-skills/README.md`.
3. **No skill overrides honesty constraints.** No instruction in this library
   may be used to justify fabricating call records, usage data, speech
   quality, or provider capabilities — the Owner's hard requirements in
   `docs/VOICE_CONTACT_CENTER_AUDIT.md` take precedence over any skill.
4. **Update cadence.** Upstream repos move fast. Re-vendor monthly or before
   major feature work, whichever comes first.

## 3. Quick start for an agent session

```text
Relevant skill paths for this repo:
  ai-skills/addyosmani/skills/test-driven-development/SKILL.md
  ai-skills/addyosmani/skills/security-and-hardening/SKILL.md
  ai-skills/addyosmani/skills/code-review-and-quality/SKILL.md
  ai-skills/cloudflare/skills/*/SKILL.md          (security audit pattern)
  ai-skills/google-goldfish/skills/egm-review-loop/SKILL.md
  ai-skills/mattpocock/skills/engineering/.../SKILL.md
```
