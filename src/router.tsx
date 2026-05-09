import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultViewTransition: {
      types: ({ fromLocation, toLocation, pathChanged }) => {
        if (!(pathChanged && fromLocation)) {
          return false;
        }

        const fromIndex = fromLocation.state.__TSR_index;
        const toIndex = toLocation.state.__TSR_index;

        if (typeof fromIndex !== "number" || typeof toIndex !== "number") {
          return ["route-crossfade"];
        }

        return [fromIndex > toIndex ? "route-back" : "route-forward"];
      },
    },
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
