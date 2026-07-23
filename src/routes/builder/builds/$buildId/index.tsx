import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import {
  MilestoneExecutionSheetPrototype,
  type MilestonePrototypeVariant,
} from "#/features/backoffice-build-detail/MilestoneExecutionSheet.prototype.tsx";
import {
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
  ProductionBuildDetailSurface,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { canUseAppPermission } from "#/features/builder-staff/app-permissions.ts";
import {
  BuilderStaffPermissionsPanel,
  type StaffDirectory,
} from "#/features/builder-staff/BuilderStaffPermissionsPanel.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  getVisualParityActiveBuildDetail,
  getVisualParityActiveBuildTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export type BuilderBuildSearch = {
  timeframe?: CalendarTimeframe;
  milestone?: string;
  variant?: MilestonePrototypeVariant;
  tab?:
    | "calendar"
    | "contractors"
    | "details"
    | "evidence"
    | "gantt"
    | "materials"
    | "milestones"
    | "staff"
    | "timeline";
  rail?: "open" | "closed";
};

const VISUAL_ACTIVE_BUILD_STAFF_DIRECTORY: StaffDirectory = {
  actions: ["create", "view", "update", "delete"],
  canManage: true,
  resources: [
    "milestone",
    "submilestone",
    "draw",
    "evidence",
    "contractor",
    "material",
    "capitalEvent",
    "reminder",
  ],
  scope: "activeBuild",
  staff: [
    {
      builderAccountLinkId: "visual-owner-link",
      email: "connor@oakline.example",
      identityStatus: "active",
      mode: "full",
      name: "Connor Belezney",
      permissions: [],
      role: "owner",
      status: "active",
      workosUserId: "visual-owner",
    },
    {
      builderAccountLinkId: "visual-staff-link",
      email: "maya@oakline.example",
      identityStatus: "active",
      mode: "limited",
      name: "Maya Chen",
      permissions: [
        {
          canCreate: true,
          canDelete: false,
          canUpdate: true,
          canView: true,
          resourceType: "milestone",
        },
        {
          canCreate: true,
          canDelete: false,
          canUpdate: true,
          canView: true,
          resourceType: "evidence",
        },
        {
          canCreate: false,
          canDelete: false,
          canUpdate: false,
          canView: true,
          resourceType: "draw",
        },
      ],
      role: "staff",
      status: "active",
      workosUserId: "visual-staff",
    },
  ],
};

export const Route = createFileRoute("/builder/builds/$buildId/")({
  validateSearch: (search: Record<string, unknown>): BuilderBuildSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "evidence" ||
      search.tab === "contractors" ||
      search.tab === "milestones" ||
      search.tab === "materials" ||
      search.tab === "staff" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuilderBuildSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const variant =
      search.variant === "ledger" ||
      search.variant === "console" ||
      search.variant === "field-walk"
        ? (search.variant as MilestonePrototypeVariant)
        : undefined;
    const rail =
      search.rail === "closed" || search.rail === "open"
        ? (search.rail as BuilderBuildSearch["rail"])
        : undefined;
    const timeframe =
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month" ||
      search.timeframe === "quarter" ||
      search.timeframe === "agenda"
        ? (search.timeframe as CalendarTimeframe)
        : undefined;
    return {
      ...(timeframe ? { timeframe } : {}),
      ...(milestone ? { milestone } : {}),
      ...(rail ? { rail } : {}),
      ...(tab ? { tab } : {}),
      ...(variant ? { variant } : {}),
    };
  },
  component: BuilderBuildRoute,
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createBuilderDrawClientOperationId(input: {
  amountCents: number;
  buildId: Id<"activeBuilds">;
  drawKey: string;
}) {
  return `builder-draw:${await sha256Hex(
    [String(input.buildId), input.drawKey, String(input.amountCents)].join("|")
  )}`;
}

function BuilderBuildRoute() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <BuilderBuildWorkspaceRoute
      buildId={buildId}
      enableContractorLinks
      includeStaffTab
      routeBase="/builder"
      search={search}
      workosOrganizationId={context.organizationId as string}
    />
  );
}

type BuilderBuildAvailability =
  | {
      buildName?: string;
      category: "accessDenied" | "available" | "invalidLink" | "notFound";
      requestedBuildId: string;
    }
  | undefined;

