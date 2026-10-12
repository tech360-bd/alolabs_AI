import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// In-memory conversation history per session
const conversations = new Map<string, Array<{ role: string; content: string }>>();
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

const SYSTEM_PROMPT = `You are the collective voice of AI agents in the ALO Labs Agent Hub. You respond as if multiple specialized AI agents are working together.

Rules:
- You are a Super Admin's AI workforce commander
- When given a command, respond as if agents have already executed it
- Include specific agent names in your responses
- Mention departments the agents belong to
- Be concise but show real work being done
- Format responses with clear sections
- Use bullet points for lists
- Always end with a status summary
- Respond in a professional but energetic tone
- Never say "as an AI" or "I'm an AI" - you ARE the agents`;

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { message, sessionId = 'default', targetDepartment, targetCompany, broadcast } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // Get or create conversation history
    let history = conversations.get(sessionId) || [
      { role: 'assistant', content: SYSTEM_PROMPT },
    ];

    // Build context prefix for targeted messages
    let contextPrefix = '';
    if (targetCompany) {
      contextPrefix += `[Command directed to company: ${targetCompany}] `;
    }
    if (targetDepartment) {
      contextPrefix += `[Targeting department: ${targetDepartment}] `;
    }
    if (broadcast) {
      contextPrefix += '[BROADCAST to all agents] ';
    }

    // Add user message
    history.push({
      role: 'user',
      content: contextPrefix + message,
    });

    // Trim history to last 20 messages (keep system prompt)
    if (history.length > 21) {
      history = [history[0], ...history.slice(-20)];
    }

    // Call LLM
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: history as Array<{ role: 'user' | 'assistant'; content: string }>,
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Agents are processing...';

    // Add AI response to history
    history.push({
      role: 'assistant',
      content: aiResponse,
    });

    // Save history
    conversations.set(sessionId, history);

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'super_chat_message',
        resource: 'super_admin',
        details: JSON.stringify({
          message: message.substring(0, 200),
          targetCompany: targetCompany || null,
          targetDepartment: targetDepartment || null,
          broadcast: !!broadcast,
          responseLength: aiResponse.length,
        }),
      },
    });

    // Create command record for tracking
    const command = await db.command.create({
      data: {
        rawCommand: `[CHAT] ${message.substring(0, 200)}`,
        parsedIntent: `Super Admin chat command`,
        detectedDept: targetDepartment || null,
        status: 'completed',
      },
    });

    // Fetch real agent data from the database for the response
    const respondingAgents = await getRespondingAgents(message, targetDepartment);

    return NextResponse.json({
      success: true,
      response: aiResponse,
      commandId: command.id,
      agents: respondingAgents,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Super Chat POST error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || 'default';
    conversations.delete(sessionId);
    return NextResponse.json({ success: true, message: 'Conversation cleared' });
  } catch {
    return NextResponse.json({ error: 'Failed to clear' }, { status: 500 });
  }
}

/**
 * Fetch real agents from the database and return a subset as "responding agents".
 * This provides real agent IDs, names, and department data instead of hardcoded profiles.
 */
async function getRespondingAgents(
  _message: string,
  targetDepartment?: string | null
): Promise<Array<{ agentId: string; name: string; department: string; status: string; message: string }>> {
  try {
    const where: Record<string, unknown> = { status: 'active' };
    if (targetDepartment) {
      where.departmentName = targetDepartment;
    }

    const agents = await db.agent.findMany({
      where,
      select: {
        id: true,
        name: true,
        departmentName: true,
        type: true,
      },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });

    if (agents.length === 0) {
      return [{
        agentId: 'SYSTEM',
        name: 'System',
        department: 'Core',
        status: 'completed',
        message: 'Command processed. No active agents found in the target scope.',
      }];
    }

    return agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name || agent.type || 'Unnamed Agent',
      department: agent.departmentName || 'General',
      status: 'completed',
      message: `Task acknowledged by ${agent.name || agent.type}.`,
    }));
  } catch {
    return [];
  }
}
