"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Save, Trash2, UserPlus } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type BuilderStaffPermissionResource =
  | "milestone"
  | "submilestone"
  | "draw"
  | "evidence"
  | "contractor"
  | "material"
  | "capitalEvent"
  | "reminder";

type PermissionAction = "create" | "view" | "update" | "delete";
type PermissionField = "canCreate" | "canView" | "canUpdate" | "canDelete";

type StaffPermissionGrant = {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canView: boolean;
  resourceType: BuilderStaffPermissionResource;
};

type StaffMember = {
  builderAccountLinkId: string;
  email?: string;
  mode: "full" | "limited";
  name?: string;
  permissions: StaffPermissionGrant[];
  role: "owner" | "staff";
  status: string;
  workosUserId: string;
};

type StaffDirectory = {
  actions: PermissionAction[];
  canManage: boolean;
  resources: BuilderStaffPermissionResource[];
  scope: "proposal" | "activeBuild";
  staff: StaffMember[];
};

type BuilderStaffPermissionsPanelProps =
  | {
      proposalId: Id<"buildProposals">;
      scope: "proposal";
      workosOrganizationId: string;
    }
  | {
      buildId: Id<"activeBuilds">;
      scope: "activeBuild";
      workosOrganizationId: string;
    };

const ACTIONS: Array<{
  field: PermissionField;
  label: string;
  value: PermissionAction;
}> = [
  { field: "canView", label: "View", value: "view" },
  { field: "canCreate", label: "Create", value: "create" },
  { field: "canUpdate", label: "Update", value: "update" },
  { field: "canDelete", label: "Delete", value: "delete" },
];

const RESOURCE_LABELS: Record<BuilderStaffPermissionResource, string> = {
  capitalEvent: "Capital Event",
  contractor: "Contractor",
  draw: "Draw",
  evidence: "Evidence",
  material: "Material",
  milestone: "Milestone",
  reminder: "Reminder",
  submilestone: "Sub-milestone",
};

