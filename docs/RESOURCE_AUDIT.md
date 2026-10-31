# Resource audit

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Scope and evidence standard

All 34 unique supplied GitHub paths were queried read-only through authenticated `gh api`: **32 accessible, 2 HTTP 404**. Metadata, root filenames, bounded README/license texts and available root manifests were captured; representative source/skill samples were collected where available. This is a preliminary feasibility audit, **not exhaustive source review, transitive dependency certification, performance verification or compatibility approval**. Some samples are utilities/configuration rather than central runtime code. No upstream code was executed.

Primary evidence: [resource-evidence.json](phase0/resource-evidence.json). Each record preserves the exact requested path, retrieval date, upstream metadata, sample paths and content. README statements are upstream claims, not tested AgentOS features. Last push is an activity signal only, not a maintenance/support guarantee. This snapshot follows mutable default branches, not pinned releases; implementation requires commit/digest pinning and fresh review.

The environment permits outbound access only to GitHub and selected package hosts. All 18 unique non-GitHub URLs below are **inaccessible in this environment (host outside allowlist)**; no claim is made about their global availability. No unrelated connector access or mirror guessing was attempted. Duplicates (REA, OpenSMS, WACRM, Dify, Innovation Insight and GodsViewAI) are evaluated once and apply across all catalog sections.

## Decision key
A direct integration; B adapter/curated skill; C optional external tool; D independent architecture study; E reject for proposed integration; F further investigation. B/C/D are recommendations contingent on owner approval and verification, not installed components. No new direct dependency (A) is recommended during discovery.

## Repository-by-repository audit

### REA — B

