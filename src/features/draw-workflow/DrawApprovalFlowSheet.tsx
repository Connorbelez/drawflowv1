import type { ComponentProps, ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DrawWorkflowStatus } from "#/features/draw-workflow/drawWorkflow.ts";
import { cn } from "#/lib/utils.ts";

const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});

const APPROVAL_STAGES = [
  { label: "Submitted", status: "requested" },
  { label: "Lender review", status: "in_review" },
  { label: "Admin decision", status: "ready_for_admin" },
  { label: "Approved", status: "approved_for_release" },
  { label: "Released", status: "released" },
] as const;

export interface DrawApprovalFlowDetail {
  label: string;
  value: string;
}

export interface DrawApprovalFlowSource {
  amountCents: number;
  drawGroupKey: string;
  milestoneKey: string;
  milestoneName: string;
}

export function DrawApprovalFlowSheet({
  actions,
  amountCents,
  contextBadge,
  details,
  drawLabel,
  displayId,
  onClose,
  open,
  reviewNote,
  sourceAllocations = [],
  status,
}: {
  actions?: ReactNode;
  amountCents: number;
  contextBadge?: ReactNode;
  details: DrawApprovalFlowDetail[];
  drawLabel: string;
  displayId: string;
  onClose: () => void;
  open: boolean;
  reviewNote?: {
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  };
  sourceAllocations?: DrawApprovalFlowSource[];
  status: DrawWorkflowStatus;
}) {
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{displayId} Draw approval and release</SheetTitle>
          <SheetDescription>
            {drawLabel} · {CAD_FORMATTER.format(amountCents / 100)}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={drawStatusBadgeVariant(status)}>
              {drawStatusLabel(status)}
            </Badge>
            {contextBadge}
          </div>

          <section aria-labelledby="draw-approval-progress-heading">
            <h3
              className="font-medium text-sm"
              id="draw-approval-progress-heading"
            >
              Approval and release status
            </h3>
            <ol className="mt-3 grid grid-cols-5 gap-1">
              {APPROVAL_STAGES.map((stage, index) => {
                const state = approvalStageState(status, index);
                return (
                  <li
                    aria-current={state === "current" ? "step" : undefined}
                    className="min-w-0"
                    key={stage.status}
                  >
                    <div
                      className={cn(
                        "h-1.5 rounded-full bg-muted",
                        state === "complete" && "bg-success",
                        state === "current" && "bg-primary"
                      )}
                    />
                    <p
                      className={cn(
                        "mt-1.5 text-muted-foreground text-xs",
                        state === "current" && "font-medium text-foreground"
                      )}
                    >
                      {stage.label}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>

          <Separator />

          <dl className="grid gap-2 text-sm">
            {details.map((detail) => (
              <div className="grid gap-0.5" key={detail.label}>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {detail.label}
                </dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>

          {sourceAllocations.length > 0 ? (
            <div className="border-t pt-3 text-sm">
              <p className="font-medium">Attributed reimbursement sources</p>
              <ul className="mt-2 grid gap-1 text-muted-foreground text-xs">
                {sourceAllocations.map((allocation) => (
                  <li
                    className="flex items-start justify-between gap-3"
                    key={`${allocation.drawGroupKey}:${allocation.milestoneKey}`}
                  >
                    <span>
                      {allocation.milestoneName} · {allocation.drawGroupKey}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {CAD_FORMATTER.format(allocation.amountCents / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {reviewNote ? (
            <div className="grid gap-2">
              <Label htmlFor="draw-review-note">Review note</Label>
              <Textarea
                disabled={reviewNote.disabled}
                id="draw-review-note"
                onChange={(event) => reviewNote.onChange(event.target.value)}
                placeholder="Document evidence and policy checks..."
                rows={3}
                value={reviewNote.value}
              />
            </div>
          ) : null}
        </SheetPanel>
        {actions ? (
          <SheetFooter className="flex-col gap-2 sm:flex-col">
            {actions}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function approvalStageState(
  status: DrawWorkflowStatus,
  stageIndex: number
): "complete" | "current" | "pending" {
  const currentIndex = APPROVAL_STAGES.findIndex(
    (stage) => stage.status === status
  );
  if (currentIndex < 0) {
    return "pending";
  }
  if (stageIndex < currentIndex) {
    return "complete";
  }
  return stageIndex === currentIndex ? "current" : "pending";
}

function drawStatusLabel(status: DrawWorkflowStatus): string {
  switch (status) {
    case "approved_for_release":
      return "Approved for release";
    case "cancelled":
      return "Cancelled";
    case "in_review":
      return "In review";
    case "planned":
      return "Planned";
    case "ready_for_admin":
      return "Ready for admin";
    case "rejected":
      return "Rejected";
    case "released":
      return "Released";
    case "requested":
      return "Requested";
    case "withdrawn":
      return "Withdrawn";
  }
}

function drawStatusBadgeVariant(
  status: DrawWorkflowStatus
): NonNullable<ComponentProps<typeof Badge>["variant"]> {
  if (status === "released") {
    return "success";
  }
  if (status === "requested" || status === "ready_for_admin") {
    return "warning";
  }
  if (status === "in_review" || status === "approved_for_release") {
    return "info";
  }
  if (status === "rejected" || status === "cancelled") {
    return "destructive";
  }
  return "outline";
}
