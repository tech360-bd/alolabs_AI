# Hosting Portal production acceptance — NO-GO

পরিধি: `hosting.alolabs.net`, loopback port `3062`, 500+ concurrent users। এই রিপোর্টের evidence repository, GitHub run metadata এবং Arena sandbox থেকে। Production host, customer data বা secret store পরীক্ষা করা হয়নি। **অনুমোদন দেওয়া হয়নি।**

## পরিচয় ও baseline

- GitHub owner/full name: `tech360-bd/alolabs_AI`; default branch `main`; main ও স্থানীয় HEAD `19723593b0ea8bfad2707786c79a1d090ca3e366`। Remote working branch `arena/304ea66d-alolabs-ai`: `6d3425bdf1678b59855ff82af9f1cb5ab1361eb8`। Open PR: 0। Unmerged index entries: 0; এটি prospective merge rehearsal নয়।
- রিপোর্ট লেখার আগে স্থানীয় HEAD-এর তুলনায় 17 tracked changes এবং 28 untracked files। GitHub candidate tree বনাম সব nonignored working files-এর path/content hash comparison: **0 extra, 0 missing, 0 different**। এটি ignored files, file permissions বা production checkout-এর backup নয়। Local changes অপরিবর্তিত রাখা হয়েছে; clone, pull, reset, stash বা push করা হয়নি।
- `ecosystem.config.js:36,53–54`: `alolabs-agentos`, `127.0.0.1:3011`; `Caddyfile`-এর default upstream `app:3011`। `hosting.alolabs.net` URL-helper tests-এ ব্যবহৃত, যা DNS, TLS বা portal deployment-এর প্রমাণ নয়।
- Sandbox: Debian 12, 2 CPU, 3.8 GiB RAM, প্রায় 20 GiB disk free, inode use 1%, Node 22.22.3, npm 10.9.8, Git 2.39.5। এগুলো production Ubuntu host-এর পরিমাপ নয়।

## ১৬ ধাপের ফল

| ধাপ | যাচাইকৃত অংশ | অসম্পূর্ণ / প্রয়োজনীয় evidence |
|---|---|---|
| 1 Repository | উপরোক্ত identity, SHA, PR, tree comparison | Portal-এর owner-confirmed repository ও production deployed SHA; পরিবর্তনের আগে server backup ও restore rehearsal |
| 2 OS/server | Sandbox inventory মাত্র | Host inventory, services/boot, firewall, SSH policy, clock/NTP, UPS, monitoring |
| 3 Dependencies/build | Candidate-এর GitHub CI ও Security Scan success; আগের AgentOS test/build ledger রয়েছে | Portal-এর exact SHA-এর clean build, worker/artifact manifest, startup ও readiness |
| 4 Env/secrets | Tracked dotenv নাম দুটিই `.env.example`; `.env`, `.env.production`, `.env.config` ignored | Historical secret exposure প্রমাণিতভাবে বাদ দেওয়া যায়নি। Owner-side name/presence, permission, rotation age, encrypted backup এবং redacted log scan; কোনো value নয় |
| 5 DB/Prisma | AgentOS production policy MySQL/MariaDB; disposable MySQL logical restore succeeded | Full-schema initialization failed; production location/ownership, history, constraints, tenant records, consistency ও rollback compatibility অযাচাইকৃত |
| 6 Runtime | AgentOS PM2 definition আছে | Portal `3062`, তিন worker-এর identity, interval, deduplication, readiness, restart/reboot recovery |
| 7 GitHub/webhook | Repository CLI access আছে | এটি Portal GitHub App installation নয়। Staging signed delivery → stored ID → one job; invalid repository/branch/signature rejection ও retry |
| 8 AI detection | Portal acceptance evidence নেই | Known framework fixtures, unsupported rejection, ambiguous result → no deployment until explicit approval |
| 9 Pipeline | AgentOS immutable SHA, rollback ও isolated PM2 rehearsal documented | Portal end-to-end queue, artifact checksum, pre-switch health, history, duration, rollback ও dashboard |
| 10 Domain/proxy/TLS | Repository-তে আলাদা AgentOS Caddy target | Portal DNS/tunnel, Nginx upstream, HTTPS, renewal, redirect, websocket, limits ও external login |
| 11 Security | AgentOS browser auth/MFA ও authorization evidence আছে | Portal-specific isolation, privileged APIs, registration/reset, abuse controls, cookie/security headers ও open findings review |
| 12 Customer workflow | Portal acceptance evidence নেই | দুই isolated tenant দিয়ে repo connect → deploy → domain → retry/rollback → protected deletion; admin ও billing scope নিশ্চিত করা |
| 13 Recovery | Isolated database restore evidence; runbooks present | Production-derived protected copy-এর isolated restore, files/ACLs, encrypted secrets, artifact/offsite recovery, measured RPO/RTO |
| 14 Monitoring | Live alert delivery অযাচাইকৃত | Health/queue/DB/SSL/resource alerts, rotation, on-call delivery ও incident record |
| 15 Load | 500+ capacity প্রমাণ নেই | Approved staging workload: authenticated sessions, API/DB, deployment and worker queues, sustained concurrency, failures/recovery; আগেই latency/error/backlog thresholds নির্ধারণ |
| 16 Acceptance | **NO-GO** | Portal evidence, failed DB gate resolution এবং human sign-off আবশ্যক |

## আটটি release gate

কোনোটিই Portal-এর production acceptance হিসেবে উত্তীর্ণ নয়। (1) Critical/high review: candidate scan success, Portal review বাকি। (2) Backup/restore: disposable DB-তে pass, production recovery proof বাকি। (3) নির্দিষ্ট SHA: candidate জানা, deployed SHA নয়। (4) Rollback: AgentOS isolated rehearsal, Portal নয়। (5) Domain/HTTPS/API: অযাচাইকৃত। (6) Tenant isolation/access: Portal-এ অযাচাইকৃত। (7) 500+ workload: চালানো হয়নি। (8) Monitoring/alerts/recovery: end-to-end drill হয়নি।

**পরবর্তী অনুমোদন:** আগে Portal repository ও approved SHA নিশ্চিত করুন, অথবা নিশ্চিত করুন AgentOS-এই আলাদা নতুন service আনতে হবে। তারপর staging scope এবং production **read-only** evidence collection-এর অনুমোদন আলাদাভাবে দিন। এই রিপোর্ট production migration, port change, secret rotation, load test, process restart বা deployment-এর অনুমতি নয়।

**Evidence:** [MySQL CI run](https://github.com/tech360-bd/alolabs_AI/actions/runs/44490803324), [AgentOS test ledger](PRODUCTION_REMEDIATION_TEST_REPORT.md), [implementation report](PRODUCTION_REMEDIATION_IMPLEMENTATION_REPORT.md)।