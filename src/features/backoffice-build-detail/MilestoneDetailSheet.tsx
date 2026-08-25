"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Play,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import { formatDate } from "./format";
import type {
  MilestoneDetailSheetProps,
  MilestoneSheetData,
  MilestoneSheetSubmilestone,
} from "./milestone-detail-sheet-contracts.ts";
import {
  MilestoneCollaborationLinks,
  MilestoneCostDocumentAggregate,
  MilestoneEvidenceAggregate,
  MilestoneOverviewContent,
} from "./milestone-detail-sheet-sections.tsx";
import { errorMessageFor } from "./milestone-detail-sheet-utils.ts";

export type {
  MilestoneCostDocumentPage,
  MilestoneDetailSheetProps,
  MilestoneDisplayState,
  MilestoneSheetData,
  MilestoneSheetSubmilestone,
  SubmilestoneReviewState,
  SubmilestoneReviewSummary,
  WorkState,
} from "./milestone-detail-sheet-contracts.ts";


// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The parent surface coordinates canonical routing, milestone completion, and lender decisions in one sheet.
export function MilestoneDetailSheet({
  assignmentsSourceLabel,
  data,
  errorMessage,
  eventsSourceLabel,
  focusedSubmilestoneId,
  footer,
  onApprove,
  onAmendStart,
  onAssignVisit,
  onClose,
  onOpenCanonicalTarget,
  onOpenCostDocument,
  onOpenCostDocumentPage,
  onReject,
  onRequestInfo,
  onStartWork,
  onSubmitCompletion,
  pending: externalPending,
  readOnly = false,
  collaboration,
  reviewLayer,
  renderSubmilestoneReviewItems,
  showSiteVisitFieldLink = true,
  submilestoneReviewActions,
  siteVisits,
}: MilestoneDetailSheetProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [milestoneNote, setMilestoneNote] = useState("");
  const [activeSection, setActiveSection] = useState("overview");

  const rows = useMemo(() => data?.submilestones ?? [], [data?.submilestones]);
  const incomplete = rows.filter((row) => row.status !== "complete");
  const completedCount = rows.length - incomplete.length;
  const eligible = rows.length === 0 || incomplete.length === 0;

  if (!data) {
    return null;
  }

  const openCanonicalForRow = (
    row: MilestoneSheetSubmilestone | undefined,
    selectedTab: BuildSubmilestoneDetailTab
  ) => {
    if (!(row?.submilestoneId && onOpenCanonicalTarget)) {
      setLocalError(
        "This Sub-milestone is not available in the canonical detail surface. Refresh the Build and try again."
      );
      return false;
    }
    setLocalError(null);
    onOpenCanonicalTarget(
      { kind: "submilestone", submilestoneId: row.submilestoneId },
      { selectedTab }
    );
    return true;
  };

  const submitCompletion = async () => {
    if (!(eligible && onSubmitCompletion) || data.submittedAt) {
      return;
    }
    setPendingKey("milestone-submit");
    setLocalError(null);
    try {
      const actualCosts = rows
        .map((row) => row.actualCostCents)
        .filter((value): value is number => typeof value === "number");
      await onSubmitCompletion({
        ...(actualCosts.length > 0
          ? {
              actualCostCents: actualCosts.reduce(
                (sum, value) => sum + value,
                0
              ),
            }
          : {}),
        completedDay: data.currentDay ?? 0,
        idempotencyKey: crypto.randomUUID(),
        milestoneKey: data.milestoneKey,
        ...(milestoneNote.trim() ? { note: milestoneNote.trim() } : {}),
      });
    } catch (error) {
      setLocalError(errorMessageFor(error));
    } finally {
      setPendingKey(null);
    }
  };

  const openRemainingScope = () => {
    const firstIncomplete = incomplete[0];
    if (firstIncomplete) {
      openCanonicalForRow(firstIncomplete, "review");
      return;
    }
    setLocalError(
      "No canonical Sub-milestone is available for the remaining scope."
    );
  };

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetPopup
        className="w-full sm:max-w-[720px]"
        closeProps={
          { "data-testid": "milestone-detail-sheet-close" } as Record<
            string,
            string
          >
        }
        data-collaboration-focus={
          focusedSubmilestoneId
            ? `submilestone:${focusedSubmilestoneId}`
            : undefined
        }
        data-testid="milestone-detail-sheet-panel"
        side="right"
      >
        <SheetHeader
          className="border-b px-4 py-4 sm:px-6"
          data-testid="milestone-detail-sheet"
        >
          <div className="pr-8">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
              Milestone execution
            </p>
            <SheetTitle className="mt-1">{data.name}</SheetTitle>
            <SheetDescription className="mt-1">
              {data.column}
              {data.drawGroupKey
                ? ` · Linked draw ${data.drawGroupKey.toUpperCase()}`
                : null}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{data.milestoneKey.toUpperCase()}</Badge>
              <Badge variant={eligible ? "success" : "secondary"}>
                <ListChecks />
                {completedCount}/{rows.length} complete
              </Badge>
              {data.submittedAt ? (
                <Badge variant={eligible ? "success" : "warning"}>
                  <CheckCircle2 />
                  {eligible
                    ? "Submitted for lender review"
                    : "Claim submitted · scope incomplete"}
                </Badge>
              ) : null}
              {data.actualStartedAt ? (
                <Badge variant="info">
                  Actual start {formatDate(data.actualStartedAt)}
                </Badge>
              ) : data.status === "in_progress" ||
                data.status === "complete" ? (
                <Badge variant="warning">Actual start unknown</Badge>
              ) : null}
            </div>
            {assignmentsSourceLabel ? (
              <p className="sr-only">Assignments · {assignmentsSourceLabel}</p>
            ) : null}
            {eventsSourceLabel ? (
              <p className="sr-only">Recent events · {eventsSourceLabel}</p>
            ) : null}
          </div>
        </SheetHeader>

        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={(value) => setActiveSection(String(value))}
          value={activeSection}
        >
          <div className="shrink-0 border-b px-4 pt-1 sm:px-6">
            <TabsList
              aria-label="Milestone detail sections"
              className="w-full max-w-full justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="overview">Overview</TabsTab>
              <TabsTab value="evidence">Evidence</TabsTab>
              <TabsTab value="receipts-invoices">Receipts / invoices</TabsTab>
              <TabsTab value="collaboration">Collaboration</TabsTab>
            </TabsList>
          </div>
          <SheetPanel className="min-h-0 px-3 sm:px-5">
            <TabsPanel className="grid gap-4 pt-4" value="overview">
              <MilestoneOverviewContent
                data={data}
                errorMessage={errorMessage}
                localError={localError}
                onOpenCanonicalTarget={onOpenCanonicalTarget}
                onOpenCostDocument={onOpenCostDocument}
                openCanonicalForRow={openCanonicalForRow}
                renderSubmilestoneReviewItems={renderSubmilestoneReviewItems}
                reviewLayer={reviewLayer}
                rows={rows}
                showSiteVisitFieldLink={showSiteVisitFieldLink}
                siteVisits={siteVisits}
                submilestoneReviewActions={submilestoneReviewActions}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="evidence">
              <MilestoneEvidenceAggregate
                onOpen={openCanonicalForRow}
                rows={rows}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="receipts-invoices">
              <MilestoneCostDocumentAggregate
                onOpen={openCanonicalForRow}
                onOpenCostDocument={onOpenCostDocument}
                onOpenCostDocumentPage={onOpenCostDocumentPage}
                rows={rows}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="collaboration">
              {collaboration ?? (
                <MilestoneCollaborationLinks
                  onOpen={openCanonicalForRow}
                  rows={rows}
                />
              )}
            </TabsPanel>
          </SheetPanel>
        </Tabs>

        {footer ? (
          <SheetFooter className="z-20 flex-col items-stretch gap-3 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-col sm:items-stretch sm:px-6">
            {footer}
          </SheetFooter>
        ) : readOnly ? (
          <SheetFooter className="z-20 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                This lender record is read-only.
              </p>
              <Button onClick={onClose} size="sm" variant="outline">
                Close
              </Button>
            </div>
          </SheetFooter>
        ) : (
          <SheetFooter className="z-20 flex-col items-stretch gap-3 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-col sm:items-stretch sm:px-6">
            <div
              className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              data-testid="milestone-footer-summary"
            >
              <div className="min-w-0 flex-1 text-left">
                <p className="font-medium text-sm">
                  {eligible
                    ? data.submittedAt
                      ? "Completion submitted"
                      : "All submilestones are complete"
                    : `${incomplete.length} submilestone${incomplete.length === 1 ? "" : "s"} still incomplete`}
                </p>
                <p className="text-muted-foreground text-xs sm:truncate">
                  {eligible
                    ? data.submittedAt
                      ? `Submitted ${formatDate(data.submittedAt)} for lender review.`
                      : "Ready to submit the builder completion claim."
                    : "Open the first incomplete Sub-milestone to continue its canonical review."}
                </p>
              </div>
              {data.canStartWork && onStartWork ? (
                <Button
                  data-testid="milestone-detail-sheet-start-work"
                  disabled={Boolean(externalPending || pendingKey)}
                  onClick={() =>
                    onStartWork(
                      data.milestoneKey,
                      milestoneNote.trim() || undefined
                    )
                  }
                  variant="outline"
                >
                  <Play /> Start work
                </Button>
              ) : null}
              {data.actualStartedAt && onAmendStart ? (
                <>
                  <Button
                    onClick={() => onAmendStart("correct", data.milestoneKey)}
                    size="sm"
                    variant="outline"
                  >
                    Correct start
                  </Button>
                  <Button
                    onClick={() => onAmendStart("retract", data.milestoneKey)}
                    size="sm"
                    variant="ghost"
                  >
                    Retract start
                  </Button>
                </>
              ) : null}
              <Button
                className="shrink-0"
                data-testid="milestone-primary-completion-action"
                disabled={Boolean(
                  (eligible && data.submittedAt) ||
                    externalPending ||
                    pendingKey
                )}
                loading={pendingKey === "milestone-submit"}
                onClick={eligible ? submitCompletion : openRemainingScope}
              >
                {eligible ? <ClipboardCheck /> : <ListChecks />}
                {eligible
                  ? data.submittedAt
                    ? "Completion submitted"
                    : "Submit milestone completion"
                  : "Complete remaining scope"}
              </Button>
            </div>
            {onApprove || onRequestInfo || onAssignVisit || onReject ? (
              <LegacyReviewActions
                data={data}
                note={milestoneNote}
                onApprove={onApprove}
                onAssignVisit={onAssignVisit}
                onNoteChange={setMilestoneNote}
                onReject={onReject}
                onRequestInfo={onRequestInfo}
              />
            ) : null}
          </SheetFooter>
        )}
      </SheetPopup>
    </Sheet>
  );
}