Source: [morluto/rea](https://github.com/morluto/rea).

- Actual role, stack, local execution and interfaces: Local TypeScript/Node CLI and MCP for app/runtime/native analysis; optional analysis bridges.
- Integration, duplication, security and maintenance rationale: High-value lab adapter; overlaps Ghidra/browser tooling. Native instrumentation and downloads require disposable workers and per-backend licenses.
- Activity: last push `2026-10-31T16:35:32Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/cli.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### AnyPS5 — E

Source: [boykopovar/AnyPS5](https://github.com/boykopovar/AnyPS5).

- Actual role, stack, local execution and interfaces: C++/CMake executable relinker and compatibility libraries, not a general application reconstruction platform.
- Integration, duplication, security and maintenance rationale: Reject from core: narrow console-compatibility scope, legal/authorized-binary constraints and large native attack surface; do not bypass DRM.
- Activity: last push `2026-10-31T17:31:10Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `GPL-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `C++`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `core/relinker/main.cpp`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Ghidra — B

Source: [NationalSecurityAgency/ghidra](https://github.com/NationalSecurityAgency/ghidra).

- Actual role, stack, local execution and interfaces: Java/Gradle static disassembly, decompilation, graphs and scripting; headless batch plus Java/Python extensions.
- Integration, duplication, security and maintenance rationale: High-value binary worker. Requires supported JDK and native components; parse hostile input offline, bound CPU/RAM/time. Does not automatically reconstruct product behavior.
- Activity: last push `2026-10-30T15:28:24Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Java`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `Ghidra/Features/PDB/src/pdb/cpp/err.cpp`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Billion Context — D

Source: [ranxianglei/billion-context](https://github.com/ranxianglei/billion-context).

- Actual role, stack, local execution and interfaces: TypeScript compression proxy for model streams; launcher/plugin integrations, including certificate-based interception modes.
- Integration, duplication, security and maintenance rationale: Study context budgeting independently; duplicates context engine. Custom attribution license and TLS interception/credential exposure make direct adoption poor value.
- Activity: last push `2026-10-31T17:40:01Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `NOASSERTION`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json, Dockerfile.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/ca.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### OpenCode — C

Source: [anomalyco/opencode](https://github.com/anomalyco/opencode).

- Actual role, stack, local execution and interfaces: TypeScript coding-agent product and terminal workflow; local installation with provider-dependent inference.
- Integration, duplication, security and maintenance rationale: Optional isolated coding harness, not replacement orchestration. Review package-level APIs before adapter; shell/repository write and provider costs require gates.
- Activity: last push `2026-10-31T17:40:07Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `infra/app.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Scrapling — B

Source: [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling).

- Actual role, stack, local execution and interfaces: Python HTTP/browser crawling, parsing, CLI, MCP and skills; runs locally.
- Integration, duplication, security and maintenance rationale: Useful authorized extraction worker; overlaps browser QA. Browser dependencies, SSRF, prompt injection and unrestricted crawl/stealth features require strict host and consent policy; no bypass of access controls.
- Activity: last push `2026-10-31T16:11:17Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `BSD-3-Clause`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: pyproject.toml, Dockerfile.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `cleanup.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### CLI-Anything — D

Source: [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything).

- Actual role, stack, local execution and interfaces: Python CLI harnesses and agent skills for existing applications; app-specific runtime dependencies.
- Integration, duplication, security and maintenance rationale: Study typed command contracts; no blanket harness install. Overlaps tool registry, broad command execution and per-application licensing expand maintenance.
- Activity: last push `2026-09-22T02:01:29Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/cli-anything-exa/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Matt Pocock Skills — B

Source: [mattpocock/skills](https://github.com/mattpocock/skills).

- Actual role, stack, local execution and interfaces: Markdown engineering skills with host installation scripts; instructions rather than an agent runtime.
- Integration, duplication, security and maintenance rationale: Curate selected planning/TDD/review skills into existing registry after hash/license review. No automatic script execution; duplicates existing skills.
- Activity: last push `2026-10-31T14:23:44Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Shell`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/engineering/pr/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Ruflo — D

Source: [ruvnet/ruflo](https://github.com/ruvnet/ruflo).

- Actual role, stack, local execution and interfaces: TypeScript agent harness, swarm coordination, plugins and memory; CLI/skills and host-agent integrations.
- Integration, duplication, security and maintenance rationale: Study failure recovery/routing only; replacing existing orchestrator adds competing durable state and broad transitive dependency surface. Compatibility not established.
- Activity: last push `2026-10-31T17:38:05Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json, Cargo.toml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Claude Plugins — C

Source: [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official).

- Actual role, stack, local execution and interfaces: Anthropic marketplace manifests, skills, commands, agents and optional MCP/hooks.
- Integration, duplication, security and maintenance rationale: Host-specific optional plugins; root license does not verify external plugin licenses. Hooks are executable code, Claude service entitlement is not a local inference dependency.
- Activity: last push `2026-10-31T17:02:18Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `plugins/hookify/hooks/stop.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Android Skills — B

Source: [android/skills](https://github.com/android/skills).

- Actual role, stack, local execution and interfaces: Modular SKILL.md Android development guidance, installed through Android CLI.
- Integration, duplication, security and maintenance rationale: Curated documentation adapter; not an emulator or APK analyzer. Android SDK/JDK/emulator separate and resource-heavy; audit any referenced scripts.
- Activity: last push `2026-10-29T10:12:00Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE.txt`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Kotlin`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `camera/camerax/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Scientific Agent Skills — C

Source: [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills).

- Actual role, stack, local execution and interfaces: Python/domain scientific skills and instructions, optional database/API access.
- Integration, duplication, security and maintenance rationale: Selective optional research tools only. Scientific packages, remote datasets/API keys and data licensing must be reviewed separately; little core engineering value.
- Activity: last push `2026-10-26T09:36:15Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE.md`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: pyproject.toml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/esm/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Cursor Plugins — F

Source: [cursor/plugins](https://github.com/cursor/plugins).

- Actual role, stack, local execution and interfaces: Cursor marketplace/plugin collection and skills, not a generic local orchestrator.
- Integration, duplication, security and maintenance rationale: No root license verified. Block importing code/assets until each plugin license and commercial host requirements are checked; duplicate skills.
- Activity: last push `2026-10-29T22:51:25Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `unverified`; license file `None`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `pstack/skills/bro/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### AI Memory — F

Source: [akitaonrails/ai-me](https://github.com/akitaonrails/ai-me).

- Actual role, stack, local execution and interfaces: Inaccessible: supplied GitHub path returns HTTP 404.
- Integration, duplication, security and maintenance rationale: Cannot distinguish private, renamed or nonexistent. License, runtime, interfaces and value unknown. Do not substitute another repository.
- Access: gh: Not Found (HTTP 404); all technical, license and maintenance findings unresolved.

### Kapathi Skills Extended — F

Source: [anshuxinha/karpath](https://github.com/anshuxinha/karpath).

- Actual role, stack, local execution and interfaces: Inaccessible: supplied GitHub path returns HTTP 404.
- Integration, duplication, security and maintenance rationale: Exact supplied name/path retained; no guessed correction. All capability/license/maintenance/hardware questions unresolved.
- Access: gh: Not Found (HTTP 404); all technical, license and maintenance findings unresolved.

### Delegate Router — D

Source: [pvjbuilds/delegate-router](https://github.com/pvjbuilds/delegate-router).

- Actual role, stack, local execution and interfaces: Python/Markdown delegation skill for Claude Code/Codex and other model CLIs; host validates resulting diff.
- Integration, duplication, security and maintenance rationale: Study decided/verifiable/contained routing gates; paid/subscription CLIs defeat mandatory-local strategy. Existing model router overlaps; do not import updater/install behavior.
- Activity: last push `2026-10-27T09:55:47Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/delegate/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Container — F

Source: [aerovato/container](https://github.com/aerovato/container).

- Actual role, stack, local execution and interfaces: TypeScript CLI for persistent local Docker/Podman project workspaces; agent skills.
- Integration, duplication, security and maintenance rationale: Potential sandbox adapter, but persistent workspaces and project mounts are not verified hostile-code isolation. Inspect mounts, root privileges, socket, egress and resource defaults before approving.
- Activity: last push `2026-10-23T04:08:31Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `BSD-3-Clause`; license file `LICENSE.md`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/tos.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### OpenSMS — B

Source: [daslearning-org/OpenSMS](https://github.com/daslearning-org/OpenSMS).

- Actual role, stack, local execution and interfaces: Python Android app turns a phone/default SIM into LAN SMS API gateway.
- Integration, duplication, security and maintenance rationale: Useful optional messaging adapter only. Requires physical phone, SMS permission, SIM/carrier charges; no built-in rate-limit promise. Do not follow advice to disable device protections; review signing and permissions.
- Activity: last push `2026-10-28T14:09:03Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `app/main.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Postiz — C

Source: [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app).

- Actual role, stack, local execution and interfaces: Self-hosted TypeScript social scheduling application with own services/database and platform integrations.
- Integration, duplication, security and maintenance rationale: Optional service API, not embedded module. AGPL duties, social API approvals/fees and publication consent; duplicates communications/creative workflows.
- Activity: last push `2026-10-31T13:31:48Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `AGPL-3.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `jest.config.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Voicebox — C

Source: [jamiepine/voicebox](https://github.com/jamiepine/voicebox).

- Actual role, stack, local execution and interfaces: Python backend/local AI voice studio with desktop/frontend tooling; model-specific acceleration and weights.
- Integration, duplication, security and maintenance rationale: Optional media service, not core. Test model terms, consent, audio retention and GPU/RAM independently; code MIT does not cover every voice model.
- Activity: last push `2026-10-07T01:17:58Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: package.json, requirements.txt, Dockerfile, docker-compose.yml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `backend/app.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Kdenlive — C

Source: [KDE/kdenlive](https://github.com/KDE/kdenlive).

- Actual role, stack, local execution and interfaces: C++/Qt/KDE desktop editor with MLT multimedia pipeline; local project/render workflows.
- Integration, duplication, security and maintenance rationale: Optional workstation rendering only; GPL source obligations and codec/media rights. GUI/display and renderer CPU/RAM requirements; do not embed Qt in Next.js.
- Activity: last push `2026-10-31T16:02:39Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `GPL-3.0`; license file `COPYING`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `C++`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/core.cpp`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### OpenShorts — C

Source: [mutonby/openshorts](https://github.com/mutonby/openshorts).

- Actual role, stack, local execution and interfaces: Local short-video production skill/workflow with supporting media tooling.
- Integration, duplication, security and maintenance rationale: Optional isolated creative worker; inspect media/runtime dependencies and asset rights. Model/provider costs conditional; duplicates other video tools.
- Activity: last push `2026-10-30T17:47:00Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: requirements.txt, Dockerfile, docker-compose.yml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/openshorts/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### MoneyPrinterTurbo — C

Source: [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo).

- Actual role, stack, local execution and interfaces: Python automated short-video workflow; CLI/UI and media/model integrations.
- Integration, duplication, security and maintenance rationale: Optional media tool. External stock-media/TTS/model services may cost money; FFmpeg and downloads require rights, scanning and bounded rendering.
- Activity: last push `2026-10-31T09:57:14Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: pyproject.toml, requirements.txt, Dockerfile, docker-compose.yml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `cli.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### OBS Studio — C

Source: [obsproject/obs-studio](https://github.com/obsproject/obs-studio).

- Actual role, stack, local execution and interfaces: Native C/C++ capture/compositing/encoding and streaming; plugins and documented APIs.
- Integration, duplication, security and maintenance rationale: Optional recording workstation; external publication requires approval. Capture device/display/encoder needs and GPL obligations; no need inside web core.
- Activity: last push `2026-10-29T21:06:06Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `GPL-2.0`; license file `COPYING`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `C`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `docs/sphinx/conf.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Rescript — E

Source: [wassgha/rescript](https://github.com/wassgha/rescript).

- Actual role, stack, local execution and interfaces: TypeScript/Next.js browser transcript media editor, Electron, Whisper/ONNX and FFmpeg WASM; local processing.
- Integration, duplication, security and maintenance rationale: PolyForm Noncommercial license blocks proposed general commercial adoption without separate permission. SharedArrayBuffer isolation, WebGPU/WASM and default telemetry also need review; independently design workflow without copying restricted code.
- Activity: last push `2026-10-29T17:31:28Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `NOASSERTION`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `lib/vad.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Presenton — B

Source: [presenton/presenton](https://github.com/presenton/presenton).

- Actual role, stack, local execution and interfaces: Presentation generation application/API, Docker and local Ollama configuration; own memory/media dependencies.
- Integration, duplication, security and maintenance rationale: Optional presentation adapter is valuable; isolate service and storage. Local mode requires configured model; optional image/search providers may add cost. Do not auto-start/install inference.
- Activity: last push `2026-10-30T05:48:05Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json, Dockerfile, docker-compose.yml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `electron/app/main.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Dify — D

Source: [langgenius/dify](https://github.com/langgenius/dify).

- Actual role, stack, local execution and interfaces: Python/TypeScript workflow application platform with own database, queues, plugins and APIs.
- Integration, duplication, security and maintenance rationale: Study integration contract patterns; modified Apache terms include multi-tenant and frontend branding conditions. Overlaps core heavily; no direct code/UI integration without legal review.
- Activity: last push `2026-10-31T17:20:11Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `NOASSERTION`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/difyctl/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Open SEO — C

Source: [every-app/open-seo](https://github.com/every-app/open-seo).

- Actual role, stack, local execution and interfaces: TypeScript self-hostable SEO app with MCP/skills and DataForSEO data dependency.
- Integration, duplication, security and maintenance rationale: Optional paid-data service; self-hosting does not eliminate DataForSEO costs. Use local authorized crawl/link/sitemap checks for no-paid-API baseline.
- Activity: last push `2026-10-31T02:28:19Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/env.d.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### WACRM — B

Source: [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm).

- Actual role, stack, local execution and interfaces: TypeScript/Next.js CRM template using Supabase and official Meta WhatsApp API; REST /api/v1, scoped keys and MCP.
- Integration, duplication, security and maintenance rationale: Optional service adapter; Supabase PostgreSQL is not drop-in AgentOS MySQL. Meta consent/templates/webhook signatures, privacy and messaging fees required; duplicates CRM panels.
- Activity: last push `2026-10-30T09:26:38Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json, Dockerfile, docker-compose.yml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `src/lib/utils.ts`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Mailcheap — C

Source: [marclou/mailcheap](https://github.com/marclou/mailcheap).

- Actual role, stack, local execution and interfaces: JavaScript/Node 22+ newsletter app with REST/MCP/OAuth and sending workflows.
- Integration, duplication, security and maintenance rationale: Optional separate service; AGPL and sending-provider/deliverability costs. Human-approved send, suppression lists, unsubscribe and replay safety mandatory; overlaps communications.
- Activity: last push `2026-10-31T08:34:38Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `AGPL-3.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `JavaScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `none captured`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### HyperFrames — B

Source: [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes).

- Actual role, stack, local execution and interfaces: TypeScript/Node 22+ deterministic HTML/CSS/media to MP4 framework; local CLI, skills and rendering workflows.
- Integration, duplication, security and maintenance rationale: Useful optional rendering adapter; version differs from Node >=20 core floor. Separate image/worker; render untrusted HTML offline, cap resources and review codecs/assets.
- Activity: last push `2026-10-31T17:40:45Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `Apache-2.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `TypeScript`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/figma/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Diagram Design — B

Source: [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design).

- Actual role, stack, local execution and interfaces: HTML/SVG diagram skill and style references with host plugin/CLI installation patterns.
- Integration, duplication, security and maintenance rationale: Low-cost curated skill, not diagram execution backend. Sanitize generated SVG/HTML; preserve notices, no blind installer; overlaps documentation diagrams.
- Activity: last push `2026-10-27T20:01:35Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `HTML`; root manifests inspected: none captured; nested requirements remain unverified.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/diagram-design/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### Text to CAD — C

Source: [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad).

- Actual role, stack, local execution and interfaces: Python build123d/Open CASCADE modeling plus JS workspace/viewer, CLI/MCP and skills; local exports.
- Integration, duplication, security and maintenance rationale: Optional sandboxed CAD worker; generated Python is untrusted code. Large native geometry dependencies, fabrication services and model/asset rights; no automatic procurement.
- Activity: last push `2026-10-31T16:13:56Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `MIT`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: package.json.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `skills/cad/SKILL.md`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

### VoiceStudio — C

Source: [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio).

- Actual role, stack, local execution and interfaces: Python voice/transcription backend, Electron/frontend tooling, local API/MCP and model workflows.
- Integration, duplication, security and maintenance rationale: Optional independent voice service; AGPL or separate commercial license, model license review and cloning consent. Overlaps Voicebox; benchmark only one candidate initially.
- Activity: last push `2026-10-31T17:38:33Z`; archived `False`; disabled `False`. Support quality not verified.
- License: GitHub detection `AGPL-3.0`; license file `LICENSE`. See compliance matrix for actual restrictions.
- Runtime evidence: primary language `Python`; root manifests inspected: package.json, pyproject.toml.
- Hardware: no AgentOS benchmark performed; upstream exact minimum and workload sizing **unverified**. Use worker-class estimates in [infrastructure plan](INFRASTRUCTURE_PLAN.md), not as vendor minimums.
- Representative source/skill sample: `backend/main.py`. Full nested dependency graph, platform compatibility and vulnerabilities require follow-up before adoption.

## Website and collection access register

| Resource | Exact URL | Decision and disposition |
|---|---|---|
| Innovation Insight | https://www.innovation-insight.com/ | F — inaccessible under sandbox network policy. Research site; content and license unverified. |
| TestSprite | https://www.testsprite.com/ | F — inaccessible under sandbox network policy. Commercial testing service candidate; pricing, APIs and self-hosting unverified; alternatives: Playwright, Vitest, axe-core. |
| CodeRabbit | https://www.coderabbit.ai/ | F — inaccessible under sandbox network policy. Commercial review service candidate; pricing/data handling unverified; alternative: local review agent plus static analysis. |
| Tripo | https://studio.tripo3d.ai/ | F — inaccessible under sandbox network policy. Hosted 3D service candidate; API/pricing/asset rights unverified; alternative: local CAD workflow. |
| GodsViewAI | https://godsviewai.com/globe | F — inaccessible under sandbox network policy. Visualization reference; no source/API/license established. |
| Riverside | https://riverside.com/ | F — inaccessible under sandbox network policy. Hosted recording candidate; prices/API/export rights unverified; alternative: OBS and local audio pipeline. |
| WACRM docs | https://wacrm.tech/docs/getting-started | F — inaccessible under sandbox network policy. Documentation URL unverified independently; repository evidence available. |
| Supabase | https://supabase.com | F — inaccessible under sandbox network policy. DB/auth candidate; website terms/version not inspected; PostgreSQL-specific side service, not MySQL replacement. |
| Meta for Developers | https://developers.facebook.com/ | F — inaccessible under sandbox network policy. Official communications policy/API verification blocked; must verify current requirements before messaging. |
| ngrok | https://ngrok.com | F — inaccessible under sandbox network policy. Tunnel service candidate; pricing/agent license unverified; optional only, authenticated reverse proxy/VPN alternative requires approval. |
| TrustMRR | https://trustmrr.com/ | F — inaccessible under sandbox network policy. Revenue/reporting research reference; source/license/API unavailable. |
| DataFast | https://datafa.st/ | F — inaccessible under sandbox network policy. Analytics service candidate; pricing/data residency unverified; local first-party event aggregation alternative. |
| WebTracky | https://webtracky.com/ | F — inaccessible under sandbox network policy. Analytics reference; features/stack/license unverified. |
| StartupMap | https://startupmap.lol | F — inaccessible under sandbox network policy. Visualization reference; features/source/license unverified. |
| Buildonaut | https://buildonaut-yt.netlify.app/ | F — inaccessible under sandbox network policy. Resource collection; linked research resources cannot be enumerated here. |
| Treg | https://treg.to/ | F — inaccessible under sandbox network policy. Research resource; content, stack, terms and links unverified. |
| Notion collection | https://iodized-curio-93a.notion.site/TIDALIA-3ddf8f4ea45780ebb507e57bd46cfd49 | F — inaccessible under sandbox network policy. Collection; content/permissions/linked resources unverified. |
| ALO Labs references | https://luxury-malasada-c4ced6.netlify.app/ | F — inaccessible under sandbox network policy. Reference collection; source/asset licenses not established. |

## Unresolved/truncated references

No shortened URLs or redirect strings were actually supplied, so redirect resolution is impossible. HyperFrames, Diagram Design, Billion Context and Text to CAD have explicit full GitHub paths elsewhere in the prompt; those paths alone were evaluated, not inferred redirect destinations. SwiftUI Skills has no complete path and remains F/unresolved. “God’s Eye View” cannot be equated reliably with GodsViewAI; keep F/unresolved. YouTube redirects to TestSprite/Tripo/other tools and unspecified promotional downloads remain F/unresolved. Ask the owner for original exact links; never download assets just from promotional labels.

## Follow-up before any integration

Pin a source commit/release, inspect the actual runtime path and all nested manifests, produce SBOM/transitive-license and vulnerability reports, assess maintainer response history, confirm costs and model/asset terms, and execute a synthetic-tenant adapter contract test in isolation. No tool has passed those gates in this audit. Website-only entries need owner-supplied permitted evidence or an approved research environment; inaccessible does not mean rejected.
