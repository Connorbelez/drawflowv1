"use client";

/**
 * Locked Variant A: a compact lender-assignment action embedded in the
 * existing production proposal surface, with one focused modal workflow.
 *
 * This remains a throwaway, local-only prototype. It does not persist or
 * authorize a production assignment.
 */

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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

interface LenderOrganization {
  key: string;
  location: string;
  name: string;
}

interface LocalAssignment {
  organizationKey: string;
  organizationName: string;
}

type DialogView = "assign" | "details" | "withdraw";

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

export function BackOfficeLenderAssignmentPrototype() {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalHost = usePrototypePortalHost(rootRef);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<DialogView>("assign");
  const [selectedOrganizationKey, setSelectedOrganizationKey] = useState("");
  const [assigned, setAssigned] = useState<LocalAssignment | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [withdrawalAcknowledged, setWithdrawalAcknowledged] = useState(false);
  const [lastWithdrawal, setLastWithdrawal] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const detail = getVisualParityProposalDetail(
    VISUAL_PARITY_APPROVED_PROPOSAL_ID
  );

  const selectedOrganization =
    lenderOrganizations.find(
      (organization) => organization.key === selectedOrganizationKey
    ) ?? null;

  const openDialog = () => {
    setSelectedOrganizationKey("");
    setAcknowledged(false);
    setWithdrawalAcknowledged(false);
    setDialogView(assigned ? "details" : "assign");
    setDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const handleOrganizationChange = (organizationKey: string) => {
    setSelectedOrganizationKey(organizationKey);
    setAcknowledged(false);
  };

  const confirmAssignment = () => {
    if (!(selectedOrganization && acknowledged)) {
      return;
    }

    setAssigned({
      organizationKey: selectedOrganization.key,
      organizationName: selectedOrganization.name,
    });
    setLastWithdrawal(null);
    setAnnouncement(
      `${selectedOrganization.name} is assigned in this local prototype. Lender confirmation is next.`
    );
    handleOpenChange(false);
  };

  const confirmWithdrawal = () => {
    if (!(assigned && withdrawalAcknowledged)) {
      return;
    }

    setLastWithdrawal(assigned.organizationName);
    setAnnouncement(
      `${assigned.organizationName} was withdrawn in this local prototype. The internal closing path is restored.`
    );
    setAssigned(null);
    handleOpenChange(false);
  };

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <ProductionProposalReviewSurface
        detail={detail}
        initialActiveTab="packet"
      />

      {portalHost
        ? createPortal(
            <AssignmentTrigger
              assigned={assigned}
              buttonRef={triggerRef}
              lastWithdrawal={lastWithdrawal}
              onOpen={openDialog}
            />,
            portalHost
          )
        : null}

      <AssignmentDialog
        acknowledged={acknowledged}
        assigned={assigned}
        onAcknowledgedChange={setAcknowledged}
        onConfirmAssignment={confirmAssignment}
        onConfirmWithdrawal={confirmWithdrawal}
        onOpenChange={handleOpenChange}
        onSelectedOrganizationChange={handleOrganizationChange}
        onViewChange={setDialogView}
        onWithdrawalAcknowledgedChange={setWithdrawalAcknowledged}
        open={dialogOpen}
        selectedOrganization={selectedOrganization}
        selectedOrganizationKey={selectedOrganizationKey}
        view={dialogView}
        withdrawalAcknowledged={withdrawalAcknowledged}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function usePrototypePortalHost(rootRef: RefObject<HTMLDivElement | null>) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let nextHost: HTMLDivElement | null = null;
    const attachHost = () => {
      if (nextHost) {
        return true;
      }

      const target = root.querySelector<HTMLElement>(
        '[data-testid="production-proposal-review-tabs"] [data-slot="frame-panel"]'
      );
      if (!target) {
        return false;
      }

      nextHost = document.createElement("div");
      nextHost.className = "w-full min-w-0";
      nextHost.dataset.prototypeLenderAssignmentHost = "A";
      target.append(nextHost);
      setHost(nextHost);
      return true;
    };

    const observer = new MutationObserver(() => {
      if (attachHost()) {
        observer.disconnect();
      }
    });

    if (!attachHost()) {
      observer.observe(root, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      nextHost?.remove();
      setHost(null);
    };
  }, [rootRef]);

  return host;
}

