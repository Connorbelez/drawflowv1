import type { FunctionReturnType } from "convex/server";
import { ArrowRight, CircleCheck, Clock3, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DirectoryUser } from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type { WorkosReconciliationPresentation } from "#/features/lender-organization-management/LenderOrganizationOperationDialog.tsx";
import type { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const WHITESPACE_PATTERN = /\s+/;

type MemberPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;
type MemberEntry = MemberPage["page"][number];
export type ControlPlaneMember = Extract<
  MemberEntry,
  { kind: "member" }
>["member"];
type UnassignedResult = FunctionReturnType<
  typeof api.lenderOrganizations.listUnassignedLenderUsers
>;
export type UnassignedUser = UnassignedResult["users"][number];
export type Permissions = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizations
>["page"][number]["permissions"];

export interface ExistingUserAssignmentDraft {
  lenderOrganizationId: Id<"lenderOrganizations">;
  organizationName: string;
  user: UnassignedUser;
}

export interface WorkosReconciliationState {
  assignmentId: Id<"lenderOrganizationAssignments">;
  errorMessage?: string;
  expectedRoleSlug?: "lender" | "lender-admin" | "lender-staff";
  kind: "change-access" | "deactivate";
  lenderOrganizationId: Id<"lenderOrganizations">;
  memberName: string;
  membershipId: string;
  reason: string;
  status: "error" | "finalizing" | "reconciled" | "waiting";
}

export function ExistingLenderUserAssignmentDialog({
  draft,
  onOpenChange,
  onSubmit,
  pending,
}: {
  draft: ExistingUserAssignmentDraft;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  pending: boolean;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<"draft" | "review">("draft");

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign existing lender user</DialogTitle>
          <DialogDescription>
            Review the eligible WorkOS user, application organization, and audit
            reason before creating the assignment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Frame>
            <FramePanel className="divide-y p-0">
              <AssignmentFact label="User" value={draft.user.name} />
              <AssignmentFact label="Email" value={draft.user.email} />
              <AssignmentFact
                label="Lender organization"
                value={draft.organizationName}
              />
            </FramePanel>
          </Frame>
          {stage === "draft" ? (
            <div className="space-y-2">
              <Label htmlFor={reasonId}>Assignment audit reason</Label>
              <Textarea
                aria-describedby={`${reasonId}-hint`}
                id={reasonId}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this user should join the Lender Organization"
                value={reason}
              />
              <p
                className="text-muted-foreground text-xs leading-5"
                id={`${reasonId}-hint`}
              >
                Required for the assignment audit record.
              </p>
            </div>
          ) : (
            <div aria-live="polite" className="space-y-2">
              <p className="font-medium text-sm">Ready to assign</p>
              <p className="break-words text-muted-foreground text-sm leading-6">
                {reason.trim()}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          {stage === "review" ? (
            <>
              <Button
                disabled={pending}
                onClick={() => setStage("draft")}
                variant="outline"
              >
                Back to edit
              </Button>
              <Button disabled={pending} onClick={() => onSubmit(reason)}>
                {pending ? "Assigning…" : "Confirm assignment"}
              </Button>
            </>
          ) : (
            <Button
              disabled={!reason.trim()}
              onClick={() => setStage("review")}
            >
              Review assignment <ArrowRight aria-hidden />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <p className="font-medium text-xs">{label}</p>
      <p className="break-words text-sm sm:text-end">{value}</p>
    </div>
  );
}

export function WorkosReconciliationNotice({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: WorkosReconciliationState;
}) {
  const presentation = reconciliationPresentation(state);
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
      {onRetry ? (
        <AlertAction>
          <Button onClick={onRetry} size="sm" variant="outline">
            Retry finalization
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

export function reconciliationPresentation(
  state: WorkosReconciliationState
): WorkosReconciliationPresentation {
  if (state.status === "reconciled") {
    return {
      description:
        state.kind === "deactivate"
          ? "WorkOS access and the app assignment now reflect the deactivation."
          : "The canonical WorkOS projection now reflects the requested lender role.",
      status: "reconciled",
      title: `${state.memberName} reconciled`,
    };
  }
  if (state.status === "error") {
    return {
      description:
        state.errorMessage ??
        "The command did not reach a valid reconciliation state. Review the current projection before retrying.",
      status: "error",
      title: "Reconciliation needs attention",
    };
  }
  return {
    description:
      state.status === "finalizing"
        ? "WorkOS has reconciled. DrawFlow is now finalizing the app-owned lender assignment."
        : "WorkOS accepted the command. Current access remains unchanged here until the webhook projection confirms it.",
    status: "waiting",
    title:
      state.status === "finalizing"
        ? "Finalizing lender assignment"
        : "Waiting for WorkOS reconciliation",
  };
}

export function requireWaitingForWebhook(result: {
  status: string;
  sync: string;
}) {
  if (result.status !== "accepted" || result.sync !== "waiting-for-webhook") {
    throw new Error("WorkOS returned an unexpected command state");
  }
}

export function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-5 sm:border-r last:sm:border-r-0">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium text-lg tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function permissionEntries(permissions: Permissions) {
  return [
    ["proposalReview", "Proposal review", permissions.proposalReview],
    [
      "milestoneDecisions",
      "Milestone decisions",
      permissions.milestoneDecisions,
    ],
    ["drawDecisions", "Draw decisions", permissions.drawDecisions],
    ["siteVisitReview", "Site visit review", permissions.siteVisitReview],
  ] as const;
}

export function formatRole(role: string) {
  return role
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatAssignableUserInputValue(user: UnassignedUser) {
  return `${user.name} · ${user.email}`;
}

export function filterAssignableLenderUsers(
  users: UnassignedUser[],
  query: string
) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(WHITESPACE_PATTERN)
    .filter(Boolean);
  if (terms.length === 0) {
    return users.slice(0, 50);
  }
  return users
    .filter((user) => {
      const haystack =
        `${user.name} ${user.email} ${user.roleSlugs.join(" ")}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 50);
}

export function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(WHITESPACE_PATTERN).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : value.slice(0, 2)
  ).toUpperCase();
}

export function buildLenderOrganizationDirectoryUsers(
  members: ControlPlaneMember[],
  sharedWorkosOrganizationId: string | undefined
): DirectoryUser[] {
  if (!sharedWorkosOrganizationId) {
    return [];
  }
  return members.map((member) => ({
    displayName: member.name,
    initials: initials(member.name, member.email),
    memberships: member.membershipId
      ? [
          {
            roleSlug: member.roleSlugs[0],
            roleSlugs: member.roleSlugs,
            status: member.membershipStatus,
            workosMembershipId: member.membershipId,
            workosOrganizationId: sharedWorkosOrganizationId,
            workosUserId: member.workosUserId,
          },
        ]
      : [],
    user: {
      email: member.email,
      name: member.name,
      status: "active",
      workosUserId: member.workosUserId,
    },
  }));
}

export function findMemberByMembershipId(
  members: ControlPlaneMember[],
  membershipId: string
) {
  return members.find((member) => member.membershipId === membershipId) ?? null;
}
