import { ArrowRight, LockKeyhole } from "lucide-react";
import { useState } from "react";

import type { DirectoryUser } from "./backoffice/-user-management-types";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Frame, FramePanel } from "../components/ui/frame";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Textarea } from "../components/ui/textarea";
import {
  organization,
  type PrototypeOperation,
  type RoleDefinition,
  roleDefinitions,
} from "./-lender-organization-management-contracts";
import {
  BoundaryLine,
  CheckLine,
} from "./-lender-organization-management-shared";

const operationCopy: Record<
  PrototypeOperation,
  { description: string; title: string }
> = {
  invite: {
    description:
      "Stage a WorkOS organization invitation and review its access and routing effects.",
    title: "Invite organization member",
  },
  "change-access": {
    description:
      "Compare current and proposed WorkOS roles before an access change.",
    title: "Change member access",
  },
  deactivate: {
    description:
      "Review access, history, and review-workflow effects before deactivation.",
    title: "Deactivate organization member",
  },
};

const prototypeEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PrototypeOperationDialog({
  member,
  onOpenChange,
  operation,
}: {
  member: DirectoryUser | undefined;
  onOpenChange: (open: boolean) => void;
  operation: PrototypeOperation;
}) {
  const currentRoleSlugs = member?.memberships[0]?.roleSlugs ?? [];
  const [stage, setStage] = useState<"draft" | "review">("draft");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"broker" | "broker-staff">(
    "broker"
  );
  const [proposedRoles, setProposedRoles] =
    useState<readonly string[]>(currentRoleSlugs);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [historyAcknowledged, setHistoryAcknowledged] = useState(false);
  const isProtectedPrincipal = currentRoleSlugs.includes("principle-broker");
  const removesPrincipalBroker =
    isProtectedPrincipal && !proposedRoles.includes("principle-broker");
  const canReview =
    operation === "invite"
      ? prototypeEmailPattern.test(inviteEmail.trim())
      : operation === "change-access"
        ? proposedRoles.length > 0
        : deactivationReason.trim().length >= 10 && historyAcknowledged;

  const toggleRole = (roleSlug: RoleDefinition["slug"], checked: boolean) => {
    setProposedRoles((roles) =>
      checked
        ? Array.from(new Set([...roles, roleSlug]))
        : roles.filter((role) => role !== roleSlug)
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="warning">Local prototype draft</Badge>
            <Badge variant="outline">
              {stage === "draft" ? "1 · Draft" : "2 · Review"}
            </Badge>
          </div>
          <DialogTitle>{operationCopy[operation].title}</DialogTitle>
          <DialogDescription>
            {operationCopy[operation].description} Nothing in this workflow is
            saved or sent.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          {stage === "draft" ? (
            <OperationDraftFields
              deactivationReason={deactivationReason}
              historyAcknowledged={historyAcknowledged}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              onDeactivationReasonChange={setDeactivationReason}
              onHistoryAcknowledgedChange={setHistoryAcknowledged}
              onInviteEmailChange={setInviteEmail}
              onInviteRoleChange={setInviteRole}
              onToggleRole={toggleRole}
              operation={operation}
              proposedRoles={proposedRoles}
            />
          ) : (
            <OperationReview
              deactivationReason={deactivationReason}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              operation={operation}
              proposedRoles={proposedRoles}
              protectedOperation={
                operation === "deactivate"
                  ? isProtectedPrincipal
                  : removesPrincipalBroker
              }
            />
          )}

          <OperationImpactPreview
            operation={operation}
            protectedOperation={
              operation === "deactivate"
                ? isProtectedPrincipal
                : removesPrincipalBroker
            }
          />

          <Frame>
            <FramePanel className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">Current local draft</p>
                <Badge variant="secondary">In memory</Badge>
              </div>
              <OperationStateSummary
                deactivationReason={deactivationReason}
                inviteEmail={inviteEmail}
                inviteRole={inviteRole}
                member={member}
                operation={operation}
                proposedRoles={proposedRoles}
              />
            </FramePanel>
          </Frame>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Discard draft
          </Button>
          {stage === "review" ? (
            <>
              <Button onClick={() => setStage("draft")} variant="outline">
                Back to edit
              </Button>
              <Button disabled>
                Execution unavailable in prototype
                <LockKeyhole />
              </Button>
            </>
          ) : (
            <Button disabled={!canReview} onClick={() => setStage("review")}>
              Review draft
              <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function OperationDraftFields({
  deactivationReason,
  historyAcknowledged,
  inviteEmail,
  inviteRole,
  member,
  onDeactivationReasonChange,
  onHistoryAcknowledgedChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onToggleRole,
  operation,
  proposedRoles,
}: {
  deactivationReason: string;
  historyAcknowledged: boolean;
  inviteEmail: string;
  inviteRole: "broker" | "broker-staff";
  member: DirectoryUser | undefined;
  onDeactivationReasonChange: (reason: string) => void;
  onHistoryAcknowledgedChange: (checked: boolean) => void;
  onInviteEmailChange: (email: string) => void;
  onInviteRoleChange: (role: "broker" | "broker-staff") => void;
  onToggleRole: (role: RoleDefinition["slug"], checked: boolean) => void;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
}) {
  if (operation === "invite") {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="invite-email">
            Member email
          </label>
          <Input
            autoComplete="off"
            id="invite-email"
            onChange={(event) => onInviteEmailChange(event.target.value)}
            placeholder="broker@example.com"
            type="email"
            value={inviteEmail}
          />
          <p className="text-muted-foreground text-xs">
            A valid email is required before the draft can be reviewed.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="invite-role">
            Starting access
          </label>
          <NativeSelect
            className="w-full"
            id="invite-role"
            onChange={(event) =>
              onInviteRoleChange(
                event.target.value as "broker" | "broker-staff"
              )
            }
            value={inviteRole}
          >
            <NativeSelectOption value="broker">Broker</NativeSelectOption>
            <NativeSelectOption value="broker-staff">
              Broker Staff
            </NativeSelectOption>
          </NativeSelect>
          <p className="text-muted-foreground text-xs">
            Only verified non-owner starting roles are offered here. E1, E7
          </p>
        </div>
      </div>
    );
  }

  if (operation === "change-access") {
    return (
      <div className="space-y-4">
        <OperationMemberHeader member={member} />
        <fieldset className="space-y-2">
          <legend className="font-medium text-sm">Proposed WorkOS roles</legend>
          {roleDefinitions.map((role) => {
            const checked = proposedRoles.includes(role.slug);
            return (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-data-checked:border-primary/50 has-data-checked:bg-primary/5"
                htmlFor={`proposed-role-${role.slug}`}
                key={role.slug}
              >
                <Checkbox
                  checked={checked}
                  id={`proposed-role-${role.slug}`}
                  onCheckedChange={(nextChecked) =>
                    onToggleRole(role.slug, nextChecked)
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium text-sm">
                    {role.label}
                  </span>
                  <span className="block text-muted-foreground text-xs leading-5">
                    {role.slug} · {role.summary}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {proposedRoles.length === 0 ? (
          <p className="text-destructive text-xs">
            Select at least one verified role to review this draft.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OperationMemberHeader member={member} />
      <div className="space-y-1.5">
        <label className="font-medium text-sm" htmlFor="deactivation-reason">
          Operational reason
        </label>
        <Textarea
          id="deactivation-reason"
          onChange={(event) => onDeactivationReasonChange(event.target.value)}
          placeholder="Explain why future organization access should end"
          value={deactivationReason}
        />
        <p className="text-muted-foreground text-xs">
          Enter at least 10 characters. The reason would be part of the audit
          record in production.
        </p>
      </div>
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
            I understand that deactivation ends future access but must not erase
            the historical membership or decisions. E2, E8, E9
          </span>
        </span>
      </label>
    </div>
  );
}

function OperationMemberHeader({ member }: { member: DirectoryUser | undefined }) {
  return (
    <div className="flex items-center gap-3 border-b pb-4">
      <Avatar>
        <AvatarFallback>{member?.initials ?? "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {member?.displayName ?? "No verified member"}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {member?.user.email ?? "Email unavailable"}
        </p>
      </div>
    </div>
  );
}

function SheetFact({
  label,
  source,
  value,
}: {
  label: string;
  source: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <div>
        <p className="font-medium text-xs">{label}</p>
        <p className="mt-0.5 font-mono text-muted-foreground text-xs">
          {source}
        </p>
      </div>
      <p className="text-sm sm:text-right">{value}</p>
    </div>
  );
}

function OperationReview({
  deactivationReason,
  inviteEmail,
  inviteRole,
  member,
  operation,
  proposedRoles,
  protectedOperation,
}: {
  deactivationReason: string;
  inviteEmail: string;
  inviteRole: string;
  member: DirectoryUser | undefined;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
  protectedOperation: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Review operation</CardTitle>
          <Badge variant={protectedOperation ? "warning" : "secondary"}>
            {protectedOperation ? "Protected workflow" : "Draft valid"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <SheetFact
          label="Organization"
          source="E3, E4"
          value={organization.name}
        />
        <SheetFact
          label={operation === "invite" ? "Invitee" : "Member"}
          source={operation === "invite" ? "Local draft" : "E3, E4"}
          value={
            operation === "invite"
              ? inviteEmail.trim()
              : (member?.displayName ?? "Unavailable")
          }
        />
        {operation === "invite" ? (
          <SheetFact
            label="Starting access"
            source="E1, E7"
            value={inviteRole}
          />
        ) : null}
        {operation === "change-access" ? (
          <>
            <SheetFact
              label="Current access"
              source="E3, E4"
              value={member?.memberships[0]?.roleSlugs?.join(", ") ?? "None"}
            />
            <SheetFact
              label="Proposed access"
              source="Local draft"
              value={proposedRoles.join(", ")}
            />
          </>
        ) : null}
        {operation === "deactivate" ? (
          <SheetFact
            label="Reason"
            source="Local draft"
            value={deactivationReason.trim()}
          />
        ) : null}
        <SheetFact
          label="Execution"
          source="Prototype boundary"
          value={
            protectedOperation
              ? "Blocked · transfer-of-control required"
              : "Unavailable · no external writes"
          }
        />
      </CardContent>
    </Card>
  );
}

function OperationImpactPreview({
  operation,
  protectedOperation,
}: {
  operation: PrototypeOperation;
  protectedOperation: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational impact preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CheckLine text="Use the canonical WorkOS organization and membership action boundary" />
        {operation === "invite" ? (
          <CheckLine text="Await WorkOS webhook sync before showing an active membership" />
        ) : (
          <CheckLine text="Re-evaluate lender review quorum context, recipient routing, and work queues" />
        )}
        <CheckLine text="Preserve or append auditable actor, role, prior state, new state, time, and reason context" />
        {protectedOperation ? (
          <BoundaryLine text="Principal Broker control must transfer before this operation can execute" />
        ) : null}
        <BoundaryLine text="Do not change Back Office pre-closing review requirements from this surface" />
      </CardContent>
    </Card>
  );
}

function OperationStateSummary({
  deactivationReason,
  inviteEmail,
  inviteRole,
  member,
  operation,
  proposedRoles,
}: {
  deactivationReason: string;
  inviteEmail: string;
  inviteRole: string;
  member: DirectoryUser | undefined;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
}) {
  if (operation === "invite") {
    return (
      <p className="break-words font-mono text-muted-foreground text-xs leading-5">
        organization={organization.name} · email={inviteEmail || "empty"} ·
        role={inviteRole} · delivery=not sent
      </p>
    );
  }
  if (operation === "change-access") {
    return (
      <p className="break-words font-mono text-muted-foreground text-xs leading-5">
        member={member?.user.email ?? "unavailable"} · proposedRoles=
        {proposedRoles.length > 0 ? proposedRoles.join(",") : "empty"} ·
        assignment=not applied
      </p>
    );
  }
  return (
    <p className="break-words font-mono text-muted-foreground text-xs leading-5">
      member={member?.user.email ?? "unavailable"} · reason=
      {deactivationReason || "empty"} · status=unchanged
    </p>
  );
}
