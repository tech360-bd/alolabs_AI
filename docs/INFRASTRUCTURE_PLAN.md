# Infrastructure compatibility and discovery requirements

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Topology preserved, readiness unknown

| Location | Owner-intended role | Verification status |
|---|---|---|
| Hostinger Cloud | Public production app and primary database, subject to capacity | No server login, live capacity or database inspection; not certified ready. |
| Office A | Database replica or warm recovery target | Engine/version, replication support, lag, consistency, encryption and restore path unknown. |
| Office B | CI/build, staging, monitoring and backup copy | Hardware, isolation, storage, workers and uptime unknown. |
| Offsite | Encrypted backup independent of primary sites | Storage, keys, retention, immutability and restoration unverified. |

Do not assume active-active or change the topology. Confirm MySQL/MariaDB actual versions and supported replication before designing a replica. A warm backup/restore target may be appropriate where replication cannot be verified. A replica is not a backup.

## Read-only inventory checklist (needs authorized host session)

CPU/architecture/cgroup limits; physical and container RAM/swap; GPU/VRAM; disk space/IOPS/mounts; actual database type/version/schema/row counts/size; runtime versions/process manager; current traffic/queue depth; firewall and network routes; DNS/TLS/reverse proxy; service accounts and secret locations (names only); monitoring; backup schedules, encryption/key custody and restore evidence. Review `deploy/scripts/inventory-data-sources.sh` before authorized use. Do not source application environment files or print secrets into audit logs.

No production measurements were obtained. Sandbox capacity would not establish Hostinger or office capacity, so no production sizing claim is made.

## Preliminary budget estimates, not vendor minimums

| Workload class | Initial planning envelope | Conditions |
|---|---|---|
| Web/core staging | 2–4 vCPU, 4–8 GiB RAM, separate DB budget | Measure actual Next build/runtime and DB working set before committing. |
| CI/browser worker | 2–4 vCPU, 4–8 GiB RAM per limited job | Start one job; browser/native build peaks can exceed this. |
| Android/binary worker | 4+ vCPU, 8–16+ GiB RAM | Emulator acceleration and binary size affect needs; not measured. |
| Media/CAD worker | 4+ vCPU, 8–16+ GiB RAM plus scratch | Codec/model/geometry complexity may require GPU and much more. |
| Local inference | Model-specific RAM/VRAM + context/KV cache + headroom | Do not approve 32B/72B models on modest hardware; benchmark a licensed small quantized model first. |

These are conservative starting envelopes for experiments, **not validated fit, throughput, bill of materials or upstream exact requirements**. Run one pilot at a time, cap memory/CPU/time/disk and inference concurrency, bound queues, prioritize interactive work, and expose overload/backpressure honestly. Keep untrusted execution and inference off public production if capacity/isolation cannot be demonstrated.

## Local model acceptance gate

Verify engine/model license and pinned digest, host resource profile, health endpoint, successful actual generation, measured latency/quality and peak memory, context/token limits, cancellation, admission control and local-only network behavior. Existing Ollama/OpenAI-compatible adapters are useful but no model was configured or tested here. Local speech/embedding/vision are independent gates; no GPU or model installation authorized.
