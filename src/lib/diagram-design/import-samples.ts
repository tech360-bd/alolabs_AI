/** Small, self-contained sources for the import panel. Each one exercises a different grammar. */

import type { ImportFormat } from './importers'

export const IMPORT_SAMPLES: Record<ImportFormat, { label: string; source: string }> = {
  mermaid: {
    label: 'Mermaid flowchart',
    source: `flowchart TD
  A[Install requested] --> B{Risk level?}
  B -- low --> C[(Publish to catalog)]
  B -- high --> D[Human review]
  D --> E([Approved])
  D --> F[Return notes]
  E --> C
  classDef focal fill:#fff
  click A "https://example.com" "ignored"`,
  },
  drawio: {
    label: 'draw.io XML',
    source: `<mxfile><diagram name="Page-1"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="Request" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="Policy" style="rhombus;" vertex="1" parent="1"><mxGeometry x="240" y="30" width="120" height="80" as="geometry"/></mxCell>
<mxCell id="c" value="Audit log" style="shape=cylinder;" vertex="1" parent="1"><mxGeometry x="440" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" value="checked" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e2" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="b" target="c" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`,
  },
  excalidraw: {
    label: 'Excalidraw JSON',
    source: JSON.stringify(
      {
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'req', type: 'rectangle', isDeleted: false, boundElements: [{ id: 'req-t', type: 'text' }, { id: 'arr1', type: 'arrow' }] },
          { id: 'req-t', type: 'text', text: 'Request', containerId: 'req' },
          { id: 'dec', type: 'diamond', isDeleted: false, boundElements: [{ id: 'dec-t', type: 'text' }, { id: 'arr1', type: 'arrow' }, { id: 'arr2', type: 'arrow' }] },
          { id: 'dec-t', type: 'text', text: 'Valid?', containerId: 'dec' },
          { id: 'ok', type: 'ellipse', isDeleted: false, boundElements: [{ id: 'ok-t', type: 'text' }, { id: 'arr2', type: 'arrow' }] },
          { id: 'ok-t', type: 'text', text: 'Accepted', containerId: 'ok' },
          { id: 'arr1', type: 'arrow', startBinding: { elementId: 'req' }, endBinding: { elementId: 'dec' } },
          { id: 'arr2', type: 'arrow', startBinding: { elementId: 'dec' }, endBinding: { elementId: 'ok' } },
        ],
      },
      null,
      2,
    ),
  },
}
