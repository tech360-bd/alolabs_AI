import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://www.alolabs.net'),
  title: "ALO Labs AgentOS — AI Agent Operating System",
  description: "A secure, multi-tenant AI agent operating system for managing, orchestrating, and monitoring autonomous AI agents at scale.",
  keywords: [
    'AI agent', 'agent operating system', 'multi-tenant AI', 'AI orchestration',
    'autonomous agents', 'AI CRM', 'agent management', 'ALO Labs', 'AgentOS',
    'AI workflows', 'real-time analytics', 'agent monitoring',
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/brand/alo-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/icon-192.svg' }],
    shortcut: ['/brand/alo-mark.svg'],
  },
  openGraph: {
    title: 'ALO Labs AgentOS — AI Agent Operating System',
    description: 'A secure, multi-tenant AI agent operating system — 1 Command Center, 1020 AI Agents, 100+ Departments.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "ALO AgentOS",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#003ABC" />
        <link rel="icon" href="/brand/alo-icon.svg" type="image/svg+xml" />
        <link rel="mask-icon" href="/brand/alo-mark.svg" color="#FF6A00" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ALO AgentOS" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        {/*
          Editorial typography stack: Instrument Serif for titles and callouts,
          Geist for names, Geist Mono for technical values. Loaded by link rather
          than at build time so deploys never depend on a font fetch.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          The suppression below is a false positive: no-page-custom-font targets
          a Pages Router `pages/_document.js`, where a font <link> applies to a
          single page. This is the App Router root layout, so the link applies
          to every route — the correct place for it. Switching to `next/font`
          would reintroduce the build-time font fetch the comment above avoids,
          which breaks air-gapped builds (see scripts/dev-generate-client.sh).
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap"
        />
      </head>
      <body
        className="font-sans antialiased bg-[#F8FAFC] text-[#1E293B]"
      >
        <div className="min-h-screen flex flex-col">
          <ServiceWorkerRegistration />
          <script dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
          }} />
          {children}
          <Toaster />
        </div>
      </body>
    </html>
  );
}