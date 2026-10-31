# License compliance

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## License evidence and commercial-use gates

License texts retrieved through GitHub are preserved in [raw evidence](phase0/resource-evidence.json). Detection alone is not legal certification. This matrix verifies only accessible root text, not all subdirectories, vendored binaries, model weights, assets or transitive dependencies. No candidate has been newly integrated. AgentOS root has no standalone LICENSE file in the inspected inventory; ownership/distribution terms should be confirmed before publishing source or binaries.

MIT/BSD generally permit commercial use with notices; Apache-2.0 adds patent/NOTICE duties; GPL/AGPL allow commercial use but impose applicable source/redistribution/network obligations. AGPL is not “noncommercial.” Isolating a service is architectural containment, not legal exemption. Obtain legal review of the specific distribution and deployment model.

| Resource | Root license evidence | Commercial/distribution disposition |
|---|---|---|
| REA | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| AnyPS5 | GPL-2.0; root text retrieved | Commercial use subject to GPL obligations; review exact only/or-later language. |
| Ghidra | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Billion Context | MIT text + additional product-surface attribution term (custom; NOASSERTION) | Not plain MIT; visible attribution and kernel notices required; independent design preferred. |
| OpenCode | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Scrapling | BSD-3-Clause; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| CLI-Anything | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Matt Pocock Skills | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Ruflo | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Claude Plugins | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Android Skills | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Scientific Agent Skills | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Cursor Plugins | UNVERIFIED | No adoption/copying until actual license established; 404 or missing license is not permission. |
| AI Memory | UNVERIFIED | No adoption/copying until actual license established; 404 or missing license is not permission. |
| Kapathi Skills Extended | UNVERIFIED | No adoption/copying until actual license established; 404 or missing license is not permission. |
| Delegate Router | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Container | BSD-3-Clause; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| OpenSMS | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Postiz | AGPL-3.0; root text retrieved | Commercial use subject to AGPL network/source obligations; separate license may be offered. |
| Voicebox | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Kdenlive | GPL-3.0; root text retrieved | Commercial use subject to GPL obligations; review exact only/or-later language. |
| OpenShorts | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| MoneyPrinterTurbo | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| OBS Studio | GPL-2.0; root text retrieved | Commercial use subject to GPL obligations; review exact only/or-later language. |
| Rescript | PolyForm Noncommercial 1.0.0 (NOASSERTION) | Reject commercial incorporation absent separate permission; do not copy restricted implementation. |
| Presenton | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Dify | Dify Open Source License (modified Apache; NOASSERTION) | Multi-tenant service and frontend logo/copyright restrictions; seek applicable commercial permission/legal review. |
| Open SEO | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| WACRM | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Mailcheap | AGPL-3.0; root text retrieved | Commercial use subject to AGPL network/source obligations; separate license may be offered. |
| HyperFrames | Apache-2.0; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Diagram Design | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| Text to CAD | MIT; root text retrieved | Commercial use generally permitted with required notices; nested content unverified. |
| VoiceStudio | AGPL-3.0; root text retrieved | Commercial use subject to AGPL network/source obligations; separate license may be offered. |

OBS README explicitly says GPL v2 or later; AnyPS5 README says GPL v2 only. VoiceStudio manifests state AGPL-3.0-only and describe separate commercial licensing. Do not infer those qualifiers from GitHub SPDX classification alone. Claude/Cursor marketplace entries need plugin-by-plugin terms. Website-only resources, shortened references, model weights and downloaded assets all remain license-unverified.

## Existing dependency verification gap

`package-lock.json` and `bun.lock` preserve versions; no package installation or advisory scan was performed. Their presence is not proof all dependencies have verified licenses. `z-ai-web-dev-sdk`, model-provider dependencies, native libraries and frontend assets need explicit inventory and review. Run a locked SBOM/license scan in approved CI, attach artifact hashes, resolve incompatible/unknown licenses, then approve additions. Existing notices under `src/lib/agent-skills/THIRD_PARTY_NOTICES.md` must be preserved and checked against pinned catalog sources.
