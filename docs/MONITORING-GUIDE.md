# ALO Labs AIOS — Monitoring Setup Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** DevOps engineers and system administrators

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Starting the Monitoring Stack](#2-starting-the-monitoring-stack)
3. [Prometheus Configuration](#3-prometheus-configuration)
4. [Grafana Dashboard Import](#4-grafana-dashboard-import)
5. [Alert Rules](#5-alert-rules)
6. [Custom Metrics from ALO Labs AIOS](#6-custom-metrics)
7. [Log Aggregation](#7-log-aggregation)
8. [Uptime Monitoring](#8-uptime-monitoring)
9. [Performance Dashboards](#9-performance-dashboards)
10. [Alerting Channels Setup](#10-alerting-channels-setup)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ALO Labs AIOS (:3004)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  /api/health │  │ /api/metrics │  │ /api/metrics/       │  │
│  │  (liveness)  │  │ (system)     │  │ prometheus (exposer) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘  │
└─────────┼─────────────────┼─────────────────────┼────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Prometheus (:9090)                        │
│  - Scrapes /api/metrics/prometheus every 15s                 │
│  - Scrapes Node Exporter every 15s                           │
│  - Evaluates alert rules every 15s                           │
│  - 30-day retention                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│  Grafana (:3001) │    │ AlertManager     │
│  - Dashboards    │    │   (:9093)         │
│  - Visualizations│    │  - Slack          │
│  - Alerts UI     │    │  - Email         │
└──────────────────┘    │  - Webhook       │
                        └──────────────────┘

┌──────────────────┐
│ Node Exporter    │
│   (:9100)        │
│ - CPU, Memory    │
│ - Disk, Network  │
└──────────────────┘
```

### Components

| Component | Image | Port | Purpose |
|---|---|---|---|
| **Prometheus** | `prom/prometheus:v2.54.1` | 9090 | Metrics collection and alerting |
| **Grafana** | `grafana/grafana:11.3.0` | 3001 | Dashboards and visualization |
| **Node Exporter** | `prom/node-exporter:v1.8.2` | 9100 | Host-level metrics |
| **AlertManager** | `prom/alertmanager:v0.27.0` | 9093 | Alert routing and notifications |

---

## 2. Starting the Monitoring Stack

### Prerequisites

- Docker and Docker Compose installed
- Environment variables configured in `monitoring/.env` or root `.env`

### Start All Services

```bash
cd /opt/alolabs/agent-hub/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

### Verify All Containers

```bash
docker compose -f docker-compose.monitoring.yml ps
```

Expected output:

```
NAME                    STATUS    PORTS
alolabs-prometheus      Up        0.0.0.0:9090->9090/tcp
alolabs-grafana         Up        0.0.0.0:3001->3000/tcp
alolabs-node-exporter   Up        0.0.0.0:9100->9100/tcp
alolabs-alertmanager    Up        0.0.0.0:9093->9093/tcp
```

### Stop Services

```bash
docker compose -f docker-compose.monitoring.yml down
```

### View Logs

```bash
# All monitoring logs
docker compose -f docker-compose.monitoring.yml logs -f

# Specific service
docker compose -f docker-compose.monitoring.yml logs -f prometheus
```

---

## 3. Prometheus Configuration

### Create Configuration Files

Create the directory structure:

```bash
mkdir -p monitoring/prometheus monitoring/alertmanager monitoring/grafana/provisioning
```

### `monitoring/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'alolabs-aios'

scrape_configs:
  # ── ALO Labs AIOS Application Metrics ─────────────
  - job_name: 'alolabs-aios'
    static_configs:
      - targets: ['host.docker.internal:3004']
    metrics_path: '/api/metrics/prometheus'
    scrape_interval: 15s

  # ── Node Exporter (Host Metrics) ──────────────────
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    scrape_interval: 15s

  # ── Prometheus Self-Monitoring ───────────────────
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### `monitoring/prometheus/alerts.yml`

```yaml
groups:
  - name: alolabs-aios
    rules:
      # Application is down
      - alert: AppDown
        expr: up{job="alolabs-aios"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ALO Labs AIOS is down"
          description: "The application has been unresponsive for more than 1 minute."

      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # High memory usage
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes{job="alolabs-aios"} / (1024*1024*1024) > 3.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Using {{ $value }} GB of memory"

      # Disk space critical
      - alert: DiskSpaceCritical
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk space below 10%"

      # High CPU usage
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU usage above 90% for 10 minutes"
```

---

## 4. Grafana Dashboard Import

### Access Grafana

```
URL: http://your-server:3001
User: admin
Password: (set via GRAFANA_PASSWORD env var)
```

### Configure Prometheus Data Source

Create `monitoring/grafana/provisioning/datasources.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Recommended Dashboards

| Dashboard | Import ID | Description |
|---|---|---|
| Node Exporter Full | 1860 | Host metrics (CPU, memory, disk, network) |
| Next.js Overview | Custom | Application-specific metrics |
| AIOS Business | Custom | Agents, tasks, token usage |

### Create Business Metrics Dashboard

Use the following Prometheus queries for ALO Labs AIOS panels:

**Active Agents:**
```promql
agent_hub_agents_total
```

**Tasks by Status:**
```promql
agent_hub_tasks_total{status="running"}
agent_hub_tasks_total{status="pending"}
agent_hub_tasks_total{status="completed"}
```

**Daily Token Usage:**
```promql
agent_hub_token_usage_daily
```

**API Response Time (p95):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

---

## 5. Alert Rules

### Alert Severities

| Severity | Response Time | Channel |
|---|---|---|
| **critical** | Immediate (< 5 min) | PagerDuty + Slack + Email |
| **warning** | Same business day | Slack + Email |
| **info** | As needed | Email digest |

### Built-in Alert Rules

| Alert | Condition | Severity |
|---|---|---|
| `AppDown` | Application unreachable for 1m | critical |
| `HighErrorRate` | 5xx rate > 5% for 5m | warning |
| `HighMemoryUsage` | App using > 3.5 GB | warning |
| `DiskSpaceCritical` | Root disk < 10% free | critical |
| `HighCPUUsage` | CPU > 90% for 10m | warning |

---

## 6. Custom Metrics from ALO Labs AIOS

The application exposes custom business metrics via `src/lib/metrics-collector.ts`:

### System Metrics Endpoint

```
GET /api/metrics
```

Returns:

```json
{
  "agent_hub_agents_total": 15,
  "agent_hub_tasks_total": { "running": 8, "pending": 23, "completed": 452 },
  "agent_hub_queue_items": { "pending": 12, "processing": 3, "completed": 891 },
  "agent_hub_companies_total": 5,
  "agent_hub_token_usage_daily": 1245000,
  "collectedAt": "2025-01-15T10:30:00.000Z"
}
```

### Prometheus Exposition Format

```
GET /api/metrics/prometheus
```

Returns metrics in Prometheus text exposition format, suitable for scraping.

### Token Budget Metrics

The `src/lib/token-guard.ts` module tracks per-company token usage:

| Metric | Type | Description |
|---|---|---|
| `token_usage_total` | Counter | Cumulative token usage |
| `token_budget_remaining` | Gauge | Remaining tokens in budget |
| `token_budget_warning` | Counter | Budget warning alerts fired |

### Infrastructure Metrics

The system tracks infrastructure service health in the `InfraService` table:

| Service | Metrics Tracked |
|---|---|
| **Redis** | Latency, connection status, memory usage |
| **PostgreSQL** | Latency, active connections, database size |
| **Qdrant** | Latency, collection count, point count |
| **MinIO** | Latency, object count, total size |

Access via: `GET /api/infra/status`

---

## 7. Log Aggregation

### Application Logs

```bash
# Real-time application logs
sudo journalctl -u alolabs-agent-hub -f

# Nginx access logs
sudo tail -f /var/log/nginx/alolabs_panel_access.log

# Error-only logs
sudo journalctl -u alolabs-agent-hub -p err -f
```

### Structured Log Format

Application logs follow this structure (via systemd):

```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [MODULE] Message
```

### Recommended: Loki + Grafana

For centralized log aggregation:

```yaml
# Add to docker-compose.monitoring.yml
services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
```

Configure Promtail to scrape:
- `/var/log/nginx/*.log` (Nginx access/error)
- `/var/log/journal/` (systemd journal)

---

## 8. Uptime Monitoring

### Built-in Health Check

The application provides `GET /api/health` which returns:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 86400,
  "version": "0.2.0"
}
```

### Cron-Based Health Check

The cron job (`deploy/cron/alolabs-cron`) runs health checks every 5 minutes:

```bash
*/5 * * * * root /opt/alolabs/agent-hub/deploy/scripts/health-check.sh --json --quiet \
  > /opt/alolabs/agent-hub/logs/health-last.json 2>&1 || true
```

### External Uptime Monitoring

For production, use an external service:

| Service | Free Tier | Check Frequency |
|---|---|---|
| **UptimeRobot** | 50 monitors | 5 minutes |
| **BetterUptime** | 10 monitors | 1 minute |
| **Pingdom** | Trial only | 1 minute |

Configure the monitor to check `https://panel.alolabs.net/api/health`.

---

## 9. Performance Dashboards

### Key Panels to Create

#### Overview Dashboard

| Panel | Query / Source |
|---|---|
| **Request Rate** | `rate(http_requests_total[5m])` |
| **Error Rate** | `rate(http_requests_total{status=~"5.."}[5m])` |
| **P95 Latency** | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` |
| **Active Users** | Application metric |
| **Queue Depth** | `agent_hub_queue_items{status="pending"}` |

#### AI/ML Dashboard

| Panel | Query / Source |
|---|---|
| **Token Usage (24h)** | `agent_hub_token_usage_daily` |
| **Active Agents** | `agent_hub_agents_total` |
| **Tasks Completed** | `agent_hub_tasks_total{status="completed"}` |
| **Model Latency** | Per-model response times |

#### Infrastructure Dashboard

| Panel | Query / Source |
|---|---|
| **CPU Usage** | `100 - avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100` |
| **Memory Usage** | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` |
| **Disk Usage** | `node_filesystem_avail_bytes / node_filesystem_size_bytes` |
| **Redis Latency** | `redis_ping_latency_ms` |
| **DB Connections** | `pg_stat_activity` metrics |

---

## 10. Alerting Channels Setup

### Slack Integration

Create `monitoring/alertmanager/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX'

route:
  receiver: 'slack-notifications'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'slack-critical'
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: 'slack-warnings'
      repeat_interval: 4h

receivers:
  - name: 'slack-critical'
    slack_configs:
      - channel: '#alolabs-critical'
        send_resolved: true
        title: '🔴 {{ .GroupLabels.alertname }}'
        text: >-
          *Severity:* {{ .CommonLabels.severity }}
          *Summary:* {{ .CommonAnnotations.summary }}
          *Description:* {{ .CommonAnnotations.description }}

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#alolabs-alerts'
        send_resolved: true
        title: '🟡 {{ .GroupLabels.alertname }}'
        text: >-
          {{ .CommonAnnotations.summary }}

  - name: 'slack-notifications'
    slack_configs:
      - channel: '#alolabs-alerts'
        send_resolved: true
```

### Email Integration

```yaml
receivers:
  - name: 'email-notifications'
    email_configs:
      - to: 'oncall@alolabs.net'
        from: 'alerts@alolabs.net'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alerts@alolabs.net'
        auth_password: 'app-specific-password'
        require_tls: true
```

### Webhook Integration

```yaml
receivers:
  - name: 'webhook-notifications'
    webhook_configs:
      - url: 'https://your-webhook-endpoint.com/alerts'
        send_resolved: true
```

### Test Alerts

```bash
# Trigger a test alert via AlertManager API
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {"alertname": "TestAlert", "severity": "warning"},
  "annotations": {"summary": "Test alert from ALO Labs AIOS"}
}]'
```

---

## Monitoring Checklist

- [ ] Monitoring Docker stack started (`docker compose up -d`)
- [ ] Prometheus scraping `/api/metrics/prometheus` (check targets page)
- [ ] Grafana accessible at `:3001` with custom credentials
- [ ] Prometheus data source configured in Grafana
- [ ] Business metrics dashboard created
- [ ] Alert rules defined and firing correctly
- [ ] Slack/email/webhook notifications working
- [ ] Health check cron job installed and running
- [ ] External uptime monitor configured
- [ ] Log aggregation (optional Loki) configured