# Shared memory discovery and target contract

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Existing evidence

`src/lib/memory` uses Prisma-backed short/long-term memory; types include companyId, scope, timestamps, expiry and metadata. DB mapping uses rank/confidence and source/key. Tenant knowledge and retrieval helpers also exist. Current memory comments mention SQLite, but production datasource policy is MySQL/MariaDB; comments do not certify deployed storage. Mandatory project ownership/provenance semantics and cross-tenant correctness are not proven by these types.

## Additive target model

Every memory record must carry project and tenant ownership, memory kind (project/repository/agent/documentation/decision/error/history/verified architecture), source URI/commit/artifact hash, source capture timestamp, creation/update time, confidence with reason, verifying actor/evidence, trust level, retention expiry and applicable access policy. Distinguish observation, hypothesis, model output and human-verified fact. Do not overwrite original evidence with generated summaries.

All store/read/search/export operations scope project/tenant server-side before retrieval; vector filtering must enforce the same scope, not post-filter after exposing content. “Global/shared” is explicit opt-in sanitized material, never implicit company-to-company sharing. Untrusted retrieved documents are quoted data and cannot grant permissions or alter system policy.

## Retention and safety proposal

Owner-approved retention classes with legal holds; short-term context expires quickly, durable decisions retain provenance, sensitive artifacts use encryption and narrow access. Deletion is a privileged approved operation with preview/count, backup implications and audit record; do not erase current memories during discovery. Propagate approved deletion/tombstones to indexes/caches and document backup expiry. Embeddings can still encode confidential information.

Test tenant/project and agent access boundaries, injection, provenance integrity, low-confidence summaries, cache keys, export ACLs and deletion/reindex recovery before claiming safe shared memory. No new schema, embedding model, index, retention job or deletion was created in Phase 0.
