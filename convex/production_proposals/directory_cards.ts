/**
 * Production proposals directory cards bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getWorkosUserById } from "./builder_staff_access.js";
import { PROPOSAL_COLUMNS } from "./contracts_foundation.js";
import { titleCase } from "./legacy_seed.js";
import { builderAccountSummaries, preferredBuilderAccountEmail, workosUserSummary } from "./proposal_claim.js";
import { centsToCurrency } from "./roster_projection_helpers.js";

export function resolveBorrowerStartingCashCents(record: {
  borrowerStartingCashCents?: number;
  borrowerWorkingCapitalLimitCents?: number;
  timelineStartingCashCents?: number;
}) {
  return Math.max(
    0,
    Math.round(
      record.borrowerStartingCashCents ??
        record.timelineStartingCashCents ??
        record.borrowerWorkingCapitalLimitCents ??
        0,
    ),
  );
}

export function withBorrowerStartingCash<
  T extends {
    borrowerStartingCashCents?: number;
    borrowerWorkingCapitalLimitCents?: number;
    timelineStartingCashCents?: number;
  },
>(record: T): T & { borrowerStartingCashCents: number } {
  return {
    ...record,
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(record),
  };
}

type ProposalDirectoryCard = {
  activeBuildId?: string;
  approvedAt?: number;
  assignedBrokerEmail?: string;
  assignedBrokerName?: string;
  assignedBrokerWorkosUserId?: string;
  borrowerCoPayBps: number;
  borrowerCoPayCents?: number;
  borrowerStartingCashCents: number;
  builderAssigned: boolean;
  builderEmail?: string;
  builderLegalName?: string;
  builderName: string;
  builderProfileId?: string;
  closedAt?: number;
  column: Doc<"buildProposals">["status"];
  createdAt: number;
  createdByEmail?: string;
  createdByName?: string;
  createdByWorkosUserId: string;
  href: string;
  interestAnnualBps?: number;
  lenderDrawPolicyLimitCents: number;
  location: string;
  locationLatitude?: number;
  locationLongitude?: number;
  locationPlaceId?: string;
  planKey?: "capitalConstrained" | "cheapestFeasible" | "fastest";
  planName?: string;
  proposedStartDate?: string;
  proposalId: string;
  reviewOutcome: Doc<"buildProposals">["reviewOutcome"];
  statusLabel: string;
  submittedAt?: number;
  subtitle: string;
  title: string;
  totalBudgetCents: number;
  updatedAt: number;
  updatedByWorkosUserId: string;
};

export async function productionProposalDirectoryCard(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
): Promise<ProposalDirectoryCard> {
  const { card } = await productionProposalDirectoryMatchContext(ctx, proposal);
  return card;
}

export async function productionProposalDirectoryMatchContext(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  const assignment = await proposalDirectoryIdentityProjection(ctx, proposal);
  const attachedAccountEmails = uniqueNormalizedSearchValues(
    (assignment.builder?.accounts ?? []).map((account) => account.email),
  );
  const attachedAccountNames = uniqueNormalizedSearchValues(
    (assignment.builder?.accounts ?? []).map((account) => account.name),
  );
  const card: ProposalDirectoryCard = {
    ...(proposal.activeBuildId
      ? { activeBuildId: String(proposal.activeBuildId) }
      : {}),
    ...(proposal.approvedAt === undefined
      ? {}
      : { approvedAt: proposal.approvedAt }),
    ...(assignment.broker?.email
      ? { assignedBrokerEmail: assignment.broker.email }
      : {}),
    ...(assignment.broker?.name
      ? { assignedBrokerName: assignment.broker.name }
      : {}),
    ...(proposal.assignedBrokerWorkosUserId
      ? {
          assignedBrokerWorkosUserId: proposal.assignedBrokerWorkosUserId,
        }
      : {}),
    borrowerCoPayBps: proposal.borrowerCoPayBps,
    ...(proposal.borrowerCoPayCents === undefined
      ? {}
      : { borrowerCoPayCents: proposal.borrowerCoPayCents }),
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
    builderAssigned: Boolean(assignment.builder),
    ...(assignment.builder?.ownerEmail
      ? { builderEmail: assignment.builder.ownerEmail }
      : {}),
    ...(assignment.builder?.legalName
      ? { builderLegalName: assignment.builder.legalName }
      : {}),
    builderName: assignment.builder?.displayName ?? "Unassigned builder",
    ...(assignment.builder?._id
      ? { builderProfileId: String(assignment.builder._id) }
      : {}),
    ...(proposal.closedAt === undefined ? {} : { closedAt: proposal.closedAt }),
    column: proposal.status,
    createdAt: proposal.createdAt,
    ...(assignment.createdBy?.email
      ? { createdByEmail: assignment.createdBy.email }
      : {}),
    ...(assignment.createdBy?.name
      ? { createdByName: assignment.createdBy.name }
      : {}),
    createdByWorkosUserId: proposal.createdByWorkosUserId,
    href: `/backoffice/proposals/${proposal._id}`,
    ...(proposal.interestAnnualBps === undefined
      ? {}
      : { interestAnnualBps: proposal.interestAnnualBps }),
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    location: proposal.location,
    ...(proposal.locationLatitude === undefined
      ? {}
      : { locationLatitude: proposal.locationLatitude }),
    ...(proposal.locationLongitude === undefined
      ? {}
      : { locationLongitude: proposal.locationLongitude }),
    ...(proposal.locationPlaceId
      ? { locationPlaceId: proposal.locationPlaceId }
      : {}),
    ...(proposal.selectedPlan?.planKey
      ? { planKey: proposal.selectedPlan.planKey }
      : {}),
    ...(proposal.selectedPlan?.name
      ? { planName: proposal.selectedPlan.name }
      : {}),
    ...(proposal.proposedStartDate
      ? { proposedStartDate: proposal.proposedStartDate }
      : {}),
    proposalId: String(proposal._id),
    reviewOutcome: proposal.reviewOutcome,
    statusLabel: productionProposalStatusLabel(proposal),
    ...(proposal.submittedAt === undefined
      ? {}
      : { submittedAt: proposal.submittedAt }),
    subtitle: proposal.location,
    title: proposal.buildName,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: proposal.updatedAt,
    updatedByWorkosUserId: proposal.updatedByWorkosUserId,
  };
  return {
    attachedBuilder: assignment.builder
      ? {
          accountEmails: attachedAccountEmails,
          accountNames: attachedAccountNames,
          displayName: assignment.builder.displayName,
          ...(assignment.builder.legalName
            ? { legalName: assignment.builder.legalName }
            : {}),
          ...(assignment.builder.ownerEmail
            ? { preferredEmail: assignment.builder.ownerEmail }
            : {}),
        }
      : null,
    card,
  };
}

async function proposalDirectoryIdentityProjection(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  const builder = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const builderAccounts = builder
    ? await builderAccountSummaries(ctx, builder._id)
    : [];
  const [assignedBroker, createdBy] = await Promise.all([
    proposal.assignedBrokerWorkosUserId
      ? getWorkosUserById(ctx, proposal.assignedBrokerWorkosUserId)
      : null,
    getWorkosUserById(ctx, proposal.createdByWorkosUserId),
  ]);
  const builderOwnerEmail = preferredBuilderAccountEmail(builderAccounts);
  return {
    broker: workosUserSummary(
      proposal.assignedBrokerWorkosUserId,
      assignedBroker,
    ),
    builder: builder
      ? {
          _id: builder._id,
          accounts: builderAccounts,
          displayName: builder.displayName,
          ...(builder.legalName ? { legalName: builder.legalName } : {}),
          ...(builderOwnerEmail ? { ownerEmail: builderOwnerEmail } : {}),
        }
      : null,
    createdBy: workosUserSummary(proposal.createdByWorkosUserId, createdBy),
  };
}

export function proposalDirectoryCardMatches(input: {
  attachedBuilder?: {
    accountEmails: string[];
    accountNames: string[];
    displayName: string;
    legalName?: string;
    preferredEmail?: string;
  } | null;
  card: ProposalDirectoryCard;
  filters?: {
    approvedFrom?: number;
    approvedTo?: number;
    assignedBrokerWorkosUserId?: string;
    assignment?: "assigned" | "unassigned";
    builderProfileId?: Id<"builderProfiles">;
    closingState?: "active_build" | "pending_closing" | "pre_closing";
    closedFrom?: number;
    closedTo?: number;
    createdFrom?: number;
    createdTo?: number;
    maxBorrowerStartingCashCents?: number;
    maxBorrowerCoPayBps?: number;
    maxBudgetCents?: number;
    maxInterestAnnualBps?: number;
    maxLenderDrawPolicyLimitCents?: number;
    minBorrowerStartingCashCents?: number;
    minBorrowerCoPayBps?: number;
    minBudgetCents?: number;
    minInterestAnnualBps?: number;
    minLenderDrawPolicyLimitCents?: number;
    planKey?:
      | "capitalConstrained"
      | "cheapestFeasible"
      | "fastest"
      | "unselected";
    proposedStartFrom?: string;
    proposedStartTo?: string;
    reviewOutcome?: Doc<"buildProposals">["reviewOutcome"];
    stage?: Doc<"buildProposals">["status"];
    submittedFrom?: number;
    submittedTo?: number;
    updatedFrom?: number;
    updatedTo?: number;
  };
  proposal: Doc<"buildProposals">;
  search?: string;
}) {
  const { card, filters, proposal } = input;
  if (filters?.stage && card.column !== filters.stage) {
    return false;
  }
  if (filters?.reviewOutcome && card.reviewOutcome !== filters.reviewOutcome) {
    return false;
  }
  if (filters?.assignment === "assigned" && !card.builderAssigned) {
    return false;
  }
  if (filters?.assignment === "unassigned" && card.builderAssigned) {
    return false;
  }
  if (
    filters?.builderProfileId &&
    card.builderProfileId !== String(filters.builderProfileId)
  ) {
    return false;
  }
  if (
    filters?.assignedBrokerWorkosUserId &&
    card.assignedBrokerWorkosUserId !== filters.assignedBrokerWorkosUserId
  ) {
    return false;
  }
  if (filters?.planKey === "unselected" && card.planKey !== undefined) {
    return false;
  }
  if (
    filters?.planKey &&
    filters.planKey !== "unselected" &&
    card.planKey !== filters.planKey
  ) {
    return false;
  }
  if (filters?.closingState === "active_build" && !card.activeBuildId) {
    return false;
  }
  if (
    filters?.closingState === "pending_closing" &&
    !(card.column === "approved" && !card.activeBuildId)
  ) {
    return false;
  }
  if (
    filters?.closingState === "pre_closing" &&
    (card.activeBuildId || card.column === "approved")
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.totalBudgetCents,
      filters?.minBudgetCents,
      filters?.maxBudgetCents,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.borrowerCoPayBps,
      filters?.minBorrowerCoPayBps,
      filters?.maxBorrowerCoPayBps,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.borrowerStartingCashCents,
      filters?.minBorrowerStartingCashCents,
      filters?.maxBorrowerStartingCashCents,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.lenderDrawPolicyLimitCents,
      filters?.minLenderDrawPolicyLimitCents,
      filters?.maxLenderDrawPolicyLimitCents,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.interestAnnualBps,
      filters?.minInterestAnnualBps,
      filters?.maxInterestAnnualBps,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(card.createdAt, filters?.createdFrom, filters?.createdTo)
  ) {
    return false;
  }
  if (
    !numberInRange(card.updatedAt, filters?.updatedFrom, filters?.updatedTo)
  ) {
    return false;
  }
  if (
    !numberInRange(
      card.submittedAt,
      filters?.submittedFrom,
      filters?.submittedTo,
    )
  ) {
    return false;
  }
  if (
    !numberInRange(card.approvedAt, filters?.approvedFrom, filters?.approvedTo)
  ) {
    return false;
  }
  if (!numberInRange(card.closedAt, filters?.closedFrom, filters?.closedTo)) {
    return false;
  }
  if (
    filters?.proposedStartFrom &&
    (!card.proposedStartDate ||
      card.proposedStartDate < filters.proposedStartFrom)
  ) {
    return false;
  }
  if (
    filters?.proposedStartTo &&
    (!card.proposedStartDate ||
      card.proposedStartDate > filters.proposedStartTo)
  ) {
    return false;
  }

  const terms = normalizeProposalDirectorySearch(input.search);
  if (terms.length === 0) {
    return true;
  }
  const attachedBuilder = input.attachedBuilder ?? null;
  const searchText = JSON.stringify({
    assignment: {
      brokerEmail: card.assignedBrokerEmail,
      brokerName: card.assignedBrokerName,
      brokerWorkosUserId: card.assignedBrokerWorkosUserId,
      builderAccountEmails: attachedBuilder?.accountEmails ?? [],
      builderAccountNames: attachedBuilder?.accountNames ?? [],
      builderEmail: attachedBuilder?.preferredEmail ?? card.builderEmail,
      builderLegalName: attachedBuilder?.legalName ?? card.builderLegalName,
      builderName: attachedBuilder?.displayName ?? card.builderName,
      builderProfileId: card.builderProfileId,
    },
    card,
    formatted: {
      borrowerStartingCash: centsToCurrency(card.borrowerStartingCashCents),
      budget: centsToCurrency(card.totalBudgetCents),
      lenderDrawPolicyLimit: centsToCurrency(card.lenderDrawPolicyLimitCents),
    },
    proposal: withBorrowerStartingCash(proposal),
  }).toLowerCase();
  return terms.every((term) => searchText.includes(term));
}

function uniqueNormalizedSearchValues(
  values: ReadonlyArray<string | undefined>,
) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeProposalDirectorySearch(search: string | undefined) {
  return (search ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function numberInRange(
  value: number | undefined,
  minimum: number | undefined,
  maximum: number | undefined,
) {
  if (minimum !== undefined && (value === undefined || value < minimum)) {
    return false;
  }
  if (maximum !== undefined && (value === undefined || value > maximum)) {
    return false;
  }
  return true;
}

export function productionDashboardProposalCard(
  card: Doc<"proposalKanbanCards"> | null,
  proposal: Doc<"buildProposals">,
  directoryCard?: ProposalDirectoryCard,
) {
  return {
    address: card?.subtitle ?? proposal.location,
    approvedAt: proposal.approvedAt,
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
    builderAssigned: Boolean(proposal.builderProfileId),
    builder: card?.builderName ?? "Unassigned builder",
    builderEmail: directoryCard?.builderEmail,
    builderProfileId: proposal.builderProfileId
      ? String(proposal.builderProfileId)
      : undefined,
    closeLabel:
      proposal.status === "approved" && !proposal.activeBuildId
        ? "Pending closing"
        : undefined,
    column: card?.column ?? proposal.status,
    createdAt: proposal.createdAt,
    href: card?.href ?? `/backoffice/proposals/${proposal._id}`,
    ...(proposal.interestAnnualBps === undefined
      ? {}
      : { interestAnnualBps: proposal.interestAnnualBps }),
    id: String(proposal._id),
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    loanAmount: centsToCurrency(
      card?.totalBudgetCents ?? proposal.totalBudgetCents,
    ),
    ltv: 0,
    name: card?.title ?? proposal.buildName,
    proposalId: String(proposal._id),
    reviewOutcome: proposal.reviewOutcome,
    status: proposal.status,
    statusLabel: productionProposalStatusLabel(proposal),
    submittedAt: proposal.submittedAt,
    tag: "production",
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: proposal.updatedAt,
  };
}

function productionProposalStatusLabel(proposal: Doc<"buildProposals">) {
  if (proposal.reviewOutcome === "rejected") {
    return "Rejected";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "Changes requested";
  }
  if (proposal.status === "approved" && !proposal.activeBuildId) {
    return "Approved - pending closing";
  }
  return titleCase(proposal.status);
}

export function productionProposalColumnDescription(
  column: (typeof PROPOSAL_COLUMNS)[number],
  proposals: ReturnType<typeof productionDashboardProposalCard>[],
) {
  const count = proposals.filter(
    (proposal) => proposal.column === column,
  ).length;
  if (column === "approved") {
    return `${count} approved proposals pending or ready for closing`;
  }
  if (column === "submitted") {
    return `${count} submitted proposals in lender review`;
  }
  if (column === "closed") {
    return `${count} proposals converted to active builds`;
  }
  return `${count} draft proposals`;
}

export function productionBuildDisplayId(build: Doc<"activeBuilds">) {
  return `B-${String(build._id).slice(-8).toUpperCase()}`;
}

export function productionQueueAgeLabel(timestamp: number, asOfDate: string) {
  const asOfTime = Date.parse(`${asOfDate}T00:00:00.000Z`);
  const elapsedDays = Math.max(
    0,
    Math.floor((asOfTime - timestamp) / 86_400_000),
  );
  if (elapsedDays === 0) {
    return "Today";
  }
  if (elapsedDays === 1) {
    return "1 day old";
  }
  return `${elapsedDays} days old`;
}

export function productionDrawUrgencyRank(
  status: Doc<"plannedDrawScheduleRows">["status"],
): number {
  switch (status) {
    case "requested":
      return 0;
    case "in_review":
      return 1;
    case "ready_for_admin":
      return 2;
    case "approved_for_release":
      return 3;
    case "planned":
      return 4;
    case "released":
      return 5;
  }
  return 6;
}

function productionDrawMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return monthKey;
  }
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildBrokerageDrawChartSeries(
  draws: Array<{
    amountCents: number;
    scheduledDateIso: string;
    status: Doc<"plannedDrawScheduleRows">["status"];
  }>,
) {
  const bucketTotals = new Map<
    string,
    {
      approvedCents: number;
      plannedCents: number;
      releasedCents: number;
      requestedCents: number;
    }
  >();
  for (const draw of draws) {
    if (draw.status === "rejected") {
      continue;
    }
    const periodKey = draw.scheduledDateIso.slice(0, 7);
    const existing = bucketTotals.get(periodKey) ?? {
      approvedCents: 0,
      plannedCents: 0,
      releasedCents: 0,
      requestedCents: 0,
    };
    if (draw.status === "planned") {
      existing.plannedCents += draw.amountCents;
    } else if (
      draw.status === "requested" ||
      draw.status === "in_review" ||
      draw.status === "ready_for_admin"
    ) {
      existing.requestedCents += draw.amountCents;
    } else if (draw.status === "approved_for_release") {
      existing.approvedCents += draw.amountCents;
    } else if (draw.status === "released") {
      existing.releasedCents += draw.amountCents;
    }
    bucketTotals.set(periodKey, existing);
  }
  const periodKeys = [...bucketTotals.keys()].sort();
  if (periodKeys.length === 0) {
    return [];
  }
  return periodKeys.map((periodKey) => {
    const totals = bucketTotals.get(periodKey)!;
    return {
      approvedCents: totals.approvedCents,
      periodKey,
      periodLabel: productionDrawMonthLabel(periodKey),
      plannedCents: totals.plannedCents,
      releasedCents: totals.releasedCents,
      requestedCents: totals.requestedCents,
    };
  });
}
