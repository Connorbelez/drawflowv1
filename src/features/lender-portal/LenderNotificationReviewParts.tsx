import type { FunctionReturnType } from "convex/server";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BrokerageSiteVisitsResult } from "#/features/backoffice-site-visits/site-visit-types.ts";
import type { LenderBuildDetailData } from "#/features/lender-portal/LenderBuildDetailOverview.tsx";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LenderNotificationReviewTarget } from "./LenderNotificationReviewSurface";

export type ReviewerDetail = FunctionReturnType<
  typeof api.lender_portal_phase5.getLenderReviewRequest
>;
export type BuilderDetail = FunctionReturnType<
  typeof api.lender_portal_phase5.getBuilderNotificationReviewRequest
>;
export type BuilderSubmitResult = FunctionReturnType<
  typeof api.lender_portal_phase5.submitBuilderReviewRequest
>;
export type ReviewerCycle = ReviewerDetail["currentCycle"];
export type ReviewDecision = ReviewerCycle["decisions"][number];
export type ReviewSubmission = ReviewerCycle["submission"];
export type ReviewReference = ReviewerCycle["evidenceReferences"][number];
export type ReviewRequirements = ReviewerCycle["requirements"];
export type ReviewState = ReviewerCycle["state"];
export type LenderEvidence = FunctionReturnType<
  typeof api.lender_portal_phase5.getLenderReviewEvidence
>;

export interface NormalizedCycle {
  cycleId?: Id<"lenderPortalReviewCycles">;
  cycleNumber: number;
  decisions: ReviewDecision[];
  evidenceReferences: ReviewReference[];
  requirements: ReviewRequirements;
  state: ReviewState;
  submission: ReviewSubmission;
  submittedAt: number;
}

export interface NormalizedDetail {
  buildId: Id<"activeBuilds">;
  buildName: string;
  currentCycle: NormalizedCycle;
  currentCycleNumber: number;
  cycles: NormalizedCycle[];
  notice: { body: string; title: string };
  viewerActionState:
    | "needs_action"
    | "acted"
    | "not_required"
    | "ineligible"
    | "closed"
    | "unavailable"
    | "read_only";
}

export interface DecisionCommand {
  decision: "approved" | "rejected";
  expectedCycleNumber: number;
  idempotencyKey: string;
  privateRationale?: string;
  revisionInstructions?: string;
  target: ReturnType<typeof typedReviewTarget>;
}

export function typedReviewTarget(target: LenderNotificationReviewTarget) {
  return target.kind === "milestone"
    ? {
        kind: "milestone" as const,
        milestoneId: target.milestoneId as Id<"buildMilestones">,
      }
    : {
        drawRequestId: target.drawRequestId as Id<"activeBuildDrawRequests">,
        kind: "draw" as const,
      };
}

export function normalizeReviewerDetail(
  detail: ReviewerDetail
): NormalizedDetail {
  return {
    buildId: detail.buildId,
    buildName: detail.buildName,
    currentCycle: detail.currentCycle,
    currentCycleNumber: detail.currentCycleNumber,
    cycles: detail.cycles.page,
    notice: { body: "The current review cycle is read-only.", title: "Review" },
    viewerActionState: detail.viewerActionState,
  };
}

export function normalizeBuilderDetail(
  detail: BuilderDetail
): NormalizedDetail {
  const normalizeCycle = (
    cycle: BuilderDetail["currentCycle"]
  ): NormalizedCycle => ({
    ...cycle,
    decisions: [],
  });
  return {
    buildId: detail.buildId,
    buildName: "Build review",
    currentCycle: normalizeCycle(detail.currentCycle),
    currentCycleNumber: detail.currentCycleNumber,
    cycles: detail.history.page.map(normalizeCycle),
    notice: detail.notice,
    viewerActionState: "read_only",
  };
}

export function reviewHistory(detail: NormalizedDetail) {
  const cycles = new Map<number, NormalizedCycle>();
  for (const cycle of [detail.currentCycle, ...detail.cycles]) {
    cycles.set(cycle.cycleNumber, cycle);
  }
  return [...cycles.values()]
    .sort((left, right) => left.cycleNumber - right.cycleNumber)
    .flatMap((cycle) => [
      {
        actor: "Builder team",
        createdAt: cycle.submittedAt,
        id: `cycle-${cycle.cycleNumber}-submitted`,
        title: `Cycle ${cycle.cycleNumber} submitted`,
      },
      ...cycle.decisions.map((decision) => ({
        actor: decision.group === "backoffice" ? "Back Office" : "Lender",
        createdAt: decision.createdAt,
        id: String(decision.decisionId),
        title:
          decision.decision === "approved"
            ? `Cycle ${cycle.cycleNumber} approved`
            : `Cycle ${cycle.cycleNumber} revision requested`,
      })),
    ]);
}

