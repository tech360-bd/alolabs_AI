import { describe, expect, it } from 'vitest';

import { parseEnvConfig } from '../../../scripts/parse-env-config.cjs';

describe('PM2 .env.config parser', () => {
  it('preserves dollar signs and does not interpolate variable references', () => {
    const env = parseEnvConfig([
      'JWT_SECRET="literal$secret-${NOT_EXPANDED}"',
      'OPENROUTER_API_KEY=$literal-key',
    ].join('\n'));

    expect(env.JWT_SECRET).toBe('literal$secret-${NOT_EXPANDED}');
    expect(env.OPENROUTER_API_KEY).toBe('$literal-key');
  });

  it('supports exports, comments, quotes, and multiline values', () => {
    const env = parseEnvConfig([
      '# comment',
      'export PORT=3011 # inline comment',
      'APP_NAME="ALO Labs AgentOS"',
      "SINGLE_QUOTED='keep # this'",
      'MULTILINE="first line',
      'second line"',
      'EMPTY=',
    ].join('\n'));

    expect(env).toEqual({
      PORT: '3011',
      APP_NAME: 'ALO Labs AgentOS',
      SINGLE_QUOTED: 'keep # this',
      MULTILINE: 'first line\nsecond line',
      EMPTY: '',
    });
  });

  it('fails on an unterminated quoted value instead of silently truncating it', () => {
    expect(() => parseEnvConfig('JWT_SECRET="broken')).toThrow(/Unterminated quoted value/);
  });
});
