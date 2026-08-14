import {
  ArrowRight,
  CheckCircle2,
  History,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "#/components/ui/textarea.tsx";

export interface ProposalLenderAssignmentRecord {
  assignedAt: number;
  assignedByRole?: string;
  assignedByWorkosUserId?: string;
  assignmentId: string;
  lenderBrokerageId?: string;
  lenderOrganizationId: string;
  lenderOrganizationName: string;
  status: "current" | "withdrawn";
  withdrawalReason?: string;
  withdrawnAt?: number;
  withdrawnByWorkosUserId?: string;
}

export interface ProposalLenderOrganizationOption {
  lenderOrganizationId: string;
  lenderOrganizationName: string;
}

export interface ProposalLenderApprovalSummary {
  approvalId: string;
  approvedAt?: number;
  status: "approved" | "declined";
}

type AssignmentDialogView = "assign" | "details" | "withdraw";

export function ProposalLenderAssignmentSection({
  assignment,
  assignmentHistory = [],
  approval,
  lenderOrganizations,
  lenderOrganizationsPending = false,
  onAssign,
  onEditReviewPolicy,
  onWithdraw,
  proposal,
}: {
  assignment?: ProposalLenderAssignmentRecord | null;
  assignmentHistory?: readonly ProposalLenderAssignmentRecord[];
  approval?: ProposalLenderApprovalSummary | null;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending?: boolean;
  onAssign?: (
    lenderOrganizationId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onEditReviewPolicy?: () => void;
  onWithdraw?: (
    assignmentId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  proposal: {
    buildName: string;
    capitalSource?: "internal" | "external";
    location: string;
    status: "approved" | "closed" | "draft" | "submitted";
  };
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<AssignmentDialogView>("assign");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentAcknowledged, setAssignmentAcknowledged] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [withdrawalAcknowledged, setWithdrawalAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const currentAssignment =
    assignment?.status === "current" ? assignment : null;
  const selectedOrganization = lenderOrganizations.find(
    (organization) =>
      organization.lenderOrganizationId === selectedOrganizationId
  );
  const canAssign = Boolean(
    onAssign &&
      proposal.status === "approved" &&
      proposal.capitalSource === "external" &&
      !currentAssignment
  );
  const canWithdraw = Boolean(
    onWithdraw && currentAssignment && proposal.status === "approved"
  );

  const openDialog = () => {
    setSelectedOrganizationId("");
    setAssignmentReason("");
    setAssignmentAcknowledged(false);
    setWithdrawalReason("");
    setWithdrawalAcknowledged(false);
    setDialogView(currentAssignment ? "details" : "assign");
    setDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const handleOrganizationChange = (organizationId: string) => {
    setSelectedOrganizationId(organizationId);
    setAssignmentAcknowledged(false);
  };

  const confirmAssignment = async () => {
    if (
      !(canAssign && onAssign && selectedOrganization && assignmentAcknowledged)
    ) {
      return;
    }
    const reason = assignmentReason.trim();
    if (!reason) {
      toast.error("Assignment reason required.");
      return;
    }
    setPending(true);
    try {
      await onAssign(selectedOrganization.lenderOrganizationId, reason);
      setAnnouncement(
        `${selectedOrganization.lenderOrganizationName} is assigned. Lender confirmation is next.`
      );
      toast.success("External lender assigned.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(proposalActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const confirmWithdrawal = async () => {
    if (
      !(
        canWithdraw &&
        onWithdraw &&
        currentAssignment &&
        withdrawalAcknowledged
      )
    ) {
      return;
    }
    const reason = withdrawalReason.trim();
    if (!reason) {
      toast.error("Withdrawal reason required.");
      return;
    }
    setPending(true);
    try {
      await onWithdraw(currentAssignment.assignmentId, reason);
      setAnnouncement(
        `${currentAssignment.lenderOrganizationName} was withdrawn. The internal closing path is restored.`
      );
      toast.success("External lender assignment withdrawn.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(proposalActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  let supportingText = "Optional · internal closing remains available";
  if (currentAssignment) {
    supportingText =
      approval?.status === "approved"
        ? `${currentAssignment.lenderOrganizationName} · confirmed for closing`
        : `${currentAssignment.lenderOrganizationName} · awaiting confirmation`;
  } else if (assignment?.status === "withdrawn") {
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
              {currentAssignment ? (
                <Badge
                  size="sm"
                  variant={approval?.status === "approved" ? "success" : "info"}
                >
                  {approval?.status === "approved"
                    ? "Confirmed"
                    : "Awaiting confirmation"}
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
          disabled={!(canAssign || canWithdraw || currentAssignment)}
          onClick={openDialog}
          ref={triggerRef}
          size="sm"
          variant={currentAssignment ? "outline" : "default"}
        >
          {currentAssignment ? "View assignment" : "Assign lender"}
          <ArrowRight />
        </Button>
      </div>

      <AssignmentDialog
        acknowledged={assignmentAcknowledged}
        approval={approval}
        assigned={currentAssignment}
        assignmentHistory={assignmentHistory}
        assignmentReason={assignmentReason}
        lenderOrganizations={lenderOrganizations}
        lenderOrganizationsPending={lenderOrganizationsPending}
        onAcknowledgedChange={setAssignmentAcknowledged}
        onAssignmentReasonChange={setAssignmentReason}
        onConfirmAssignment={confirmAssignment}
        onConfirmWithdrawal={confirmWithdrawal}
        onEditReviewPolicy={onEditReviewPolicy}
        onOpenChange={handleOpenChange}
        onSelectedOrganizationChange={handleOrganizationChange}
        onViewChange={setDialogView}
        onWithdrawalAcknowledgedChange={setWithdrawalAcknowledged}
        onWithdrawalReasonChange={setWithdrawalReason}
        open={dialogOpen}
        pending={pending}
        proposal={proposal}
        selectedOrganization={selectedOrganization}
        selectedOrganizationId={selectedOrganizationId}
        view={dialogView}
        withdrawalAcknowledged={withdrawalAcknowledged}
        withdrawalReason={withdrawalReason}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function AssignmentDialog({
  acknowledged,
  assigned,
  assignmentHistory,
  assignmentReason,
  approval,
  lenderOrganizations,
  lenderOrganizationsPending,
  onAcknowledgedChange,
  onAssignmentReasonChange,
  onConfirmAssignment,
  onConfirmWithdrawal,
  onEditReviewPolicy,
  onOpenChange,
  onSelectedOrganizationChange,
  onViewChange,
  onWithdrawalAcknowledgedChange,
  onWithdrawalReasonChange,
  open,
  pending,
  proposal,
  selectedOrganization,
  selectedOrganizationId,
  view,
  withdrawalAcknowledged,
  withdrawalReason,
}: {
  acknowledged: boolean;
  assigned: ProposalLenderAssignmentRecord | null;
  assignmentHistory: readonly ProposalLenderAssignmentRecord[];
  assignmentReason: string;
  approval?: ProposalLenderApprovalSummary | null;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onAssignmentReasonChange: (reason: string) => void;
  onConfirmAssignment: () => void;
  onConfirmWithdrawal: () => void;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedOrganizationChange: (organizationId: string) => void;
  onViewChange: (view: AssignmentDialogView) => void;
  onWithdrawalAcknowledgedChange: (checked: boolean) => void;
  onWithdrawalReasonChange: (reason: string) => void;
  open: boolean;
  pending: boolean;
  proposal: {
    buildName: string;
    location: string;
  };
  selectedOrganization?: ProposalLenderOrganizationOption;
  selectedOrganizationId: string;
  view: AssignmentDialogView;
  withdrawalAcknowledged: boolean;
  withdrawalReason: string;
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
        onReasonChange={onWithdrawalReasonChange}
        open={open}
        pending={pending}
        reason={withdrawalReason}
      />
    );
  }

  if (assigned) {
    return (
      <AssignedLenderDialog
        approval={approval}
        assigned={assigned}
        assignmentHistory={assignmentHistory}
        onEditReviewPolicy={onEditReviewPolicy}
        onOpenChange={onOpenChange}
        onWithdraw={() => onViewChange("withdraw")}
        open={open}
        pending={pending}
      />
    );
  }

  return (
    <FocusedAssignmentDialog
      acknowledged={acknowledged}
      assignmentReason={assignmentReason}
      lenderOrganizations={lenderOrganizations}
      lenderOrganizationsPending={lenderOrganizationsPending}
      onAcknowledgedChange={onAcknowledgedChange}
      onAssignmentReasonChange={onAssignmentReasonChange}
      onConfirm={onConfirmAssignment}
      onEditReviewPolicy={onEditReviewPolicy}
      onOpenChange={onOpenChange}
      onSelectedOrganizationChange={onSelectedOrganizationChange}
      open={open}
      pending={pending}
      proposal={proposal}
      selectedOrganization={selectedOrganization}
      selectedOrganizationId={selectedOrganizationId}
    />
  );
}

function FocusedAssignmentDialog({
  acknowledged,
  assignmentReason,
  lenderOrganizations,
  lenderOrganizationsPending,
  onAcknowledgedChange,
  onAssignmentReasonChange,
  onConfirm,
  onEditReviewPolicy,
  onOpenChange,
  onSelectedOrganizationChange,
  open,
  pending,
  proposal,
  selectedOrganization,
  selectedOrganizationId,
}: {
  acknowledged: boolean;
  assignmentReason: string;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onAssignmentReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedOrganizationChange: (organizationId: string) => void;
  open: boolean;
  pending: boolean;
  proposal: { buildName: string; location: string };
  selectedOrganization?: ProposalLenderOrganizationOption;
  selectedOrganizationId: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign external lender</DialogTitle>
          <DialogDescription>
            Give one Lender Organization access to review {proposal.buildName}.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <ProposalAssignmentContext />
          <div className="grid gap-2">
            <Label htmlFor="production-lender-organization">
              Lender Organization
            </Label>
            <Select
              disabled={lenderOrganizationsPending || pending}
              onValueChange={(value) =>
                onSelectedOrganizationChange(value as string)
              }
              value={selectedOrganizationId}
            >
              <SelectTrigger id="production-lender-organization">
                <SelectValue placeholder="Select a lender organization">
                  {(value) =>
                    lenderOrganizations.find(
                      (organization) =>
                        organization.lenderOrganizationId === value
                    )?.lenderOrganizationName ?? "Select a lender organization"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {lenderOrganizations.map((organization) => (
                  <SelectItem
                    key={organization.lenderOrganizationId}
                    value={organization.lenderOrganizationId}
                  >
                    <span className="flex min-w-0 flex-col py-0.5">
                      <span className="break-words font-medium leading-tight">
                        {organization.lenderOrganizationName}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {lenderOrganizationsPending ? (
              <p className="text-muted-foreground text-xs" role="status">
                Loading eligible lender organizations...
              </p>
            ) : lenderOrganizations.length === 0 ? (
              <p className="text-muted-foreground text-xs" role="status">
                No eligible external lender organizations are available.
              </p>
            ) : null}
          </div>
          <ReviewPolicySnapshot onEditReviewPolicy={onEditReviewPolicy} />
          <AssignmentImpact />
          <div className="grid gap-2">
            <Label htmlFor="production-lender-assignment-reason">
              Assignment reason
            </Label>
            <Textarea
              id="production-lender-assignment-reason"
              onChange={(event) => onAssignmentReasonChange(event.target.value)}
              placeholder="Explain why this lender is assigned to the proposal."
              value={assignmentReason}
            />
          </div>
          <label
            className="flex cursor-pointer items-start gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-64"
            htmlFor="production-lender-assignment-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              disabled={!selectedOrganization || pending}
              id="production-lender-assignment-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
            />
            <span className="leading-relaxed">
              {selectedOrganization
                ? `Assign ${selectedOrganization.lenderOrganizationName} to ${proposal.buildName}.`
                : "Select a Lender Organization before confirming the assignment."}
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose
            render={
              <Button disabled={pending} variant="outline">
                Cancel
              </Button>
            }
          />
          <Button
            aria-describedby="production-lender-assignment-readiness"
            disabled={
              pending ||
              !(selectedOrganization && acknowledged && assignmentReason.trim())
            }
            onClick={onConfirm}
          >
            {pending ? "Assigning..." : "Assign lender"}
          </Button>
          <span className="sr-only" id="production-lender-assignment-readiness">
            Select an organization, enter a reason, and acknowledge the
            assignment to continue.
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedLenderDialog({
  assigned,
  assignmentHistory,
  approval,
  onEditReviewPolicy,
  onOpenChange,
  onWithdraw,
  open,
  pending,
}: {
  assigned: ProposalLenderAssignmentRecord;
  assignmentHistory: readonly ProposalLenderAssignmentRecord[];
  approval?: ProposalLenderApprovalSummary | null;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onWithdraw: () => void;
  open: boolean;
  pending: boolean;
}) {
  const confirmed = approval?.status === "approved";
  const priorAssignments = assignmentHistory.filter(
    (candidate) => candidate.assignmentId !== assigned.assignmentId
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>External lender assignment</DialogTitle>
          <DialogDescription>
            Current assignment for this proposal.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-info" />
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {assigned.lenderOrganizationName}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {confirmed
                  ? "Lender confirmation recorded"
                  : "Awaiting guided lender confirmation"}
              </p>
            </div>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Next actor</dt>
              <dd className="mt-1 font-semibold">
                {confirmed
                  ? "Back Office or eligible lender user"
                  : "Eligible lender user"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Closing eligibility</dt>
              <dd className="mt-1 font-semibold">
                {confirmed
                  ? "Confirmation gate passed"
                  : "Blocked until confirmation"}
              </dd>
            </div>
          </dl>
          <ReviewPolicySnapshot onEditReviewPolicy={onEditReviewPolicy} />
          {priorAssignments.length > 0 ? (
            <div className="grid gap-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Assignment history</h3>
              </div>
              <ul className="grid gap-2 text-sm">
                {priorAssignments.map((history) => (
                  <li
                    className="grid gap-1 border-b pb-2 last:border-0 last:pb-0"
                    key={history.assignmentId}
                  >
                    <span className="break-words font-medium">
                      {history.lenderOrganizationName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {history.status === "withdrawn" ? "Withdrawn" : "Current"}
                      {history.withdrawalReason
                        ? ` · ${history.withdrawalReason}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm leading-relaxed">
            Assignment starts the existing guided confirmation. Closing and
            activation remain separate actions.
          </p>
        </DialogPanel>
        <DialogFooter className="sm:justify-between">
          <Button
            disabled={pending}
            onClick={onWithdraw}
            variant="destructive-outline"
          >
            Withdraw assignment
          </Button>
          <DialogClose render={<Button disabled={pending}>Done</Button>} />
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
  onReasonChange,
  open,
  pending,
  reason,
}: {
  acknowledged: boolean;
  assigned: ProposalLenderAssignmentRecord;
  onAcknowledgedChange: (checked: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  open: boolean;
  pending: boolean;
  reason: string;
}) {
  const acknowledgementRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open) {
      requestAnimationFrame(() => acknowledgementRef.current?.focus());
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw lender assignment?</DialogTitle>
          <DialogDescription>
            Remove {assigned.lenderOrganizationName} from this proposal before
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
          <div className="grid gap-2">
            <Label htmlFor="production-lender-withdrawal-reason">
              Withdrawal reason
            </Label>
            <Textarea
              id="production-lender-withdrawal-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why the assignment is withdrawn."
              value={reason}
            />
          </div>
          <label
            className="flex cursor-pointer items-start gap-3 text-sm"
            htmlFor="production-lender-withdrawal-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              disabled={pending}
              id="production-lender-withdrawal-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
              ref={acknowledgementRef}
            />
            <span className="leading-relaxed">
              Withdraw {assigned.lenderOrganizationName} and restore internal
              closing.
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <Button disabled={pending} onClick={onBack} variant="outline">
            Back
          </Button>
          <Button
            disabled={pending || !acknowledged || !reason.trim()}
            onClick={onConfirm}
            variant="destructive"
          >
            {pending ? "Withdrawing..." : "Withdraw assignment"}
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
      <Badge variant="outline">Current revision</Badge>
    </div>
  );
}

function ReviewPolicySnapshot({
  onEditReviewPolicy,
}: {
  onEditReviewPolicy?: () => void;
} = {}) {
  return (
    <section
      aria-labelledby="production-current-review-policy"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="font-semibold text-sm"
              id="production-current-review-policy"
            >
              Review policy
            </h3>
            <Badge variant="success">Configured</Badge>
          </div>
          <p className="mt-1 max-w-md text-muted-foreground text-xs leading-relaxed">
            The Back Office-configured policy applies to the current proposal
            revision and remains read-only for the lender.
          </p>
        </div>
        <Button
          disabled={!onEditReviewPolicy}
          onClick={onEditReviewPolicy}
          size="sm"
          variant="outline"
        >
          Edit review policy
        </Button>
      </div>
      <dl className="grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Milestone review</dt>
          <dd className="mt-1 font-semibold">Back Office + lender approval</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Required evidence</dt>
          <dd className="mt-1 font-semibold">Configured before closing</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Draw review</dt>
          <dd className="mt-1 font-semibold">Back Office + lender approval</dd>
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
      text: "The assigned lender cannot edit the Back Office review policy.",
    },
  ];

  return (
    <div className="grid gap-3 border-t pt-4">
      <h3 className="font-semibold text-sm">Assignment effect</h3>
      <ul className="grid gap-3">
        {rows.map(({ icon: Icon, text }) => (
          <li
            className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed"
            key={text}
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function proposalActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Assignment action failed.";
}
