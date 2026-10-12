import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('merges tailwind classes correctly (later wins for conflicts)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });

  it('handles arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('deduplicates identical tailwind classes', () => {
    // tailwind-merge deduplicates tailwind utility classes
    expect(cn('px-2', 'px-2')).toBe('px-2');
    // But plain non-tailwind strings pass through as-is
    expect(cn('foo', 'foo')).toBe('foo foo');
  });

  it('handles object syntax for conditional classes', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});