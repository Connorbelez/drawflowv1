import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  CheckCircle2,
  FileCheck2,
  FileText,
  LockKeyhole,
  MapPinCheck,
  Milestone,
  RefreshCw,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FrameHeader, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Radio, RadioGroup } from "#/components/ui/radio-group.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
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
type Policy = ReviewControl["policyVersions"][number]["policy"];
type ReviewMode = Policy["drawApprovalMode"];

const reviewModeOptions = [
  {
    description: "One authorized Back Office approval completes the review.",
    label: "Back Office only",
    value: "backoffice_only",
  },
  {
    description: "The selected lender quorum completes the review.",
    label: "Lender quorum only",
    value: "lender_quorum",
  },
  {
    description:
      "Back Office and the lender quorum are both required, in either order.",
    label: "Both",
    value: "both",
  },
] as const satisfies readonly {
  description: string;
  label: string;
  value: ReviewMode;
}[];
const UNCAUGHT_ERROR_PATTERN = /Uncaught Error:\s*([^\n]+)/;
const STALE_REVIEW_BASE_PATTERN =
  /Stale (proposal revision|lender assignment)/i;
const REUSED_IDEMPOTENCY_KEY_PATTERN = /idempotency key was reused/i;

export function ProposalReviewPolicyControl({
  control,
  onConfigure,
  onLock,
  onPublish,
  proposalId,
  proposalStatus,
}: {
  control: ReviewControl;
  onConfigure: (command: ConfigureCommand) => Promise<unknown> | unknown;
  onLock: (command: LockCommand) => Promise<unknown> | unknown;
  onPublish: (command: PublishCommand) => Promise<unknown> | unknown;
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
  proposalId,
  proposalStatus,
}: {
  canonicalPolicy: Policy;
  control: ReviewControl;
  onConfigure: (command: ConfigureCommand) => Promise<unknown> | unknown;
  onLock: (command: LockCommand) => Promise<unknown> | unknown;
  onPublish: (command: PublishCommand) => Promise<unknown> | unknown;
  proposalId: string;
  proposalStatus: "approved" | "closed" | "draft" | "submitted";
}) {
  const [policy, setPolicy] = useState<Policy>(canonicalPolicy);
  const [reason, setReason] = useState("");
  const [lockAcknowledged, setLockAcknowledged] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<
    "configure" | "lock" | "publish" | null
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
  const policyChanged = !policiesEqual(policy, canonicalPolicy);
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
  const validationMessages = validatePolicy(policy, {
    eligibleCounts,
    hasAssignment,
    lenderEligibilityIssue: control.currentLenderEligibilityIssue,
  });
  const auditReason = reason.trim();
  const canConfigure = Boolean(
    editable && auditReason && validationMessages.length === 0 && policyChanged
  );
  const canPublish = Boolean(
    editable && auditReason && currentPolicyVersion(control) && !policyChanged
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
    operation: "configure" | "lock" | "publish",
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

  const updateMilestone = (patch: Partial<Policy>) =>
    setPolicy((current) => ({ ...current, ...patch }));
  const updateDraw = (patch: Partial<Policy>) =>
    setPolicy((current) => ({ ...current, ...patch }));
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

  return (
    <div
      className="grid min-w-0 gap-4"
      data-testid="proposal-review-policy-control"
      id="proposal-review-policy-control"
      tabIndex={-1}
    >
      <ReviewPolicyRequirements
        editable={editable}
        eligibleCounts={eligibleCounts}
        hasAssignment={hasAssignment}
        locked={locked}
        onDrawChange={updateDraw}
        onMilestoneChange={updateMilestone}
        pending={pendingOperation !== null}
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

function ReviewPolicyRequirements({
  editable,
  eligibleCounts,
  hasAssignment,
  locked,
  onDrawChange,
  onMilestoneChange,
  pending,
  policy,
}: {
  editable: boolean;
  eligibleCounts: { draw: number; milestone: number; proposalReview: number };
  hasAssignment: boolean;
  locked: boolean;
  onDrawChange: (patch: Partial<Policy>) => void;
  onMilestoneChange: (patch: Partial<Policy>) => void;
  pending: boolean;
  policy: Policy;
}) {
  const disabled = !editable || pending;
  return (
    <Frame>
      <FrameHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base text-wrap-balance">
              Review requirements
            </p>
            <p className="text-pretty text-muted-foreground text-sm">
              Configure the active Build policy before closing is recorded.
            </p>
          </div>
          <Badge variant={locked ? "success" : "outline"}>
            {locked ? <CheckCircle2 /> : <LockKeyhole />}
            {locked ? "Locked" : "Locks before closing"}
          </Badge>
        </div>
      </FrameHeader>
      <FramePanel className="grid gap-6 p-5 xl:grid-cols-2">
        <RequirementSection
          disabled={disabled}
          eligibleCount={eligibleCounts.milestone}
          hasAssignment={hasAssignment}
          icon={Milestone}
          mode={policy.milestoneApprovalMode}
          onModeChange={(milestoneApprovalMode) =>
            onMilestoneChange({
              milestoneApprovalMode,
              milestoneLenderQuorum: needsLenderQuorum(milestoneApprovalMode)
                ? Math.max(1, Math.min(eligibleCounts.milestone, 1))
                : null,
            })
          }
          onQuorumChange={(milestoneLenderQuorum) =>
            onMilestoneChange({ milestoneLenderQuorum })
          }
          quorum={policy.milestoneLenderQuorum}
          title="Milestone review"
        >
          <Separator />
          <EvidenceControls
            disabled={disabled}
            onReceiptInvoiceChange={(milestoneReceiptInvoiceRequired) =>
              onMilestoneChange({ milestoneReceiptInvoiceRequired })
            }
            onSiteVisitChange={(milestoneSiteVisitRequired) =>
              onMilestoneChange({ milestoneSiteVisitRequired })
            }
            receiptInvoiceRequired={policy.milestoneReceiptInvoiceRequired}
            siteVisitRequired={policy.milestoneSiteVisitRequired}
          />
        </RequirementSection>
        <RequirementSection
          disabled={disabled}
          eligibleCount={eligibleCounts.draw}
          hasAssignment={hasAssignment}
          icon={FileCheck2}
          mode={policy.drawApprovalMode}
          onModeChange={(drawApprovalMode) =>
            onDrawChange({
              drawApprovalMode,
              drawLenderQuorum: needsLenderQuorum(drawApprovalMode)
                ? Math.max(1, Math.min(eligibleCounts.draw, 1))
                : null,
            })
          }
          onQuorumChange={(drawLenderQuorum) =>
            onDrawChange({ drawLenderQuorum })
          }
          quorum={policy.drawLenderQuorum}
          title="Draw review"
        />
      </FramePanel>
    </Frame>
  );
}

function ReviewPolicyCommandPanel({
  canConfigure,
  canLock,
  canPublish,
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
  onReasonChange,
  pendingOperation,
  reason,
  validationMessages,
}: {
  canConfigure: boolean;
  canLock: boolean;
  canPublish: boolean;
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
  onReasonChange: (reason: string) => void;
  pendingOperation: "configure" | "lock" | "publish" | null;
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

function RequirementSection({
  children,
  disabled,
  eligibleCount,
  hasAssignment,
  icon: Icon,
  mode,
  onModeChange,
  onQuorumChange,
  quorum,
  title,
}: {
  children?: ReactNode;
  disabled: boolean;
  eligibleCount: number;
  hasAssignment: boolean;
  icon: typeof Milestone;
  mode: ReviewMode;
  onModeChange: (mode: ReviewMode) => void;
  onQuorumChange: (quorum: number) => void;
  quorum: number | null;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-pretty text-muted-foreground text-xs">
            Choose the approval group that completes this review.
          </p>
        </div>
      </div>
      <ModeRadioGroup
        ariaLabel={`${title} requirement`}
        disabled={disabled}
        lenderModeAvailable={hasAssignment && eligibleCount > 0}
        mode={mode}
        onChange={onModeChange}
      />
      {needsLenderQuorum(mode) ? (
        <QuorumSelect
          disabled={disabled || eligibleCount < 1}
          eligibleCount={eligibleCount}
          onChange={onQuorumChange}
          value={quorum ?? 1}
        />
      ) : null}
      {children}
    </div>
  );
}

function ModeRadioGroup({
  ariaLabel,
  disabled,
  lenderModeAvailable,
  mode,
  onChange,
}: {
  ariaLabel: string;
  disabled: boolean;
  lenderModeAvailable: boolean;
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}) {
  const groupId = useId();

  return (
    <RadioGroup
      aria-label={ariaLabel}
      disabled={disabled}
      onValueChange={(value) => onChange(value as ReviewMode)}
      value={mode}
    >
      {reviewModeOptions.map((option) => {
        const optionDisabled =
          disabled || (needsLenderQuorum(option.value) && !lenderModeAvailable);
        return (
          <Card
            className="rounded-lg p-0 shadow-none has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
            key={option.value}
          >
            <label
              className="grid min-h-10 cursor-pointer grid-cols-[auto_1fr] gap-x-3 p-3 has-disabled:cursor-not-allowed has-disabled:opacity-64"
              htmlFor={`${groupId}-${option.value}`}
            >
              <Radio
                className="mt-0.5"
                disabled={optionDisabled}
                id={`${groupId}-${option.value}`}
                value={option.value}
              />
              <span className="min-w-0">
                <span className="block font-medium text-sm">
                  {option.label}
                </span>
                <span className="block text-pretty text-muted-foreground text-xs">
                  {option.description}
                </span>
              </span>
            </label>
          </Card>
        );
      })}
    </RadioGroup>
  );
}

function QuorumSelect({
  disabled,
  eligibleCount,
  onChange,
  value,
}: {
  disabled: boolean;
  eligibleCount: number;
  onChange: (quorum: number) => void;
  value: number;
}) {
  const selectId = useId();
  const optionCount = Math.max(eligibleCount, value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={selectId}>Lender quorum</Label>
      <NativeSelect
        className="w-full"
        disabled={disabled}
        id={selectId}
        onChange={(event) => onChange(Number(event.target.value))}
        value={String(value)}
      >
        {Array.from({ length: optionCount }, (_, index) => index + 1).map(
          (count) => (
            <NativeSelectOption key={count} value={count}>
              {count} of {eligibleCount} active approval-eligible lender members
            </NativeSelectOption>
          )
        )}
      </NativeSelect>
      <p className="text-pretty text-muted-foreground text-xs">
        {eligibleCount > 0
          ? `Select 1–${eligibleCount}, based on current role and permission eligibility.`
          : "No active assigned lender member is eligible for this decision."}
      </p>
    </div>
  );
}

function EvidenceControls({
  disabled,
  onReceiptInvoiceChange,
  onSiteVisitChange,
  receiptInvoiceRequired,
  siteVisitRequired,
}: {
  disabled: boolean;
  onReceiptInvoiceChange: (required: boolean) => void;
  onSiteVisitChange: (required: boolean) => void;
  receiptInvoiceRequired: boolean;
  siteVisitRequired: boolean;
}) {
  return (
    <div className="grid gap-3 pt-1">
      <div>
        <p className="font-medium text-sm">Milestone evidence</p>
        <p className="text-pretty text-muted-foreground text-xs">
          These controls are independent of the reviewer requirement.
        </p>
      </div>
      <EvidenceCheckbox
        checked={siteVisitRequired}
        disabled={disabled}
        icon={MapPinCheck}
        label="Site visit required"
        onCheckedChange={onSiteVisitChange}
      />
      <EvidenceCheckbox
        checked={receiptInvoiceRequired}
        disabled={disabled}
        icon={FileText}
        label="Receipt / invoice required"
        onCheckedChange={onReceiptInvoiceChange}
      />
    </div>
  );
}

function EvidenceCheckbox({
  checked,
  disabled,
  icon: Icon,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  icon: typeof MapPinCheck;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = useId();
  return (
    <Card className="rounded-lg p-0 shadow-none">
      <label
        className="flex min-h-10 cursor-pointer items-center gap-3 p-3 has-disabled:cursor-not-allowed has-disabled:opacity-64"
        htmlFor={checkboxId}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          id={checkboxId}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{label}</span>
      </label>
    </Card>
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

function needsLenderQuorum(mode: ReviewMode) {
  return mode === "lender_quorum" || mode === "both";
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

function validatePolicy(
  policy: Policy,
  context: {
    eligibleCounts: { draw: number; milestone: number; proposalReview: number };
    hasAssignment: boolean;
    lenderEligibilityIssue?: string;
  }
) {
  const messages: string[] = [];
  if (context.lenderEligibilityIssue) {
    messages.push(context.lenderEligibilityIssue);
  }
  const validateQuorum = (
    mode: ReviewMode,
    quorum: number | null,
    label: string,
    eligibleCount: number
  ) => {
    if (!needsLenderQuorum(mode)) {
      return;
    }
    if (!context.hasAssignment) {
      messages.push(
        `${label} lender review requires a current lender assignment.`
      );
      return;
    }
    if (eligibleCount === 0) {
      messages.push(
        `${label} lender review has no active approval-eligible member.`
      );
      return;
    }
    if (
      quorum === null ||
      !Number.isInteger(quorum) ||
      quorum < 1 ||
      quorum > eligibleCount
    ) {
      messages.push(
        `${label} lender quorum must be from 1 through ${eligibleCount}.`
      );
    }
  };
  validateQuorum(
    policy.milestoneApprovalMode,
    policy.milestoneLenderQuorum,
    "Milestone",
    context.eligibleCounts.milestone
  );
  validateQuorum(
    policy.drawApprovalMode,
    policy.drawLenderQuorum,
    "Draw",
    context.eligibleCounts.draw
  );
  return messages;
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

function currentPolicyVersion(control: ReviewControl) {
  return control.policyVersions.find(
    (version) => version.policyVersionId === control.currentPolicyVersionId
  );
}

function policiesEqual(left: Policy, right: Policy) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reviewPolicyIdempotencyKey(input: {
  base: {
    expectedAssignmentId: unknown;
    expectedProposalRevisionNumber: number | null;
  };
  operation: "configure" | "lock" | "publish";
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
