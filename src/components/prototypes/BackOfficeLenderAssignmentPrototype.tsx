"use client";

/**
 * Three lender-assignment modal variants embedded into the existing production
 * proposal surface, switchable through ?variant=A|B|C.
 *
 * THESIS: Test the trigger placement and protected assignment interaction, not
 * a replacement proposal workspace.
 * OWN-WORLD: Inherit DrawFlow's production proposal surface and dialog system.
 * STORY: An approved external-capital proposal gains one contextual action that
 * assigns exactly one external Lender Organization.
 * FIRST VIEWPORT: The production proposal remains primary; the prototype
 * addition is small and local to the decision context.
 * FORM: A header action, a Review context panel, and a Closing prerequisite.
 */

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Landmark,
  LockKeyhole,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { ProductionProposalReviewSurface } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { VISUAL_PARITY_APPROVED_PROPOSAL_ID } from "#/features/production-proposals/visualParityConstants.ts";
import { getVisualParityProposalDetail } from "#/features/production-proposals/visualParityFixtures.ts";
import { cn } from "#/lib/utils.ts";

export const lenderAssignmentPrototypeVariants = [
  { key: "A", name: "Header action · focused form" },
  { key: "B", name: "Review panel · guided steps" },
  { key: "C", name: "Closing gate · split selector" },
] as const;

export type LenderAssignmentPrototypeVariant =
  (typeof lenderAssignmentPrototypeVariants)[number]["key"];

interface LenderOrganization {
  key: string;
  location: string;
  name: string;
}

interface LocalAssignment {
  organizationKey: string;
  organizationName: string;
}

const lenderOrganizations: LenderOrganization[] = [
  {
    key: "harbourview",
    location: "Ontario",
    name: "Harbourview Lending Group",
  },
  {
    key: "north-shore",
    location: "Ontario",
    name: "North Shore Capital",
  },
  {
    key: "meridian",
    location: "Canada",
    name: "Meridian Construction Finance",
  },
];

export function BackOfficeLenderAssignmentPrototype({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: LenderAssignmentPrototypeVariant) => void;
  variant: LenderAssignmentPrototypeVariant;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const portalHost = usePrototypePortalHost(rootRef, variant);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrganizationKey, setSelectedOrganizationKey] = useState("");
  const [assigned, setAssigned] = useState<LocalAssignment | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [query, setQuery] = useState("");
  const detail = getVisualParityProposalDetail(
    VISUAL_PARITY_APPROVED_PROPOSAL_ID
  );

  const selectedOrganization =
    lenderOrganizations.find(
      (organization) => organization.key === selectedOrganizationKey
    ) ?? null;

  const openAssignment = () => {
    setSelectedOrganizationKey(assigned?.organizationKey ?? "");
    setAcknowledged(false);
    setStep("choose");
    setQuery("");
    setDialogOpen(true);
  };

  const confirmAssignment = () => {
    if (!selectedOrganization) {
      return;
    }
    setAssigned({
      organizationKey: selectedOrganization.key,
      organizationName: selectedOrganization.name,
    });
    setDialogOpen(false);
  };

  const initialActiveTab =
    variant === "B" ? "review" : variant === "C" ? "closing" : "packet";

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <ProductionProposalReviewSurface
        detail={detail}
        initialActiveTab={initialActiveTab}
      />

      {portalHost
        ? createPortal(
            <AssignmentTrigger
              assigned={assigned}
              onOpen={openAssignment}
              variant={variant}
            />,
            portalHost
          )
        : null}

      <AssignmentDialog
        acknowledged={acknowledged}
        assigned={assigned}
        onAcknowledgedChange={setAcknowledged}
        onConfirm={confirmAssignment}
        onOpenChange={setDialogOpen}
        onQueryChange={setQuery}
        onSelectedOrganizationChange={setSelectedOrganizationKey}
        onStepChange={setStep}
        open={dialogOpen}
        query={query}
        selectedOrganization={selectedOrganization}
        selectedOrganizationKey={selectedOrganizationKey}
        step={step}
        variant={variant}
      />

      {dialogOpen ? null : (
        <PrototypeVariantSwitcher
          current={variant}
          onChange={(next) =>
            onVariantChange(next as LenderAssignmentPrototypeVariant)
          }
          variants={lenderAssignmentPrototypeVariants}
        />
      )}
    </div>
  );
}

