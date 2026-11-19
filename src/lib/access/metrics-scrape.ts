/** This credential grants exactly one read-only operation, never an app session. */
export function isMetricsScrape(path: string, method: string, authorization: string | null): boolean {
  const secret = process.env.METRICS_SCRAPE_TOKEN;
  if (path !== '/api/metrics/prometheus' || method !== 'GET' || !secret || secret.length < 32 || !authorization?.startsWith('Bearer ')) return false;
  const token = authorization.slice(7);
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** Global operational counts require the same role on HTTP and sockets. */
export function mayReadOperationalMetrics(role: string): boolean {
  return ['admin', 'super_admin', 'platform_super_admin', 'infrastructure_admin'].includes(role);
}