export function createBuildAvailabilityReference(input: {
  buildId: string;
  category?: "accessDenied" | "available" | "invalidLink" | "notFound";
}): string {
  let hash = 0;
  for (const character of `${input.category ?? "checking"}|${input.buildId}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2_147_483_647;
  }
  return `BLD-${hash.toString(36).toUpperCase().padStart(7, "0")}`;
}

function BuilderBuildUnavailable({
  availability,
  buildId,
  onBack,
  onRetry,
}: {
  availability: BuilderBuildAvailability;
  buildId: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  const supportReference = createBuildAvailabilityReference({
    buildId,
    category: availability?.category,
  });
  const responsibleOwner =
    availability?.category === "accessDenied"
      ? "Build owner or organization administrator"
      : "DrawFlow Support";
  const content =
    availability?.category === "invalidLink"
      ? {
          description:
            "This link does not contain a valid active Build ID. Return to Live Builds and open the Build from an access-validated row.",
          label: "Invalid build link",
          title: "Build link is invalid",
        }
      : availability?.category === "accessDenied"
        ? {
            description:
              "This Build exists, but it is not assigned to your current workspace. Ask the Build owner to review your access, or return to your accessible Live Builds.",
            label: "Access unavailable",
            title: "Build access unavailable",
          }
        : availability?.category === "available"
          ? {
              description:
                "The Build is available, but its workspace did not finish loading. Try again before returning to Live Builds.",
              label: "Temporary loading issue",
              title: "Build workspace did not load",
            }
          : availability?.category === "notFound"
            ? {
                description:
                  "The active Build record is no longer available. It may have been removed after this link was created.",
                label: "Record not found",
                title: "Build no longer available",
              }
            : {
                description:
                  "DrawFlow is checking whether this Build is available to your workspace.",
                label: "Checking availability",
                title: "Checking Build access",
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
          </div>
          <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Support reference</dt>
              <dd className="font-mono text-xs">{supportReference}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Responsible owner</dt>
              <dd className="text-right font-medium">{responsibleOwner}</dd>
            </div>
            {availability?.buildName ? (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Build</dt>
                <dd className="font-medium">{availability.buildName}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRetry} type="button">
              Try again
            </Button>
            <Button onClick={onBack} type="button" variant="outline">
              Back to live builds
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

export function BuilderBuildWorkspaceRoute({
  buildId,
  enableContractorLinks,
  includeStaffTab,
  routeBase,
  search,
  workosOrganizationId,
}: {
  buildId: string;
  enableContractorLinks: boolean;
  includeStaffTab: boolean;
  routeBase: "/builder" | "/builder-staff";
  search: BuilderBuildSearch;
  workosOrganizationId: string;
}) {
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const productionBuildQuery = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId,
        }
  );
  const effectiveProductionBuild = visualFixtureEnabled
    ? getVisualParityActiveBuildDetail(buildId)
    : productionBuildQuery;
  const activeBuildIdForWorkspace = effectiveProductionBuild?.build?._id as any;
  const timelineWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildTimelineWorkspace,
    visualFixtureEnabled
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId,
          }
        : "skip"
  );
  const effectiveTimelineWorkspace = visualFixtureEnabled
    ? getVisualParityActiveBuildTimelineWorkspace(buildId)
    : timelineWorkspaceQuery;
  const calendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildCalendarWorkspace,
    visualFixtureEnabled
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId,
          }
        : "skip"
  );
  const availabilityQuery = useQuery(
    (api as any).production_proposals.getActiveBuildRouteAvailabilityByString,
    visualFixtureEnabled || productionBuildQuery !== null
      ? "skip"
      : { buildId, workosOrganizationId }
  );
  const effectiveAvailability = visualFixtureEnabled
    ? {
        category: "notFound" as const,
        requestedBuildId: buildId,
      }
    : availabilityQuery;
  const requestDraw = useMutation(
    api.production_proposals.requestActiveBuildDraw
  );
  const withdrawDraw = useMutation(
    api.production_proposals.withdrawActiveBuildDraw
  );
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange
  );
  const requestBudgetRevision = useMutation(
    (api as any).production_proposals.requestActiveBuildBudgetRevision
  );
  const assignContractorToMilestone = useMutation(
    (api as any).production_proposals.assignActiveBuildContractorToMilestone
  );
  const removeContractorFromMilestone = useMutation(
    api.production_proposals.removeActiveBuildContractorFromMilestone
  );
  const attachAndInviteContractor = useMutation(
    (api as any).production_proposals.attachAndInviteActiveBuildContractor
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor
  );
  const createAndAttachContractor = useMutation(
    api.production_proposals.createAndAttachActiveBuildContractor
  );
  const sendContractorInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );
  const submitMilestoneCompletion = useMutation(
    (api as any).production_proposals.submitActiveBuildMilestoneCompletion
  );
  const startMilestoneWork = useMutation(
    (api as any).production_proposals.startActiveBuildMilestone
  );
  const updateSubmilestoneExecution = useMutation(
    (api as any).production_proposals.updateActiveBuildSubmilestoneExecution
  );
  const generateEvidenceUploadUrl = useMutation(
    (api as any).production_proposals.generateActiveBuildEvidenceUploadUrl
  );
  const createEvidenceAsset = useMutation(
    (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset
  );

  const onChangeTab = (tab: BuildDetailSubTab) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, tab },
      to: `${routeBase}/builds/$buildId`,
    } as never);
  const onChangeRail = (rail: "open" | "closed") =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, rail },
      to: `${routeBase}/builds/$buildId`,
    } as never);
  const onChangeMilestone = (milestone?: string) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, milestone },
      to: `${routeBase}/builds/$buildId`,
    } as never);
  const onChangeCalendarTimeframe = (timeframe: CalendarTimeframe) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, timeframe },
      to: `${routeBase}/builds/$buildId`,
    } as never);
  const onChangePrototypeVariant = (variant?: MilestonePrototypeVariant) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, variant },
      to: `${routeBase}/builds/$buildId`,
    } as never);

  if (effectiveProductionBuild === undefined) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <Frame>
          <FramePanel className="p-4 text-sm">
            Loading build detail...
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (!effectiveProductionBuild) {
    return (
      <BuilderBuildUnavailable
        availability={effectiveAvailability}
        buildId={buildId}
        onBack={() => navigate({ to: `${routeBase}/builds` as never })}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const detail = effectiveProductionBuild as ProductionBuildDetail;
  const activeBuildId = detail.build._id as any;
  const appPermissions = detail.appPermissions;
  const actions: ProductionBuildDetailActions = {
    assignContractorToMilestone: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({
          assignmentCost,
          contractorId,
          milestoneKey,
          role,
          submilestoneKeys,
        }) =>
          assignContractorToMilestone({
            ...assignmentCost,
            buildId: activeBuildId,
            contractorId: contractorId as Id<"contractorProfiles">,
            milestoneKey,
            role,
            submilestoneKeys,
            workosOrganizationId,
          })
      : undefined,
    removeContractorFromMilestone: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({ contractorId, milestoneKey, reason, submilestoneKey }) =>
          removeContractorFromMilestone({
            buildId: activeBuildId,
            contractorId: contractorId as Id<"contractorProfiles">,
            milestoneKey,
            reason,
            submilestoneKey,
            workosOrganizationId,
          })
      : undefined,
    attachAndInviteContractor:
      canUseAppPermission(appPermissions, "contractor", "create") &&
      canUseAppPermission(appPermissions, "contractor", "update")
        ? ({ contractorId, role }) =>
            attachAndInviteContractor({
              buildId: activeBuildId,
              contractorId: contractorId as Id<"contractorProfiles">,
              role,
              workosOrganizationId,
            })
        : undefined,
    attachContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({ contractorId, role }) =>
          attachContractor({
            buildId: activeBuildId,
            contractorId: contractorId as any,
            role,
            workosOrganizationId,
          })
      : undefined,
    createAndAttachContractor:
      canUseAppPermission(appPermissions, "contractor", "create") &&
      canUseAppPermission(appPermissions, "contractor", "update")
        ? ({ contractor, role }) =>
            createAndAttachContractor({
              buildId: activeBuildId,
              contractor,
              role,
              workosOrganizationId,
            })
        : undefined,
    createAndAssignContractor:
      canUseAppPermission(appPermissions, "contractor", "create") &&
      canUseAppPermission(appPermissions, "contractor", "update")
        ? async ({
            assignmentCost,
            contractor,
            milestoneKey,
            role,
            submilestoneKeys,
          }) => {
            const { contractorId } = await createAndAttachContractor({
              buildId: activeBuildId,
              contractor,
              role,
              workosOrganizationId,
            });
            await assignContractorToMilestone({
              ...assignmentCost,
              buildId: activeBuildId,
              contractorId,
              milestoneKey,
              role,
              submilestoneKeys,
              workosOrganizationId,
            });
            return contractorId;
          }
        : undefined,
    inviteContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "create"
    )
      ? (contractorId) =>
          sendContractorInvite({
            contractorId: contractorId as Id<"contractorProfiles">,
            workosOrganizationId,
          })
      : undefined,
    requestDraw: canUseAppPermission(appPermissions, "draw", "update")
      ? async (draw) =>
          requestDraw({
            amountCents: draw.amountCents,
            buildId: activeBuildId,
            clientOperationId: await createBuilderDrawClientOperationId({
              amountCents: draw.amountCents,
              buildId: activeBuildId,
              drawKey: draw.drawKey,
            }),
            drawKey: draw.drawKey,
            note: "Requested from builder build workspace.",
            workosOrganizationId,
          })
      : undefined,
    requestDrawAmount: canUseAppPermission(appPermissions, "draw", "update")
      ? (input) =>
          requestDraw({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    withdrawDraw: canUseAppPermission(appPermissions, "draw", "update")
      ? (drawKey) =>
          withdrawDraw({
            buildId: activeBuildId,
            drawKey,
            note: "Withdrawn from builder build workspace.",
            workosOrganizationId,
          })
      : undefined,
    requestFacilityChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestFacilityChange({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    requestBudgetRevision: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestBudgetRevision({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    requestLoanFacilityDateChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestFacilityChange({
            reason: input.reason,
            requestedPaybackDate: input.requestedPaybackDate,
            requestType: "paybackExtension",
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    startMilestoneWork: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
      ? ({ milestoneKey, note }) =>
          startMilestoneWork({
            buildId: activeBuildId,
            milestoneKey,
            note,
            workosOrganizationId,
          })
      : undefined,
    submitMilestoneCompletion:
      canUseAppPermission(appPermissions, "milestone", "update") &&
      canUseAppPermission(appPermissions, "evidence", "update")
        ? ({ actualCostCents, completedDay, milestoneKey, note }) =>
            submitMilestoneCompletion({
              actualCostCents,
              buildId: activeBuildId,
              completedDay: completedDay ?? 0,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
    updateSubmilestoneExecution: canUseAppPermission(
      appPermissions,
      "submilestone",
      "update"
    )
      ? (input) =>
          updateSubmilestoneExecution({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    uploadSubmilestoneEvidence: canUseAppPermission(
      appPermissions,
      "evidence",
      "create"
    )
      ? async ({ file, locationVerified, milestoneKey, submilestoneKey }) => {
          const uploadFile = await normalizeEvidenceFileForUpload(file);
          const uploadUrl = await generateEvidenceUploadUrl({
            buildId: activeBuildId,
            workosOrganizationId,
          });
          const response = await fetch(uploadUrl, {
            body: uploadFile,
            headers: {
              "Content-Type": uploadFile.type || "application/octet-stream",
            },
            method: "POST",
          });
          if (!response.ok) {
            throw new Error("Evidence upload failed.");
          }
          const payload = (await response.json()) as { storageId: string };
          return createEvidenceAsset({
            asset: {
              evidenceKey: `builder-${submilestoneKey}-${crypto.randomUUID()}`,
              fileName: uploadFile.name,
              label: uploadFile.name,
              locationVerified,
              milestoneKey,
              mimeType: uploadFile.type || "application/octet-stream",
              sizeBytes: uploadFile.size,
              source: "builder_milestone_execution_sheet",
              storageId: payload.storageId,
              submilestoneKey,
              tag: locationVerified
                ? "Builder completion evidence"
                : "Location unverified evidence",
            },
            buildId: activeBuildId,
            workosOrganizationId,
          });
        }
      : undefined,
  } as ProductionBuildDetailActions;

  return (
    <>
      <ProductionBuildDetailSurface
        actions={actions}
        activeBuildId={activeBuildId}
        activeTab={search.tab ?? "details"}
        breadcrumbRootHref={routeBase}
        breadcrumbRootLabel="Builder"
        breadcrumbSectionHref={`${routeBase}/builds`}
        breadcrumbSectionLabel="Live Builds"
        calendarTimeframe={search.timeframe}
        calendarWorkspace={calendarWorkspaceQuery as any}
        contractorDetailHrefFor={
          enableContractorLinks
            ? (contractorId) =>
                `/builder/contractors/${contractorId}?fromBuildId=${buildId}`
            : undefined
        }
        detail={detail}
        fundingWorkspaceEnabled
        milestoneKey={search.variant ? undefined : search.milestone}
        onChangeCalendarTimeframe={onChangeCalendarTimeframe}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={onChangeRail}
        onChangeTab={onChangeTab}
        rail={search.rail}
        staff={
          includeStaffTab ? (
            <BuilderStaffPermissionsPanel
              buildId={activeBuildId as Id<"activeBuilds">}
              fixtureDirectory={
                visualFixtureEnabled
                  ? VISUAL_ACTIVE_BUILD_STAFF_DIRECTORY
                  : undefined
              }
              scope="activeBuild"
              workosOrganizationId={workosOrganizationId}
            />
          ) : undefined
        }
        timelineWorkspace={effectiveTimelineWorkspace as any}
        viewerRole="builder"
        visibleTabs={
          includeStaffTab
            ? undefined
            : [
                "details",
                "milestones",
                "contractors",
                "materials",
                "timeline",
                "evidence",
                "calendar",
                "gantt",
              ]
        }
        workosOrganizationId={workosOrganizationId}
      />
      {import.meta.env.DEV && search.variant ? (
        <MilestoneExecutionSheetPrototype
          detail={detail}
          milestoneKey={search.milestone}
          onExit={() => onChangePrototypeVariant(undefined)}
          onVariantChange={onChangePrototypeVariant}
          variant={search.variant}
        />
      ) : null}
    </>
  );
}
