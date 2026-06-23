import type { AuthenticatedUser } from '../types/auth';

export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configuredUrl || typeof window === 'undefined') return configuredUrl ?? '';

  try {
    const apiUrl = new URL(configuredUrl);
    const appUrl = new URL(window.location.href);
    const isLoopbackApp = appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1';
    const isLoopbackApi = apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1';

    if (isLoopbackApp && isLoopbackApi) {
      return '';
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}

const AUTH_URL = '';

export async function login(
  email: string,
  password: string,
  rememberMe = false,
): Promise<AuthenticatedUser> {
  const response = await fetch(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, rememberMe }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Invalid email or password');
  }

  return data.user ?? data;
}

export async function getCurrentSession(): Promise<AuthenticatedUser> {
  let response = await fetch(`${AUTH_URL}/auth/me`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    const refreshResponse = await fetch(`${AUTH_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null);

    if (refreshResponse?.ok) {
      response = await fetch(`${AUTH_URL}/auth/me`, {
        credentials: 'include',
      });
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Session expired');
  }
  return data.user;
}

export async function logout() {
  await fetch(`${AUTH_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined);
}

export async function forgotPassword(email: string) {
  const response = await fetch(`${AUTH_URL}/auth/forgot-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Unable to send password reset email');
  }
  return data;
}

export async function resetPassword(token: string, password: string) {
  const response = await fetch(`${AUTH_URL}/auth/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Unable to reset password');
  }
  return data;
}
