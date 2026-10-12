# ALO Labs AIOS — Developer Guide

## Prerequisites

- **Bun** runtime (recommended) or Node.js 20+
- **Git** for version control
- A code editor with TypeScript support (VS Code recommended)

## Quick Start

```bash
# Clone and install dependencies
bun install

# Generate Prisma client and push schema
bun run db:generate
bun run db:push

# Seed the database (creates initial admin user, departments, agents, skills)
bun run scripts/seed.ts

# Start development server
bun run dev
# Server runs at http://localhost:3000
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout, global providers
│   ├── page.tsx                # SPA entry point
│   ├── globals.css             # Tailwind v4 imports
│   └── api/                    # 251 API route directories
│       ├── auth/               # Authentication endpoints
│       ├── agents/             # Agent management
│       ├── skills/             # Skill management
│       ├── workflows/          # Workflow management
│       ├── crm/                # CRM endpoints
│       ├── billing/            # Billing endpoints
│       └── ...                 # 40+ route groups
├── components/
│   ├── ui/                     # 24 shadcn/ui primitives
│   ├── panels/                 # 82 lazy-loaded panel components
│   ├── agent-hub-shell.tsx     # Main app shell
│   └── alo-logo.tsx            # Brand logo
├── lib/
│   ├── auth.ts                 # Core auth (bcrypt, sessions)
│   ├── route-auth.ts           # withAuth() route guard
│   ├── db.ts                   # Prisma client singleton
│   ├── api.ts                  # Frontend API utility
│   ├── job-queue.ts            # In-process job queue
│   ├── rag-engine.ts           # RAG engine
│   ├── qdrant.ts               # Qdrant client
│   ├── agent-runtime/          # Agent execution system
│   ├── ai-router/              # LLM routing
│   ├── storage/                # File storage abstraction
│   ├── security/               # Security utilities
│   ├── social/                 # Social media providers
│   ├── email/                  # Email (SMTP/IMAP)
│   ├── whatsapp/               # WhatsApp integration
│   ├── memory/                 # Memory tier management
│   ├── approval-engine/        # Approval workflows
│   ├── event-bus/              # Internal events
│   ├── db-adapters/            # Multi-DB adapters
│   ├── metrics-collector.ts    # Prometheus metrics
│   ├── cron-jobs.ts            # Scheduled jobs
│   └── validators.ts           # Input validation
├── store/
│   └── app.ts                  # Zustand global store
└── hooks/
    ├── use-mobile.ts           # Responsive hook
    ├── use-toast.ts            # Toast hook
    ├── use-api-actions.ts      # API action helpers
    └── use-data-table.ts       # Table config hook
```

---

## Adding a New API Endpoint

### 1. Create the route file

API routes follow Next.js App Router conventions. Create a `route.ts` file:

```bash
# For a collection endpoint
src/app/api/my-resource/route.ts

# For an item endpoint
src/app/api/my-resource/[id]/route.ts
```

### 2. Implement the handler

```typescript
// src/app/api/my-resource/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // 1. Authenticate
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    // 3. Query database
    const [items, total] = await Promise.all([
      db.myModel.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.myModel.count(),
    ]);

    // 4. Return paginated response
    return NextResponse.json({
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Same auth pattern
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate input
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create record
    const item = await db.myModel.create({
      data: { name: body.name },
    });

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 3. Alternative: Using withAuth wrapper

For cleaner code, use the `withAuth` HOC from `src/lib/route-auth.ts`:

```typescript
import { withAuth } from '@/lib/route-auth';

export const GET = withAuth(async (req, ctx, user) => {
  // user.userId, user.role, user.email, user.name are guaranteed
  const items = await db.myModel.findMany();
  return NextResponse.json({ data: items });
});
```

### 4. Register in navigation

Add the panel mapping in the app shell's navigation config so the UI can display the new endpoint's panel.

---

## Adding a New Panel Component

### 1. Create the panel file

```bash
src/components/panels/my-panel.tsx
```

### 2. Implement the panel

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MyPanel() {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my-resource')
      .then((r) => r.json())
      .then((json) => setData(json.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Panel</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-muted-foreground">No data available</p>
          ) : (
            <pre>{JSON.stringify(data, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3. Register as lazy-loaded

Panels are lazy-loaded for code splitting. Add to the shell's panel registry:

```typescript
const MyPanel = React.lazy(() => import('@/components/panels/my-panel'));
```

---

## Database Changes

### Adding a new model

1. Add the model to `prisma/schema.prisma`
2. Run `bun run db:push` (development) or `bun run db:migrate` (production migration)
3. Run `bun run db:generate` to update the Prisma client

### Adding a field to an existing model

```prisma
model Agent {
  // ... existing fields
  newField String @default("default-value")
}
```

Then run:

```bash
bun run db:push
```

### Adding relations

```prisma
model Agent {
  id      String  @id @default(cuid())
  tags    Tag[]   // One-to-many
}

model Tag {
  id      String  @id @default(cuid())
  agentId String
  agent   Agent   @relation(fields: [agentId], references: [id], onDelete: Cascade)
}
```

---

## Working with the AI Router

### Register a provider

```typescript
import { AIRouter } from '@/lib/ai-router';
import { OllamaProvider } from '@/lib/ai-router/ollama-provider';

