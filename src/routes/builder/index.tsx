import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import {
  BuilderTimelineDashboardSurface,
  type TimelinePlanRow,
} from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { BuilderFirstRun } from "#/features/builder-onboarding/BuilderFirstRun.tsx";
import { resolveBuilderHomeView } from "#/features/builder-onboarding/onboarding-gate.ts";
import {
  type ProductionKanban,
  toTimelineRows,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityKanban,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/builder/")({
  ssr: false,
  component: BuilderProductionHomeRoute,
});

export type BuilderActivationRecovery = {
  intendedDestination: "/builder";
  invitationStatus: "active" | "deleted" | "inactive" | "missing" | "pending";
  invitedEmail?: string;
  kind: string;
  organization: { id: string; name: string };
  projectionStatus: "failed" | "missing" | "pending" | "ready";
  requiredRole: "Builder";
  responsibleOwner: string;
  supportReference: string;
};
function BuilderProductionHomeRoute() {
  const context = Route.useRouteContext();
  return (
    <BuilderProductionHomeWorkspace
      routeBase="/builder"
      workosOrganizationId={context.organizationId as string}
    />
  );
}

function useRepairMissingBrokerAssignment({
  enabled,
  relationshipStatus,
  workosOrganizationId,
}: {
  enabled: boolean;
  relationshipStatus: string | undefined;
  workosOrganizationId: string;
}) {
  const repairBrokerAssignment = useMutation(
    api.brokerageProvisioning.repairOwnBuilderBrokerAssignment
  );
  const repairAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    const repairable =
      relationshipStatus === "missing-broker-assignment" ||
      relationshipStatus === "failed";
    if (!(enabled && repairable)) {
      return;
    }

    const attemptKey = `${workosOrganizationId}:${relationshipStatus}`;
    if (repairAttemptRef.current === attemptKey) {
      return;
    }
    repairAttemptRef.current = attemptKey;

    repairBrokerAssignment({ workosOrganizationId }).catch(() => {
      // Keep the typed recovery surface visible when no eligible principal broker
      // exists. The user can retry after the brokerage repairs its membership.
    });
  }, [
    enabled,
    relationshipStatus,
    repairBrokerAssignment,
    workosOrganizationId,
  ]);
}

export function BuilderProductionHomeWorkspace({
  routeBase,
  workosOrganizationId,
}: {
  routeBase: "/builder" | "/builder-staff";
  workosOrganizationId: string;
}) {
  const isStaffWorkspace = routeBase === "/builder-staff";
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();

  // First-run gating: a builder with a profile but no proposals (and who has
  // not dismissed) sees the welcome flow before the dashboard. Fixtures bypass.
  const onboardingQuery = useQuery(
    api.production_proposals.getBuilderOnboardingState,
    visualFixtureEnabled || isStaffWorkspace ? "skip" : { workosOrganizationId }
  );
  const relationshipQuery = useQuery(
    api.brokerageProvisioning.getBuilderBrokerRelationshipSummary,
    visualFixtureEnabled || isStaffWorkspace ? "skip" : { workosOrganizationId }
  );
  useRepairMissingBrokerAssignment({
    enabled: !(visualFixtureEnabled || isStaffWorkspace),
    relationshipStatus: relationshipQuery?.relationship.status,
    workosOrganizationId,
  });
  const [forceDashboard, setForceDashboard] = useState(false);

  const kanbanQuery = useQuery(
    api.production_proposals.listProposalKanban,
    visualFixtureEnabled || isStaffWorkspace ? "skip" : { workosOrganizationId }
  );
  const staffWorkspaceQuery = useQuery(
    api.production_proposals.listBuilderStaffWorkspace,
    visualFixtureEnabled || !isStaffWorkspace
      ? "skip"
      : { workosOrganizationId }
  );
  const kanban = visualFixtureEnabled ? getVisualParityKanban() : kanbanQuery;
  const rows: TimelinePlanRow[] = isStaffWorkspace
    ? [
        ...((staffWorkspaceQuery?.proposalRows ?? []) as TimelinePlanRow[]),
        ...((staffWorkspaceQuery?.activeBuildRows ?? []) as TimelinePlanRow[]),
      ]
    : toTimelineRows(
        (kanban as ProductionKanban | undefined)?.columns.flatMap(
          (column) => column.cards
        ) ?? []
      );

  const view = resolveBuilderHomeView({
    fixtureEnabled: visualFixtureEnabled,
    forceDashboard,
    state: isStaffWorkspace
      ? {
          complete: true,
          dismissed: true,
          hasProfile: true,
          hasProposals: true,
          isBuilder: true,
          relationshipStatus: "active",
        }
      : onboardingQuery
        ? {
            ...onboardingQuery,
            relationshipStatus: relationshipQuery?.relationship.status,
          }
        : undefined,
  });

  return (
    <BuilderHomeContent
      isStaffWorkspace={isStaffWorkspace}
      kanban={kanban as ProductionKanban | undefined}
      onboardingState={onboardingQuery}
      onForceDashboard={() => setForceDashboard(true)}
      relationshipSummary={relationshipQuery}
      routeBase={routeBase}
      rows={rows}
      staffWorkspaceReady={
        !isStaffWorkspace || staffWorkspaceQuery !== undefined
      }
      view={view}
      workosOrganizationId={workosOrganizationId}
    />
  );
}

