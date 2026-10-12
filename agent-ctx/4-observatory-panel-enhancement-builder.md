# Task 4: Observatory Panel Enhancement Builder

## Files Modified
- `src/components/panels/observatory-panel.tsx` — Complete rebuild (588→580 lines)
- `src/app/api/observability/dashboard/route.ts` — Enhanced with summary fields

## Files Created
- `src/app/api/logs/route.ts` — Unified log viewer (ServerLog + ErrorLog)
- `src/app/api/metrics/collect/route.ts` — System metrics collection endpoint

## What Was Done

### Observatory Panel (Frontend) — Full Rebuild
Replaced the existing 588-line observatory panel with a comprehensive 6-section real-time monitoring dashboard:

1. **Row 1: System Status Cards** (4-card responsive grid)
   - System Health (green/yellow/red status badge from `/api/health`)
   - Active Agents count (from `/api/dashboard/stats`)
   - Queue Depth — queued + processing (from `/api/queues`)
   - Token Usage (from `/api/token-usage`)

2. **Row 2: Real-Time Metrics Charts** (2-column grid)
   - "Request Rate" SVG line chart (from `/api/metrics?name=request_rate&period=5m&agg=sum`)
   - "Token Consumption" SVG bar chart (from `/api/metrics?name=token_usage&period=1h&agg=sum`)
   - Hand-built SVG charts with proper axes, labels, gridlines, and "no data" state

3. **Row 3: Service Health Grid** (5-column responsive)
   - Cards for each service from `/api/system-health?deep=true`
   - Shows service name, status badge, response time, and details

4. **Row 4: Active Alerts**
   - Table of firing alerts from `/api/alerts`
   - Severity badges (color-coded), name, condition, firing status, last fired time
   - "Silence" and "Acknowledge" action buttons (PATCH `/api/alerts`)

5. **Row 5: Recent Logs**
   - Scrollable log viewer (max-h-96) from `/api/logs?limit=50`
   - Level filter buttons: All, Error, Warning, Info
   - Monospace font, color-coded level badges, auto-refresh

6. **Row 6: Metrics Explorer**
   - Input for metric name, Select for aggregation (sum/avg/min/max/count)
   - Select for time period (5m/15m/1h/6h/1d/7d)
   - Results displayed in summary + bucket table

7. **Footer**
   - "Export Prometheus" button (opens `/api/metrics/prometheus`)
   - "Collect Metrics" button (POSTs to `/api/metrics/collect`)
   - Last refresh timestamp, auto-refresh every 30s

### Backend Enhancements

**`/api/logs` (new)** — Merges ServerLog and ErrorLog tables, supports level/source/time filtering.

**`/api/metrics/collect` (new)** — POST endpoint that gathers system metrics (request_rate, error_rate, active_agents, queue_depth, memory, uptime, pending_approvals) and writes them to the Metric table.

**`/api/observability/dashboard` (enhanced)** — Added top-level `summary` object with: systemHealth, activeAgents, totalRequests24h, avgResponseTime, tokenUsage24h, queueDepth, activeAlerts, topEndpoints, errorRate24h. Added parallel queries for these fields.

### Design
- Color scheme: Healthy (#22C55E), Warning (#EAB308), Critical (#EF4444), Primary (#003ABC), Accent (#FF6A00)
- All cards p-4 padding, white background on #F8FAFC
- Responsive: 1→2→4 column grid for status cards
- Loading skeletons for initial load state
- Auto-refresh every 30 seconds via setInterval
- All lint checks pass with zero errors on modified files