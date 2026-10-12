import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAgentFactory } from '@/lib/multi-agent-orchestrator';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();

    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Agent ID is required',
        },
      }, { status: 400 });
    }

    const factory = getAgentFactory();
    const agent = await factory.getAgent(id);

    return NextResponse.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
      }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      }, { status: 404 });
    }
    console.error('[/api/enterprise/agent-factory/[id]]', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();

    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Agent ID is required',
        },
      }, { status: 400 });
    }

    const factory = getAgentFactory();
    await factory.archiveAgent(id);

    return NextResponse.json({
      success: true,
      data: { message: 'Agent archived successfully' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
      }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      }, { status: 404 });
    }
    console.error('[/api/enterprise/agent-factory/[id] DELETE]', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    }, { status: 500 });
  }
}
