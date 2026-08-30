"use client";

import { useState } from "react";

import { Accordion } from "#/components/ui/accordion.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { DrawReviewSheet } from "#/features/draw-workflow/DrawReviewSheet.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import type {
  BuildFundingModel,
  DrawRequestReceipt,
  FundingForecastRecord,
  FundingRejectAction,
  FundingRequestAction,
  FundingRequestRecord,
} from "./build-funding-contracts.ts";
import {
  completionReviewStatus,
  formatCad,
  formatDateTime,
  milestoneState,
  relativeDate,
  sumCents,
} from "./build-funding-contracts.ts";
import {
  ContactAdminDialog,
  DrawRequestComposer,
  WithdrawRequestDialog,
} from "./build-funding-request.tsx";
import {
  FundingDrawApprovalActions,
  FuturePlannedDraws,
  LenderReviewSidebar,
  PastPlannedDraws,
  drawApprovalDetails,
  drawDecisionDetails,
} from "./build-funding-review.tsx";
import {
  EmptyState,
  FundingGroup,
  MilestoneFundingSchedule,
  MilestoneSourceCard,
  RequestCardGrid,
} from "./build-funding-timeline.tsx";

export function BuildFundingWorkspace({
  drawCapabilities,
  model,
  onApproveDraw,
  onOpenMilestone,
  onOpenDrawCollaboration,
  onRejectDraw,
  onReleaseDraw,
  onRequestDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  onWithdrawDraw,
  viewerRole = "builder",
}: {
  drawCapabilities?: DrawWorkflowCapabilities;
  model: BuildFundingModel;
  onApproveDraw?: FundingRequestAction;
  onOpenMilestone: (milestoneKey: string) => void;
  onOpenDrawCollaboration?: (request: FundingRequestRecord) => void;
  onRejectDraw?: FundingRejectAction;
  onReleaseDraw?: FundingRequestAction;
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  viewerRole?: "builder" | "lender";
}) {
  const [density, setDensity] = useState<"guided" | "compact">("guided");
  const [selectedDrawKey, setSelectedDrawKey] = useState<string | null>(null);
  const submitted = model.requests.filter(
    (row) =>
      row.status === "requested" ||
      row.status === "in_review" ||
      row.status === "ready_for_admin"
  );
  const completed = model.requests.filter(
    (row) => row.status === "approved_for_release" || row.status === "released"
  );
  const closed = model.requests.filter(
    (row) => row.status === "withdrawn" || row.status === "rejected"
  );
  const approvedMilestones = model.milestones.filter(
    (row) => completionReviewStatus(row) === "approved"
  );
  const milestonesPendingReview = model.milestones.filter(
    (row) => milestoneState(row, model.startDate) === "pending"
  );
  const approvedAwaitingRelease = model.requests.filter(
    (row) => row.status === "approved_for_release"
  );
  const released = model.requests.filter((row) => row.status === "released");
  const requestSource = model.forecastDraws[0];
  const lenderView = viewerRole === "lender";
  const selectedDraw = model.requests.find(
    (request) => request.drawKey === selectedDrawKey
  );
  const openDrawApproval = (request: FundingRequestRecord) =>
    setSelectedDrawKey(request.drawKey);
  const workflowCapabilities = drawCapabilities ?? {
    canApprove: Boolean(onApproveDraw),
    canOpenCanonical: true,
    canOpenReview: lenderView,
    canReject: Boolean(onRejectDraw),
    canRelease: Boolean(onReleaseDraw),
    canStartReview: Boolean(onStartDrawReview),
    canSubmitForAdmin: Boolean(onSubmitDrawForAdmin),
  };

  return (
    <div className="min-w-0" data-testid="build-funding-workspace">
      <FundingWorkspaceHeader
        density={density}
        lenderView={lenderView}
        onDensityChange={setDensity}
      />

      <div className="grid items-start gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
          <Frame>
            <FramePanel className="p-0">
              <section
                aria-labelledby="available-balance-heading"
                className="p-5"
              >
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h3
                      className="font-semibold text-sm"
                      id="available-balance-heading"
                    >
                      {lenderView ? "Available to borrower" : "Available now"}
                    </h3>
                    {density === "guided" ? (
                      <p className="mt-1 max-w-lg text-muted-foreground text-xs">
                        {lenderView
                          ? "Approved milestone value less submitted, approved, and released draw requests."
                          : "Milestone approvals add money. Submitted and approved draw requests reserve money. Released draws remain in the history."}
                      </p>
                    ) : null}
                  </div>
                  <p
                    className="font-heading font-semibold text-3xl tabular-nums tracking-tight"
                    data-testid="funding-available-amount"
                  >
                    {formatCad(model.availableCents)}
                  </p>
                </div>

                <Accordion
                  className="mt-4 border-y"
                  defaultValue={
                    lenderView ? ["submitted", "completed"] : ["submitted"]
                  }
                  multiple
                >
                  <FundingGroup
                    amountCents={model.approvedMilestoneCents}
                    description={`${approvedMilestones.length} approved milestone${approvedMilestones.length === 1 ? "" : "s"}`}
                    id="approved"
                    label="Approved milestone unlocks"
                    tone="positive"
                  >
                    <div className="grid gap-2 pb-1 sm:grid-cols-2">
                      {approvedMilestones.map((milestone) => (
                        <MilestoneSourceCard
                          key={milestone.key}
                          milestone={milestone}
                          onOpen={() => onOpenMilestone(milestone.key)}
                          startDate={model.startDate}
                        />
                      ))}
                      {approvedMilestones.length === 0 ? (
                        <EmptyState copy="No milestone money has been approved yet." />
                      ) : null}
                    </div>
                  </FundingGroup>
                  <FundingGroup
                    amountCents={sumCents(submitted)}
                    description={`${submitted.length} submitted request${submitted.length === 1 ? "" : "s"}`}
                    id="submitted"
                    label="Submitted draw requests"
                    tone="pending"
                  >
                    <RequestCardGrid
                      drawCapabilities={workflowCapabilities}
                      onOpenDraw={openDrawApproval}
                      requests={submitted}
                    />
                  </FundingGroup>
                  <FundingGroup
                    amountCents={sumCents(completed)}
                    description={`${completed.length} approved or released request${completed.length === 1 ? "" : "s"}`}
                    id="completed"
                    label="Approved / released draws"
                    tone="outflow"
                  >
                    <RequestCardGrid
                      drawCapabilities={workflowCapabilities}
                      onOpenDraw={openDrawApproval}
                      requests={completed}
                    />
                  </FundingGroup>
                  {closed.length > 0 ? (
                    <FundingGroup
                      amountCents={sumCents(closed)}
                      description={`${closed.length} closed request${closed.length === 1 ? "" : "s"}`}
                      id="closed"
                      label="Withdrawn / rejected requests"
                      tone="neutral"
                    >
                      <RequestCardGrid
                        drawCapabilities={workflowCapabilities}
                        onOpenDraw={openDrawApproval}
                        requests={closed}
                      />
                    </FundingGroup>
                  ) : null}
                </Accordion>
                <div className="flex items-center justify-between border-b py-3 font-medium text-sm">
                  <span>
                    {lenderView ? "Available to borrower" : "Available now"}
                  </span>
                  <span className="font-heading text-base tabular-nums">
                    {formatCad(model.availableCents)}
                  </span>
                </div>
              </section>
            </FramePanel>
          </Frame>
        </div>

        {lenderView ? (
          <LenderReviewSidebar
            approvedAwaitingRelease={approvedAwaitingRelease}
            buildLabel={model.buildLabel}
            density={density}
            drawCapabilities={workflowCapabilities}
            forecastDraws={model.forecastDraws}
            historicalPlannedDraws={model.historicalPlannedDraws}
            milestonesPendingReview={milestonesPendingReview}
            onApproveDraw={onApproveDraw}
            onOpenDraw={openDrawApproval}
            onOpenMilestone={onOpenMilestone}
            onRejectDraw={onRejectDraw}
            onReleaseDraw={onReleaseDraw}
            onStartDrawReview={onStartDrawReview}
            onSubmitDrawForAdmin={onSubmitDrawForAdmin}
            released={released}
            startDate={model.startDate}
            submitted={submitted}
          />
        ) : (
          <BuilderRequestSidebar
            availableCents={model.availableCents}
            density={density}
            drawKey={requestSource?.drawKey ?? "unplanned"}
            forecastDraws={model.forecastDraws}
            historicalPlannedDraws={model.historicalPlannedDraws}
            modelAccess={model.access}
            onOpenDraw={openDrawApproval}
            onRequestDraw={onRequestDraw}
            onWithdrawDraw={onWithdrawDraw}
            startDate={model.startDate}
            submitted={submitted}
          />
        )}

        <div className="order-3 min-w-0 xl:col-start-1 xl:row-start-2">
          <MilestoneFundingSchedule
            backlogCents={model.backlogMilestoneCents}
            milestones={model.milestones}
            onOpenMilestone={onOpenMilestone}
            pendingCents={model.pendingMilestoneCents}
            showGuidance={density === "guided"}
            startDate={model.startDate}
            viewerRole={viewerRole}
          />
        </div>
      </div>

      <FundingDrawApprovalSheet
        capabilities={workflowCapabilities}
        model={model}
        onApproveDraw={onApproveDraw}
        onClose={() => setSelectedDrawKey(null)}
        onOpenCollaboration={onOpenDrawCollaboration}
        onRejectDraw={onRejectDraw}
        onReleaseDraw={onReleaseDraw}
        onStartDrawReview={onStartDrawReview}
        onSubmitDrawForAdmin={onSubmitDrawForAdmin}
        onWithdrawDraw={onWithdrawDraw}
        request={selectedDraw}
        viewerRole={viewerRole}
      />
    </div>
  );
}

