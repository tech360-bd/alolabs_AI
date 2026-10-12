import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/db
vi.mock('@/lib/db', () => ({
  db: {
    company: { count: vi.fn().mockResolvedValue(5) },
    agent: { count: vi.fn().mockResolvedValue(12) },
    workflow: { count: vi.fn().mockResolvedValue(3) },
    department: { count: vi.fn().mockResolvedValue(8) },
    usageLog: { count: vi.fn().mockResolvedValue(100) },
    skill: { count: vi.fn().mockResolvedValue(20) },
  },
}));

// Mock next/server
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body: data,
      headers: new Headers(),
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('should return 200 status', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('should return JSON with system_name', async () => {
    const response = await GET();
    const body = await (response as any).json();
    expect(body.system_name).toBe('ALO Labs Agent Hub');
  });

  it('should return valid JSON structure with all required fields', async () => {
    const response = await GET();
    const body = await (response as any).json();

    // Top-level string fields
    expect(body.system_name).toBeDefined();
    expect(body.subtitle).toBeDefined();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');

    // Count fields (numbers)
    expect(typeof body.companies_count).toBe('number');
    expect(typeof body.agents_count).toBe('number');
    expect(typeof body.skills_count).toBe('number');
    expect(typeof body.workflows_count).toBe('number');
    expect(typeof body.departments_count).toBe('number');
    expect(typeof body.usage_logs_count).toBe('number');

    // Boolean feature flags
    expect(typeof body.payment_guard_enabled).toBe('boolean');
    expect(typeof body.protection_mode_enabled).toBe('boolean');
    expect(typeof body.self_improvement_enabled).toBe('boolean');
    expect(typeof body.productivity_mode_enabled).toBe('boolean');
    expect(typeof body.rag_enabled).toBe('boolean');
    expect(typeof body.paid_ai_api_allowed).toBe('boolean');
    expect(typeof body.central_agent_hub_enabled).toBe('boolean');
    expect(typeof body.multi_company_routing_enabled).toBe('boolean');
    expect(typeof body.company_usage_tracking_enabled).toBe('boolean');
    expect(typeof body.selected_agent_runtime_enabled).toBe('boolean');
    expect(typeof body.web_crm_auto_connected).toBe('boolean');
    expect(typeof body.all_sister_companies_connected).toBe('boolean');
  });

  it('should return correct count values from db mocks', async () => {
    const response = await GET();
    const body = await (response as any).json();
    expect(body.companies_count).toBe(5);
    expect(body.agents_count).toBe(12);
    expect(body.workflows_count).toBe(3);
    expect(body.departments_count).toBe(8);
    expect(body.skills_count).toBe(20);
    expect(body.usage_logs_count).toBe(100);
  });

  it('should include run counts set to 0', async () => {
    const response = await GET();
    const body = await (response as any).json();
    expect(body.agent_runs_count).toBe(0);
    expect(body.skill_runs_count).toBe(0);
    expect(body.workflow_runs_count).toBe(0);
  });

  it('should have a valid ISO timestamp', async () => {
    const response = await GET();
    const body = await (response as any).json();
    const parsed = Date.parse(body.timestamp);
    expect(parsed).not.toBeNaN();
  });

  it('should return 500 when db calls fail', async () => {
    // Use vi.doMock + dynamic re-import to override the top-level mock.
    // However, the route module may be cached, so we use a separate test approach:
    // Directly test the catch branch by importing the route handler via vi.importActual
    // and manipulating the mock's resolved value at runtime.

    // Instead: we temporarily make the mock reject. Since the module is already imported,
    // we directly mutate the mock functions.
    const { db: dbMock } = await import('@/lib/db');
    const anyDb = dbMock as any;
    anyDb.company.count.mockRejectedValueOnce(new Error('db down'));

    // The route catches the first error and returns 500
    const errorResponse = await GET();
    expect(errorResponse.status).toBe(500);
    const errorBody = await (errorResponse as any).json();
    expect(errorBody.error).toBeDefined();
  });
});
