import type { Metadata } from 'next'
import { ProjectsPage } from '@/components/site/pages/projects'

export const metadata: Metadata = {
  title: 'Projects — ALO Labs',
  description:
    'What ALO Labs is building, honestly labelled: live products, work in development and bespoke client systems — no invented clients, logos or metrics.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/projects',
  },
  openGraph: {
    title: 'Projects — ALO Labs',
    description:
      'What ALO Labs is building, honestly labelled — live, in development, or delivered through project engagement.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/projects',
    images: ['/studio/icon-512.png'],
  },
}

export default function Page() {
  return <ProjectsPage />
}
