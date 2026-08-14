import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LockKeyhole } from "lucide-react";
import { useMemo, useState } from "react";
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
  WorkosUserRow,
} from "#/routes/backoffice/-user-management-types.ts";
import { api } from "../../../convex/_generated/api";

type LenderManagementProjection = FunctionReturnType<
  typeof api.workosProjection.getLenderOrganizationManagement
>;
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
  const management = useQuery(
    api.workosProjection.getLenderOrganizationManagement,
    {}
  );
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

  const directoryUsers = useMemo(
    () => toDirectoryUsers(management?.members ?? []),
    [management?.members]
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
  const operationMember =
    selectedDirectoryUser ??
    (operation === "invite" ? null : (directoryUsers[0] ?? null));
  const administrationContext = management
    ? management.summary.principalBrokers > 0
      ? "Admin · Principal Broker"
      : "Organization administrator"
    : "Loading access…";

  const executeOperation = async (
    request: LenderOrganizationOperationRequest
  ) => {
    if (!organization) {
      return;
    }
    setPending(true);
    setStatus(undefined);
    try {
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
        roleLabel: administrationContext,
        userName: "Organization administrator",
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
            activeMemberCount={management?.summary.active ?? 0}
            administrationContext={administrationContext}
            directoryUsers={directoryUsers}
            mode="production"
            onOpenOperation={(nextOperation) => {
              setStatus(undefined);
              setOperation(nextOperation);
            }}
            onOpenUser={setSelectedUserId}
            organizationName={organizationName}
            organizationsById={organizationsById}
            pending={management === undefined}
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
              activeMembershipCount={management?.summary.active ?? 0}
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
      {operation ? (
        <LenderOrganizationOperationDialog
          directoryUsers={directoryUsers}
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
  return members.map((member) => {
    const membership = member.membership;
    const fallbackId = membership._id as WorkosUserRow["_id"];
    const user = (member.user ?? {
      _creationTime: membership._creationTime,
      _id: fallbackId,
      authId: membership.workosUserId,
      email: member.email ?? `${membership.workosUserId}@unknown.invalid`,
      name: member.name ?? membership.workosUserId,
      roleSlugs: member.roleSlugs,
      roles: member.roleSlugs.join(", "),
      status: membership.status === "active" ? "active" : "deleted",
      workosUserId: membership.workosUserId,
    }) as WorkosUserRow;
    const displayName = member.name ?? member.email ?? membership.workosUserId;
    return {
      displayName,
      initials: initials(displayName),
      memberships: [membership],
      user: {
        ...user,
        roleSlugs: member.roleSlugs,
        roles: member.roleSlugs.join(", "),
      },
    };
  });
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
  return (
    error.message ||
    "The command failed. Try again after checking WorkOS status."
  );
}
