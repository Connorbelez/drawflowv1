import {
  CheckCircle2,
  FileCheck2,
  FileText,
  LockKeyhole,
  MapPinCheck,
  Milestone,
} from "lucide-react";
import { type ReactNode, useId } from "react";

import { Badge } from "#/components/ui/badge.tsx";
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

export interface ReviewRequirementsPolicy {
  drawApprovalMode: ReviewRequirementsMode;
  drawLenderQuorum: number | null;
  milestoneApprovalMode: ReviewRequirementsMode;
  milestoneLenderQuorum: number | null;
  milestoneReceiptInvoiceRequired: boolean;
  milestoneSiteVisitRequired: boolean;
}

export type ReviewRequirementsMode =
  | "backoffice_only"
  | "both"
  | "lender_quorum";

export interface ReviewRequirementsEligibleCounts {
  draw: number;
  milestone: number;
  proposalReview: number;
}

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
  value: ReviewRequirementsMode;
}[];

export function ReviewRequirementsPolicyFields({
  badgeLabel,
  description,
  disabled,
  eligibleCounts,
  lenderScopeAvailable,
  locked = false,
  onChange,
  policy,
  title = "Review requirements",
}: {
  badgeLabel?: string;
  description: string;
  disabled: boolean;
  eligibleCounts: ReviewRequirementsEligibleCounts;
  lenderScopeAvailable: boolean;
  locked?: boolean;
  onChange: (policy: ReviewRequirementsPolicy) => void;
  policy: ReviewRequirementsPolicy;
  title?: string;
}) {
  const update = (patch: Partial<ReviewRequirementsPolicy>) =>
    onChange({ ...policy, ...patch });
  return (
    <Frame>
      <FrameHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base text-wrap-balance">{title}</p>
            <p className="text-pretty text-muted-foreground text-sm">
              {description}
            </p>
          </div>
          <Badge variant={locked ? "success" : "outline"}>
            {locked ? <CheckCircle2 /> : <LockKeyhole />}
            {badgeLabel ?? (locked ? "Locked" : "Locks before closing")}
          </Badge>
        </div>
      </FrameHeader>
      <FramePanel className="grid gap-6 p-5 xl:grid-cols-2">
        <RequirementSection
          disabled={disabled}
          eligibleCount={eligibleCounts.milestone}
          icon={Milestone}
          lenderScopeAvailable={lenderScopeAvailable}
          mode={policy.milestoneApprovalMode}
          onModeChange={(milestoneApprovalMode) =>
            update({
              milestoneApprovalMode,
              milestoneLenderQuorum: needsLenderQuorum(milestoneApprovalMode)
                ? Math.max(1, Math.min(eligibleCounts.milestone, 1))
                : null,
            })
          }
          onQuorumChange={(milestoneLenderQuorum) =>
            update({ milestoneLenderQuorum })
          }
          quorum={policy.milestoneLenderQuorum}
          title="Milestone review"
        >
          <Separator />
          <EvidenceControls
            disabled={disabled}
            onReceiptInvoiceChange={(milestoneReceiptInvoiceRequired) =>
              update({ milestoneReceiptInvoiceRequired })
            }
            onSiteVisitChange={(milestoneSiteVisitRequired) =>
              update({ milestoneSiteVisitRequired })
            }
            receiptInvoiceRequired={policy.milestoneReceiptInvoiceRequired}
            siteVisitRequired={policy.milestoneSiteVisitRequired}
          />
        </RequirementSection>
        <RequirementSection
          disabled={disabled}
          eligibleCount={eligibleCounts.draw}
          icon={FileCheck2}
          lenderScopeAvailable={lenderScopeAvailable}
          mode={policy.drawApprovalMode}
          onModeChange={(drawApprovalMode) =>
            update({
              drawApprovalMode,
              drawLenderQuorum: needsLenderQuorum(drawApprovalMode)
                ? Math.max(1, Math.min(eligibleCounts.draw, 1))
                : null,
            })
          }
          onQuorumChange={(drawLenderQuorum) => update({ drawLenderQuorum })}
          quorum={policy.drawLenderQuorum}
          title="Draw review"
        />
      </FramePanel>
    </Frame>
  );
}

function RequirementSection({
  children,
  disabled,
  eligibleCount,
  icon: Icon,
  lenderScopeAvailable,
  mode,
  onModeChange,
  onQuorumChange,
  quorum,
  title,
}: {
  children?: ReactNode;
  disabled: boolean;
  eligibleCount: number;
  icon: typeof Milestone;
  lenderScopeAvailable: boolean;
  mode: ReviewRequirementsMode;
  onModeChange: (mode: ReviewRequirementsMode) => void;
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
        lenderModeAvailable={lenderScopeAvailable && eligibleCount > 0}
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
  mode: ReviewRequirementsMode;
  onChange: (mode: ReviewRequirementsMode) => void;
}) {
  const groupId = useId();
  return (
    <RadioGroup
      aria-label={ariaLabel}
      disabled={disabled}
      onValueChange={(value) => onChange(value as ReviewRequirementsMode)}
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

export function needsLenderQuorum(mode: ReviewRequirementsMode) {
  return mode === "lender_quorum" || mode === "both";
}

export function validateReviewRequirementsPolicy(
  policy: ReviewRequirementsPolicy,
  context: {
    eligibleCounts: ReviewRequirementsEligibleCounts;
    lenderEligibilityIssue?: string;
    lenderScopeAvailable: boolean;
  }
) {
  const messages: string[] = [];
  if (context.lenderEligibilityIssue) {
    messages.push(context.lenderEligibilityIssue);
  }
  const validateQuorum = (
    mode: ReviewRequirementsMode,
    quorum: number | null,
    label: string,
    eligibleCount: number
  ) => {
    if (!needsLenderQuorum(mode)) {
      return;
    }
    if (!context.lenderScopeAvailable) {
      messages.push(`${label} lender review requires a lender organization.`);
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

export function reviewRequirementsPoliciesEqual(
  left: ReviewRequirementsPolicy,
  right: ReviewRequirementsPolicy
) {
  return JSON.stringify(left) === JSON.stringify(right);
}
