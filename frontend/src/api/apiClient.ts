import { getApiBaseUrl } from '../auth/services/auth';

type ApiClientOptions = Omit<RequestInit, 'credentials'> & {
  useRelativeUrl?: boolean;
};

export async function apiClient<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const baseUrl = options.useRelativeUrl ? '' : getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const errorBody = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    throw new Error(errorBody.message ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
