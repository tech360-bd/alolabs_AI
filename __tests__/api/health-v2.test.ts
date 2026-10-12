import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
}));

const mockCompanyCount = vi.fn();
const mockAgentCount = vi.fn();
const mockWorkflowCount = vi.fn();
const mockDepartmentCount = vi.fn();
const mockUsageLogCount = vi.fn();
const mockSkillCount = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    company: { count: (...args: unknown[]) => mockCompanyCount(...args) },
    agent: { count: (...args: unknown[]) => mockAgentCount(...args) },
    workflow: { count: (...args: unknown[]) => mockWorkflowCount(...args) },
    department: { count: (...args: unknown[]) => mockDepartmentCount(...args) },
    usageLog: { count: (...args: unknown[]) => mockUsageLogCount(...args) },
    skill: { count: (...args: unknown[]) => mockSkillCount(...args) },
  },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health — expanded v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyCount.mockResolvedValue(3);
    mockAgentCount.mockResolvedValue(12);
    mockWorkflowCount.mockResolvedValue(5);
    mockDepartmentCount.mockResolvedValue(4);
    mockUsageLogCount.mockResolvedValue(100);
    mockSkillCount.mockResolvedValue(20);
  });

  it('should return 200 status', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('should return expected system_name', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.system_name).toBe('ALO Labs Agent Hub');
  });

  it('should return status as healthy', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should include all count fields', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty('companies_count');
    expect(data).toHaveProperty('agents_count');
    expect(data).toHaveProperty('workflows_count');
    expect(data).toHaveProperty('departments_count');
    expect(data).toHaveProperty('skills_count');
    expect(data).toHaveProperty('usage_logs_count');
  });

  it('should return correct count values', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.companies_count).toBe(3);
    expect(data.agents_count).toBe(12);
    expect(data.workflows_count).toBe(5);
    expect(data.departments_count).toBe(4);
    expect(data.skills_count).toBe(20);
    expect(data.usage_logs_count).toBe(100);
  });

  it('should include a valid timestamp', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
  });

  it('should return 500 when database fails', async () => {
    mockCompanyCount.mockRejectedValue(new Error('DB connection failed'));
    const response = await GET();
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });

  it('should handle zero counts gracefully', async () => {
    mockCompanyCount.mockResolvedValue(0);
    mockAgentCount.mockResolvedValue(0);
    mockWorkflowCount.mockResolvedValue(0);
    mockDepartmentCount.mockResolvedValue(0);
    mockUsageLogCount.mockResolvedValue(0);
    mockSkillCount.mockResolvedValue(0);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should include feature flags', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.payment_guard_enabled).toBe(true);
    expect(data.protection_mode_enabled).toBe(true);
    expect(data.rag_enabled).toBe(true);
    expect(data.central_agent_hub_enabled).toBe(true);
  });

  // Database connectivity check
  it('should indicate database connectivity via successful response', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    // If counts are present, DB is connected
    expect(typeof data.companies_count).toBe('number');
  });

  it('should indicate database failure via 500', async () => {
    mockCompanyCount.mockRejectedValue(new Error('Connection refused'));
    const response = await GET();
    expect(response.status).toBe(500);
  });
});