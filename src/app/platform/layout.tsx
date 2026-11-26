import type { Metadata } from 'next';
import { PlatformShell } from '@/components/platform/platform-shell';

export const metadata: Metadata = {
  title: 'ALO Open AI Platform',
  description: 'Multi-tenant AI workspace: chat, models, API keys and usage on local-first infrastructure.',
};

/**
 * The platform is a product surface, not an admin console: it renders its own
 * shell and does not inherit the dashboard chrome. Authorisation happens in
 * `proxy.ts` (session required) and again in every API route; this layout is
 * presentation only.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
