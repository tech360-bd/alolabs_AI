# Unified Media and Marketing Workspace

Status: partial · 2026-11-25

## 1. What exists

| Capability | State | Evidence |
| --- | --- | --- |
| Media job abstraction | Implemented | `src/lib/media-generation/index.ts` (`generate`, `getJob`, `listJobs`, job store), `requests.ts`, `transcribe.ts` |
| Image generation / editing | Implemented (provider-dependent) | `/api/image-studio/generate`, `src/app/api/image-studio/*` |
| Video | Partial | `/api/video-studio`, `/api/video-hub`, `src/lib/integrations/connectors/media/video-gen.ts` |
| Voice / TTS / ASR / music | Implemented | `src/lib/voice/`, `/api/voice*`, `/api/avatar-voice`, `/api/music-studio`; models `TtsJob`, `AsrJob`, `VoiceConsent`, `VoiceLibraryItem` |
| Brand profile | Partial | `Brand` model: logo, colours, font, CSS, favicon, email logo — no tone of voice, messaging, restrictions |
| Marketing content | Partial | `src/lib/seo/`, `src/lib/marketing-kit/`, workflow definitions (`digital-marketing`, `proposal-factory`) |
| Social publishing | Partial | `src/lib/social/` clients; no certified publishing path |
| Campaign orchestration | **Missing** | No campaign run that chains research → copy → image → video → approval → schedule → report |
| Asset provenance | Partial | `Artifact`, `Output`, `OutputVersion`; media jobs store provider/model settings in job metadata |
| Cost attribution | Partial | `ModelUsageRecord`, `UsageLog` cover text models; media cost capture unverified |

## 2. Brand profile requirements

Current `Brand` covers visuals. Tenant-isolated marketing needs:

| Field group | Needed | Status |
| --- | --- | --- |
| Logo, colours, typography | yes | Present |
| Tone of voice, approved messaging | yes | **Missing** |
| Product/service descriptions | yes | Partly in `CompanySettings`/knowledge |
| Image guidelines, restrictions | yes | **Missing** |
| Social profiles | yes | Handled by social link state, not the brand profile |

Adding these is a low-risk additive migration on a per-tenant table
(`Brand.companyId` is unique). It must ship with a backup per the destructive-op
policy only if existing columns change — additive columns do not.

## 3. Asset provenance contract

Every generated asset must record:

- owning company and project;
- creating agent and run id;
- provider + model + generation settings;
- timestamp and cost;
- licence/usage notes from the provider terms (**no** copyright claim beyond them);
- approval status (draft / approved / published);
- version history (`OutputVersion`).

If a provider does not return generation settings, record `unavailable` rather
than guessing.

## 4. Campaign pipeline (target)

```
brief → audience/objective → strategy → copy → image set → optional video/voice
     → brand consistency review (against Brand profile)
     → platform-specific variants
     → human approval (content.publish)
     → schedule/publish through a connected channel (external.communicate)
     → performance reporting (analytics connector, if connected)
```

Every stage is a step with persisted status. Nothing may be marked "published"
without a provider confirmation id; otherwise the state is `scheduled_unconfirmed`
or `failed`.

## 5. Governance mapping

| Action | Class | Outcome |
| --- | --- | --- |
| Generate an image | `media.generate` (normal) | automatic within quota |
| Voice clone / real likeness, declared high risk | `media.generate` + `LEGAL-IP-001` | requires recorded consent, else denied |
| Publish a post | `content.publish` (high) | approval |
| Send a campaign email | `external.communicate` (high) | approval |
| Paid media provider | `providerKind: paid` | requires `costAuthorized` |
| Regulated advert (finance/health) declared high | `LEGAL-ADVICE-001` | human review evidence |

## 6. Gaps

1. Campaign orchestration (no campaign run model/state machine).
2. Brand voice/messaging fields.
3. Social publishing certification + platform-specific limits.
4. Media cost accounting in quota enforcement.
5. Provider capability registry (which provider supports which modality, at what
   cost and licence) — partly `src/lib/ai-provider-catalog.ts`, media not covered.

## 7. Honest product statement

The platform can generate images and audio where a provider is configured, and can
write marketing copy. It cannot currently publish to a social platform or send a
campaign without a connected channel, and video generation is provider-dependent
and unverified. The workspace must surface those states rather than hide them.
