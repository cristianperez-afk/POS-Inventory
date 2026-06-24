import type { AuthenticatedUser } from '../types/auth';

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
}

const API_URL = getApiBaseUrl();

export async function login(
  email: string,
  password: string
): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `Login failed with status ${response.status}`);
  }

  if (!data) {
    throw new Error('Login response was empty. Please check that the backend is running.');
  }

  return data.user ?? data;
}
