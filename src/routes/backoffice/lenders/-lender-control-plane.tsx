import { Link } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  RefreshCw,
  Search,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "#/components/ui/combobox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  LenderMemberAdministrationDetails,
  LenderOrganizationManagementVariantE,
  type LenderOrganizationOperation,
} from "#/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx";
import {
  LenderOrganizationOperationDialog,
  type LenderOrganizationOperationRequest,
  type WorkosReconciliationPresentation,
} from "#/features/lender-organization-management/LenderOrganizationOperationDialog.tsx";
import {
  type DirectoryUser,
  UserDetailSheet,
} from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type OrganizationPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizations
>;
type OrganizationRow = OrganizationPage["page"][number];
type DirectoryMetadata = FunctionReturnType<
  typeof api.lenderOrganizations.getLenderOrganizationDirectoryMetadata
>;
type MemberPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;
type MemberEntry = MemberPage["page"][number];
type ControlPlaneMember = Extract<MemberEntry, { kind: "member" }>["member"];
interface ControlPlaneMemberResult {
  members: ControlPlaneMember[];
  pendingInvitations: Extract<
    MemberEntry,
    { kind: "pending_invitation" }
  >["pendingInvitation"][];
}
type UnassignedResult = FunctionReturnType<
  typeof api.lenderOrganizations.listUnassignedLenderUsers
>;
type UnassignedUser = UnassignedResult["users"][number];
type ReconciliationProjection = FunctionReturnType<
  typeof api.lenderOrganizations.getLenderMembershipReconciliation
>;
type Permissions = OrganizationRow["permissions"];
type StatusFilter = "all" | "active" | "inactive";

const DEFAULT_PERMISSIONS: Permissions = {
  proposalReview: true,
  milestoneDecisions: true,
  drawDecisions: true,
  siteVisitReview: true,
};

const LENDER_ROLES = ["lender", "lender-admin", "lender-staff"] as const;
type LenderRole = (typeof LENDER_ROLES)[number];

interface ExistingUserAssignmentDraft {
  lenderOrganizationId: Id<"lenderOrganizations">;
  organizationName: string;
  user: UnassignedUser;
}

interface WorkosReconciliationState {
  assignmentId: Id<"lenderOrganizationAssignments">;
  errorMessage?: string;
  expectedRoleSlug?: LenderRole;
  kind: "change-access" | "deactivate";
  lenderOrganizationId: Id<"lenderOrganizations">;
  memberName: string;
  membershipId: string;
  reason: string;
  status: "error" | "finalizing" | "reconciled" | "waiting";
}
const EMPTY_PROVISIONING_BY_ORGANIZATION = new Map<
  string,
  OrganizationProvisioning
>();

