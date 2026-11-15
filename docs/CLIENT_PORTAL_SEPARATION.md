# Client portal / internal platform separation

ALO Labs runs two products on one codebase, for two different audiences:

| | **Client portal** | **Internal platform (AgentOS)** |
|---|---|---|
| Who | Customers | ALO Labs personnel |
| Pages | `/portal/**` | `/dashboard`, plus the internal reference pages listed below |
| API | `/api/portal/**` | everything else under `/api/**` (incl. `/api/internal/**`) |
| Sees | services, own projects, deliverables, quotations, invoices, tickets, notifications | agents, departments, models, providers, prompts, workflows, runs, costs, all clients |

A customer never sees how work is produced. Staff never work inside the portal;
they manage client work from `/api/internal/**`.

## The rule, and where it is enforced

The audience is derived from **`User.role`**, in one place:
`src/lib/access/surfaces.ts`. Roles in `INTERNAL_ROLES` are internal; **every
other role is a client** (deny by default). `ALO_INTERNAL_EXTRA_ROLES=manager,operator`
can opt those two legacy roles in.

Enforcement is layered so that no single mistake opens the boundary:

1. **Session** (`src/lib/auth.ts`) — a session is minted for one audience.
   Client tokens carry the `alc_` prefix. `verifySessionToken(token)` admits
   **internal sessions only** unless a caller explicitly asks for
   `{ audience: 'client' }` (the portal) or `'any'` (three shared account
   routes). It re-reads the owner's role on every call, so a role change takes
   effect immediately and revokes sessions minted for the other surface.
   Every existing route that already called `verifySessionToken`,
   `requireAuth`, `requireRole`, `getAuthUser` or `withAuth` is therefore
   internal-only without being edited.
2. **Proxy** (`src/proxy.ts`) — wrong-surface page → redirect to the caller's
   own home; wrong-surface API call → rewritten to `/api/access-denied`
   (audited; 404 for clients, 403 for staff) before any handler runs.
3. **Server components** — `requireServerSession()` (internal) and
   `requireClientServerSession()` (portal) check the database before rendering.
4. **Portal handlers** (`clientRoute` in `src/lib/portal/auth.ts`) — the tenant
   comes from the caller's membership of a `client` company and nothing in the
   request; all queries go through `tenantDb(companyId)`; responses are built
   by allow-list DTOs (`src/lib/portal/dto.ts`) and checked by a leak guard
   that blocks the response (500 + audit) if an internal field is present.
5. **Publishing** — text delivered to a client passes `findInternalDetail`
   (`src/lib/client-services/client-safe.ts`); a deliverable that names an
   agent, department, model, provider, prompt or cost is refused (422).
6. **API keys** — a key belonging to a `client` company is refused on the
   internal v1 API; it works only on the published `/api/v1/ai/<service>` plane.
7. **Sockets** — the realtime and queue services admit verified internal
   sessions only (`mini-services/shared/internal-auth.ts`).

Refusals are recorded as `SecurityEvent` rows (`recordAccessViolation`) and can
be read by security staff at `GET /api/internal/security/access-violations`.

## Accounts

* `Company.accountType` is `internal` (an AgentOS tenant) or `client`
  (a customer). The column default is `client`.
* Customers are created by self-registration, OAuth sign-up, or
  `POST /api/internal/clients`. All three create a `client`-role login and a
  `ClientAccount`; none can create internal personnel. Privileged fields in a
  registration body are ignored and audited.
* Internal personnel are created only by a Super Admin through `POST /api/users`,
  which requires an explicit internal role.
* A login that belongs to a client company cannot be given an internal role.

## Internal reference pages

These used to be public. Their subject is how the platform works, so they now
require an internal session and are not linked from the public site:
`/brand`, `/design`, `/invoice`, `/site/platform/**`, `/site/pricing`,
`/site/diagrams`, `/site/press`, `/site/insights`, `/site/work`.

Public: `/`, `/site/solutions`, `/site/about`, `/site/careers`, `/site/contact`, `/login`.

## Rolling this out to an existing deployment

1. Apply the schema: SQLite `npm run db:push:sqlite`; MySQL
   `prisma/migrations/mysql/20261115_client_portal_separation.sql`
   (unverified against a live MySQL server — run on staging first).
2. Run `npm run db:migrate:client-separation -- --dry-run`, review, then run it
   without `--dry-run`. It classifies the pre-existing companies as `internal`
   (use `KEEP_AS_CLIENT=slug,…` for any that are really customers), seeds the
   service catalogue, and lists the logins that are no longer internal.
3. For each listed login, a Super Admin decides:
   staff on a legacy role → `PUT /api/users/:id { "role": "<internal role>" }`;
   customer → `POST /api/internal/clients { …, "adoptExistingLogin": true }`.
   **No login is promoted automatically.**
4. Sessions held by non-internal logins from before the release are rejected on
   first use; those users sign in again.
5. Socket services: set `QUEUE_CORS_ORIGIN` if the queue service is not served
   same-origin; workers without a user session use `QUEUE_SERVICE_TOKEN`.

## Tests

* `__tests__/integration/client-portal-separation.test.ts` — real database and
  handlers: both audiences on both surfaces, proxy routing, cross-tenant 404s,
  forged tenant, document ownership, client-safe publishing, leak guard,
  registration and role changes.
* `src/__tests__/lib/session-audience.test.ts` — session/audience binding.
* `__tests__/unit/server-session-page.test.ts` — page gates.
* `__tests__/unit/agentos-v1-auth.test.ts` — client API keys vs the internal API.
* `__tests__/unit/socket-internal-auth.test.ts` — socket services.
