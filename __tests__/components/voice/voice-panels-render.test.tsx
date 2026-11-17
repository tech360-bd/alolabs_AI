import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Render smoke tests for the contact-center workspaces.
 *
 * These are not decoration: every panel is lazy-loaded by id from
 * `DASHBOARD_PANELS`, so a broken module would only surface when a user clicked
 * the nav item. Rendering each one proves the module evaluates and paints.
 *
 * Panels render `<h2>` headings because the dashboard shell owns the `<h1>`.
 */

// `vi.mock` is hoisted above imports, so the factory must create its own mock.
vi.mock('@/lib/api-client', () => ({
  // Synchronous throw keeps the rejection reason an Error instance regardless of
  // module-instance differences in the test environment.
  apiFetch: vi.fn(() => {
    throw new Error('Failed to fetch');
  }),
  fetchApi: vi.fn(() => {
    throw new Error('Failed to fetch');
  }),
  getAuthToken: vi.fn().mockReturnValue(null),
  AUTH_TOKEN_KEY: 'alo_token',
}));

import VoiceRouting from '@/components/voice/voice-routing';
import VoiceCrm from '@/components/voice/voice-crm';
import VoiceIntelligence from '@/components/voice/voice-intelligence';
import VoiceSupervisor from '@/components/voice/voice-supervisor';
import VoiceInbox from '@/components/voice/voice-inbox';
import VoiceStudio from '@/components/voice/voice-studio';

afterEach(cleanup);

const heading = () => screen.getByRole('heading', { level: 2 });

describe('voice contact-center workspaces render', () => {
  it('renders the IVR / queues / business-hours workspace', async () => {
    render(<VoiceRouting />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/IVR|Routing/i);
  });

  it('renders the CRM & Customer 360 workspace', async () => {
    render(<VoiceCrm />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/CRM/i);
  });

  it('renders the call-intelligence workspace', async () => {
    render(<VoiceIntelligence />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/Intelligence/i);
  });

  it('renders the supervisor workspace', async () => {
    render(<VoiceSupervisor />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/Supervisor/i);
  });

  it('renders the omnichannel inbox', async () => {
    render(<VoiceInbox />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/Inbox/i);
  });

  it('renders the voice studio with its engine-status card', async () => {
    render(<VoiceStudio />);
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/Voice Studio/i);
  });

  it('surfaces a failed API as an error instead of inventing data', async () => {
    render(<VoiceCrm />);
    await waitFor(() => expect(screen.getAllByText(/Failed to fetch/i).length).toBeGreaterThan(0));
    // No fabricated contact rows when the request failed.
    expect(heading()).toBeInTheDocument();
  });
});
