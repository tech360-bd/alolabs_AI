interface Sample { name: string; labels: string; value: number; createdAt: Date }
const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '\\n');

/** Keep the newest point for each series. Explicit timestamps use milliseconds. */
export function gaugeLines(rows: Sample[]): string[] {
  const series = new Map<string, Map<string, Sample>>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const name = row.name.replace(/[^a-zA-Z0-9_:]/g, '_').replace(/^(?=\d)/, '_');
    if (!name) continue;
    let labels = '';
    try {
      const obj = JSON.parse(row.labels);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const pairs = Object.keys(obj).sort().filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !k.startsWith('__')).map(k => `${k}="${quote(String(obj[k]))}"`);
        if (pairs.length) labels = `{${pairs.join(',')}}`;
      }
    } catch { /* Legacy samples may have no labels. */ }
    const points = series.get(name) ?? new Map<string, Sample>();
    const previous = points.get(labels);
    if (!previous || row.createdAt > previous.createdAt) points.set(labels, row);
    series.set(name, points);
  }
  const lines: string[] = [];
  for (const [name, points] of series) {
    lines.push(`# TYPE ${name} gauge`);
    for (const [labels, point] of points) lines.push(`${name}${labels} ${point.value} ${point.createdAt.getTime()}`);
  }
  return lines;
}
