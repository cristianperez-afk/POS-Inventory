let installed = false;
let refreshPromise: Promise<boolean> | null = null;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAuthRefreshUrl(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return url.endsWith('/auth/refresh') || url.includes('/auth/refresh?');
}

function getRequestMethod(input: RequestInfo | URL, init: RequestInit) {
  if (init.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function getCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function withAuthRequestDefaults(input: RequestInfo | URL, init: RequestInit = {}): RequestInit {
  const requestInit: RequestInit = {
    ...init,
    credentials: init.credentials ?? 'include',
  };
  const method = getRequestMethod(input, requestInit);
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCookie('csrf_token');
    if (csrfToken) {
      const headers = new Headers(
        requestInit.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined),
      );
      headers.set('X-CSRF-Token', csrfToken);
      requestInit.headers = headers;
    }
  }
  return requestInit;
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
    let requestInit = withAuthRequestDefaults(input, init);

    let response = await originalFetch(input, requestInit);
    if (response.status !== 401 || isAuthRefreshUrl(input)) {
      return response;
    }

    const refreshed = await refreshSession(originalFetch);
    if (!refreshed) {
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
      return response;
    }

    requestInit = withAuthRequestDefaults(input, init);
    response = await originalFetch(input, requestInit);
    return response;
  };
}