const FUNDING_ASIDE_CLASS =
  "order-2 min-w-0 border-t pt-5 xl:sticky xl:top-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6";

function FundingWorkspaceHeader({
  density,
  lenderView,
  onDensityChange,
}: {
  density: "guided" | "compact";
  lenderView: boolean;
  onDensityChange: (density: "guided" | "compact") => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div className="max-w-xl">
        <p className="text-muted-foreground text-xs">
          Details / {lenderView ? "Funding review" : "Draws"}
        </p>
        <h2 className="mt-1 font-heading font-semibold text-xl">
          {lenderView ? "Review funding and release" : "Available to request"}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {lenderView
            ? "Verify completed work, decide submitted draw requests, and release approved funds from one reconciled view."
            : "Approved milestone money becomes available here. Submitted requests reserve that balance until they are withdrawn, rejected, or released."}
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-lg border p-1">
        <Button
          aria-pressed={density === "guided"}
          onClick={() => onDensityChange("guided")}
          size="sm"
          variant={density === "guided" ? "secondary" : "ghost"}
        >
          Explained
        </Button>
        <Button
          aria-pressed={density === "compact"}
          onClick={() => onDensityChange("compact")}
          size="sm"
          variant={density === "compact" ? "secondary" : "ghost"}
        >
          Compact
        </Button>
      </div>
    </div>
  );
}

