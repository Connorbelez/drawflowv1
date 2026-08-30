import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LenderShell } from "#/components/lender-shell.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  LenderMemberDeactivationControl,
  type LenderMemberDecisionPermissions,
  LenderMemberPermissionEditor,
} from "#/features/lender-organization-management/LenderMemberPermissionOperations.tsx";
import {
  LenderMemberAdministrationDetails,
  LenderOrganizationManagementVariantE,
} from "#/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx";
import {
  LenderOrganizationOperationDialog,
  type LenderOrganizationOperationRequest,
} from "#/features/lender-organization-management/LenderOrganizationOperationDialog.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";
import {
  type DirectoryUser,
  UserDetailSheet,
} from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";

import { api } from "../../../convex/_generated/api";

type LenderOrganizationView = FunctionReturnType<
  typeof api.lenderOrganizations.getCurrentLenderOrganization
>;
type LenderMemberPage = FunctionReturnType<
  typeof api.lenderOrganizations.listCurrentLenderOrganizationMembers
>;
type LenderMember = LenderMemberPage["page"][number];
type OrganizationPermissions = NonNullable<
  LenderOrganizationView["organization"]
>["permissions"];

const EMPTY_PROVISIONING = new Map<string, OrganizationProvisioning>();
const EMPTY_ROLE_OPTIONS = new Map<string, string[]>();
const WHITESPACE_PATTERN = /\s+/;

export const Route = createFileRoute("/lender/organization")({
  beforeLoad: ({ context, location }) =>
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "lender",
    }),
  component: LenderOrganization,
  errorComponent: LenderOrganizationError,
  staticData: {
    breadcrumb: { label: "Organization", to: "/lender/organization" },
  },
});

function LenderOrganizationError({ error, reset }: ErrorComponentProps) {
  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 p-4 pt-12 md:p-8">
        <Frame className="mx-auto max-w-2xl">
          <FramePanel className="p-8">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Lender organization
            </p>
            <h1 className="mt-3 font-heading font-semibold text-2xl">
              Organization access could not load
            </h1>
            <p className="mt-3 max-w-lg text-muted-foreground text-sm leading-6">
              DrawFlow could not resolve your application organization. No
              WorkOS directory data was exposed.
            </p>
            <Button className="mt-6" onClick={reset} variant="outline">
              Try again
            </Button>
            <p className="mt-4 text-muted-foreground text-xs">
              {error instanceof Error ? error.message : "Access check failed"}
            </p>
          </FramePanel>
        </Frame>
      </main>
    </LenderShell>
  );
}

function LenderOrganization() {
  const view = useQuery(
    api.lenderOrganizations.getCurrentLenderOrganization,
    {}
  ) as LenderOrganizationView | undefined;
  const memberPage = usePaginatedQuery(
    api.lenderOrganizations.listCurrentLenderOrganizationMembers,
    view?.organization ? {} : "skip",
    { initialNumItems: 25 }
  );
  const members = [...(memberPage.results as LenderMember[])].sort(
    (left, right) => left.name.localeCompare(right.name)
  );

  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 pb-20">
        {view === undefined ||
        (view.organization && memberPage.status === "LoadingFirstPage") ? (
          <OrganizationLoadingState />
        ) : view.organization === null ? (
          <UnassignedOrganizationState />
        ) : (
          <AssignedOrganizationState
            loadMore={() => memberPage.loadMore(25)}
            memberPageStatus={memberPage.status}
            members={members}
            view={view}
          />
        )}
      </main>
    </LenderShell>
  );
}

function OrganizationLoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      <div className="h-10 w-80 animate-pulse rounded bg-muted" />
      <Frame>
        <FramePanel className="h-48 animate-pulse bg-muted/40" />
      </Frame>
    </div>
  );
}

