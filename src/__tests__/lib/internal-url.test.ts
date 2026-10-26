import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_APP_PORT,
  internalBaseUrl,
  internalUrl,
  publicBaseUrl,
} from '@/lib/internal-url';

/**
 * The port contract for this repository is 3011 on every runtime surface
 * (Dockerfile, both compose files, systemd unit, nginx, ecosystem.config.js)
 * and is gated in CI by scripts/validate-compose.mjs. These tests pin the
 * in-code half of that contract.
 */

const KEYS = ['INTERNAL_APP_URL', 'NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_APP_URL', 'PORT'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('internal-url', () => {
  describe('DEFAULT_APP_PORT', () => {
    it('matches the repository port contract', () => {
      expect(DEFAULT_APP_PORT).toBe(3011);
    });
  });

  describe('internalBaseUrl()', () => {
    it('defaults to loopback on the contract port when nothing is configured', () => {
      expect(internalBaseUrl()).toBe('http://127.0.0.1:3011');
    });

    it('derives from PORT so it can never disagree with the listening port', () => {
      process.env.PORT = '4242';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:4242');
    });

    it('prefers an explicit INTERNAL_APP_URL override', () => {
      process.env.INTERNAL_APP_URL = 'http://127.0.0.1:9999';
      process.env.PORT = '4242';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:9999');
    });

    it('strips trailing slashes from the override', () => {
      process.env.INTERNAL_APP_URL = 'http://127.0.0.1:9999///';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:9999');
    });

    it('ignores blank or whitespace-only INTERNAL_APP_URL', () => {
      process.env.INTERNAL_APP_URL = '   ';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:3011');
    });

    it('honours legacy NEXT_PUBLIC_BASE_URL when it points at loopback', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3011';
      expect(internalBaseUrl()).toBe('http://localhost:3011');
    });

    // This is the regression that motivated the module: a public origin used
    // for server-to-self calls hairpins traffic out through Caddy/Cloudflare.
    it('refuses to route internal calls through a public NEXT_PUBLIC_BASE_URL', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://hosting.alolabs.net';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:3011');
    });

    it('never returns the public origin, even when NEXT_PUBLIC_APP_URL is set', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://hosting.alolabs.net';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:3011');
      expect(internalBaseUrl()).not.toContain('hosting.alolabs.net');
    });

    it('never returns port 3000, which nothing listens on', () => {
      for (const combo of [
        {},
        { PORT: '3011' },
        { NEXT_PUBLIC_BASE_URL: 'http://localhost:3000' },
        { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
      ]) {
        for (const k of KEYS) delete process.env[k];
        Object.assign(process.env, combo);
        expect(internalBaseUrl()).not.toMatch(/:3000$/);
      }
    });

    it('tolerates a malformed NEXT_PUBLIC_BASE_URL without throwing', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'not a url';
      expect(internalBaseUrl()).toBe('http://127.0.0.1:3011');
    });
  });

  describe('internalUrl()', () => {
    it('builds an absolute URL for a leading-slash path', () => {
      expect(internalUrl('/api/llm/route')).toBe('http://127.0.0.1:3011/api/llm/route');
    });

    it('normalises a path given without a leading slash', () => {
      expect(internalUrl('api/notifications')).toBe('http://127.0.0.1:3011/api/notifications');
    });

    it('respects an explicit override', () => {
      process.env.INTERNAL_APP_URL = 'http://127.0.0.1:8080';
      expect(internalUrl('/api/uploads')).toBe('http://127.0.0.1:8080/api/uploads');
    });

    it('does not double the slash when the override has a trailing slash', () => {
      process.env.INTERNAL_APP_URL = 'http://127.0.0.1:8080/';
      expect(internalUrl('/api/uploads')).toBe('http://127.0.0.1:8080/api/uploads');
    });
  });

  describe('publicBaseUrl()', () => {
    it('prefers NEXT_PUBLIC_APP_URL, the browser-facing origin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://hosting.alolabs.net';
      expect(publicBaseUrl()).toBe('https://hosting.alolabs.net');
    });

    it('strips trailing slashes', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://hosting.alolabs.net/';
      expect(publicBaseUrl()).toBe('https://hosting.alolabs.net');
    });

    it('falls back to NEXT_PUBLIC_BASE_URL', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://alolabs.net';
      expect(publicBaseUrl()).toBe('https://alolabs.net');
    });

    it('falls back to the contract port, not 3000', () => {
      expect(publicBaseUrl()).toBe('http://localhost:3011');
    });

    it('ignores the stale localhost:3000 default from old .env.example files', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      expect(publicBaseUrl()).toBe('http://localhost:3011');
    });

    it('ignores a stale NEXT_PUBLIC_BASE_URL but keeps a real app URL', () => {
      process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
      process.env.NEXT_PUBLIC_APP_URL = 'https://hosting.alolabs.net';
      expect(publicBaseUrl()).toBe('https://hosting.alolabs.net');
    });

    // Guard against over-reach: only the *loopback* stale default is rewritten.
    it('preserves a real domain that legitimately uses port 3000', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://staging.alolabs.net:3000';
      expect(publicBaseUrl()).toBe('https://staging.alolabs.net:3000');
    });

    it('is deliberately distinct from internalBaseUrl in production', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://hosting.alolabs.net';
      expect(publicBaseUrl()).not.toBe(internalBaseUrl());
    });
  });
});
