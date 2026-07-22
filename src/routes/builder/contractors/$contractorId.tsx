import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { ContractorDetailSurface } from "#/features/contractors/ContractorDetailSurface.tsx";
import {
  getVisualContractorDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export type BuilderContractorSearch = {
  fromBuildId?: string;
};

export const Route = createFileRoute("/builder/contractors/$contractorId")({
  validateSearch: (search: Record<string, unknown>): BuilderContractorSearch => ({
    ...(typeof search.fromBuildId === "string" &&
    /^[A-Za-z0-9_-]+$/.test(search.fromBuildId)
      ? { fromBuildId: search.fromBuildId }
      : {}),
  }),
  staticData: {
    breadcrumb: {
      label: "Contractor detail",
      to: "/builder",
    },
  },
  component: BuilderContractorRoute,
});

function BuilderContractorRoute() {
  const { contractorId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <BuilderContractorWorkspaceRoute
      contractorId={contractorId}
      search={search}
      workosOrganizationId={context.organizationId as string}
    />
  );
}

type BuilderContractorRelationshipResult =
  | {
      availability: {
        category: "available";
        reference: string;
      };
      detail: any;
    }
  | {
      availability: {
        category: "accessDenied" | "invalidLink" | "notFound";
        reference: string;
      };
      detail: null;
    };

function builderContractorBackLink(search: BuilderContractorSearch) {
  return search.fromBuildId
    ? {
        href: `/builder/builds/${search.fromBuildId}?tab=contractors`,
        label: "Back to build contractors",
      }
    : {
        href: "/builder",
        label: "Back to builder workspace",
      };
}

function BuilderContractorUnavailable({
  availability,
  search,
}: {
  availability: Exclude<
    BuilderContractorRelationshipResult,
    { availability: { category: "available" } }
  >["availability"];
  search: BuilderContractorSearch;
}) {
  const backLink = builderContractorBackLink(search);
  const content =
    availability.category === "invalidLink"
      ? {
          description:
            "This contractor link is invalid. Return to the invoking workspace and open the contractor again.",
          label: "Invalid link",
          title: "Contractor link is invalid",
        }
      : availability.category === "notFound"
        ? {
            description:
              "This contractor relationship is no longer available. It may have been removed after the link was created.",
            label: "Record unavailable",
            title: "Contractor no longer available",
          }
        : {
            description:
              "This contractor is not attached to a proposal or Build owned by your current workspace. Return to the invoking workspace or ask the Build owner to review the relationship.",
            label: "Access unavailable",
            title: "Contractor access unavailable",
          };

  return (
    <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
      <Frame className="w-full max-w-xl">
        <FramePanel className="space-y-4 p-5">
          <div className="space-y-2">
            <Badge variant="outline">{content.label}</Badge>
            <h1 className="font-semibold text-xl">{content.title}</h1>
            <p className="text-muted-foreground text-sm">
              {content.description}
            </p>
            <p className="text-muted-foreground text-xs">
              Reference: {availability.reference}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 font-medium text-sm transition-colors hover:bg-accent"
              href={backLink.href}
            >
              {backLink.label}
            </a>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function relationshipLabel(state?: string) {
  const labels: Record<string, string> = {
    accepted_pending_confirmation: "Accepted — confirmation pending",
    acknowledgement_pending: "Acknowledgement pending",
    active: "Active",
    assigned: "Assigned",
    attached: "Attached",
    changes_requested: "Changes requested",
    claimed: "Claimed",
    expired: "Invitation expired",
    failed: "Invite failed",
    invited: "Invited",
    review_required: "Review required",
    revoked: "Invitation revoked",
    sending: "Sending invitation",
    sync_pending: "Account sync pending",
  };
  return state ? (labels[state] ?? state) : "Status unavailable";
}

function nextActionLabel(action?: string) {
  const labels: Record<string, string> = {
    contact_support: "Contact support to repair the handoff.",
    invite: "Send an invitation to the contractor email.",
    none: "No action is required.",
    wait_for_acknowledgement: "Waiting for the contractor to acknowledge assigned work.",
    wait_for_activation: "Waiting for account activation.",
    wait_for_claim: "Waiting for the contractor to claim the invitation.",
    wait_for_confirmation: "Waiting for the contractor to confirm the profile claim.",
    wait_for_review: "Waiting for backoffice review.",
    wait_for_sync: "Waiting for account access to finish syncing.",
  };
  return action ? (labels[action] ?? "Open the invoking workspace for next steps.") : "No action is available.";
}

function formatRelationshipState(value?: string, fallback = "Not recorded") {
  if (!value) {
    return fallback;
  }
  return value
    .split("_")
    .map((part, index) =>
      index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part
    )
    .join(" ");
}

function formatRelationshipTimestamp(value?: number) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BuilderContractorWorkspaceRoute({
  contractorId,
  search,
  workosOrganizationId,
}: {
  contractorId: string;
  search: BuilderContractorSearch;
  workosOrganizationId: string;
}) {
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const liveResult = useQuery(
    (api as any).production_proposals
      .getBuilderContractorRelationshipByString,
    visualFixture
      ? "skip"
      : {
          contractorId,
          workosOrganizationId,
        }
  ) as BuilderContractorRelationshipResult | undefined;
  const result: BuilderContractorRelationshipResult | undefined = visualFixture
    ? {
        availability: {
          category: "available",
          reference: "CTR-DETAIL-VISUAL",
        },
        detail: getVisualContractorDetail(contractorId),
      }
    : liveResult;
  const sendInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );
  const [pendingInvite, setPendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  if (result === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame>
          <FramePanel className="p-5 text-sm">
            Loading contractor relationship...
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (!result.detail || result.availability.category !== "available") {
    return (
      <BuilderContractorUnavailable
        availability={result.availability}
        search={search}
      />
    );
  }

  const detail = result.detail;
  const relationship = detail.relationship;
  const backLink = builderContractorBackLink(search);
  const canInvite =
    !visualFixture &&
    relationship?.nextAction === "invite" &&
    Boolean(detail.profile.email);
  const displayedLifecycleState = inviteError
    ? "failed"
    : pendingInvite
      ? "sending"
      : inviteSent
        ? "invited"
        : relationship?.lifecycleState;
  const lastHandoffUpdate = Math.max(
    relationship?.invitation?.updatedAt ?? 0,
    relationship?.review?.updatedAt ?? 0
  );

  const onInvite = async () => {
    setPendingInvite(true);
    setInviteError(null);
    try {
      await sendInvite({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
      });
      setInviteSent(true);
    } catch {
      setInviteError(
        "The invitation could not be sent. Check the contractor email and try again, or contact support."
      );
    } finally {
      setPendingInvite(false);
    }
  };

  return (
    <>
      <ContractorDetailSurface
        backHref={backLink.href}
        backLabel={backLink.label}
        buildHrefForWorkHistory={(row) => `/builder/builds/${row.buildId}`}
        detail={detail}
        emptyWorkHistory="No assigned build or milestone work is visible for this contractor."
        rightRailFooter={
          relationship ? (
            <Frame>
              <FramePanel className="grid gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm">Relationship status</h2>
                  <Badge variant="outline">
                    {relationshipLabel(displayedLifecycleState)}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Brokerage</dt>
                    <dd className="text-right font-medium">
                      {relationship.brokerage?.displayName ?? "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Invited email</dt>
                    <dd className="text-right font-medium">
                      {relationship.invitation?.email ?? detail.profile.email ?? "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Invitation sent</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipTimestamp(
                        relationship.invitation?.sentAt
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Invitation expires</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipTimestamp(
                        relationship.invitation?.expiresAt
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last handoff update</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipTimestamp(lastHandoffUpdate || undefined)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Claim state</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipState(
                        relationship.invitation?.state,
                        "Not invited"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Review state</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipState(
                        relationship.review?.state,
                        "Not required"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Assignment</dt>
                    <dd className="text-right font-medium">
                      {relationship.assignmentStatus === "assigned"
                        ? "Assigned"
                        : "Not assigned"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Acknowledgement</dt>
                    <dd className="text-right font-medium">
                      {formatRelationshipState(
                        relationship.acknowledgementStatus,
                        "Not required"
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground text-xs">
                  {nextActionLabel(relationship.nextAction)}
                </p>
                {inviteError ? (
                  <p aria-live="polite" className="text-destructive text-xs">
                    {inviteError}
                  </p>
                ) : null}
                {inviteSent ? (
                  <p aria-live="polite" className="text-emerald-600 text-xs">
                    Invitation sent. This status will update when the contractor
                    accepts or claims the profile.
                  </p>
                ) : null}
                {canInvite ? (
                  <div>
                    <Button
                      disabled={pendingInvite || inviteSent}
                      onClick={onInvite}
                      size="sm"
                      type="button"
                    >
                      {pendingInvite ? "Sending…" : "Send invite"}
                    </Button>
                  </div>
                ) : null}
              </FramePanel>
            </Frame>
          ) : undefined
        }
      />
    </>
  );
}
