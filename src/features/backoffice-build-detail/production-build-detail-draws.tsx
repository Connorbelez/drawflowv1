"use client";
import type * as React from "react";
import {
  lazy,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  type DrawWorkflowCapabilities,
} from "#/features/draw-workflow/drawWorkflow.ts";
import { cn } from "#/lib/utils.ts";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatCents, formatDate, } from "./format";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionDrawStatus,
  ProductionFacilityChangeRequest,
} from "./production-build-detail-contracts.ts";
import { drawBadgeVariant } from "./production-build-detail-evidence-utils.ts";
import { Label } from "./production-build-detail-build-sheets.tsx";
import { DrawActionGroup } from "./production-build-detail-draw-overview.tsx";
import {
  addDaysSafe,
  drawStatusLabel,
} from "./production-build-detail-projection.ts";

export function ProductionDrawsTable({
  actions,
  detail,
  drawCapabilities,
  onOpenDraw,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  drawCapabilities?: DrawWorkflowCapabilities;
  onOpenDraw?: (draw: ProductionDraw) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [pendingDraw, setPendingDraw] = useState<string | null>(null);
  const [error, setError] = useState("");
  const workflowCapabilities = {
    ...(drawCapabilities ?? {
      canApprove: Boolean(actions?.approveDraw),
      canOpenCanonical: Boolean(onOpenDraw),
      canOpenReview: Boolean(onOpenDraw) && viewerRole === "lender",
      canReject: Boolean(actions?.rejectDraw),
      canRelease: Boolean(actions?.releaseDraw),
      canStartReview: Boolean(actions?.startDrawReview),
      canSubmitForAdmin: Boolean(actions?.submitDrawForAdmin),
    }),
    canRelease: false,
  } satisfies DrawWorkflowCapabilities;

  const run = async (
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown,
    actionKey = "request"
  ) => {
    if (!fn || pendingDraw) {
      return false;
    }
    setPendingDraw(`${actionKey}:${draw.drawKey}`);
    setError("");
    try {
      await fn(draw);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPendingDraw(null);
    }
  };

  return (
    <Card data-testid="build-detail-draws" id="draws-table">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <CardTitle className="text-sm">Draws</CardTitle>
        <span className="shrink-0 text-right text-muted-foreground text-xs">
          planned_draw_schedule_rows
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-card/70 text-muted-foreground text-xs uppercase">
              <tr>
                <Th>Draw</Th>
                <Th>Approved</Th>
                <Th>Requested</Th>
                <Th>Planned</Th>
                <Th>Actual</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {projection.draws.map((draw) => {
                const pending =
                  pendingDraw?.endsWith(`:${draw.drawKey}`) ?? false;
                return (
                  <tr
                    className="border-border border-t"
                    data-draw-key={draw.drawKey}
                    data-testid={`build-detail-draw-row-${draw.drawKey}`}
                    key={draw.drawKey}
                  >
                    <Td>{draw.label}</Td>
                    <Td className="tabular-nums">
                      {formatCents(draw.amountCents)}
                    </Td>
                    <Td className="tabular-nums">
                      {draw.status === "requested" ||
                      draw.status === "in_review" ||
                      draw.status === "ready_for_admin" ||
                      draw.status === "approved_for_release" ||
                      draw.status === "released"
                        ? formatCents(draw.amountCents)
                        : "-"}
                    </Td>
                    <Td>
                      {formatDate(
                        addDaysSafe(detail.build.startDate, draw.timingDay)
                      )}
                    </Td>
                    <Td>
                      {draw.releaseDate ? formatDate(draw.releaseDate) : "-"}
                    </Td>
                    <Td>
                      <StatusChip status={draw.status} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                        {viewerRole === "builder" &&
                        (draw.status === "planned" ||
                          draw.status === "rejected") ? (
                          <DrawActionButton
                            disabled={!actions?.requestDraw || pending}
                            label={pending ? "Requesting..." : "Request"}
                            onClick={() =>
                              run(draw, actions?.requestDraw, "request")
                            }
                            testId={`build-detail-draw-request-${draw.drawKey}`}
                          />
                        ) : null}
                        {viewerRole === "lender" ? (
                          <DrawActionGroup
                            actions={actions}
                            actionTestIdPrefix="build-detail-draw"
                            buildLabel={detail.build.buildName}
                            draw={draw}
                            drawCapabilities={workflowCapabilities}
                            onOpenDraw={onOpenDraw}
                            onRunAction={(actionKey, targetDraw, fn) =>
                              run(targetDraw, fn, actionKey)
                            }
                            pendingActionKey={pendingDraw}
                          />
                        ) : null}
                        {draw.status === "released" ? (
                          <span className="text-muted-foreground text-xs">
                            Released
                          </span>
                        ) : null}
                        {viewerRole === "lender" &&
                        (draw.status === "planned" ||
                          draw.status === "rejected") ? (
                          <span className="text-muted-foreground text-xs">
                            Awaiting request
                          </span>
                        ) : null}
                        {viewerRole === "builder" &&
                        (draw.status === "requested" ||
                          draw.status === "in_review" ||
                          draw.status === "ready_for_admin") ? (
                          <span className="text-muted-foreground text-xs">
                            In lender review
                          </span>
                        ) : null}
                        {viewerRole === "builder" &&
                        draw.status === "approved_for_release" ? (
                          <span className="text-muted-foreground text-xs">
                            Awaiting release
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error ? (
          <p className="mt-2 text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DrawActionButton({
  disabled,
  label,
  onClick,
  testId,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="rounded-md border border-primary/40 bg-primary/20 px-2 py-1 text-xs disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function FacilityChangeRequestsCard({
  actions,
  detail,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
}) {
  const [principalText, setPrincipalText] = useState(
    String(Math.round((detail.loanFacility?.principalCents ?? 0) / 100))
  );
  const [paybackDate, setPaybackDate] = useState(
    detail.loanFacility?.paybackDate ?? detail.build.startDate
  );
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const requests = detail.facilityChangeRequests ?? [];
  const pendingRequests = requests.filter(
    (request) => request.status === "requested"
  );

  const run = async (key: string, fn?: () => Promise<unknown> | unknown) => {
    if (!fn || pending) {
      return;
    }
    setPending(key);
    setError("");
    try {
      await fn();
      if (key.startsWith("request")) {
        setReason("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending("");
    }
  };

  const requestPrincipal = () =>
    run("request-principal", () =>
      actions?.requestFacilityChange?.({
        reason: reason.trim() || undefined,
        requestedPrincipalCents: Math.round(Number(principalText) * 100),
        requestType: "principalIncrease",
      })
    );
  const requestPayback = () =>
    run("request-payback", () =>
      actions?.requestFacilityChange?.({
        reason: reason.trim() || undefined,
        requestedPaybackDate: paybackDate,
        requestType: "paybackExtension",
      })
    );
  const review = (
    request: ProductionFacilityChangeRequest,
    status: "approved" | "rejected"
  ) =>
    run(`${status}-${request._id}`, () =>
      actions?.reviewFacilityChangeRequest?.({
        note: reviewNote.trim() || undefined,
        requestId: request._id,
        status,
      })
    );

  return (
    <Card data-testid="facility-change-requests">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <div>
          <CardTitle className="text-sm">Capital and term requests</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            Builder requests for principal increases and payback extensions.
          </p>
        </div>
        <Badge variant={pendingRequests.length > 0 ? "default" : "outline"}>
          {pendingRequests.length} pending
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 p-3 pt-0 sm:p-4 sm:pt-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-[130px_1fr]">
            <Label>Current principal</Label>
            <dd className="font-medium tabular-nums">
              {formatCents(detail.loanFacility?.principalCents ?? 0)}
            </dd>
            <Label>Current payback</Label>
            <dd className="font-medium">
              {detail.loanFacility?.paybackDate
                ? formatDate(detail.loanFacility.paybackDate)
                : "Not set"}
            </dd>
          </dl>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Requested principal</span>
              <input
                className="rounded-md border border-border bg-background px-2 py-2 tabular-nums"
                data-testid="facility-principal-input"
                min={0}
                onChange={(event) => setPrincipalText(event.target.value)}
                step={5000}
                type="number"
                value={principalText}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Requested payback date</span>
              <input
                className="rounded-md border border-border bg-background px-2 py-2"
                data-testid="facility-payback-input"
                onChange={(event) => setPaybackDate(event.target.value)}
                type="date"
                value={paybackDate}
              />
            </label>
          </div>
          <textarea
            className="mt-2 min-h-[64px] w-full rounded-md border border-border bg-background p-2 text-xs"
            data-testid="facility-change-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for the request"
            value={reason}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <DrawActionButton
              disabled={!actions?.requestFacilityChange || Boolean(pending)}
              label={
                pending === "request-principal"
                  ? "Requesting..."
                  : "Request principal"
              }
              onClick={requestPrincipal}
              testId="facility-request-principal"
            />
            <DrawActionButton
              disabled={!actions?.requestFacilityChange || Boolean(pending)}
              label={
                pending === "request-payback"
                  ? "Requesting..."
                  : "Request extension"
              }
              onClick={requestPayback}
              testId="facility-request-payback"
            />
          </div>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="font-medium text-sm">Review queue</p>
            <input
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              data-testid="facility-review-note"
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Review note"
              value={reviewNote}
            />
          </div>
          {requests.length === 0 ? (
            <p className="rounded-md border border-border border-dashed p-3 text-muted-foreground text-xs">
              No capital or term requests have been submitted.
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.slice(0, 5).map((request) => (
                <li
                  className="rounded-md border border-border bg-card/50 p-2 text-xs"
                  data-testid={`facility-change-request-${request._id}`}
                  key={request._id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {facilityRequestLabel(request)}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDate(request.createdAt)} by{" "}
                        {request.requestedByWorkosUserId}
                      </p>
                    </div>
                    <StatusPill status={request.status} />
                  </div>
                  {request.reason ? (
                    <p className="mt-2 text-muted-foreground">
                      {request.reason}
                    </p>
                  ) : null}
                  {request.status === "requested" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <DrawActionButton
                        disabled={
                          !actions?.reviewFacilityChangeRequest ||
                          Boolean(pending)
                        }
                        label="Approve"
                        onClick={() => review(request, "approved")}
                        testId={`facility-approve-${request._id}`}
                      />
                      <DrawActionButton
                        disabled={
                          !actions?.reviewFacilityChangeRequest ||
                          Boolean(pending)
                        }
                        label="Deny"
                        onClick={() => review(request, "rejected")}
                        testId={`facility-deny-${request._id}`}
                      />
                    </div>
                  ) : request.reviewNote ? (
                    <p className="mt-2 text-muted-foreground">
                      Review: {request.reviewNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p className="mt-2 text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BudgetRevisionCard({
  actions,
  detail,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  viewerRole: "builder" | "lender";
}) {
  const current = detail.capitalPlan;
  const requests = detail.budgetRevisionRequests ?? [];
  const pendingRequest = requests.find(
    (request) => request.status === "requested"
  );
  const [workingCapital, setWorkingCapital] = useState(
    String(Math.round((current?.borrowerStartingCashCents ?? 0) / 100))
  );
  const [policyLimit, setPolicyLimit] = useState(
    String(Math.round((current?.lenderDrawPolicyLimitCents ?? 0) / 100))
  );
  const [loanPercentage, setLoanPercentage] = useState(
    String((10_000 - (current?.borrowerCoPayBps ?? 0)) / 100)
  );
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");

  const run = async (key: string, action: () => Promise<unknown> | unknown) => {
    if (pendingAction) {
      return;
    }
    setPendingAction(key);
    setError("");
    try {
      await action();
      setReason("");
      setReviewNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction("");
    }
  };
  const requestRevision = () =>
    run("request", () =>
      actions?.requestBudgetRevision?.({
        borrowerCoPayBps: 10_000 - Math.round(Number(loanPercentage) * 100),
        borrowerStartingCashCents: Math.round(Number(workingCapital) * 100),
        lenderDrawPolicyLimitCents: Math.round(Number(policyLimit) * 100),
        reason: reason.trim(),
      })
    );
  const reviewRevision = (status: "approved" | "rejected") => {
    if (!pendingRequest) {
      return;
    }
    return run(status, () =>
      actions?.reviewBudgetRevision?.({
        note: reviewNote.trim(),
        requestId: pendingRequest._id,
        status,
      })
    );
  };

  return (
    <Card data-testid="budget-revision-governance">
      <CardHeader className="flex flex-row items-start justify-between gap-3 p-3 sm:p-4">
        <div>
          <CardTitle className="text-sm">Budget governance</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            Versioned capital-plan revisions preserve every prior governing
            Budget.
          </p>
        </div>
        <Badge variant={pendingRequest ? "warning" : "outline"}>
          {current ? `Capital plan v${current.version}` : "No active version"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:grid-cols-2">
        {viewerRole === "builder" ? (
          <section aria-label="Request budget revision" className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-working-capital"
              >
                <span className="font-medium">Working capital ($)</span>
                <Input
                  data-testid="budget-working-capital"
                  id="budget-working-capital"
                  min="0"
                  onChange={(event) => setWorkingCapital(event.target.value)}
                  type="number"
                  value={workingCapital}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-policy-limit"
              >
                <span className="font-medium">Draw policy limit ($)</span>
                <Input
                  data-testid="budget-policy-limit"
                  id="budget-policy-limit"
                  min="0"
                  onChange={(event) => setPolicyLimit(event.target.value)}
                  type="number"
                  value={policyLimit}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-loan-percentage"
              >
                <span className="font-medium">Loan Percentage (%)</span>
                <Input
                  data-testid="budget-loan-percentage"
                  id="budget-loan-percentage"
                  max="100"
                  min="0"
                  onChange={(event) => setLoanPercentage(event.target.value)}
                  type="number"
                  value={loanPercentage}
                />
              </label>
            </div>
            <Textarea
              aria-label="Budget revision reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain the variance and affected work"
              value={reason}
            />
            <Button
              disabled={
                !(actions?.requestBudgetRevision && reason.trim()) ||
                Boolean(pendingRequest) ||
                Boolean(pendingAction)
              }
              onClick={requestRevision}
              size="sm"
              type="button"
            >
              {pendingAction === "request" ? "Submitting…" : "Request revision"}
            </Button>
          </section>
        ) : (
          <section aria-label="Review budget revision" className="grid gap-3">
            <Textarea
              aria-label="Budget revision decision note"
              disabled={!pendingRequest}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Record the admin decision rationale"
              value={reviewNote}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  !(
                    actions?.reviewBudgetRevision &&
                    pendingRequest &&
                    reviewNote.trim()
                  ) || Boolean(pendingAction)
                }
                onClick={() => reviewRevision("approved")}
                size="sm"
                type="button"
              >
                Approve revision
              </Button>
              <Button
                disabled={
                  !(
                    actions?.reviewBudgetRevision &&
                    pendingRequest &&
                    reviewNote.trim()
                  ) || Boolean(pendingAction)
                }
                onClick={() => reviewRevision("rejected")}
                size="sm"
                type="button"
                variant="destructive"
              >
                Reject revision
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Budget version history" className="grid gap-2">
          {requests.length ? (
            requests.slice(0, 5).map((request) => (
              <Card key={request._id}>
                <CardContent className="grid gap-1 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      v{request.baseVersion} → v{request.baseVersion + 1}
                    </span>
                    <StatusPill status={request.status} />
                  </div>
                  <span>
                    {request.varianceCents >= 0 ? "+" : ""}
                    {formatCents(request.varianceCents)} policy variance
                  </span>
                  <span className="text-muted-foreground">
                    {request.reason}
                  </span>
                  {request.reviewNote ? (
                    <span className="text-muted-foreground">
                      Decision: {request.reviewNote}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">
              No Budget revisions have been requested. Capital plan v
              {current?.version ?? 1}
              remains governing.
            </p>
          )}
        </section>
        {error ? (
          <p className="text-destructive text-xs lg:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function facilityRequestLabel(request: ProductionFacilityChangeRequest) {
  if (request.requestType === "principalIncrease") {
    return `Principal increase to ${formatCents(
      request.requestedPayload.requestedPrincipalCents ?? 0
    )}`;
  }
  return `Payback extension to ${formatDate(
    request.requestedPayload.requestedPaybackDate ?? ""
  )}`;
}

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant={status === "approved" ? "default" : "outline"}>
      {status}
    </Badge>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>;
}

export function StatusChip({ status }: { status: ProductionDrawStatus }) {
  return (
    <Badge variant={drawBadgeVariant(status)}>{drawStatusLabel(status)}</Badge>
  );
}
