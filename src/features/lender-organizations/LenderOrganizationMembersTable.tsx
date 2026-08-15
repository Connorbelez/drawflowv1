import { UserRoundMinus } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

type MembersResult = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;
export type LenderOrganizationMember = MembersResult["members"][number];
export type LenderOrganizationPendingInvitation =
  MembersResult["pendingInvitations"][number];
export const LENDER_ROLE_OPTIONS = [
  "lender",
  "lender-admin",
  "lender-staff",
] as const;
export type LenderRoleOption = (typeof LENDER_ROLE_OPTIONS)[number];

type CommonProps = {
  members: MembersResult["members"] | undefined;
  pendingInvitations?: MembersResult["pendingInvitations"];
};

export function LenderOrganizationMembersTable({
  members,
  mode = "table",
  onDeactivate,
  onRoleChange,
  pendingInvitations = [],
}: CommonProps & {
  mode?: "management" | "table";
  onDeactivate?: (member: LenderOrganizationMember) => void;
  onRoleChange?: (
    member: LenderOrganizationMember,
    roleSlug: LenderRoleOption
  ) => void;
}) {
  if (members === undefined) {
    return (
      <p aria-live="polite" className="text-muted-foreground text-sm">
        Loading members…
      </p>
    );
  }

  if (mode === "table") {
    if (members.length === 0) {
      return <MembersEmptyState />;
    }
    return (
      <Table aria-label="Active lender organization members">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Lender role</TableHead>
            <TableHead>Assignment</TableHead>
            <TableHead>Final decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.assignmentId}>
              <TableCell className="font-medium">{member.name}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {formatRole(member.roleSlugs[0] ?? "lender")}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">Active</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={member.canMakeFinalDecision ? "default" : "outline"}>
                  {member.canMakeFinalDecision ? "Yes" : "No"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-2">
      {members.length === 0 ? (
        <MembersEmptyState />
      ) : (
        members.map((member) => (
          <LenderOrganizationMemberRow
            key={member.assignmentId}
            member={member}
            onDeactivate={onDeactivate}
            onRoleChange={onRoleChange}
          />
        ))
      )}
      {pendingInvitations.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
            Pending invitations
          </p>
          {pendingInvitations.map((invitation) => (
            <div
              className="flex items-center justify-between border border-dashed px-3 py-3 text-sm"
              key={invitation.assignmentId}
            >
              <span>{invitation.email}</span>
              <Badge variant="outline">Waiting for sync</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LenderOrganizationMemberRow({
  member,
  onDeactivate,
  onRoleChange,
}: {
  member: LenderOrganizationMember;
  onDeactivate?: (member: LenderOrganizationMember) => void;
  onRoleChange?: (
    member: LenderOrganizationMember,
    roleSlug: LenderRoleOption
  ) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
          {initials(member.name, member.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{member.name}</p>
          <p className="truncate text-muted-foreground text-xs">{member.email}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRoleChange ? (
          <Select
            onValueChange={(value) =>
              onRoleChange(member, value as LenderRoleOption)
            }
            value={member.roleSlugs[0] ?? "lender"}
          >
            <SelectTrigger
              aria-label={`Role for ${member.name}`}
              className="w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LENDER_ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {formatRole(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">
            {formatRole(member.roleSlugs[0] ?? "lender")}
          </Badge>
        )}
        {onDeactivate ? (
          <Button
            aria-label={`Deactivate ${member.name}`}
            onClick={() => onDeactivate(member)}
            size="icon"
            variant="ghost"
          >
            <UserRoundMinus />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MembersEmptyState() {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyTitle>No active members</EmptyTitle>
        <EmptyDescription>
          No active users are assigned to this lender organization.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function formatRole(role: string) {
  return role
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : value.slice(0, 2)
  ).toUpperCase();
}