function BuilderHomeContent({
  isStaffWorkspace,
  kanban,
  onboardingState,
  onForceDashboard,
  relationshipSummary,
  routeBase,
  rows,
  staffWorkspaceReady,
  view,
  workosOrganizationId,
}: {
  isStaffWorkspace: boolean;
  kanban: ProductionKanban | undefined;
  onboardingState:
    | {
        builderProfile?: { displayName: string } | null;
        recovery?: BuilderActivationRecovery;
      }
    | undefined;
  onForceDashboard: () => void;
  relationshipSummary:
    | Parameters<typeof BuilderBrokerRelationshipPending>[0]["summary"]
    | undefined;
  routeBase: "/builder" | "/builder-staff";
  rows: TimelinePlanRow[];
  staffWorkspaceReady: boolean;
  view:
    | "loading"
    | "first-run"
    | "profile-pending"
    | "relationship-pending"
    | "access-recovery"
    | "dashboard";
  workosOrganizationId: string;
}) {
  const navigate = useNavigate();

  if (view === "loading") {
    return <BuilderHomeLoading />;
  }

  if (view === "access-recovery" && onboardingState?.recovery) {
    return (
      <BuilderAccessRecovery
        onRequestHelp={() =>
          navigate({
            search: { reason: "onboarding-required", workspace: "builder" },
            to: "/protected-access",
          })
        }
        onRetry={() => window.location.reload()}
        onSwitchOrganization={() =>
          navigate({
            search: { reason: "missing-organization", workspace: "builder" },
            to: "/protected-access",
          })
        }
        recovery={onboardingState.recovery}
      />
    );
  }

  if (view === "first-run") {
    return (
      <BuilderFirstRun
        builderName={onboardingState?.builderProfile?.displayName ?? "builder"}
        onStart={() => {
          onForceDashboard();
          navigate({ to: "/builder/proposals/new" }).catch(() => undefined);
        }}
        workosOrganizationId={workosOrganizationId}
      />
    );
  }

  if (view === "profile-pending") {
    return <BuilderProfilePending />;
  }

  if (view === "relationship-pending") {
    return relationshipSummary ? (
      <BuilderBrokerRelationshipPending summary={relationshipSummary} />
    ) : (
      <BuilderHomeLoading />
    );
  }

  if (!((isStaffWorkspace || kanban) && staffWorkspaceReady)) {
    return <BuilderHomeLoading />;
  }

  return (
    <BuilderTimelineDashboardSurface
      chrome="embedded"
      liveBuildRoute={`${routeBase}/builds/$buildId`}
      onNavigate={(to, params) => {
        if (to === "/demo/timeline") {
          navigate({ to: "/builder/proposals/new" }).catch(() => undefined);
          return;
        }
        if (params?.draftId) {
          navigate({
            params: { proposalId: params.draftId },
            to: `${routeBase}/proposals/$proposalId` as never,
          }).catch(() => undefined);
          return;
        }
        if (params?.buildId) {
          navigate({
            params: { buildId: params.buildId },
            to: `${routeBase}/builds/$buildId` as never,
          }).catch(() => undefined);
          return;
        }
        navigate({ to: `${routeBase}/proposals` as never }).catch(
          () => undefined
        );
      }}
      personaLabel={isStaffWorkspace ? "Builder staff" : "Production borrower"}
      rows={rows}
      showStartProposalAction={!isStaffWorkspace}
    />
  );
}

function BuilderHomeLoading() {
  return (
    <div className="grid min-h-[24rem] place-items-center">
      <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading builder dashboard...
      </div>
    </div>
  );
}

