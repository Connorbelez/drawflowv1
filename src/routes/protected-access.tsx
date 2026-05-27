import { createFileRoute, Link } from "@tanstack/react-router";

import { Frame, FrameDescription, FramePanel, FrameTitle } from "#/components/ui/frame.tsx";
import { roleLabel, type Workspace } from "#/lib/auth/rbac.ts";

type ProtectedAccessSearch = {
  reason?: "no-workspace-access" | "onboarding-required";
  workspace?: Workspace;
};

export const Route = createFileRoute("/protected-access")({
  validateSearch: (search: Record<string, unknown>): ProtectedAccessSearch => ({
    reason:
      search.reason === "onboarding-required" ||
      search.reason === "no-workspace-access"
        ? search.reason
        : "no-workspace-access",
    workspace: search.workspace === "builder" ? "builder" : "backoffice",
  }),
  component: ProtectedAccessRoute,
});

function ProtectedAccessRoute() {
  const { reason, workspace } = Route.useSearch();
  const isOnboarding = reason === "onboarding-required";

  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-6">
      <Frame className="w-full max-w-xl">
        <FramePanel>
          <p className="font-medium text-muted-foreground text-sm">
            Protected access
          </p>
          <FrameTitle className="mt-2 text-xl">
            {isOnboarding ? "Onboarding required" : "Workspace access required"}
          </FrameTitle>
          <FrameDescription className="mt-2">
            {isOnboarding
              ? `Your ${roleLabel("member")} role is authenticated, but it is not enabled for DrawFlow product workspaces yet.`
              : `Your current WorkOS session does not include access to the ${workspace} workspace.`}
          </FrameDescription>
          <div className="mt-5 flex gap-3">
            <Link
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm"
              to="/"
            >
              Home
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border bg-background px-3 font-medium text-sm"
              to="/demo"
            >
              Demos
            </Link>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}
