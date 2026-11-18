import type { TaskPriority } from '@/lib/agent-runtime/types';

export function taskPriority(value: string): TaskPriority {
  if (value === 'critical' || value === 'high' || value === 'low') return value
  return 'normal'
}
