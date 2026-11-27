# Server Capacity Plan — 16 GB RAM / 520 GB SSD, shared host

> Target: **16 GB RAM, 520 GB SSD**, running **this project first** and other
> projects alongside it. Every number below is enforced by a file in this
> repository and checked in CI, not aspirational.
>
> Verified 2026-11-26 against `docker-compose.yml`, `docker-compose.prod.yml`,
> `code deploy`, `deploy/scripts/backup.sh`, `deploy/scripts/lib/publish-snapshot.py`.

---

## 1. Measured footprint of this project

| Item | Size | Where it comes from |
|---|---|---|
| Source tree (excl. `node_modules`) | **66 MB** | `du -sh --exclude=node_modules .` |
| `node_modules` (build-time only) | **1.1 GB** | Not shipped in the runtime image |
| Docker runtime image | **~400–600 MB** | `node:22-bookworm-slim` + standalone server + Prisma engine |
| RAM, core stack at rest | **~1.2–1.8 GB** | app + Redis + Qdrant + MinIO + Caddy |
| RAM, peak during `next build` | **~2 GB** | typecheck + compile + generate, single process |
| Disk growth vector | **uploads + backups** | `storage/`, `uploads/`, `db/backups/` |

The repository itself is small. The cost is runtime (RAM) and **disk growth** —
object storage and backups, not code.

## 2. The budget (this file is the contract)

`docker-compose.capacity.yml` + `deploy/systemd/alolabs-agentos-slice.conf`
encode exactly these numbers. `scripts/validate-capacity.mjs` fails CI if the
two disagree.

| Service | Ceiling | Notes |
|---|---|---|
| `app` | 3.0 GB | Next.js standalone **+ in-process worker** (`src/instrumentation.node.ts`) |
| `redis` | 768 MB | `--maxmemory 512mb` + AOF overhead |
| `qdrant` | 1.5 GB | vectors + HNSW index |
| `minio` | 768 MB | object store; disk is the real cost |
| `caddy` | 256 MB | TLS + reverse proxy |
| `prometheus` | 768 MB | 30-day local TSDB |
| `grafana` | 512 MB | dashboards |
| **Core total** | **7.5 GB** | default `docker compose up` set |
| `mariadb` | 1.5 GB | `tools` profile only — separate DB provisioning is preferred |
| `queue-service` | 512 MB | `sockets` profile only |
| `realtime-service` | 512 MB | `sockets` profile only |
| **All-in total** | **10.0 GB** | hard ceiling this project may ever use |
| **Left for other projects** | **6.0 GB** | including host + dockerd (~1 GB) |

Core stack (7.5 GB) + build headroom (2 GB) = 9.5 GB, inside the 10 GB share.
That is deliberate: **you must be able to rebuild while the stack is running**
without OOM-killing a neighbour.

### What was wrong before

| Finding | Consequence |
|---|---|
| `docker-compose.prod.yml` used `deploy.resources.limits` | **Ignored outside Swarm mode** — nothing was capped, but the file looked authoritative. Removed; real limits now use `mem_limit`/`cpus`. |
| `ecosystem.config.js`: `max_memory_restart: '1G'` | The in-process worker runs orchestrator pipelines in the app process. A 1 GB restart threshold killed long runs. Now **3G**, matching the Docker ceiling. |
| `deploy/systemd/alolabs-agent-hub.service`: `MemoryMax=4G` | Contradicted the documented 8 GB floor and left no room for the worker. Now `MemoryHigh=2560M` / `MemoryMax=3072M`, matching `app`'s ceiling. |
| No `logging:` block anywhere | Docker `json-file` logs grow **unbounded** until the disk fills. Now capped on every service (50 MB × 5 for the app, 20 MB × 3 elsewhere). |
| No `logrotate` file, though docs promised one | `/etc/logrotate.d/alolabs-agent-hub` did not exist in the repo or any installer. Now `deploy/systemd/logrotate-alolabs-agent-hub.conf` (30 days, 100 MB cap, `copytruncate`, covers PM2 logs too). |
| Backup retention: 14 snapshots AND 15 days | Up to **14 full copies** on a shared disk. Now 7 AND 7 (`ALO_BACKUP_RETAIN_COUNT` / `ALO_BACKUP_RETAIN_DAYS`), and pruning **never** removes the last restorable copy. |
| Backup preflight floor 512 MB | Passed on hosts too small to write the dump, then produced a truncated backup. Now 2 GB (`ALO_BACKUP_MIN_FREE_MB`). |

## 3. Guaranteeing project 1 its share

`mem_limit` is a ceiling, not a reservation: it stops *this* project from
growing, not a neighbour from starving *it*. The reservation is the systemd
slice — cgroup v2 `MemoryMin` cannot be borrowed away under pressure.

