# AgentOS Imported Skill Pack

For the status of the requested REA, coding-agent, skill, memory, and presentation projects, including components not integrated, see [Requested agent projects status](REQUESTED_AGENT_PROJECTS_STATUS.md).

- **Date:** 2026-10-31
- **Status:** Implemented as an instruction-only skill pack for the ALO Labs Command Agent and assignable AgentOS skills
- **Owner authorization:** “please done now … all skile are add our own ai agent? if no then add”
- **Boundary:** This adds skill documents and runtime selection only. It does not approve Phase 1 telephony, install external applications, activate SaaS, download models, or grant shell/filesystem/write tools.

## 1. What was added

The repository now contains a generated, pinned, license-recorded skill catalog:

- `src/lib/agent-skills/catalog.json` — metadata/provenance for every imported skill
- `src/lib/agent-skills/catalog.generated.ts` — bundler-friendly generated catalog module used by the runtime
- `src/lib/agent-skills/content/*.generated.ts` — SKILL.md instruction bodies only
- `src/lib/agent-skills/licenses/*` — upstream license/notice texts
- `src/lib/agent-skills/THIRD_PARTY_NOTICES.md` — source/license summary
- `src/lib/agent-skills/index.ts` — safe selection, body loading, and prompt rendering
- `scripts/sync-agent-skills.mjs` — reproducible GitHub-API import without cloning repositories
- `scripts/verify-agent-skills.mjs` — dependency-free catalog/hash/safety verification
- `scripts/install-agent-skills.ts` — optional dry-run/apply installer into the database Skills Registry

**Imported totals:**

| Category | Count | Runtime behavior |
|---|---:|---|
| Total skill documents | 470 | Cataloged with pinned commit, path, license, and hashes |
| Advisory skills | 298 | Eligible for task-relevant prompt guidance in the Command Agent |
| Quarantined skills | 172 | Cataloged for review; never injected into the Command Agent |
| Upstream sources | 14 | License texts preserved |
| Executable scripts/plugins imported | 0 | No shell, MCP, plugin, binary, or dependency installation |
| Tool grants added by skills | 0 | Existing tool allowlists remain authoritative |

## 2. Source breakdown

| Source | Pinned commit | Skills | Advisory | Quarantined | License |
|---|---|---:|---:|---:|---|
| `mattpocock/skills` | `a496f5513d4a4cf889bc48e189e579f4b0bdf6aa` | 38 | 38 | 0 | MIT |
| `cathrynlavery/diagram-design` | `0cf73c3fcc56667ad91a9a04c439ac6ccfabc9d1` | 1 | 1 | 0 | MIT |
| `twostraws/SwiftUI-Agent-Skill` | `f2920b63995263f57b3e198674e89a602efba6d2` | 1 | 1 | 0 | MIT |
| `elayadesign/ai-design-skills` | `4fdcdd52f15eda09da1257c303c860c13e0c879f` | 1 | 1 | 0 | MIT |
| `android/skills` | `6daa53ef27fa2aa87827d183a85c06cedceca833` | 36 | 36 | 0 | Apache-2.0 |
| `K-Dense-AI/scientific-agent-skills` | `5f2bc0341354fd5590aef76a533ada1e1e5b4e62` | 177 | 177 | 0 | MIT |
| `anshuxinha/karpathy-skills-extended` | `8fe0d8dfbcafebcfd29ea1b94cd120964883843d` | 1 | 1 | 0 | MIT |
| `pvjbuilds/delegate-router` | `1f3b24eb5125f9c8f0449df104d380978d86935b` | 1 | 0 | 1 | MIT |
| `bisque-cloud/presenter` | `d0532a98630afe204147e8b92236f65bb98b9e9b` | 3 | 3 | 0 | MIT |
| `heygen-com/hyperframes` | `a04b45a6db0d1f724be9cf1985c3b13657195f0d` | 15 | 15 | 0 | Apache-2.0 |
| `anthropics/claude-plugins-official` | `a7ba5b93db0c7c8d17f3f1d25853adca79598a1a` | 33 | 25 | 8 | Apache-2.0 directory; plugin terms still require review before executable use |
| `HKUDS/CLI-Anything` | `34f519533bc175d2fe287ab8316b0dd99bb9cc43` | 151 | 0 | 151 | Apache-2.0 |
| `morluto/rea` | `23de10bb2849cdce8ddbe70504aa7cc57de75a98` | 5 | 0 | 5 | MIT |
| `akitaonrails/ai-memory` | `ac699b5696ccb37eaa901893fd16bb2b8ba59d90` | 7 | 0 | 7 | MIT |

