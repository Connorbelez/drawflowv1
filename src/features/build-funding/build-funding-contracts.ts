export const CAD_INPUT_CLEANUP_PATTERN = /[$,\s]/g;
export const CAD_INPUT_PATTERN = /^\d+(?:\.\d{0,2})?$/;
export const CONVEX_ERROR_PATTERN = /Uncaught Error:\s*([^\n]+)/;
export const DRAW_AVAILABILITY_ERROR_PATTERN =
  /available draw limit|available balance/i;
export const DRAW_NETWORK_ERROR_PATTERN =
  /network|offline|timed? out|timeout|failed to fetch/i;
export const DRAW_PERMISSION_ERROR_PATTERN =
  /permission|not authorized|unauthorized|forbidden/i;
export const DRAW_STATUS_ERROR_PATTERN =
  /only a submitted draw|only submitted draw|only draw requests|only draws approved/i;
export const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});
export const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export type FundingRequestStatus =
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved_for_release"
  | "rejected"
  | "withdrawn"
  | "released";

export interface FundingSourceAllocation {
  amountCents: number;
  drawGroupKey: string;
  milestoneKey: string;
  milestoneName: string;
  sourceOrder: number;
}

export interface FundingRequestRecord {
  _id?: string;
  amountCents: number;
  displayId?: string;
  drawKey: string;
  label: string;
  nextAction?: string;
  operationsRecommendationNote?: string;
  operationsReviewStartedAt?: string;
  readyForAdminAt?: string;
  releaseDate?: string;
  releasedAt?: string;
  requestedAt?: string;
  requestNote?: string;
  requestReviewNote?: string;
  reviewedAt?: string;
  reviewedByWorkosUserId?: string;
  reviewerRole?: string;
  sourceAllocations?: FundingSourceAllocation[];
  status: FundingRequestStatus;
  withdrawnAt?: string;
  workOrderKey?: string;
}

export interface FundingMilestoneRecord {
  completionClaim?: Record<string, unknown>;
  completionReview?: Record<string, unknown>;
  dayEnd: number;
  dayStart?: number;
  drawAvailabilityCents: number;
  key: string;
  name: string;
  order: number;
  startedAt?: number | string;
  status: "planned" | "in_progress" | "complete";
}

export interface FundingForecastRecord {
  _id?: string;
  amountCents: number;
  drawKey: string;
  label: string;
  order: number;
  timingDay: number;
}

export interface BuildFundingModel {
  access: "full" | "read-only";
  approvedMilestoneCents: number;
  availableCents: number;
  backlogMilestoneCents: number;
  builder?: {
    contactName?: string;
    displayName: string;
    email?: string;
    phone?: string;
    role?: string;
  };
  buildLabel: string;
  drawnCents: number;
  facilityCents: number;
  forecastDraws: FundingForecastRecord[];
  historicalPlannedDraws: FundingForecastRecord[];
  location?: string;
  milestones: FundingMilestoneRecord[];
  pendingMilestoneCents: number;
  receiptCoverageCents?: number;
  requests: FundingRequestRecord[];
  reservedCents: number;
  startDate: string;
  unlockedCents: number;
}

export interface DrawRequestReceipt {
  amountCents: number;
  availableAfterCents: number;
  displayId: string;
  requestedAt: string;
  requestKey: string;
  sourceAllocations: FundingSourceAllocation[];
  status: "requested";
  workOrderKey: string;
}

export type FundingRequestAction = (
  request: FundingRequestRecord
) => Promise<unknown> | unknown;

export interface FundingRejectDecision {
  reason: string;
  request: FundingRequestRecord;
}

export type FundingRejectAction = (
  decision: FundingRejectDecision
) => Promise<unknown> | unknown;

