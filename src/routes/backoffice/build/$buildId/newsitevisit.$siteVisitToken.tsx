import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/backoffice/build/$buildId/newsitevisit/$siteVisitToken"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/backoffice/builds/$buildId/newsitevisit/$siteVisitToken",
      params,
    });
  },
});
