#!/usr/bin/env npx tsx
/**
 * Seed the Service catalog — idempotent.
 * Run: npx tsx scripts/seed-services.ts
 *
 * Creates the 5 default AI services that the /v1/ai/** gateway exposes.
 * Does NOT create entitlements (those are per-tenant, granted by admins).
 */

import { db } from '@/lib/db';

const SERVICES = [
  { slug: 'ai-chat', name: 'AI Chat', description: 'Conversational AI chat service.', category: 'ai', endpoint: '/v1/ai/tasks', scope: 'ai:chat' },
  { slug: 'ai-knowledge-search', name: 'AI Knowledge Search', description: 'Hybrid RAG over your authorized knowledge base.', category: 'knowledge', endpoint: '/v1/ai/tasks', scope: 'ai:knowledge:search' },
  { slug: 'ai-tasks', name: 'AI Tasks', description: 'Asynchronous AI task execution.', category: 'ai', endpoint: '/v1/ai/tasks', scope: 'ai:tasks' },
  { slug: 'ai-content', name: 'AI Content Generation', description: 'Generate content from specifications.', category: 'ai', endpoint: '/v1/ai/tasks', scope: 'ai:content' },
  { slug: 'ai-analysis', name: 'AI Analysis', description: 'Analyze data and return insights.', category: 'analytics', endpoint: '/v1/ai/tasks', scope: 'ai:analysis' },
];

async function main() {
  console.log('\n🌱 Seeding service catalog...\n');
  for (const svc of SERVICES) {
    const existing = await db.service.findUnique({ where: { slug: svc.slug } });
    if (existing) {
      console.log(`  ✓ ${svc.slug} (exists)`);
      continue;
    }
    await db.service.create({ data: { ...svc, isActive: true } });
    console.log(`  + ${svc.slug} (created)`);
  }
  console.log('\n✅ Service catalog seeded.\n');
}

main().catch(console.error).finally(() => db.$disconnect());