function LegacyReviewActions({
  data,
  note,
  onApprove,
  onAssignVisit,
  onNoteChange,
  onReject,
  onRequestInfo,
}: {
  data: MilestoneSheetData;
  note: string;
  onApprove?: MilestoneDetailSheetProps["onApprove"];
  onAssignVisit?: MilestoneDetailSheetProps["onAssignVisit"];
  onNoteChange: (value: string) => void;
  onReject?: MilestoneDetailSheetProps["onReject"];
  onRequestInfo?: MilestoneDetailSheetProps["onRequestInfo"];
}) {
  return (
    <div
      className="flex w-full flex-col items-stretch gap-2"
      data-testid="milestone-review-actions"
    >
      {onApprove || onRequestInfo ? (
        <Textarea
          aria-label="Milestone decision note"
          className="min-w-0"
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Add a decision note"
          value={note}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onAssignVisit ? (
          <Button
            onClick={() => onAssignVisit(data.milestoneKey)}
            size="sm"
            variant="outline"
          >
            Assign Site Visit
          </Button>
        ) : null}
        {onRequestInfo ? (
          <Button
            onClick={() => onRequestInfo(data.milestoneKey, note.trim())}
            size="sm"
            variant="outline"
          >
            Request changes
          </Button>
        ) : null}
        {onReject ? (
          <Button
            onClick={() => onReject(data.milestoneKey)}
            size="sm"
            variant="ghost"
          >
            Reject milestone
          </Button>
        ) : null}
        {onApprove ? (
          <Button
            onClick={() =>
              onApprove(data.milestoneKey, note.trim() || undefined)
            }
            size="sm"
          >
            Approve milestone
          </Button>
        ) : null}
      </div>
    </div>
  );
}