function UnassignedOrganizationState() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center p-4 md:p-8">
      <Frame className="w-full">
        <FramePanel className="p-8 md:p-12">
          <div className="max-w-xl">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </div>
            <p className="mt-8 text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Lender organization
            </p>
            <Empty className="items-start px-0 py-0 text-left">
              <EmptyTitle className="mt-2 font-heading text-3xl">
                Your DrawFlow organization is still being arranged.
              </EmptyTitle>
              <EmptyDescription className="max-w-lg text-left text-base leading-7">
                A DrawFlow admin needs to attach your lender account to an
                application organization before lender work can begin.
              </EmptyDescription>
            </Empty>
            <Button
              className="mt-8"
              render={
                <a href="mailto:support@fairlend.ca?subject=DrawFlow%20lender%20organization%20access">
                  <Mail />
                  Contact DrawFlow admin
                </a>
              }
            />
            <p className="mt-4 text-muted-foreground text-xs">
              No organization directory or membership details are available
              until the assignment is active.
            </p>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function AssignedOrganizationState({
  loadMore,
  memberPageStatus,
  members,
  view,
}: {
  loadMore: () => void;
  memberPageStatus:
    | "CanLoadMore"
    | "Exhausted"
    | "LoadingFirstPage"
    | "LoadingMore";
  members: LenderMember[];
  view: LenderOrganizationView;
}) {
  const organization = view.organization;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [deactivationPending, setDeactivationPending] = useState(false);
  const updatePermissions = useMutation(
    api.lenderOrganizations.updateLenderMemberDecisionPermissions
  );
  const deactivateMember = useAction(
    api.workosManagement.deactivateSharedLenderMembership
  );

  const directoryUsers = useMemo(
    () =>
      organization
        ? members.map((member) =>
            toDirectoryUser(member, organization.sharedWorkosOrganizationId)
          )
        : [],
    [members, organization]
  );
  const selectedMember =
    members.find((member) => member.workosUserId === selectedUserId) ?? null;
  const selectedDirectoryUser =
    directoryUsers.find(
      (member) => member.user.workosUserId === selectedUserId
    ) ?? null;
  const organizationsById = useMemo(() => {
    if (!organization) {
      return new Map<string, WorkosOrganizationRow>();
    }
    return new Map<string, WorkosOrganizationRow>([
      [
        organization.sharedWorkosOrganizationId,
        {
          name: organization.displayName,
          status: "active",
          workosOrganizationId: organization.sharedWorkosOrganizationId,
        },
      ],
    ]);
  }, [organization]);

  if (!organization) {
    return null;
  }

  const organizationCap: LenderMemberDecisionPermissions = {
    proposalReview: organization.permissions.proposalReview,
    milestoneDecisions: organization.permissions.milestoneDecisions,
    drawDecisions: organization.permissions.drawDecisions,
  };

  const savePermissions = async (input: {
    expectedVersion: number;
    permissions: LenderMemberDecisionPermissions;
    reason: string;
  }) => {
    if (!selectedMember) {
      return;
    }
    setPermissionPending(true);
    try {
      await updatePermissions({
        assignmentId: selectedMember.assignmentId,
        ...input,
      });
      toast.success(`${selectedMember.name} permissions updated`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Permission update failed. Refresh the member and try again."
      );
    } finally {
      setPermissionPending(false);
    }
  };

  const executeDeactivation = async (
    request: LenderOrganizationOperationRequest
  ) => {
    if (!selectedMember || request.kind !== "deactivate") {
      throw new Error("Choose an active lender member before deactivation");
    }
    setDeactivationPending(true);
    try {
      await deactivateMember({
        assignmentId: selectedMember.assignmentId,
        idempotencyKey: `lender-member-deactivate:${selectedMember.assignmentId}`,
        reason: request.reason,
      });
      setDeactivationOpen(false);
      toast.success(
        `${selectedMember.name} authority suspended; waiting for WorkOS reconciliation`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Deactivation failed"
      );
      throw error;
    } finally {
      setDeactivationPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="max-w-3xl">
        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
          Application organization
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading font-semibold text-3xl tracking-tight">
              {organization.displayName}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              Your DrawFlow lender organization, governed by{" "}
              {organization.brokerageName}.
            </p>
          </div>
          <Badge variant="outline">Active</Badge>
        </div>
      </header>

      <OrganizationPolicy permissions={organization.permissions} />

      <LenderOrganizationManagementVariantE
        activeMemberCount={members.length}
        administrationContext={
          view.currentUser.canManageMembers
            ? "Lender Admin permission operator"
            : "Read-only member directory"
        }
        description={
          view.currentUser.canManageMembers
            ? "Set member decision authority and deactivate lender access without changing WorkOS roles or the organization policy."
            : "Inspect assigned members and their effective decision permissions. Lender Admin access is required for changes."
        }
        directoryUsers={directoryUsers}
        headingLevel={2}
        mode="production"
        moreMembersAvailable={memberPageStatus === "CanLoadMore"}
        onLoadMoreMembers={loadMore}
        onOpenOperation={() => undefined}
        onOpenUser={setSelectedUserId}
        organizationName={organization.displayName}
        organizationsById={organizationsById}
        pending={memberPageStatus === "LoadingMore"}
        pendingMoreMembers={memberPageStatus === "LoadingMore"}
        provisioningByOrg={EMPTY_PROVISIONING}
        showInviteAction={false}
      />

      <UserDetailSheet
        directoryUser={selectedDirectoryUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
            setDeactivationOpen(false);
          }
        }}
        organizationsById={organizationsById}
        provisioningByOrg={EMPTY_PROVISIONING}
        readOnly
        readOnlyBadgeLabel={
          view.currentUser.canManageMembers
            ? "Permission operator"
            : "Read only"
        }
        readOnlySupplement={
          selectedDirectoryUser && selectedMember ? (
            <LenderMemberAdministrationDetails
              accessSupplement={
                <LenderMemberPermissionEditor
                  assigned={selectedMember.decisionPermissions}
                  canManage={view.currentUser.canManageMembers}
                  memberName={selectedMember.name}
                  onSave={savePermissions}
                  organizationCap={organizationCap}
                  pending={permissionPending}
                  version={selectedMember.decisionPermissionsVersion}
                />
              }
              activeMembershipCount={members.length}
              administrationSupplement={
                <LenderMemberDeactivationControl
                  disabledReason={selectedMember.deactivationDisabledReason}
                  error={selectedMember.deactivation?.error}
                  onDeactivate={() => setDeactivationOpen(true)}
                  pendingReconciliation={
                    selectedMember.deactivation?.state === "accepted"
                  }
                />
              }
              member={selectedDirectoryUser}
              mode="production"
              onOpenOperation={() => undefined}
              organizationName={organization.displayName}
              showAdministrationActions={false}
              showAdministrationTab={view.currentUser.canManageMembers}
              showReviewRelationship={false}
              showTransfer={false}
            />
          ) : undefined
        }
        roleOptionsByOrganization={EMPTY_ROLE_OPTIONS}
        workspaceOrganizations={[...organizationsById.values()]}
      />

      {deactivationOpen && selectedDirectoryUser && selectedMember ? (
        <LenderOrganizationOperationDialog
          directoryUsers={directoryUsers}
          member={selectedDirectoryUser}
          onExecute={executeDeactivation}
          onOpenChange={setDeactivationOpen}
          operation="deactivate"
          organizationName={organization.displayName}
          pending={deactivationPending}
        />
      ) : null}
    </div>
  );
}