function usePrototypePortalHost(
  rootRef: RefObject<HTMLDivElement | null>,
  variant: LenderAssignmentPrototypeVariant
) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const selector =
      variant === "A"
        ? '[data-testid="production-proposal-review-tabs"] [data-slot="frame-panel"]'
        : variant === "B"
          ? '[data-testid="proposal-review-context-column"]'
          : '[data-testid="production-proposal-closing-tab"]';
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) {
      return;
    }

    const nextHost = document.createElement("div");
    nextHost.className = "w-full min-w-0";
    nextHost.dataset.prototypeLenderAssignmentHost = variant;
    if (variant === "B" || variant === "C") {
      target.prepend(nextHost);
    } else {
      target.append(nextHost);
    }
    setHost(nextHost);

    return () => {
      nextHost.remove();
      setHost(null);
    };
  }, [rootRef, variant]);

  return host;
}

function AssignmentTrigger({
  assigned,
  onOpen,
  variant,
}: {
  assigned: LocalAssignment | null;
  onOpen: () => void;
  variant: LenderAssignmentPrototypeVariant;
}) {
  const buttonLabel = assigned ? "View assignment" : "Assign lender";

  if (variant === "A") {
    return (
      <>
        <Separator />
        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Landmark className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">External lender</p>
              <p className="truncate text-muted-foreground text-xs">
                {assigned?.organizationName ?? "No lender assigned"}
              </p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={onOpen} size="sm">
            {buttonLabel}
            <ArrowRight />
          </Button>
        </div>
      </>
    );
  }

  if (variant === "B") {
    return (
      <Frame>
        <FramePanel className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h2 className="font-semibold text-sm">External lender</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  {assigned
                    ? assigned.organizationName
                    : "Optional for this approved external-capital proposal."}
                </p>
              </div>
            </div>
            {assigned ? <Badge variant="success">Assigned</Badge> : null}
          </div>
          <Button className="mt-4 w-full" onClick={onOpen} variant="outline">
            {buttonLabel}
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame className="mb-4">
      <FramePanel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="font-semibold text-sm">Lender confirmation</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              {assigned
                ? `${assigned.organizationName} is assigned.`
                : "Assign a lender before using the external closing path."}
            </p>
          </div>
        </div>
        <div className="text-xs">
          <p className="text-muted-foreground">Closing prerequisite</p>
          <p className="mt-1 font-semibold">
            {assigned ? "Awaiting lender confirmation" : "Lender not assigned"}
          </p>
        </div>
        <Button onClick={onOpen}>{buttonLabel}</Button>
      </FramePanel>
    </Frame>
  );
}

function AssignmentDialog({
  acknowledged,
  assigned,
  onAcknowledgedChange,
  onConfirm,
  onOpenChange,
  onQueryChange,
  onSelectedOrganizationChange,
  onStepChange,
  open,
  query,
  selectedOrganization,
  selectedOrganizationKey,
  step,
  variant,
}: {
  acknowledged: boolean;
  assigned: LocalAssignment | null;
  onAcknowledgedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  onStepChange: (step: "choose" | "confirm") => void;
  open: boolean;
  query: string;
  selectedOrganization: LenderOrganization | null;
  selectedOrganizationKey: string;
  step: "choose" | "confirm";
  variant: LenderAssignmentPrototypeVariant;
}) {
  if (assigned) {
    return (
      <AssignedLenderDialog
        assigned={assigned}
        onOpenChange={onOpenChange}
        open={open}
      />
    );
  }

  if (variant === "A") {
    return (
      <FocusedAssignmentDialog
        acknowledged={acknowledged}
        onAcknowledgedChange={onAcknowledgedChange}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        onSelectedOrganizationChange={onSelectedOrganizationChange}
        open={open}
        selectedOrganization={selectedOrganization}
        selectedOrganizationKey={selectedOrganizationKey}
      />
    );
  }

  if (variant === "B") {
    return (
      <GuidedAssignmentDialog
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        onQueryChange={onQueryChange}
        onSelectedOrganizationChange={onSelectedOrganizationChange}
        onStepChange={onStepChange}
        open={open}
        query={query}
        selectedOrganization={selectedOrganization}
        selectedOrganizationKey={selectedOrganizationKey}
        step={step}
      />
    );
  }

  return (
    <SplitAssignmentDialog
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      onQueryChange={onQueryChange}
      onSelectedOrganizationChange={onSelectedOrganizationChange}
      open={open}
      query={query}
      selectedOrganization={selectedOrganization}
      selectedOrganizationKey={selectedOrganizationKey}
    />
  );
}

function FocusedAssignmentDialog({
  acknowledged,
  onAcknowledgedChange,
  onConfirm,
  onOpenChange,
  onSelectedOrganizationChange,
  open,
  selectedOrganization,
  selectedOrganizationKey,
}: {
  acknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  open: boolean;
  selectedOrganization: LenderOrganization | null;
  selectedOrganizationKey: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign external lender</DialogTitle>
          <DialogDescription>
            Choose the Lender Organization that will review Hamilton Infill
            Build before closing.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <ProposalAssignmentContext />
          <div className="grid gap-2">
            <Label htmlFor="focused-lender-organization">
              Lender Organization
            </Label>
            <Select
              onValueChange={(value) =>
                onSelectedOrganizationChange(value as string)
              }
              value={selectedOrganizationKey || undefined}
            >
              <SelectTrigger id="focused-lender-organization">
                <SelectValue placeholder="Select a lender organization" />
              </SelectTrigger>
              <SelectPopup>
                {lenderOrganizations.map((organization) => (
                  <SelectItem key={organization.key} value={organization.key}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <AssignmentImpact />
          <label
            className="flex cursor-pointer items-start gap-3 text-sm"
            htmlFor="focused-assignment-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              id="focused-assignment-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
            />
            <span>
              Assign {selectedOrganization?.name ?? "the selected lender"} to
              the current approved proposal.
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            disabled={!(selectedOrganization && acknowledged)}
            onClick={onConfirm}
          >
            Assign lender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuidedAssignmentDialog({
  onConfirm,
  onOpenChange,
  onQueryChange,
  onSelectedOrganizationChange,
  onStepChange,
  open,
  query,
  selectedOrganization,
  selectedOrganizationKey,
  step,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  onStepChange: (step: "choose" | "confirm") => void;
  open: boolean;
  query: string;
  selectedOrganization: LenderOrganization | null;
  selectedOrganizationKey: string;
  step: "choose" | "confirm";
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign external lender</DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? "Choose one eligible Lender Organization."
              : "Confirm the lender and proposal access before assignment."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <StepLabel
              active={step === "choose"}
              label="Choose lender"
              step={1}
            />
            <StepLabel
              active={step === "confirm"}
              label="Confirm access"
              step={2}
            />
          </div>
          {step === "choose" ? (
            <div className="space-y-5">
              <OrganizationPicker
                onQueryChange={onQueryChange}
                onSelectedOrganizationChange={onSelectedOrganizationChange}
                query={query}
                selectedOrganizationKey={selectedOrganizationKey}
              />
              <ReviewPolicySnapshot />
            </div>
          ) : (
            <div className="space-y-5">
              <ProposalAssignmentContext />
              <AssignmentSummary organization={selectedOrganization} />
              <AssignmentImpact />
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          {step === "confirm" ? (
            <Button onClick={() => onStepChange("choose")} variant="outline">
              <ChevronLeft />
              Back
            </Button>
          ) : (
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
          )}
          {step === "choose" ? (
            <Button
              disabled={!selectedOrganization}
              onClick={() => onStepChange("confirm")}
            >
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button disabled={!selectedOrganization} onClick={onConfirm}>
              Confirm assignment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitAssignmentDialog({
  onConfirm,
  onOpenChange,
  onQueryChange,
  onSelectedOrganizationChange,
  open,
  query,
  selectedOrganization,
  selectedOrganizationKey,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  open: boolean;
  query: string;
  selectedOrganization: LenderOrganization | null;
  selectedOrganizationKey: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select lender organization</DialogTitle>
          <DialogDescription>
            Assignment opens lender review for this approved proposal.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="p-0">
          <div className="grid min-h-[26rem] md:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4 p-6">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Find a lender organization"
                  className="pl-9"
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Find lender organization"
                  value={query}
                />
              </div>
              <OrganizationCards
                onSelect={onSelectedOrganizationChange}
                query={query}
                selectedOrganizationKey={selectedOrganizationKey}
              />
            </div>
            <aside className="border-t bg-muted/36 p-6 md:border-t-0 md:border-l">
              <h2 className="font-semibold text-sm">Assignment summary</h2>
              <div className="mt-4">
                <AssignmentSummary organization={selectedOrganization} />
              </div>
              <Separator className="my-5" />
              <AssignmentImpact compact />
            </aside>
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button disabled={!selectedOrganization} onClick={onConfirm}>
            Assign lender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedLenderDialog({
  assigned,
  onOpenChange,
  open,
}: {
  assigned: LocalAssignment;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lender assignment</DialogTitle>
          <DialogDescription>
            Current assignment for Hamilton Infill Build.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-success" />
            <div>
              <p className="font-semibold">{assigned.organizationName}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Assigned to the current approved proposal.
              </p>
            </div>
          </div>
          <AssignmentImpact />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button>Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalAssignmentContext() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant="success">Approved</Badge>
      <Badge variant="outline">External capital</Badge>
      <span className="text-muted-foreground text-sm">
        Hamilton Infill Build
      </span>
    </div>
  );
}

function ReviewPolicySnapshot({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-labelledby="current-review-policy" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-sm" id="current-review-policy">
              Review policy
            </h2>
            <Badge variant="outline">Configured</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Editable until closing, then locked to the confirmed policy.
          </p>
        </div>
        <Button
          render={
            <Link
              search={{ variant: "A" }}
              to="/backoffice/proposals/review-requirements-prototype"
            />
          }
          size="sm"
          variant="ghost"
        >
          Edit review policy
        </Button>
      </div>
      <dl
        className={cn(
          "grid gap-x-5 gap-y-3 text-xs",
          compact ? "grid-cols-1" : "sm:grid-cols-2"
        )}
      >
        <div>
          <dt className="text-muted-foreground">Milestone review</dt>
          <dd className="mt-1 font-semibold">
            Back Office + 2 lender approvals
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Required evidence</dt>
          <dd className="mt-1 font-semibold">
            Site visit + receipt or invoice
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Draw review</dt>
          <dd className="mt-1 font-semibold">2 lender approvals</dd>
        </div>
      </dl>
    </section>
  );
}

function AssignmentImpact({ compact = false }: { compact?: boolean }) {
  const rows = [
    {
      icon: Users,
      text: "Eligible lender users can review the current proposal.",
    },
    {
      icon: LockKeyhole,
      text: "Closing waits for lender confirmation of this revision.",
    },
    {
      icon: ShieldCheck,
      text: "The lender confirms the configured review policy.",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <ReviewPolicySnapshot compact={compact} />
      <Separator />
      <div>
        <h2 className="font-semibold text-sm">After assignment</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div className="flex items-start gap-3 text-sm" key={row.text}>
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">{row.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrganizationPicker({
  onQueryChange,
  onSelectedOrganizationChange,
  query,
  selectedOrganizationKey,
}: {
  onQueryChange: (query: string) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  query: string;
  selectedOrganizationKey: string;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Find a lender organization"
          className="pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Find lender organization"
          value={query}
        />
      </div>
      <OrganizationCards
        onSelect={onSelectedOrganizationChange}
        query={query}
        selectedOrganizationKey={selectedOrganizationKey}
      />
    </div>
  );
}

function OrganizationCards({
  onSelect,
  query,
  selectedOrganizationKey,
}: {
  onSelect: (organizationKey: string) => void;
  query: string;
  selectedOrganizationKey: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrganizations = lenderOrganizations.filter((organization) =>
    [organization.name, organization.location]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );

  return (
    <div className="grid max-h-[17rem] gap-2 overflow-y-auto overscroll-contain pr-1">
      {filteredOrganizations.map((organization) => {
        const selected = selectedOrganizationKey === organization.key;
        return (
          <Card
            className={cn(
              "cursor-pointer transition-colors hover:bg-accent",
              selected && "border-foreground bg-accent"
            )}
            key={organization.key}
            onClick={() => onSelect(organization.key)}
            render={<button type="button" />}
          >
            <CardHeader className="grid-cols-[1fr_auto] p-4">
              <CardTitle className="text-sm">{organization.name}</CardTitle>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border",
                  selected &&
                    "border-primary bg-primary text-primary-foreground"
                )}
              >
                {selected ? <Check className="size-3" /> : null}
              </span>
              <CardDescription>{organization.location}</CardDescription>
            </CardHeader>
          </Card>
        );
      })}
      {filteredOrganizations.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          No lender organizations match this search.
        </p>
      ) : null}
    </div>
  );
}

function AssignmentSummary({
  organization,
}: {
  organization: LenderOrganization | null;
}) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground text-xs">Lender Organization</dt>
        <dd className="mt-1 font-semibold">
          {organization?.name ?? "Select an organization"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Proposal</dt>
        <dd className="mt-1 font-semibold">Hamilton Infill Build</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Current state</dt>
        <dd className="mt-1 font-semibold">Approved, pending closing</dd>
      </div>
    </dl>
  );
}

function StepLabel({
  active,
  label,
  step,
}: {
  active: boolean;
  label: string;
  step: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-muted/72 px-3 py-2 text-sm",
        active && "bg-accent font-semibold"
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full border text-xs",
          active && "border-foreground"
        )}
      >
        {step}
      </span>
      {label}
    </div>
  );
}
