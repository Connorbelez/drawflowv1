import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LenderShell } from "#/components/lender-shell.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  LenderMemberAdministrationDetails,
  LenderOrganizationManagementVariantE,
  type LenderOrganizationOperation,
} from "#/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx";
import {
  LenderOrganizationOperationDialog,
  type LenderOrganizationOperationRequest,
} from "#/features/lender-organization-management/LenderOrganizationOperationDialog.tsx";
import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";
import {
  type DirectoryUser,
  UserDetailSheet,
} from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";
import { api } from "../../../convex/_generated/api";

type LenderManagementProjection = FunctionReturnType<
  typeof api.workosProjection.getLenderOrganizationManagement
>;
type LenderManagementMember = LenderManagementProjection["members"][number];
interface LenderDirectoryState {
  members: LenderManagementMember[];
  projection: LenderManagementProjection;
}
const WHITESPACE_PATTERN = /\s+/;
const AUTHORIZATION_ERROR_PATTERN = /forbidden|unauthorized/i;

export const Route = createFileRoute("/lender/organization")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "lender",
    }),
  component: LenderOrganization,
  errorComponent: LenderOrganizationError,
  staticData: {
    breadcrumb: {
      label: "Organization",
      to: "/lender/organization",
    },
  },
});

function LenderOrganizationError({ error, reset }: ErrorComponentProps) {
  const forbidden = AUTHORIZATION_ERROR_PATTERN.test(
    error instanceof Error ? error.message : String(error)
  );
  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="flex min-h-[calc(100vh-3.5rem)] items-start justify-center bg-muted/30 p-4 pt-16 md:p-6 md:pt-24">
        <Frame className="w-full max-w-xl">
          <FramePanel className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <LockKeyhole className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  {forbidden ? "Access restricted" : "Organization unavailable"}
                </p>
                <h1 className="mt-2 font-heading font-semibold text-xl">
                  {forbidden
                    ? "You cannot manage this lender organization."
                    : "Organization management could not load."}
                </h1>
                <p className="mt-2 text-muted-foreground text-sm leading-6">
                  {forbidden
                    ? "Use an active organization membership with Admin or Principal Broker access. No organization data was exposed."
                    : "The canonical WorkOS projection is temporarily unavailable. No membership command was submitted."}
                </p>
                <Button className="mt-5" onClick={reset} variant="outline">
                  Try again
                </Button>
              </div>
            </div>
          </FramePanel>
        </Frame>
      </main>
    </LenderShell>
  );
}

