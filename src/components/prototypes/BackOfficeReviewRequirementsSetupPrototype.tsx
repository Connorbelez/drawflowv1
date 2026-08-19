import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LockKeyhole,
  MapPinCheck,
  Milestone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FrameHeader, FramePanel } from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Radio, RadioGroup } from "#/components/ui/radio-group.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { cn } from "#/lib/utils.ts";

// PROTOTYPE ONLY: approved Variant A plus three unselected review-requirement
// directions for the lender-portal PRD, switchable via ?variant=A|B|C|D.
// State is local.
export const reviewRequirementsPrototypeVariants = [
  { key: "A", name: "Approved · Closing workspace" },
  { key: "B", name: "Not selected · Guided setup" },
  { key: "C", name: "Not selected · Policy matrix" },
  { key: "D", name: "Not selected · Summary first" },
] as const;

export type ReviewRequirementsPrototypeVariant =
  (typeof reviewRequirementsPrototypeVariants)[number]["key"];

type ReviewMode = "backoffice" | "both" | "lender";

interface ReviewRequirementsPolicy {
  draw: {
    lenderQuorum: number;
    mode: ReviewMode;
  };
  milestone: {
    lenderQuorum: number;
    mode: ReviewMode;
    receiptInvoiceRequired: boolean;
    siteVisitRequired: boolean;
  };
}

const ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT = 4;

const initialPolicy: ReviewRequirementsPolicy = {
  draw: {
    lenderQuorum: 2,
    mode: "lender",
  },
  milestone: {
    lenderQuorum: 2,
    mode: "both",
    receiptInvoiceRequired: true,
    siteVisitRequired: true,
  },
};

