import { createFileRoute, redirect } from "@tanstack/react-router";

import { AccessPortalPage } from "#/features/access-portal/AccessPortalPage.tsx";
import { resolveAccessDestination } from "#/features/access-portal/access-routing.ts";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      return;
    }

    const destination = resolveAccessDestination([
      context.role,
      ...(context.roles ?? []),
    ]);

    if (destination) {
      throw redirect({ to: destination });
    }
  },
  component: AccessPortalPage,
  head: getHomePageHead,
});

function getHomePageHead() {
  return {
    links: [{ href: "/", rel: "canonical" }],
    meta: [
      {
        title: "Sign in to DrawFlow",
      },
      {
        name: "description",
        content:
          "Secure organization-aware access for DrawFlow builder, lender, and contractor workspaces.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  };
}
