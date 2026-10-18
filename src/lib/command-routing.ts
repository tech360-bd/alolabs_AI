/**
 * Deterministic workflow trigger matching.
 *
 * Commands are matched with substring `includes`, so one command can satisfy
 * several triggers ("study abroad" contains "study"). Picking the first match
 * in database order makes routing depend on insertion order. These helpers
 * always choose the longest trigger; ties break on workflow name so the result
 * is stable across queries.
 */

export interface WorkflowTriggerCandidate {
  id: string;
  name: string;
  /** Raw `Workflow.triggers` value (JSON string) or an already-parsed array. */
  triggers: string | readonly string[] | null | undefined;
}

export interface TriggerMatch {
  workflowId: string;
  workflowName: string;
  trigger: string;
}

export function parseTriggers(raw: WorkflowTriggerCandidate['triggers']): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string');
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Return the best matching workflow for a command, or null.
 *
 * The comparison is case-insensitive and trims triggers. Empty triggers never
 * match (an empty string is contained in everything).
 */
export function matchWorkflow(
  command: string,
  candidates: readonly WorkflowTriggerCandidate[],
): TriggerMatch | null {
  const haystack = (command ?? '').toLowerCase();
  if (!haystack.trim()) return null;

  let best: TriggerMatch | null = null;
  let bestLength = 0;

  for (const candidate of candidates) {
    for (const trigger of parseTriggers(candidate.triggers)) {
      const needle = trigger.toLowerCase().trim();
      if (!needle || !haystack.includes(needle)) continue;
      const isBetter =
        needle.length > bestLength ||
        (needle.length === bestLength && best !== null && candidate.name < best.workflowName);
      if (isBetter) {
        best = { workflowId: candidate.id, workflowName: candidate.name, trigger };
        bestLength = needle.length;
      }
    }
  }

  return best;
}
