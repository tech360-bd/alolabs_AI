# Task 10: Security Fix - Remove DEMO_ENV_VARS and DEMO_SYSTEM_INFO

## Summary
Fixed a security vulnerability in `/home/z/my-project/src/components/panels/settings-panel.tsx` where hardcoded environment variable names, values, and system information were embedded directly in the client-side code.

## Changes Made

### Removed (Security Issue)
- **`DEMO_ENV_VARS`** — An array of 12 hardcoded environment variables with fake/sensitive values (DATABASE_URL, REDIS_URL, JWT_SECRET, OPENAI_API_KEY, NEXTAUTH_SECRET, etc.). This exposed internal infrastructure details and could mislead users into thinking these are real configs.
- **`DEMO_SYSTEM_INFO`** — Hardcoded system info object with fake version, CPU, memory, uptime, and database size values.
- Removed the `SystemInfo` interface (no longer needed).

### Added
- **`SystemHealthData` interface** — Matches the real `/api/system-health` API response shape (`status`, `timestamp`, `uptime`, `database`, `counts`, `systemConfig`).
- **`systemHealth` state** — Fetched from `GET /api/system-health` alongside the existing settings fetch, using `Promise.all` for parallel loading.
- **`getSettingCategories()` helper** — Groups settings from the API into Feature Flags, System Config, and Other Settings for organized display.
- **`maskValue()` helper** — Safe display function that masks long/secret values while showing short boolean/numeric values. Never exposes real env vars.

### Replaced UI Sections
1. **"Environment Variables" card** → **"System Configuration" card**: Now displays real settings from `GET /api/settings`, grouped by category (feature flags, system config, other). Shows masked values with a show/hide toggle. Boolean settings have inline toggle switches. Includes a badge showing total settings count.

2. **"System Information" card**: Now fetches real data from `GET /api/system-health`. Displays:
   - Health status badge (Healthy/Degraded) with colored indicator
   - Database connection status (connected/disconnected) with provider
   - Agent count from database
   - System uptime (real)
   - Company count and active API keys
   - Department count
   - Last updated timestamp and 24h error count
   - Skeleton fallback when data is loading

### Preserved
- All visual styling, colors, layouts, and UI components (Card, Badge, Switch, Button, etc.)
- All 7 settings section tabs (General, Security, AI Models, Notifications, Database, API, Branding)
- Search functionality
- Copy to clipboard
- Toggle boolean settings via API
- All form state and local settings management
- The "Database Settings (from API)" card at the bottom

## Verification
- ✅ No references to `DEMO_ENV_VARS` or `DEMO_SYSTEM_INFO` remain in the file
- ✅ ESLint passes on the modified file (0 errors, 0 warnings)
- ✅ Dev server compiles successfully with no errors
- ✅ `/api/system-health` endpoint returns 200 successfully