const reviewModeOptions = [
  {
    description: "One authorized Back Office approval completes the review.",
    label: "Back Office only",
    value: "backoffice",
  },
  {
    description: "The selected lender quorum completes the review.",
    label: "Lender quorum only",
    value: "lender",
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

function needsLenderQuorum(mode: ReviewMode) {
  return mode === "lender" || mode === "both";
}

function reviewModeLabel(mode: ReviewMode) {
  return (
    reviewModeOptions.find((option) => option.value === mode)?.label ??
    "Back Office only"
  );
}

function reviewerSummary(mode: ReviewMode, quorum: number) {
  if (mode === "backoffice") {
    return "One Back Office approval";
  }
  if (mode === "lender") {
    return `${quorum} lender approvals`;
  }
  return `One Back Office approval + ${quorum} lender approvals`;
}

export function ReviewRequirementsSetupPrototype({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: ReviewRequirementsPrototypeVariant) => void;
  variant: ReviewRequirementsPrototypeVariant;
}) {
  const [policy, setPolicy] = useState<ReviewRequirementsPolicy>(initialPolicy);
  const [guidedStep, setGuidedStep] = useState<
    "evidence" | "requirements" | "summary"
  >("requirements");

  const updateMilestone = (
    patch: Partial<ReviewRequirementsPolicy["milestone"]>
  ) =>
    setPolicy((current) => ({
      ...current,
      milestone: { ...current.milestone, ...patch },
    }));
  const updateDraw = (patch: Partial<ReviewRequirementsPolicy["draw"]>) =>
    setPolicy((current) => ({
      ...current,
      draw: { ...current.draw, ...patch },
    }));

  return (
    <section className="flex min-h-[calc(100vh-4rem)] w-full min-w-0 flex-1 flex-col bg-muted/30 px-0 pb-28 md:p-5 md:pb-28">
      <PrototypeNotice />
      <ProposalWorkspaceHeader />

      {variant === "A" ? (
        <VariantA
          onDrawChange={updateDraw}
          onMilestoneChange={updateMilestone}
          policy={policy}
        />
      ) : null}
      {variant === "B" ? (
        <VariantB
          activeStep={guidedStep}
          onDrawChange={updateDraw}
          onMilestoneChange={updateMilestone}
          onStepChange={setGuidedStep}
          policy={policy}
        />
      ) : null}
      {variant === "C" ? (
        <VariantC
          onDrawChange={updateDraw}
          onMilestoneChange={updateMilestone}
          policy={policy}
        />
      ) : null}
      {variant === "D" ? (
        <VariantD
          onDrawChange={updateDraw}
          onMilestoneChange={updateMilestone}
          policy={policy}
        />
      ) : null}

      <LocalStateReadout policy={policy} variant={variant} />
      <PrototypeVariantSwitcher
        current={variant}
        onChange={(next) =>
          onVariantChange(next as ReviewRequirementsPrototypeVariant)
        }
        variants={reviewRequirementsPrototypeVariants}
      />
    </section>
  );
}

function PrototypeNotice() {
  return (
    <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-background/80 px-3 py-2 md:mx-0 md:mt-0 md:mb-4">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline">Throwaway prototype</Badge>
        <span className="text-muted-foreground">
          Read-only product exploration · controls update local state only
        </span>
      </div>
      <span className="text-muted-foreground text-xs">
        Variant A approved · refresh resets local choices
      </span>
    </div>
  );
}

function ProposalWorkspaceHeader() {
  const tabs = [
    "Packet",
    "Timeline",
    "Milestones",
    "Calendar",
    "Review",
    "Draw schedule",
    "Staff",
    "Closing",
  ];

  return (
    <Frame className="mx-3 mt-3 w-auto min-w-0 md:mx-0 md:mt-0 md:w-full">
      <FramePanel className="flex w-full min-w-0 flex-col gap-3 p-3">
        <div className="flex min-w-0 items-center justify-between gap-3 xl:hidden">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Current stage</p>
            <p className="font-semibold text-base">Closing</p>
          </div>
          <Badge variant="outline">Approved · closing pending</Badge>
        </div>
        <nav
          aria-label="Proposal workspace sections"
          className="hidden w-full flex-wrap items-center gap-1 border-b xl:flex"
        >
          {tabs.map((tab) => (
            <span
              className={cn(
                "relative px-3 py-2 font-medium text-muted-foreground text-sm",
                tab === "Closing" &&
                  "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary"
              )}
              key={tab}
            >
              {tab}
            </span>
          ))}
        </nav>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-base">
                Selected Build Proposal
              </p>
              <Badge>Approved</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Configure the review requirements that the active Build will use.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-5 text-right text-sm">
            <HeaderMetric label="Policy stage" value="Pre-closing" />
            <HeaderMetric label="Policy lock" value="At closing" />
            <HeaderMetric label="Prototype state" value="Local only" />
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function VariantA({ onDrawChange, onMilestoneChange, policy }: VariantProps) {
  return (
    <div className="mx-3 mt-4 grid min-w-0 gap-4 md:mx-0">
      <Frame>
        <FrameHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-base">Review requirements</p>
              <p className="text-muted-foreground text-sm">
                Added to the existing Closing workspace before closing is
                recorded.
              </p>
            </div>
            <Badge variant="outline">
              <LockKeyhole /> Locks at closing
            </Badge>
          </div>
        </FrameHeader>
        <FramePanel className="grid gap-6 p-5 xl:grid-cols-2">
          <RequirementSection
            icon={Milestone}
            mode={policy.milestone.mode}
            onModeChange={(mode) => onMilestoneChange({ mode })}
            onQuorumChange={(lenderQuorum) =>
              onMilestoneChange({ lenderQuorum })
            }
            quorum={policy.milestone.lenderQuorum}
            title="Milestone review"
          >
            <Separator />
            <EvidenceControls
              onReceiptInvoiceChange={(receiptInvoiceRequired) =>
                onMilestoneChange({ receiptInvoiceRequired })
              }
              onSiteVisitChange={(siteVisitRequired) =>
                onMilestoneChange({ siteVisitRequired })
              }
              receiptInvoiceRequired={policy.milestone.receiptInvoiceRequired}
              siteVisitRequired={policy.milestone.siteVisitRequired}
            />
          </RequirementSection>
          <RequirementSection
            icon={FileCheck2}
            mode={policy.draw.mode}
            onModeChange={(mode) => onDrawChange({ mode })}
            onQuorumChange={(lenderQuorum) => onDrawChange({ lenderQuorum })}
            quorum={policy.draw.lenderQuorum}
            title="Draw review"
          />
        </FramePanel>
      </Frame>
      <PolicySummary policy={policy} title="Pre-closing policy summary" />
    </div>
  );
}

type GuidedStep = "evidence" | "requirements" | "summary";

function VariantB({
  activeStep,
  onDrawChange,
  onMilestoneChange,
  onStepChange,
  policy,
}: VariantProps & {
  activeStep: GuidedStep;
  onStepChange: (step: GuidedStep) => void;
}) {
  const steps: { key: GuidedStep; label: string; note: string }[] = [
    {
      key: "requirements",
      label: "Reviewer groups",
      note: "Milestone and Draw approvals",
    },
    {
      key: "evidence",
      label: "Milestone evidence",
      note: "Site visit and documents",
    },
    {
      key: "summary",
      label: "Closing summary",
      note: "Policy that will lock",
    },
  ];

  return (
    <div className="mx-3 mt-4 grid min-w-0 gap-4 md:mx-0 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      <Frame className="h-fit">
        <FramePanel className="p-2">
          <p className="px-3 pt-2 pb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Closing setup
          </p>
          <nav aria-label="Review requirement steps" className="grid gap-1">
            {steps.map((step, index) => (
              <Button
                className="h-auto justify-start px-3 py-3 text-left"
                key={step.key}
                onClick={() => onStepChange(step.key)}
                variant={activeStep === step.key ? "secondary" : "ghost"}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{step.label}</span>
                  <span className="block whitespace-normal text-muted-foreground text-xs">
                    {step.note}
                  </span>
                </span>
              </Button>
            ))}
          </nav>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="min-h-[32rem] p-6">
          {activeStep === "requirements" ? (
            <div className="grid gap-8">
              <StepHeading eyebrow="Step 1 of 3" title="Who must approve?">
                Select the required group for each review. A Back Office
                requirement always means one authorized approval.
              </StepHeading>
              <RequirementSection
                icon={Milestone}
                mode={policy.milestone.mode}
                onModeChange={(mode) => onMilestoneChange({ mode })}
                onQuorumChange={(lenderQuorum) =>
                  onMilestoneChange({ lenderQuorum })
                }
                quorum={policy.milestone.lenderQuorum}
                title="Milestone review"
              />
              <Separator />
              <RequirementSection
                icon={FileCheck2}
                mode={policy.draw.mode}
                onModeChange={(mode) => onDrawChange({ mode })}
                onQuorumChange={(lenderQuorum) =>
                  onDrawChange({ lenderQuorum })
                }
                quorum={policy.draw.lenderQuorum}
                title="Draw review"
              />
              <Button
                className="justify-self-end"
                onClick={() => onStepChange("evidence")}
              >
                Continue to evidence <ArrowRight />
              </Button>
            </div>
          ) : null}
          {activeStep === "evidence" ? (
            <div className="grid gap-8">
              <StepHeading
                eyebrow="Step 2 of 3"
                title="What must support a Milestone review?"
              >
                Evidence requirements are separate from the reviewer group.
              </StepHeading>
              <EvidenceControls
                onReceiptInvoiceChange={(receiptInvoiceRequired) =>
                  onMilestoneChange({ receiptInvoiceRequired })
                }
                onSiteVisitChange={(siteVisitRequired) =>
                  onMilestoneChange({ siteVisitRequired })
                }
                receiptInvoiceRequired={policy.milestone.receiptInvoiceRequired}
                siteVisitRequired={policy.milestone.siteVisitRequired}
              />
              <Button
                className="justify-self-end"
                onClick={() => onStepChange("summary")}
              >
                Review closing summary <ArrowRight />
              </Button>
            </div>
          ) : null}
          {activeStep === "summary" ? (
            <div className="grid gap-6">
              <StepHeading
                eyebrow="Step 3 of 3"
                title="Confirm what the active Build will use"
              >
                This summary is the policy preview. The policy becomes locked
                when closing is recorded.
              </StepHeading>
              <PolicySummary policy={policy} title="Policy preview" />
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <PolicySummary compact policy={policy} title="Always-visible preview" />
    </div>
  );
}

function VariantC({ onDrawChange, onMilestoneChange, policy }: VariantProps) {
  return (
    <div className="mx-3 mt-4 grid min-w-0 gap-4 md:mx-0">
      <Frame>
        <FrameHeader className="gap-1">
          <p className="font-semibold text-base">Review policy matrix</p>
          <p className="text-muted-foreground text-sm">
            Compare Milestone and Draw requirements in one dense policy ledger.
          </p>
        </FrameHeader>
        <FramePanel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Build record</TableHead>
                  <TableHead>Reviewer requirement</TableHead>
                  <TableHead className="w-52">Lender quorum</TableHead>
                  <TableHead className="w-72">
                    Additional requirements
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="align-top">
                    <RecordLabel icon={Milestone} label="Milestone" />
                  </TableCell>
                  <TableCell className="align-top">
                    <CompactModeSelect
                      mode={policy.milestone.mode}
                      onChange={(mode) => onMilestoneChange({ mode })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <QuorumSelect
                      disabled={!needsLenderQuorum(policy.milestone.mode)}
                      onChange={(lenderQuorum) =>
                        onMilestoneChange({ lenderQuorum })
                      }
                      value={policy.milestone.lenderQuorum}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <EvidenceControls
                      compact
                      onReceiptInvoiceChange={(receiptInvoiceRequired) =>
                        onMilestoneChange({ receiptInvoiceRequired })
                      }
                      onSiteVisitChange={(siteVisitRequired) =>
                        onMilestoneChange({ siteVisitRequired })
                      }
                      receiptInvoiceRequired={
                        policy.milestone.receiptInvoiceRequired
                      }
                      siteVisitRequired={policy.milestone.siteVisitRequired}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="align-top">
                    <RecordLabel icon={FileCheck2} label="Draw" />
                  </TableCell>
                  <TableCell className="align-top">
                    <CompactModeSelect
                      mode={policy.draw.mode}
                      onChange={(mode) => onDrawChange({ mode })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <QuorumSelect
                      disabled={!needsLenderQuorum(policy.draw.mode)}
                      onChange={(lenderQuorum) =>
                        onDrawChange({ lenderQuorum })
                      }
                      value={policy.draw.lenderQuorum}
                    />
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground text-sm">
                    No additional Draw evidence control is included in this
                    prototype.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </FramePanel>
      </Frame>
      <PolicySummary policy={policy} title="Pre-closing policy summary" />
    </div>
  );
}

function VariantD({ onDrawChange, onMilestoneChange, policy }: VariantProps) {
  return (
    <div className="mx-3 mt-4 grid min-w-0 gap-4 md:mx-0">
      <Frame className="bg-foreground p-1 text-background">
        <FramePanel className="border-white/10 bg-foreground p-6 text-background shadow-none">
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/10 text-white">
                  <ShieldCheck /> Active Build policy preview
                </Badge>
                <span className="text-white/60 text-xs">
                  Locks when closing is recorded
                </span>
              </div>
              <h2 className="font-semibold text-2xl tracking-tight">
                Milestones require{" "}
                {reviewerSummary(
                  policy.milestone.mode,
                  policy.milestone.lenderQuorum
                ).toLowerCase()}
                . Draws require{" "}
                {reviewerSummary(
                  policy.draw.mode,
                  policy.draw.lenderQuorum
                ).toLowerCase()}
                .
              </h2>
              <p className="mt-3 text-sm text-white/70">
                {policy.milestone.siteVisitRequired
                  ? "A site visit is required. "
                  : "A site visit is not required. "}
                {policy.milestone.receiptInvoiceRequired
                  ? "Receipt or invoice evidence is required for Milestones."
                  : "Receipt or invoice evidence is not required for Milestones."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6 text-sm xl:text-right">
              <HeaderMetric
                label="Assigned lender members"
                value={String(ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT)}
              />
              <HeaderMetric label="Policy status" value="Pre-closing" />
            </div>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Frame>
          <FramePanel className="p-0">
            <PolicyDisclosure
              icon={Milestone}
              summary={reviewerSummary(
                policy.milestone.mode,
                policy.milestone.lenderQuorum
              )}
              title="Milestone policy"
            >
              <RequirementSection
                icon={Milestone}
                mode={policy.milestone.mode}
                onModeChange={(mode) => onMilestoneChange({ mode })}
                onQuorumChange={(lenderQuorum) =>
                  onMilestoneChange({ lenderQuorum })
                }
                quorum={policy.milestone.lenderQuorum}
                title="Required reviewers"
              >
                <Separator />
                <EvidenceControls
                  onReceiptInvoiceChange={(receiptInvoiceRequired) =>
                    onMilestoneChange({ receiptInvoiceRequired })
                  }
                  onSiteVisitChange={(siteVisitRequired) =>
                    onMilestoneChange({ siteVisitRequired })
                  }
                  receiptInvoiceRequired={
                    policy.milestone.receiptInvoiceRequired
                  }
                  siteVisitRequired={policy.milestone.siteVisitRequired}
                />
              </RequirementSection>
            </PolicyDisclosure>
            <Separator />
            <PolicyDisclosure
              icon={FileCheck2}
              summary={reviewerSummary(
                policy.draw.mode,
                policy.draw.lenderQuorum
              )}
              title="Draw policy"
            >
              <RequirementSection
                icon={FileCheck2}
                mode={policy.draw.mode}
                onModeChange={(mode) => onDrawChange({ mode })}
                onQuorumChange={(lenderQuorum) =>
                  onDrawChange({ lenderQuorum })
                }
                quorum={policy.draw.lenderQuorum}
                title="Required reviewers"
              />
            </PolicyDisclosure>
          </FramePanel>
        </Frame>
        <GovernanceFacts />
      </div>
    </div>
  );
}

interface VariantProps {
  onDrawChange: (patch: Partial<ReviewRequirementsPolicy["draw"]>) => void;
  onMilestoneChange: (
    patch: Partial<ReviewRequirementsPolicy["milestone"]>
  ) => void;
  policy: ReviewRequirementsPolicy;
}

function RequirementSection({
  children,
  icon: Icon,
  mode,
  onModeChange,
  onQuorumChange,
  quorum,
  title,
}: {
  children?: ReactNode;
  icon: typeof Milestone;
  mode: ReviewMode;
  onModeChange: (mode: ReviewMode) => void;
  onQuorumChange: (quorum: number) => void;
  quorum: number;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground text-xs">
            Choose the approval group that completes this review.
          </p>
        </div>
      </div>
      <ModeRadioGroup mode={mode} onChange={onModeChange} />
      {needsLenderQuorum(mode) ? (
        <QuorumSelect onChange={onQuorumChange} value={quorum} />
      ) : null}
      {children}
    </div>
  );
}

function ModeRadioGroup({
  mode,
  onChange,
}: {
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}) {
  const groupId = useId();

  return (
    <RadioGroup
      aria-label="Reviewer requirement"
      onValueChange={(value) => onChange(value as ReviewMode)}
      value={mode}
    >
      {reviewModeOptions.map((option) => (
        <Card
          className="rounded-lg p-0 shadow-none has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
          key={option.value}
        >
          <label
            className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 p-3"
            htmlFor={`${groupId}-${option.value}`}
          >
            <Radio
              className="mt-0.5"
              id={`${groupId}-${option.value}`}
              value={option.value}
            />
            <span>
              <span className="block font-medium text-sm">{option.label}</span>
              <span className="block text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
          </label>
        </Card>
      ))}
    </RadioGroup>
  );
}

function CompactModeSelect({
  mode,
  onChange,
}: {
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}) {
  return (
    <NativeSelect
      aria-label="Reviewer requirement"
      className="w-full"
      onChange={(event) => onChange(event.target.value as ReviewMode)}
      value={mode}
    >
      {reviewModeOptions.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function QuorumSelect({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (quorum: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="font-medium text-xs">Lender quorum</p>
      <NativeSelect
        aria-label="Lender quorum"
        className="w-full"
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        value={String(value)}
      >
        {Array.from(
          { length: ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT },
          (_, index) => index + 1
        ).map((count) => (
          <NativeSelectOption key={count} value={count}>
            {count} of {ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT} active assigned
            lender members
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-muted-foreground text-xs">
        Select 1–{ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT}, based on the active
        assigned lender members.
      </p>
    </div>
  );
}

function EvidenceControls({
  compact = false,
  onReceiptInvoiceChange,
  onSiteVisitChange,
  receiptInvoiceRequired,
  siteVisitRequired,
}: {
  compact?: boolean;
  onReceiptInvoiceChange: (required: boolean) => void;
  onSiteVisitChange: (required: boolean) => void;
  receiptInvoiceRequired: boolean;
  siteVisitRequired: boolean;
}) {
  return (
    <div className={cn("grid gap-3", !compact && "pt-1")}>
      {compact ? null : (
        <div>
          <p className="font-medium text-sm">Milestone evidence</p>
          <p className="text-muted-foreground text-xs">
            These controls are independent of the reviewer requirement.
          </p>
        </div>
      )}
      <EvidenceCheckbox
        checked={siteVisitRequired}
        icon={MapPinCheck}
        label="Site visit required"
        onCheckedChange={onSiteVisitChange}
      />
      <EvidenceCheckbox
        checked={receiptInvoiceRequired}
        icon={FileText}
        label="Receipt / invoice required"
        onCheckedChange={onReceiptInvoiceChange}
      />
    </div>
  );
}

function EvidenceCheckbox({
  checked,
  icon: Icon,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  icon: typeof MapPinCheck;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = useId();

  return (
    <Card className="rounded-lg p-0 shadow-none">
      <label
        className="flex cursor-pointer items-center gap-3 p-3"
        htmlFor={checkboxId}
      >
        <Checkbox
          checked={checked}
          id={checkboxId}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{label}</span>
      </label>
    </Card>
  );
}

function PolicySummary({
  compact = false,
  policy,
  title,
}: {
  compact?: boolean;
  policy: ReviewRequirementsPolicy;
  title: string;
}) {
  return (
    <Frame className={cn(compact && "h-fit xl:sticky xl:top-5")}>
      <FramePanel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-muted-foreground text-xs">
              This is the policy that will govern the active Build.
            </p>
          </div>
          <LockKeyhole className="size-4 text-muted-foreground" />
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4">
          <SummaryRow
            icon={Milestone}
            label="Milestone review"
            value={reviewerSummary(
              policy.milestone.mode,
              policy.milestone.lenderQuorum
            )}
          />
          <SummaryRow
            icon={MapPinCheck}
            label="Site visit"
            value={
              policy.milestone.siteVisitRequired ? "Required" : "Not required"
            }
          />
          <SummaryRow
            icon={FileText}
            label="Receipt / invoice"
            value={
              policy.milestone.receiptInvoiceRequired
                ? "Required"
                : "Not required"
            }
          />
          <SummaryRow
            icon={FileCheck2}
            label="Draw review"
            value={reviewerSummary(policy.draw.mode, policy.draw.lenderQuorum)}
          />
        </div>
        <div className="mt-5 rounded-lg bg-muted p-3 text-muted-foreground text-xs">
          Back Office approval is one authorized approval. When both groups are
          required, Back Office and lender approvals may be completed in either
          order. This policy locks at closing.
        </div>
      </FramePanel>
    </Frame>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Milestone;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <span className="row-span-2 flex size-8 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

function StepHeading({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="font-medium text-primary text-xs uppercase tracking-wide">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-semibold text-xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

function RecordLabel({
  icon: Icon,
  label,
}: {
  icon: typeof Milestone;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 font-medium text-sm">
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </div>
  );
}

function PolicyDisclosure({
  children,
  icon: Icon,
  summary,
  title,
}: {
  children: ReactNode;
  icon: typeof Milestone;
  summary: string;
  title: string;
}) {
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block truncate text-muted-foreground text-sm">
            {summary}
          </span>
        </span>
        <span className="text-muted-foreground text-xs group-open:hidden">
          Edit
        </span>
        <span className="hidden text-muted-foreground text-xs group-open:inline">
          Collapse
        </span>
      </summary>
      <div className="border-t p-5">{children}</div>
    </details>
  );
}

function GovernanceFacts() {
  const facts = [
    {
      icon: Users,
      text: `${ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT} active assigned lender members bound the selectable quorum.`,
    },
    {
      icon: Building2,
      text: "Back Office approval is one authorized approval.",
    },
    {
      icon: ClipboardCheck,
      text: "When both groups are required, either group may complete first.",
    },
    {
      icon: LockKeyhole,
      text: "The previewed policy becomes locked when closing is recorded.",
    },
  ];

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Governance facts</CardTitle>
        <CardDescription>
          Fixed rules reflected by this prototype.
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        {facts.map(({ icon: Icon, text }) => (
          <div className="flex gap-3 text-sm" key={text}>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>{text}</p>
          </div>
        ))}
      </CardPanel>
    </Card>
  );
}

function LocalStateReadout({
  policy,
  variant,
}: {
  policy: ReviewRequirementsPolicy;
  variant: ReviewRequirementsPrototypeVariant;
}) {
  return (
    <div className="mx-3 mt-4 md:mx-0" data-testid="prototype-local-state">
      <details className="rounded-lg border border-dashed bg-background/60 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Local prototype state · Variant {variant}
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StateValue
            label="Milestone reviewers"
            value={reviewModeLabel(policy.milestone.mode)}
          />
          <StateValue
            label="Milestone lender quorum"
            value={
              needsLenderQuorum(policy.milestone.mode)
                ? `${policy.milestone.lenderQuorum} of ${ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT}`
                : "Not applicable"
            }
          />
          <StateValue
            label="Milestone evidence"
            value={`Site visit: ${policy.milestone.siteVisitRequired ? "required" : "not required"}; receipt / invoice: ${policy.milestone.receiptInvoiceRequired ? "required" : "not required"}`}
          />
          <StateValue
            label="Draw reviewers"
            value={`${reviewModeLabel(policy.draw.mode)}${
              needsLenderQuorum(policy.draw.mode)
                ? ` · ${policy.draw.lenderQuorum} of ${ACTIVE_ASSIGNED_LENDER_MEMBER_COUNT}`
                : ""
            }`}
          />
        </dl>
      </details>
    </div>
  );
}

function StateValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