function AssignmentTrigger({
  assigned,
  buttonRef,
  lastWithdrawal,
  onOpen,
}: {
  assigned: LocalAssignment | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
  lastWithdrawal: string | null;
  onOpen: () => void;
}) {
  let supportingText = "Optional · internal closing remains available";
  if (assigned) {
    supportingText = `${assigned.organizationName} · awaiting confirmation`;
  } else if (lastWithdrawal) {
    supportingText =
      "Previous assignment withdrawn · internal closing restored";
  }

  return (
    <>
      <Separator />
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sm">External lender</p>
              {assigned ? (
                <Badge size="sm" variant="info">
                  Awaiting confirmation
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
              {supportingText}
            </p>
          </div>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={onOpen}
          ref={buttonRef}
          size="sm"
          variant={assigned ? "outline" : "default"}
        >
          {assigned ? "View assignment" : "Assign lender"}
          <ArrowRight />
        </Button>
      </div>
    </>
  );
}

function AssignmentDialog({
  acknowledged,
  assigned,
  onAcknowledgedChange,
  onConfirmAssignment,
  onConfirmWithdrawal,
  onOpenChange,
  onSelectedOrganizationChange,
  onViewChange,
  onWithdrawalAcknowledgedChange,
  open,
  selectedOrganization,
  selectedOrganizationKey,
  view,
  withdrawalAcknowledged,
}: {
  acknowledged: boolean;
  assigned: LocalAssignment | null;
  onAcknowledgedChange: (checked: boolean) => void;
  onConfirmAssignment: () => void;
  onConfirmWithdrawal: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedOrganizationChange: (organizationKey: string) => void;
  onViewChange: (view: DialogView) => void;
  onWithdrawalAcknowledgedChange: (checked: boolean) => void;
  open: boolean;
  selectedOrganization: LenderOrganization | null;
  selectedOrganizationKey: string;
  view: DialogView;
  withdrawalAcknowledged: boolean;
}) {
  if (assigned && view === "withdraw") {
    return (
      <WithdrawAssignmentDialog
        acknowledged={withdrawalAcknowledged}
        assigned={assigned}
        onAcknowledgedChange={onWithdrawalAcknowledgedChange}
        onBack={() => onViewChange("details")}
        onConfirm={onConfirmWithdrawal}
        onOpenChange={onOpenChange}
        open={open}
      />
    );
  }

  if (assigned) {
    return (
      <AssignedLenderDialog
        assigned={assigned}
        onOpenChange={onOpenChange}
        onWithdraw={() => onViewChange("withdraw")}
        open={open}
      />
    );
  }

  return (
    <FocusedAssignmentDialog
      acknowledged={acknowledged}
      onAcknowledgedChange={onAcknowledgedChange}
      onConfirm={onConfirmAssignment}
      onOpenChange={onOpenChange}
      onSelectedOrganizationChange={onSelectedOrganizationChange}
      open={open}
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
            Give one Lender Organization access to review Revision 3 of Hamilton
            Infill Build.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
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
                    <span className="flex min-w-0 flex-col py-0.5">
                      <span className="font-medium leading-tight">
                        {organization.name}
                      </span>
                      <span className="mt-0.5 text-muted-foreground text-xs">
                        {organization.location}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <ReviewPolicySnapshot />
          <AssignmentImpact />
          <label
            className="flex cursor-pointer items-start gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-64"
            htmlFor="focused-assignment-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              disabled={!selectedOrganization}
              id="focused-assignment-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
            />
            <span className="leading-relaxed">
              {selectedOrganization
                ? `Assign ${selectedOrganization.name} to Hamilton Infill Build, Revision 3.`
                : "Select a Lender Organization before confirming the assignment."}
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            aria-describedby="assignment-readiness"
            disabled={!(selectedOrganization && acknowledged)}
            onClick={onConfirm}
          >
            Assign lender
          </Button>
          <span className="sr-only" id="assignment-readiness">
            Select an organization and acknowledge the assignment to continue.
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedLenderDialog({
  assigned,
  onOpenChange,
  onWithdraw,
  open,
}: {
  assigned: LocalAssignment;
  onOpenChange: (open: boolean) => void;
  onWithdraw: () => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>External lender assignment</DialogTitle>
          <DialogDescription>
            Current assignment for Hamilton Infill Build, Revision 3.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-info" />
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {assigned.organizationName}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Awaiting guided lender confirmation
              </p>
            </div>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Next actor</dt>
              <dd className="mt-1 font-semibold">Eligible lender user</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Closing eligibility</dt>
              <dd className="mt-1 font-semibold">Blocked until confirmation</dd>
            </div>
          </dl>
          <ReviewPolicySnapshot />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Assignment starts the existing guided confirmation. Closing and
            activation remain separate actions.
          </p>
        </DialogPanel>
        <DialogFooter className="sm:justify-between">
          <Button onClick={onWithdraw} variant="destructive-outline">
            Withdraw assignment
          </Button>
          <DialogClose render={<Button>Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawAssignmentDialog({
  acknowledged,
  assigned,
  onAcknowledgedChange,
  onBack,
  onConfirm,
  onOpenChange,
  open,
}: {
  acknowledged: boolean;
  assigned: LocalAssignment;
  onAcknowledgedChange: (checked: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw lender assignment?</DialogTitle>
          <DialogDescription>
            Remove {assigned.organizationName} from this proposal before
            closing.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <Badge variant="warning">Available before closing only</Badge>
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              Current lender authority is removed and the normal internal
              closing path is restored.
            </p>
            <p className="text-muted-foreground">
              The former lender keeps an authorized read-only historical record
              of the proposal content available during its assignment.
            </p>
          </div>
          <label
            className="flex cursor-pointer items-start gap-3 text-sm"
            htmlFor="withdraw-assignment-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              id="withdraw-assignment-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
            />
            <span className="leading-relaxed">
              Withdraw {assigned.organizationName} and restore internal closing.
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={onBack} variant="outline">
            Back
          </Button>
          <Button
            disabled={!acknowledged}
            onClick={onConfirm}
            variant="destructive"
          >
            Withdraw assignment
          </Button>
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
      <Badge variant="outline">Revision 3</Badge>
    </div>
  );
}

function ReviewPolicySnapshot() {
  return (
    <section aria-labelledby="current-review-policy" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-sm" id="current-review-policy">
              Review policy
            </h2>
            <Badge variant="success">Configured</Badge>
          </div>
          <p className="mt-1 max-w-md text-muted-foreground text-xs leading-relaxed">
            Applies to Revision 3. Any policy change creates a new revision and
            requires full lender reconfirmation before closing.
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
          variant="outline"
        >
          Edit review policy
        </Button>
      </div>
      <dl className="grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
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

function AssignmentImpact() {
  const rows = [
    {
      icon: Users,
      text: "Eligible lender users can review the current proposal revision.",
    },
    {
      icon: LockKeyhole,
      text: "Closing waits for lender confirmation of this revision.",
    },
    {
      icon: ShieldCheck,
      text: "The lender confirms this exact configured review policy.",
    },
  ] as const;

  return (
    <section aria-labelledby="assignment-impact" className="space-y-3">
      <Separator />
      <h2 className="font-semibold text-sm" id="assignment-impact">
        After assignment
      </h2>
      <div className="space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div className="flex items-start gap-3" key={row.text}>
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground text-sm leading-relaxed">
                {row.text}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
