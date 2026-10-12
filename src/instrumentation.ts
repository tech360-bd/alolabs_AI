/**
 * Next.js instrumentation entry point. The edge build must not import
 * Prisma, node:crypto, or the AgentOS worker. Next's runtime-constant
 * condition lets the bundler tree-shake the node-only module on Edge.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeWorker } = await import('./instrumentation.node');
    await registerNodeWorker();
  }
}