export function LenderControlPlaneSurface() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedOrganizationId, setSelectedOrganizationId] =
    useState<Id<"lenderOrganizations"> | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>(
    {}
  );
  const [existingUserQuery, setExistingUserQuery] = useState("");
  const [existingUserOpen, setExistingUserOpen] = useState(false);
  const [selectedExistingUser, setSelectedExistingUser] =
    useState<UnassignedUser | null>(null);
  const [assignmentDraft, setAssignmentDraft] =
    useState<ExistingUserAssignmentDraft | null>(null);
  const [assignmentPending, setAssignmentPending] = useState(false);
  const [selectedDirectoryUserId, setSelectedDirectoryUserId] = useState<
    string | null
  >(null);
  const [organizationOperation, setOrganizationOperation] =
    useState<LenderOrganizationOperation | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [workosReconciliation, setWorkosReconciliation] =
    useState<WorkosReconciliationState | null>(null);
  const [permissionDraft, setPermissionDraft] =
    useState<Permissions>(DEFAULT_PERMISSIONS);
  const [changeReason, setChangeReason] = useState("Back Office policy update");
  const [policyAuditReason, setPolicyAuditReason] = useState("");
  const [provisionForm, setProvisionForm] = useState({
    brokerageId: "" as Id<"brokerages"> | "",
    displayName: "",
    legalName: "",
  });

  const directoryMetadata = useQuery(
    api.lenderOrganizations.getLenderOrganizationDirectoryMetadata,
    {}
  ) as DirectoryMetadata | undefined;
  const organizationPage = usePaginatedQuery(
    api.lenderOrganizations.listLenderOrganizations,
    {
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { initialNumItems: 5 }
  );
  const organizations = useMemo(
    () =>
      [...(organizationPage.results as OrganizationRow[])].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      ),
    [organizationPage.results]
  );
  const controlPlane =
    directoryMetadata && organizationPage.status !== "LoadingFirstPage"
      ? {
          ...directoryMetadata,
          organizations,
        }
      : undefined;
  const unassigned = useQuery(
    api.lenderOrganizations.listUnassignedLenderUsers,
    {}
  ) as UnassignedResult | undefined;
  const memberPage = usePaginatedQuery(
    api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
    selectedOrganizationId
      ? { lenderOrganizationId: selectedOrganizationId }
      : "skip",
    { initialNumItems: 25 }
  );
  const members = useMemo<ControlPlaneMemberResult | undefined>(() => {
    if (!selectedOrganizationId || memberPage.status === "LoadingFirstPage") {
      return;
    }
    const entries = memberPage.results as MemberEntry[];
    return {
      members: entries
        .filter(
          (entry): entry is Extract<MemberEntry, { kind: "member" }> =>
            entry.kind === "member"
        )
        .map((entry) => entry.member)
        .sort((left, right) => left.name.localeCompare(right.name)),
      pendingInvitations: entries
        .filter(
          (
            entry
          ): entry is Extract<MemberEntry, { kind: "pending_invitation" }> =>
            entry.kind === "pending_invitation"
        )
        .map((entry) => entry.pendingInvitation)
        .sort((left, right) => right.assignedAt - left.assignedAt),
    };
  }, [memberPage.results, memberPage.status, selectedOrganizationId]);
  const reconciliationProjection = useQuery(
    api.lenderOrganizations.getLenderMembershipReconciliation,
    workosReconciliation &&
      workosReconciliation.status !== "reconciled" &&
      workosReconciliation.status !== "error"
      ? {
          lenderOrganizationId: workosReconciliation.lenderOrganizationId,
          membershipId: workosReconciliation.membershipId,
        }
      : "skip"
  ) as ReconciliationProjection | undefined;

  const provisionOrganization = useMutation(
    api.lenderOrganizations.provisionLenderOrganization
  );
  const assignLenderUser = useMutation(
    api.lenderOrganizations.assignLenderUser
  );
  const unassignLenderUser = useMutation(
    api.lenderOrganizations.unassignLenderUser
  );
  const updatePermissions = useMutation(
    api.lenderOrganizations.updateLenderOrganizationPermissions
  );
  const setOrganizationStatus = useMutation(
    api.lenderOrganizations.setLenderOrganizationStatus
  );
  const reconcileAssignments = useMutation(
    api.lenderOrganizations.reconcilePendingLenderAssignments
  );
  const inviteLenderUser = useAction(api.lenderOrganizations.inviteLenderUser);
  const updateMembershipRoles = useAction(
    api.workosManagement.updateSharedLenderMembershipRoles
  );
  const deactivateMembership = useAction(
    api.workosManagement.deactivateSharedLenderMembership
  );

  const selectedOrganization = useMemo(
    () =>
      controlPlane?.organizations.find(
        (organization) => organization.id === selectedOrganizationId
      ) ?? null,
    [controlPlane?.organizations, selectedOrganizationId]
  );

  const filteredExistingUsers = useMemo(
    () =>
      filterAssignableLenderUsers(unassigned?.users ?? [], existingUserQuery),
    [existingUserQuery, unassigned?.users]
  );
  const directoryUsers = useMemo(
    () =>
      buildLenderOrganizationDirectoryUsers(
        members?.members ?? [],
        controlPlane?.sharedWorkosOrganizationId
      ),
    [controlPlane?.sharedWorkosOrganizationId, members?.members]
  );
  const selectedDirectoryUser = useMemo(
    () =>
      directoryUsers.find(
        (entry) => entry.user.workosUserId === selectedDirectoryUserId
      ) ?? null,
    [directoryUsers, selectedDirectoryUserId]
  );
  const organizationsById = useMemo(() => {
    const workosOrganizationId = controlPlane?.sharedWorkosOrganizationId;
    if (!workosOrganizationId) {
      return new Map<string, WorkosOrganizationRow>();
    }
    return new Map<string, WorkosOrganizationRow>([
      [
        workosOrganizationId,
        {
          name: "Shared lender identity",
          status: "active",
          workosOrganizationId,
        },
      ],
    ]);
  }, [controlPlane?.sharedWorkosOrganizationId]);
  const roleOptionsByOrganization = useMemo(() => {
    const workosOrganizationId = controlPlane?.sharedWorkosOrganizationId;
    if (!workosOrganizationId) {
      return new Map<string, string[]>();
    }
    return new Map([[workosOrganizationId, [...LENDER_ROLES]]]);
  }, [controlPlane?.sharedWorkosOrganizationId]);

  useEffect(() => {
    if (selectedOrganization) {
      setPermissionDraft(selectedOrganization.permissions);
    }
  }, [selectedOrganization]);

  useEffect(() => {
    setPolicyAuditReason("");
  }, [selectedOrganizationId]);

  useEffect(() => {
    setExistingUserQuery("");
    setExistingUserOpen(false);
    setSelectedExistingUser(null);
    setAssignmentDraft(null);
    setSelectedDirectoryUserId(null);
    setOrganizationOperation(null);
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (!provisionForm.brokerageId && controlPlane?.brokerages[0]) {
      setProvisionForm((current) => ({
        ...current,
        brokerageId: controlPlane.brokerages[0]!.id,
      }));
    }
  }, [controlPlane?.brokerages, provisionForm.brokerageId]);

  useEffect(() => {
    const reconciliation = workosReconciliation;
    if (
      !reconciliation ||
      reconciliation.status !== "waiting" ||
      reconciliationProjection === undefined ||
      reconciliationProjection === null
    ) {
      return;
    }
    if (reconciliationProjection.assignmentId !== reconciliation.assignmentId) {
      setWorkosReconciliation({
        ...reconciliation,
        errorMessage:
          "The scoped lender assignment changed before reconciliation completed.",
        status: "error",
      });
      return;
    }
    if (reconciliation.kind === "change-access") {
      const expectedRole = reconciliation.expectedRoleSlug;
      if (
        reconciliationProjection.membershipStatus === "active" &&
        expectedRole &&
        reconciliationProjection.roleSlugs.length === 1 &&
        reconciliationProjection.roleSlugs[0] === expectedRole
      ) {
        setWorkosReconciliation({ ...reconciliation, status: "reconciled" });
        toast.success(`${reconciliation.memberName} access reconciled`);
      }
      return;
    }
    if (
      reconciliationProjection.membershipStatus !== "inactive" &&
      reconciliationProjection.membershipStatus !== "deleted"
    ) {
      return;
    }

    setWorkosReconciliation({ ...reconciliation, status: "finalizing" });
    unassignLenderUser({
      assignmentId: reconciliation.assignmentId,
      reason: reconciliation.reason,
    })
      .then(() => {
        setWorkosReconciliation((current) =>
          current?.membershipId === reconciliation.membershipId
            ? { ...current, status: "reconciled" }
            : current
        );
        toast.success(`${reconciliation.memberName} deactivated`);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to finish the app assignment update";
        setWorkosReconciliation((current) =>
          current?.membershipId === reconciliation.membershipId
            ? { ...current, errorMessage: message, status: "error" }
            : current
        );
        toast.error(message);
      });
  }, [reconciliationProjection, unassignLenderUser, workosReconciliation]);

  const run = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const handleProvision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!provisionForm.brokerageId) {
      toast.error("Choose a parent brokerage");
      return;
    }
    await run(
      () =>
        provisionOrganization({
          brokerageId: provisionForm.brokerageId as Id<"brokerages">,
          displayName: provisionForm.displayName,
          legalName: provisionForm.legalName || provisionForm.displayName,
          permissions: DEFAULT_PERMISSIONS,
        }),
      "Lender organization provisioned"
    );
    setProvisionForm((current) => ({
      ...current,
      displayName: "",
      legalName: "",
    }));
    setProvisionOpen(false);
  };

  const handleOrganizationOperation = async (
    request: LenderOrganizationOperationRequest
  ) => {
    if (!selectedOrganization) {
      throw new Error("Choose a lender organization before changing access");
    }
    if (request.kind === "transfer-principal") {
      throw new Error(
        "Principal Broker transfer is not part of lender organization access"
      );
    }

    setOperationPending(true);
    try {
      if (request.kind === "invite") {
        await inviteLenderUser({
          email: request.email,
          lenderOrganizationId: selectedOrganization.id,
          reason: request.reason,
          roleSlug: request.roleSlug,
        });
        toast.success(
          "WorkOS invitation accepted; waiting for projection reconciliation"
        );
        setOrganizationOperation(null);
      } else if (request.kind === "change-access") {
        const member = findMemberByMembershipId(
          members?.members ?? [],
          request.membershipId
        );
        if (!member) {
          throw new Error(
            "The current lender member projection is unavailable"
          );
        }
        const result = await updateMembershipRoles({
          lenderOrganizationId: selectedOrganization.id,
          membershipId: request.membershipId,
          reason: request.reason,
          roleSlug: request.roleSlug,
        });
        requireWaitingForWebhook(result);
        setWorkosReconciliation({
          assignmentId: member.assignmentId,
          expectedRoleSlug: request.roleSlug,
          kind: request.kind,
          lenderOrganizationId: selectedOrganization.id,
          memberName: member.name,
          membershipId: request.membershipId,
          reason: request.reason,
          status: "waiting",
        });
      } else {
        const member = findMemberByMembershipId(
          members?.members ?? [],
          request.membershipId
        );
        if (!member) {
          throw new Error(
            "The current lender member projection is unavailable"
          );
        }
        const result = await deactivateMembership({
          lenderOrganizationId: selectedOrganization.id,
          membershipId: request.membershipId,
          reason: request.reason,
        });
        requireWaitingForWebhook(result);
        setWorkosReconciliation({
          assignmentId: member.assignmentId,
          kind: request.kind,
          lenderOrganizationId: selectedOrganization.id,
          memberName: member.name,
          membershipId: request.membershipId,
          reason: request.reason,
          status: "waiting",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setOperationPending(false);
    }
  };

  const openOrganizationOperation = (
    operation: LenderOrganizationOperation
  ) => {
    if (
      workosReconciliation &&
      workosReconciliation.status !== "reconciled" &&
      workosReconciliation.status !== "error"
    ) {
      toast.error("Wait for the current WorkOS command to reconcile");
      return;
    }
    setWorkosReconciliation(null);
    setOrganizationOperation(operation);
  };

  const openAssignmentDraft = (
    user: UnassignedUser,
    lenderOrganizationId: Id<"lenderOrganizations">
  ) => {
    const organization = controlPlane?.organizations.find(
      (candidate) =>
        candidate.id === lenderOrganizationId && candidate.status === "active"
    );
    if (!organization) {
      toast.error("Choose an active lender organization");
      return;
    }
    setAssignmentDraft({
      lenderOrganizationId,
      organizationName: organization.displayName,
      user,
    });
  };

  const handleExistingUserAssignment = async (reason: string) => {
    if (!assignmentDraft || !reason.trim()) {
      return;
    }
    setAssignmentPending(true);
    try {
      await assignLenderUser({
        lenderOrganizationId: assignmentDraft.lenderOrganizationId,
        workosUserId: assignmentDraft.user.workosUserId,
        reason: reason.trim(),
      });
      toast.success(
        `${assignmentDraft.user.name} added to ${assignmentDraft.organizationName}`
      );
      setAssignTargets((current) => {
        const next = { ...current };
        delete next[assignmentDraft.user.workosUserId];
        return next;
      });
      setSelectedExistingUser(null);
      setExistingUserQuery("");
      setExistingUserOpen(false);
      setAssignmentDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setAssignmentPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Back Office · Control plane
          </p>
          <h1 className="mt-3 font-heading font-semibold text-3xl tracking-tight">
            Lender organizations
          </h1>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Provision application organizations under a Brokerage, attach lender
            users, and set the workflow policy that caps their access.
          </p>
        </div>
        <Button onClick={() => setProvisionOpen(true)}>
          <Building2 />
          Provision organization
        </Button>
      </header>

      <Frame>
        <FramePanel className="grid gap-0 p-0 sm:grid-cols-3">
          <Metric
            icon={<Building2 />}
            label="Loaded organizations"
            value={String(controlPlane?.organizations.length ?? 0)}
          />
          <Metric
            icon={<Users />}
            label="Members in loaded organizations"
            value={String(
              controlPlane?.organizations.reduce(
                (sum, row) => sum + row.memberCount,
                0
              ) ?? 0
            )}
          />
          <Metric
            icon={<UserPlus />}
            label="Unassigned lender users"
            value={String(unassigned?.users.length ?? 0)}
          />
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-xl">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search lender organizations"
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search organization or Brokerage"
                value={search}
              />
            </div>
            <div className="flex items-center gap-2">
              {(["all", "active", "inactive"] as const).map((filter) => (
                <Button
                  aria-pressed={statusFilter === filter}
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  size="sm"
                  variant={statusFilter === filter ? "secondary" : "ghost"}
                >
                  {filter[0]!.toUpperCase() + filter.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </FramePanel>
      </Frame>

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
                Active users in the shared identity organization with no
                app-level assignment.
              </p>
            </div>
            <Button
              onClick={() =>
                void run(
                  () => reconcileAssignments({}),
                  "Pending assignments reconciled"
                )
              }
              size="sm"
              variant="outline"
            >
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
              Every eligible lender user is assigned or waiting on
              reconciliation.
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
                      <p className="truncate font-medium text-sm">
                        {user.name}
                      </p>
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
                        setAssignTargets((current) => ({
                          ...current,
                          [user.workosUserId]: value ?? "",
                        }))
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
                        openAssignmentDraft(
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

      <Frame>
        <FramePanel className="p-0">
          <p aria-live="polite" className="sr-only">
            {controlPlane?.organizations.length ?? 0} lender organizations
            loaded.
          </p>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px_150px] gap-4 border-b px-5 py-3 text-muted-foreground text-xs uppercase tracking-[0.12em] md:px-6">
            <span>Organization</span>
            <span>Parent Brokerage</span>
            <span>Members</span>
            <span>Status</span>
            <span />
          </div>
          {controlPlane === undefined ? (
            <div className="p-6 text-muted-foreground text-sm">
              Loading lender organizations…
            </div>
          ) : controlPlane.organizations.length === 0 ? (
            <div className="p-8 text-muted-foreground text-sm">
              {organizationPage.status === "CanLoadMore"
                ? "No matches in the loaded organizations. Load more to continue searching."
                : "No lender organizations match this view. Provision the first one when a Brokerage is ready."}
            </div>
          ) : (
            <div className="divide-y">
              {controlPlane.organizations.map((organization) => (
                <div
                  className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px_150px] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40 md:px-6"
                  key={organization.id}
                >
                  <button
                    aria-label={`Manage ${organization.displayName}`}
                    className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <span className="block truncate font-medium text-sm">
                      {organization.displayName}
                    </span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                      {organization.legalName}
                    </span>
                  </button>
                  <span className="truncate text-muted-foreground text-sm">
                    {organization.brokerageName}
                  </span>
                  <span className="tabular-nums text-sm">
                    {organization.memberCount}
                    {organization.pendingCount ? (
                      <span className="text-muted-foreground">
                        {" "}
                        + {organization.pendingCount} pending
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <Badge
                      variant={
                        organization.status === "active" ? "default" : "outline"
                      }
                    >
                      {organization.status}
                    </Badge>
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      aria-label={`View organization ${organization.displayName}`}
                      className="font-medium text-primary text-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      params={{ lenderId: organization.id }}
                      preload="intent"
                      to="/backoffice/lenders/$lenderId"
                    >
                      View organization
                    </Link>
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {organizationPage.status === "CanLoadMore" ||
          organizationPage.status === "LoadingMore" ? (
            <div className="flex justify-center border-t p-4">
              <Button
                disabled={organizationPage.status === "LoadingMore"}
                onClick={() => organizationPage.loadMore(5)}
                variant="outline"
              >
                {organizationPage.status === "LoadingMore"
                  ? "Loading organizations…"
                  : "Load more organizations"}
              </Button>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelectedOrganizationId(null);
        }}
        open={selectedOrganizationId !== null}
      >
        <SheetPopup className="w-full sm:max-w-5xl">
          <SheetHeader>
            <SheetTitle>
              {selectedOrganization?.displayName ?? "Lender organization"}
            </SheetTitle>
            <SheetDescription>
              Application ownership, membership assignments, and shared workflow
              policy.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="space-y-6 overflow-y-auto px-6 pb-8">
            {selectedOrganization ? (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Organization state</p>
                      <p className="text-muted-foreground text-xs">
                        Soft deactivation retains assignment history.
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        void run(
                          () =>
                            setOrganizationStatus({
                              lenderOrganizationId: selectedOrganization.id,
                              status:
                                selectedOrganization.status === "active"
                                  ? "inactive"
                                  : "active",
                              reason: changeReason,
                            }),
                          selectedOrganization.status === "active"
                            ? "Organization deactivated"
                            : "Organization reactivated"
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      {selectedOrganization.status === "active"
                        ? "Deactivate"
                        : "Reactivate"}
                    </Button>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <p className="font-medium text-sm">Add existing user</p>
                    <p className="text-muted-foreground text-xs">
                      Select an active lender user from the shared WorkOS
                      directory who is not assigned to another Lender
                      Organization.
                    </p>
                  </div>
                  <Combobox<UnassignedUser>
                    autoHighlight
                    filter={null}
                    inputValue={existingUserQuery}
                    isItemEqualToValue={(left, right) =>
                      left.workosUserId === right.workosUserId
                    }
                    itemToStringLabel={(user) =>
                      user ? `${user.name} ${user.email}` : ""
                    }
                    itemToStringValue={(user) => user.workosUserId}
                    items={filteredExistingUsers}
                    modal={false}
                    onInputValueChange={(nextQuery, details) => {
                      setExistingUserQuery(nextQuery);
                      if (details.reason === "input-change") {
                        if (
                          selectedExistingUser &&
                          nextQuery !==
                            formatAssignableUserInputValue(selectedExistingUser)
                        ) {
                          setSelectedExistingUser(null);
                        }
                        setExistingUserOpen(true);
                      }
                    }}
                    onOpenChange={setExistingUserOpen}
                    onValueChange={(user) => {
                      setSelectedExistingUser(user ?? null);
                      setExistingUserQuery(
                        user ? formatAssignableUserInputValue(user) : ""
                      );
                      setExistingUserOpen(false);
                    }}
                    open={
                      existingUserOpen &&
                      selectedOrganization.status === "active"
                    }
                    openOnInputClick
                    value={selectedExistingUser}
                  >
                    <ComboboxInput
                      aria-label="Add an existing lender user"
                      disabled={selectedOrganization.status !== "active"}
                      onClick={() => setExistingUserOpen(true)}
                      onFocus={() => setExistingUserOpen(true)}
                      placeholder="Search by name or email…"
                      showClear
                      showTrigger
                      startAddon={<Search aria-hidden />}
                    />
                    <ComboboxPopup>
                      <ComboboxEmpty>
                        {unassigned?.users.length
                          ? "No unassigned lender users match this search."
                          : "No eligible unassigned lender users are available."}
                      </ComboboxEmpty>
                      <ComboboxList>
                        {(user: UnassignedUser) => (
                          <ComboboxItem
                            className="min-h-12 px-2.5 py-2"
                            key={user.workosUserId}
                            value={user}
                          >
                            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                                  {initials(user.name, user.email)}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {user.name}
                                  </span>
                                  <span className="block truncate text-muted-foreground text-xs">
                                    {user.email}
                                  </span>
                                </span>
                              </span>
                              <Badge variant="outline">
                                {formatRole(user.roleSlugs[0] ?? "lender")}
                              </Badge>
                            </span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxPopup>
                  </Combobox>
                  {selectedExistingUser ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border bg-muted/30 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {selectedExistingUser.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {selectedExistingUser.email}
                        </p>
                      </div>
                      <Button
                        disabled={selectedOrganization.status !== "active"}
                        onClick={() =>
                          openAssignmentDraft(
                            selectedExistingUser,
                            selectedOrganization.id
                          )
                        }
                        size="sm"
                      >
                        <UserPlus />
                        Add to organization
                      </Button>
                    </div>
                  ) : null}
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <p className="font-medium text-sm">Workflow policy</p>
                    <p className="text-muted-foreground text-xs">
                      One shared policy caps every assigned lender.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {permissionEntries(permissionDraft).map(
                      ([key, label, enabled]) => (
                        <button
                          aria-pressed={enabled}
                          className="flex items-center justify-between border px-3 py-3 text-left text-sm hover:bg-muted/40"
                          key={key}
                          onClick={() =>
                            setPermissionDraft((current) => ({
                              ...current,
                              [key]: !current[key],
                            }))
                          }
                          type="button"
                        >
                          <span>{label}</span>
                          <Badge variant={enabled ? "default" : "outline"}>
                            {enabled ? "Enabled" : "Off"}
                          </Badge>
                        </button>
                      )
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lender-policy-audit-reason">
                      Policy audit reason <span aria-hidden="true">*</span>
                    </Label>
                    <Textarea
                      aria-describedby="lender-policy-audit-reason-hint"
                      aria-required="true"
                      id="lender-policy-audit-reason"
                      onChange={(event) =>
                        setPolicyAuditReason(event.target.value)
                      }
                      required
                      value={policyAuditReason}
                    />
                    <p
                      className="text-muted-foreground text-xs"
                      id="lender-policy-audit-reason-hint"
                    >
                      Required. Explain why this workflow policy is changing.
                    </p>
                  </div>
                  <Button
                    disabled={!policyAuditReason.trim()}
                    onClick={() => {
                      const reason = policyAuditReason.trim();
                      if (!reason) return;
                      void run(async () => {
                        await updatePermissions({
                          lenderOrganizationId: selectedOrganization.id,
                          permissions: permissionDraft,
                          reason,
                        });
                        setPolicyAuditReason("");
                      }, "Workflow policy saved");
                    }}
                    size="sm"
                  >
                    Save policy
                  </Button>
                </section>

                <section className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      onClick={() =>
                        void run(
                          () =>
                            reconcileAssignments({
                              lenderOrganizationId: selectedOrganization.id,
                            }),
                          "Organization assignments reconciled"
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      <RefreshCw />
                      Reconcile WorkOS projection
                    </Button>
                  </div>
                  {workosReconciliation?.lenderOrganizationId ===
                  selectedOrganization.id ? (
                    <WorkosReconciliationNotice
                      onRetry={
                        workosReconciliation.status === "error" &&
                        workosReconciliation.kind === "deactivate"
                          ? () =>
                              setWorkosReconciliation((current) =>
                                current
                                  ? {
                                      ...current,
                                      errorMessage: undefined,
                                      status: "waiting",
                                    }
                                  : current
                              )
                          : undefined
                      }
                      state={workosReconciliation}
                    />
                  ) : null}
                  <LenderOrganizationManagementVariantE
                    activeMemberCount={directoryUsers.length}
                    administrationContext="Back Office Admin"
                    directoryUsers={directoryUsers}
                    headingLevel={2}
                    mode="production"
                    onOpenOperation={openOrganizationOperation}
                    onOpenUser={setSelectedDirectoryUserId}
                    organizationName={selectedOrganization.displayName}
                    organizationsById={organizationsById}
                    pending={members === undefined}
                    pendingMemberCount={members?.pendingInvitations.length ?? 0}
                    pendingMembers={members?.pendingInvitations ?? []}
                    provisioningByOrg={EMPTY_PROVISIONING_BY_ORGANIZATION}
                  />
                  {memberPage.status === "CanLoadMore" ||
                  memberPage.status === "LoadingMore" ? (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <p className="text-muted-foreground text-xs">
                        Counts include loaded members.
                      </p>
                      <Button
                        disabled={memberPage.status === "LoadingMore"}
                        onClick={() => memberPage.loadMore(25)}
                        variant="outline"
                      >
                        {memberPage.status === "LoadingMore"
                          ? "Loading members…"
                          : "Load more members"}
                      </Button>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <UserDetailSheet
        directoryUser={selectedDirectoryUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDirectoryUserId(null);
          }
        }}
        organizationsById={organizationsById}
        provisioningByOrg={EMPTY_PROVISIONING_BY_ORGANIZATION}
        readOnly
        readOnlyBadgeLabel="WorkOS-managed"
        readOnlySupplement={
          selectedDirectoryUser && selectedOrganization ? (
            <LenderMemberAdministrationDetails
              activeMembershipCount={directoryUsers.length}
              member={selectedDirectoryUser}
              mode="production"
              onOpenOperation={openOrganizationOperation}
              organizationName={selectedOrganization.displayName}
              showTransfer={false}
            />
          ) : null
        }
        roleOptionsByOrganization={roleOptionsByOrganization}
        workspaceOrganizations={[...organizationsById.values()]}
      />

      {organizationOperation && selectedOrganization ? (
        <LenderOrganizationOperationDialog
          directoryUsers={directoryUsers}
          member={
            organizationOperation === "invite" ? null : selectedDirectoryUser
          }
          onExecute={handleOrganizationOperation}
          onOpenChange={(open) => {
            if (!open) {
              setOrganizationOperation(null);
            }
          }}
          operation={organizationOperation}
          organizationName={selectedOrganization.displayName}
          pending={operationPending}
          reconciliation={
            workosReconciliation?.kind === organizationOperation
              ? reconciliationPresentation(workosReconciliation)
              : undefined
          }
        />
      ) : null}

      {assignmentDraft ? (
        <ExistingLenderUserAssignmentDialog
          draft={assignmentDraft}
          onOpenChange={(open) => {
            if (!open && !assignmentPending) {
              setAssignmentDraft(null);
            }
          }}
          onSubmit={handleExistingUserAssignment}
          pending={assignmentPending}
        />
      ) : null}

      <Dialog onOpenChange={setProvisionOpen} open={provisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision lender organization</DialogTitle>
            <DialogDescription>
              Create an application organization under an existing Brokerage. No
              WorkOS organization will be created.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => void handleProvision(event)}
          >
            <div className="space-y-2">
              <Label htmlFor="lender-display-name">Display name</Label>
              <Input
                id="lender-display-name"
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="Northstar Lending"
                value={provisionForm.displayName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lender-legal-name">Legal name</Label>
              <Input
                id="lender-legal-name"
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
                placeholder="Northstar Lending Corporation"
                value={provisionForm.legalName}
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Brokerage</Label>
              <Select
                onValueChange={(value) =>
                  setProvisionForm((current) => ({
                    ...current,
                    brokerageId: value ? (value as Id<"brokerages">) : "",
                  }))
                }
                value={provisionForm.brokerageId || undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Brokerage" />
                </SelectTrigger>
                <SelectContent>
                  {(controlPlane?.brokerages ?? []).map((brokerage) => (
                    <SelectItem key={brokerage.id} value={brokerage.id}>
                      {brokerage.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>
                Cancel
              </DialogClose>
              <Button type="submit">Provision organization</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExistingLenderUserAssignmentDialog({
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
              <Button disabled={pending} onClick={() => void onSubmit(reason)}>
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

function AssignmentFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <p className="font-medium text-xs">{label}</p>
      <p className="break-words text-sm sm:text-end">{value}</p>
    </div>
  );
}

function WorkosReconciliationNotice({
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

function reconciliationPresentation(
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

function requireWaitingForWebhook(result: { status: string; sync: string }) {
  if (result.status !== "accepted" || result.sync !== "waiting-for-webhook") {
    throw new Error("WorkOS returned an unexpected command state");
  }
}

function Metric({
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

function permissionEntries(permissions: Permissions) {
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

function formatRole(role: string) {
  return role
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatAssignableUserInputValue(user: UnassignedUser) {
  return `${user.name} · ${user.email}`;
}

function filterAssignableLenderUsers(users: UnassignedUser[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
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

function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(/\s+/).filter(Boolean);
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

function findMemberByMembershipId(
  members: ControlPlaneMember[],
  membershipId: string
) {
  return members.find((member) => member.membershipId === membershipId) ?? null;
}
