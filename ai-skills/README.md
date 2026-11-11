# ALO Labs — AI Skills Library (vendored reference skills)

Curated, permissively-licensed skill libraries from teams that run AI-assisted
engineering in production, vendored into this repository so every agent session
(see `AGENTS.md`, `CLAUDE.md`, `.cursor/`, or the AgentOS skill runtime) can use
them without network access.

**Nothing in this folder changes application code.** These are instruction
libraries for AI coding agents. All five upstream projects keep their own
licenses and attribution below.

## Sources

| Directory | Upstream | License | Skills | Why it is here |
|---|---|---|---|---|
| `mattpocock/` | https://github.com/mattpocock/skills | MIT | 30+ | Tests-first engineering, clear specs, real code review |
| `addyosmani/` | https://github.com/addyosmani/agent-skills | MIT | 25 | TDD, code review & quality, security hardening, spec-driven development, debugging, CI/CD |
| `cloudflare/` | https://github.com/cloudflare/security-audit-skill | MIT | 1 | Adversarial security audit: one agent hunts bugs, a second tries to disprove them |
| `google-goldfish/` | https://github.com/google/elephant-goldfish-model | Apache-2.0 | 7 | Design-doc → adversarial review loop: fresh AI sessions attack a design before code is written |
| `kepano-obsidian/` | https://github.com/kepano/obsidian-skills | MIT | 6 | Reference for structured Markdown formats (Obsidian-flavored notes) — optional, kept for completeness |

Total: 70 `SKILL.md` files. Re-vendored from upstream `main` on 2026-11-05.
To update: re-clone upstream and replace the `skills/` subfolder of each vendor
directory. Do not edit vendored files in place — add overrides in a new file.

## How to use

- **Claude Code / Cursor / Codex-style agents:** point your loader at
  `ai-skills/<vendor>/skills/` (each subfolder contains `SKILL.md` with
  frontmatter: `name` + `description`).
- **AgentOS runtime:** these are reference material for skill authoring; the
  runtime's own catalog lives under the application (see `docs/AGENT_SKILLS.md`).
- **Suggested mapping for this repo:**
  - Before touching `src/lib/voice/*` → read `addyosmani/skills/test-driven-development`
    and `mattpocock` testing skills (76 voice tests exist; keep them green).
  - Before any auth/tenant/webhook change → run the review pattern from
    `cloudflare/skills/security-audit-skill` (hunter + disprover) against the diff.
  - Before large features → write the design doc, then use
    `google-goldfish/skills/egm-review-loop` so fresh sessions attack it.
  - `addyosmani/skills/security-and-hardening` applies to the provider webhook
    and API-key surfaces.