const router = new AIRouter();
router.registerProvider(new OllamaProvider({ baseUrl: 'http://localhost:11434' }));
```

### Route a request

```typescript
const response = await router.chat({
  model: 'qwen2.5:7b',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  temperature: 0.7,
  maxTokens: 1000,
});
```

### Stream a response

```typescript
const stream = await router.stream({
  model: 'qwen2.5:7b',
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

---

## Working with the Job Queue

```typescript
import { enqueue, processQueue, getQueueStats, retryDeadLetterJob } from '@/lib/job-queue';

// Enqueue a job
const job = await enqueue('my-queue', 'process-data', { fileId: 'abc123' }, {
  priority: 10,
  maxRetries: 3,
});

// Process all pending jobs in a queue
const results = await processQueue('my-queue', async (job) => {
  // Process job.payload
  return { success: true };
});

// Check queue stats
const stats = await getQueueStats('my-queue');
// { pending: 5, processing: 2, completed: 100, failed: 3, cancelled: 0, total: 110 }

// Retry a failed job
await retryDeadLetterJob(job.id);
```

---

## Working with Storage

```typescript
import { getStorage } from '@/lib/storage';

const storage = getStorage();

// Upload a file
const uploaded = await storage.upload({
  file: File object,
  path: 'uploads/document.pdf',
});

// Get a signed URL (for local storage)
const signedUrl = await storage.getSignedUrl('uploads/document.pdf', 3600);

// Delete a file
await storage.delete('uploads/document.pdf');

// Get storage stats
const stats = await storage.getStats();
```

---

## Working with RAG

```typescript
import { chunkText, ingestDocument, queryRag } from '@/lib/rag-engine';

// Chunk text manually
const chunks = chunkText(longText, { chunkSize: 512, overlap: 50 });

// Ingest a document into a collection
const result = await ingestDocument({
  collectionId: 'clx...',
  name: 'Company Handbook.pdf',
  content: fileContent,
  companyId: 'clx...',
});

// Query the RAG engine
const results = await queryRag({
  query: 'What is the vacation policy?',
  collectionId: 'clx...',
  companyId: 'clx...',
  topK: 5,
});
```

---

## Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# With coverage
bun run test:coverage

# UI mode
bun run test:ui
```

Tests are organized in `__tests__/`:

```
__tests__/
├── unit/
│   ├── lib/           # Library unit tests
│   ├── hooks/         # Hook unit tests
│   ├── components/    # Component unit tests
│   └── store/         # Store unit tests
├── api/               # API integration tests
└── e2e/               # End-to-end tests
    └── login-flow.test.ts
```

---

## Linting

```bash
bun run lint
```

ESLint 9 with Next.js config. The project maintains zero errors, zero warnings.

---

## Build & Deployment

```bash
# Build for production
bun run build

# Start production server
bun run start
```

The build produces a standalone Next.js output in `.next/standalone/`.

See `DEPLOYMENT.md` for full deployment instructions.

---

## Code Conventions

1. **No demo/mock data**: All panels fetch from real API endpoints. Empty states shown when no data exists.
2. **No TODO/FIXME in production code**: All stubs should be replaced with real implementations.
3. **Lazy loading**: All panel components use `React.lazy()` for code splitting.
4. **Error handling**: API routes return consistent `{ error: string }` responses with appropriate HTTP status codes.
5. **Pagination**: List endpoints support `page` and `limit` query parameters, returning `{ data, total, page, limit, totalPages }`.
6. **Authentication**: All protected endpoints verify Bearer tokens. Use `withAuth()` wrapper for consistency.
7. **Type safety**: `ignoreBuildErrors: false` in next.config.ts. All TypeScript errors must be resolved.
8. **Light theme**: All panels use the light theme. No dark-themed panel components.

## Key Libraries

| Library | Purpose | Import Path |
|---------|---------|-------------|
| Prisma | Database ORM | `@/lib/db` |
| Zod | Schema validation | `zod` |
| Zustand | Global state | `@/store/app` |
| TanStack Query | Server state | `@tanstack/react-query` |
| TanStack Table | Data tables | `@tanstack/react-table` |
| Recharts | Charts | `recharts` |
| date-fns | Date formatting | `date-fns` |
| Lucide | Icons | `lucide-react` |
| sonner | Toast notifications | `sonner` |
| React Hook Form | Forms | `react-hook-form` |
| Framer Motion | Animations | `framer-motion` |
| react-markdown | Markdown rendering | `react-markdown` |
| sharp | Image processing | `sharp` |
| ioredis | Redis client | `ioredis` |
| bcrypt | Password hashing | `bcrypt` |
| z-ai-web-dev-sdk | AI/ML SDK | `z-ai-web-dev-sdk` |

---

## Environment Variables

See `docs/ENVIRONMENT-VARIABLES.md` for the complete list of environment variables and their purposes.

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common issues and solutions.

## Deployment

See `DEPLOYMENT.md` and `docs/DEPLOYMENT.md` for production deployment guides.
