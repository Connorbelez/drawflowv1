import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    getScrollRestorationKey: (location) => {
      // Marketing homepage uses GSAP ScrollTrigger pin — pathname-based
      // restoration races pin layout and leaves the hero scrub desynced.
      if (location.pathname === "/" || location.pathname === "/marketing") {
        return location.state.__TSR_key!;
      }

      return location.pathname;
    },
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

  // No setupRouterSsrQueryIntegration and no server-side Convex fetch:
  // authenticated Convex data loads client-side only, after AuthKit auth is
  // seeded. Streaming query results from the server and handing them off to
  // the live Convex client races the client auth handshake.

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
