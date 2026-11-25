# Super Admin Console — Architecture

> Generated: 2026-11-25 · Branch `feat/super-admin-console` off `main @ 51d20f9`. Companion to `docs/architecture/CENTRAL_PLATFORM_AUDIT.md`. Principle carried over from the Master Directive: **every action is real, traceable, and honest — no simulated success.**

## 1. System context

The console is the natural-language control hub on top of the existing platform layers. It introduces no parallel stack: every capability it exposes already exists behind a guarded route.

```mermaid
graph TB
    subgraph Operator
        SA[Super Admin]
    end
    subgraph Console["Super Admin Console (ChatGPT-style panel)"]
        UI[super-admin-console.tsx<br/>chat + sidebar]
    end
    subgraph Execution["Existing platform layers"]
        CA[Command Agent<br/>bounded tool loop, max 6 steps]
        ST[Supervisor tool registry<br/>deny-by-default mutations]
        GW[Company AI gateway<br/>free-tier omni-routing]
        SH[Self-Healing Engine<br/>agent recovery]
        SD[Site Doctor<br/>internet-facing probes]
    end
    subgraph State["Durable state"]
        DB[(MySQL / Prisma<br/>AIProviderConfig · SiteContentBlock<br/>SiteDoctorProbe · AuditEvent)]
        BUS[Event bus]
    end
    subgraph Public["Public surface"]
        SITE[Public website<br/>announcement bar]
        EXT[External targets<br/>www.alolabs.net …]
    end

    SA --> UI
    UI -->|"POST /api/command-agent/chat<br/>mode=read|supervisor"| CA
    CA --> GW
    CA -->|"read tools"| DB
    CA -->|"mode=supervisor"| ST
    ST --> DB
    ST --> SD
    ST --> SH
    SH --> BUS
    SD -->|"HTTP probes"| EXT
    SD --> DB
    SD --> BUS
    SITE -->|"readSiteContentBlock"| DB
```

## 2. Natural-language command execution (tool-calling protocol)

The agent follows a bounded **tool-calling loop** (OpenAI-style function calling, enforced at 6 steps), routed through the free-tier gateway so every model call inherits policy, budgets, verification and usage metering. Model order (omni-routing): Groq → OpenRouter `:free` → Gemini/Cerebras → Ollama, as configured in the Super Admin AI Control Plane.

```mermaid
sequenceDiagram
    participant SA as Super Admin
    participant API as /api/command-agent/chat
    participant AG as Command Agent
    participant GW as AI Gateway (free-only)
    participant T as Tools
    participant A as AuditEvent

    SA->>API: message + mode (read|supervisor)
    API->>API: requireAuth · rate limit · mode downgrade<br/>(non-super_admin → read, silently enforced)
    API->>A: command_agent.chat.request
    API->>AG: runCommandAgent(input)
    AG->>GW: chat(messages, tools, maxTokens=2048)
    GW-->>AG: content | toolCalls[]
    loop max 6 steps, while toolCalls
        AG->>T: executeSupervisorTool / read tool / free external tool
        T-->>AG: output (truncated, honest errors)
        AG->>GW: chat(+tool results)
    end
    AG-->>API: content + trace[] + provider/model + requestIds
    API-->>SA: response with per-step tool trace
```

**Supervisor mutation gate** (all five conditions, in order):

```mermaid
graph LR
    A[Tool call] --> B{role ==<br/>super_admin?}
    B -- no --> X1[refuse + log]
    B -- yes --> C{tool registered?}
    C -- no --> X2[refuse: unknown tool]
    C -- yes --> D{confirmation<br/>argument present?}
    D -- no --> X3[refuse: ask operator]
    D -- yes --> E[Run real mutation]
    E --> F[AuditEvent<br/>before → after]
    F --> G[Verdict passed to operator<br/>verbatim — failures stay failures]
```

## 3. Omni-routing — one active primary, standby ring

Providers are never all "active at once" in the routing sense: the policy always promotes **exactly one primary** (lowest `priority` wins) and keeps the rest as standby. The supervisor tool `set_primary_ai_provider` re-orders priority; `set_ai_provider_enabled` removes/returns a provider entirely. Every switch is audited with before → after.

```mermaid
stateDiagram-v2
    [*] --> Standby: provider configured + verified
    Standby --> Primary: set_primary_ai_provider<br/>(priority → 10, audited)
    Primary --> Standby: another provider promoted<br/>(old primary demoted to 100)
    Standby --> Disabled: set_ai_provider_enabled=false
    Disabled --> Standby: set_ai_provider_enabled=true
    Primary --> Standby: health failure → failover<br/>(gateway picks next fallback-eligible)
```

Failover stays automatic inside a turn (timeout → next fallback-eligible candidate), which is what makes the 300+ free-API routing platforms usable: the catalogue (`free-catalog.ts`) lists providers with verification pointers, the Control Plane holds verified configs, and the policy composes the live chain per request.

## 4. Self-healing — two loops, one ledger

