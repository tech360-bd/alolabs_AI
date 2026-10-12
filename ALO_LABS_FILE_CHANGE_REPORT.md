# ALO Labs file change report — HEAD versus current worktree

**Date: 2026-10-09 (Asia/Dhaka).** This is a source-file membership and Git working-tree comparison, not proof of runtime integrity, production data safety, dead-code removal or test coverage. HEAD is `07668db093c415d5f805aeb93b8952be5dbf9628`. Unignored/untracked files are included; ignored `.env`, DBs, storage and build output are deliberately excluded. The earlier implementation happened before the retrospective inventory.

**HEAD originals: 1056; current source files including this report: 1141; original modified: 16; added: 85; originals missing: 0.**

No baseline file is missing. No original file was moved, merged, replaced, deprecated or deleted in this comparison. No per-file operation is proposed to delete anything. A source diff alone does not verify preserved production database or storage contents.

| Original file | Classification | Reason / replacement / impact / rollback |
|---|---|---|
| `--timeout` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.dockerignore` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.env.example` | MODIFIED | Documents more configuration; no credential contents should be committed. |
| `.gitattributes` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/backup.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/ci.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/deploy.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/docker.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/security-scan.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.github/workflows/security.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.gitignore` | MODIFIED | Ignores local DB/storage/backup; verify operational backup includes these data outside Git. |
| `.zscripts/build.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/dev.pid` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/dev.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/mini-services-build.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/mini-services-install.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/mini-services-start.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `.zscripts/start.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `AI_AGENT_GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `API.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `ARCHITECTURE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `CHANGELOG.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `Caddyfile` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `DATABASE_GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `DEPLOYMENT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `DEVELOPER_GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `Dockerfile` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `FINAL_VERIFICATION_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `OPERATIONS.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `PRODUCTION-MANIFEST.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `PRODUCTION-READINESS-REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `PRODUCTION_MANIFEST.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `PROJECT_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `README.md` | MODIFIED | Modified in previous pass; inspect `git diff -- README.md`; no replacement or data migration claimed. Restore original with HEAD only after impact review. |
| `SECURITY.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `SETUP_GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `TROUBLESHOOTING.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/agents.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/auth-login.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/auth.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/departments.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/email.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/enterprise-agent-chat.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/health-v2.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/health.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/media.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/models.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/security.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/social.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/storage.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/api/whatsapp.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/components/panels/agents-registry-panel.test.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/components/panels/dashboard-panel.test.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/e2e/login-flow.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/setup.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/hooks/use-mobile.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/agent-evolution-engine.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/ai-router.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/ai-workforce-execution-engine.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/api-gateway.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/auth-v2.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/auth.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/multi-agent-orchestrator-persistence.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/realtime.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/security/csrf.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/security/file-validator.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/security/rate-limiter.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/security/session-manager.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/storage.test.ts` | MODIFIED | Modified in previous pass; inspect `git diff -- __tests__/unit/lib/storage.test.ts`; no replacement or data migration claimed. Restore original with HEAD only after impact review. |
| `__tests__/unit/lib/token-guard.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/lib/utils.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `__tests__/unit/store/app.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/1-auth-management-panel-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/10-security-fix.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/2-agent-protocol-population-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/2-b-research-hub-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/3-marketplace-api-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/3-model-routing-logging-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/3-panel-enhancement-builder-batch3.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/3a-missing-panels-builder-batch1.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/3b-missing-panels-batch2.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/4-5-6-security-gateway-pwa.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/4-observatory-panel-enhancement-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/5-7-queue-token-metrics-api-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/5-enterprise-features-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/6-9-tenant-streaming-api-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/6-hub-crud-api-builder.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/P2a-crud-routes.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/P2b-api-routes-fix.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/P5-session-manager.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/P9-test-suites.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/task-2-queue-service.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `agent-ctx/worklog.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report/Comprehensive_Code_Audit_Report.pdf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report/body.pdf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report/cover.html` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report/cover.pdf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit-report/generate_report.py` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/.env.example` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/.gitignore` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/API_ROUTES.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/DATABASE_SCHEMA.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/DEPLOYMENT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/README.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/README.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/backend/config.py` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/backend/database.py` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/backend/main.py` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/backend/models.py` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/database.sql` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/docker-compose.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/scripts/install_mac.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/alo-avatar-video-studio/scripts/run_local.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/crm-dashboard.html` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/docker-compose.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/index.html` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/metadata.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/package-lock.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/package.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/server.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/App.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/AlAminnAPI.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/AlAminnCRM.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/AlAminnPortfolio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/BrandLogo.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/D3Heatmap.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/components/WorkflowGraph.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/data.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/data/CrmHtmlTemplate.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/index.css` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/main.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/src/repoGenerator.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/tsconfig.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `audit/alo-labs/vite.config.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `bun.lock` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `components.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/cron/alolabs-cron` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/docker/mariadb-custom.cnf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/env.production.example` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/grafana/provisioning/dashboards/default.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/grafana/provisioning/datasources/prometheus.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/nginx.conf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/nginx/agentos.conf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/nginx/alolabs.conf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/nginx/ssl-setup.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/prometheus.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/backup.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/database-check.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/database-safety-scan.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/db-migrate-mariadb.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/deploy.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/health-check.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/healthcheck.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/install.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/restore.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/rollback.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/security-check.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/ssl.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/upgrade.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/scripts/validate-env.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `deploy/systemd/alolabs-agent-hub.service` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docker-compose.prod.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docker-compose.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/AGENT_INTEGRITY_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/AI-SYSTEM-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/API.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/BACKUP-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/BRAND-SYSTEM.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/CI-CD-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/DELIVERABLE-1-EXECUTIVE-SUMMARY.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/DELIVERABLE-2-MASTER-ARCHITECTURE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/DELIVERABLE-3-MASTER-ROADMAP.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/DEPARTMENT_INTEGRITY_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/DEPLOYMENT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/ENVIRONMENT-VARIABLES.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/FILE_INTEGRITY_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/FINAL_PRODUCTION_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/IMPLEMENTATION_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/INSTALLATION.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/LINK-COVERAGE-REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/MONITORING-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/PRE_BUILD_ARCHITECTURE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/PRE_BUILD_FILE_INVENTORY.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/PRODUCTION-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/PRODUCTION-OPERATIONS.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/REGRESSION_TEST_REPORT.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/SECURITY-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/SECURITY.md` | MODIFIED | Modified in previous pass; inspect `git diff -- docs/SECURITY.md`; no replacement or data migration claimed. Restore original with HEAD only after impact review. |
| `docs/SOCIAL-INTEGRATION-GUIDE.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `docs/TROUBLESHOOTING.md` | MODIFIED | Modified in previous pass; inspect `git diff -- docs/TROUBLESHOOTING.md`; no replacement or data migration claimed. Restore original with HEAD only after impact review. |
| `download/README.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/alolabs-agent-hub-2000-agents-production.tar.gz` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/alolabs-aismh-full-project.zip` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/crm-connections-panel.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/crm-expanded-alo-education.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-agents-current.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-agents.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-cmd-center.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-command-center.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-current-state.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-final-agents.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/hub-final-cmd.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/redesigned-command-chat.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/redesigned-crm-dashboard.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/redesigned-full-desktop.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-admin-after-command.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-admin-command-center.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-admin-command-log.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-chat-custom-msg.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-chat-empty.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `download/super-chat-with-response.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `ecosystem.config.js` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `eslint.config.mjs` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `examples/websocket/frontend.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `examples/websocket/server.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `login-page.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/.gitkeep` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/queue-service/bun.lock` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/queue-service/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/queue-service/package.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/realtime-service/bun.lock` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/realtime-service/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `mini-services/realtime-service/package.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/alertmanager/alertmanager.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/docker-compose.monitoring.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/dashboard-all.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/dashboard.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/ai-usage.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/alolabs-overview.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/api-performance.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/failed-requests.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/login-activity.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/queue-status.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/social-media.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/dashboards/json/system-resources.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/grafana/provisioning/datasources/prometheus.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/prometheus/alerts.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `monitoring/prometheus/prometheus.yml` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `next.config.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `nginx.conf.example` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `package-lock.json` | MODIFIED | npm dependency graph regenerated; no replacement. Reproducibility vs bun.lock/CI must be reviewed before release. |
| `package.json` | MODIFIED | AgentOS dependencies/scripts changed; no replacement. Rollback only with matching package-lock and a tested build. |
| `postcss.config.mjs` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `prisma/schema.mysql.prisma` | MODIFIED | MySQL variant extended additively; no MySQL migration applied/verified. |
| `prisma/schema.prisma` | MODIFIED | Additive Project/Artifact/RunEvent/AgentOSRun models; no model removed. Production SQL/restore not verified. |
| `project-production.zip` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-badge.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-icon.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-logo-horizontal.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-logo-stacked.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-mark.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/brand/alo-wordmark.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/icons/icon-192.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/icons/icon-512.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/logo.svg` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/manifest.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/robots.txt` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `public/sw.js` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `screenshot-home.png` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/backup.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/build.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/check-agents.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/check-db.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/check-prisma-delegates.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/deploy.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/generate-enterprise-spec.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/generate-mysql-schema.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/healthcheck.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/install.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/migrate-sqlite-to-mysql.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/restore.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/rollback.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-100-departments.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-agent-profiles.js` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-agent-protocols-v2.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-agent-protocols.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-agenthub.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-batch2-panels.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-crm.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-education.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-enterprise-v2.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-enterprise-v3.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-enterprise.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-learning.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-operating-rules.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-skills-v2.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-skills.js` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-skills.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-supplement.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-universities.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-v2.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed-v3.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/seed.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/sync-marketing-kit.mjs` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/update.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/verify-2000-workforce.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/verify-mysql-compatibility.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `scripts/verify.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/alolabs-aismh.service` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/backup.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/caddy.conf` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/healthcheck.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/install.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/restore.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/rollback.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/sudoers-alolabs` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/update.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `server-config/verify.sh` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/api/health.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/auth.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/brand-system.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/cron-jobs.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/diagram-design-and-marketing-kit.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/job-queue.test.ts` | MODIFIED | Modified in previous pass; inspect `git diff -- src/__tests__/lib/job-queue.test.ts`; no replacement or data migration claimed. Restore original with HEAD only after impact review. |
| `src/__tests__/lib/session-manager.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/__tests__/lib/validators.test.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-company-access/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-factory/build/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-intelligence/agent-detail/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-intelligence/agents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-intelligence/chat/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-intelligence/departments/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-learning/dashboard/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-learning/evolution/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-learning/knowledge/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-learning/protective-mode/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-learning/trigger-learning/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-memory/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-performance/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-permissions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-runs/[taskId]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-runtime/execute/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-runtime/health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-runtime/status/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-stability/health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-status-history/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-usage-summaries/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agent-versions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agents/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agents/registry/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/agents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-security/events/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-security/rules/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-security/stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/alerts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/catalog/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/communications/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/execute/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/executions/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/instances/[id]/health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/instances/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/metrics/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/optimizations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/oversight/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai-workforce/recovery/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/batch/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/chat/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/models/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/parallel/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/providers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/route/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/ai/stream/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/alerts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/analytics/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/api-keys/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/api-keys/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/api-management/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/approval-engine/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/approvals/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/audit-logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/login/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/logout/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/me/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/mfa/disable/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/mfa/resend/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/mfa/setup/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/mfa/verify/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/oauth/[provider]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/oauth/providers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/password-change/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/password-reset/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/register/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/sessions/cleanup/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/sessions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/auth/sso/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation-suggestions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation/execute/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation/logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation/triggers/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation/triggers/[id]/toggle/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/automation/triggers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/billing/invoices/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/billing/payments/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/billing/plans/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/billing/subscriptions/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/billing/subscriptions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/brands/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/capability/request/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/capability/requests/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/commands/route.ts` | MODIFIED | Prior command stub changed to enqueue a real run; legacy API contract and error handling require audit. |
| `src/app/api/companies/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/companies/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company-access/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company-memory/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company-usage-summaries/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company/agents/allowed/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company/command/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company/tasks/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company/usage/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/company/workflows/allowed/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/cost-estimate/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/cost-estimates/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm-connections/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/activities/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/contacts/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/contacts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/deals/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/deals/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/lead-score/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/notes/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/crm/pipelines/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/cron/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/dashboard/cost/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/dashboard/security/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/dashboard/stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/dashboard/super-admin/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/dashboard/usage/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/db/backup/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/db/migrate/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/db/restore/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/department-memory/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/departments/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/departments/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/deploy/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/disaster-recovery/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/documents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/education-hub/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/accounts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/inbox/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/reply/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/send/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/sync/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/email/templates/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/emergency/action/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/emergency/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agent-chat/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agent-factory/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agent-factory/create/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agents/[agentId]/detail/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agents/adaptive/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/agents/run/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/collaborations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/constitution/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/conversations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/data-lake/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/dcc/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/department-ai/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/departments/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/engines/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/events/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/integrations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/knowledge/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/mobile-apps/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/orchestrator/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/orchestrator/run/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/orchestrator/status/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/overview/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/prompts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/rbac/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/roadmap/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/rules/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/skills/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/sops/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/workflows/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/enterprise/workforce-evolution/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/evaluations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/feature-flags/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/feedback/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/funnels/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/gateway/sign/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/gateway/verify/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/gpu-monitor/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/health/deep/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/health/live/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/health/ping/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/health/ready/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/incidents/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/incidents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/connect/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/minio/objects/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/ping/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/postgres/query/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/redis/keys/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/infra/status/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/integrations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/interview-hub/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/jobs/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/jobs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/jobs/stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/llm/models/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/llm/route/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/llm/stream/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketing-kit/[slug]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketing-kit/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/[id]/install/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/[id]/reviews/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/installs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/marketplace/templates/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/mcp-servers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/media/ai-tag/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/media/folders/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/media/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/meetings/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/memory/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/memory/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/metrics/collect/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/metrics/prometheus/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/metrics/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/model-assignments/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/model-health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/model-hub/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/models/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/notifications/read/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/notifications/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/observability/dashboard/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/open-source-models/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/outputs/[taskId]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/outputs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/payment-guard/report/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/payment-guard/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/productivity/report/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/productivity/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/prompts/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/prompts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/protection/evaluate/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/protection/logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/protection/report/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/protection/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/quality/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/queues/[id]/items/[itemId]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/queues/[id]/items/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/queues/[id]/process/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/queues/dead-letter/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/queues/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/chunks/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/collections/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/documents/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/documents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/engine-stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/feedback/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/ingest/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/query/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/rag/search/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/research-hub/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/roles/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/security-events/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/security/secrets/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/security/session/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/self-improvement/report/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/self-improvement/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/seo/challenges/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/seo/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/settings/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/sister-companies/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skill-factory/build/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skill-permissions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skill-runs/[taskId]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skill-validation-logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skill-versions/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skills/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skills/registry/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/skills/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/sms/campaigns/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/sms/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/social/accounts/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/social/analytics/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/social/oauth/[provider]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/social/publish/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/social/webhooks/[platform]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/sop-updates/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/super-admin/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/super-chat/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/sync/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/system-health/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/task-errors/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/task-steps/[taskId]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tasks/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tasks/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-admin/config/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-admin/quotas/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-admin/users/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-gateway/distribution/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-gateway/logs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tenant-gateway/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tickets/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tickets/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/token-budget/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/token-usage/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tool-approvals/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tool-runs/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/tools/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/training/evaluations/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/training/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/training/sources/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/accommodation/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/courses/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/scholarships/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/universities/stats/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/uploads/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/usage/agents/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/usage/check/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/usage/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/usage/workflows/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/users/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/users/invite/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/users/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/v1/agents/execute/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/video-hub/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/voice-system/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/webhooks/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/webhooks/deliveries/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/webhooks/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/whatsapp/campaigns/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/whatsapp/numbers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/whatsapp/send/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/whatsapp/webhook/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workers/action/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workers/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflow-factory/build/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflow-improvements/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflow-steps/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflow-usage-summaries/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflows/[id]/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/api/workflows/route.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/brand/page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/design/alo-note.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/design/design-system.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/design/design-tokens.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/design/page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/globals.css` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/invoice/page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/layout.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/site/page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/app/sitemap.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/agent-hub-shell.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/alo-logo.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/app-shell.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/agent-spec-card.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/alo-logo.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/brand-book-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/brand-book.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/command-center-mobile.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/invoice-document.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/invoice-page.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/invoice-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/letterhead.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/public-site-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/send-invoice-dialog.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/brand/system-flow.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/diagrams/diagram-canvas.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/diagrams/diagram-studio-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/diagrams/diagram-studio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/diagrams/editorial-diagram.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/enterprise-shell.tsx` | MODIFIED | Registers new Command Center panels; no UI replacement. Browser E2E unverified. |
| `src/components/enterprise/panels/agent-command-center.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/ai-employees.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/api-gateway.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/audit-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/collaboration.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/compliance-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/constitution-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/data-lake.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/department-hub.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/enterprise-overview.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/enterprise-rbac.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/evaluation-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/event-bus.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/governance-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/knowledge-graph.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/master-roadmap.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/mcp-integration.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/memory-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/observability.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/placeholder-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/planning-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/prompt-library.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/rag-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/reflection-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/security-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/self-healing-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/self-optimization-engine.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/skills-registry.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/sop-system.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/strategic-command.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/system-architecture.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/enterprise/panels/workflow-orchestration.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/marketing/markdown.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/agent-factory.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/agents-registry.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/ai-health.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/approval-queue.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/auto-domain-deploy.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/ceo-control.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/crm-builder.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/dashboard.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/departments.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/human-avatar-voice.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/image-studio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/login.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/memory.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/music-studio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/openclaw-tools.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/outputs.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/payment-guard.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/productivity.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/project-uploads.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/protection-mode.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/self-improvement.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/server-automation.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/settings.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/skill-factory.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/skills-registry.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/study-academic.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/task-steps.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/tasks.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/video-studio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/web-clone-scraper.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/website-builder.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/pages/workflows.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-evaluation-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-evolution-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-factory-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-intelligence-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-training-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agent-usage-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/agents-registry-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/ai-workforce-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/api-keys-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/approvals-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/audit-logs-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/auth-center-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/automation-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/backup-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/billing-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/brand-management-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/capability-request-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/command-center.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/companies-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/company-access-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/contacts-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/cost-estimate-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/crm-connections-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/crm-deals-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/deal-pipeline-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/departments-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/deployment-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/disaster-recovery-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/document-system-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/education-hub-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/emergency-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/feedback-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/funnels-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/gpu-monitor-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/incident-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/infra-dashboard-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/integration-manager-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/interview-hub-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/job-monitor-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/marketing-kit-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/marketplace-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/mcp-manager-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/media-library-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/media-studio-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/meetings-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/memory-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/model-hub-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/model-registry-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/notification-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/observatory-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/output-center-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/payment-guard-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/productivity-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/prompt-vault-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/protection-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/queue-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/rag-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/research-hub-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/role-management-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/security-center-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/self-improvement-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/self-learning-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/seo-challenge-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/seo-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/settings-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/sister-companies-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/skills-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/sms-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/super-admin-command-center.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/super-admin-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/super-commanding-chat.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/system-health-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/tasks-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/tenant-admin-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/tenant-gateway-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/tickets-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/token-budget-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/tool-registry-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/university-directory-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/usage-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/user-management-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/video-hub-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/voice-system-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/web-crm-dashboard.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/webhooks-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/worker-manager-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/workflow-usage-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/panels/workflows-panel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/public-site.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/service-worker-registration.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/site/marketing-site.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/table-shell.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/accordion.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/alert-dialog.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/alert.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/aspect-ratio.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/avatar.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/badge.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/breadcrumb.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/button.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/calendar.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/card.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/carousel.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/chart.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/checkbox.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/collapsible.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/command.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/context-menu.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/dialog.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/drawer.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/dropdown-menu.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/form.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/hover-card.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/input-otp.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/input.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/label.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/menubar.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/navigation-menu.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/pagination.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/popover.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/progress.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/radio-group.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/resizable.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/scroll-area.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/select.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/separator.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/sheet.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/sidebar.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/skeleton.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/slider.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/sonner.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/switch.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/table.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/tabs.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/textarea.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/toast.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/toaster.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/toggle-group.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/toggle.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/components/ui/tooltip.tsx` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/hooks/use-api-actions.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/hooks/use-data-table.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/hooks/use-mobile.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/hooks/use-toast.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-evolution-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-learning/evolution-tracker.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-learning/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-learning/learning-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-learning/protective-filter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/execution.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/health.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/lifecycle.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/pipeline.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/scheduler.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/state.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/agent-runtime/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-command-parser.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-gateway/gateway.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-gateway/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/deepseek-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/gemma-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/groq-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/llama-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/mistral-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/ollama-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/openrouter-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/phi-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/provider-base.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/qwen-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/router.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-router/zai-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-security/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-security/validator.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/communication-bus.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/execution-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/health-monitor.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/self-healing.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/ai-workforce/self-improvement.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/api-auth.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/api-gateway.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/api.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/approval-engine/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/approval-engine/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/auth.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/brand/invoice-html.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/brand/invoice.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/brand/tokens.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/context-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/cron-jobs.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/cross-system-sync/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/cross-system-sync/sync-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/manager.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/mysql-adapter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/postgres-adapter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/sqlite-adapter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db-adapters/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/db.ts` | MODIFIED | Sandbox Prisma adapter option; default production path preserved. Verify deployed DB engine. |
| `src/lib/department-registry/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/department-registry/registry.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/department-registry/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/audit.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/cartesian.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/graph.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/radial.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/schema.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/sequence.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/shared.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/special.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/engines/stack.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/examples.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/export.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/geometry.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/render.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/scene.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/spec.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/diagram-design/tokens.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/imap.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/smtp.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/templates.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/tracking.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/email/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/enterprise-roadmap.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/enterprise-spec.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/event-bus/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/event-bus/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/job-queue.ts` | MODIFIED | Atomic claim compare-and-set; multi-worker/recovery tests incomplete. |
| `src/lib/marketing-kit/content.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketing-kit/data/catalog.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketing-kit/data/references.generated.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketing-kit/data/skills.generated.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketing-kit/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketplace/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/marketplace/service.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/memory/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/memory/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/metrics-collector.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/minio.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/model-registry.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/model-routing-policy/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/model-routing-policy/policy-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/model-routing-policy/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/multi-agent-orchestrator/agent-factory.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/multi-agent-orchestrator/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/multi-agent-orchestrator/orchestrator.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/multi-agent-orchestrator/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/open-source-models.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/orchestrator.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/postgres.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/qdrant.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/rag-engine.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/rate-limiter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/realtime/client.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/realtime/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/realtime/server.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/realtime/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/redis.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/route-auth.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/security/csrf.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/security/file-validator.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/security/rate-limiter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/security/secret-manager.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/security/session-manager.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/self-healing/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/self-improvement/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/session-cleanup.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/session-manager.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/base-provider.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/discord.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/facebook.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/google-business.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/instagram.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/linkedin.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/pinterest.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/telegram.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/threads.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/tiktok.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/twitter.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/social/youtube.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/token-guard.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/training/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/training/pipeline.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/utils.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/validators.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/whatsapp/ai-handler.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/whatsapp/client.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/whatsapp/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/whatsapp/multi-number.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/whatsapp/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/handlers.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/index.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/queue.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/scheduler.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/types.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workers/worker.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/lib/workforce-evolution.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/middleware.ts.bak` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/middleware.ts.disabled` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/proxy.ts` | MODIFIED | v1 health/API-key routing changed; authorize legacy and v1 paths individually. |
| `src/store/app.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `src/types/urlpattern.d.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `tailwind.config.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `tsconfig.json` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `vitest.config.ts` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `worklog.md` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `zi3wlUqn` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `ziC7a7L3` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |
| `zirgKgT5` | PRESERVED | Unchanged relative to HEAD; runtime/dependency behavior NOT VERIFIED. |

## Added files (not present at HEAD)

| Added path | Classification | Meaning |
|---|---|---|
| `ALO_LABS_AGENTOS_FINAL_AUDIT.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_API_VERIFICATION.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_COMPLETE_FILE_INVENTORY.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_CURRENT_ARCHITECTURE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_DATABASE_VERIFICATION.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_FILE_CHANGE_REPORT.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_FORENSIC_AUDIT.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_MIGRATION_MAP.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_SECURITY_AUDIT.md` | GENERATED | Audit/documentation only; no runtime change. |
| `ALO_LABS_TARGET_ARCHITECTURE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `BACKUP_RECOVERY.md` | GENERATED | Audit/documentation only; no runtime change. |
| `__tests__/api/runs.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/helpers/fake-db.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-artifacts.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-configuration-required.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-planner.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-runs-pipeline.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-storage-real.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-v1-auth.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-v1-boundaries.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `__tests__/unit/agentos-workflow-engine.test.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `audit/AGENTOS_FORENSIC_AUDIT.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/ADMIN_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/AGENTOS_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/AGENT_BUILDER_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/API_DOCUMENTATION.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/ARCHITECTURE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/DEPLOYMENT_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/MEMORY_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/MODEL_ROUTER_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/TOOL_REGISTRY_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `docs/WORKFLOW_GUIDE.md` | GENERATED | Audit/documentation only; no runtime change. |
| `prisma/migrations/mysql/20261008_agentos_foundation.sql` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `scripts/dev-generate-client.sh` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `scripts/seed-agentos.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `scripts/sqlite-push.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/artifacts/[id]/download/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/artifacts/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/artifacts/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/projects/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/projects/[id]/runs/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/projects/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/runs/[id]/events/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/runs/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/runs/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/storage/files/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/storage/files/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/agents/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/agents/[id]/run/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/agents/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/approvals/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/approvals/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/artifacts/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/artifacts/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/command/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/events/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/health/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/memory/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/models/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/projects/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/projects/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/runs/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/runs/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/skills/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/tasks/[id]/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/tasks/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/tools/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/workflows/[id]/run/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/v1/workflows/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/app/api/workflows/[id]/run/route.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/components/enterprise/panels/agentos-command.tsx` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/components/enterprise/panels/agentos-runs.tsx` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/components/enterprise/panels/run-view.tsx` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/instrumentation.node.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/instrumentation.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/artifacts/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/projects/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/qc/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/runs/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/runs/planner.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/storage/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/v1-auth.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/v1.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/lib/workflow-engine/index.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |
| `src/types/better-sqlite3.d.ts` | GENERATED | New source/test/config from earlier AgentOS pass; see file inventory for purpose and verification status. |

**Removal log:** none found. Any future deletion, move or replacement requires original path, reason, dependencies, data/API/UI impact, migration and rollback recorded *before* the change. `git diff --check` and tests cannot replace that review.
