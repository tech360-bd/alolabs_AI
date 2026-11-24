# Open-source integration evaluation

Per the project's integration policy, a third-party project is only adopted after
its licence, commercial restrictions, maintenance status, dependency risk,
architecture fit and resource cost are recorded. **Evaluating is not adopting**:
nothing in this document has been installed, vendored or wired into the
application.

Legend, per the phase-15 status vocabulary:

- **VERIFIED COMPLETE** — evidence executed and observed in this repository.
- **IMPLEMENTED — NOT VERIFIED** — code exists and runs locally, but the
  end-to-end claim has not been executed against real infrastructure.
- **PARTIALLY COMPLETE** — some of the scope is real, some is outstanding.
- **BLOCKED** — cannot proceed without access, hardware, credentials or approval.
- **NOT IMPLEMENTED** — no code, no execution.

---

## 1. neondatabase/neon — serverless PostgreSQL

| Field | Value |
|---|---|
| Licence | Apache-2.0 |
| Commercial restriction | None on the code. The managed cloud, autoscaling and control plane at neon.com are a separate commercial product; the storage engine and Postgres modifications are open. |
| Maintenance | Active. Acquired by Databricks (2025); repo ~21k+ stars |
| Language / stack | Rust (pageserver, safekeeper/WAL service), C (Postgres patches), Linux + Kubernetes/S3 |
| Feature overlap with this repo | None. It is a database substrate, not an agent, router, queue or memory system — it does not duplicate ALO AIRouter, JobQueue, the workflow engine or the memory layer. |

**Architecture fit.** The repository's Prisma datasource is SQLite for
dev/CI and MySQL for production (`prisma/schema.prisma` @ `provider = "sqlite"`,
`prisma/schema.mysql.prisma` generated from it). Neon speaks the **Postgres**
wire protocol, so it is *not* a drop-in for either. Adopting it would mean a third
Prisma datasource and a re-validation of every migration and query path — a
schema-provider change, not a config change.

**Where it would genuinely help.** Its distinguishing feature is cheap
copy-on-write branching, which maps onto this project's weakest database area:
the 13 flat SQL migrations, the absent `migration_lock.toml`, `db push` in
`scripts/build.sh`, and the masked failure in `scripts/deploy.sh`. A disposable
branch per migration test would give every replay the isolation the phase-3
disposable-MySQL plan currently has to synthesise by hand.

```
Recommendation:  DO NOT ADOPT NOW
Reason:          Postgres is a different wire protocol from the MySQL production
                 target; adopting it is a database migration project of its own,
                 and none of its benefit is needed to fix migration
                 reproducibility, which needs MySQL.
Revisit when:    a Postgres target is chosen for another reason, or the
                 migration plan needs throw-away branches and a self-hosted
                 instance has been provisioned and costed.
Cost of trial:   one Kubernetes/S3 environment, or a paid cloud branch.
Status:          NOT IMPLEMENTED (deliberately)
```

## 2. NdoleStudio/httpsms — Android phone as SMS gateway

| Field | Value |
|---|---|
| Licence | **AGPL-3.0** |
| Commercial restriction | **Yes, meaningful.** AGPL-3.0 §13 obliges anyone who lets users interact with a modified version over a network to offer those users the Corresponding Source. For a hosted multi-tenant platform this is a real, ongoing obligation, not a formality. |
| Maintenance | Active (commits within the last month at time of review) |
| Language / stack | Go + Fiber API, CockroachDB (Postgres for self-host), Nuxt/Vuetify web UI, native Kotlin Android app, Firebase Cloud Messaging |
| Feature overlap with this repo | **Partial.** `src/lib/whatsapp/` already implements a tenant-scoped messaging inbox with its own config, client and handler modules, and the repo already has a WhatsApp inbound inbox (`src/lib/whatsapp/inbox.ts`). httpsms is an SMS transport, so it would sit *beside* that, not replace it. |

**Architecture fit — the part that matters.** This app is a self-hosted
platform that a Super Admin operates on behalf of multiple tenants. AGPL-3.0's
network clause attaches to the *combined work as offered to users*. Driving a
modified httpsms from the platform over HTTP is the safer boundary; **copying its
Go source into this repo, or forking the Android app and shipping it, is not**
and would put the whole repository's licensing at risk. That distinction decides
the integration shape before any code is written.

**Operational reality beyond licensing.** The gateway requires a physical
Android phone with an active SIM, Firebase Cloud Messaging for delivery, and an
API + CockroachDB/Postgres deployment. That is real hardware and a third stateful
service. It is also untested ground for this project's reliability posture: SMS
delivery is asynchronous and carrier-dependent, so "sent" is not "delivered",
and the existing inbox already models inbound messages without it.

```
Recommendation:  DO NOT ADOPT NOW — and specifically, do not vendor it
Reason:          (a) AGPL-3.0 network-copyleft is a poor fit for a hosted
                 multi-tenant platform unless consumed strictly as an external
                 HTTP service; (b) it needs dedicated hardware (a phone + SIM)
                 and its own database; (c) the repository already has a
                 tenant-scoped WhatsApp messaging path, so scope overlap exists
                 on the inbound side.
Safe integration shape, if approved later:
                 treat it as an EXTERNAL HTTP SERVICE behind the existing
                 `src/lib/integrations/` connector + `guardedFetch` SSRF guard,
                 with the URL on an allowlist and credentials in the secret
                 store. No AGPL source copied into this repository.
Status:          NOT IMPLEMENTED (deliberately)
```

---

## Summary

Neither project is adopted, and neither is blocked on missing information —
both were declined on recorded technical grounds. No dependency was added, so the
production dependency advisory gate (`npm audit --omit=dev`) and the pinned
lockfile are unaffected.

The single integration idea worth carrying forward is **Neon-style disposable
database branching as a test technique** for the phase-3 migration work, which
can be approximated with a disposable MySQL schema-per-run without adopting
Postgres at all.