export function BuilderStaffPermissionsPanel(
  props: BuilderStaffPermissionsPanelProps,
) {
  const [selectedWorkosUserId, setSelectedWorkosUserId] = useState<
    string | null
  >(null);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<
    Record<string, StaffPermissionGrant[]>
  >({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const directory = useQuery(
    props.scope === "proposal"
      ? api.production_proposals.listProposalBuilderStaffPermissions
      : api.production_proposals.listActiveBuildBuilderStaffPermissions,
    props.scope === "proposal"
      ? {
          proposalId: props.proposalId,
          workosOrganizationId: props.workosOrganizationId,
        }
      : {
          buildId: props.buildId,
          workosOrganizationId: props.workosOrganizationId,
        },
  ) as StaffDirectory | undefined;
  const saveProposalStaff = useMutation(
    api.production_proposals.saveProposalBuilderStaffPermissions,
  );
  const saveActiveBuildStaff = useMutation(
    api.production_proposals.saveActiveBuildBuilderStaffPermissions,
  );
  const provisionProposalStaff = useAction(
    api.production_proposals.provisionProposalBuilderStaffPermissions,
  );
  const provisionActiveBuildStaff = useAction(
    api.production_proposals.provisionActiveBuildBuilderStaffPermissions,
  );
  const removeProposalStaff = useMutation(
    api.production_proposals.removeProposalBuilderStaffMember,
  );
  const removeActiveBuildStaff = useMutation(
    api.production_proposals.removeActiveBuildBuilderStaffMember,
  );

  useEffect(() => {
    if (!directory) {
      return;
    }
    setDraftPermissions((current) => {
      const next = { ...current };
      for (const member of directory.staff) {
        next[member.workosUserId] = clonePermissions(member.permissions);
      }
      return next;
    });
    setSelectedWorkosUserId((current) => {
      if (current && directory.staff.some((member) => member.workosUserId === current)) {
        return current;
      }
      return (
        directory.staff.find((member) => member.role === "staff")
          ?.workosUserId ??
        directory.staff[0]?.workosUserId ??
        null
      );
    });
  }, [directory]);

  const selectedMember = useMemo(
    () =>
      directory?.staff.find(
        (member) => member.workosUserId === selectedWorkosUserId,
      ) ?? null,
    [directory, selectedWorkosUserId],
  );
  const selectedPermissions =
    selectedMember && draftPermissions[selectedMember.workosUserId]
      ? draftPermissions[selectedMember.workosUserId]
      : [];
  const resources = directory?.resources ?? Object.keys(RESOURCE_LABELS);

  if (!directory) {
    return (
      <Frame>
        <FramePanel className="grid min-h-48 place-items-center p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading builder staff...
          </div>
        </FramePanel>
      </Frame>
    );
  }

  const saveStaff = async (input: {
    permissions: StaffPermissionGrant[];
    staffEmail?: string;
    staffWorkosUserId?: string;
  }) => {
    if (input.staffEmail) {
      if (props.scope === "proposal") {
        await provisionProposalStaff({
          permissions: input.permissions,
          proposalId: props.proposalId,
          staffEmail: input.staffEmail,
          workosOrganizationId: props.workosOrganizationId,
        });
        return;
      }
      await provisionActiveBuildStaff({
        buildId: props.buildId,
        permissions: input.permissions,
        staffEmail: input.staffEmail,
        workosOrganizationId: props.workosOrganizationId,
      });
      return;
    }
    if (props.scope === "proposal") {
      await saveProposalStaff({
        permissions: input.permissions,
        proposalId: props.proposalId,
        staffEmail: input.staffEmail,
        staffWorkosUserId: input.staffWorkosUserId,
        workosOrganizationId: props.workosOrganizationId,
      });
      return;
    }
    await saveActiveBuildStaff({
      buildId: props.buildId,
      permissions: input.permissions,
      staffEmail: input.staffEmail,
      staffWorkosUserId: input.staffWorkosUserId,
      workosOrganizationId: props.workosOrganizationId,
    });
  };

  const removeStaff = async (workosUserId: string) => {
    if (props.scope === "proposal") {
      await removeProposalStaff({
        proposalId: props.proposalId,
        staffWorkosUserId: workosUserId,
        workosOrganizationId: props.workosOrganizationId,
      });
      return;
    }
    await removeActiveBuildStaff({
      buildId: props.buildId,
      staffWorkosUserId: workosUserId,
      workosOrganizationId: props.workosOrganizationId,
    });
  };

  const addStaff = async () => {
    const email = newStaffEmail.trim();
    if (!email) {
      toast.error("Staff email is required.");
      return;
    }
    const permissions = emptyPermissions(resources as BuilderStaffPermissionResource[]);
    setPendingAction("add");
    try {
      await saveStaff({ permissions, staffEmail: email });
      setNewStaffEmail("");
      toast.success("Builder staff member added.");
    } catch (error) {
      toast.error(actionErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const saveSelected = async () => {
    if (!selectedMember || selectedMember.role === "owner") {
      return;
    }
    setPendingAction(`save:${selectedMember.workosUserId}`);
    try {
      await saveStaff({
        permissions: selectedPermissions,
        staffWorkosUserId: selectedMember.workosUserId,
      });
      toast.success("Builder staff permissions saved.");
    } catch (error) {
      toast.error(actionErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const removeSelected = async () => {
    if (!selectedMember || selectedMember.role === "owner") {
      return;
    }
    setPendingAction(`remove:${selectedMember.workosUserId}`);
    try {
      await removeStaff(selectedMember.workosUserId);
      setSelectedWorkosUserId(null);
      toast.success("Builder staff member removed.");
    } catch (error) {
      toast.error(actionErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Frame className="w-full min-w-0">
      <FrameHeader>
        <FrameTitle>Builder staff</FrameTitle>
        <FrameDescription>
          Manage app-level access for this {props.scope === "proposal" ? "proposal" : "active build"}.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="grid gap-4 p-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                aria-label="Staff email"
                disabled={!directory.canManage || pendingAction !== null}
                onChange={(event) => setNewStaffEmail(event.target.value)}
                placeholder="name@company.com"
                value={newStaffEmail}
              />
              <Button
                aria-label="Add staff"
                disabled={!directory.canManage || pendingAction !== null}
                onClick={() => void addStaff()}
                size="icon"
                variant="outline"
              >
                <UserPlus />
              </Button>
            </div>
          </div>
          <div className="grid gap-1">
            {directory.staff.map((member) => (
              <button
                aria-pressed={selectedWorkosUserId === member.workosUserId}
                className={
                  selectedWorkosUserId === member.workosUserId
                    ? "rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-left text-sm"
                    : "rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
                }
                key={member.workosUserId}
                onClick={() => setSelectedWorkosUserId(member.workosUserId)}
                type="button"
              >
                <span className="block truncate font-medium">
                  {member.name ?? member.email ?? member.workosUserId}
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {member.role === "owner" ? "Owner · full access" : member.email ?? member.workosUserId}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {selectedMember ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">
                    {selectedMember.name ?? selectedMember.email ?? selectedMember.workosUserId}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {selectedMember.role === "owner"
                      ? "Owner accounts always have full access."
                      : selectedMember.workosUserId}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      !directory.canManage ||
                      selectedMember.role === "owner" ||
                      pendingAction !== null
                    }
                    onClick={() => void saveSelected()}
                    size="sm"
                  >
                    <Save />
                    Save
                  </Button>
                  <Button
                    disabled={
                      !directory.canManage ||
                      selectedMember.role === "owner" ||
                      pendingAction !== null
                    }
                    onClick={() => void removeSelected()}
                    size="sm"
                    variant="destructive-outline"
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      {ACTIONS.map((action) => (
                        <TableHead className="text-center" key={action.value}>
                          {action.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPermissions.map((permission) => (
                      <TableRow key={permission.resourceType}>
                        <TableCell className="font-medium">
                          {RESOURCE_LABELS[permission.resourceType]}
                        </TableCell>
                        {ACTIONS.map((action) => (
                          <TableCell className="text-center" key={action.value}>
                            <Checkbox
                              aria-label={`${RESOURCE_LABELS[permission.resourceType]} ${action.label}`}
                              checked={permission[action.field]}
                              disabled={
                                !directory.canManage ||
                                selectedMember.role === "owner" ||
                                pendingAction !== null
                              }
                              onCheckedChange={(checked) =>
                                updatePermissionDraft(
                                  selectedMember.workosUserId,
                                  permission.resourceType,
                                  action.field,
                                  checked === true,
                                  setDraftPermissions,
                                )
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="grid min-h-48 place-items-center rounded-lg border bg-background text-muted-foreground text-sm">
              No builder staff selected.
            </div>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function clonePermissions(permissions: StaffPermissionGrant[]) {
  return permissions.map((permission) => ({ ...permission }));
}

function emptyPermissions(resources: BuilderStaffPermissionResource[]) {
  return resources.map((resourceType) => ({
    canCreate: false,
    canDelete: false,
    canUpdate: false,
    canView: false,
    resourceType,
  }));
}

function updatePermissionDraft(
  workosUserId: string,
  resourceType: BuilderStaffPermissionResource,
  field: PermissionField,
  value: boolean,
  setDraftPermissions: React.Dispatch<
    React.SetStateAction<Record<string, StaffPermissionGrant[]>>
  >,
) {
  setDraftPermissions((current) => ({
    ...current,
    [workosUserId]: (current[workosUserId] ?? []).map((permission) =>
      permission.resourceType === resourceType
        ? { ...permission, [field]: value }
        : permission,
    ),
  }));
}

function actionErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Builder staff action failed.";
}