function OrganizationPolicy({
  permissions,
}: {
  permissions: OrganizationPermissions;
}) {
  return (
    <section aria-labelledby="workflow-access-heading">
      <Frame>
        <FramePanel className="p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                Organization policy
              </p>
              <h2
                className="mt-2 font-heading font-semibold text-xl"
                id="workflow-access-heading"
              >
                Shared workflow access
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                DrawFlow Back Office owns this organization-wide cap. Member
                grants below can only reduce this access.
              </p>
            </div>
            <Badge variant="secondary">Read only</Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <PermissionRow
              enabled={permissions.proposalReview}
              label="Proposal review"
            />
            <PermissionRow
              enabled={permissions.milestoneDecisions}
              label="Milestone decisions"
            />
            <PermissionRow
              enabled={permissions.drawDecisions}
              label="Draw decisions"
            />
            <PermissionRow
              enabled={permissions.siteVisitReview}
              label="Site visit review"
            />
          </div>
        </FramePanel>
      </Frame>
    </section>
  );
}

function PermissionRow({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border p-4">
      <span className="text-sm">{label}</span>
      <Badge variant={enabled ? "default" : "outline"}>
        {enabled ? "Enabled" : "Not enabled"}
      </Badge>
    </div>
  );
}

function toDirectoryUser(
  member: LenderMember,
  sharedWorkosOrganizationId: string
): DirectoryUser {
  return {
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
  };
}

function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(WHITESPACE_PATTERN).filter(Boolean);
  return parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
}
