'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ImageIcon, Video, Music, Sparkles, Settings, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediaStudioPanel() {
  const handleOpenSettings = () => {
    // The shell navigation is managed by the parent; emit an event as a fallback
    toast.info('Navigate to Settings → Integrations to configure a media provider.')
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#003ABC] to-[#1a56db] p-5 text-white">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-xl font-bold">Media Studio</h2>
          </div>
          <p className="text-sm text-white/80">
            AI-powered image, video, and audio generation. Create stunning media assets with text prompts.
          </p>
        </div>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-4 bottom-0 h-20 w-20 rounded-full bg-white/5 blur-xl" />
      </div>

      {/* ─── Empty State ─────────────────────────────────────────────────── */}
      <Card className="bg-white border-slate-200">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100">
              <ImageIcon className="h-6 w-6 text-slate-400" />
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100">
              <Video className="h-6 w-6 text-slate-400" />
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100">
              <Music className="h-6 w-6 text-slate-400" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-[#1E293B] mb-2">Media Studio</h3>
          <p className="text-sm text-slate-500 max-w-md mb-6">
            Configure a media provider (image generation, video processing) in{' '}
            <span className="inline-flex items-center gap-1 font-medium text-[#003ABC]">
              <Settings className="h-3.5 w-3.5" />
              Settings &gt; Integrations
            </span>{' '}
            to enable this panel. Supported providers include DALL-E, Stable Diffusion, and other image generation APIs.
          </p>
          <Button
            variant="default"
            onClick={handleOpenSettings}
            className="gap-2 bg-[#003ABC] hover:bg-[#002B8C]"
          >
            Open Settings
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
