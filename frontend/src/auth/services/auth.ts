import type { AuthenticatedUser } from '../types/auth';

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Invalid email or password');
  }

  return data.user ?? data;
}