**Loop A — internal agents** (existing `SelfHealingEngine`): health monitor → unhealthy agent → strategy (retry/restart/rollback/escalate) → max 3 attempts → event bus. The supervisor tool `run_self_healing_recovery` triggers it on demand and reports the engine's verdict **verbatim**.

**Loop B — internet-facing (Site Doctor, new)**: probes what the outside world sees.

```mermaid
graph TB
    P[Probe target<br/>HTTP GET, 10s timeout] --> C{Classify}
    C -->|2xx fast| H[healthy]
    C -->|3xx/4xx or slow| D[degraded]
    C -->|5xx / network / timeout| U[unreachable]
    H --> PS[(SiteDoctorProbe<br/>attempt=1)]
    D --> R[Repair: retry after 1.5s backoff]
    U --> R
    R --> R2{retry result}
    R2 -->|healthy| PS2[(attempt=2, healthy)]
    R2 -->|still failing| E{previous failure<br/>in history?}
    E -- no --> PS3[(attempt=2, honest verdict)]
    E -- yes --> ESC[escalated=true<br/>+ AuditEvent site_doctor.escalated]
    ESC --> PS4[(attempt=2, escalated)]
```

No repair is ever reported as done when it did not happen: a retry that still fails is recorded as still failing (and escalated only when it is a repeat failure). Targets come from `SITE_DOCTOR_TARGETS` (comma-separated) with a sensible single-target default; an empty configuration produces an honest "no targets" report, not a green pass.

## 5. Website updates via natural language

End-to-end real path (no code-file editing at runtime):

```mermaid
graph LR
    NL["Natural language<br/>(SUPERVISOR chat)"] --> T1["set_site_content<br/>confirm + super_admin"]
    T1 --> DB[(SiteContentBlock<br/>versioned, audited)]
    DB --> R["readSiteContentBlock<br/>(server components)"]
    R --> BAR["Announcement bar<br/>in the public site"]
    BAR --> V[Visitor]
    T1 -.->|GET /api/public/site-content| APIX[Public read API]
```

`readSiteContentBlock` always falls back to the shipped code default on missing/malformed data — a console edit can never break a page. Writes are versioned and audited; the console sidebar shows the live blocks.

## 6. Protocols & conventions followed

- **Tool-calling protocol**: OpenAI-style function-call JSON schemas for every agent tool (read + supervisor registries); bounded loop; tool output truncation.
- **Capability-based security**: mutations are a separate, explicitly-registered capability gated on role, confirmation and audit — deny by default, mirroring the v1 gateway scope model (`v1-auth.ts`).
- **Event-driven integration**: recoveries, escalations and console actions emit on the existing event bus / AuditEvent ledger rather than direct side channels.
- **Additive-only persistence**: new tables (`SiteContentBlock`, `SiteDoctorProbe`) via migration `20261125_super_admin_console.sql` with a dedicated rollback file; no destructive ALTER.
- **Free-first**: the console runs on the same free-only gateway policy (`AI_API_MODE=disabled`, verified free providers); no paid API can be reached without the `approved_paid` authorization workflow (unchanged).

## 7. Component map (all paths verified on this branch)

| Piece | Path |
|---|---|
| Console panel (UI) | `src/components/enterprise/panels/super-admin-console.tsx` |
| Navigation registration | `src/lib/dashboard/navigation.ts` (Command section + import map) |
| Supervisor tool registry | `src/lib/command-agent/supervisor-tools.ts` |
| Agent loop extension | `src/lib/command-agent/agent.ts` (`mode`) |
| Chat route (mode gating) | `src/app/api/command-agent/chat/route.ts` |
| Site Doctor | `src/lib/self-healing/site-doctor.ts` |
| Healing engine (actor param) | `src/lib/self-healing/index.ts` |
| Site content read helper | `src/lib/site-content.ts` |
| Public announcement bar | `src/components/site/announcement-bar.tsx` (+ `src/app/layout.tsx`) |
| API: doctor status/run | `src/app/api/super-admin/site-doctor/route.ts` |
| API: public content read | `src/app/api/public/site-content/route.ts` |
| Migration + rollback | `prisma/migrations/mysql/20261125_super_admin_console*.sql` |
| Tests | `__tests__/unit/supervisor-tools.test.ts`, `__tests__/unit/site-doctor.test.ts` (+ regression `command-agent.test.ts`) |

## 8. Honest limitations

1. The site doctor detects and retries/escalates — it does not (yet) automatically rebuild or redeploy the website; that step runs through the Git/CI workflow and is a documented next step.
2. Model-side command understanding still needs at least one configured free provider (Groq/OpenRouter/Gemini/Cerebras/Ollama). Without one, the gateway returns the honest "Configuration required" error — the console reports it verbatim instead of faking an answer.
3. Supervisor mutations are non-transactional reads-then-writes; concurrent console edits could interleave (version numbers are informational, audit entries always capture the actual before/after).
4. The standalone typecheck/build gate could not run in the 4 GB sandbox (OOM, exit 137) — verification evidence for this PR: lint 0, full vitest suite, and the target-file runs above.
