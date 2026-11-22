# MetaGPT and related open-source projects

Snapshot: 2026-11-19. Source: [GitHub MetaGPT topic](https://github.com/topics/metagpt), enumerated via the repository search API (`topic:metagpt`). Topic membership is self-reported and changes over time. This is a discovery register, not a list of installed models.

**Start with [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT)** for role-based collaboration. Compare [AgileCoder](https://github.com/FSoft-AI4Code/AgileCoder) for iterative software development. These are frameworks, not LLM weights. Neither is enabled in AgentOS by this intake.

## Local model candidates

The existing [model catalog](../src/lib/open-source-models.ts) includes [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) and [Mistral-7B-Instruct-v0.3](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3). Start with one small local model, confirm its exact weight license and hardware requirements, then test structured outputs and role handoffs. Free-to-download software does not guarantee free hosted inference. Local compute still costs money; do not silently fall back to paid APIs.

## Topic inventory

| Repository | GitHub-detected code license | Intake decision |
|---|---|---|
| [Afolabiebu4567/-MetaSkins-Access-All-In-Game-Skins-Exclusive-Custom-Sets](https://github.com/Afolabiebu4567/-MetaSkins-Access-All-In-Game-Skins-Exclusive-Custom-Sets) | Not detected | Hold — verify reuse rights |
| [Creator54/metagpt-runner](https://github.com/Creator54/metagpt-runner) | MIT | Reference only — assess relevance before adoption |
| [CuongNguyen-3115/AI_Financial](https://github.com/CuongNguyen-3115/AI_Financial) | Not detected | Hold — verify reuse rights |
| [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) | MIT | Priority framework candidate |
| [FSoft-AI4Code/AgileCoder](https://github.com/FSoft-AI4Code/AgileCoder) | MIT | Priority framework candidate |
| [huaweicloud-samples/ai-openmanus-image](https://github.com/huaweicloud-samples/ai-openmanus-image) | Not detected | Hold — verify reuse rights |
| [imMamdouhaboammar/Riftbook](https://github.com/imMamdouhaboammar/Riftbook) | MIT | Archived — reference only |
| [joyozhang333-lgtm/awesome-ai-organization](https://github.com/joyozhang333-lgtm/awesome-ai-organization) | NOASSERTION | Hold — verify reuse rights |
| [kemeny/PongGame](https://github.com/kemeny/PongGame) | Not detected | Hold — verify reuse rights |
| [ManusClawAI/ManusClaw](https://github.com/ManusClawAI/ManusClaw) | NOASSERTION | Hold — verify reuse rights |
| [MARYAMJAHANIR/Exploring-ChatGPT-Alternatives-Open-Source-LLM-Performance-Integration-and-Use-Cases](https://github.com/MARYAMJAHANIR/Exploring-ChatGPT-Alternatives-Open-Source-LLM-Performance-Integration-and-Use-Cases) | Not detected | Hold — verify reuse rights |
| [NytePlus/Code-Cube](https://github.com/NytePlus/Code-Cube) | Not detected | Hold — verify reuse rights |
| [octadecimal-ai/hydra-agent-orchestration-showcase](https://github.com/octadecimal-ai/hydra-agent-orchestration-showcase) | Not detected | Hold — verify reuse rights |
| [RightRudderAI/right-rudder](https://github.com/RightRudderAI/right-rudder) | MIT | Reference only — assess relevance before adoption |
| [rollczi-playground/catboy-service-ai](https://github.com/rollczi-playground/catboy-service-ai) | Not detected | Archived — reference only |
| [scmpevatrons/ai-chatverse](https://github.com/scmpevatrons/ai-chatverse) | Apache-2.0 | Reference only — assess relevance before adoption |
| [startino/aitino](https://github.com/startino/aitino) | NOASSERTION | Hold — verify reuse rights |
| [stephen-devops/metaGPT_Volopa_OOP](https://github.com/stephen-devops/metaGPT_Volopa_OOP) | MIT | Reference only — assess relevance before adoption |
| [svignesh7/po-gen-ai](https://github.com/svignesh7/po-gen-ai) | MIT | Reference only — assess relevance before adoption |
| [vignesh-s7/product-management](https://github.com/vignesh-s7/product-management) | MIT | Reference only — assess relevance before adoption |
| [Vincentwei1021/awesome-ai-agent-frameworks](https://github.com/Vincentwei1021/awesome-ai-agent-frameworks) | MIT | Reference only — assess relevance before adoption |
| [violettance/metagpt](https://github.com/violettance/metagpt) | Not detected | Hold — verify reuse rights |
| [vivy-yi/awesome-agent-orchestration](https://github.com/vivy-yi/awesome-agent-orchestration) | NOASSERTION | Hold — verify reuse rights |
| [youkpan/PanOS](https://github.com/youkpan/PanOS) | Not detected | Hold — verify reuse rights |

## Gate before integration

Select one repository and pin a revision. Review its license, dependencies and model/backend requirements separately. Use a disposable workspace with synthetic tasks, no production credentials, no paid fallback and no deployment privileges. Require human review before applying generated changes. Record results before registering any adapter as available.
