import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import {
  LenderMemberAdministrationDetails as ApprovedMemberAdministrationDetails,
  LenderOrganizationManagementVariantE as ApprovedVariantE,
} from "../features/lender-organization-management/LenderOrganizationManagementVariantE";
import { UserDetailSheet } from "./backoffice/-user-management-detail-sheet";
import {
  evidenceSources,
  isPrototypeVariant,
  organization,
  organizationMembers,
  prototypeDirectoryUsers,
  prototypeOrganizationsById,
  prototypeProvisioningByOrg,
  prototypeRoleOptionsByOrganization,
  prototypeWorkosOrganization,
  prototypeVariants,
  roleDefinitions,
  type PrototypeOperation,
  type PrototypeSearch,
  type RoleContext,
} from "./-lender-organization-management-contracts";
import { PrototypeOperationDialog } from "./-lender-organization-management-operations";
import { EvidencePanel, PrototypeNotice } from "./-lender-organization-management-shared";
import {
  VariantA,
  VariantB,
  VariantC,
  VariantD,
} from "./-lender-organization-management-variants";

export const Route = createFileRoute(
  "/lender/organization-management-prototype"
)({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  component: LenderOrganizationManagementPrototype,
});

function LenderOrganizationManagementPrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<string>(
    organizationMembers[0]?.email ?? ""
  );
  const [roleContext, setRoleContext] = useState<"all" | RoleContext>("all");
  const [selectedDirectoryUserId, setSelectedDirectoryUserId] = useState<
    string | null
  >(null);
  const [prototypeOperation, setPrototypeOperation] =
    useState<PrototypeOperation | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return organizationMembers;
    }
    return organizationMembers.filter((member) =>
      [member.name, member.email, ...member.roleLabels, ...member.roleSlugs]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query]);

  const filteredRoles = useMemo(
    () =>
      roleContext === "all"
        ? roleDefinitions
        : roleDefinitions.filter((role) => role.context === roleContext),
    [roleContext]
  );

  const currentMember =
    organizationMembers.find((member) => member.email === selectedMember) ??
    organizationMembers[0];
  const selectedDirectoryUser =
    variant === "E"
      ? (prototypeDirectoryUsers.find(
          (entry) => entry.user.workosUserId === selectedDirectoryUserId
        ) ?? null)
      : null;

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }
    navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/organization-management-prototype",
    });
  };

  const sharedProps = {
    currentMember,
    filteredMembers,
    filteredRoles,
    onQueryChange: setQuery,
    onRoleContextChange: setRoleContext,
    onSelectMember: setSelectedMember,
    query,
    roleContext,
  } as const;

  return (
    <LenderPrototypeShell
      activeNavigation="Organization"
      identity={{
        avatarFallback: "FP",
        organizationName: organization.name,
        roleLabel: "Admin · Principal Broker",
        userName: "FairLend Principal Broker",
      }}
      pageTitle="Organization management prototype"
    >
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <PrototypeNotice
          onShowEvidence={() => setShowEvidence((open) => !open)}
        />
        {showEvidence ? <EvidencePanel evidenceSources={evidenceSources} /> : null}
        <main className="mx-auto min-w-0 max-w-[1440px] p-4 md:p-6">
          {variant === "A" ? <VariantA {...sharedProps} /> : null}
          {variant === "B" ? <VariantB {...sharedProps} /> : null}
          {variant === "C" ? <VariantC {...sharedProps} /> : null}
          {variant === "D" ? <VariantD {...sharedProps} /> : null}
          {variant === "E" ? (
            <ApprovedVariantE
              activeMemberCount={prototypeDirectoryUsers.length}
              administrationContext="Admin · Principal Broker"
              directoryUsers={prototypeDirectoryUsers}
              mode="prototype"
              onOpenOperation={(operation) => {
                if (operation !== "transfer-principal") {
                  setPrototypeOperation(operation);
                }
              }}
              onOpenUser={setSelectedDirectoryUserId}
              organizationName={organization.name}
              organizationsById={prototypeOrganizationsById}
              pending={false}
              provisioningByOrg={prototypeProvisioningByOrg}
            />
          ) : null}
        </main>
      </div>
      <UserDetailSheet
        directoryUser={selectedDirectoryUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDirectoryUserId(null);
          }
        }}
        organizationsById={prototypeOrganizationsById}
        provisioningByOrg={prototypeProvisioningByOrg}
        readOnly
        readOnlyBadgeLabel="Operations prototype"
        readOnlySupplement={
          selectedDirectoryUser ? (
            <ApprovedMemberAdministrationDetails
              activeMembershipCount={prototypeDirectoryUsers.length}
              historyCount={0}
              member={selectedDirectoryUser}
              mode="prototype"
              onOpenOperation={(operation) => {
                if (operation !== "transfer-principal") {
                  setPrototypeOperation(operation);
                }
              }}
              organizationName={organization.name}
              showTransfer={false}
            />
          ) : null
        }
        roleOptionsByOrganization={prototypeRoleOptionsByOrganization}
        workspaceOrganizations={[prototypeWorkosOrganization]}
      />
      {prototypeOperation ? (
        <PrototypeOperationDialog
          member={selectedDirectoryUser ?? prototypeDirectoryUsers[0]}
          onOpenChange={(open) => {
            if (!open) {
              setPrototypeOperation(null);
            }
          }}
          operation={prototypeOperation}
        />
      ) : null}
      {selectedDirectoryUser || prototypeOperation ? null : (
        <PrototypeVariantSwitcher
          current={variant}
          onChange={selectVariant}
          variants={prototypeVariants}
        />
      )}
    </LenderPrototypeShell>
  );
}
