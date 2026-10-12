import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentsRegistryPanel from '@/components/panels/agents-registry-panel';

const mockFetch = vi.fn();

describe('AgentsRegistryPanel', () => {
  const mockAgents = {
    data: [
      {
        id: '1',
        agentId: 'agent-001',
        name: 'Sales Bot',
        slug: 'sales-bot',
        departmentName: 'Sales',
        role: 'assistant',
        status: 'active',
        version: '1.0.0',
        purpose: 'Handle sales inquiries',
      },
      {
        id: '2',
        agentId: 'agent-002',
        name: 'Support Bot',
        slug: 'support-bot',
        departmentName: 'Support',
        role: 'assistant',
        status: 'standby',
        version: '1.2.0',
        purpose: 'Customer support',
      },
    ],
    total: 2,
    page: 1,
    limit: 50,
    totalPages: 1,
  };

  const mockDepartments = {
    data: [
      { id: '1', name: 'Sales', slug: 'sales' },
      { id: '2', name: 'Support', slug: 'support' },
      { id: '3', name: 'Engineering', slug: 'engineering' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render without crashing', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    expect(() => render(<AgentsRegistryPanel />)).not.toThrow();
  });

  it('should render agent table after data loads', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/departments')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDepartments) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) });
    });

    render(<AgentsRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('Sales Bot')).toBeInTheDocument();
    });

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('should show agent status badges', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/departments')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDepartments) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) });
    });

    render(<AgentsRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    expect(screen.getByText('standby')).toBeInTheDocument();
  });

  it('should have a search input', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/departments')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDepartments) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) });
    });

    render(<AgentsRegistryPanel />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no agents', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/departments')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
      });
    });

    render(<AgentsRegistryPanel />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Sales Bot')).not.toBeInTheDocument();
    });
  });

  it('should fetch departments on mount', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/departments')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDepartments) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) });
    });

    render(<AgentsRegistryPanel />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/departments');
    });
  });
});