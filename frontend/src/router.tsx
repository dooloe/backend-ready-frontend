import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

export function createAppQueryClient() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => clearDeniedSession(error) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        clearDeniedSession(error, mutation.options.meta?.["authFlow"] === true),
    }),
  });
  const clearDeniedSession = (error: unknown, skip = false) => {
    if (skip || !(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
      return;
    }
    setSession(null);
    queryClient.clear();
  };
  return queryClient;
}

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
