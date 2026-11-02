# Requested agent projects: integration status

Audit date: 2026-11-02. This report describes what is in this checkout, not what has been deployed or verified against a live model. The source-of-truth skill inventory is `src/lib/agent-skills/catalog.json`; the importer pins commits in `scripts/sync-agent-skills.mjs`.

| Requested project | Status in this checkout | What is still missing |
|---|---|---|
| [REA](https://github.com/morluto/rea) | Five instruction documents cataloged, all quarantined. | No REA executable integration; quarantined instructions cannot be selected. Authorized reverse engineering requires a separate isolated, permissioned design. |
| [Local REA example](https://github.com/network-tocoder/Local-REA-Reverse-Engineering-125B-16GB-GPU) | Not integrated. Its repository describes an example using REA, Ghidra and local inference, rather than an AgentOS plugin. GitHub metadata did not identify a license. | License review, hardware/model and deployment validation, isolated execution and authorization controls. A 16 GB GPU alone is not evidence that the example will run here; its README describes substantial system RAM too. |
| [Claude Plugins Official](https://github.com/anthropics/claude-plugins-official) | 33 skill documents cataloged: 25 advisory, 8 quarantined. | No executable plugin installation or blanket approval of individual plugin terms. |
| [Ruflo](https://github.com/ruvnet/ruflo) | Evaluated in `docs/RESOURCE_AUDIT.md`; not integrated. | Compatible adapter, isolation, credential and cost controls, and tests. Existing AgentOS orchestration is not Ruflo. |
| [Android Skills](https://github.com/android/skills) | 36 advisory instruction documents cataloged. | No upstream scripts or tooling installed; live model execution not verified here. |
| [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills) | 177 advisory instruction documents cataloged. | No upstream scripts or research tools installed; live model execution not verified here. |
| [OpenCode](https://github.com/anomalyco/opencode) | Evaluated in `docs/RESOURCE_AUDIT.md`; not integrated. | Adapter, isolated coding environment, repository permissions, provider configuration and tests. |
| [CLI-Anything](https://github.com/HKUDS/CLI-Anything) | 151 instruction documents cataloged, all quarantined. | No desktop application control or CLI harness integration. |
| [Cursor Plugins](https://github.com/cursor/plugins) | Evaluated in `docs/EXTERNAL_PROJECT_INTAKE.md`; not integrated. | License and individual plugin review, compatibility and security assessment. |
| AI Memory | Seven documents from [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) are cataloged, all quarantined. The request did not include an AI Memory URL, so this identification is not confirmed. | No external shared-memory integration; tenant isolation, retention, access and security controls need review. |
| [Presenter](https://github.com/bisque-cloud/presenter) | Three advisory instruction documents cataloged. | The Presenter application, presentation rendering and narration are not installed or verified by the skill import. |

## Meaning of cataloged

Advisory entries are instruction-only guidance, eligible for task-based selection by the Command Agent (`src/lib/command-agent/agent.ts`). Quarantined entries are not selected or injected. No skill import grants tools or installs upstream applications, dependencies, scripts or models. The database registry installer is optional and does not automatically assign skills; its execution or production deployment has not been verified in this audit. See [Agent Skills](AGENT_SKILLS.md) for the architecture and installation commands.

To verify the committed catalog's integrity and policy invariants locally, run `npm run skills:verify`. This verifies catalog consistency, not end-to-end behavior of the external projects or live AI provider calls. Projects marked not integrated or quarantined should not be represented as working integrations merely because they are listed here. Review license terms and security boundaries before bringing in third-party code or granting executable tools.
