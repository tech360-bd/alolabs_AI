# Task 3 — marketplace-api-builder

## Files Created

### 1. `/api/marketplace/route.ts`
- **GET**: Lists published marketplace listings with filters (type, category, pricing, search) and sorting (rating, installCount, createdAt). Paginated with `skip`/`take`.
- **POST**: Creates a new listing. Validates type (agent/skill/workflow), requires itemId/title/description. Defaults status to "published", pricing to "free".

### 2. `/api/marketplace/[id]/route.ts`
- **GET**: Returns single listing with all reviews (ordered by createdAt desc). 404 if not found.
- **PATCH**: Updates listing fields (title, description, category, tags, version, pricing, priceMonthly, featured, status). Validates status and pricing enums. 404 if not found.
- **DELETE**: Soft-deletes by setting status to "removed". 404 if not found.

### 3. `/api/marketplace/[id]/reviews/route.ts`
- **GET**: Lists reviews for a listing, paginated, ordered by createdAt desc. 404 if listing not found.
- **POST**: Adds a review (rating 1-5 required, title/comment optional). After creating, recalculates the listing's average rating and review count using `aggregate`.

### 4. `/api/marketplace/[id]/install/route.ts`
- **POST**: Increments `installCount` using Prisma `increment: 1`. 404 if listing not found.

## Notes
- All routes use `import { db } from '@/lib/db'`
- Search uses SQLite's case-insensitive `contains` (no `mode: 'insensitive'`)
- Next.js 16 params are async (`Promise<{ id: string }>`)
- Zero lint errors from these files