export function projectBuildFunding(input: {
  availability?: {
    approvedMilestoneCents: number;
    availableCents: number;
    facilityCents: number;
    reservedCents: number;
    unlockedCents?: number;
  };
  builder?: BuildFundingModel["builder"];
  canRequest: boolean;
  buildLabel?: string;
  facilityCents?: number;
  location?: string;
  milestones: FundingMilestoneRecord[];
  plannedDraws?: FundingForecastRecord[];
  requests: FundingRequestRecord[];
  receiptCoverageCents?: number;
  startDate: string;
}): BuildFundingModel {
  const today = todayIso();
  const projectedApprovedMilestoneCents = input.milestones.reduce(
    (total, milestone) =>
      completionReviewStatus(milestone) === "approved"
        ? total + positiveCents(milestone.drawAvailabilityCents)
        : total,
    0
  );
  const pendingMilestoneCents = input.milestones.reduce((total, milestone) => {
    const status = completionReviewStatus(milestone);
    return milestone.completionClaim && (!status || status === "pending")
      ? total + positiveCents(milestone.drawAvailabilityCents)
      : total;
  }, 0);
  const backlogMilestoneCents = input.milestones.reduce((total, milestone) => {
    const status = completionReviewStatus(milestone);
    const plannedDate = addDays(input.startDate, milestone.dayEnd);
    const isPending =
      Boolean(milestone.completionClaim) && (!status || status === "pending");
    const isBacklog =
      status !== "approved" && !isPending && plannedDate < today;
    return isBacklog
      ? total + positiveCents(milestone.drawAvailabilityCents)
      : total;
  }, 0);
  const projectedReservedCents = input.requests.reduce(
    (total, request) =>
      request.status === "requested" ||
      request.status === "in_review" ||
      request.status === "ready_for_admin" ||
      request.status === "approved_for_release" ||
      request.status === "released"
        ? total + positiveCents(request.amountCents)
        : total,
    0
  );
  const projectedFacilityCents = positiveCents(input.facilityCents ?? 0);
  const projectedUnlockedCents =
    projectedFacilityCents > 0
      ? Math.min(projectedApprovedMilestoneCents, projectedFacilityCents)
      : projectedApprovedMilestoneCents;
  const approvedMilestoneCents =
    input.availability?.approvedMilestoneCents ??
    projectedApprovedMilestoneCents;
  const facilityCents =
    input.availability?.facilityCents ?? projectedFacilityCents;
  const reservedCents =
    input.availability?.reservedCents ?? projectedReservedCents;
  const availableCents =
    input.availability?.availableCents ??
    Math.max(0, projectedUnlockedCents - projectedReservedCents);
  const unlockedCents =
    input.availability?.unlockedCents ?? projectedUnlockedCents;
  const drawnCents = input.requests.reduce(
    (total, request) =>
      request.status === "released"
        ? total + positiveCents(request.amountCents)
        : total,
    0
  );
  return {
    access: input.canRequest ? "full" : "read-only",
    builder: input.builder,
    buildLabel: input.buildLabel?.trim() || "this Build",
    approvedMilestoneCents,
    availableCents,
    backlogMilestoneCents,
    drawnCents,
    facilityCents,
    forecastDraws: (input.plannedDraws ?? [])
      .filter((draw) => addDays(input.startDate, draw.timingDay) >= today)
      .sort(byOrder),
    historicalPlannedDraws: (input.plannedDraws ?? [])
      .filter((draw) => addDays(input.startDate, draw.timingDay) < today)
      .sort(byOrder),
    milestones: input.milestones.slice().sort(byOrder),
    location: input.location,
    pendingMilestoneCents,
    requests: input.requests.slice().sort(mostRecentRequestFirst),
    receiptCoverageCents: input.receiptCoverageCents,
    reservedCents,
    startDate: input.startDate,
    unlockedCents,
  };
}

export function completionReviewStatus(milestone: FundingMilestoneRecord) {
  const status = (milestone.completionReview as { status?: string } | undefined)
    ?.status;
  return status === "revisionRequested" && !completionReviewNote(milestone)
    ? "pending"
    : status;
}

export function completionReviewNote(milestone: FundingMilestoneRecord) {
  const note = (milestone.completionReview as { note?: unknown } | undefined)
    ?.note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
}

export function reviewedAt(milestone: FundingMilestoneRecord) {
  return (milestone.completionReview as { reviewedAt?: string } | undefined)
    ?.reviewedAt;
}

export function milestoneState(
  milestone: FundingMilestoneRecord,
  startDate: string
) {
  if (completionReviewStatus(milestone) === "approved") {
    return "approved" as const;
  }
  if (completionReviewStatus(milestone) === "revisionRequested") {
    return "revision" as const;
  }
  if (milestone.completionClaim) {
    return "pending" as const;
  }
  if (addDays(startDate, milestone.dayEnd) < todayIso()) {
    return "behind" as const;
  }
  if (milestone.status === "in_progress") {
    return "active" as const;
  }
  return "planned" as const;
}

