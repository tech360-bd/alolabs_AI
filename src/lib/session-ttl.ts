const REMEMBER_ME_TTL_HOURS = 30 * 24;

export function sessionTtlHours(rememberMe: boolean): number {
  if (rememberMe) return REMEMBER_ME_TTL_HOURS;
  const configured = Number(process.env.SESSION_TTL_HOURS ?? 24);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
}
