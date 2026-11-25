import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// The test suite defines its own runtime instead of inheriting the developer's
// shell. If `NODE_ENV=production` leaks in from a login profile (or from a
// `source .env` that a `start` script exported), Vite resolves React's
// *production* build — which has no `React.act`, breaking every
// @testing-library/react test — and Vite's SSR pipeline loads Next.js in
// production mode, which fails at suite-import time. Both are environment
// defects, not code defects, and they hide real regressions. Pin it here,
// before any module is resolved, and say so out loud.
if (process.env.NODE_ENV !== 'test') {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[vitest] NODE_ENV=production was inherited from the shell; forcing ' +
        'NODE_ENV=test for this run. Tests must not execute against a ' +
        'production React build or the production datasource policy.',
    );
  }
  process.env.NODE_ENV = 'test';
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}', 'src/__tests__/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/components/ui/**', 'src/**/*.d.ts', 'src/types/**', 'src/app/**', 'src/lib/enterprise-spec.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});