import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  ReviewRequirementsPolicyFields,
  reviewRequirementsPoliciesEqual,
  validateReviewRequirementsPolicy,
} from "#/features/production-proposals/ReviewRequirementsPolicyFields.tsx";
import type { api } from "../../../convex/_generated/api";

export type ProposalReviewControlProjection = FunctionReturnType<
  typeof api.production_proposals.getProposalPhase3ReviewControl
>;
type ReviewControl = ProposalReviewControlProjection;
type ConfigureCommand = Omit<
  FunctionArgs<typeof api.production_proposals.configureProposalReviewPolicy>,
  "proposalId" | "workosOrganizationId"
>;
type PublishCommand = Omit<
  FunctionArgs<typeof api.production_proposals.publishProposalRevision>,
  "proposalId" | "workosOrganizationId"
>;
type LockCommand = Omit<
  FunctionArgs<typeof api.production_proposals.lockProposalReviewPolicy>,
  "proposalId" | "workosOrganizationId"
>;
type RestoreCommand = Omit<
  FunctionArgs<
    typeof api.production_proposals.restoreProposalReviewPolicyFromOrganizationDefault
  >,
  "proposalId" | "workosOrganizationId"
>;
type Policy = ReviewControl["policyVersions"][number]["policy"];
type ReviewMode = Policy["drawApprovalMode"];

const UNCAUGHT_ERROR_PATTERN = /Uncaught Error:\s*([^\n]+)/;
const STALE_REVIEW_BASE_PATTERN =
  /Stale (proposal revision|lender assignment)/i;
const REUSED_IDEMPOTENCY_KEY_PATTERN = /idempotency key was reused/i;

