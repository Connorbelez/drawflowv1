import {
  Building2,
  Check,
  ChevronRight,
  MailPlus,
  RefreshCw,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

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
import { LenderOrganizationMembersTable } from "#/features/lender-organizations/LenderOrganizationMembersTable.tsx";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";

type ControlPlaneResult = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizations
>;
type OrganizationRow = ControlPlaneResult["organizations"][number];
type ControlPlaneMemberResult = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;
type UnassignedResult = FunctionReturnType<
  typeof api.lenderOrganizations.listUnassignedLenderUsers
>;
type UnassignedUser = UnassignedResult["users"][number];
type Permissions = OrganizationRow["permissions"];
type StatusFilter = "all" | "active" | "inactive";

const DEFAULT_PERMISSIONS: Permissions = {
  proposalReview: true,
  milestoneDecisions: true,
  drawDecisions: true,
  siteVisitReview: true,
};

const LENDER_ROLES = ["lender", "lender-admin", "lender-staff"] as const;

export function LenderControlPlaneSurface() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    Id<"lenderOrganizations"> | null
  >(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({});
  const [existingUserQuery, setExistingUserQuery] = useState("");
  const [existingUserOpen, setExistingUserOpen] = useState(false);
  const [selectedExistingUser, setSelectedExistingUser] =
    useState<UnassignedUser | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Permissions>(
    DEFAULT_PERMISSIONS
  );
  const [changeReason, setChangeReason] = useState("Back Office policy update");
  const [provisionForm, setProvisionForm] = useState({
    brokerageId: "" as Id<"brokerages"> | "",
    displayName: "",
    legalName: "",
  });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    roleSlug: "lender" as (typeof LENDER_ROLES)[number],
  });

  const controlPlane = useQuery(api.lenderOrganizations.listLenderOrganizations, {
    search: search.trim() || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  }) as ControlPlaneResult | undefined;
  const unassigned = useQuery(
    api.lenderOrganizations.listUnassignedLenderUsers,
    {}
  ) as UnassignedResult | undefined;
  const members = useQuery(
    api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
    selectedOrganizationId
      ? { lenderOrganizationId: selectedOrganizationId }
      : "skip"
  ) as ControlPlaneMemberResult | undefined;

  const provisionOrganization = useMutation(
    api.lenderOrganizations.provisionLenderOrganization
  );
  const assignLenderUser = useMutation(api.lenderOrganizations.assignLenderUser);
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
      filterAssignableLenderUsers(
        unassigned?.users ?? [],
        existingUserQuery
      ),
    [existingUserQuery, unassigned?.users]
  );

  useEffect(() => {
    if (selectedOrganization) {
      setPermissionDraft(selectedOrganization.permissions);
    }
  }, [selectedOrganization]);

  useEffect(() => {
    setExistingUserQuery("");
    setExistingUserOpen(false);
    setSelectedExistingUser(null);
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (!provisionForm.brokerageId && controlPlane?.brokerages[0]) {
      setProvisionForm((current) => ({
        ...current,
        brokerageId: controlPlane.brokerages[0]!.id,
      }));
    }
  }, [controlPlane?.brokerages, provisionForm.brokerageId]);

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

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrganization) {
      return;
    }
    await run(
      () =>
        inviteLenderUser({
          lenderOrganizationId: selectedOrganization.id,
          email: inviteForm.email,
          roleSlug: inviteForm.roleSlug,
          reason: changeReason,
        }),
      "WorkOS invitation accepted; waiting for projection reconciliation"
    );
    setInviteForm({ email: "", roleSlug: "lender" });
  };

  const handleAddExistingUser = async () => {
    if (!selectedOrganization || !selectedExistingUser) {
      return;
    }
    await run(
      () =>
        assignLenderUser({
          lenderOrganizationId: selectedOrganization.id,
          workosUserId: selectedExistingUser.workosUserId,
          reason: "Assigned by Back Office Admin",
        }),
      `${selectedExistingUser.name} added to ${selectedOrganization.displayName}`
    );
    setSelectedExistingUser(null);
    setExistingUserQuery("");
    setExistingUserOpen(false);
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
          <Metric icon={<Building2 />} label="Lender organizations" value={String(controlPlane?.organizations.length ?? 0)} />
          <Metric icon={<Users />} label="Assigned members" value={String(controlPlane?.organizations.reduce((sum, row) => sum + row.memberCount, 0) ?? 0)} />
          <Metric icon={<UserPlus />} label="Unassigned lender users" value={String(unassigned?.users.length ?? 0)} />
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
                Active users in the shared identity organization with no app-level assignment.
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
            <div className="p-6 text-muted-foreground text-sm">Loading shared identity users…</div>
          ) : unassigned.users.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-muted-foreground text-sm">
              <Check className="size-4 text-emerald-600" />
              Every eligible lender user is assigned or waiting on reconciliation.
            </div>
          ) : (
            <div className="divide-y">
              {unassigned.users.map((user) => (
                <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6" key={user.userId}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                      {initials(user.name, user.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{user.name}</p>
                      <p className="truncate text-muted-foreground text-xs">{user.email}</p>
                    </div>
                    <div className="hidden gap-1 lg:flex">
                      {user.roleSlugs.map((role) => <Badge key={role} variant="secondary">{formatRole(role)}</Badge>)}
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
                      <SelectTrigger aria-label={`Assign ${user.email}`} className="min-w-0 flex-1">
                        <SelectValue placeholder="Choose lender organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {(controlPlane?.organizations ?? [])
                          .filter((organization) => organization.status === "active")
                          .map((organization) => (
                            <SelectItem key={organization.id} value={organization.id}>
                              {organization.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!assignTargets[user.workosUserId]}
                      onClick={() =>
                        void run(
                          () =>
                            assignLenderUser({
                              lenderOrganizationId: assignTargets[user.workosUserId] as Id<"lenderOrganizations">,
                              workosUserId: user.workosUserId,
                              reason: "Assigned by Back Office Admin",
                            }),
                          `${user.name} assigned`
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
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px_150px] gap-4 border-b px-5 py-3 text-muted-foreground text-xs uppercase tracking-[0.12em] md:px-6">
            <span>Organization</span>
            <span>Parent Brokerage</span>
            <span>Members</span>
            <span>Status</span>
            <span />
          </div>
          {controlPlane === undefined ? (
            <div className="p-6 text-muted-foreground text-sm">Loading lender organizations…</div>
          ) : controlPlane.organizations.length === 0 ? (
            <div className="p-8 text-muted-foreground text-sm">
              No lender organizations match this view. Provision the first one when a Brokerage is ready.
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
                    <span className="block truncate font-medium text-sm">{organization.displayName}</span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">{organization.legalName}</span>
                  </button>
                  <span className="truncate text-muted-foreground text-sm">{organization.brokerageName}</span>
                  <span className="text-sm">{organization.memberCount}{organization.pendingCount ? <span className="text-muted-foreground"> + {organization.pendingCount} pending</span> : null}</span>
                  <span><Badge variant={organization.status === "active" ? "default" : "outline"}>{organization.status}</Badge></span>
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
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </FramePanel>
      </Frame>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelectedOrganizationId(null);
        }}
        open={selectedOrganizationId !== null}
      >
        <SheetPopup className="max-w-xl">
          <SheetHeader>
            <SheetTitle>{selectedOrganization?.displayName ?? "Lender organization"}</SheetTitle>
            <SheetDescription>
              Application ownership, membership assignments, and shared workflow policy.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="space-y-6 overflow-y-auto px-6 pb-8">
            {selectedOrganization ? (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Organization state</p>
                      <p className="text-muted-foreground text-xs">Soft deactivation retains assignment history.</p>
                    </div>
                    <Button
                      onClick={() =>
                        void run(
                          () =>
                            setOrganizationStatus({
                              lenderOrganizationId: selectedOrganization.id,
                              status: selectedOrganization.status === "active" ? "inactive" : "active",
                              reason: changeReason,
                            }),
                          selectedOrganization.status === "active" ? "Organization deactivated" : "Organization reactivated"
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      {selectedOrganization.status === "active" ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <p className="font-medium text-sm">Add existing user</p>
                    <p className="text-muted-foreground text-xs">
                      Select an active lender user from the shared WorkOS directory who is not assigned to another Lender Organization.
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
                      existingUserOpen && selectedOrganization.status === "active"
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
                        onClick={() => void handleAddExistingUser()}
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
                    <p className="text-muted-foreground text-xs">One shared policy caps every assigned lender.</p>
                  </div>
                  <div className="grid gap-2">
                    {permissionEntries(permissionDraft).map(([key, label, enabled]) => (
                      <button
                        className="flex items-center justify-between border px-3 py-3 text-left text-sm hover:bg-muted/40"
                        key={key}
                        onClick={() => setPermissionDraft((current) => ({ ...current, [key]: !current[key] }))}
                        type="button"
                      >
                        <span>{label}</span>
                        <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Enabled" : "Off"}</Badge>
                      </button>
                    ))}
                  </div>
                  <Textarea onChange={(event) => setChangeReason(event.target.value)} value={changeReason} />
                  <Button
                    onClick={() =>
                      void run(
                        () =>
                          updatePermissions({
                            lenderOrganizationId: selectedOrganization.id,
                            permissions: permissionDraft,
                            reason: changeReason,
                          }),
                        "Workflow policy saved"
                      )
                    }
                    size="sm"
                  >
                    Save policy
                  </Button>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <p className="font-medium text-sm">Invite lender user</p>
                    <p className="text-muted-foreground text-xs">The invitation targets the shared WorkOS identity organization.</p>
                  </div>
                  <form className="space-y-3" onSubmit={(event) => void handleInvite(event)}>
                    <Label htmlFor="lender-invite-email">Work email</Label>
                    <Input id="lender-invite-email" onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="lender@example.com" type="email" value={inviteForm.email} />
                    <Select onValueChange={(value) => setInviteForm((current) => ({ ...current, roleSlug: value as (typeof LENDER_ROLES)[number] }))} value={inviteForm.roleSlug}>
                      <SelectTrigger aria-label="Lender role"><SelectValue /></SelectTrigger>
                      <SelectContent>{LENDER_ROLES.map((role) => <SelectItem key={role} value={role}>{formatRole(role)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="submit"><MailPlus />Send invitation</Button>
                  </form>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Assigned members</p>
                      <p className="text-muted-foreground text-xs">App assignment and WorkOS membership must both be active.</p>
                    </div>
                    <Button
                      onClick={() => void run(() => reconcileAssignments({ lenderOrganizationId: selectedOrganization.id }), "Organization assignments reconciled")}
                      size="sm"
                      variant="ghost"
                    >
                      <RefreshCw />
                      Reconcile
                    </Button>
                  </div>
                  <LenderOrganizationMembersTable
                    members={members?.members}
                    mode="management"
                    onDeactivate={async (member) => {
                      if (!member.membershipId) return;
                      await run(async () => {
                        await deactivateMembership({
                          lenderOrganizationId: selectedOrganization.id,
                          membershipId: member.membershipId!,
                          reason: changeReason,
                        });
                        await unassignLenderUser({
                          assignmentId: member.assignmentId,
                          reason: changeReason,
                        });
                      }, `${member.name} deactivated`);
                    }}
                    onRoleChange={async (member, roleSlug) => {
                      if (!member.membershipId) return;
                      await run(
                        () =>
                          updateMembershipRoles({
                            lenderOrganizationId: selectedOrganization.id,
                            membershipId: member.membershipId!,
                            reason: changeReason,
                            roleSlug,
                          }),
                        `${member.name} role updated`
                      );
                    }}
                    pendingInvitations={members?.pendingInvitations}
                  />
                </section>
              </>
            ) : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <Dialog onOpenChange={setProvisionOpen} open={provisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision lender organization</DialogTitle>
            <DialogDescription>Create an application organization under an existing Brokerage. No WorkOS organization will be created.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void handleProvision(event)}>
            <div className="space-y-2"><Label htmlFor="lender-display-name">Display name</Label><Input id="lender-display-name" onChange={(event) => setProvisionForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="Northstar Lending" value={provisionForm.displayName} /></div>
            <div className="space-y-2"><Label htmlFor="lender-legal-name">Legal name</Label><Input id="lender-legal-name" onChange={(event) => setProvisionForm((current) => ({ ...current, legalName: event.target.value }))} placeholder="Northstar Lending Corporation" value={provisionForm.legalName} /></div>
            <div className="space-y-2"><Label>Parent Brokerage</Label><Select onValueChange={(value) => setProvisionForm((current) => ({ ...current, brokerageId: value ? (value as Id<"brokerages">) : "" }))} value={provisionForm.brokerageId || undefined}><SelectTrigger><SelectValue placeholder="Choose a Brokerage" /></SelectTrigger><SelectContent>{(controlPlane?.brokerages ?? []).map((brokerage) => <SelectItem key={brokerage.id} value={brokerage.id}>{brokerage.displayName}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose><Button type="submit">Provision organization</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 p-5 sm:border-r last:sm:border-r-0"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div><div><p className="text-muted-foreground text-xs">{label}</p><p className="font-medium text-lg">{value}</p></div></div>;
}

function permissionEntries(permissions: Permissions) {
  return [
    ["proposalReview", "Proposal review", permissions.proposalReview],
    ["milestoneDecisions", "Milestone decisions", permissions.milestoneDecisions],
    ["drawDecisions", "Draw decisions", permissions.drawDecisions],
    ["siteVisitReview", "Site visit review", permissions.siteVisitReview],
  ] as const;
}

function formatRole(role: string) {
  return role.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function formatAssignableUserInputValue(user: UnassignedUser) {
  return `${user.name} · ${user.email}`;
}

function filterAssignableLenderUsers(
  users: UnassignedUser[],
  query: string
) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) {
    return users.slice(0, 50);
  }
  return users
    .filter((user) => {
      const haystack = `${user.name} ${user.email} ${user.roleSlugs.join(" ")}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 50);
}

function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : value.slice(0, 2)).toUpperCase();
}
