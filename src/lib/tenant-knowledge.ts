/**
 * Fail-closed visibility check for shared KnowledgeNode records.
 *
 * KnowledgeNode has no relational company owner, so metadata is the ownership
 * boundary for unassigned nodes. Department nodes inherit tenant visibility
 * only when their department was independently verified as tenant-owned.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isKnowledgeVisibleToCompany(
  metadataJson: string,
  companyId: string,
  belongsToTenantDepartment: boolean,
): boolean {
  try {
    const metadata: unknown = JSON.parse(metadataJson)
    if (!isRecord(metadata)) return false

    // An explicit owner always wins, even when a public flag is also present.
    if ('companyId' in metadata) return metadata.companyId === companyId
    if (belongsToTenantDepartment) return true
    return metadata.visibility === 'public' || metadata.scope === 'global' || metadata.isPublic === true
  } catch {
    return false
  }
}
