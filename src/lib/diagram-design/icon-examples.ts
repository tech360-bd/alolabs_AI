/**
 * Icon showcase figure for the design system page. Icons are optional decoration on
 * flowchart nodes; the name carries meaning in the sublabel, so the figure reads without them.
 */

import type { DiagramSpec } from './spec'

export const ICON_SHOWCASE: DiagramSpec = {
  slug: 'flowchart-icon-showcase',
  kind: 'flowchart',
  eyebrow: 'ICONS',
  title: 'Request path with icons',
  desc: 'A chat request reaches the gateway, is checked against the key store, then written to the database. Icons label the component type; the sublabels carry the meaning.',
  direction: 'horizontal',
  nodes: [
    { id: 'client', name: 'Client', sublabel: 'browser tab', tag: 'INPUT', kind: 'input', icon: 'user' },
    { id: 'gateway', name: 'API gateway', sublabel: 'POST /v1/chat', tag: 'SERVICE', kind: 'backend', icon: 'server' },
    { id: 'keys', name: 'Key store', sublabel: 'scoped tokens', tag: 'AUTH', kind: 'security', icon: 'key' },
    { id: 'db', name: 'Postgres', sublabel: 'threads table', tag: 'DATA', kind: 'store', icon: 'postgres' },
    { id: 'cdn', name: 'Object storage', sublabel: 'attachments', tag: 'STORE', kind: 'external', icon: 'cloud' },
  ],
  links: [
    { from: 'client', to: 'gateway' },
    { from: 'gateway', to: 'keys', label: 'CHECK' },
    { from: 'gateway', to: 'db', label: 'WRITE', role: 'accent' },
    { from: 'gateway', to: 'cdn', label: 'UPLOAD', dashed: true },
  ],
  callouts: [{ text: 'one gateway, three dependencies', at: 'start', target: 'gateway' }],
  footer: 'Icons · optional, decorative',
}
