import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { roleLabel, type Workspace } from "#/lib/auth/rbac.ts";
import { takeProposalClaimReturnPath } from "#/lib/proposal-claim-return.ts";

type ProtectedAccessSearch = {
  reason?:
    | "missing-organization"
    | "no-workspace-access"
    | "onboarding-required";
  workspace?: Workspace;
};

export const Route = createFileRoute("/protected-access")({
  validateSearch: (search: Record<string, unknown>): ProtectedAccessSearch => ({
    reason:
      search.reason === "missing-organization" ||
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
  const navigate = useNavigate();
  const isOnboarding = reason === "onboarding-required";
  const isMissingOrganization = reason === "missing-organization";

  useEffect(() => {
    if (!isMissingOrganization) {
      return;
    }
    const claimReturnPath = takeProposalClaimReturnPath();
    if (!claimReturnPath) {
      return;
    }
    void navigate({ replace: true, to: claimReturnPath as never });
  }, [isMissingOrganization, navigate]);

  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-6">
      <Frame className="w-full max-w-xl">
        <FramePanel>
          <p className="font-medium text-muted-foreground text-sm">
            Protected access
          </p>
          <FrameTitle className="mt-2 text-xl">
            {isOnboarding
              ? "Onboarding required"
              : isMissingOrganization
                ? "Organization required"
                : "Workspace access required"}
          </FrameTitle>
          <FrameDescription className="mt-2">
            {isOnboarding
              ? `Your ${roleLabel("member")} role is authenticated, but it is not enabled for DrawFlow product workspaces yet.`
              : isMissingOrganization
                ? "Your WorkOS session is authenticated but does not include an active organization. Select an organization before opening production DrawFlow workspaces."
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