function LenderOrganization() {
  const routeContext = Route.useRouteContext();
  const [directoryCursor, setDirectoryCursor] = useState<string | null>(null);
  const managementPage = useQuery(
    api.workosProjection.getLenderOrganizationManagement,
    { cursor: directoryCursor }
  );
  const [directoryState, setDirectoryState] =
    useState<LenderDirectoryState | null>(null);
  const inviteUser = useAction(api.workosManagement.inviteUser);
  const updateMembershipRoles = useAction(
    api.workosManagement.updateMembershipRoles
  );
  const deactivateMembership = useAction(
    api.workosManagement.deactivateMembership
  );
  const transferPrincipalBroker = useAction(
    api.workosManagement.transferPrincipalBroker
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [operation, setOperation] =
    useState<LenderOrganizationOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();

  useEffect(() => {
    if (!managementPage) {
      return;
    }
    setDirectoryState((current) =>
      mergeDirectoryPage(current, managementPage, directoryCursor)
    );
  }, [directoryCursor, managementPage]);

  const management = managementPage ?? directoryState?.projection;
  const projectedMembers =
    directoryState?.members ?? managementPage?.members ?? [];

  const directoryUsers = useMemo(
    () => toDirectoryUsers(projectedMembers),
    [projectedMembers]
  );
  const organization = management?.organization as
    | (WorkosOrganizationRow & { brokerageId?: string })
    | undefined;
  const organizationName = organization?.name ?? "Loading organization…";
  const organizationsById = useMemo(
    () =>
      organization
        ? new Map([[organization.workosOrganizationId, organization]])
        : new Map<string, WorkosOrganizationRow>(),
    [organization]
  );
  const provisioningByOrg = useMemo(
    // Phase 1 owns WorkOS membership operations only. Brokerage and Builder
    // provisioning remain Back Office-owned and are intentionally not exposed
    // by the active-organization projection.
    () => new Map<string, OrganizationProvisioning>(),
    []
  );
  const roleOptionsByOrganization = useMemo(
    () =>
      organization
        ? new Map([
            [
              organization.workosOrganizationId,
              ["admin", "principle-broker", "broker", "broker-staff"],
            ],
          ])
        : new Map<string, string[]>(),
    [organization]
  );
  const selectedDirectoryUser =
    directoryUsers.find(
      (entry) => entry.user.workosUserId === selectedUserId
    ) ?? null;
  const operationMember = operation === "invite" ? null : selectedDirectoryUser;
  const { activeMemberCount, principalBrokerCount } =
    summarizeDirectoryUsers(directoryUsers);
  const administrationContext = getAdministrationContext(
    Boolean(management),
    principalBrokerCount
  );

  const executeOperation = async (
    request: LenderOrganizationOperationRequest
  ) => {
    if (!organization) {
      return;
    }
    setPending(true);
    setStatus(undefined);
    try {
      requireSelectedOperationMembership(request, operationMember);
      let result:
        | Awaited<ReturnType<typeof inviteUser>>
        | Awaited<ReturnType<typeof updateMembershipRoles>>
        | Awaited<ReturnType<typeof deactivateMembership>>
        | Awaited<ReturnType<typeof transferPrincipalBroker>>;
      if (request.kind === "invite") {
        result = await inviteUser({
          email: request.email,
          organizationId: organization.workosOrganizationId,
          roleSlug: request.roleSlug,
        });
      } else if (request.kind === "change-access") {
        result = await updateMembershipRoles({
          membershipId: request.membershipId,
          primaryRoleSlug: request.roleSlugs[0],
          roleSlugs: request.roleSlugs,
        });
      } else if (request.kind === "deactivate") {
        result = await deactivateMembership({
          membershipId: request.membershipId,
          reason: request.reason,
        });
      } else {
        result = await transferPrincipalBroker(request);
      }
      if (result.status === "transfer-required") {
        setStatus({
          kind: "error",
          message:
            "Principal Broker protection blocked this command. Use Transfer Principal Broker control.",
        });
        return;
      }
      setStatus({
        kind: "success",
        message:
          result.status === "accepted"
            ? "Command accepted. Access updates after the canonical WorkOS projection reconciles."
            : `Command state: ${result.status}. Review the protected workflow before retrying.`,
      });
      setOperation(null);
      setDirectoryCursor(null);
      setDirectoryState(null);
    } catch (error) {
      setStatus({
        kind: "error",
        message: getSafeErrorMessage(error),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <LenderShell
      activeNavigation="Organization"
      identity={{
        avatarFallback: initials(organizationName),
        organizationName,
        roleLabel: formatViewerRoles(routeContext.role, routeContext.roles),
        userName: routeContext.userName?.trim() || "Signed-in user",
      }}
      pageTitle="Organization"
    >
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-20">
        <div className="mx-auto min-w-0 max-w-[1440px] space-y-4 p-4 md:p-6">
          <div aria-atomic="true" aria-live="polite">
            {status ? (
              <Alert
                variant={status.kind === "error" ? "destructive" : "default"}
              >
                <AlertTitle>
                  {status.kind === "error"
                    ? "Command not completed"
                    : "Command accepted"}
                </AlertTitle>
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <LenderOrganizationManagementVariantE
            activeMemberCount={activeMemberCount}
            administrationContext={administrationContext}
            directoryUsers={directoryUsers}
            mode="production"
            moreMembersAvailable={Boolean(management && !management.isDone)}
            onLoadMoreMembers={() => {
              if (management && !management.isDone) {
                setDirectoryCursor(management.continueCursor);
              }
            }}
            onOpenOperation={(nextOperation) => {
              setStatus(undefined);
              setOperation(nextOperation);
            }}
            onOpenUser={setSelectedUserId}
            organizationName={organizationName}
            organizationsById={organizationsById}
            pending={management === undefined}
            pendingMoreMembers={
              directoryCursor !== null && managementPage === undefined
            }
            provisioningByOrg={provisioningByOrg}
          />
        </div>
      </main>
      <UserDetailSheet
        directoryUser={selectedDirectoryUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        organizationsById={organizationsById}
        provisioningByOrg={provisioningByOrg}
        readOnly
        readOnlyBadgeLabel="WorkOS managed"
        readOnlySupplement={
          selectedDirectoryUser ? (
            <LenderMemberAdministrationDetails
              activeMembershipCount={activeMemberCount}
              historyCount={management?.history.length ?? 0}
              member={selectedDirectoryUser}
              mode="production"
              onOpenOperation={(nextOperation) => {
                setStatus(undefined);
                setOperation(nextOperation);
              }}
              organizationName={organizationName}
            />
          ) : null
        }
        roleOptionsByOrganization={roleOptionsByOrganization}
        workspaceOrganizations={organization ? [organization] : []}
      />
      {operation && (operation === "invite" || operationMember) ? (
        <LenderOrganizationOperationDialog
          directoryUsers={directoryUsers}
          key={`${operation}:${operationMember?.memberships[0]?.workosMembershipId ?? "organization"}`}
          member={operationMember}
          onExecute={executeOperation}
          onOpenChange={(open) => {
            if (!(open || pending)) {
              setOperation(null);
            }
          }}
          operation={operation}
          organizationName={organizationName}
          pending={pending}
        />
      ) : null}
    </LenderShell>
  );
}

function toDirectoryUsers(
  members: LenderManagementProjection["members"]
): DirectoryUser[] {
  const directoryUsersByWorkosUserId = new Map<string, DirectoryUser>();
  for (const member of members) {
    const membership = member.membership;
    const user = (member.user ?? {
      authId: membership.workosUserId,
      email: member.email ?? `${membership.workosUserId}@unknown.invalid`,
      name: member.name ?? membership.workosUserId,
      roleSlugs: member.roleSlugs,
      roles: member.roleSlugs.join(", "),
      status: membership.status === "deleted" ? "deleted" : "active",
      workosUserId: membership.workosUserId,
    }) as DirectoryUser["user"];
    const displayName = member.name ?? member.email ?? membership.workosUserId;
    const current = directoryUsersByWorkosUserId.get(membership.workosUserId);
    if (current) {
      current.memberships.push(membership);
      current.user.roleSlugs = [
        ...new Set([...(current.user.roleSlugs ?? []), ...member.roleSlugs]),
      ];
      current.user.roles = current.user.roleSlugs.join(", ");
      continue;
    }
    directoryUsersByWorkosUserId.set(membership.workosUserId, {
      displayName,
      initials: initials(displayName),
      memberships: [membership],
      user: {
        ...user,
        roleSlugs: member.roleSlugs,
        roles: member.roleSlugs.join(", "),
      },
    });
  }
  return [...directoryUsersByWorkosUserId.values()];
}

function mergeDirectoryPage(
  current: LenderDirectoryState | null,
  page: LenderManagementProjection,
  cursor: string | null
): LenderDirectoryState {
  const sameOrganization =
    current?.projection.organization.workosOrganizationId ===
    page.organization.workosOrganizationId;
  if (!(sameOrganization && cursor && current)) {
    return { members: page.members, projection: page };
  }
  const membersById = new Map(
    current.members.map((member) => [
      member.membership.workosMembershipId,
      member,
    ])
  );
  for (const member of page.members) {
    membersById.set(member.membership.workosMembershipId, member);
  }
  return { members: [...membersById.values()], projection: page };
}

function summarizeDirectoryUsers(directoryUsers: DirectoryUser[]) {
  let activeMemberCount = 0;
  let principalBrokerCount = 0;
  for (const entry of directoryUsers) {
    const activeMembership = entry.memberships.find(
      (membership) => membership.status === "active"
    );
    if (!activeMembership) {
      continue;
    }
    activeMemberCount += 1;
    if ((activeMembership.roleSlugs ?? []).includes("principle-broker")) {
      principalBrokerCount += 1;
    }
  }
  return { activeMemberCount, principalBrokerCount };
}

function requireSelectedOperationMembership(
  request: LenderOrganizationOperationRequest,
  selectedMember: DirectoryUser | null
) {
  if (request.kind === "invite") {
    return;
  }
  const selectedMembershipId =
    selectedMember?.memberships[0]?.workosMembershipId;
  const requestedMembershipId =
    request.kind === "transfer-principal"
      ? request.sourceMembershipId
      : request.membershipId;
  if (
    !(selectedMembershipId && selectedMembershipId === requestedMembershipId)
  ) {
    throw new Error("Selected membership is unavailable");
  }
}

function getAdministrationContext(
  loaded: boolean,
  principalBrokerCount: number
) {
  if (!loaded) {
    return "Loading access…";
  }
  return principalBrokerCount > 0
    ? "Admin · Principal Broker"
    : "Organization administrator";
}

function formatViewerRoles(role?: string | null, roles: string[] = []) {
  const normalized = [role, ...roles]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());
  const labels = [...new Set(normalized)].map((value) => {
    if (value === "principle-broker" || value === "principal-broker") {
      return "Principal Broker";
    }
    return value
      .split("-")
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" ");
  });
  return labels.join(" · ") || "Organization member";
}

function initials(value: string) {
  return (
    value
      .split(WHITESPACE_PATTERN)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LO"
  );
}

function getSafeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "The command failed. No projection state was changed optimistically.";
  }
  if (AUTHORIZATION_ERROR_PATTERN.test(error.message)) {
    return "You are not authorized to manage this organization membership.";
  }
  console.error("Lender organization command failed", error);
  return "The command failed. Try again after checking WorkOS status.";
}