export function ReviewHistoryNavigation({
  canLoadNewer,
  canLoadOlder,
  onLoadNewer,
  onLoadOlder,
}: {
  canLoadNewer: boolean;
  canLoadOlder: boolean;
  onLoadNewer: () => void;
  onLoadOlder: () => void;
}) {
  if (!(canLoadNewer || canLoadOlder)) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <Button
        disabled={!canLoadNewer}
        onClick={onLoadNewer}
        size="sm"
        variant="outline"
      >
        Newer history
      </Button>
      <Button
        disabled={!canLoadOlder}
        onClick={onLoadOlder}
        size="sm"
        variant="outline"
      >
        Older history
      </Button>
    </div>
  );
}

export function LenderCollaboration({
  rows,
}: {
  rows: LenderBuildDetailData["collaboration"];
}) {
  return (
    <Frame>
      <FramePanel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">Participant-visible updates</h2>
          <Badge variant="outline">Read-only</Badge>
        </div>
        {rows.length > 0 ? (
          <ol className="mt-3 divide-y border-y">
            {rows.map((row) => (
              <li className="py-3" key={row.postId}>
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="font-medium">{row.sourceLabel}</span>
                  <time
                    className="text-muted-foreground tabular-nums"
                    dateTime={new Date(row.publishedAt).toISOString()}
                  >
                    {new Date(row.publishedAt).toLocaleString("en-CA")}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-pretty break-words text-sm leading-6">
                  {row.body}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-muted-foreground text-sm">
            No participant-visible updates are linked to this review.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

export function LenderDrawActionItems({
  rows,
}: {
  rows: LenderBuildDetailData["draws"][number]["actionItems"];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No Action Items are linked to this Draw System Post.
      </p>
    );
  }
  return (
    <ol className="divide-y border-y">
      {rows.map((row) => (
        <li
          className="flex min-h-12 items-center justify-between gap-3 py-2"
          key={row.actionItemId}
        >
          <span className="min-w-0 truncate font-medium text-sm">
            {row.title}
          </span>
          <Badge className="shrink-0" variant="outline">
            {statusLabel(row.status)}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

export function MilestoneReviewPolicyFacts({
  cycle,
}: {
  cycle: NormalizedCycle;
}) {
  const approvals = cycle.decisions.filter(
    (decision) =>
      decision.decision === "approved" && decision.countsTowardCurrentApproval
  );
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Milestone review policy</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Exact requirements and decisions for cycle {cycle.cycleNumber}.
            </p>
          </div>
          <Badge variant="outline">{statusLabel(cycle.state)}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <ReviewPolicyFact
            label="Approval mode"
            value={statusLabel(cycle.requirements.approvalMode)}
          />
          <ReviewPolicyFact
            label="Required groups"
            value={cycle.requirements.requiredGroups
              .map((group) =>
                group === "backoffice" ? "Back Office" : "Lender"
              )
              .join(" + ")}
          />
          <ReviewPolicyFact
            label="Lender quorum"
            value={String(cycle.requirements.lenderQuorum ?? 1)}
          />
          <ReviewPolicyFact
            label="Site Visit"
            value={
              cycle.requirements.siteVisitRequired ? "Required" : "Not required"
            }
          />
          <ReviewPolicyFact
            label="Receipts / invoices"
            value={
              cycle.requirements.receiptInvoiceRequired
                ? "Required"
                : "Not required"
            }
          />
        </dl>
        <div>
          <p className="text-muted-foreground text-xs">Approval progress</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cycle.requirements.requiredGroups.map((group) => {
              const satisfied = reviewGroupSatisfied(
                group,
                approvals,
                cycle.requirements.lenderQuorum
              );
              return (
                <Badge key={group} variant={satisfied ? "success" : "outline"}>
                  {group === "backoffice" ? "Back Office" : "Lender"}:{" "}
                  {satisfied ? "Satisfied" : "Pending"}
                </Badge>
              );
            })}
          </div>
        </div>
        {cycle.decisions.length > 0 ? (
          <ol className="divide-y border-y">
            {cycle.decisions.map((decision) => (
              <li
                className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
                key={decision.decisionId}
              >
                <span>
                  {decision.group === "backoffice" ? "Back Office" : "Lender"}
                  {" · "}
                  {decision.decision === "approved"
                    ? "Approved"
                    : "Revision requested"}
                </span>
                <time
                  className="shrink-0 text-muted-foreground text-xs tabular-nums"
                  dateTime={new Date(decision.createdAt).toISOString()}
                >
                  {new Date(decision.createdAt).toLocaleString("en-CA")}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">
            No decisions have been recorded for this cycle.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

export function ReviewPolicyFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

export function toLenderMilestoneSiteVisits(
  detail: LenderBuildDetailData,
  milestone: LenderBuildDetailData["milestones"][number]
): BrokerageSiteVisitsResult {
  const visits = milestone.siteVisits.map((visit) => ({
    buildDisplayId: String(detail.build.buildId),
    buildHref: `/lender/builds/${String(detail.build.buildId)}`,
    buildId: detail.build.buildId,
    buildName: detail.build.buildName,
    builderName: detail.builder.displayName,
    completedAt: visit.completedAt,
    geofenceFlagged: milestone.reviewEvidence.some(
      (asset) =>
        asset.siteVisitId === visit.siteVisitId && !asset.locationVerified
    ),
    location: detail.build.location,
    milestoneKey: milestone.key,
    milestoneName: milestone.name,
    ...(milestone.reviewState
      ? { milestoneReviewStatus: milestone.reviewState }
      : {}),
    operationalStatus: "complete" as const,
    recordNote: visit.report,
    recordNoteFormat: "plain_text" as const,
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    scheduledDateLabel: `Day ${visit.requestedDay}`,
    tokenExpiresAt: visit.tokenExpiresAt,
    tokenMsRemaining: 0,
    ...(visit.tokenOpenedAt === null
      ? {}
      : { tokenOpenedAt: visit.tokenOpenedAt }),
    tokenState: "consumed" as const,
    updatedAt: visit.updatedAt,
    // Field-token URLs are not lender review facts. The shared sheet hides
    // its copy control when this redacted projection is supplied.
    url: "",
    visitId: visit.visitId,
  }));
  return {
    builds: [
      {
        activeVisitCount: 0,
        buildDisplayId: String(detail.build.buildId),
        buildId: detail.build.buildId,
        buildName: detail.build.buildName,
        builderName: detail.builder.displayName,
        href: `/lender/builds/${String(detail.build.buildId)}`,
        location: detail.build.location,
        visits,
      },
    ],
    summary: {
      cancelled: 0,
      complete: visits.length,
      expiringWithin15Min: 0,
      expired: 0,
      geofenceFlagged: visits.filter((visit) => visit.geofenceFlagged).length,
      inField: 0,
      open: 0,
      total: visits.length,
    },
    visits,
  };
}

export function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(cents / 100);
}

export interface ReviewEvidence {
  files: Array<{
    downloadUrl: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export function ReviewEvidencePanel({
  evidence,
}: {
  evidence: ReviewEvidence | undefined;
}) {
  if (evidence === undefined) {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-4 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Loading current-cycle evidence…
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FramePanel className="space-y-3 p-4">
        <div>
          <p className="font-medium text-sm">Current-cycle evidence</p>
          <p className="text-pretty text-muted-foreground text-xs">
            Files authorized for this exact review cycle.
          </p>
        </div>
        {evidence.files.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No files are attached to this review cycle.
          </p>
        ) : (
          <ul className="divide-y border-y">
            {evidence.files.map((file) => (
              <li
                className="flex min-h-12 items-center justify-between gap-3 py-2"
                key={`${file.downloadUrl ?? "unavailable"}-${file.fileName}-${file.sizeBytes}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {file.fileName}
                    </span>
                    <span className="block text-muted-foreground text-xs tabular-nums">
                      {formatFileSize(file.sizeBytes)}
                    </span>
                  </span>
                </span>
                {file.downloadUrl ? (
                  <Button
                    aria-label={`Open ${file.fileName}`}
                    render={
                      <a
                        href={file.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="sr-only">Open {file.fileName}</span>
                      </a>
                    }
                    size="icon"
                    variant="ghost"
                  >
                    <ExternalLink aria-hidden="true" />
                  </Button>
                ) : (
                  <Badge variant="outline">Unavailable</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function reviewGroupSatisfied(
  group: "backoffice" | "lender",
  approvals: ReviewDecision[],
  lenderQuorum: number | null
) {
  const count = approvals.filter((decision) => decision.group === group).length;
  return group === "lender" ? count >= (lenderQuorum ?? 1) : count > 0;
}

export function reviewStateToDrawStatus(state: string) {
  if (state === "completed") {
    return "approved_for_release" as const;
  }
  if (state === "correction_required") {
    return "rejected" as const;
  }
  return "in_review" as const;
}

export function reviewStateToMilestoneStatus(state: string) {
  if (state === "completed") {
    return "complete" as const;
  }
  if (state === "correction_required") {
    return "needs_revision" as const;
  }
  return "in_progress" as const;
}