export function ProposalReviewPolicyControl({
  control,
  onConfigure,
  onLock,
  onPublish,
  onRestore,
  proposalId,
  proposalStatus,
}: {
  control: ReviewControl;
  onConfigure: (command: ConfigureCommand) => Promise<unknown> | unknown;
  onLock: (command: LockCommand) => Promise<unknown> | unknown;
  onPublish: (command: PublishCommand) => Promise<unknown> | unknown;
  onRestore?: (command: RestoreCommand) => Promise<unknown> | unknown;
  proposalId: string;
  proposalStatus: "approved" | "closed" | "draft" | "submitted";
}) {
  const currentPolicyVersion =
    control.policyVersions.find(
      (version) => version.policyVersionId === control.currentPolicyVersionId
    ) ?? control.policyVersions.at(-1);
  const lockedPolicy = control.lock?.policy;
  const canonicalPolicy = lockedPolicy ?? currentPolicyVersion?.policy;

  if (!canonicalPolicy) {
    return (
      <Frame data-testid="proposal-review-policy-control">
        <FramePanel className="p-5">
          <Alert variant="warning">
            <AlertTitle>Review policy is unavailable</AlertTitle>
            <AlertDescription>
              Approve the proposal to create its first policy version and
              proposal revision.
            </AlertDescription>
          </Alert>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <ReviewPolicyEditor
      canonicalPolicy={canonicalPolicy}
      control={control}
      key={`${String(control.currentPolicyVersionId)}:${String(control.lockedReviewPolicyId)}`}
      onConfigure={onConfigure}
      onLock={onLock}
      onPublish={onPublish}
      onRestore={onRestore}
      proposalId={proposalId}
      proposalStatus={proposalStatus}
    />
  );
}

function ReviewPolicyEditor({
  canonicalPolicy,
  control,
  onConfigure,
  onLock,
  onPublish,
  onRestore,
  proposalId,
  proposalStatus,
}: {
  canonicalPolicy: Policy;
  control: ReviewControl;
  onConfigure: (command: ConfigureCommand) => Promise<unknown> | unknown;
  onLock: (command: LockCommand) => Promise<unknown> | unknown;
  onPublish: (command: PublishCommand) => Promise<unknown> | unknown;
  onRestore?: (command: RestoreCommand) => Promise<unknown> | unknown;
  proposalId: string;
  proposalStatus: "approved" | "closed" | "draft" | "submitted";
}) {
  const [policy, setPolicy] = useState<Policy>(canonicalPolicy);
  const [reason, setReason] = useState("");
  const [lockAcknowledged, setLockAcknowledged] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<
    "configure" | "lock" | "publish" | "restore" | null
  >(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const locked = Boolean(control.lockedReviewPolicyId || control.lock);
  const editable = proposalStatus === "approved" && !locked;
  const eligibleCounts = control.currentEligibleLenderApproverCounts ?? {
    draw: 0,
    milestone: 0,
    proposalReview: 0,
  };
  const hasAssignment = control.currentAssignmentId !== null;
  const currentPolicyVersion =
    control.policyVersions.find(
      (version) => version.policyVersionId === control.currentPolicyVersionId
    ) ?? control.policyVersions.at(-1);
  const policyChanged = !reviewRequirementsPoliciesEqual(
    policy,
    canonicalPolicy
  );
  const currentRevision = control.revisions.find(
    (revision) => revision.proposalRevisionId === control.currentRevisionId
  );
  const revisionMatchesPolicy = Boolean(
    currentRevision &&
      currentRevision.reviewPolicyVersionId ===
        control.currentPolicyVersionId &&
      currentRevision.assignmentId === control.currentAssignmentId
  );
  const lenderConfirmationReady = Boolean(
    !hasAssignment ||
      (control.currentRevisionNumber !== null &&
        control.latestLenderReviewedRevisionNumber ===
          control.currentRevisionNumber)
  );
  const validationMessages = validateReviewRequirementsPolicy(policy, {
    eligibleCounts,
    lenderEligibilityIssue: control.currentLenderEligibilityIssue,
    lenderScopeAvailable: hasAssignment,
  });
  const auditReason = reason.trim();
  const canConfigure = Boolean(
    editable && auditReason && validationMessages.length === 0 && policyChanged
  );
  const canPublish = Boolean(
    editable && auditReason && currentPolicyVersion && !policyChanged
  );
  const canRestore = Boolean(
    editable && auditReason && hasAssignment && !policyChanged && onRestore
  );
  const canLock = Boolean(
    editable &&
      auditReason &&
      !policyChanged &&
      revisionMatchesPolicy &&
      lenderConfirmationReady &&
      validationMessages.length === 0 &&
      lockAcknowledged
  );

  const commandBase = {
    expectedAssignmentId: control.currentAssignmentId,
    expectedProposalRevisionNumber: control.currentRevisionNumber,
  };
  const runCommand = async (
    operation: "configure" | "lock" | "publish" | "restore",
    action: () => Promise<unknown> | unknown,
    successMessage: string
  ) => {
    setPendingOperation(operation);
    setError("");
    try {
      await action();
      setAnnouncement(successMessage);
      setReason("");
      setLockAcknowledged(false);
    } catch (caught) {
      setError(reviewPolicyErrorMessage(caught));
    } finally {
      setPendingOperation(null);
    }
  };

  const publishRevision = async () => {
    await runCommand(
      "publish",
      () =>
        onPublish({
          ...commandBase,
          idempotencyKey: reviewPolicyIdempotencyKey({
            base: commandBase,
            operation: "publish",
            proposalId,
            reason: auditReason,
          }),
          reason: auditReason,
        }),
      "Proposal revision published."
    );
  };
  const configurePolicy = async () => {
    await runCommand(
      "configure",
      () =>
        onConfigure({
          ...commandBase,
          idempotencyKey: reviewPolicyIdempotencyKey({
            base: commandBase,
            operation: "configure",
            policy,
            proposalId,
            reason: auditReason,
          }),
          policy: policyInput(policy),
          reason: auditReason,
        }),
      "Review policy saved and revision published."
    );
  };
  const lockPolicy = async () => {
    await runCommand(
      "lock",
      () =>
        onLock({
          ...commandBase,
          idempotencyKey: reviewPolicyIdempotencyKey({
            base: commandBase,
            operation: "lock",
            proposalId,
            reason: auditReason,
          }),
          reason: auditReason,
        }),
      "Review policy locked for closing."
    );
  };
  const restoreOrganizationDefault = async () => {
    const assignmentId = control.currentAssignmentId;
    if (!(onRestore && assignmentId)) {
      return;
    }
    await runCommand(
      "restore",
      () =>
        onRestore({
          expectedAssignmentId: assignmentId,
          expectedProposalRevisionNumber: control.currentRevisionNumber,
          idempotencyKey: reviewPolicyIdempotencyKey({
            base: commandBase,
            operation: "restore",
            proposalId,
            reason: auditReason,
          }),
          reason: auditReason,
        }),
      "Current organization default restored and revision published."
    );
  };

  return (
    <div
      className="grid min-w-0 gap-4"
      data-testid="proposal-review-policy-control"
      id="proposal-review-policy-control"
      tabIndex={-1}
    >
      <ReviewPolicyProvenance version={currentPolicyVersion} />

      <ReviewRequirementsPolicyFields
        description="Configure the active Build policy before closing is recorded."
        disabled={!editable || pendingOperation !== null}
        eligibleCounts={eligibleCounts}
        lenderScopeAvailable={hasAssignment}
        locked={locked}
        onChange={setPolicy}
        policy={policy}
      />

      <PolicySummary
        eligibleCounts={eligibleCounts}
        lenderConfirmationReady={lenderConfirmationReady}
        locked={locked}
        policy={policy}
        revisionMatchesPolicy={revisionMatchesPolicy}
      />

      {locked ? null : (
        <ReviewPolicyCommandPanel
          canConfigure={canConfigure}
          canLock={canLock}
          canPublish={canPublish}
          canRestore={canRestore}
          currentRevisionNumber={control.currentRevisionNumber}
          error={error}
          hasAssignment={hasAssignment}
          lenderConfirmationReady={lenderConfirmationReady}
          lockAcknowledged={lockAcknowledged}
          lockAcknowledgementDisabled={
            pendingOperation !== null ||
            policyChanged ||
            !revisionMatchesPolicy ||
            !lenderConfirmationReady
          }
          onConfigure={configurePolicy}
          onLock={lockPolicy}
          onLockAcknowledgedChange={setLockAcknowledged}
          onPublish={publishRevision}
          onReasonChange={setReason}
          onRestore={restoreOrganizationDefault}
          pendingOperation={pendingOperation}
          reason={reason}
          validationMessages={validationMessages}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function ReviewPolicyProvenance({
  version,
}: {
  version: ReviewControl["policyVersions"][number] | undefined;
}) {
  if (!version) {
    return null;
  }
  const provenance = version.provenance ?? "build_override";
  const label =
    provenance === "organization_default"
      ? `Inherited from ${version.sourceLenderOrganizationName ?? "Lender Organization"} default v${version.sourceOrganizationReviewPolicyVersion ?? "?"}`
      : provenance === "system_baseline"
        ? version.sourceLenderOrganizationName
          ? `Inherited from ${version.sourceLenderOrganizationName} system baseline`
          : "System / Back Office baseline"
        : "Customized for this Build";
  return (
    <Frame>
      <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-semibold text-sm">{label}</p>
          <p className="mt-1 text-pretty text-muted-foreground text-xs tabular-nums">
            Policy v{version.version} · Changes here create a new immutable
            Build policy revision.
          </p>
        </div>
        <Badge
          variant={provenance === "build_override" ? "warning" : "secondary"}
        >
          {provenance === "build_override" ? "Customized" : "Inherited"}
        </Badge>
      </FramePanel>
    </Frame>
  );
}

function ReviewPolicyCommandPanel({
  canConfigure,
  canLock,
  canPublish,
  canRestore,
  currentRevisionNumber,
  error,
  hasAssignment,
  lenderConfirmationReady,
  lockAcknowledged,
  lockAcknowledgementDisabled,
  onConfigure,
  onLock,
  onLockAcknowledgedChange,
  onPublish,
  onRestore,
  onReasonChange,
  pendingOperation,
  reason,
  validationMessages,
}: {
  canConfigure: boolean;
  canLock: boolean;
  canPublish: boolean;
  canRestore: boolean;
  currentRevisionNumber: number | null;
  error: string;
  hasAssignment: boolean;
  lenderConfirmationReady: boolean;
  lockAcknowledged: boolean;
  lockAcknowledgementDisabled: boolean;
  onConfigure: () => Promise<void>;
  onLock: () => Promise<void>;
  onLockAcknowledgedChange: (value: boolean) => void;
  onPublish: () => Promise<void>;
  onRestore: () => Promise<void>;
  onReasonChange: (reason: string) => void;
  pendingOperation: "configure" | "lock" | "publish" | "restore" | null;
  reason: string;
  validationMessages: string[];
}) {
  const pending = pendingOperation !== null;
  return (
    <Frame>
      <FramePanel className="grid gap-5 p-5">
        <div className="grid gap-2">
          <Label htmlFor="proposal-review-policy-reason">Audit reason</Label>
          <Textarea
            disabled={pending}
            id="proposal-review-policy-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Explain this policy, publication, or lock decision."
            value={reason}
          />
          <p className="text-pretty text-muted-foreground text-xs">
            The reason is stored with the selected command. Saving policy
            requirements also publishes a new immutable revision.
          </p>
        </div>

        {validationMessages.length > 0 ? (
          <Alert variant="warning">
            <AlertTitle>Policy is not ready</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 ps-4">
                {validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {!lenderConfirmationReady && hasAssignment ? (
          <Alert variant="warning">
            <AlertTitle>Lender confirmation required</AlertTitle>
            <AlertDescription>
              The assigned lender must confirm revision{" "}
              {currentRevisionNumber ?? "current"} before the policy can lock.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert role="alert" variant="error">
            <AlertTitle>Review policy command failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-end lg:justify-between">
          <label
            className="flex min-h-10 cursor-pointer items-start gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-64"
            htmlFor="proposal-review-policy-lock-acknowledgement"
          >
            <Checkbox
              checked={lockAcknowledged}
              disabled={lockAcknowledgementDisabled}
              id="proposal-review-policy-lock-acknowledgement"
              onCheckedChange={(value) =>
                onLockAcknowledgedChange(value === true)
              }
            />
            <span className="max-w-xl text-pretty leading-relaxed">
              I understand this policy is immutable after lock and will govern
              the active Build.
            </span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              disabled={!canRestore || pending}
              onClick={onRestore}
              variant="outline"
            >
              <RefreshCw />
              {pendingOperation === "restore"
                ? "Restoring..."
                : "Restore current organization default"}
            </Button>
            <Button
              disabled={!canPublish || pending}
              onClick={onPublish}
              variant="outline"
            >
              <RefreshCw />
              {pendingOperation === "publish"
                ? "Publishing..."
                : "Publish revision"}
            </Button>
            <Button
              disabled={!canConfigure || pending}
              onClick={onConfigure}
              variant="outline"
            >
              {pendingOperation === "configure" ? "Saving..." : "Save policy"}
            </Button>
            <Button disabled={!canLock || pending} onClick={onLock}>
              <LockKeyhole />
              {pendingOperation === "lock" ? "Locking..." : "Lock policy"}
            </Button>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function PolicySummary({
  eligibleCounts,
  lenderConfirmationReady,
  locked,
  policy,
  revisionMatchesPolicy,
}: {
  eligibleCounts: { draw: number; milestone: number; proposalReview: number };
  lenderConfirmationReady: boolean;
  locked: boolean;
  policy: Policy;
  revisionMatchesPolicy: boolean;
}) {
  return (
    <Frame>
      <FramePanel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {locked ? "Locked policy summary" : "Pre-closing policy summary"}
            </p>
            <p className="text-pretty text-muted-foreground text-xs">
              This is the policy that will govern the active Build.
            </p>
          </div>
          <LockKeyhole
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </div>
        <Separator className="my-4" />
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryRow
            label="Milestone review"
            value={reviewerSummary(
              policy.milestoneApprovalMode,
              policy.milestoneLenderQuorum
            )}
          />
          <SummaryRow
            label="Milestone evidence"
            value={
              [
                policy.milestoneSiteVisitRequired ? "Site visit" : null,
                policy.milestoneReceiptInvoiceRequired
                  ? "Receipt / invoice"
                  : null,
              ]
                .filter(Boolean)
                .join(" + ") || "No additional evidence"
            }
          />
          <SummaryRow
            label="Draw review"
            value={reviewerSummary(
              policy.drawApprovalMode,
              policy.drawLenderQuorum
            )}
          />
          <SummaryRow
            label="Eligible lender approvers"
            value={`${eligibleCounts.proposalReview} proposal · ${eligibleCounts.milestone} milestone · ${eligibleCounts.draw} draw`}
          />
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant={revisionMatchesPolicy ? "success" : "warning"}>
            {revisionMatchesPolicy
              ? "Current revision matches policy"
              : "Publish current policy revision"}
          </Badge>
          <Badge variant={lenderConfirmationReady ? "success" : "warning"}>
            {lenderConfirmationReady
              ? "Confirmation gate ready"
              : "Lender confirmation pending"}
          </Badge>
        </div>
        <p className="mt-4 text-pretty rounded-lg bg-muted p-3 text-muted-foreground text-xs">
          Back Office approval is one authorized approval. When both groups are
          required, Back Office and lender approvals may be completed in either
          order. This policy is immutable after lock.
        </p>
      </FramePanel>
    </Frame>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-sm">{value}</dd>
    </div>
  );
}

function reviewerSummary(mode: ReviewMode, quorum: number | null) {
  if (mode === "backoffice_only") {
    return "One Back Office approval";
  }
  if (mode === "lender_quorum") {
    return `${quorum ?? 0} lender approvals`;
  }
  return `One Back Office approval + ${quorum ?? 0} lender approvals`;
}

function policyInput(policy: Policy): ConfigureCommand["policy"] {
  return {
    drawApprovalMode: policy.drawApprovalMode,
    ...(policy.drawLenderQuorum === null
      ? {}
      : { drawLenderQuorum: policy.drawLenderQuorum }),
    milestoneApprovalMode: policy.milestoneApprovalMode,
    ...(policy.milestoneLenderQuorum === null
      ? {}
      : { milestoneLenderQuorum: policy.milestoneLenderQuorum }),
    milestoneReceiptInvoiceRequired: policy.milestoneReceiptInvoiceRequired,
    milestoneSiteVisitRequired: policy.milestoneSiteVisitRequired,
  };
}

export function reviewPolicyIdempotencyKey(input: {
  base: {
    expectedAssignmentId: unknown;
    expectedProposalRevisionNumber: number | null;
  };
  operation: "configure" | "lock" | "publish" | "restore";
  policy?: Policy;
  proposalId: string;
  reason: string;
}) {
  const payload = JSON.stringify({
    assignmentId: String(input.base.expectedAssignmentId ?? "none"),
    operation: input.operation,
    policy: input.policy,
    proposalId: input.proposalId,
    reason: input.reason,
    revisionNumber: input.base.expectedProposalRevisionNumber,
  });
  let hash = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 33 + payload.charCodeAt(index)) % 2_147_483_647;
  }
  return `backoffice:review-policy:${input.operation}:${hash.toString(36)}`;
}

function reviewPolicyErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "The review policy command failed. Try again from the current state.";
  }
  const message =
    error.message.match(UNCAUGHT_ERROR_PATTERN)?.[1]?.trim() ||
    error.message.trim();
  if (STALE_REVIEW_BASE_PATTERN.test(message)) {
    return `${message} The policy view has changed; review the live values and try again.`;
  }
  if (REUSED_IDEMPOTENCY_KEY_PATTERN.test(message)) {
    return `${message} Refresh the proposal before retrying a different command.`;
  }
  return message || "The review policy command failed. Try again.";
}
