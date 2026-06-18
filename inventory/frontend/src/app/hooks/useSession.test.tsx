import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from './useSession';
import {
  getCurrentSession,
  loginUser,
  logoutUser,
} from '../api/client';

vi.mock('../api/client', () => ({
  getCurrentSession: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const user = {
  id: 'user-1',
  name: 'Retail Admin',
  email: 'admin@example.com',
  role: 'Admin',
  status: 'Active',
  businessId: 'business-1',
  modules: ['RETAIL'],
  lastLogin: new Date().toISOString(),
};

function makeWrapper() {
  const queryClient = new QueryClient();
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

describe('useSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('restores an authenticated cookie session on mount', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user });

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });

    expect(result.current.isRestoringSession).toBe(true);
    expect(result.current.isLoggedIn).toBe(false);

    await waitFor(() => expect(result.current.isRestoringSession).toBe(false));

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.currentUser).toEqual(user);
  });

  it('stays logged out when session restoration fails', async () => {
    vi.mocked(getCurrentSession).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isRestoringSession).toBe(false));

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.currentUser).toBeNull();
  });

  it('sets currentUser in context after login', async () => {
    vi.mocked(getCurrentSession).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(loginUser).mockResolvedValue({ user, accessToken: 'tok' });

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isRestoringSession).toBe(false));

    await act(() => result.current.login('admin@example.com', 'password'));

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.currentUser).toEqual(user);
  });

  it('clears currentUser from context after logout', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user });
    vi.mocked(logoutUser).mockResolvedValue({ message: 'Logged out' });

    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoggedIn).toBe(true));

    await act(() => result.current.logout());

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.currentUser).toBeNull();
  });
});
