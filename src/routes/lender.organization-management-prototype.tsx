import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileLock2,
  Filter,
  History,
  Landmark,
  ListFilter,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  UserRoundCog,
  Users,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Frame, FramePanel } from "../components/ui/frame";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Separator } from "../components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";
import {
  type DirectoryUser,
  UserDetailSheet,
} from "./backoffice/-user-management-detail-sheet";
import { UserManagementDirectoryTable } from "./backoffice/-user-management-surface";
import type {
  OrganizationProvisioning,
  WorkosMembershipRow,
  WorkosOrganizationRow,
} from "./backoffice/-user-management-types";

// PROTOTYPE ONLY: five throwaway structures for Lender Organization Management,
// switchable with ?variant=A|B|C|D|E. Variant E stages operations in memory;
// no prototype interaction persists or calls WorkOS.
const prototypeVariants = [
  { key: "A", label: "Directory ledger" },
  { key: "B", label: "Role atlas" },
  { key: "C", label: "Quorum bridge" },
  { key: "D", label: "Administration brief" },
  { key: "E", label: "Shared user management" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];
type PrototypeOperation = "invite" | "change-access" | "deactivate";
type RoleContext = "administration" | "operations";

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

interface OrganizationMember {
  email: string;
  initials: string;
  name: string;
  roleLabels: readonly string[];
  roleSlugs: readonly string[];
  status: "active";
}

interface RoleDefinition {
  context: RoleContext;
  label: string;
  slug: "admin" | "principle-broker" | "broker" | "broker-staff";
  summary: string;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute(
  "/lender/organization-management-prototype"
)({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  component: LenderOrganizationManagementPrototype,
});

const organization = {
  name: "FairLendBrokerage",
  sourceLabel: "WorkOS read projection · visual fixture",
  status: "Active",
} as const;

const organizationMembers: readonly OrganizationMember[] = [
  {
    email: "principal@fairlend.local",
    initials: "FP",
    name: "FairLend Principal Broker",
    roleLabels: ["Admin", "Principal Broker"],
    roleSlugs: ["admin", "principle-broker"],
    status: "active",
  },
] as const;

const prototypeWorkosOrganization: WorkosOrganizationRow = {
  name: "FairLendBrokerage",
  status: "active",
  workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
};

const prototypeWorkosMembership: WorkosMembershipRow = {
  roleSlug: "admin",
  roleSlugs: ["admin", "principle-broker"],
  status: "active",
  workosMembershipId: "om_visual_principal",
  workosOrganizationId: prototypeWorkosOrganization.workosOrganizationId,
  workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
};

const prototypeDirectoryUsers: DirectoryUser[] = [
  {
    displayName: "FairLend Principal Broker",
    initials: "FP",
    memberships: [prototypeWorkosMembership],
    user: {
      _creationTime: 0,
      _id: "user_visual_principal" as never,
      authId: "user_01KR207FRFHQT46EV9N538XBF3",
      email: "principal@fairlend.local",
      name: "FairLend Principal Broker",
      roleSlugs: ["admin", "principle-broker"],
      roles: "admin, principle-broker",
      status: "active",
      workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
    },
  },
];

const prototypeOrganizationsById = new Map([
  [
    prototypeWorkosOrganization.workosOrganizationId,
    prototypeWorkosOrganization,
  ],
]);

const prototypeProvisioningByOrg = new Map<string, OrganizationProvisioning>([
  [
    prototypeWorkosOrganization.workosOrganizationId,
    {
      brokerage: {
        _id: "brokerage_visual_fairlend",
        displayName: "FairLendBrokerage",
        legalName: "FairLendBrokerage",
        principalBrokerWorkosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
        status: "active",
      },
      brokerMemberships: [
        {
          email: "principal@fairlend.local",
          name: "FairLend Principal Broker",
          roleSlugs: ["admin", "principle-broker"],
          workosMembershipId: "om_visual_principal",
          workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
        },
      ],
      builderAccountLinks: [],
      builderMemberships: [],
      builderProfile: null,
      hasBrokerageProfile: true,
      hasBuilderProfile: false,
      name: "FairLendBrokerage",
      needsBrokerageProfile: false,
      needsBuilderProfile: false,
      status: "active",
      workosOrganizationId: prototypeWorkosOrganization.workosOrganizationId,
    },
  ],
]);

const prototypeRoleOptionsByOrganization = new Map([
  [
    prototypeWorkosOrganization.workosOrganizationId,
    ["admin", "principle-broker", "broker", "broker-staff"],
  ],
]);

const roleDefinitions: readonly RoleDefinition[] = [
  {
    context: "administration",
    label: "Admin",
    slug: "admin",
    summary: "Canonical user-management write capability",
  },
  {
    context: "administration",
    label: "Principal Broker",
    slug: "principle-broker",
    summary: "Organization owner and brokerage administration",
  },
  {
    context: "operations",
    label: "Broker",
    slug: "broker",
    summary: "Assigned portfolio and non-destructive operations",
  },
  {
    context: "operations",
    label: "Broker Staff",
    slug: "broker-staff",
    summary: "Back Office operations within granted scope",
  },
] as const;

const evidenceSources = [
  {
    key: "E1",
    label: "WorkOS ownership and recognized role slugs",
    path: "docs/auth-rbac-foundation.md · Source of truth, Role Slugs, User Management",
  },
  {
    key: "E2",
    label: "Organization owner, permissions, and policy boundary",
    path: "docs/draw_flow_production_prd.md · §§4.2, 6.1–6.3, 7.2, 8.2, 11",
  },
  {
    key: "E3",
    label: "Organization-scoped read projection",
    path: "convex/workosProjection.ts · listUserManagement",
  },
  {
    key: "E4",
    label: "Displayed organization and active member fixture",
    path: "src/routes/backoffice/user-management.tsx · userManagementVisualFixture",
  },
  {
    key: "E5",
    label: "Back Office and lender quorum relationship",
    path: "src/components/prototypes/README.md · Proposal Review and Lender Draw Queue",
  },
  {
    key: "E6",
    label: "Representative review requirement",
    path: "src/routes/lender.proposal-confirmation-prototype.tsx · policyFacts",
  },
  {
    key: "E7",
    label: "Canonical role labels and user-management capability",
    path: "src/lib/auth/rbac.ts · ROLE_SLUGS and USER_MANAGEMENT_WRITE_ROLE_SLUGS",
  },
  {
    key: "E8",
    label: "Brokerage management surface and protected owner workflow",
    path: "docs/draw_flow_production_prd.md · §§3.3–3.4, 4.2–4.4, 9.2",
  },
  {
    key: "E9",
    label: "Transferred lender organization administration requirements",
    path: "docs/lender_portal_mvp_feature_brief.md · Confirmed MVP scope §1 and Organization/access acceptance criteria · transferred source not present in this checkout",
  },
] as const;

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
        {showEvidence ? <EvidencePanel /> : null}
        <main className="mx-auto min-w-0 max-w-[1440px] p-4 md:p-6">
          {variant === "A" ? <VariantA {...sharedProps} /> : null}
          {variant === "B" ? <VariantB {...sharedProps} /> : null}
          {variant === "C" ? <VariantC {...sharedProps} /> : null}
          {variant === "D" ? <VariantD {...sharedProps} /> : null}
          {variant === "E" ? (
            <VariantE
              onOpenOperation={setPrototypeOperation}
              onOpenUser={setSelectedDirectoryUserId}
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
            <MemberAdministrationDetails
              member={selectedDirectoryUser}
              onOpenOperation={setPrototypeOperation}
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

interface VariantProps {
  currentMember: OrganizationMember | undefined;
  filteredMembers: readonly OrganizationMember[];
  filteredRoles: readonly RoleDefinition[];
  onQueryChange: (query: string) => void;
  onRoleContextChange: (context: "all" | RoleContext) => void;
  onSelectMember: (email: string) => void;
  query: string;
  roleContext: "all" | RoleContext;
}

function VariantA({
  currentMember,
  filteredMembers,
  onQueryChange,
  onSelectMember,
  query,
}: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A dense organization ledger with the selected membership explained in a fixed context rail."
        eyebrow="Variant A · Directory ledger"
        title="Organization directory"
      />
      <OrganizationSummaryStrip />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Frame>
          <FramePanel className="p-0">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-sm">Active memberships</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Exact rows from the Back Office visual fixture · E3, E4
                </p>
              </div>
              <SearchField onChange={onQueryChange} query={query} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>WorkOS roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow
                    className="cursor-pointer"
                    key={member.email}
                    onClick={() => onSelectMember(member.email)}
                  >
                    <TableCell>
                      <MemberIdentity member={member} />
                    </TableCell>
                    <TableCell>
                      <RoleBadges roles={member.roleLabels} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Active</Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredMembers.length === 0 ? <EmptySearch /> : null}
          </FramePanel>
        </Frame>
        <MemberContextRail member={currentMember} />
      </div>
    </div>
  );
}

function VariantB({
  filteredRoles,
  onRoleContextChange,
  roleContext,
}: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A role-first atlas that separates organization administration from operating access."
        eyebrow="Variant B · Role atlas"
        title="Who operates this organization?"
      />
      <Frame>
        <FramePanel className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <OrganizationIdentity />
            <RoleContextFilter
              onChange={onRoleContextChange}
              value={roleContext}
            />
          </div>
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Verified active member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizationMembers.map((member) => (
              <div className="space-y-3" key={member.email}>
                <MemberIdentity member={member} />
                <RoleBadges roles={member.roleLabels} />
                <Separator />
                <BoundaryNote
                  icon={Database}
                  text="This membership is a WorkOS projection. This prototype does not edit it."
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <Frame>
          <FramePanel className="p-0">
            <div className="grid border-b px-5 py-3 text-muted-foreground text-xs md:grid-cols-[10rem_12rem_minmax(0,1fr)]">
              <span>Context</span>
              <span>Canonical role</span>
              <span>Meaning here</span>
            </div>
            <div className="divide-y">
              {filteredRoles.map((role) => (
                <div
                  className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_12rem_minmax(0,1fr)] md:items-center"
                  key={role.slug}
                >
                  <Badge className="w-fit" variant="outline">
                    {role.context === "administration"
                      ? "Administration"
                      : "Operations"}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{role.label}</p>
                    <p className="font-mono text-muted-foreground text-xs">
                      {role.slug}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-sm leading-6">
                    {role.summary}
                  </p>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </div>
      <UnresolvedManagerNote />
    </div>
  );
}

function VariantC({ currentMember }: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A relationship view that makes the ownership boundary between membership and review policy explicit."
        eyebrow="Variant C · Quorum bridge"
        title="Organization membership meets review requirements"
      />
      <Frame>
        <FramePanel className="p-5 lg:p-7">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]">
            <RelationshipDomain
              badge="WorkOS-owned"
              description="Organization, active membership, and role grants are projected into DrawFlow for read access."
              icon={Users}
              source="E1, E3, E4"
              title="Organization administration"
            >
              {currentMember ? <MemberIdentity member={currentMember} /> : null}
              {currentMember ? (
                <RoleBadges roles={currentMember.roleLabels} />
              ) : null}
            </RelationshipDomain>
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 py-4 text-center">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="h-px w-8 bg-border" />
                <ArrowRight className="size-4" />
                <span className="h-px w-8 bg-border" />
              </div>
              <Badge variant="secondary">Read relationship only</Badge>
              <p className="max-w-40 text-muted-foreground text-xs leading-5">
                Membership context may inform a review, but does not define the
                policy.
              </p>
            </div>
            <RelationshipDomain
              badge="Back Office-configured"
              description="The transferred proposal contract shows Back Office and lender quorum as peer requirements."
              icon={FileLock2}
              source="E5, E6"
              title="Pre-closing review requirements"
            >
              <FactRow
                label="Approval groups"
                value="Back Office + lender quorum"
              />
              <FactRow
                label="Representative quorum"
                value="2 active lender members"
              />
            </RelationshipDomain>
          </div>
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What this surface can explain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckLine text="Which WorkOS organization is active" />
            <CheckLine text="Which projected memberships are active" />
            <CheckLine text="Which canonical roles are attached" />
            <CheckLine text="How review policy references a lender quorum" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What this surface cannot decide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BoundaryLine text="Who is eligible to count toward quorum" />
            <BoundaryLine text="Whether the shown organization satisfies quorum" />
            <BoundaryLine text="How review requirements are configured" />
            <BoundaryLine text="Any invitation, membership, or role change" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VariantD({ currentMember }: VariantProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeading
        description="A calm administrative briefing that reads top-to-bottom as a boundary-aware organization record."
        eyebrow="Variant D · Administration brief"
        title="FairLendBrokerage organization brief"
      />
      <Frame>
        <FramePanel className="p-0">
          <div className="grid gap-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="border-b p-5 lg:border-r lg:border-b-0">
              <div className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Landmark className="size-6" />
              </div>
              <p className="mt-4 font-heading font-semibold text-xl">
                {organization.name}
              </p>
              <Badge className="mt-2" variant="success">
                {organization.status}
              </Badge>
              <Separator className="my-5" />
              <p className="text-muted-foreground text-xs leading-5">
                {organization.sourceLabel}
              </p>
            </aside>
            <div className="divide-y">
              <BriefSection
                index="01"
                source="E3, E4"
                title="Active membership"
              >
                {currentMember ? (
                  <MemberIdentity member={currentMember} />
                ) : null}
                {currentMember ? (
                  <RoleBadges roles={currentMember.roleLabels} />
                ) : null}
              </BriefSection>
              <BriefSection
                index="02"
                source="E1, E2"
                title="Administration boundary"
              >
                <p className="text-muted-foreground text-sm leading-6">
                  Admin and Principal Broker have canonical user-management
                  capability. This prototype presents the boundary only and
                  exposes no write control.
                </p>
              </BriefSection>
              <BriefSection
                index="03"
                source="E5, E6"
                title="Review relationship"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FactTile
                    label="Review groups"
                    value="Back Office + lender quorum"
                  />
                  <FactTile
                    label="Representative quorum"
                    value="2 active lender members"
                  />
                </div>
                <p className="mt-3 text-muted-foreground text-xs leading-5">
                  The review rule is presented as external context. Organization
                  administration does not own or change it.
                </p>
              </BriefSection>
              <BriefSection
                index="04"
                source="E1, E7"
                title="Unresolved terminology"
              >
                <UnresolvedManagerNote compact />
              </BriefSection>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function VariantE({
  onOpenOperation,
  onOpenUser,
}: {
  onOpenOperation: (operation: PrototypeOperation) => void;
  onOpenUser: (workosUserId: string) => void;
}) {
  const [memberQuery, setMemberQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending" | "inactive"
  >("all");
  const visibleDirectoryUsers = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLowerCase();
    return prototypeDirectoryUsers.filter((entry) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          entry.displayName,
          entry.user.email,
          ...entry.memberships.flatMap((membership) => [
            membership.roleSlug,
            ...(membership.roleSlugs ?? []),
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        entry.memberships.some(
          (membership) => membership.status === statusFilter
        );
      return matchesQuery && matchesStatus;
    });
  }, [memberQuery, statusFilter]);
  const statusFilters = [
    { count: prototypeDirectoryUsers.length, key: "all", label: "All" },
    {
      count: prototypeDirectoryUsers.filter((entry) =>
        entry.memberships.some((membership) => membership.status === "active")
      ).length,
      key: "active",
      label: "Active",
    },
    {
      count: prototypeDirectoryUsers.filter((entry) =>
        entry.memberships.some((membership) => membership.status === "pending")
      ).length,
      key: "pending",
      label: "Pending",
    },
    {
      count: prototypeDirectoryUsers.filter((entry) =>
        entry.memberships.some((membership) => membership.status === "inactive")
      ).length,
      key: "inactive",
      label: "Deactivated",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeading
        description="The production User Management table and membership sheet, composed into the lender workspace with operational workflows staged safely in memory."
        eyebrow="Variant E · Shared user management"
        title="Organization members"
      />
      <OrganizationSummaryStrip />
      <Frame>
        <FramePanel
          aria-label="Shared user management directory"
          className="flex flex-col gap-0 overflow-hidden p-0"
          role="region"
        >
          <div className="flex flex-col gap-4 border-b p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-semibold text-sm">Organization members</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Exact Back Office table component and visual fixture · E3, E4
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">shadcn Table</Badge>
                <Badge variant="outline">TanStack Table</Badge>
                <Badge variant="secondary">Operational sheet</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 max-w-sm flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search organization members"
                    className="pl-7"
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search name, email, or role"
                    size="sm"
                    type="search"
                    value={memberQuery}
                  />
                </div>
                <fieldset className="flex flex-wrap gap-1">
                  <legend className="sr-only">Membership status</legend>
                  {statusFilters.map((filter) => (
                    <Button
                      key={filter.key}
                      onClick={() => setStatusFilter(filter.key)}
                      size="xs"
                      variant={
                        statusFilter === filter.key ? "secondary" : "ghost"
                      }
                    >
                      {filter.label}
                      <span className="tabular-nums">{filter.count}</span>
                    </Button>
                  ))}
                </fieldset>
              </div>
              <Button
                onClick={() => onOpenOperation("invite")}
                size="sm"
                variant="outline"
              >
                <UserPlus />
                Invite member
              </Button>
            </div>
          </div>
          <UserManagementDirectoryTable
            emptyMessage="No organization members match this view."
            onRowClick={onOpenUser}
            organizationsById={prototypeOrganizationsById}
            pending={false}
            provisioningByOrg={prototypeProvisioningByOrg}
            rowActionVerb="View"
            rows={visibleDirectoryUsers}
          />
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Membership context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckLine text="Select a member to inspect their WorkOS organization membership" />
            <CheckLine text="Stage access and deactivation operations from the membership sheet" />
            <CheckLine text="Review the complete local draft and downstream impact before execution" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Policy boundary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BoundaryLine text="No invitation delivery, WorkOS mutation, role assignment, or policy change" />
            <BoundaryLine text="No quorum eligibility or satisfaction claim" />
            <BoundaryLine text="Pre-closing review requirements remain Back Office-owned" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MemberAdministrationDetails({
  member,
  onOpenOperation,
}: {
  member: DirectoryUser;
  onOpenOperation: (operation: PrototypeOperation) => void;
}) {
  const membership = member.memberships[0];
  const activeMembershipCount = prototypeDirectoryUsers.filter((entry) =>
    entry.memberships.some((row) => row.status === "active")
  ).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold text-sm">
            Access and administration
          </h3>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            Stage member operations, validate drafts, and review downstream
            effects. Drafts stay local and never call WorkOS.
          </p>
        </div>
        <Badge variant="outline">E1–E9</Badge>
      </div>
      <Tabs defaultValue="access">
        <TabsList
          className="w-full justify-start overflow-x-auto"
          variant="underline"
        >
          <TabsTab value="access">Access</TabsTab>
          <TabsTab value="administration">Administration</TabsTab>
          <TabsTab value="review">Review relationship</TabsTab>
          <TabsTab value="history">History</TabsTab>
        </TabsList>
        <TabsPanel className="pt-3" value="access">
          <div className="flex flex-col divide-y">
            <SheetFact
              label="Active organization"
              source="E2, E4"
              value={organization.name}
            />
            <SheetFact
              label="Account status"
              source="E3, E4"
              value={member.user.status ?? "Unknown"}
            />
            <SheetFact
              label="Membership state"
              source="E3, E4"
              value={membership?.status ?? "Unknown"}
            />
            <SheetFact
              label="Access scope"
              source="E1, E2, E7"
              value="Organization-wide · Admin + Principal Broker"
            />
            <SheetFact
              label="Principal Broker protection"
              source="E2, E8"
              value="Transfer-of-control required before replacement"
            />
          </div>
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="administration">
          <WorkflowPreview
            action="Organization-level control"
            buttonLabel="Start invite"
            description="Invite or add brokers and staff inside the active organization. Stage an email and verified starting role before reviewing the draft."
            icon={UserPlus}
            onSelect={() => onOpenOperation("invite")}
            source="E2, E8"
            title="Invite or add member"
          />
          <WorkflowPreview
            action="Member-level control"
            buttonLabel="Stage access change"
            description="Change a non-protected member's WorkOS roles through the canonical WorkOS action boundary. Review current and proposed access together."
            icon={UserRoundCog}
            onSelect={() => onOpenOperation("change-access")}
            source="E1, E2, E7"
            title="Change member access"
          />
          <WorkflowPreview
            action="Protected for this member"
            buttonLabel="Review deactivation"
            description="Deactivation ends future access and actions while preserving membership and decision history. The displayed Principal Broker requires transfer-of-control first."
            icon={UserMinus}
            onSelect={() => onOpenOperation("deactivate")}
            source="E2, E8, E9"
            title="Deactivate member"
          />
          <WorkflowPreview
            action="Unresolved mapping"
            buttonLabel="Back Office only"
            description="The transferred lender contract makes manager appointment Back Office-controlled, but the current WorkOS projection has no separate manager capability. No parallel role is inferred here."
            disabled
            icon={LockKeyhole}
            source="E9"
            title="Appoint or replace manager"
          />
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="review">
          <div className="flex flex-col divide-y">
            <SheetFact
              label="Representative review rule"
              source="E5, E6"
              value="2 active lender members"
            />
            <SheetFact
              label="Verified active memberships shown"
              source="E3, E4"
              value={String(activeMembershipCount)}
            />
            <SheetFact
              label="Eligibility or satisfaction"
              source="E5, E6"
              value="Not derived on this surface"
            />
            <SheetFact
              label="Policy owner"
              source="E5, E6"
              value="Back Office pre-closing review requirements"
            />
          </div>
          <div className="flex gap-3 border-t pt-3 text-muted-foreground text-xs leading-5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Membership changes must be consumed by quorum re-evaluation,
              recipient routing, work queues, and audit. This sheet explains
              that relationship; it does not own or change the approval policy.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="history">
          <div className="flex flex-col divide-y">
            <SheetFact
              label="Identity source"
              source="E1, E3"
              value="WorkOS read projection"
            />
            <SheetFact
              label="Membership record"
              source="E3, E4"
              value={membership?.workosMembershipId ?? "Not available"}
            />
            <SheetFact
              label="Membership timeline"
              source="E9"
              value="Required by transferred contract · not exposed by current projection"
            />
            <SheetFact
              label="Decision history"
              source="E5"
              value="Preserved in review workflows · not duplicated here"
            />
            <SheetFact
              label="Prototype audit events"
              source="E1, E2"
              value="None · operational drafts are local and discarded"
            />
          </div>
          <div className="flex gap-3 border-t pt-3 text-muted-foreground text-xs leading-5">
            <History className="mt-0.5 size-4 shrink-0" />
            <p>
              Production mutations require auditable actor and state history.
              The current fixture verifies only the present projection, so no
              dates, inviters, appointing actors, or prior states are invented.
            </p>
          </div>
        </TabsPanel>
      </Tabs>
    </section>
  );
}

function SheetFact({
  label,
  source,
  value,
}: {
  label: string;
  source: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <div>
        <p className="font-medium text-xs">{label}</p>
        <p className="mt-0.5 font-mono text-muted-foreground text-xs">
          {source}
        </p>
      </div>
      <p className="text-sm sm:text-right">{value}</p>
    </div>
  );
}

function WorkflowPreview({
  action,
  buttonLabel,
  description,
  disabled = false,
  icon: Icon,
  onSelect,
  source,
  title,
}: {
  action: string;
  buttonLabel?: string;
  description: string;
  disabled?: boolean;
  icon: typeof UserPlus;
  onSelect?: () => void;
  source: string;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{title}</p>
              <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                {source}
              </p>
            </div>
            <Badge variant="outline">{action}</Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            {description}
          </p>
          {buttonLabel ? (
            <Button
              className="mt-3"
              disabled={disabled}
              onClick={onSelect}
              size="sm"
              variant="outline"
            >
              {buttonLabel}
              {disabled ? <LockKeyhole /> : <ArrowRight />}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

const operationCopy: Record<
  PrototypeOperation,
  { description: string; title: string }
> = {
  invite: {
    description:
      "Stage a WorkOS organization invitation and review its access and routing effects.",
    title: "Invite organization member",
  },
  "change-access": {
    description:
      "Compare current and proposed WorkOS roles before an access change.",
    title: "Change member access",
  },
  deactivate: {
    description:
      "Review access, history, and review-workflow effects before deactivation.",
    title: "Deactivate organization member",
  },
};

const prototypeEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PrototypeOperationDialog({
  member,
  onOpenChange,
  operation,
}: {
  member: DirectoryUser | undefined;
  onOpenChange: (open: boolean) => void;
  operation: PrototypeOperation;
}) {
  const currentRoleSlugs = member?.memberships[0]?.roleSlugs ?? [];
  const [stage, setStage] = useState<"draft" | "review">("draft");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"broker" | "broker-staff">(
    "broker"
  );
  const [proposedRoles, setProposedRoles] =
    useState<readonly string[]>(currentRoleSlugs);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [historyAcknowledged, setHistoryAcknowledged] = useState(false);
  const isProtectedPrincipal = currentRoleSlugs.includes("principle-broker");
  const removesPrincipalBroker =
    isProtectedPrincipal && !proposedRoles.includes("principle-broker");
  const canReview =
    operation === "invite"
      ? prototypeEmailPattern.test(inviteEmail.trim())
      : operation === "change-access"
        ? proposedRoles.length > 0
        : deactivationReason.trim().length >= 10 && historyAcknowledged;

  const toggleRole = (roleSlug: RoleDefinition["slug"], checked: boolean) => {
    setProposedRoles((roles) =>
      checked
        ? Array.from(new Set([...roles, roleSlug]))
        : roles.filter((role) => role !== roleSlug)
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="warning">Local prototype draft</Badge>
            <Badge variant="outline">
              {stage === "draft" ? "1 · Draft" : "2 · Review"}
            </Badge>
          </div>
          <DialogTitle>{operationCopy[operation].title}</DialogTitle>
          <DialogDescription>
            {operationCopy[operation].description} Nothing in this workflow is
            saved or sent.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          {stage === "draft" ? (
            <OperationDraftFields
              deactivationReason={deactivationReason}
              historyAcknowledged={historyAcknowledged}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              onDeactivationReasonChange={setDeactivationReason}
              onHistoryAcknowledgedChange={setHistoryAcknowledged}
              onInviteEmailChange={setInviteEmail}
              onInviteRoleChange={setInviteRole}
              onToggleRole={toggleRole}
              operation={operation}
              proposedRoles={proposedRoles}
            />
          ) : (
            <OperationReview
              deactivationReason={deactivationReason}
              inviteEmail={inviteEmail}
              inviteRole={inviteRole}
              member={member}
              operation={operation}
              proposedRoles={proposedRoles}
              protectedOperation={
                operation === "deactivate"
                  ? isProtectedPrincipal
                  : removesPrincipalBroker
              }
            />
          )}

          <OperationImpactPreview
            operation={operation}
            protectedOperation={
              operation === "deactivate"
                ? isProtectedPrincipal
                : removesPrincipalBroker
            }
          />

          <Frame>
            <FramePanel className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">Current local draft</p>
                <Badge variant="secondary">In memory</Badge>
              </div>
              <OperationStateSummary
                deactivationReason={deactivationReason}
                inviteEmail={inviteEmail}
                inviteRole={inviteRole}
                member={member}
                operation={operation}
                proposedRoles={proposedRoles}
              />
            </FramePanel>
          </Frame>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Discard draft
          </Button>
          {stage === "review" ? (
            <>
              <Button onClick={() => setStage("draft")} variant="outline">
                Back to edit
              </Button>
              <Button disabled>
                Execution unavailable in prototype
                <LockKeyhole />
              </Button>
            </>
          ) : (
            <Button disabled={!canReview} onClick={() => setStage("review")}>
              Review draft
              <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function OperationDraftFields({
  deactivationReason,
  historyAcknowledged,
  inviteEmail,
  inviteRole,
  member,
  onDeactivationReasonChange,
  onHistoryAcknowledgedChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onToggleRole,
  operation,
  proposedRoles,
}: {
  deactivationReason: string;
  historyAcknowledged: boolean;
  inviteEmail: string;
  inviteRole: "broker" | "broker-staff";
  member: DirectoryUser | undefined;
  onDeactivationReasonChange: (reason: string) => void;
  onHistoryAcknowledgedChange: (checked: boolean) => void;
  onInviteEmailChange: (email: string) => void;
  onInviteRoleChange: (role: "broker" | "broker-staff") => void;
  onToggleRole: (role: RoleDefinition["slug"], checked: boolean) => void;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
}) {
  if (operation === "invite") {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="invite-email">
            Member email
          </label>
          <Input
            autoComplete="off"
            id="invite-email"
            onChange={(event) => onInviteEmailChange(event.target.value)}
            placeholder="broker@example.com"
            type="email"
            value={inviteEmail}
          />
          <p className="text-muted-foreground text-xs">
            A valid email is required before the draft can be reviewed.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="invite-role">
            Starting access
          </label>
          <NativeSelect
            className="w-full"
            id="invite-role"
            onChange={(event) =>
              onInviteRoleChange(
                event.target.value as "broker" | "broker-staff"
              )
            }
            value={inviteRole}
          >
            <NativeSelectOption value="broker">Broker</NativeSelectOption>
            <NativeSelectOption value="broker-staff">
              Broker Staff
            </NativeSelectOption>
          </NativeSelect>
          <p className="text-muted-foreground text-xs">
            Only verified non-owner starting roles are offered here. E1, E7
          </p>
        </div>
      </div>
    );
  }

  if (operation === "change-access") {
    return (
      <div className="space-y-4">
        <OperationMemberHeader member={member} />
        <fieldset className="space-y-2">
          <legend className="font-medium text-sm">Proposed WorkOS roles</legend>
          {roleDefinitions.map((role) => {
            const checked = proposedRoles.includes(role.slug);
            return (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-data-checked:border-primary/50 has-data-checked:bg-primary/5"
                htmlFor={`proposed-role-${role.slug}`}
                key={role.slug}
              >
                <Checkbox
                  checked={checked}
                  id={`proposed-role-${role.slug}`}
                  onCheckedChange={(nextChecked) =>
                    onToggleRole(role.slug, nextChecked)
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium text-sm">
                    {role.label}
                  </span>
                  <span className="block text-muted-foreground text-xs leading-5">
                    {role.slug} · {role.summary}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {proposedRoles.length === 0 ? (
          <p className="text-destructive text-xs">
            Select at least one verified role to review this draft.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OperationMemberHeader member={member} />
      <div className="space-y-1.5">
        <label className="font-medium text-sm" htmlFor="deactivation-reason">
          Operational reason
        </label>
        <Textarea
          id="deactivation-reason"
          onChange={(event) => onDeactivationReasonChange(event.target.value)}
          placeholder="Explain why future organization access should end"
          value={deactivationReason}
        />
        <p className="text-muted-foreground text-xs">
          Enter at least 10 characters. The reason would be part of the audit
          record in production.
        </p>
      </div>
      <label
        className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
        htmlFor="preserve-history"
      >
        <Checkbox
          checked={historyAcknowledged}
          id="preserve-history"
          onCheckedChange={onHistoryAcknowledgedChange}
        />
        <span>
          <span className="block font-medium text-sm">
            Preserve membership and decision history
          </span>
          <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
            I understand that deactivation ends future access but must not erase
            the historical membership or decisions. E2, E8, E9
          </span>
        </span>
      </label>
    </div>
  );
}

function OperationMemberHeader({
  member,
}: {
  member: DirectoryUser | undefined;
}) {
  return (
    <div className="flex items-center gap-3 border-b pb-4">
      <Avatar>
        <AvatarFallback>{member?.initials ?? "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {member?.displayName ?? "No verified member"}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {member?.user.email ?? "Email unavailable"}
        </p>
      </div>
    </div>
  );
}

function OperationReview({
  deactivationReason,
  inviteEmail,
  inviteRole,
  member,
  operation,
  proposedRoles,
  protectedOperation,
}: {
  deactivationReason: string;
  inviteEmail: string;
  inviteRole: string;
  member: DirectoryUser | undefined;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
  protectedOperation: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Review operation</CardTitle>
          <Badge variant={protectedOperation ? "warning" : "secondary"}>
            {protectedOperation ? "Protected workflow" : "Draft valid"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <SheetFact
          label="Organization"
          source="E3, E4"
          value={organization.name}
        />
        <SheetFact
          label={operation === "invite" ? "Invitee" : "Member"}
          source={operation === "invite" ? "Local draft" : "E3, E4"}
          value={
            operation === "invite"
              ? inviteEmail.trim()
              : (member?.displayName ?? "Unavailable")
          }
        />
        {operation === "invite" ? (
          <SheetFact
            label="Starting access"
            source="E1, E7"
            value={inviteRole}
          />
        ) : null}
        {operation === "change-access" ? (
          <>
            <SheetFact
              label="Current access"
              source="E3, E4"
              value={member?.memberships[0]?.roleSlugs?.join(", ") ?? "None"}
            />
            <SheetFact
              label="Proposed access"
              source="Local draft"
              value={proposedRoles.join(", ")}
            />
          </>
        ) : null}
        {operation === "deactivate" ? (
          <SheetFact
            label="Reason"
            source="Local draft"
            value={deactivationReason.trim()}
          />
        ) : null}
        <SheetFact
          label="Execution"
          source="Prototype boundary"
          value={
            protectedOperation
              ? "Blocked · transfer-of-control required"
              : "Unavailable · no external writes"
          }
        />
      </CardContent>
    </Card>
  );
}

function OperationImpactPreview({
  operation,
  protectedOperation,
}: {
  operation: PrototypeOperation;
  protectedOperation: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational impact preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CheckLine text="Use the canonical WorkOS organization and membership action boundary" />
        {operation === "invite" ? (
          <CheckLine text="Await WorkOS webhook sync before showing an active membership" />
        ) : (
          <CheckLine text="Re-evaluate lender review quorum context, recipient routing, and work queues" />
        )}
        <CheckLine text="Preserve or append auditable actor, role, prior state, new state, time, and reason context" />
        {protectedOperation ? (
          <BoundaryLine text="Principal Broker control must transfer before this operation can execute" />
        ) : null}
        <BoundaryLine text="Do not change Back Office pre-closing review requirements from this surface" />
      </CardContent>
    </Card>
  );
}

function OperationStateSummary({
  deactivationReason,
  inviteEmail,
  inviteRole,
  member,
  operation,
  proposedRoles,
}: {
  deactivationReason: string;
  inviteEmail: string;
  inviteRole: string;
  member: DirectoryUser | undefined;
  operation: PrototypeOperation;
  proposedRoles: readonly string[];
}) {
  if (operation === "invite") {
    return (
      <p className="break-words font-mono text-muted-foreground text-xs leading-5">
        organization={organization.name} · email={inviteEmail || "empty"} ·
        role={inviteRole} · delivery=not sent
      </p>
    );
  }
  if (operation === "change-access") {
    return (
      <p className="break-words font-mono text-muted-foreground text-xs leading-5">
        member={member?.user.email ?? "unavailable"} · proposedRoles=
        {proposedRoles.length > 0 ? proposedRoles.join(",") : "empty"} ·
        assignment=not applied
      </p>
    );
  }
  return (
    <p className="break-words font-mono text-muted-foreground text-xs leading-5">
      member={member?.user.email ?? "unavailable"} · reason=
      {deactivationReason || "empty"} · status=unchanged
    </p>
  );
}

function PrototypeNotice({ onShowEvidence }: { onShowEvidence: () => void }) {
  return (
    <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-2 text-center font-medium text-xs">
        <Badge variant="warning">Throwaway prototype</Badge>
        <span>
          Operational workflow simulation · verified fixture data · drafts stay
          local · no persistence
        </span>
        <Button onClick={onShowEvidence} size="xs" variant="outline">
          <BookOpenCheck className="size-3.5" />
          Evidence map
        </Button>
      </div>
    </div>
  );
}

function EvidencePanel() {
  return (
    <div className="border-b bg-background px-4 py-4">
      <div className="mx-auto grid max-w-[1440px] gap-3 md:grid-cols-2 xl:grid-cols-3">
        {evidenceSources.map((source) => (
          <div className="flex gap-3" key={source.key}>
            <Badge className="h-fit" variant="outline">
              {source.key}
            </Badge>
            <div>
              <p className="font-medium text-xs">{source.label}</p>
              <p className="mt-1 font-mono text-muted-foreground text-xs leading-5">
                {source.path}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageHeading({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-heading font-semibold text-2xl tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {description}
        </p>
      </div>
      <Badge className="w-fit" variant="outline">
        No organization or policy writes
      </Badge>
    </header>
  );
}

function OrganizationSummaryStrip() {
  return (
    <Frame>
      <FramePanel className="grid gap-0 p-0 sm:grid-cols-3">
        <SummaryFact
          icon={Building2}
          label="Active organization"
          value={organization.name}
        />
        <SummaryFact
          icon={UserRoundCheck}
          label="Verified active members"
          value={String(organizationMembers.length)}
        />
        <SummaryFact
          icon={ShieldCheck}
          label="Administration context"
          value="Admin · Principal Broker"
        />
      </FramePanel>
    </Frame>
  );
}

function SummaryFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <div className="flex size-9 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

function OrganizationIdentity() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Building2 className="size-5" />
      </div>
      <div>
        <p className="font-semibold">{organization.name}</p>
        <p className="text-muted-foreground text-xs">
          Active WorkOS organization · E3, E4
        </p>
      </div>
    </div>
  );
}

function SearchField({
  onChange,
  query,
}: {
  onChange: (query: string) => void;
  query: string;
}) {
  return (
    <div className="relative w-full md:max-w-xs">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search active organization members"
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name, email, or role"
        value={query}
      />
    </div>
  );
}

function RoleContextFilter({
  onChange,
  value,
}: {
  onChange: (context: "all" | RoleContext) => void;
  value: "all" | RoleContext;
}) {
  const options = [
    ["all", "All verified roles"],
    ["administration", "Administration"],
    ["operations", "Operations"],
  ] as const;
  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">Filter roles</legend>
      {options.map(([key, label]) => (
        <Button
          key={key}
          onClick={() => onChange(key)}
          size="sm"
          variant={value === key ? "default" : "ghost"}
        >
          {key === "all" ? <ListFilter /> : <Filter />}
          {label}
        </Button>
      ))}
    </fieldset>
  );
}

function MemberIdentity({ member }: { member: OrganizationMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar>
        <AvatarFallback>{member.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{member.name}</p>
        <p className="truncate text-muted-foreground text-xs">{member.email}</p>
      </div>
    </div>
  );
}

function RoleBadges({ roles }: { roles: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <Badge key={role} variant="secondary">
          {role}
        </Badge>
      ))}
    </div>
  );
}

function MemberContextRail({
  member,
}: {
  member: OrganizationMember | undefined;
}) {
  return (
    <Frame>
      <FramePanel className="p-5">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          Membership context
        </p>
        {member ? (
          <div className="mt-4 space-y-4">
            <MemberIdentity member={member} />
            <RoleBadges roles={member.roleLabels} />
            <Separator />
            <FactRow label="Organization" value={organization.name} />
            <FactRow label="Membership status" value="Active" />
            <FactRow label="Source" value="WorkOS projection" />
            <Separator />
            <BoundaryNote
              icon={FileLock2}
              text="No current source maps this member to quorum eligibility. Do not infer readiness from role labels."
            />
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function RelationshipDomain({
  badge,
  children,
  description,
  icon: Icon,
  source,
  title,
}: {
  badge: string;
  children: ReactNode;
  description: string;
  icon: typeof Users;
  source: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted">
            <Icon className="size-5" />
          </div>
          <Badge variant="outline">{badge}</Badge>
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Separator />
        {children}
        <p className="pt-1 text-muted-foreground text-xs">Source {source}</p>
      </CardContent>
    </Card>
  );
}

function BriefSection({
  children,
  index,
  source,
  title,
}: {
  children: ReactNode;
  index: string;
  source: string;
  title: string;
}) {
  return (
    <section className="grid gap-4 p-5 sm:grid-cols-[3rem_minmax(0,1fr)] md:p-6">
      <span className="font-mono text-muted-foreground text-xs">{index}</span>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">{title}</h2>
          <span className="text-muted-foreground text-xs">Source {source}</span>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-primary border-l-2 pl-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

function BoundaryNote({
  icon: Icon,
  text,
}: {
  icon: typeof Database;
  text: string;
}) {
  return (
    <div className="flex gap-3 text-muted-foreground text-xs leading-5">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3.5" />
      </span>
      <span>{text}</span>
    </div>
  );
}

function BoundaryLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileLock2 className="size-3.5" />
      </span>
      <span>{text}</span>
    </div>
  );
}

function UnresolvedManagerNote({ compact = false }: { compact?: boolean }) {
  return (
    <Frame className={cn(compact && "border-0 shadow-none")}>
      <FramePanel className={cn("flex gap-3 p-4", compact && "p-0")}>
        <CircleHelp className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium text-sm">“Manager” remains unresolved</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            No canonical WorkOS role slug named manager exists in the inspected
            sources. This prototype uses Admin and Principal Broker and does not
            infer a manager alias.
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function EmptySearch() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Search className="size-5 text-muted-foreground" />
      <p className="font-medium text-sm">No verified fixture member matches</p>
      <p className="text-muted-foreground text-xs">
        This prototype will not generate a placeholder member.
      </p>
    </div>
  );
}
