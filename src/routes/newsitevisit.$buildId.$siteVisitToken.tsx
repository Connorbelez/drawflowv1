import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";
import { SiteVisitTokenRoute } from "#/features/build-workspace-demo/SiteVisitTokenRoute.tsx";

const convexUrl =
  process.env.VITE_CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL;
const convex = new ConvexHttpClient(convexUrl);

export const Route = createFileRoute("/newsitevisit/$buildId/$siteVisitToken")({
  loader: async ({ params }) =>
    await convex.query(api.demo_drawflow.demo_getSiteVisitByToken, {
      buildId: params.buildId,
      token: params.siteVisitToken,
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId, siteVisitToken } = Route.useParams();
  const initialVisitState = Route.useLoaderData();
  return (
    <SiteVisitTokenRoute
      buildId={buildId}
      initialVisitState={initialVisitState}
      siteVisitToken={siteVisitToken}
    />
  );
}
