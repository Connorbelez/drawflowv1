import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/notifications/$intentId")({
  component: NotificationLinkRoute,
  ssr: false,
});

export function notificationSignInHref(intentId: string) {
  const returnPathname = `/notifications/${encodeURIComponent(intentId)}`;
  return `/api/auth/sign-in?returnPathname=${encodeURIComponent(returnPathname)}`;
}

function NotificationLinkRoute() {
  const { intentId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string | null;
  const authorization = useQuery(
    api.lender_portal_notifications.authorizeLenderPortalNotificationLink,
    context.userId && workosOrganizationId
      ? {
          intentId: intentId as Id<"communicationIntents">,
          workosOrganizationId,
        }
      : "skip"
  );

  useEffect(() => {
    if (!context.userId) {
      window.location.replace(notificationSignInHref(intentId));
      return;
    }
    if (authorization?.linkPath) {
      window.location.replace(authorization.linkPath);
    }
  }, [authorization?.linkPath, context.userId, intentId]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Frame className="w-full max-w-md">
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-5"
          role="status"
        >
          <Loader2
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
          <div>
            <h1 className="font-medium text-sm">Opening DrawFlow</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Checking your current access to this notification.
            </p>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}
