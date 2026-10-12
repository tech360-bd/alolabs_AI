import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');
    const body = await request.json();
    const { action, activate } = body;

    const validActions = [
      'stop_all_communication', 'stop_gpu_jobs', 'disable_paid_services',
      'read_only_mode', 'revoke_sessions', 'stop_queues', 'block_api_keys',
      'stop_all',
    ];

    if (!action || !validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action === 'stop_all') {
      const keys = [
        'emergency:stop_all_communication', 'emergency:stop_gpu_jobs', 'emergency:disable_paid_services',
        'emergency:read_only_mode', 'emergency:revoke_sessions', 'emergency:stop_queues', 'emergency:block_api_keys',
      ];
      for (const k of keys) {
        await db.settings.upsert({
          where: { key: k },
          update: { value: JSON.stringify({ active: true, activatedAt: new Date().toISOString(), activatedBy: user.name }) },
          create: { key: k, value: JSON.stringify({ active: true, activatedAt: new Date().toISOString(), activatedBy: user.name }), type: 'json' },
        });
      }
      // Log
      await db.settings.create({
        data: {
          key: `emergency_log:${Date.now()}`,
          value: JSON.stringify({ action: 'EMERGENCY STOP ALL', activated: true, by: user.name, at: new Date().toISOString() }),
          type: 'json',
        },
      });
      return NextResponse.json({ success: true, message: 'All emergency stops activated' });
    }

    const key = `emergency:${action}`;
    const value = JSON.stringify({
      active: !!activate,
      activatedAt: activate ? new Date().toISOString() : null,
      activatedBy: activate ? user.name : null,
    });

    await db.settings.upsert({
      where: { key },
      update: { value },
      create: { key, value, type: 'json' },
    });

    await db.settings.create({
      data: {
        key: `emergency_log:${Date.now()}`,
        value: JSON.stringify({ action, activated: !!activate, by: user.name, at: new Date().toISOString() }),
        type: 'json',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: activate ? 'emergency_activate' : 'emergency_deactivate',
        resource: 'emergency',
        details: JSON.stringify({ action }),
      },
    });

    return NextResponse.json({ success: true, action, active: !!activate });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Emergency action POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}