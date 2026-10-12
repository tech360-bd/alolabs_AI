import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Import store after localStorage mock is set up
import { useAppStore } from '@/store/app';

describe('app store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      user: null,
      token: null,
      sidebarOpen: true,
      currentView: 'web-crm',
      selectedCompany: null,
      showPublicSite: false,
      notificationCount: 0,
      theme: 'light',
      commandPaletteOpen: false,
    });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should have correct initial state', () => {
    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.sidebarOpen).toBe(true);
    expect(state.currentView).toBe('web-crm');
    expect(state.selectedCompany).toBeNull();
    expect(state.showPublicSite).toBe(false);
    expect(state.notificationCount).toBe(0);
    expect(state.theme).toBe('light');
    expect(state.commandPaletteOpen).toBe(false);
  });

  it('should set user and token on login', () => {
    const user = { id: '1', email: 'test@alo.com', name: 'Test User', role: 'admin' };
    useAppStore.getState().login(user, 'test-token-123');

    const state = useAppStore.getState();
    expect(state.user).toEqual(user);
    expect(state.token).toBe('test-token-123');
    expect(state.currentView).toBe('web-crm');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'test-token-123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(user));
  });

  it('should clear user and token on logout', () => {
    const user = { id: '1', email: 'test@alo.com', name: 'Test', role: 'admin' };
    useAppStore.getState().login(user, 'tok');
    vi.clearAllMocks();

    useAppStore.getState().logout();

    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.currentView).toBe('login');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
  });

  it('should change view with setView', () => {
    useAppStore.getState().setView('agents-registry');
    expect(useAppStore.getState().currentView).toBe('agents-registry');

    useAppStore.getState().setView('settings');
    expect(useAppStore.getState().currentView).toBe('settings');
  });

  it('should toggle sidebar with setSidebarOpen', () => {
    expect(useAppStore.getState().sidebarOpen).toBe(true);
    useAppStore.getState().setSidebarOpen(false);
    expect(useAppStore.getState().sidebarOpen).toBe(false);
    useAppStore.getState().setSidebarOpen(true);
    expect(useAppStore.getState().sidebarOpen).toBe(true);
  });

  it('should set selected company', () => {
    useAppStore.getState().setSelectedCompany('alo-hr');
    expect(useAppStore.getState().selectedCompany).toBe('alo-hr');
    useAppStore.getState().setSelectedCompany(null);
    expect(useAppStore.getState().selectedCompany).toBeNull();
  });

  it('should set notification count', () => {
    useAppStore.getState().setNotificationCount(5);
    expect(useAppStore.getState().notificationCount).toBe(5);
  });

  it('should set theme and persist to localStorage', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  it('should toggle command palette', () => {
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
    useAppStore.getState().setCommandPaletteOpen(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it('should hydrate from localStorage on _init', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'token') return 'saved-token';
      if (key === 'user') return JSON.stringify({ id: '1', email: 'a@b.com', name: 'A', role: 'user' });
      if (key === 'theme') return 'dark';
      return null;
    });

    useAppStore.getState()._init();

    const state = useAppStore.getState();
    expect(state.token).toBe('saved-token');
    expect(state.user).toEqual({ id: '1', email: 'a@b.com', name: 'A', role: 'user' });
    expect(state.theme).toBe('dark');
  });

  it('should handle invalid JSON in localStorage gracefully during _init', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'token') return 'tok';
      if (key === 'user') return 'NOT-JSON';
      return null;
    });

    // Should not throw
    useAppStore.getState()._init();
    // The _init sets token+user atomically in a try/catch;
    // if JSON.parse fails, neither token nor user are set
    const state = useAppStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});