import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the API route handler logic by importing and calling the GET function.
// Since these routes depend on `@/lib/db` (Prisma), we mock the DB.

// Mock NextResponse for the route handler
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
}));

// Mock the db module
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

// Import the route handler
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
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

  it('should return JSON with expected system_name', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.system_name).toBe('ALO Labs Agent Hub');
  });

  it('should return status as healthy', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should include count fields', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty('companies_count');
    expect(data).toHaveProperty('agents_count');
    expect(data).toHaveProperty('workflows_count');
    expect(data).toHaveProperty('departments_count');
    expect(data).toHaveProperty('skills_count');
    expect(data).toHaveProperty('usage_logs_count');
  });

  it('should include a timestamp', async () => {
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
});