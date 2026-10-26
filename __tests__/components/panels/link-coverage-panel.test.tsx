import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkCoveragePanel from '@/components/panels/link-coverage-panel';
import type { EntryCheck } from '@/lib/link-coverage/types';

const mockFetch = vi.fn();

function entry(overrides: Partial<EntryCheck> = {}): EntryCheck {
  return {
    id: 'openrouter',
    url: 'https://openrouter.ai',
    kind: 'site',
    category: 'AI & models',
    verdict: 'implemented',
    claim: 'An OpenRouter adapter exists in the router and is registered for fallback.',
    verified: 1,
    missing: [],
    evidence: [
      {
        label: 'OpenRouter adapter',
        path: 'src/lib/ai-router/openrouter-provider.ts',
        kind: 'library',
        exists: true,
        isDirectory: false,
        bytes: 4096,
        lines: 128,
        sha256Prefix: 'abc123def456',
        status: 'verified',
      },
    ],
    ...overrides,
  };
}

const payload = {
  generatedAt: '2026-10-26T06:00:00.000Z',
  mode: 'live' as const,
  root: '/repo',
  cached: false,
  registrySize: 45,
  filtered: 2,
  inventory: { srcFiles: 929, docsFiles: 50 },
  warnings: [],
  summary: {
    links: 45,
    repositories: 28,
    sites: 17,
    implemented: 1,
    inKind: 20,
    reference: 3,
    gap: 11,
    notApplicable: 10,
    evidencePaths: 162,
    evidenceVerified: 162,
    missingPaths: 0,
    unverifiablePaths: 0,
    entriesFullyVerified: 45,
  },
  categories: [
    { name: 'AI & models', links: 5, gaps: 0 },
    { name: 'Business operations', links: 5, gaps: 2 },
  ],
  entries: [
    entry(),
    entry({
      id: 'enerpize',
      url: 'https://www.enerpize.com',
      verdict: 'gap',
      category: 'Business operations',
      claim: 'Only the finance edge of the ERP surface exists here.',
      gap: 'Ledger, inventory and payroll models do not exist in the schema.',
      verified: 1,
      missing: ['src/app/api/billing/payroll/route.ts'],
      evidence: [
        {
          label: 'Invoices route',
          path: 'src/app/api/billing/invoices/route.ts',
          kind: 'route',
          exists: true,
          isDirectory: false,
          bytes: 2048,
          lines: 60,
          sha256Prefix: '111222333444',
          status: 'verified',
        },
        {
          label: 'Payroll route (claimed)',
          path: 'src/app/api/billing/payroll/route.ts',
          kind: 'route',
          exists: false,
          isDirectory: false,
          bytes: 0,
          lines: 0,
          sha256Prefix: null,
          status: 'missing',
          error: 'path not found in working tree',
        },
      ],
    }),
  ],
};

describe('LinkCoveragePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('renders the verified totals from the API', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });

    render(<LinkCoveragePanel />);

    await waitFor(() => expect(screen.getByText('Link coverage')).toBeInTheDocument());
    expect(screen.getByText('Working tree verified')).toBeInTheDocument();
    expect(screen.getByText('https://openrouter.ai')).toBeInTheDocument();
    expect(screen.getByText('https://www.enerpize.com')).toBeInTheDocument();
    // Summary card values
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText(/Evidence files on disk: 162 \/ 162/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/super-admin/link-coverage',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('expands a row to show the evidence path, size and hash', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    const user = userEvent.setup();

    render(<LinkCoveragePanel />);
    await waitFor(() => expect(screen.getByText('https://openrouter.ai')).toBeInTheDocument());

    await user.click(screen.getByText('https://openrouter.ai'));

    expect(await screen.findByText('src/lib/ai-router/openrouter-provider.ts')).toBeInTheDocument();
    expect(screen.getByText('sha256:abc123def456')).toBeInTheDocument();
    expect(screen.getByText('128 lines')).toBeInTheDocument();
  });

  it('shows the named next step and the missing file for a gap row', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    const user = userEvent.setup();

    render(<LinkCoveragePanel />);
    await waitFor(() => expect(screen.getByText('https://www.enerpize.com')).toBeInTheDocument());

    await user.click(screen.getByText('https://www.enerpize.com'));

    expect(await screen.findByText(/Ledger, inventory and payroll models do not exist/)).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
    expect(screen.getByText('path not found in working tree')).toBeInTheDocument();
  });

  it('filters rows by the search box', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    const user = userEvent.setup();

    render(<LinkCoveragePanel />);
    await waitFor(() => expect(screen.getByText('https://openrouter.ai')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search link coverage'), 'enerpize');

    expect(await screen.findByText('https://www.enerpize.com')).toBeInTheDocument();
    expect(screen.queryByText('https://openrouter.ai')).not.toBeInTheDocument();
  });

  it('keeps only drifted rows when "Missing only" is on', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    const user = userEvent.setup();

    render(<LinkCoveragePanel />);
    await waitFor(() => expect(screen.getByText('https://openrouter.ai')).toBeInTheDocument());

    await user.click(screen.getByText('Missing only'));

    expect(await screen.findByText('https://www.enerpize.com')).toBeInTheDocument();
    expect(screen.queryByText('https://openrouter.ai')).not.toBeInTheDocument();
  });

  it('re-checks on demand with refresh=1', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    const user = userEvent.setup();

    render(<LinkCoveragePanel />);
    await waitFor(() => expect(screen.getByText('https://openrouter.ai')).toBeInTheDocument());

    await user.click(screen.getByText('Re-check all files'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/super-admin/link-coverage?refresh=1',
        expect.objectContaining({ headers: { Accept: 'application/json' } }),
      ),
    );
  });

  it('explains a 403 instead of showing an empty table', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) });

    render(<LinkCoveragePanel />);

    expect(await screen.findByText('Could not run the check')).toBeInTheDocument();
    expect(screen.getByText(/Super admin access is required/)).toBeInTheDocument();
  });

  it('warns when the server could only read the registry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...payload,
        mode: 'baseline',
        root: null,
        inventory: null,
        warnings: ['The working tree is not readable from this runtime.'],
        summary: { ...payload.summary, evidenceVerified: 0, unverifiablePaths: 162, entriesFullyVerified: 0 },
      }),
    });

    render(<LinkCoveragePanel />);

    expect(await screen.findByText('Registry only (tree not readable)')).toBeInTheDocument();
    expect(screen.getByText(/The working tree is not readable/)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