export function milestoneFundingGroup(
  state: ReturnType<typeof milestoneState>
) {
  if (state === "active") {
    return "active" as const;
  }
  if (state === "pending" || state === "revision") {
    return "pending" as const;
  }
  if (state === "behind") {
    return "behind" as const;
  }
  return "upcoming" as const;
}

export function milestoneActualStartDate(milestone: FundingMilestoneRecord) {
  if (typeof milestone.startedAt === "string") {
    return milestone.startedAt;
  }
  if (typeof milestone.startedAt === "number") {
    const date = new Date(milestone.startedAt);
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  }
  const claimStart = milestone.completionClaim as
    | { actualStartDate?: unknown; startedAt?: unknown }
    | undefined;
  const value = claimStart?.actualStartDate ?? claimStart?.startedAt;
  return typeof value === "string" ? value : undefined;
}

export function milestoneActualEndDate(
  milestone: FundingMilestoneRecord,
  startDate: string
) {
  const claim = milestone.completionClaim as
    | {
        actualEndDate?: unknown;
        completedAt?: unknown;
        completedDay?: unknown;
      }
    | undefined;
  if (typeof claim?.completedDay === "number") {
    return addDays(startDate, claim.completedDay);
  }
  const value = claim?.actualEndDate ?? claim?.completedAt;
  return typeof value === "string" ? value : undefined;
}

export function milestoneDateCopy(
  milestone: FundingMilestoneRecord,
  startDate: string,
  state: ReturnType<typeof milestoneState>
) {
  const date =
    state === "approved" || state === "revision"
      ? (reviewedAt(milestone) ?? addDays(startDate, milestone.dayEnd))
      : ((milestone.completionClaim as { submittedAt?: string } | undefined)
          ?.submittedAt ?? addDays(startDate, milestone.dayEnd));
  if (state === "approved") {
    return `Approved ${formatDate(date)}`;
  }
  if (state === "pending") {
    return `Completion submitted ${formatDate(date)}`;
  }
  if (state === "revision") {
    return `Changes requested ${formatDate(date)}`;
  }
  return `Planned completion ${formatDate(date)}`;
}

export function milestoneStateLabel(state: ReturnType<typeof milestoneState>) {
  if (state === "approved") {
    return "Approved";
  }
  if (state === "pending") {
    return "Pending verification";
  }
  if (state === "active") {
    return "Active";
  }
  if (state === "behind") {
    return "Behind plan";
  }
  if (state === "revision") {
    return "Needs revision";
  }
  return "Planned";
}

export function milestoneBadgeTone(state: ReturnType<typeof milestoneState>) {
  if (state === "approved") {
    return "success" as const;
  }
  if (state === "pending") {
    return "warning" as const;
  }
  if (state === "active") {
    return "info" as const;
  }
  if (state === "behind") {
    return "error" as const;
  }
  if (state === "revision") {
    return "error" as const;
  }
  return "outline" as const;
}

export function requestBadgeTone(status: FundingRequestStatus) {
  if (status === "released") {
    return "success" as const;
  }
  if (status === "requested" || status === "in_review") {
    return "info" as const;
  }
  if (status === "ready_for_admin" || status === "approved_for_release") {
    return "warning" as const;
  }
  if (status === "rejected") {
    return "error" as const;
  }
  return "outline" as const;
}

export function requestStatusLabel(status: FundingRequestStatus) {
  if (status === "requested") {
    return "Submitted";
  }
  if (status === "in_review") {
    return "In review";
  }
  if (status === "ready_for_admin") {
    return "Ready for admin";
  }
  if (status === "approved_for_release") {
    return "Approved for release";
  }
  if (status === "released") {
    return "Released";
  }
  if (status === "withdrawn") {
    return "Withdrawn";
  }
  return "Rejected";
}

export function requestStatusDate(request: FundingRequestRecord) {
  if (request.status === "released") {
    return `Released ${formatDate(request.releaseDate ?? request.releasedAt)}`;
  }
  if (request.status === "approved_for_release") {
    return `Approved for release ${formatDate(request.reviewedAt)}`;
  }
  if (request.status === "ready_for_admin") {
    return `Ready for admin ${formatDate(request.readyForAdminAt)}`;
  }
  if (request.status === "in_review") {
    return `Review started ${formatDate(request.operationsReviewStartedAt)}`;
  }
  if (request.status === "withdrawn") {
    return `Withdrawn ${formatDate(request.withdrawnAt)}`;
  }
  if (request.status === "rejected") {
    return `Rejected ${formatDate(request.reviewedAt)}`;
  }
  return `Submitted ${formatDate(request.requestedAt)}`;
}

