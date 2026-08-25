/**
 * Production proposals backoffice proposal views bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { hasAssignableBrokerRole } from "../brokerAssignments";
import { withQueryTiming } from "../fluent";
import { type Doc, type Id } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { emptyProposalKanbanColumns } from "./audit_helpers.js";
import { authorizeBrokerage, resolveBrokerageScope } from "./authorization_core.js";
import { getWorkosUserById } from "./builder_staff_access.js";
import { canReadBackofficeProposal, requireAnyRole, normalizeOptionalString, normalizeIsoDateOnly } from "./contractor_policy_helpers.js";
import { PROPOSAL_COLUMNS, BACKOFFICE_ROLES, APPROVER_ROLES, BACKOFFICE_DASHBOARD_ACTIVE_BUILDS_LIMIT, BACKOFFICE_DASHBOARD_MILESTONES_PER_BUILD, BACKOFFICE_DASHBOARD_PLANNED_DRAWS_PER_BUILD, BACKOFFICE_DASHBOARD_DRAW_REQUESTS_PER_BUILD, BACKOFFICE_DASHBOARD_EVIDENCE_SCAN_PER_BUILD, BACKOFFICE_DASHBOARD_STORAGE_URL_CAP, BACKOFFICE_BUILDER_OPTIONS_LIMIT, proposalDirectoryFiltersValidator, proposalDirectoryCardValidator } from "./contracts_foundation.js";
import { withBorrowerStartingCash, productionProposalDirectoryCard, productionProposalDirectoryMatchContext, proposalDirectoryCardMatches, productionDashboardProposalCard, productionProposalColumnDescription, productionBuildDisplayId, productionQueueAgeLabel } from "./directory_cards.js";
import { titleCase } from "./legacy_seed.js";
import { operationsHandoffProjection } from "./operations_helpers.js";
import { builderAccountSummaries, preferredBuilderAccountEmail, isBackoffice } from "./proposal_claim.js";
import { productionDaysActive, productionBuildDashboardStatus, productionBuildStatusLabel, productionMilestoneState, productionMilestoneNeedsBackofficeReview, productionMilestoneColumn, productionMilestoneIsBehindSchedule, productionMilestoneDueLabel, productionMilestonePriority, centsToCurrency } from "./roster_projection_helpers.js";
import { createStorageUrlResolver, visibleBuilderCards, buildAdminBuilderStaffWorkspace, buildBuilderStaffWorkspace, builderStaffActiveBuildWorkspaceRow, visibleBackofficeCards, visibleBackofficeDashboardProposalRows } from "./storage_helpers.js";

export const listProposalKanban = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!scope.brokerage) {
      requireAnyRole(scope.roles, BACKOFFICE_ROLES);
      return {
        columns: emptyProposalKanbanColumns(),
        provisioningRequired: true,
      };
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const cards = isBackoffice(auth.roles)
      ? await visibleBackofficeCards(ctx, auth)
      : await visibleBuilderCards(ctx, auth);
    const enriched = await Promise.all(
      cards.map(async (card) => {
        const proposal = await ctx.db.get(card.proposalId);
        const linkedBuild = proposal?.activeBuildId
          ? await ctx.db.get(proposal.activeBuildId)
          : null;
        const accessibleBuild =
          linkedBuild &&
          proposal &&
          linkedBuild.proposalId === proposal._id &&
          linkedBuild.brokerageId === auth.brokerage._id &&
          linkedBuild.organizationId === args.workosOrganizationId
            ? linkedBuild
            : null;
        const activeBuildRow = accessibleBuild
          ? await builderStaffActiveBuildWorkspaceRow(
              ctx,
              auth.brokerage,
              accessibleBuild._id,
            )
          : null;
        return {
          ...card,
          ...activeBuildRow,
          activeBuildId: accessibleBuild
            ? String(accessibleBuild._id)
            : undefined,
          budgetGovernance: activeBuildRow?.budgetGovernance ?? null,
          builderAssigned: Boolean(proposal?.builderProfileId),
        };
      }),
    );
    return {
      columns: PROPOSAL_COLUMNS.map((id) => ({
        cards: enriched.filter((card) => card.column === id),
        id,
        name: titleCase(id),
      })),
    };
  })
  .public();

export const listBackofficeProposalDirectory = authenticatedQuery
  .use(withQueryTiming("production_proposals.listBackofficeProposalDirectory"))
  .input({
    filters: v.optional(proposalDirectoryFiltersValidator),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(paginationResultValidator(proposalDirectoryCardValidator))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    requireAnyRole(scope.roles, BACKOFFICE_ROLES);
    if (!scope.brokerage) {
      return {
        continueCursor: args.paginationOpts.cursor ?? "",
        isDone: true,
        page: [],
      };
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));
    const page = await ctx.db
      .query("proposalKanbanCards")
      .withIndex("by_brokerage_column_sort", (q) =>
        q.eq("brokerageId", auth.brokerage._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const projected = await Promise.all(
      page.page.map(async (card) => {
        const proposal = await ctx.db.get(card.proposalId);
        if (
          !proposal ||
          !(canReadBackofficeProposal(auth, proposal) || staffCanRead)
        ) {
          return null;
        }
        const { attachedBuilder, card: directoryCard } =
          await productionProposalDirectoryMatchContext(ctx, proposal);
        return proposalDirectoryCardMatches({
          attachedBuilder,
          card: directoryCard,
          filters: args.filters,
          proposal,
          search: args.search,
        })
          ? directoryCard
          : null;
      }),
    );
    return {
      ...page,
      page: projected.filter(
        (card): card is NonNullable<typeof card> => card !== null,
      ),
    };
  })
  .public();

export const listBackofficeProposalFilterOptions = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      brokers: v.array(
        v.object({
          email: v.optional(v.string()),
          isPrincipal: v.boolean(),
          name: v.string(),
          workosUserId: v.string(),
        }),
      ),
      builders: v.array(
        v.object({
          _id: v.id("builderProfiles"),
          displayName: v.string(),
          email: v.optional(v.string()),
          workosUserIds: v.array(v.string()),
        }),
      ),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const [builderProfiles, memberships] = await Promise.all([
      ctx.db
        .query("builderProfiles")
        .withIndex("by_brokerage_and_status", (q) =>
          q.eq("brokerageId", auth.brokerage._id).eq("status", "active"),
        )
        .take(BACKOFFICE_BUILDER_OPTIONS_LIMIT),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (q) =>
          q.eq("workosOrganizationId", auth.brokerage.workosOrganizationId),
        )
        .collect(),
    ]);
    const builders = await Promise.all(
      builderProfiles.map(async (builder) => {
        const accounts = await builderAccountSummaries(ctx, builder._id);
        const email = preferredBuilderAccountEmail(accounts);
        return {
          _id: builder._id,
          displayName: builder.displayName,
          ...(email ? { email } : {}),
          workosUserIds: accounts.map((account) => account.workosUserId),
        };
      }),
    );
    const seenBrokerIds = new Set<string>();
    const brokers = [];
    for (const membership of memberships) {
      if (
        membership.status !== "active" ||
        !hasAssignableBrokerRole(membership) ||
        seenBrokerIds.has(membership.workosUserId)
      ) {
        continue;
      }
      const broker = await getWorkosUserById(ctx, membership.workosUserId);
      if (broker?.status !== "active") {
        continue;
      }
      seenBrokerIds.add(membership.workosUserId);
      const email = normalizeOptionalString(broker.email);
      const name =
        [broker.firstName, broker.lastName]
          .filter((part): part is string => Boolean(part?.trim()))
          .join(" ")
          .trim() ||
        normalizeOptionalString(broker.name) ||
        email ||
        membership.workosUserId;
      brokers.push({
        ...(email ? { email } : {}),
        isPrincipal:
          membership.workosUserId ===
            auth.brokerage.principalBrokerWorkosUserId ||
          Boolean(
            email &&
            auth.brokerage.principalBrokerEmail &&
            email.toLowerCase() ===
              auth.brokerage.principalBrokerEmail.toLowerCase(),
          ),
        name,
        workosUserId: membership.workosUserId,
      });
    }
    return {
      brokers: brokers.sort((a, b) => {
        if (a.isPrincipal !== b.isPrincipal) {
          return a.isPrincipal ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
      builders: builders.sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    };
  })
  .public();

export const listBuilderStaffWorkspace = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    if (auth.roles.includes("admin")) {
      return await buildAdminBuilderStaffWorkspace(ctx, {
        brokerage: auth.brokerage,
      });
    }
    requireAnyRole(auth.roles, ["builder-staff"]);
    return await buildBuilderStaffWorkspace(ctx, {
      auth,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const getBackofficeDashboard = authenticatedQuery
  .use(withQueryTiming("production_proposals.getBackofficeDashboard"))
  .input({
    asOfDate: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const asOfDate = args.asOfDate
      ? normalizeIsoDateOnly(args.asOfDate, "Dashboard as-of date")
      : new Date().toISOString().slice(0, 10);
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));

    // Phase 2B: return shaped card summaries only (see activeBuilds / drawRequests /
    // milestones below). Nested collections are scanned server-side and never shipped.
    const proposalRows = await visibleBackofficeDashboardProposalRows(
      ctx,
      auth,
      staffCanRead,
    );

    const activeBuildRows = await ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(BACKOFFICE_DASHBOARD_ACTIVE_BUILDS_LIMIT);
    type VisibleActiveBuild = {
      build: Doc<"activeBuilds">;
      builder: Doc<"builderProfiles"> | null;
      drawRequests: Doc<"activeBuildDrawRequests">[];
      firstImageStorageId: Id<"_storage"> | null;
      plannedDraws: Doc<"plannedDrawScheduleRows">[];
      milestones: Doc<"buildMilestones">[];
      proposal: Doc<"buildProposals">;
    };

    // Batch proposal + builder lookups once (avoids N+1 per active build).
    const uniqueProposalIds = [
      ...new Set(activeBuildRows.map((build) => build.proposalId)),
    ];
    const uniqueBuilderIds = [
      ...new Set(activeBuildRows.map((build) => build.builderProfileId)),
    ];
    const [proposalDocs, builderDocs] = await Promise.all([
      Promise.all(uniqueProposalIds.map((id) => ctx.db.get(id))),
      Promise.all(uniqueBuilderIds.map((id) => ctx.db.get(id))),
    ]);
    const proposalById = new Map(
      proposalDocs.flatMap((proposal) =>
        proposal ? [[proposal._id, proposal] as const] : [],
      ),
    );
    const builderById = new Map(
      builderDocs.flatMap((builder) =>
        builder ? [[builder._id, builder] as const] : [],
      ),
    );

    const projectedActiveBuilds = await Promise.all(
      activeBuildRows.map(async (build): Promise<VisibleActiveBuild | null> => {
        const proposal = proposalById.get(build.proposalId);
        if (!proposal) {
          return null;
        }
        if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
          return null;
        }
        const [milestones, plannedDraws, drawRequests, evidence] =
          await Promise.all([
            ctx.db
              .query("buildMilestones")
              .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
              .take(BACKOFFICE_DASHBOARD_MILESTONES_PER_BUILD),
            ctx.db
              .query("plannedDrawScheduleRows")
              .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
              .take(BACKOFFICE_DASHBOARD_PLANNED_DRAWS_PER_BUILD),
            ctx.db
              .query("activeBuildDrawRequests")
              .withIndex("by_build", (q) => q.eq("buildId", build._id))
              .take(BACKOFFICE_DASHBOARD_DRAW_REQUESTS_PER_BUILD),
            ctx.db
              .query("buildEvidenceAssets")
              .withIndex("by_build", (q) => q.eq("buildId", build._id))
              .take(BACKOFFICE_DASHBOARD_EVIDENCE_SCAN_PER_BUILD),
          ]);
        const firstImage = evidence.find(
          (asset) => asset.storageId && asset.mimeType.startsWith("image/"),
        );
        return {
          build,
          builder: builderById.get(build.builderProfileId) ?? null,
          drawRequests,
          firstImageStorageId: firstImage?.storageId ?? null,
          milestones,
          plannedDraws,
          proposal: withBorrowerStartingCash(proposal),
        };
      }),
    );
    const visibleActiveBuilds = projectedActiveBuilds.filter(
      (row): row is VisibleActiveBuild => row !== null,
    );

    const resolveStorageUrl = createStorageUrlResolver(
      ctx,
      BACKOFFICE_DASHBOARD_STORAGE_URL_CAP,
    );

    const activeBuilds = await Promise.all(
      visibleActiveBuilds.map(
        async ({
          build,
          builder,
          drawRequests,
          firstImageStorageId,
          milestones,
          plannedDraws,
        }) => {
          const currentDay = productionDaysActive(build.startDate, asOfDate);
          const milestonesBehindSchedule = milestones.filter((milestone) =>
            productionMilestoneIsBehindSchedule(milestone, currentDay),
          ).length;
          const activeMilestone =
            milestones.find((milestone) => milestone.status !== "complete") ??
            milestones[0];
          return {
            activeMilestone:
              activeMilestone?.name ?? `${milestones.length} milestones`,
            address: build.location,
            buildKey: String(build._id),
            buildName: build.buildName,
            builder: builder?.displayName ?? "Builder",
            daysActive: currentDay,
            drawCount: plannedDraws.length,
            href: `/backoffice/builds/${build._id}`,
            id: productionBuildDisplayId(build),
            imageUrl: await resolveStorageUrl(firstImageStorageId),
            locationLatitude: build.locationLatitude,
            locationLongitude: build.locationLongitude,
            milestoneCount: milestones.length,
            milestonesBehindSchedule,
            milestoneState: activeMilestone
              ? productionMilestoneState(activeMilestone.status)
              : "backlog",
            pendingDrawRequestCount: drawRequests.filter(
              (request) => request.status === "requested",
            ).length,
            status:
              milestonesBehindSchedule > 0
                ? ("behind" as const)
                : productionBuildDashboardStatus(build.status),
            statusLabel:
              milestonesBehindSchedule > 0
                ? `${milestonesBehindSchedule} ${milestonesBehindSchedule === 1 ? "milestone" : "milestones"} behind schedule`
                : productionBuildStatusLabel(build.status),
          };
        },
      ),
    );

    const drawRequests = visibleActiveBuilds.flatMap(
      ({ build, drawRequests, plannedDraws }) => {
        const plannedDrawsByKey = new Map(
          plannedDraws.map((draw) => [draw.drawKey, draw]),
        );
        return drawRequests
          .filter((request) => request.status === "requested")
          .map((request) => {
            const plannedDraw = request.plannedDrawKey
              ? plannedDrawsByKey.get(request.plannedDrawKey)
              : undefined;
            return {
              address: build.location,
              buildId: productionBuildDisplayId(build),
              buildKey: String(build._id),
              eligibleDate: plannedDraw
                ? `Day ${plannedDraw.timingDay}`
                : request.requestedAt.slice(0, 10),
              href: `/backoffice/builds/${build._id}`,
              id: String(request._id),
              label: request.label,
              requestedAmount: centsToCurrency(request.amountCents),
              statusLabel: "Requested",
            };
          });
      },
    );

    const milestones = visibleActiveBuilds.flatMap(({ build, milestones }) => {
      const currentDay = productionDaysActive(build.startDate, asOfDate);
      return milestones
        .filter(
          (milestone) =>
            productionMilestoneNeedsBackofficeReview(milestone) ||
            productionMilestoneIsBehindSchedule(milestone, currentDay),
        )
        .map((milestone) => ({
          address: build.location,
          buildId: productionBuildDisplayId(build),
          buildKey: String(build._id),
          column: productionMilestoneColumn(milestone, currentDay),
          dueLabel: productionMilestoneDueLabel(milestone, currentDay),
          href: `/backoffice/builds/${build._id}?milestone=${milestone.key}`,
          id: String(milestone._id),
          milestoneKey: milestone.key,
          name: milestone.name,
          priority: productionMilestonePriority(milestone, currentDay),
        }));
    });

    const proposals = proposalRows.map(({ card, proposal }) =>
      productionDashboardProposalCard(card, proposal),
    );
    const [submittedProposals, approvedPendingClosing] = await Promise.all([
      Promise.all(
        proposalRows
          .filter(
            ({ proposal }) =>
              proposal.status === "submitted" &&
              proposal.reviewOutcome !== "rejected",
          )
          .map(async ({ card, proposal }) =>
            productionDashboardProposalCard(
              card,
              proposal,
              await productionProposalDirectoryCard(ctx, proposal),
            ),
          ),
      ),
      Promise.all(
        proposalRows
          .filter(
            ({ proposal }) =>
              proposal.status === "approved" &&
              proposal.activeBuildId === undefined,
          )
          .map(async ({ card, proposal }) =>
            productionDashboardProposalCard(
              card,
              proposal,
              await productionProposalDirectoryCard(ctx, proposal),
            ),
          ),
      ),
    ]);

    const proposalColumns = PROPOSAL_COLUMNS.map((id) => ({
      description: productionProposalColumnDescription(id, proposals),
      id,
      name: titleCase(id),
    }));
    const milestoneColumns = [
      {
        description: "Builder marked complete; triage",
        id: "backlog",
        name: "Backlog",
      },
      {
        description: "Visit ordered or requested",
        id: "needsSiteVisit",
        name: "Needs site visit",
      },
      {
        description: "Visit picked up and scheduled",
        id: "inProgress",
        name: "In progress",
      },
      {
        description: "Planned finish date has passed",
        id: "behindSchedule",
        name: "Behind schedule",
      },
      {
        description: "Pending staff approval",
        id: "inReview",
        name: "In review",
      },
    ];
    const proposalQuickActions = proposalRows.flatMap(({ proposal }) => {
      const ownerLabel = proposal.assignedBrokerWorkosUserId
        ? "Assigned broker"
        : "Unassigned";
      if (
        proposal.status === "submitted" &&
        proposal.reviewOutcome !== "rejected"
      ) {
        return [
          {
            actionLabel: "Review proposal",
            address: proposal.location,
            ageLabel: productionQueueAgeLabel(
              proposal.submittedAt ?? proposal.updatedAt,
              asOfDate,
            ),
            authorityLabel: "Lender Admin decision",
            blocker: "Awaiting underwriting decision",
            buildId: proposal.buildName,
            dueLabel: "Decision pending",
            entityLabel: proposal.buildName,
            href: `/backoffice/proposals/${proposal._id}`,
            id: `proposal-review:${proposal._id}`,
            ownerLabel,
            recommendationLabel: "Review submission and record a decision",
            title: "Proposal awaiting decision",
            type: "proposal" as const,
          },
        ];
      }
      if (proposal.status === "approved" && !proposal.activeBuildId) {
        return [
          {
            actionLabel: "Record closing",
            address: proposal.location,
            ageLabel: productionQueueAgeLabel(
              proposal.approvedAt ?? proposal.updatedAt,
              asOfDate,
            ),
            authorityLabel: "Lender Admin authority",
            blocker: "Approved loan has not been recorded as closed",
            buildId: proposal.buildName,
            dueLabel: "Closing pending",
            entityLabel: proposal.buildName,
            href: `/backoffice/proposals/${proposal._id}`,
            id: `proposal-closing:${proposal._id}`,
            ownerLabel,
            recommendationLabel: "Confirm closing package and build start date",
            title: "Approved proposal pending closing",
            type: "proposal" as const,
          },
        ];
      }
      return [];
    });
    const operationsHandoffs = await ctx.db
      .query("operationsQueueHandoffs")
      .withIndex("by_organization_updated", (q) =>
        q.eq("organizationId", args.workosOrganizationId),
      )
      .order("desc")
      .take(200);
    const latestHandoffByQueueItem = new Map<
      string,
      Doc<"operationsQueueHandoffs">
    >();
    for (const handoff of operationsHandoffs) {
      if (
        handoff.brokerageId === auth.brokerage._id &&
        !latestHandoffByQueueItem.has(handoff.queueItemId)
      ) {
        latestHandoffByQueueItem.set(handoff.queueItemId, handoff);
      }
    }

    const activeBuildQuickActions = visibleActiveBuilds.flatMap(
      ({ build, builder, drawRequests, milestones }) => {
        const staleBuildAction =
          build.status === "future_start" && build.startDate < asOfDate
            ? [
                {
                  actionLabel: "Open build",
                  address: build.location,
                  ageLabel: productionQueueAgeLabel(build.updatedAt, asOfDate),
                  authorityLabel: "Operations follow-up",
                  blocker: "Scheduled start date has passed",
                  buildId: productionBuildDisplayId(build),
                  dueLabel: `Start ${build.startDate}`,
                  entityLabel: build.buildName,
                  href: `/backoffice/builds/${build._id}`,
                  id: `build-stale:${build._id}`,
                  ownerLabel: builder
                    ? `Builder: ${builder.displayName}`
                    : "Unassigned",
                  recommendationLabel:
                    "Confirm start status or update the schedule",
                  title: "Build start status needs confirmation",
                  type: "build" as const,
                },
              ]
            : [];
        const drawQuickActions = drawRequests
          .filter((request) => request.status === "requested")
          .map((request) => ({
            actionLabel: "Review draw",
            address: build.location,
            ageLabel: productionQueueAgeLabel(
              Date.parse(request.requestedAt),
              asOfDate,
            ),
            authorityLabel: "Lender Admin release authority",
            blocker: "Funds remain held until review",
            buildId: productionBuildDisplayId(build),
            dueLabel: "Review requested",
            entityLabel: `${build.buildName} · ${request.label}`,
            href: `/backoffice/draws?buildId=${build._id}&drawId=${request._id}`,
            id: `draw-review:${request._id}`,
            ownerLabel: "Unassigned",
            recommendationLabel: "Review eligibility, evidence, and amount",
            title: "Draw request awaiting review",
            type: "drawRequest" as const,
          }));
        const milestoneQuickActions = milestones
          .filter(productionMilestoneNeedsBackofficeReview)
          .map((milestone) => {
            const siteVisit = milestone.completionReview?.siteVisit;
            const isSiteVisitAction =
              siteVisit !== undefined && siteVisit.status !== "complete";
            return {
              actionLabel: isSiteVisitAction
                ? "Manage site visit"
                : "Review milestone",
              address: build.location,
              ageLabel: productionQueueAgeLabel(milestone.updatedAt, asOfDate),
              authorityLabel: isSiteVisitAction
                ? "Operations recommendation"
                : "Lender Admin decision",
              blocker: isSiteVisitAction
                ? "Site visit outcome is pending"
                : "Completion claim is awaiting review",
              buildId: productionBuildDisplayId(build),
              dueLabel: `Day ${milestone.dayEnd}`,
              entityLabel: `${build.buildName} · ${milestone.name}`,
              href: isSiteVisitAction
                ? `/backoffice/site-visits?buildId=${build._id}&milestone=${milestone.key}`
                : `/backoffice/builds/${build._id}?milestone=${milestone.key}`,
              id: `${isSiteVisitAction ? "site-visit" : "milestone-review"}:${milestone._id}`,
              ownerLabel: "Unassigned",
              recommendationLabel: isSiteVisitAction
                ? "Complete field verification and return a recommendation"
                : "Review the completion package and decide next steps",
              title: isSiteVisitAction
                ? "Site visit requires follow-up"
                : "Milestone completion awaiting review",
              type: isSiteVisitAction
                ? ("siteVisit" as const)
                : ("milestone" as const),
            };
          });
        return [
          ...staleBuildAction,
          ...drawQuickActions,
          ...milestoneQuickActions,
        ];
      },
    );

    return {
      activeBuilds,
      approvedPendingClosing,
      canMakeFinalDecision: auth.roles.some((role) =>
        APPROVER_ROLES.includes(role as (typeof APPROVER_ROLES)[number]),
      ),
      drawRequests,
      metrics: [
        {
          detail: `${drawRequests.length} production draw requests awaiting review`,
          id: "draw-requests",
          label: "Draw requests",
          tone: drawRequests.length > 0 ? "warning" : "success",
          trend: "Production plannedDrawScheduleRows",
          value: drawRequests.length,
        },
        {
          detail: `${activeBuilds.length} production active builds after closing`,
          id: "active-builds",
          label: "Active builds",
          tone: activeBuilds.length > 0 ? "success" : "default",
          trend: "Only activeBuilds created by loan closing",
          value: activeBuilds.length,
        },
        {
          detail: `${proposals.length} production Build Proposals`,
          id: "proposals",
          label: "Proposals",
          tone: "default",
          trend: `${approvedPendingClosing.length} approved pending closing`,
          value: proposals.length,
        },
        {
          detail: `${milestones.length} production active-build milestones`,
          id: "milestones",
          label: "Milestones",
          tone: "success",
          trend: "Only buildMilestones from active builds",
          value: milestones.length,
        },
      ],
      milestoneColumns,
      milestones,
      proposalColumns,
      proposals,
      quickActions: [...proposalQuickActions, ...activeBuildQuickActions].map(
        (action) => {
          const handoff = latestHandoffByQueueItem.get(action.id);
          return {
            ...action,
            canAcknowledgeHandoff:
              handoff?.acknowledgementState === "returned" &&
              handoff.escalatedByWorkosUserId === auth.subject,
            handoff: handoff ? operationsHandoffProjection(handoff) : undefined,
          };
        },
      ),
      scheduleDate: `${asOfDate}T00:00:00.000Z`,
      scheduleEvents: [],
      submittedProposals,
    };
  })
  .public();
