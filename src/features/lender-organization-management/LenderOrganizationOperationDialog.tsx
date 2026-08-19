import {
  ArrowRight,
  CircleCheck,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DirectoryUser } from "#/routes/backoffice/-user-management-detail-sheet.tsx";

import type { LenderOrganizationOperation } from "./LenderOrganizationManagementVariantE.tsx";

const roleOptions = [
  { label: "Lender", slug: "lender" },
  { label: "Lender Admin", slug: "lender-admin" },
  { label: "Lender Staff", slug: "lender-staff" },
] as const;
type LenderRole = (typeof roleOptions)[number]["slug"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LenderOrganizationOperationRequest =
  | {
      email: string;
      kind: "invite";
      reason: string;
      roleSlug: LenderRole;
    }
  | {
      kind: "change-access";
      membershipId: string;
      reason: string;
      roleSlug: LenderRole;
    }
  | { kind: "deactivate"; membershipId: string; reason: string }
  | {
      idempotencyKey: string;
      kind: "transfer-principal";
      reason: string;
      sourceMembershipId: string;
      targetMembershipId: string;
    };

export interface WorkosReconciliationPresentation {
  description: string;
  status: "error" | "reconciled" | "waiting";
  title: string;
}

const operationCopy: Record<
  LenderOrganizationOperation,
  { description: string; title: string }
> = {
  invite: {
    description:
      "Stage a WorkOS organization invitation and review its access effects.",
    title: "Invite organization member",
  },
  "change-access": {
    description:
      "Compare current and proposed WorkOS roles before changing access.",
    title: "Change member access",
  },
  deactivate: {
    description:
      "Review access, retained history, and downstream effects before deactivation.",
    title: "Deactivate organization member",
  },
  "transfer-principal": {
    description:
      "Select the replacement and review the protected transfer of control.",
    title: "Transfer Principal Broker control",
  },
};

export function LenderOrganizationOperationDialog({
  directoryUsers,
  member,
  onExecute,
  onOpenChange,
  operation,
  organizationName,
  pending,
  reconciliation,
}: {
  directoryUsers: DirectoryUser[];
  member: DirectoryUser | null;
  onExecute: (request: LenderOrganizationOperationRequest) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  operation: LenderOrganizationOperation;
  organizationName: string;
  pending: boolean;
  reconciliation?: WorkosReconciliationPresentation;
}) {
  const operationId = useId();
  const membership = member?.memberships[0];
  const currentRoleSlugs = membership?.roleSlugs ?? [];
  const [stage, setStage] = useState<"draft" | "review">("draft");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<LenderRole>("lender");
  const [proposedRole, setProposedRole] = useState<LenderRole>(() =>
    isLenderRole(currentRoleSlugs[0]) ? currentRoleSlugs[0] : "lender"
  );
  const [reason, setReason] = useState("");
  const [historyAcknowledged, setHistoryAcknowledged] = useState(false);
  const [targetMembershipId, setTargetMembershipId] = useState("");
  const protectedPrincipal = currentRoleSlugs.includes("principle-broker");
  const removesPrincipal = operation === "change-access" && protectedPrincipal;
  const protectedNormalOperation =
    (operation === "deactivate" && protectedPrincipal) || removesPrincipal;
  const eligibleTransferTargets = directoryUsers.filter((entry) => {
    const target = entry.memberships[0];
    return (
      target?.status === "active" &&
      target.workosMembershipId !== membership?.workosMembershipId &&
      (target.roleSlugs ?? []).some((role) =>
        ["admin", "broker", "broker-staff"].includes(role)
      )
    );
  });
  const canReview = canReviewOperation({
    email: inviteEmail,
    historyAcknowledged,
    membershipId: membership?.workosMembershipId,
    operation,
    reason,
    targetMembershipId,
  });

  const execute = async () => {
    if (operation === "invite") {
      await onExecute({
        email: inviteEmail.trim(),
        kind: operation,
        reason: reason.trim(),
        roleSlug: inviteRole,
      });
      return;
    }
    if (!membership) {
      throw new Error("Membership projection is unavailable");
    }
    if (operation === "change-access") {
      await onExecute({
        kind: operation,
        membershipId: membership.workosMembershipId,
        reason: reason.trim(),
        roleSlug: proposedRole,
      });
      return;
    }
    if (operation === "deactivate") {
      await onExecute({
        kind: operation,
        membershipId: membership.workosMembershipId,
        reason: reason.trim(),
      });
      return;
    }
    await onExecute({
      idempotencyKey: `${operationId}-${membership.workosMembershipId}-${targetMembershipId}`,
      kind: operation,
      reason: reason.trim(),
      sourceMembershipId: membership.workosMembershipId,
      targetMembershipId,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="secondary">Canonical WorkOS command</Badge>
            <Badge variant="outline">
              {stage === "draft" ? "1 · Draft" : "2 · Review"}
            </Badge>
          </div>
          <DialogTitle>{operationCopy[operation].title}</DialogTitle>
          <DialogDescription>
            {operationCopy[operation].description}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          {reconciliation ? (
            <ReconciliationStatus presentation={reconciliation} />
          ) : stage === "draft" ? (
            <OperationDraft
              eligibleTransferTargets={eligibleTransferTargets}
              historyAcknowledged={historyAcknowledged}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              onHistoryAcknowledgedChange={setHistoryAcknowledged}
              onInviteEmailChange={setInviteEmail}
              onInviteRoleChange={setInviteRole}
              onProposedRoleChange={setProposedRole}
              onReasonChange={setReason}
              onTargetMembershipChange={setTargetMembershipId}
              operation={operation}
              proposedRole={proposedRole}
              reason={reason}
              targetMembershipId={targetMembershipId}
            />
          ) : (
            <OperationReview
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              operation={operation}
              organizationName={organizationName}
              proposedRole={proposedRole}
              protectedOperation={protectedNormalOperation}
              reason={reason}
              target={eligibleTransferTargets.find(
                (entry) =>
                  entry.memberships[0]?.workosMembershipId ===
                  targetMembershipId
              )}
            />
          )}
          <Frame>
            <FramePanel className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Operational effects</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-5">
                    The command waits for WorkOS reconciliation. Current access,
                    future assignment eligibility, queue and recipient inputs
                    update from the canonical projection. Review policy and
                    historical decisions do not change.
                  </p>
                </div>
              </div>
              {protectedNormalOperation ? (
                <p className="flex items-center gap-2 text-amber-700 text-xs dark:text-amber-300">
                  <LockKeyhole className="size-3.5" /> Transfer Principal Broker
                  control before this command.
                </p>
              ) : null}
            </FramePanel>
          </Frame>
        </DialogPanel>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            {reconciliation ? "Close status" : "Cancel"}
          </Button>
          {reconciliation ? null : stage === "review" ? (
            <>
              <Button
                disabled={pending}
                onClick={() => setStage("draft")}
                variant="outline"
              >
                Back to edit
              </Button>
              <Button
                disabled={pending || protectedNormalOperation}
                onClick={execute}
              >
                {pending ? "Submitting…" : "Confirm command"}
              </Button>
            </>
          ) : (
            <Button disabled={!canReview} onClick={() => setStage("review")}>
              Review draft <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ReconciliationStatus({
  presentation,
}: {
  presentation: WorkosReconciliationPresentation;
}) {
  const Icon =
    presentation.status === "reconciled"
      ? CircleCheck
      : presentation.status === "error"
        ? TriangleAlert
        : Clock3;
  return (
    <Alert
      aria-live={presentation.status === "error" ? "assertive" : "polite"}
      role={presentation.status === "error" ? "alert" : "status"}
      variant={
        presentation.status === "reconciled"
          ? "success"
          : presentation.status === "error"
            ? "error"
            : "info"
      }
    >
      <Icon aria-hidden />
      <AlertTitle>{presentation.title}</AlertTitle>
      <AlertDescription>{presentation.description}</AlertDescription>
    </Alert>
  );
}

function OperationDraft({
  eligibleTransferTargets,
  historyAcknowledged,
  inviteEmail,
  inviteRole,
  member,
  onHistoryAcknowledgedChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onProposedRoleChange,
  onReasonChange,
  onTargetMembershipChange,
  operation,
  proposedRole,
  reason,
  targetMembershipId,
}: {
  eligibleTransferTargets: DirectoryUser[];
  historyAcknowledged: boolean;
  inviteEmail: string;
  inviteRole: LenderRole;
  member: DirectoryUser | null;
  onHistoryAcknowledgedChange: (checked: boolean) => void;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: LenderRole) => void;
  onProposedRoleChange: (role: LenderRole) => void;
  onReasonChange: (value: string) => void;
  onTargetMembershipChange: (value: string) => void;
  operation: LenderOrganizationOperation;
  proposedRole: LenderRole;
  reason: string;
  targetMembershipId: string;
}) {
  if (operation === "invite") {
    return (
      <div className="space-y-4">
        <Field htmlFor="invite-email" label="Member email">
          <Input
            autoFocus
            id="invite-email"
            onChange={(event) => onInviteEmailChange(event.target.value)}
            placeholder="broker@example.com"
            type="email"
            value={inviteEmail}
          />
        </Field>
        <Field htmlFor="invite-role" label="Starting access">
          <NativeSelect
            className="w-full"
            id="invite-role"
            onChange={(event) =>
              onInviteRoleChange(event.target.value as LenderRole)
            }
            value={inviteRole}
          >
            {roleOptions.map((role) => (
              <NativeSelectOption key={role.slug} value={role.slug}>
                {role.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field htmlFor="invite-reason" label="Operational reason">
          <Textarea
            id="invite-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Provide at least 10 characters for the audit record"
            value={reason}
          />
        </Field>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <MemberHeader member={member} />
      {operation === "change-access" ? (
        <Field htmlFor="proposed-lender-role" label="Proposed lender role">
          <NativeSelect
            className="w-full"
            id="proposed-lender-role"
            onChange={(event) =>
              onProposedRoleChange(event.target.value as LenderRole)
            }
            value={proposedRole}
          >
            {roleOptions.map((role) => (
              <NativeSelectOption key={role.slug} value={role.slug}>
                {role.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {operation === "transfer-principal" ? (
        <Field
          htmlFor="replacement-principal-broker"
          label="Replacement Principal Broker"
        >
          <NativeSelect
            className="w-full"
            id="replacement-principal-broker"
            onChange={(event) => onTargetMembershipChange(event.target.value)}
            value={targetMembershipId}
          >
            <NativeSelectOption value="">
              Select an active eligible member
            </NativeSelectOption>
            {eligibleTransferTargets.map((entry) => (
              <NativeSelectOption
                key={entry.memberships[0]?.workosMembershipId}
                value={entry.memberships[0]?.workosMembershipId ?? ""}
              >
                {entry.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {operation === "change-access" ||
      operation === "deactivate" ||
      operation === "transfer-principal" ? (
        <Field
          htmlFor="organization-operation-reason"
          label="Operational reason"
        >
          <Textarea
            autoFocus
            id="organization-operation-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Provide at least 10 characters for the audit record"
            value={reason}
          />
        </Field>
      ) : null}
      {operation === "deactivate" ? (
        <label
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
          htmlFor="preserve-history"
        >
          <Checkbox
            checked={historyAcknowledged}
            id="preserve-history"
            onCheckedChange={onHistoryAcknowledgedChange}
          />
          <span>
            <span className="block font-medium text-sm">
              Preserve membership and decision history
            </span>
            <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
              I understand that deactivation ends future access but does not
              erase history.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function OperationReview({
  inviteEmail,
  inviteRole,
  member,
  operation,
  organizationName,
  proposedRole,
  protectedOperation,
  reason,
  target,
}: {
  inviteEmail: string;
  inviteRole: string;
  member: DirectoryUser | null;
  operation: LenderOrganizationOperation;
  organizationName: string;
  proposedRole: LenderRole;
  protectedOperation: boolean;
  reason: string;
  target?: DirectoryUser;
}) {
  return (
    <Frame>
      <FramePanel className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-sm">Review operation</p>
          <Badge variant={protectedOperation ? "warning" : "secondary"}>
            {protectedOperation ? "Transfer required" : "Ready to submit"}
          </Badge>
        </div>
        <ReviewFact label="Organization" value={organizationName} />
        <ReviewFact
          label={operation === "invite" ? "Invitee" : "Member"}
          value={
            operation === "invite"
              ? inviteEmail
              : (member?.displayName ?? "Unavailable")
          }
        />
        {operation === "invite" ? (
          <ReviewFact label="Starting access" value={inviteRole} />
        ) : null}
        {operation === "change-access" ? (
          <ReviewFact label="Proposed access" value={proposedRole} />
        ) : null}
        {operation === "transfer-principal" ? (
          <ReviewFact
            label="Replacement"
            value={target?.displayName ?? "Unavailable"}
          />
        ) : null}
        {reason ? <ReviewFact label="Reason" value={reason.trim()} /> : null}
      </FramePanel>
    </Frame>
  );
}

function MemberHeader({ member }: { member: DirectoryUser | null }) {
  return (
    <div className="flex items-center gap-3 border-b pb-4">
      <Avatar>
        <AvatarFallback>{member?.initials ?? "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {member?.displayName ?? "Select a member"}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {member?.user.email ?? "Email unavailable"}
        </p>
      </div>
    </div>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block font-medium text-sm" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t pt-3 text-sm first:border-t-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function isLenderRole(value: string | undefined): value is LenderRole {
  return roleOptions.some((role) => role.slug === value);
}

function canReviewOperation({
  email,
  historyAcknowledged,
  membershipId,
  operation,
  reason,
  targetMembershipId,
}: {
  email: string;
  historyAcknowledged: boolean;
  membershipId: string | undefined;
  operation: LenderOrganizationOperation;
  reason: string;
  targetMembershipId: string;
}) {
  const hasReason = reason.trim().length >= 10;
  if (operation === "invite") {
    return emailPattern.test(email.trim()) && hasReason;
  }
  if (!(membershipId && hasReason)) {
    return false;
  }
  if (operation === "deactivate") {
    return historyAcknowledged;
  }
  if (operation === "transfer-principal") {
    return Boolean(targetMembershipId);
  }
  return true;
}
