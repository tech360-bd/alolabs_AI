import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Define the mock matchMedia function
const mockMatchMedia = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
});

// Need to set innerWidth as writable
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
});

import { useIsMobile } from '@/hooks/use-mobile';

describe('useIsMobile', () => {
  let changeCallback: (() => void) | null = null;
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    changeCallback = null;
    addEventListenerSpy = vi.fn((_event: string, cb: () => void) => {
      if (_event === 'change') changeCallback = cb;
    });
    removeEventListenerSpy = vi.fn((_event: string, _cb: () => void) => {
      if (_event === 'change') changeCallback = null;
    });

    mockMatchMedia.mockReturnValue({
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return false for large viewports (>768px)', () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('should return true for small viewports (<768px)', () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('should return false at exactly 768px', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('should handle resize events', () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      window.innerWidth = 400;
      if (changeCallback) changeCallback();
    });

    expect(result.current).toBe(true);

    // Simulate resize back to desktop
    act(() => {
      window.innerWidth = 1200;
      if (changeCallback) changeCallback();
    });

    expect(result.current).toBe(false);
  });

  it('should set up and tear down the event listener', () => {
    const { unmount } = renderHook(() => useIsMobile());

    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});