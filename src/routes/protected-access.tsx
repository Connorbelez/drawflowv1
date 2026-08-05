import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { roleLabel, type Workspace } from "#/lib/auth/rbac.ts";
import { takeProposalClaimReturnPath } from "#/lib/proposal-claim-return.ts";
import { api } from "../../convex/_generated/api";

type ProtectedAccessSearch = {
  reason?:
    | "missing-organization"
    | "no-workspace-access"
    | "onboarding-required"
    | "profile-link-required";
  workspace?: Workspace;
};

export const Route = createFileRoute("/protected-access")({
  validateSearch: (search: Record<string, unknown>): ProtectedAccessSearch => ({
    reason:
      search.reason === "missing-organization" ||
      search.reason === "onboarding-required" ||
      search.reason === "no-workspace-access" ||
      search.reason === "profile-link-required"
        ? search.reason
        : "no-workspace-access",
    workspace:
      search.workspace === "builder" ||
      search.workspace === "backoffice" ||
      search.workspace === "contractor"
        ? search.workspace
        : "backoffice",
  }),
  component: ProtectedAccessRoute,
});

function ProtectedAccessRoute() {
  const { reason, workspace } = Route.useSearch();
  const navigate = useNavigate();
  const context = Route.useRouteContext();
  const organizationId = context?.organizationId;
  const activation = useQuery(
    api.brokerageProvisioning.getTenantActivationState,
    workspace === "backoffice" && organizationId
      ? { workosOrganizationId: organizationId }
      : "skip"
  );
  const isOnboarding = reason === "onboarding-required";
  const isMissingOrganization = reason === "missing-organization";
  const isProfileLinkRequired = reason === "profile-link-required";

  useEffect(() => {
    if (!isMissingOrganization) {
      return;
    }
    const claimReturnPath = takeProposalClaimReturnPath();
    if (!claimReturnPath) {
      return;
    }
    Promise.resolve(
      navigate({ replace: true, to: claimReturnPath as never })
    ).catch(() => undefined);
  }, [isMissingOrganization, navigate]);

  if (activation && activation.state !== "active") {
    return <TenantActivationRecovery activation={activation} />;
  }

  const title = isOnboarding
    ? "Onboarding required"
    : isMissingOrganization
      ? "Organization required"
      : isProfileLinkRequired
        ? "Profile link required"
        : "Workspace access required";
  const description = isOnboarding
    ? `Your ${roleLabel("member")} role is authenticated, but it is not enabled for DrawFlow product workspaces yet.`
    : isMissingOrganization
      ? "Your WorkOS session is authenticated but does not include an active organization. Select an organization before opening production DrawFlow workspaces."
      : isProfileLinkRequired
        ? "Your contractor session is authenticated, but it is not connected to a linked contractor profile yet. Finish contractor onboarding or open the invitation that links your profile before entering the contractor workspace."
        : `Your current WorkOS session does not include access to the ${workspace} workspace.`;

  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-6">
      <Frame className="w-full max-w-xl">
        <FramePanel>
          <p className="font-medium text-muted-foreground text-sm">
            Protected access
          </p>
          <FrameTitle className="mt-2 text-xl">{title}</FrameTitle>
          <FrameDescription className="mt-2">{description}</FrameDescription>
          <div className="mt-5 flex gap-3">
            {isProfileLinkRequired ? (
              <Link
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm"
                to="/contractor/onboarding"
              >
                Continue onboarding
              </Link>
            ) : (
              <Link
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm"
                to="/"
              >
                Home
              </Link>
            )}
            <Link
              className="inline-flex h-9 items-center rounded-md border bg-background px-3 font-medium text-sm"
              to="/"
            >
              Home
            </Link>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

export type TenantActivationRecoveryState = {
  actions: string[];
  affectedWorkWarning?: string;
  capabilityDelta: { gained: string[]; lost: string[] };
  currentRoles: string[];
  effectiveAt?: number;
  intendedDestination: string;
  intendedRoles: string[];
  invitationStatus: string;
  invitedEmail?: string;
  organization: { id: string; name: string };
  projectionStatus: string;
  requiredRole: string;
  responsibleOwner: string;
  state: string;
  supportReference: string;
};

export function TenantActivationRecovery({
  activation,
}: {
  activation: TenantActivationRecoveryState;
}) {
  const stateTitle: Record<string, string> = {
    deactivated: "Organization access was deactivated",
    "integration-only": "Integration access only",
    "invitation-missing": "Organization invitation is missing",
    "invitation-pending": "Organization invitation is pending",
    "no-workspace-access": "Workspace role is not enabled",
    "projection-failed": "Access projection needs repair",
    "role-change-pending": "Role change is still syncing",
    "tenant-activation-pending": "Tenant activation is incomplete",
    "wrong-organization": "Switch to the invited organization",
  };
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4 sm:p-6">
      <Frame
        className="w-full max-w-2xl"
        data-testid="tenant-activation-recovery"
      >
        <FramePanel className="grid gap-5 p-5 sm:p-6">
          <div className="grid gap-2">
            <p className="font-medium text-muted-foreground text-sm">
              Tenant activation recovery
            </p>
            <FrameTitle className="text-xl">
              {stateTitle[activation.state] ?? "Workspace access is not ready"}
            </FrameTitle>
            <FrameDescription>
              Your identity is authenticated. DrawFlow is waiting for the
              organization invitation, role, and projection below to agree.
            </FrameDescription>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <ActivationDetail
              label="Organization"
              value={activation.organization.name}
            />
            <ActivationDetail
              label="Organization ID"
              value={activation.organization.id}
            />
            <ActivationDetail
              label="Invited email"
              value={activation.invitedEmail ?? "Not projected"}
            />
            <ActivationDetail
              label="Required role"
              value={activation.requiredRole}
            />
            <ActivationDetail
              label="Invitation"
              value={activation.invitationStatus}
            />
            <ActivationDetail
              label="Projection"
              value={activation.projectionStatus}
            />
            <ActivationDetail
              label="Responsible owner"
              value={activation.responsibleOwner}
            />
            <ActivationDetail
              label="Support reference"
              value={activation.supportReference}
            />
            <ActivationDetail
              label="Current roles"
              value={activation.currentRoles.join(", ") || "None"}
            />
            <ActivationDetail
              label="Intended roles"
              value={activation.intendedRoles.join(", ") || "Not projected"}
            />
            {activation.effectiveAt ? (
              <ActivationDetail
                label="Effective / updated"
                value={new Date(activation.effectiveAt).toLocaleString()}
              />
            ) : null}
            <ActivationDetail
              label="Destination"
              value={activation.intendedDestination}
            />
          </dl>
          {activation.capabilityDelta.gained.length ||
          activation.capabilityDelta.lost.length ? (
            <p className="text-muted-foreground text-xs">
              Capability change: +
              {activation.capabilityDelta.gained.join(", ") || "none"}; −
              {activation.capabilityDelta.lost.join(", ") || "none"}.
            </p>
          ) : null}
          {activation.affectedWorkWarning ? (
            <p className="text-sm text-warning-foreground" role="status">
              {activation.affectedWorkWarning}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {activation.actions.includes("retry-projection") ||
            activation.actions.includes("accept-invitation") ? (
              <Button onClick={() => window.location.reload()} type="button">
                Retry projection check
              </Button>
            ) : null}
            {activation.actions.includes("open-integrations") ? (
              <Button
                onClick={() =>
                  window.location.assign("/backoffice/integrations")
                }
                type="button"
              >
                Open integrations
              </Button>
            ) : null}
            {activation.actions.includes("switch-organization") ? (
              <Button
                onClick={() => window.location.assign("/")}
                type="button"
                variant="outline"
              >
                Switch organization
              </Button>
            ) : null}
            {activation.actions.includes("contact-platform-admin") ||
            activation.actions.includes("request-help") ? (
              <Button
                onClick={() =>
                  window.location.assign(
                    `mailto:support@fairlend.ca?subject=${encodeURIComponent(
                      `DrawFlow access ${activation.supportReference}`
                    )}`
                  )
                }
                type="button"
                variant="outline"
              >
                Request help
              </Button>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function ActivationDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
