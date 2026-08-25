import { CalendarClock, CheckCircle2, Send, XCircle } from "lucide-react";
import { type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { BuildPermitViewerDocument } from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { BuildPermitViewerDrawer } from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type {
  ProductionProposal,
  ProductionProposalDetail,
} from "./production-proposal-surface-contracts";
import {
  productionProposalActionErrorMessage,
  Section,
  statusLabel,
} from "./production-proposal-surface-shared";

export function ApprovedProposalConfirmation({
  approvalStatusSurface,
  detail,
}: {
  approvalStatusSurface?: ReactNode;
  detail: ProductionProposalDetail;
}) {
  const proposal = detail.proposal;
  const drawCount = (detail.draws ?? detail.plannedDraws ?? []).length;
  const milestoneCount = detail.milestones?.length ?? 0;
  const isAwaitingLenderConfirmation =
    detail.lifecycle?.lenderConfirmation === "pending" ||
    detail.lifecycle?.lenderConfirmation === "declined";

  return (
    <Section
      title={
        isAwaitingLenderConfirmation ? "Approval status" : "Review confirmed"
      }
    >
      <div
        className="grid min-h-[24rem] content-center gap-6 py-6 text-center"
        data-testid="approved-proposal-confirmation"
      >
        <div
          className={
            isAwaitingLenderConfirmation
              ? "mx-auto grid size-16 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border"
              : "mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success ring-1 ring-success/25"
          }
        >
          {isAwaitingLenderConfirmation ? (
            <CalendarClock aria-hidden className="size-8" />
          ) : (
            <CheckCircle2 aria-hidden className="size-8" />
          )}
        </div>
        <div className="mx-auto grid max-w-2xl gap-2">
          <Badge
            className="mx-auto"
            variant={isAwaitingLenderConfirmation ? "outline" : "success"}
          >
            {isAwaitingLenderConfirmation
              ? "Lender confirmation pending"
              : "Approved"}
          </Badge>
          <h2 className="text-balance font-semibold text-2xl tracking-tight">
            {isAwaitingLenderConfirmation
              ? "Back Office approval complete"
              : "Proposal approved for closing"}
          </h2>
          <p className="text-pretty text-muted-foreground text-sm">
            {isAwaitingLenderConfirmation ? (
              <>
                {proposal.buildName} in {proposal.location} is approved by Back
                Office. Lender confirmation is still required before this
                proposal can proceed to Closing.
              </>
            ) : (
              <>
                {proposal.buildName} in {proposal.location} is locked for
                proposal review. Use Closing when the loan is signed and the
                active build is ready to start.
              </>
            )}
          </p>
        </div>
        {approvalStatusSurface ? (
          <div className="mx-auto w-full max-w-3xl border-t pt-4 text-left">
            {approvalStatusSurface}
          </div>
        ) : null}
        <div className="mx-auto grid w-full max-w-3xl gap-4 border-y py-4 text-left sm:grid-cols-3 sm:divide-x">
          <div className="grid gap-1 sm:pr-4">
            <span className="text-muted-foreground text-xs">Milestones</span>
            <strong className="font-semibold text-lg tabular-nums">
              {milestoneCount}
            </strong>
          </div>
          <div className="grid gap-1 sm:px-4">
            <span className="text-muted-foreground text-xs">Draw rows</span>
            <strong className="font-semibold text-lg tabular-nums">
              {drawCount}
            </strong>
          </div>
          <div className="grid gap-1 sm:pl-4">
            <span className="text-muted-foreground text-xs">Next step</span>
            <strong className="font-semibold text-lg">
              {isAwaitingLenderConfirmation
                ? "Complete lender confirmation"
                : detail.activeBuild
                  ? "Active build ready"
                  : "Record closing"}
            </strong>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function ProposalReviewDecisionPanel({
  idPrefix,
  onReasonChange,
  onReviewDecision,
  onSubmit,
  pendingDecision,
  proposal,
  reason,
  submitPending,
}: {
  idPrefix: string;
  onReasonChange: (value: string) => void;
  onReviewDecision: (
    decision: "approve" | "reject" | "requestChanges"
  ) => Promise<void> | void;
  onSubmit?: () => Promise<unknown> | unknown;
  pendingDecision: "approve" | "reject" | "requestChanges" | null;
  proposal: ProductionProposal;
  reason: string;
  submitPending: boolean;
}) {
  const reviewAvailable = proposal.status === "submitted";
  const disabled = pendingDecision !== null;
  const reasonId = `${idPrefix}-decision-reason`;
  const reasonHelpId = `${idPrefix}-decision-reason-help`;
  const submitAction =
    proposal.status === "draft" && onSubmit ? (
      <Button
        className="w-full sm:w-auto"
        data-testid={`${idPrefix}-submit-proposal`}
        disabled={submitPending}
        onClick={() => void onSubmit()}
        size="sm"
      >
        <Send />
        {submitPending ? "Submitting..." : "Submit proposal"}
      </Button>
    ) : null;

  return (
    <Section
      action={submitAction}
      title={reviewAvailable ? "Review decision" : "Proposal status"}
    >
      <div className="grid gap-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h2 className="mt-2 font-semibold text-xl tracking-tight">
              {proposal.buildName}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {proposal.location}
            </p>
          </div>
          {reviewAvailable ? (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button
                disabled={disabled}
                onClick={() => void onReviewDecision("requestChanges")}
                size="sm"
                variant="outline"
              >
                {pendingDecision === "requestChanges"
                  ? "Requesting..."
                  : "Request Changes"}
              </Button>
              <Button
                disabled={disabled}
                onClick={() => void onReviewDecision("reject")}
                size="sm"
                variant="destructive"
              >
                {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
              </Button>
              <Button
                data-testid={`${idPrefix}-approve-proposal`}
                disabled={disabled}
                onClick={() => void onReviewDecision("approve")}
                size="sm"
              >
                {pendingDecision === "approve"
                  ? "Approving..."
                  : "Approve Proposal"}
              </Button>
            </div>
          ) : null}
        </div>

        {reviewAvailable ? (
          <div className="grid gap-2">
            <Label htmlFor={reasonId}>Decision reason</Label>
            <Input
              aria-describedby={reasonHelpId}
              id={reasonId}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Required for material decisions"
              value={reason}
            />
            <p className="text-muted-foreground text-xs" id={reasonHelpId}>
              Stored on the audit event for approval, rejection, or requested
              changes.
            </p>
          </div>
        ) : (
          <div className="grid max-w-[65ch] gap-2 text-muted-foreground text-sm">
            <p>
              {proposal.status === "draft"
                ? "Decision controls unlock after the builder submits this proposal for lender review."
                : "This proposal is not currently awaiting a lender review decision."}
            </p>
            {proposal.status === "draft" ? (
              <p>
                {proposal.selectedPlan
                  ? "Submit the current reimbursement plan for lender review. The selected optimizer preset is included as advisory comparison metadata."
                  : "Submit the custom reimbursement plan for lender review when the packet, milestones, and draw schedule are ready. Optimizer presets are optional."}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Section>
  );
}

export function ProposalReadinessList({
  canRecordPermitWaiverReason = false,
  detail,
  onUploadPermitDocument,
  permitFileName,
  permitViewerDocument,
  permitWaiverReason,
  proposalStatus,
  onPermitWaiverReasonChange,
}: {
  canRecordPermitWaiverReason?: boolean;
  detail: ProductionProposalDetail;
  onUploadPermitDocument?: (file: File) => Promise<unknown> | unknown;
  permitFileName?: string;
  permitViewerDocument?: BuildPermitViewerDocument | null;
  permitWaiverReason: string;
  proposalStatus: ProductionProposal["status"];
  onPermitWaiverReasonChange: (value: string) => void;
}) {
  const milestoneCount = detail.milestones?.length ?? 0;
  const drawCount = (detail.draws ?? detail.plannedDraws ?? []).length;
  const pendingWaiverReason = permitWaiverReason.trim();
  const hasPermit = Boolean(permitFileName || permitViewerDocument);
  const hasRecordedWaiver = Boolean(detail.permitWaiver);
  const permitGateReady =
    hasPermit || hasRecordedWaiver || pendingWaiverReason.length > 0;
  const canUploadPermit =
    Boolean(onUploadPermitDocument) &&
    !hasPermit &&
    proposalStatus !== "closed";

  async function uploadPermitDocument(files: File[]) {
    const file = files[0];
    if (!(file && onUploadPermitDocument)) {
      return;
    }
    try {
      await onUploadPermitDocument(file);
      toast.success("Permit uploaded.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
      throw error;
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <ul className="grid gap-3">
        <li className="flex gap-2">
          {permitGateReady ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {permitFileName
              ? `Permit PDF linked: ${permitFileName}`
              : detail.permitWaiver
                ? `Permit waiver recorded: ${detail.permitWaiver.reason}`
                : pendingWaiverReason
                  ? "Permit waiver reason ready to record on approval."
                  : "Permit PDF or audited waiver is required before approval."}
          </span>
        </li>
        <li className="flex gap-2">
          {milestoneCount > 0 ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {milestoneCount > 0
              ? `${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"} staged for review.`
              : "At least one milestone is required before submission."}
          </span>
        </li>
        <li className="flex gap-2">
          {drawCount > 0 ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {drawCount > 0
              ? `${drawCount} reimbursement draw${drawCount === 1 ? "" : "s"} available in the schedule.`
              : "No reimbursement draw rows are available yet."}
          </span>
        </li>
      </ul>

      <div className="grid gap-3 border-t pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Permit requirement</span>
              <Badge variant={permitGateReady ? "success" : "warning"}>
                {permitGateReady ? "Ready" : "Blocked"}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {hasPermit
                ? "Review the uploaded permit before making the approval decision."
                : hasRecordedWaiver
                  ? "The approval package already includes an audited permit waiver."
                  : "Enter the waiver reason here, then approve to create the audited waiver record."}
            </p>
          </div>
          {hasPermit ? (
            <BuildPermitViewerDrawer
              permit={permitViewerDocument}
              size="sm"
              triggerLabel="View uploaded permit"
              triggerTestId="proposal-review-permit-viewer-trigger"
            />
          ) : null}
        </div>

        {hasPermit ||
        hasRecordedWaiver ||
        !canRecordPermitWaiverReason ? null : (
          <div className="grid gap-2">
            <Label htmlFor="production-permit-waiver-readiness">
              Audited permit waiver
            </Label>
            <Textarea
              aria-describedby="production-permit-waiver-readiness-help"
              id="production-permit-waiver-readiness"
              onChange={(event) =>
                onPermitWaiverReasonChange(event.target.value)
              }
              placeholder="Reason permit approval is waived for this proposal"
              rows={3}
              value={permitWaiverReason}
            />
            <p
              className="text-muted-foreground text-xs"
              id="production-permit-waiver-readiness-help"
            >
              {proposalStatus === "submitted"
                ? "Approval records this waiver reason in the audit trail."
                : "This waiver reason is held in the review form until the submitted proposal is approved."}
            </p>
          </div>
        )}

        {canUploadPermit ? (
          <FileUploader
            accept="application/pdf,.pdf,.png,.jpg,.jpeg"
            actionLabel="Upload permit"
            description="Drop the issued permit or browse from your device."
            helperText="PDF preferred. Images are accepted when the municipality issued the permit as an image."
            inputLabel="Select permit document"
            multiple={false}
            onUpload={uploadPermitDocument}
            title="Permit packet"
          />
        ) : null}
      </div>
    </div>
  );
}
