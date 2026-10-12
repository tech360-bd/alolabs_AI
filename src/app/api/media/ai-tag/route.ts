import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'

/** Multimodal chat message parts for vision-capable models */
interface VlmTextPart {
  type: 'text'
  text: string
}

interface VlmImagePart {
  type: 'image_url'
  image_url: { url: string }
}

type VlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | (VlmTextPart | VlmImagePart)[]
}

// POST: Send image to AI for auto-tagging
export async function POST(request: NextRequest) {
  try {
    await requireAuth()

    const body = await request.json()
    const { fileId, url } = body as { fileId?: string; url?: string }

    if (!fileId && !url) {
      return NextResponse.json({ error: 'fileId or url is required' }, { status: 400 })
    }

    // Get the file record to find the URL
    let fileUrl = url || ''

    if (fileId && !fileUrl) {
      try {
        const record = await db.settings.findUnique({
          where: { key: `media:file:${fileId}` },
        })
        if (record) {
          const file = JSON.parse(record.value)
          fileUrl = file.url || ''
        }
      } catch {
        // skip
      }
    }

    if (!fileUrl) {
      return NextResponse.json({ error: 'Could not find file URL' }, { status: 404 })
    }

    // Use the VLM skill via SDK to analyze the image
    let tags: string[] = []

    try {
      // Dynamic import of the SDK (server-side only)
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()

      // Build the full URL if it's a relative path
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl}`

      // Use the vision-capable chat completions API with multimodal content.
      // Note: The SDK's ChatMessage type only supports string content,
      // but the runtime API accepts multimodal content arrays.
      const vlmPayload = {
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'Analyze this image and provide up to 8 relevant descriptive tags as a JSON array of lowercase strings. Only return the JSON array, nothing else. Tags should describe: subject matter, style, colors, mood, objects visible. Example: ["landscape", "nature", "mountains", "sunset", "orange", "peaceful"]' },
              { type: 'image_url' as const, image_url: { url: fullUrl } },
            ],
          },
        ],
      };
      const completion = await zai.chat.completions.create(
        vlmPayload as unknown as Parameters<typeof zai.chat.completions.create>[0]
      );

      const responseText = completion.choices?.[0]?.message?.content || ''

      // Try to extract a JSON array from the response
      const match = responseText.match(/\[[\s\S]*?\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          tags = parsed
            .filter((t) => typeof t === 'string')
            .map((t) => t.toLowerCase().trim())
            .filter((t) => t.length > 0 && t.length < 30)
            .slice(0, 8)
        }
      }
    } catch (aiError) {
      console.error('VLM AI tagging error:', aiError)
      // Fallback: generate tags from filename
      const nameFromFile = fileId ? fileId : 'untitled'
      tags = [nameFromFile.split('-').slice(0, 2).join(' '), 'untagged']
    }

    // Update the file record with new tags
    if (fileId) {
      try {
        const record = await db.settings.findUnique({
          where: { key: `media:file:${fileId}` },
        })
        if (record) {
          const file = JSON.parse(record.value)
          const existingTags = file.tags || []
          file.tags = [...new Set([...existingTags, ...tags])]
          file.updatedAt = new Date().toISOString()

          await db.settings.update({
            where: { key: `media:file:${fileId}` },
            data: { value: JSON.stringify(file) },
          })
        }
      } catch {
        // skip update error
      }
    }

    return NextResponse.json({
      data: {
        tags,
        fileId,
      },
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('AI tag error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}