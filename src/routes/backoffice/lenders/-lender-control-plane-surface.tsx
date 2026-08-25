import { Link } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2, ChevronRight, Search, UserPlus, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  LenderMemberAdministrationDetails,
  type LenderOrganizationOperation,
} from "#/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx";
import {
  LenderOrganizationOperationDialog,
  type LenderOrganizationOperationRequest,
} from "#/features/lender-organization-management/LenderOrganizationOperationDialog.tsx";
import { UserDetailSheet } from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

import { LenderOrganizationDetailSheet } from "./-lender-control-plane-detail.tsx";
import { LenderOrganizationProvisionDialog } from "./-lender-control-plane-provision.tsx";
import { LenderControlPlaneUnassignedUsers } from "./-lender-control-plane-unassigned-users.tsx";
import {
  ExistingLenderUserAssignmentDialog,
  Metric,
  buildLenderOrganizationDirectoryUsers,
  filterAssignableLenderUsers,
  findMemberByMembershipId,
  reconciliationPresentation,
  requireWaitingForWebhook,
} from "./-lender-control-plane-support.tsx";

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
  const [changeReason] = useState("Back Office policy update");
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

      <LenderControlPlaneUnassignedUsers
        assignTargets={assignTargets}
        controlPlane={controlPlane}
        onAssign={openAssignmentDraft}
        onAssignTargetChange={(workosUserId, value) =>
          setAssignTargets((current) => ({
            ...current,
            [workosUserId]: value,
          }))
        }
        onReconcile={() =>
          run(() => reconcileAssignments({}), "Pending assignments reconciled")
        }
        unassigned={unassigned}
      />
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

      <LenderOrganizationDetailSheet
        changeReason={changeReason}
        directoryUsers={directoryUsers}
        existingUserOpen={existingUserOpen}
        existingUserQuery={existingUserQuery}
        filteredExistingUsers={filteredExistingUsers}
        memberPage={memberPage}
        members={members}
        onOpenAssignmentDraft={openAssignmentDraft}
        onOpenChange={(open) => {
          if (!open) setSelectedOrganizationId(null);
        }}
        onOpenOperation={openOrganizationOperation}
        onOpenUser={setSelectedDirectoryUserId}
        onReconcileAssignments={(input) => reconcileAssignments(input)}
        onRetryReconciliation={
          workosReconciliation?.status === "error" &&
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
        onSetOrganizationStatus={(input) => setOrganizationStatus(input)}
        onUpdatePermissions={(input) => updatePermissions(input)}
        open={selectedOrganizationId !== null}
        organizationsById={organizationsById}
        permissionDraft={permissionDraft}
        policyAuditReason={policyAuditReason}
        provisioningByOrg={EMPTY_PROVISIONING_BY_ORGANIZATION}
        reconciliation={
          workosReconciliation?.lenderOrganizationId ===
          selectedOrganization?.id
            ? workosReconciliation
            : null
        }
        run={run}
        selectedExistingUser={selectedExistingUser}
        selectedOrganization={selectedOrganization}
        setExistingUserOpen={setExistingUserOpen}
        setExistingUserQuery={setExistingUserQuery}
        setPermissionDraft={setPermissionDraft}
        setPolicyAuditReason={setPolicyAuditReason}
        setSelectedExistingUser={setSelectedExistingUser}
        unassignedUserCount={unassigned?.users.length ?? 0}
      />

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
              reviewRequirementsAction={
                <Link preload="intent" to="/backoffice/proposals" />
              }
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

      <LenderOrganizationProvisionDialog
        controlPlane={directoryMetadata}
        form={provisionForm}
        onChange={setProvisionForm}
        onOpenChange={setProvisionOpen}
        onSubmit={handleProvision}
        open={provisionOpen}
      />
    </div>
  );
}
