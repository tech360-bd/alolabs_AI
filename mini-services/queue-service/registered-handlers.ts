import { db } from '../../src/lib/db';
import { processQueue, reclaimExpiredLeases, type JobResult, type ProcessOptions } from '../../src/lib/job-queue';

type Handler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
const handlers = new Map<string, Handler>();
let polling = false;

/** In-process extension API. Nothing is registered by the standalone monitor. */
export function registerHandler(jobType: string, handler: Handler): void {
  if (!jobType.trim() || typeof handler !== 'function') throw new TypeError('A named job type and handler are required');
  handlers.set(jobType, handler);
}

export async function pollRegisteredJobs(onTransition?: ProcessOptions['onTransition']): Promise<JobResult[]> {
  if (!handlers.size || polling) return [];
  polling = true;
  try {
    const registered = new Map(handlers);
    const jobTypes = [...registered.keys()];
    const queues = await db.jobQueue.findMany({
      where: { isActive: true, name: { notIn: ['agentos', 'voice'] },
        items: { some: { jobType: { in: jobTypes }, status: { in: ['queued', 'processing'] } } } },
      select: { name: true }, orderBy: { createdAt: 'asc' },
    });
    const results: JobResult[] = [];
    for (const queue of queues) {
      await reclaimExpiredLeases(queue.name, jobTypes);
      results.push(...await processQueue(queue.name, job => {
        const handle = registered.get(job.jobType);
        if (!handle) throw new Error('No handler for this job type');
        return handle(JSON.parse(job.payload || '{}'));
      }, { jobTypes, onTransition }));
    }
    return results;
  } finally { polling = false; }
}