export function drawReviewStageCopy(request: FundingRequestRecord) {
  if (request.status === "in_review") {
    return `Review started ${relativeDate(request.operationsReviewStartedAt)}`;
  }
  if (request.status === "ready_for_admin") {
    return `Prepared for admin ${relativeDate(request.readyForAdminAt)}`;
  }
  return `Submitted ${relativeDate(request.requestedAt)}`;
}

export function sumCents(rows: FundingRequestRecord[]) {
  return rows.reduce((total, row) => total + positiveCents(row.amountCents), 0);
}

export function positiveCents(value: number) {
  return Math.max(0, Math.round(value));
}

export function byOrder(a: { order: number }, b: { order: number }) {
  return a.order - b.order;
}

export function mostRecentRequestFirst(
  a: FundingRequestRecord,
  b: FundingRequestRecord
) {
  return (b.requestedAt ?? "").localeCompare(a.requestedAt ?? "");
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatCad(cents: number) {
  return CAD_FORMATTER.format(cents / 100);
}

export function formatDate(value?: string) {
  if (!value) {
    return "Date unavailable";
  }
  const date = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.valueOf())) {
    return "Date unavailable";
  }
  return DATE_FORMATTER.format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return DATE_TIME_FORMATTER.format(date);
}

export function relativeDate(value?: string) {
  if (!value) {
    return "recently";
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).valueOf()) / 86_400_000)
  );
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

export function centsToInput(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export function drawRequestErrorMessage(
  cause: unknown,
  action: "submit" | "withdraw"
) {
  const raw = cause instanceof Error ? cause.message.trim() : "";
  const message = raw.match(CONVEX_ERROR_PATTERN)?.[1]?.trim() ?? raw;
  if (DRAW_AVAILABILITY_ERROR_PATTERN.test(message)) {
    return "Your available balance changed. Close this window, review the updated amount, and try again.";
  }
  if (DRAW_PERMISSION_ERROR_PATTERN.test(message)) {
    return "You no longer have permission to change draw requests. Ask an account administrator for help.";
  }
  if (DRAW_STATUS_ERROR_PATTERN.test(message)) {
    return "This request is no longer awaiting approval. Refresh the page to see its latest status.";
  }
  if (DRAW_NETWORK_ERROR_PATTERN.test(message)) {
    return "We could not reach Fairlend. Check your connection and try again; your request details are still here.";
  }
  return action === "submit"
    ? "We could not submit this draw request. Try again, or contact Fairlend if the problem continues."
    : "We could not withdraw this draw request. Refresh its status or contact Fairlend for help.";
}

export function drawReviewSuccessMessage(
  action: "approve" | "reject" | "release" | "start" | "submit",
  request: FundingRequestRecord
) {
  const requestId = request.displayId ?? request.drawKey;
  if (action === "start") {
    return `${requestId} review started.`;
  }
  if (action === "submit") {
    return `${requestId} sent to admin.`;
  }
  if (action === "approve") {
    return `${requestId} approved for release.`;
  }
  if (action === "reject") {
    return `${requestId} rejected.`;
  }
  return `${requestId} released.`;
}

export function drawReviewErrorMessage(cause: unknown) {
  const raw = cause instanceof Error ? cause.message.trim() : "";
  const message = raw.match(CONVEX_ERROR_PATTERN)?.[1]?.trim() ?? raw;
  if (DRAW_PERMISSION_ERROR_PATTERN.test(message)) {
    return "You no longer have permission to review draw requests. Ask a Fairlend administrator for access.";
  }
  if (DRAW_STATUS_ERROR_PATTERN.test(message)) {
    return "This draw request changed status. Refresh the page to review its latest state.";
  }
  if (DRAW_NETWORK_ERROR_PATTERN.test(message)) {
    return "We could not reach Fairlend. Check your connection and try again.";
  }
  return "We could not update this draw request. Refresh its status and try again.";
}

export function parseCadToCents(value: string) {
  const normalized = value.trim().replace(CAD_INPUT_CLEANUP_PATTERN, "");
  if (!CAD_INPUT_PATTERN.test(normalized)) {
    return 0;
  }
  const [dollars, cents = ""] = normalized.split(".");
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : 0;
}

export function createOperationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `draw-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
