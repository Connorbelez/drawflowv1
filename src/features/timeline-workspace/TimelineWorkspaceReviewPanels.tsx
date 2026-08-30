import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MapPinned,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useEffect, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import { normalizeSiteVisitTokenRoute } from "#/features/build-workspace-demo/site-visit-token-route-model.ts";
import { cn } from "#/lib/utils.ts";
import {
  getMilestoneEndX,
  getMilestonePlannedEndX,
} from "./-timeline-milestone-schedule.ts";
import { resolveMilestoneSubmilestones } from "./-timeline-milestone-submilestones.ts";
import {
  getMilestoneEffectiveCashSpendAmount,
} from "./-timeline-share-snapshot.ts";
import {
  buildAbsoluteSiteVisitUrl,
  findLiveSiteVisit,
  money,
  normalizeTimelineSiteVisitStatus,
} from "./TimelineWorkspaceDefaults.ts";
import {
  formatTimelineDateTime,
  formatTimelineDay,
  resolveSelectedDrawDate,
} from "./TimelineWorkspaceDrawUtils.ts";
import { requestDemoTimelineSiteVisit, CompletionClaimPanel, EvidencePackagePanel } from "./TimelineWorkspaceCompletionPanels.tsx";
import {
  FinancialOverviewCard,
} from "./TimelineWorkspaceMarkers.tsx";
import type {
  DemoDraw,
  DemoEvidenceAsset,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import type {
  FinancialOverview,
  TimelineCompletionClaimInput,
  TimelineSiteVisitRequestInput,
} from "./TimelineWorkspaceTypes.ts";
import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { dollarsToCents } from "./TimelineWorkspaceDefaults.ts";
import { TimelineMilestoneContractorList } from "./TimelineMilestoneContractorList.tsx";
import { TimelineMilestoneSubmilestoneList } from "./-TimelineMilestoneSubmilestoneList.tsx";

export function MilestoneOperationsPanel({
  activeDraw,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  onOpenSubmilestone,
  onCompleteMilestone,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  overview,
  range,
}: {
  activeDraw: DemoDraw | null;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
}) {
  const milestone = activeItem.data;

  if (!milestone) {
    return null;
  }

  const evidenceAssets = milestone.evidencePackage?.assets ?? [];
  const completionClaim = milestone.completionClaim;
  const completed = Boolean(completionClaim);
  const effectiveCost = getMilestoneEffectiveCashSpendAmount(milestone);
  const approvedBudget = Math.max(0, Math.round(milestone.amount));
  const costAdjusted = completionClaim && effectiveCost !== approvedBudget;

  return (
    <div className="grid gap-4" data-testid="selected-draw-details">
      <div>
        <div
          className={cn(
            "mb-3 grid size-10 place-items-center rounded-md",
            completed
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-rose-500/10 text-rose-600"
          )}
        >
          {completed ? (
            <Check className="size-5" />
          ) : (
            <CircleDollarSign className="size-5" />
          )}
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Selected milestone
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {completionClaim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem))
            ? "Completed on "
            : "Milestone completes on "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
          {completionClaim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem)) ? (
            <span className="text-muted-foreground/80">
              {" "}
              (planned {formatTimelineDay(getMilestonePlannedEndX(activeItem))})
            </span>
          ) : null}
        </p>
        <Badge className="mt-3" variant={completed ? "success" : "outline"}>
          {completed ? "Builder marked complete" : "Awaiting completion claim"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Milestone date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(activeItem.x)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(
              resolveSelectedDrawDate(activeItem, activeDraw, range)
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">
            {costAdjusted ? "Effective cost" : "Milestone cost"}
          </dt>
          <dd className="font-semibold tabular-nums">
            {money(costAdjusted ? effectiveCost : approvedBudget)}
          </dd>
        </div>
        {costAdjusted ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Approved budget</dt>
            <dd className="font-medium tabular-nums">
              {money(approvedBudget)}
            </dd>
          </div>
        ) : null}
        {completionClaim ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Completed</dt>
              <dd
                className="font-medium tabular-nums"
                data-testid={`selected-draw-completed-day-${activeItem.id}`}
              >
                {formatTimelineDay(completionClaim.completedDay)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Actual cost</dt>
              <dd
                className="font-semibold tabular-nums"
                data-testid={`selected-draw-actual-cost-${activeItem.id}`}
              >
                {completionClaim.actualCost === undefined
                  ? "Not provided"
                  : money(completionClaim.actualCost)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        onOpenSubmilestone={onOpenSubmilestone}
        onUpdateBudget={
          onUpdateSubmilestoneBudget
            ? (submilestoneKey, budgetCents) =>
                onUpdateSubmilestoneBudget(
                  activeItem.id,
                  submilestoneKey,
                  budgetCents
                )
            : undefined
        }
        onUpdateDuration={
          onUpdateSubmilestoneDuration
            ? (submilestoneKey, durationDays) =>
                onUpdateSubmilestoneDuration(
                  activeItem.id,
                  submilestoneKey,
                  durationDays
                )
            : undefined
        }
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-selected-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-selected-milestone-contractor"
      />

      <CompletionClaimPanel
        activeItem={activeItem}
        evidenceCount={evidenceAssets.length}
        onCompleteMilestone={onCompleteMilestone}
      />

      <EvidencePackagePanel
        activeItem={activeItem}
        addEvidenceFiles={addEvidenceFiles}
        onRemoveEvidenceAsset={onRemoveEvidenceAsset}
        onUpdateEvidenceAsset={onUpdateEvidenceAsset}
      />

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}
export function LenderMilestoneReviewPanel({
  activeItem,
  canApproveMilestoneCompletion,
  contractorPlanning,
  items,
  onOpenSubmilestone,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onReviewMilestoneCompletion,
  overview,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  canApproveMilestoneCompletion: boolean;
  contractorPlanning?: ContractorPlanningModel | null;
  items: TimelineItem<DemoMilestone>[];
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void> | undefined;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown> | undefined;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  overview: FinancialOverview;
}) {
  const milestone = activeItem.data;
  const usesExternalSiteVisitPersistence = Boolean(onCreateMilestoneSiteVisit);
  const workspace = useQuery(
    api.demo_drawflow.demo_getWorkspace,
    usesExternalSiteVisitPersistence ? "skip" : { scenario: "active" }
  );
  const seedDemo = useMutation(api.demo_drawflow.demo_seedDrawFlowDemo);
  const requestSiteVisit = useMutation(api.demo_drawflow.demo_requestSiteVisit);
  const [siteVisitPending, setSiteVisitPending] = useState(false);
  const [siteVisitError, setSiteVisitError] = useState("");
  useEffect(() => {
    if (workspace?.needsSeed) {
      void seedDemo({});
    }
  }, [seedDemo, workspace?.needsSeed]);

  if (!milestone) {
    return null;
  }

  const claim = milestone.completionClaim;
  const review = milestone.completionReview;
  const siteVisit = review?.siteVisit;
  const effectiveCost = getMilestoneEffectiveCashSpendAmount(milestone);
  const approvedBudget = Math.max(0, Math.round(milestone.amount));
  const costAdjusted = claim && effectiveCost !== approvedBudget;
  const liveSiteVisit = findLiveSiteVisit(workspace, siteVisit?.visitId);
  const liveStatus = normalizeTimelineSiteVisitStatus(
    liveSiteVisit?.status ?? siteVisit?.status,
    liveSiteVisit?.tokenExpiresAt ?? siteVisit?.tokenExpiresAt
  );
  const siteVisitUrl = buildAbsoluteSiteVisitUrl(siteVisit?.url);
  const eligibleSiteVisitItems = items.slice(
    0,
    Math.max(
      0,
      items.findIndex((item) => item.id === activeItem.id)
    ) + 1
  );
  const evidenceAssets = milestone.evidencePackage?.assets ?? [];
  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status =
      submitter?.value === "approved" ? "approved" : "revisionRequested";
    const note = String(formData.get("reviewNote") ?? "").trim();

    onReviewMilestoneCompletion(activeItem.id, {
      ...(note ? { note } : {}),
      status,
    });
  };
  const submitSiteVisit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedDay = Math.round(
      Number(formData.get("siteVisitDay") ?? getMilestoneEndX(activeItem))
    );
    const note = String(formData.get("siteVisitNote") ?? "").trim();
    const includedItemIds = Array.from(
      new Set(
        [
          ...formData.getAll("includedSiteVisitItemId").map(String),
          activeItem.id,
        ].filter(Boolean)
      )
    );

    if (!Number.isFinite(requestedDay)) {
      return;
    }

    setSiteVisitError("");
    setSiteVisitPending(true);
    try {
      const requestPayload = {
        includedItemIds,
        ...(note ? { note } : {}),
        requestedDay,
        status: "requested",
      } satisfies TimelineSiteVisitRequestInput;
      const result = onCreateMilestoneSiteVisit
        ? await onCreateMilestoneSiteVisit(activeItem.id, requestPayload)
        : await requestDemoTimelineSiteVisit({
            activeItem,
            includedItemIds,
            milestone,
            note,
            requestSiteVisit,
            seedDemo,
            workspace,
          });

      onRequestMilestoneSiteVisit(activeItem.id, {
        ...requestPayload,
        ...(result ?? {}),
        ...(result?.url
          ? {
              url: normalizeSiteVisitTokenRoute({
                url: result.url,
              }),
            }
          : {}),
      });
    } catch (error) {
      setSiteVisitError(
        error instanceof Error
          ? error.message
          : "Unable to generate site visit token."
      );
    } finally {
      setSiteVisitPending(false);
    }
  };
  const recordSiteVisitComplete = async () => {
    if (!(siteVisit?.visitId && onRecordMilestoneSiteVisit)) {
      return;
    }
    setSiteVisitError("");
    setSiteVisitPending(true);
    try {
      await onRecordMilestoneSiteVisit(activeItem.id, {
        ...siteVisit,
        note: "Site visit completed from timeline review.",
        requestedDay: siteVisit.requestedDay,
        status: "complete",
        visitId: siteVisit.visitId,
      });
      onRequestMilestoneSiteVisit(activeItem.id, {
        ...siteVisit,
        note: siteVisit.note,
        requestedDay: siteVisit.requestedDay,
        status: "complete",
      });
    } catch (error) {
      setSiteVisitError(
        error instanceof Error ? error.message : "Unable to record site visit."
      );
    } finally {
      setSiteVisitPending(false);
    }
  };

  return (
    <div
      className="grid gap-4"
      data-testid={`lender-milestone-review-panel-${activeItem.id}`}
    >
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-200">
          <ClipboardCheck className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Lender milestone review
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {claim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem))
            ? "Completed on "
            : "Milestone completes on "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
          {claim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem)) ? (
            <span className="text-muted-foreground/80">
              {" "}
              (planned {formatTimelineDay(getMilestonePlannedEndX(activeItem))})
            </span>
          ) : null}
        </p>
        <Badge
          className="mt-3"
          variant={
            review?.status === "approved"
              ? "success"
              : claim
                ? "outline"
                : "secondary"
          }
        >
          {review?.status === "approved"
            ? "Completion approved"
            : review?.status === "revisionRequested"
              ? "Revision requested"
              : claim
                ? "Claim ready for review"
                : "No completion claim"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">
            {costAdjusted ? "Effective cost" : "Milestone cost"}
          </dt>
          <dd className="font-semibold tabular-nums">
            {money(costAdjusted ? effectiveCost : approvedBudget)}
          </dd>
        </div>
        {costAdjusted ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Approved budget</dt>
            <dd className="font-medium tabular-nums">
              {money(approvedBudget)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Claimed complete</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`lender-milestone-claimed-day-${activeItem.id}`}
          >
            {claim ? formatTimelineDay(claim.completedDay) : "Not claimed"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Actual cost</dt>
          <dd className="font-medium tabular-nums">
            {claim?.actualCost === undefined
              ? "Not provided"
              : money(claim.actualCost)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="font-medium tabular-nums">
            {evidenceAssets.length} images
          </dd>
        </div>
      </dl>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        onOpenSubmilestone={onOpenSubmilestone}
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-lender-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-lender-milestone-contractor"
      />

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-milestone-review-form-${activeItem.id}`}
        onSubmit={submitReview}
      >
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Completion review
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {canApproveMilestoneCompletion
              ? "Approve the builder claim or send it back for revision."
              : "Review the builder claim and send it back for revision when more information is required. Final approval is reserved for a lender admin."}
          </p>
        </div>
        {claim?.note ? (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Builder note: </span>
            {claim.note}
          </div>
        ) : null}
        <Textarea
          className="min-h-20 resize-none text-sm"
          data-testid={`lender-milestone-review-note-${activeItem.id}`}
          defaultValue={review?.note ?? ""}
          name="reviewNote"
          placeholder="Review note, missing evidence, or approval context"
        />
        <div
          className={cn(
            "grid gap-2",
            canApproveMilestoneCompletion && "grid-cols-2"
          )}
        >
          <Button
            data-testid={`lender-milestone-request-revision-${activeItem.id}`}
            disabled={!claim}
            name="reviewStatus"
            size="sm"
            type="submit"
            value="revisionRequested"
            variant="outline"
          >
            <AlertTriangle />
            Request revision
          </Button>
          {canApproveMilestoneCompletion ? (
            <Button
              data-testid={`lender-milestone-approve-${activeItem.id}`}
              disabled={!claim}
              name="reviewStatus"
              size="sm"
              type="submit"
              value="approved"
            >
              <Check />
              Approve
            </Button>
          ) : null}
        </div>
      </form>

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-site-visit-form-${activeItem.id}`}
        onSubmit={submitSiteVisit}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-[10px] text-muted-foreground uppercase">
              Site visit request
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Queue field verification without changing borrower state.
            </p>
          </div>
          <Badge
            variant={
              liveStatus === "complete"
                ? "success"
                : siteVisit
                  ? "outline"
                  : "secondary"
            }
          >
            {siteVisit ? liveStatus : "Optional"}
          </Badge>
        </div>
        <div className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Scope
          </span>
          <div className="grid gap-1.5">
            {eligibleSiteVisitItems.map((item) => {
              const checked =
                item.id === activeItem.id ||
                (siteVisit?.includedItemIds?.includes(item.id) ?? false);
              return (
                <label
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs"
                  key={`${activeItem.id}:${item.id}:${siteVisit?.visitId ?? "draft"}`}
                >
                  <input
                    className="size-3.5"
                    defaultChecked={checked}
                    disabled={item.id === activeItem.id || siteVisitPending}
                    name="includedSiteVisitItemId"
                    type="checkbox"
                    value={item.id}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.data?.name ?? item.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Target day
          </span>
          <Input
            data-testid={`lender-site-visit-day-${activeItem.id}`}
            defaultValue={siteVisit?.requestedDay ?? Math.round(activeItem.x)}
            min={0}
            name="siteVisitDay"
            nativeInput
            size="sm"
            type="number"
          />
        </label>
        <Textarea
          className="min-h-20 resize-none text-sm"
          data-testid={`lender-site-visit-note-${activeItem.id}`}
          defaultValue={siteVisit?.note ?? ""}
          name="siteVisitNote"
          placeholder="Inspector assignment, scope to verify, access notes"
        />
        {siteVisitUrl ? (
          <div
            className="grid gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-xs"
            data-testid={`lender-site-visit-share-link-${activeItem.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-emerald-800 dark:text-emerald-100">
                Shareable site visit link
              </span>
              <Badge variant="outline">{liveStatus}</Badge>
            </div>
            <a
              className="break-all font-mono text-[11px] text-primary underline-offset-2 hover:underline"
              href={siteVisitUrl}
              rel="noreferrer"
              target="_blank"
            >
              {siteVisitUrl}
            </a>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!siteVisitUrl}
                onClick={() =>
                  void navigator.clipboard?.writeText(siteVisitUrl)
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy />
                Copy
              </Button>
              <Button
                render={
                  <a href={siteVisitUrl} rel="noreferrer" target="_blank">
                    Open
                  </a>
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <ExternalLink />
                Open
              </Button>
            </div>
            {liveSiteVisit?.tokenExpiresAt ? (
              <p className="text-muted-foreground">
                Token expires{" "}
                {formatTimelineDateTime(liveSiteVisit.tokenExpiresAt)}.
              </p>
            ) : siteVisit?.tokenExpiresAt ? (
              <p className="text-muted-foreground">
                Token expires {formatTimelineDateTime(siteVisit.tokenExpiresAt)}
                .
              </p>
            ) : null}
            {onRecordMilestoneSiteVisit && liveStatus !== "complete" ? (
              <Button
                data-testid={`lender-site-visit-record-${activeItem.id}`}
                disabled={siteVisitPending}
                onClick={recordSiteVisitComplete}
                size="sm"
                type="button"
                variant="outline"
              >
                <Check />
                Record visit complete
              </Button>
            ) : null}
          </div>
        ) : null}
        {siteVisitError ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
            data-testid={`lender-site-visit-error-${activeItem.id}`}
          >
            {siteVisitError}
          </div>
        ) : null}
        <Button
          data-testid={`lender-site-visit-submit-${activeItem.id}`}
          disabled={siteVisitPending || liveStatus === "complete"}
          size="sm"
          type="submit"
          variant="outline"
        >
          {siteVisitPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <MapPinned />
          )}
          {siteVisitPending
            ? "Generating token..."
            : siteVisit
              ? "Regenerate site visit link"
              : "Request site visit"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Evidence queue
        </p>
        <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto pr-1">
          {evidenceAssets.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No evidence submitted yet.
            </p>
          ) : (
            evidenceAssets.map((asset) => (
              <div
                className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs"
                key={asset.id}
              >
                <Eye className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{asset.label}</span>
                <span className="text-muted-foreground">{asset.tag}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}
