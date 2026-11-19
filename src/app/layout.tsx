import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0066CC',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://www.alolabs.net'),
  title: "ALO Labs — Global AI & Software Technology Company",
  description: "ALO Labs designs and builds software, AI-powered solutions and connected digital platforms that help businesses work smarter, scale confidently and create better experiences.",
  keywords: [
    'ALO Labs', 'AI services', 'business process automation', 'CRM automation',
    'marketing automation', 'AI communications', 'custom software', 'client portal',
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
    title: 'ALO Labs — Global AI & Software Technology Company',
    description: 'Software, AI-powered solutions and connected digital platforms — designed and built for businesses that take technology seriously.',
    siteName: 'ALO Labs',
    images: ['/brand/alo-mark.svg'],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "ALO Labs",
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ALO Labs" />
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