Quarantine reasons include desktop/CLI control, reverse engineering, external persistent memory, external model routing, and external messaging plugins. Quarantined documents are retained for audit/review but are not usable by the Command Agent.

## 3. How the own AI agent uses the skills

### Command Agent

`src/lib/command-agent/agent.ts` now:

1. Selects up to three task-relevant **advisory** skills from the local catalog.
2. Accepts optional explicit `skillSlugs` from the API, maximum five.
3. Rejects unknown or quarantined slugs.
4. Loads only the selected instruction bodies.
5. Injects them after the governing Command Agent rules with an explicit “guidance only, no tool grants” wrapper.
6. Returns `skillsUsed` and `skillsRejected` for UI/audit visibility.

`/api/command-agent/catalog` now returns skill metadata and counts. The Commanding Center UI has a **Skills** tab showing advisory/quarantined status, source, license, and upstream link. Assistant messages show which skills were used.

### Agent runtime / assigned skills

`src/lib/context-engine.ts` now includes actual skill instruction content for assigned database skills, bounded by context budget. It also normalizes legacy underscore slugs to hyphenated catalog slugs and can use an imported advisory body when an assigned database skill has no content. Skills still do not grant tools.

### Database Skills Registry

The pack is available to the Command Agent without a database seed. To also make the skills visible/assignable in the database Skills Registry, use the optional installer after normal change approval:

```bash
npm run skills:install:dry-run -- --company alo-labs
npm run skills:install:apply -- --company alo-labs
```

The installer is dry-run by default, skips existing skills unless `--force`, creates company-scoped access, and does not assign skills to agents automatically. **It was not run during this change.** No production database was touched.

## 4. Safety model

- Skills are **instruction-only Markdown**. No upstream scripts, binaries, plugins, MCP servers, package installs, or companion reference files were imported.
- `grantsTools` is always `false`; requested upstream tools are recorded but ignored.
- Quarantined skills are never selected or injected, even if explicitly requested.
- Prompt guidance states that AgentOS policy, tenant isolation, tool allowlists, approvals, and lawful user intent override skill text.
- Skills cannot authorize shell execution, file writes, secret access, external messaging, paid APIs, or data exfiltration.
- Skill bodies are bounded/truncated to protect context budgets.
- Source commit, path, license, raw hash, and body hash are recorded for every skill.
- Upstream license texts are preserved under `src/lib/agent-skills/licenses/`.

This reduces prompt-injection and supply-chain risk, but it is not a claim that every upstream instruction is legally or operationally suitable for every task. Human review remains required for privileged operations.

## 5. Commands

```bash
# Re-import from the pinned commits (requires GitHub API access; no git clone)
npm run skills:sync

# Verify catalog counts, hashes, licenses, quarantine behavior, and prompt budget
npm run skills:verify

# Optional database registry installation (not run yet)
npm run skills:install:dry-run -- --company alo-labs
npm run skills:install:apply -- --company alo-labs
```

## 6. Verification performed

- `node scripts/verify-agent-skills.mjs` — **PASS**: 470 total, 298 advisory, 172 quarantined, 14 sources; hashes/licenses/quarantine/prompt-budget checks passed.
- `node --check` on sync/verify scripts — passed.
- Runtime smoke check through Node ESM: skill selection, body loading, prompt rendering, and quarantined-slug rejection worked.
- Unit/API tests were added/updated for skill selection, Command Agent injection, and context-engine skill content. The full Vitest suite was **not run locally** because repository dependencies are not installed and bulk installation remains outside the authorized scope.

## 7. What was not added as a skill

Many supplied links are applications, SaaS products, models, or infrastructure rather than skill packs. They remain in [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md) and were not merged into the agent:

- OpenSMS, wacrm, Dify, Postiz, Mailcheap, Voicebox, VoiceStudio, OpenShorts, Presenton, MoneyPrinterTurbo, Kdenlive, OBS, Rescript, Scrapling, OpenSEO, Gods Eye View, CleanYourTV, openGym, AnyPS5, Text-to-CAD, WiFi-cracker, and similar apps/tools.
- Billion Context, Cursor Plugins, Ruflo, OpenCode, and similar agent/plugin frameworks were not imported as executable plugins.
- No model weights, voice cloning rights, carrier accounts, payment services, or paid APIs were activated.

## 8. Current confirmation

**Yes — the compatible skill documents are now added to the repository and connected to the ALO Labs Command Agent as instruction-only guidance.** The agent can use 298 advisory skills; 172 higher-risk or execution-dependent skills are cataloged but quarantined. No external application was installed, no database was modified, and no new tool permissions were granted.
