import type {
  DirectoryUser,
  OrganizationProvisioning,
  WorkosMembershipRow,
  WorkosOrganizationRow,
} from "./backoffice/-user-management-types";

export const prototypeVariants = [
  { key: "A", label: "Directory ledger" },
  { key: "B", label: "Role atlas" },
  { key: "C", label: "Quorum bridge" },
  { key: "D", label: "Administration brief" },
  { key: "E", label: "Shared user management" },
] as const;

export type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];
export type PrototypeOperation = "invite" | "change-access" | "deactivate";
export type RoleContext = "administration" | "operations";

export interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

export interface OrganizationMember {
  email: string;
  initials: string;
  name: string;
  roleLabels: readonly string[];
  roleSlugs: readonly string[];
  status: "active";
}

export interface RoleDefinition {
  context: RoleContext;
  label: string;
  slug: "admin" | "principle-broker" | "broker" | "broker-staff";
  summary: string;
}

export const isPrototypeVariant = (
  value: unknown
): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const organization = {
  name: "FairLendBrokerage",
  sourceLabel: "WorkOS read projection · visual fixture",
  status: "Active",
} as const;

export const organizationMembers: readonly OrganizationMember[] = [
  {
    email: "principal@fairlend.local",
    initials: "FP",
    name: "FairLend Principal Broker",
    roleLabels: ["Admin", "Principal Broker"],
    roleSlugs: ["admin", "principle-broker"],
    status: "active",
  },
] as const;

export const prototypeWorkosOrganization: WorkosOrganizationRow = {
  name: "FairLendBrokerage",
  status: "active",
  workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
};

export const prototypeWorkosMembership: WorkosMembershipRow = {
  roleSlug: "admin",
  roleSlugs: ["admin", "principle-broker"],
  status: "active",
  workosMembershipId: "om_visual_principal",
  workosOrganizationId: prototypeWorkosOrganization.workosOrganizationId,
  workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
};

export const prototypeDirectoryUsers: DirectoryUser[] = [
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

export const prototypeOrganizationsById = new Map([
  [
    prototypeWorkosOrganization.workosOrganizationId,
    prototypeWorkosOrganization,
  ],
]);

export const prototypeProvisioningByOrg = new Map<string, OrganizationProvisioning>([
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

export const prototypeRoleOptionsByOrganization = new Map([
  [
    prototypeWorkosOrganization.workosOrganizationId,
    ["admin", "principle-broker", "broker", "broker-staff"],
  ],
]);

export const roleDefinitions: readonly RoleDefinition[] = [
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

export const evidenceSources = [
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
