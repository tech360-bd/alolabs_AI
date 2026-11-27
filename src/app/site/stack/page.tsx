import type { Metadata } from 'next';
import { StackPage } from '@/components/site/pages/stack';
import { serverStackReport } from '@/lib/ecosystem/adapters';

/**
 * /site/stack — the public stack register.
 *
 * Public on purpose: it is a statement about what this repository does and does
 * not implement, which is useful to buyers and to agents (via
 * `/api/ecosystem`) and contains no tenant data. It is rendered on the server so
 * the whole register is in the HTML — the client component only adds filtering.
 */
export const metadata: Metadata = {
  title: 'Stack register — ALO Labs AgentOS',
  description:
    'Every upstream system ALO Labs was asked to adopt — LiteLLM, Temporal, Activepieces, Directus, LibreChat, Open WebUI, vLLM, SignuDoc and more — with an honest verdict, the file that proves it, and the next step for each gap.',
  alternates: { canonical: 'https://www.alolabs.net/site/stack' },
  openGraph: {
    title: 'Stack register — what we implement, mirror and still owe',
    description:
      'A verdict per upstream link: implemented, in kind, reference, or a gap with a written next step — each backed by a file in this repository.',
    siteName: 'ALO Labs AgentOS',
    url: 'https://www.alolabs.net/site/stack',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
};

// The register is compiled from code, so it is stable until a deploy; a static
// render keeps the page fast without hiding a stale entry for long.
export default function Page() {
  return <StackPage report={serverStackReport()} />;
}