function BuilderRequestSidebar({
  availableCents,
  density,
  drawKey,
  forecastDraws,
  historicalPlannedDraws,
  modelAccess,
  onOpenDraw,
  onRequestDraw,
  onWithdrawDraw,
  startDate,
  submitted,
}: {
  availableCents: number;
  density: "guided" | "compact";
  drawKey: string;
  forecastDraws: FundingForecastRecord[];
  historicalPlannedDraws: FundingForecastRecord[];
  modelAccess: BuildFundingModel["access"];
  onOpenDraw: (request: FundingRequestRecord) => void;
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  startDate: string;
  submitted: FundingRequestRecord[];
}) {
  return (
    <aside className={FUNDING_ASIDE_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">Requests</h3>
        <Badge variant="secondary">{submitted.length} active</Badge>
      </div>
      {density === "guided" ? (
        <p className="mt-1 text-muted-foreground text-xs">
          Fairlend reviews and releases each request separately.
        </p>
      ) : null}

      <DrawRequestComposer
        availableCents={availableCents}
        disabled={modelAccess !== "full" || !onRequestDraw}
        drawKey={drawKey}
        onRequestDraw={onRequestDraw}
      />
      {modelAccess === "read-only" ? (
        <p className="mt-2 text-muted-foreground text-xs">
          You have view-only access. Ask an account administrator to submit a
          request.
        </p>
      ) : availableCents <= 0 ? (
        <div className="mt-2">
          <p className="text-muted-foreground text-xs">
            No approved milestone money is available to request yet.
          </p>
          <div className="mt-2">
            <ContactAdminDialog />
          </div>
        </div>
      ) : null}

      <div className="mt-4 divide-y border-y">
        {submitted.map((request) => (
          <article className="py-3" key={request.drawKey}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-sm tabular-nums">
                  {formatCad(request.amountCents)}
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {request.displayId ?? request.drawKey} · submitted{" "}
                  {relativeDate(request.requestedAt)}
                </p>
              </div>
              <Badge variant="info">Submitted</Badge>
            </div>
            <p className="mt-2 text-muted-foreground text-xs">
              Waiting for Fairlend review. You can withdraw this request until
              it is approved.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => onOpenDraw(request)}
                size="sm"
                variant="outline"
              >
                Open draw
              </Button>
              <ContactAdminDialog />
              {onWithdrawDraw ? (
                <WithdrawRequestDialog
                  onWithdraw={() => onWithdrawDraw(request.drawKey)}
                />
              ) : null}
            </div>
          </article>
        ))}
        {submitted.length === 0 ? (
          <p className="py-4 text-muted-foreground text-xs">
            No requests are awaiting approval.
          </p>
        ) : null}
      </div>

      <FuturePlannedDraws
        density={density}
        draws={forecastDraws}
        startDate={startDate}
      />
      <PastPlannedDraws draws={historicalPlannedDraws} startDate={startDate} />
    </aside>
  );
}