export function BuilderAccessRecovery({
  onRequestHelp,
  onRetry,
  onSwitchOrganization,
  recovery,
}: {
  onRequestHelp: () => void;
  onRetry: () => void;
  onSwitchOrganization: () => void;
  recovery: BuilderActivationRecovery;
}) {
  const titleByKind: Record<string, string> = {
    "ambiguous-builder-profile": "Builder profile needs repair",
    "missing-broker-assignment": "Broker assignment is incomplete",
    "missing-brokerage": "Brokerage activation is incomplete",
    "missing-builder-profile": "Builder profile is not linked",
    "missing-membership": "Organization membership is missing",
    "missing-organization": "Organization activation is incomplete",
    "projection-failed": "Access projection needs repair",
    "projection-pending": "Access activation is still syncing",
  };
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30 p-4">
      <Frame className="w-full max-w-2xl" data-testid="builder-access-recovery">
        <FramePanel className="grid gap-5 p-5 sm:p-6">
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder access recovery
            </p>
            <FrameTitle>
              {titleByKind[recovery.kind] ?? "Builder workspace is not ready"}
            </FrameTitle>
            <FrameDescription>
              DrawFlow preserved your Builder destination while the responsible
              owner repairs this activation state.
            </FrameDescription>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <RecoveryDetail
              label="Organization"
              value={recovery.organization.name}
            />
            <RecoveryDetail
              label="Organization ID"
              value={recovery.organization.id}
            />
            <RecoveryDetail
              label="Invited email"
              value={recovery.invitedEmail ?? "Not projected"}
            />
            <RecoveryDetail
              label="Required role"
              value={recovery.requiredRole}
            />
            <RecoveryDetail
              label="Invitation"
              value={recovery.invitationStatus}
            />
            <RecoveryDetail
              label="Projection"
              value={recovery.projectionStatus}
            />
            <RecoveryDetail
              label="Responsible owner"
              value={recovery.responsibleOwner}
            />
            <RecoveryDetail
              label="Support reference"
              value={recovery.supportReference}
            />
          </dl>
          <p className="text-muted-foreground text-xs">
            Intended destination:{" "}
            <span className="font-mono">{recovery.intendedDestination}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRetry} type="button">
              Retry status check
            </Button>
            <Button
              onClick={onSwitchOrganization}
              type="button"
              variant="outline"
            >
              Switch organization
            </Button>
            <Button onClick={onRequestHelp} type="button" variant="ghost">
              <LifeBuoy aria-hidden="true" /> Request help
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function RecoveryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function BuilderProfilePending() {
  return (
    <main className="grid min-h-[calc(100svh-1rem)] place-items-center bg-bg-base px-4 py-8">
      <Frame className="w-full max-w-lg">
        <FramePanel className="flex flex-col gap-4 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-warning/16 text-warning-foreground">
            <LifeBuoy className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <FrameTitle className="text-lg">
              Your builder workspace is almost ready
            </FrameTitle>
            <FrameDescription className="text-base">
              Your account is authenticated, but it isn&rsquo;t linked to a
              builder profile yet. Your brokerage finishes this in their
              backoffice. Once they do, your workspace and first build appear
              here automatically.
            </FrameDescription>
          </div>
          <p className="text-muted-foreground text-sm">
            Already expecting access? Ask your broker to confirm your builder
            profile in DrawFlow.
          </p>
        </FramePanel>
      </Frame>
    </main>
  );
}

function BuilderBrokerRelationshipPending({
  summary,
}: {
  summary: {
    brokerage: { displayName: string; workosOrganizationId: string } | null;
    broker: {
      email: string | null;
      name: string | null;
      workosUserId: string;
    } | null;
    recovery: { actionLabel: string; kind: string; message: string } | null;
    relationship: {
      effectiveAt: number | null;
      status: string;
      updatedAt: number | null;
    };
  };
}) {
  const brokerName = summary.broker?.name ?? "Your brokerage";
  const timestamp =
    summary.relationship.updatedAt ?? summary.relationship.effectiveAt;

  return (
    <main className="grid min-h-[calc(100svh-1rem)] place-items-center bg-bg-base px-4 py-8">
      <Frame className="w-full max-w-xl">
        <FramePanel className="flex flex-col gap-4 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-warning/16 text-warning-foreground">
            <LifeBuoy className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <FrameTitle className="text-lg">
              Your builder workspace is waiting on broker confirmation
            </FrameTitle>
            <FrameDescription className="text-base">
              {summary.recovery?.message ??
                "DrawFlow could not confirm your active broker relationship yet."}
            </FrameDescription>
          </div>
          <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Brokerage
              </dt>
              <dd className="font-medium">
                {summary.brokerage?.displayName ?? "Waiting for brokerage"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Broker
              </dt>
              <dd className="font-medium">{brokerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Status
              </dt>
              <dd className="font-medium">
                {formatRelationshipStatus(summary.relationship.status)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Latest update
              </dt>
              <dd className="font-medium">
                {timestamp
                  ? formatRelationshipTimestamp(timestamp)
                  : "Waiting for update"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Need help now? Ask your brokerage to confirm the active broker
              assignment for this builder profile.
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              {summary.recovery?.actionLabel ?? "Retry status check"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function formatRelationshipStatus(status: string) {
  return status
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatRelationshipTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
