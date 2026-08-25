import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useEffect } from "react";
import { SiteVisitTokenRouteContent } from "./site-visit-token-route-content";
import type { VisitState } from "./site-visit-token-route-contracts";

const tokenConvex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export function SiteVisitTokenRoute({
  buildId,
  initialVisitState,
  siteVisitToken,
  source = "demo",
}: {
  buildId: string;
  initialVisitState?: VisitState;
  siteVisitToken: string;
  source?: "demo" | "production";
}) {
  useEffect(() => {
    document.body.classList.add("bg-bg-base");
    return () => document.body.classList.remove("bg-bg-base");
  }, []);

  return (
    <ConvexProvider client={tokenConvex}>
      <SiteVisitTokenRouteContent
        buildId={buildId}
        initialVisitState={initialVisitState}
        siteVisitToken={siteVisitToken}
        source={source}
      />
    </ConvexProvider>
  );
}
