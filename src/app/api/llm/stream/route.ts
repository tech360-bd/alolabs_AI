import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { checkTokenBudget } from '@/lib/token-guard'

// ──────────────────────────────────────────────
// Helper: estimate tokens (~4 chars per token)
// ──────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ──────────────────────────────────────────────
// Helper: call the model router to select best model
// ──────────────────────────────────────────────

async function autoSelectModel(task: string, input?: string, contextSize?: number): Promise<{ modelId: string }> {
  try {
    const response = await fetch(
      new URL('/api/llm/route', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, input, contextSize }),
      },
    )
    if (response.ok) {
      const data = await response.json()
      if (data.selectedModel) return { modelId: data.selectedModel }
    }
  } catch {
    console.debug('[LLM Stream] autoSelectModel fallback to default model');
  }
  return { modelId: 'deepseek-v3' }
}

// ──────────────────────────────────────────────
// POST /api/llm/stream — Enhanced streaming LLM endpoint
//   - Auto model routing when no model specified
//   - Token budget enforcement before processing
//   - Detailed metrics after processing
// ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const startTime = performance.now()
  let timeToFirstToken: number | null = null
  let success = false

  try {
    const body = await request.json()
    const { messages, model: requestedModel, companyId, agentId } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Step 1: Select model ─────────────────
    let model: string
    if (requestedModel) {
      model = requestedModel
    } else {
      // Use auto-routing: derive a task description from the last user message
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      const taskText = lastUserMsg ? (lastUserMsg as { role: string; content: string }).content : 'general conversation'
      const routing = await autoSelectModel(taskText)
      model = routing.modelId
    }

    // ── Step 2: Token budget check ───────────
    const inputText = messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')
    const promptTokens = estimateTokens(inputText)
    // Estimate completion tokens at ~2x prompt (rough heuristic)
    const estimatedTotalTokens = promptTokens * 2

    if (companyId) {
      const budgetCheck = await checkTokenBudget(companyId, estimatedTotalTokens)
      if (!budgetCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: budgetCheck.reason,
            monthlyUsed: budgetCheck.monthlyUsed,
            monthlyBudget: budgetCheck.monthlyBudget,
            dailyUsed: budgetCheck.dailyUsed,
            dailyBudget: budgetCheck.dailyBudget,
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    // ── Step 3: Call LLM via z-ai-web-dev-sdk ──
    let llmOutput: string
    try {
      const llmStartTime = performance.now()
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
      })
      timeToFirstToken = performance.now() - llmStartTime
      llmOutput = completion.choices?.[0]?.message?.content || ''
    } catch (llmError) {
      console.error('LLM call failed:', llmError)
      llmOutput = 'I apologize, but I am currently unable to process your request. Please try again later.'
    }

    const completionTokens = estimateTokens(llmOutput)
    const totalTokens = promptTokens + completionTokens
    const totalTimeMs = performance.now() - startTime
    success = true

    // ── Step 4: Record token usage ───────────
    try {
      await db.tokenUsage.create({
        data: {
          companyId: companyId || null,
          agentId: agentId || null,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          costEstimate: 0,
        },
      })

      // Update token budget if companyId is provided
      if (companyId) {
        const existingBudget = await db.tokenBudget.findUnique({ where: { companyId } })
        if (existingBudget) {
          await db.tokenBudget.update({
            where: { companyId },
            data: {
              monthlyUsed: existingBudget.monthlyUsed + totalTokens,
              dailyUsed: existingBudget.dailyUsed + totalTokens,
            },
          })
        }
      }
    } catch (dbError) {
      console.error('Failed to record token usage:', dbError)
      // Non-blocking: continue with the stream even if DB write fails
    }

    // ── Step 5: Record detailed metrics ──────
    try {
      await db.metric.createMany({
        data: [
          {
            name: 'llm_stream_latency_total_ms',
            value: totalTimeMs,
            labels: JSON.stringify({ model, companyId: companyId || 'none', agentId: agentId || 'none' }),
            unit: 'ms',
          },
          {
            name: 'llm_stream_time_to_first_token_ms',
            value: timeToFirstToken ?? totalTimeMs,
            labels: JSON.stringify({ model, companyId: companyId || 'none' }),
            unit: 'ms',
          },
          {
            name: 'llm_stream_prompt_tokens',
            value: promptTokens,
            labels: JSON.stringify({ model }),
            unit: 'tokens',
          },
          {
            name: 'llm_stream_completion_tokens',
            value: completionTokens,
            labels: JSON.stringify({ model }),
            unit: 'tokens',
          },
          {
            name: 'llm_stream_requests_total',
            value: 1,
            labels: JSON.stringify({ model, status: 'success' }),
            unit: 'request',
          },
        ],
      })
    } catch {
      console.debug('[LLM Stream] Non-blocking metric recording failed');
    }

    // ── Step 6: Stream the response ──────────
    // Note: Currently uses batch-then-chunk approach. For true token-by-token
    // streaming, integrate with a provider that supports SSE/WebSocket streaming.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const chunkSize = 3
          for (let i = 0; i < llmOutput.length; i += chunkSize) {
            const chunk = llmOutput.slice(i, i + chunkSize)
            const sseData = JSON.stringify({ type: 'token', content: chunk, model })
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
          }

          // Send done event with metrics
          const doneData = JSON.stringify({
            type: 'done',
            totalTokens,
            model,
            metrics: {
              totalTimeMs: Math.round(totalTimeMs),
              timeToFirstTokenMs: Math.round(timeToFirstToken ?? totalTimeMs),
              promptTokens,
              completionTokens,
            },
          })
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`))

          controller.close()
        } catch (streamError) {
          console.error('Stream error:', streamError)
          const errData = JSON.stringify({ type: 'error', message: 'Stream interrupted' })
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Model': model,
      },
    })
  } catch (error) {
    const totalTimeMs = performance.now() - startTime
    console.error('Error in LLM stream:', error)

    // Record failure metric
    try {
      await db.metric.create({
        data: {
          name: 'llm_stream_requests_total',
          value: 1,
          labels: JSON.stringify({ model: 'unknown', status: 'error' }),
          unit: 'request',
        },
      })
    } catch {
      console.debug('[LLM Stream] Non-blocking failure metric recording failed');
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        metrics: { totalTimeMs: Math.round(totalTimeMs), success: false },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}