```bash
# 1. Install the slice (once, as root)
sudo install -D -m 0644 deploy/systemd/alolabs-agentos-slice.conf \
     /etc/systemd/system/alolabs-agentos.slice
sudo systemctl daemon-reload

# 2. Attach the app to it — bare-metal path:
#    add  Slice=alolabs-agentos.slice  under [Service] in the unit, then
#    sudo systemctl daemon-reload && sudo systemctl restart alolabs-agent-hub

# 3. Verify the reservation is live
systemctl show alolabs-agentos.slice -p MemoryMin -p MemoryHigh -p MemoryMax
systemd-cgtop -m          # live per-slice memory
```

Slice sizing (in the file): `MemoryMin=5G` (floor), `MemoryHigh=8G` (reclaim
pressure starts), `MemoryMax=10G` (hard wall / OOM inside this slice only),
`CPUWeight=200`, `IOWeight=200`.

> Docker services are **not** children of this slice by default. If you run the
> compose stack under systemd, wrap it in a `docker-compose@alolabs.service`
> with `Slice=alolabs-agentos.slice`; otherwise rely on the per-container
> `mem_limit` ceilings and treat the slice as the bare-metal path.

## 4. Disk plan (520 GB)

| Allocation | Size | Notes |
|---|---|---|
| OS + Docker daemon + images | 60 GB | images ~1 GB; room for rebuilds and prune lag |
| This project — data (DB, uploads, MinIO) | 80 GB | grow here first |
| This project — backups | 60 GB | 7 verified snapshots; see retention below |
| Build cache (`node_modules`, `.next`, docker layers) | 40 GB | `docker system prune` + `npm cache clean` monthly |
| **This project subtotal** | **240 GB** | |
| Other projects | 240 GB | split as needed |
| **Unallocated reserve** | **40 GB** | **never fill the SSD** — see below |

**Never run a shared SSD above ~85% (~440 GB of 520 GB).** NVMe/SSD write
amplification and garbage collection degrade sharply when full; on a shared
host that turns into latency spikes for every project. Alert at 80%.

### Automatic guards already in place

- Backup preflight refuses to start below `ALO_BACKUP_MIN_FREE_MB` (default 2048).
- Snapshot retention keeps ≤ 7 restorable copies, and still never deletes the last one.
- Every container's stdout is capped (`max-size`/`max-file`).
- Bare-metal + PM2 logs rotate daily at 100 MB, 30 days (`copytruncate`).

### Still manual (recommended monthly)

```bash
docker image prune -af            # dangling build layers
docker builder prune -f
npm cache clean --force
df -h /; du -sh /opt/alolabs/agent-hub/{storage,uploads,db/backups}
```

## 5. Adding a second project — the procedure

Do this **before** starting project 2, so project 1 keeps its reservation.

1. **Confirm the budget still holds:**
   ```bash
   node scripts/validate-capacity.mjs     # projects 1's own budget
   free -m; df -h /
   ```
2. **Pick project 2's slice** so it cannot claim project 1's 5 GB floor:
   ```ini
   # /etc/systemd/system/project2.slice
   [Slice]
   MemoryMin=2G
   MemoryMax=5G
   CPUWeight=100
   IOWeight=100
   ```
   Keep `Σ MemoryMin` across all slices ≤ **physical RAM − 1 GB** (16 − 1 = 15 GB).
   Project 1 reserves 5 GB, so project 2 may reserve up to ~10 GB only if
   nothing else runs; with three projects keep each floor ≤ 5 GB.
3. **Give project 2 its own Docker network and container names** — never join
   `alolabs-net`. Name collisions silently steal DNS entries.
4. **Do not share ports.** This project owns `3011` (app), `80/443` (Caddy),
   `6379`, `6333/6334`, `9000/9001`, `9090`, `3001`, `8080`, `5678`, `11434`.
   `scripts/validate-compose.mjs` pins the 3011 contract; check `ss -ltnp`
   before binding anything new.
5. **Do not share volumes.** `app_data`, `app_storage`, `app_logs`,
   `app_backups`, `redis_data`, `qdrant_data`, `minio_data`, `caddy_data`,
   `prometheus_data`, `grafana_data`, `mariadb_data` all belong to this project.
6. **Re-run the disk math** in §4 and move 40 GB of reserve to the new project
   rather than eating into the unallocated tail.

### Do not enable `docker-compose.inference.yml` on this host

It adds **Ollama** (a usable local model needs 4–8 GB resident) and **n8n**,
plus `/data` volumes that grow with model pulls. With 6 GB left for other
projects there is no honest way to fit it here. The file is a separate,
opt-in stack for exactly that reason; enabling it needs its own host or a
returned CPU/RAM budget.

## 6. Verification commands

```bash
# Static: budget fits, limits enforced, logs rotate, slice matches
node scripts/validate-capacity.mjs
node scripts/validate-compose.mjs

# Live host: what is actually running and what it uses
docker stats --no-stream
systemd-cgtop -m
free -m; df -h /
```

CI runs both validators on every push (`.github/workflows/ci.yml`), so a future
edit that raises a `mem_limit` past the share, drops a `logging:` block, or
reintroduces `deploy.resources` fails the build rather than the host.
