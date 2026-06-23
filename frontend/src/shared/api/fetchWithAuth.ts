let installed = false;
let refreshPromise: Promise<boolean> | null = null;

function isAuthRefreshUrl(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return url.endsWith('/auth/refresh') || url.includes('/auth/refresh?');
}

async function refreshSession(originalFetch: typeof fetch) {
  if (!refreshPromise) {
    refreshPromise = originalFetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function installAuthFetchInterceptor() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestInit: RequestInit = {
      ...init,
      credentials: init.credentials ?? 'include',
    };

    let response = await originalFetch(input, requestInit);
    if (response.status !== 401 || isAuthRefreshUrl(input)) {
      return response;
    }

    const refreshed = await refreshSession(originalFetch);
    if (!refreshed) {
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
      return response;
    }

    response = await originalFetch(input, requestInit);
    return response;
  };
}
