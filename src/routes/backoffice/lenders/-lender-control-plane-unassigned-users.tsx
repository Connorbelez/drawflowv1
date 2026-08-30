import type { FunctionReturnType } from "convex/server";
import { Check, RefreshCw } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import type { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatRole, initials } from "./-lender-control-plane-support.tsx";

type OrganizationPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizations
>;
type OrganizationRow = OrganizationPage["page"][number];
type UnassignedResult = FunctionReturnType<
  typeof api.lenderOrganizations.listUnassignedLenderUsers
>;
type UnassignedUser = UnassignedResult["users"][number];

export interface LenderControlPlaneUnassignedUsersProps {
  assignTargets: Record<string, string>;
  controlPlane:
    | {
        organizations: OrganizationRow[];
      }
    | undefined;
  onAssign: (
    user: UnassignedUser,
    lenderOrganizationId: Id<"lenderOrganizations">
  ) => void;
  onAssignTargetChange: (workosUserId: string, value: string) => void;
  onReconcile: () => void;
  unassigned: UnassignedResult | undefined;
}

export function LenderControlPlaneUnassignedUsers({
  assignTargets,
  controlPlane,
  onAssign,
  onAssignTargetChange,
  onReconcile,
  unassigned,
}: LenderControlPlaneUnassignedUsersProps) {
  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
              WorkOS projection queue
            </p>
            <h2 className="mt-2 font-heading font-semibold text-xl">
              Unassigned lender users
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              Active users in the shared identity organization with no app-level
              assignment.
            </p>
          </div>
          <Button onClick={onReconcile} size="sm" variant="outline">
            <RefreshCw />
            Reconcile pending
          </Button>
        </div>
        <Separator />
        {unassigned === undefined ? (
          <div className="p-6 text-muted-foreground text-sm">
            Loading shared identity users…
          </div>
        ) : unassigned.users.length === 0 ? (
          <div className="flex items-center gap-3 p-6 text-muted-foreground text-sm">
            <Check className="size-4 text-emerald-600" />
            Every eligible lender user is assigned or waiting on reconciliation.
          </div>
        ) : (
          <div className="divide-y">
            {unassigned.users.map((user) => (
              <div
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6"
                key={user.userId}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                    {initials(user.name, user.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{user.name}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {user.email}
                    </p>
                  </div>
                  <div className="hidden gap-1 lg:flex">
                    {user.roleSlugs.map((role) => (
                      <Badge key={role} variant="secondary">
                        {formatRole(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 md:w-[22rem] md:justify-end">
                  <Select
                    onValueChange={(value) =>
                      onAssignTargetChange(user.workosUserId, value ?? "")
                    }
                    value={assignTargets[user.workosUserId] ?? ""}
                  >
                    <SelectTrigger
                      aria-label={`Assign ${user.email}`}
                      className="min-w-0 flex-1"
                    >
                      <SelectValue placeholder="Choose lender organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {(controlPlane?.organizations ?? [])
                        .filter(
                          (organization) => organization.status === "active"
                        )
                        .map((organization) => (
                          <SelectItem
                            key={organization.id}
                            value={organization.id}
                          >
                            {organization.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!assignTargets[user.workosUserId]}
                    onClick={() =>
                      onAssign(
                        user,
                        assignTargets[
                          user.workosUserId
                        ] as Id<"lenderOrganizations">
                      )
                    }
                    size="sm"
                  >
                    Assign
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}
