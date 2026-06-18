import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';

function reportApiError(kind: 'query' | 'mutation', error: unknown) {
  console.error(`[API ${kind}]`, error);
  window.dispatchEvent(
    new CustomEvent('api-error', {
      detail: {
        kind,
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  );
}

export const appQueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => reportApiError('query', error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => reportApiError('mutation', error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