function FundingDrawApprovalSheet({
  capabilities,
  model,
  onApproveDraw,
  onClose,
  onOpenCollaboration,
  onRejectDraw,
  onReleaseDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  onWithdrawDraw,
  request,
  viewerRole,
}: {
  capabilities: DrawWorkflowCapabilities;
  model: BuildFundingModel;
  onApproveDraw?: FundingRequestAction;
  onClose: () => void;
  onOpenCollaboration?: (request: FundingRequestRecord) => void;
  onRejectDraw?: FundingRejectAction;
  onReleaseDraw?: FundingRequestAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  request?: FundingRequestRecord;
  viewerRole: "builder" | "lender";
}) {
  if (!request) {
    return null;
  }
  return (
    <DrawReviewSheet
      actions={
        <FundingDrawApprovalActions
          buildLabel={model.buildLabel}
          capabilities={capabilities}
          onApproveDraw={onApproveDraw}
          onClose={onClose}
          onRejectDraw={onRejectDraw}
          onReleaseDraw={onReleaseDraw}
          onStartDrawReview={onStartDrawReview}
          onSubmitDrawForAdmin={onSubmitDrawForAdmin}
          onWithdrawDraw={onWithdrawDraw}
          request={request}
          viewerRole={viewerRole}
        />
      }
      amountCents={request.amountCents}
      builder={model.builder}
      buildLabel={model.buildLabel}
      collaborationAction={
        onOpenCollaboration ? (
          <Button
            onClick={() => onOpenCollaboration(request)}
            variant="outline"
          >
            Open Draw System Post
          </Button>
        ) : undefined
      }
      contextBadge={<Badge variant="outline">{model.buildLabel}</Badge>}
      details={drawApprovalDetails(request)}
      displayId={request.displayId ?? request.drawKey}
      drawLabel={request.label}
      funding={{
        availableAfterRequestCents: model.availableCents,
        drawAvailabilityCents: Math.max(
          0,
          model.availableCents +
            (request.status === "released" ||
            request.status === "rejected" ||
            request.status === "withdrawn"
              ? 0
              : request.amountCents)
        ),
        drawnCents: model.drawnCents,
        receiptCoverageCents: model.receiptCoverageCents,
        totalApprovedCents: model.unlockedCents,
      }}
      location={model.location}
      onClose={onClose}
      open
      privateDetails={drawDecisionDetails(request)}
      requestNote={request.requestNote}
      status={request.status}
      submittedAt={
        request.requestedAt ? formatDateTime(request.requestedAt) : undefined
      }
      viewerRole={viewerRole === "builder" ? "builder" : "backoffice"}
    />
  );
}
