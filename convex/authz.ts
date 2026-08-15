import type { Auth, UserIdentity } from "convex/server";

import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { fluent } from "./fluent";
import {
  LENDER_ROLE_SLUGS,
  resolveAssignedLenderOrganization,
  type LenderWorkflowPermissions,
} from "./lenderOrganizationAccess";
import type { Id, MutationCtx, QueryCtx } from "./types";

export const roleSlugs = [
  "member",
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
  "builder",
  "builder-staff",
  "contractor",
  "lender",
  "lender-admin",
  "lender-staff",
] as const;

export type RoleSlug = (typeof roleSlugs)[number];

const lenderRoleSlugs = ["admin", ...LENDER_ROLE_SLUGS] as const;

export type LenderRoleSlug = (typeof lenderRoleSlugs)[number];

export const backofficeRoleSlugs = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

export const actorKinds = [
  "human",
  "agent",
  "service",
  "system",
  "automation",
] as const;

export type ActorKind = (typeof actorKinds)[number];

export type Capability =
  | "authenticated"
  | "admin"
  | "backoffice"
  | "builder"
  | "contractor"
  | "lenderOrganization"
  | "lenderUserManagementWrite"
  | "userManagementWrite"
  | "nonDestructiveWrite"
  | "destructiveWrite";

const roleAliases: Record<string, RoleSlug> = {
  "principal-broker": "principle-broker",
  "principle-broker": "principle-broker",
  admin: "admin",
  broker: "broker",
  "broker-staff": "broker-staff",
  broker_staff: "broker-staff",
  builder: "builder",
  "builder-staff": "builder-staff",
  builder_staff: "builder-staff",
  contractor: "contractor",
  lender: "lender",
  "lender-admin": "lender-admin",
  lender_admin: "lender-admin",
  "lender-staff": "lender-staff",
  lender_staff: "lender-staff",
  member: "member",
};

const capabilities: Record<Capability, readonly RoleSlug[] | null> = {
  authenticated: null,
  admin: ["admin"],
  backoffice: backofficeRoleSlugs,
  builder: ["admin", "builder", "builder-staff"],
  contractor: ["contractor"],
  lenderOrganization: lenderRoleSlugs,
  lenderUserManagementWrite: ["admin"],
  userManagementWrite: ["admin", "principle-broker"],
  nonDestructiveWrite: ["admin", "principle-broker", "broker", "broker-staff"],
  destructiveWrite: ["admin", "principle-broker"],
};

export interface AuthorizedViewer {
  actorKind?: ActorKind;
  capability: Capability;
  email?: string;
  organizationId?: string;
  roles: RoleSlug[];
  subject: string;
  tokenIdentifier: string;
}

export interface ActiveLenderOrganizationContext {
  brokerageId: Id<"brokerages">;
  brokerageName: string;
  lenderOrganizationId: Id<"lenderOrganizations">;
  membershipIds: string[];
  organizationName: string;
  permissions: LenderWorkflowPermissions;
  roles: LenderRoleSlug[];
  userId: Id<"users">;
  workosOrganizationId: string;
  workosUserId: string;
}

type LenderOrganizationReadContext = Pick<QueryCtx, "auth" | "db">;

export const requireAuthenticated = fluent
  .$context<{ auth: Auth }>()
  .createMiddleware(async (ctx, next) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return next({
      ...ctx,
      viewer: viewerFromIdentity(identity, "authenticated"),
    });
  });

export const requireAdmin = createCapabilityMiddleware("admin");
export const requireBackoffice = createCapabilityMiddleware("backoffice");
export const requireBuilder = createCapabilityMiddleware("builder");
export const requireContractor = createCapabilityMiddleware("contractor");
export const requireUserManagementWrite = createCapabilityMiddleware(
  "userManagementWrite"
);
export const requireNonDestructiveWrite = createCapabilityMiddleware(
  "nonDestructiveWrite"
);
export const requireDestructiveWrite =
  createCapabilityMiddleware("destructiveWrite");
export const requireLenderOrganization = createLenderOrganizationMiddleware(
  "lenderOrganization",
  lenderRoleSlugs
);
export const requireLenderUserManagementWrite =
  createLenderOrganizationMiddleware("lenderUserManagementWrite", [
    "admin",
  ]);

export const authenticatedQuery = fluent.query().use(requireAuthenticated);
export const authenticatedMutation = fluent
  .mutation()
  .use(requireAuthenticated);
export const authenticatedAction = fluent.action().use(requireAuthenticated);

export const adminQuery = fluent.query().use(requireAdmin);
export const adminMutation = fluent.mutation().use(requireAdmin);
export const adminAction = fluent.action().use(requireAdmin);

export const backofficeQuery = fluent.query().use(requireBackoffice);
export const backofficeMutation = fluent.mutation().use(requireBackoffice);
export const backofficeAction = fluent.action().use(requireBackoffice);

export const builderQuery = fluent.query().use(requireBuilder);
export const builderMutation = fluent.mutation().use(requireBuilder);
export const builderAction = fluent.action().use(requireBuilder);

export const contractorQuery = fluent.query().use(requireContractor);
export const contractorMutation = fluent.mutation().use(requireContractor);
export const contractorAction = fluent.action().use(requireContractor);

export const lenderOrganizationQuery = fluent
  .query()
  .use(requireLenderOrganization);
export const lenderOrganizationMutation = fluent
  .mutation()
  .use(requireLenderOrganization);
export const lenderUserManagementQuery = fluent
  .query()
  .use(requireLenderUserManagementWrite);
export const lenderUserManagementMutation = fluent
  .mutation()
  .use(requireLenderUserManagementWrite);

export const userManagementWriteQuery = fluent
  .query()
  .use(requireUserManagementWrite);
export const userManagementWriteMutation = fluent
  .mutation()
  .use(requireUserManagementWrite);
export const userManagementWriteAction = fluent
  .action()
  .use(requireUserManagementWrite);

export const nonDestructiveWriteMutation = fluent
  .mutation()
  .use(requireNonDestructiveWrite);
export const nonDestructiveWriteAction = fluent
  .action()
  .use(requireNonDestructiveWrite);

export const destructiveWriteMutation = fluent
  .mutation()
  .use(requireDestructiveWrite);
export const destructiveWriteAction = fluent
  .action()
  .use(requireDestructiveWrite);

export function normalizeRoleSlug(role: unknown): RoleSlug | null {
  return typeof role === "string"
    ? (roleAliases[role.trim().toLowerCase().replace(/\s+/g, "-")] ?? null)
    : null;
}

export function normalizeRoleSlugs(roles: readonly unknown[]): RoleSlug[] {
  return [
    ...new Set(roles.map(normalizeRoleSlug).filter((role) => role !== null)),
  ];
}

export function viewerFromIdentity(
  identity: UserIdentity,
  capability: Capability
): AuthorizedViewer {
  const roles = normalizeRoleSlugs([
    identity.role,
    ...toArray(identity.roles),
    ...toArray(identity["https://workos.com/roles"]),
  ]);

  const organizationId =
    stringClaim(identity.organizationId) ??
    stringClaim(identity.org_id) ??
    stringClaim(identity["https://workos.com/organization_id"]);

  return {
    actorKind: actorKindFromIdentity(identity),
    capability,
    email: identity.email,
    ...(organizationId ? { organizationId } : {}),
    roles,
    subject: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
  };
}

export async function requireActiveWorkosUser(
  _ctx: Pick<QueryCtx | MutationCtx, "db">,
  workosUserId: string
) {
  const projectedUsers = await _ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", workosUserId)
    )
    .take(2);
  if (projectedUsers.length !== 1) {
    throw new Error(
      projectedUsers.length === 0
        ? "Forbidden: active user projection missing"
        : "Forbidden: active user projection ambiguous"
    );
  }
  const [user] = projectedUsers;
  if (!user || user.status !== "active") {
    throw new Error("Forbidden: active user projection");
  }
  return user;
}

async function resolveActiveLenderOrganizationContext(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  identity: UserIdentity,
  capability: Capability = "lenderOrganization"
): Promise<{
  activeOrganization: ActiveLenderOrganizationContext;
  viewer: AuthorizedViewer;
}> {
  const identityViewer = viewerFromIdentity(identity, capability);
  const resolution = await resolveAssignedLenderOrganization(ctx, identity, {
    allowPlatformAdminWithoutLenderRole: true,
  });
  const identityIsAdmin = identityViewer.roles.includes("admin");
  const effectiveRoles: LenderRoleSlug[] = identityIsAdmin
    ? ["admin", ...resolution.roles]
    : resolution.roles;
  const viewer: AuthorizedViewer = {
    ...identityViewer,
    capability,
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    roles: effectiveRoles,
  };
  return {
    activeOrganization: {
      brokerageId: resolution.brokerage._id,
      brokerageName: resolution.brokerage.displayName,
      lenderOrganizationId: resolution.organization._id,
      membershipIds: resolution.membershipIds,
      organizationName: resolution.organization.displayName,
      permissions: resolution.organization.permissions,
      roles: effectiveRoles,
      userId: resolution.user._id,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: resolution.workosUserId,
    },
    viewer,
  };
}

export function requireLenderOrganizationResource(
  activeOrganization: ActiveLenderOrganizationContext,
  resource: {
    brokerageId?: Id<"brokerages">;
    lenderOrganizationId?: Id<"lenderOrganizations">;
    organizationId?: string;
  }
) {
  if (
    resource.organizationId !== undefined &&
    resource.organizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID
  ) {
    throw new Error("Forbidden: organization resource");
  }
  if (
    resource.lenderOrganizationId !== undefined &&
    resource.lenderOrganizationId !== activeOrganization.lenderOrganizationId
  ) {
    throw new Error("Forbidden: lender organization resource");
  }
  if (
    resource.brokerageId !== undefined &&
    resource.brokerageId !== activeOrganization.brokerageId
  ) {
    throw new Error("Forbidden: tenant resource");
  }
  return activeOrganization;
}

export async function requireLenderOrganizationPermission(
  _ctx: Pick<QueryCtx | MutationCtx, "db">,
  activeOrganization: ActiveLenderOrganizationContext,
  permission: string
) {
  // Platform Admin is the explicit capability bypass. Authentication,
  // shared membership, parent brokerage, and target assignment were already
  // required by the lender middleware.
  if (activeOrganization.roles.includes("admin")) {
    return activeOrganization;
  }
  const key = normalizeLenderWorkflowPermission(permission);
  if (!activeOrganization.permissions[key]) {
    throw new Error(`Forbidden: permission ${permission}`);
  }
  if (
    (key === "proposalReview" ||
      key === "milestoneDecisions" ||
      key === "drawDecisions") &&
    activeOrganization.roles.every((role) => role === "lender-staff")
  ) {
    throw new Error(`Forbidden: final lender decision authority ${permission}`);
  }
  return activeOrganization;
}

function normalizeLenderWorkflowPermission(
  permission: string
): keyof LenderWorkflowPermissions {
  const normalized = permission.trim().toLowerCase().replace(/[-: ]/g, "_");
  const aliases: Record<string, keyof LenderWorkflowPermissions> = {
    proposal_review: "proposalReview",
    proposalreview: "proposalReview",
    milestone_decisions: "milestoneDecisions",
    milestonedecisions: "milestoneDecisions",
    draw_decisions: "drawDecisions",
    drawdecisions: "drawDecisions",
    site_visit_review: "siteVisitReview",
    sitevisitreview: "siteVisitReview",
  };
  const resolved = aliases[normalized];
  if (!resolved) {
    throw new Error(`Forbidden: unsupported lender permission ${permission}`);
  }
  return resolved;
}

function actorKindFromIdentity(identity: UserIdentity): ActorKind | undefined {
  const candidate =
    identity["https://fairlend.ca/actor_kind"] ??
    identity.actorKind ??
    identity.actor_kind;
  if (candidate !== undefined && candidate !== null) {
    if (
      typeof candidate !== "string" ||
      !actorKinds.includes(candidate.trim().toLowerCase() as ActorKind)
    ) {
      return;
    }
    return candidate.trim().toLowerCase() as ActorKind;
  }
  return isTrustedWorkosHumanIdentity(identity) ? "human" : undefined;
}

function isTrustedWorkosHumanIdentity(identity: UserIdentity) {
  return (
    identity.tokenIdentifier.startsWith("https://api.workos.com/|") ||
    identity.tokenIdentifier.startsWith(
      "https://api.workos.com/user_management/"
    )
  );
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createCapabilityMiddleware(capability: Capability) {
  return fluent
    .$context<{ auth: Auth }>()
    .createMiddleware(async (ctx, next) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized");
      }

      const viewer = viewerFromIdentity(identity, capability);
      const allowed = capabilities[capability];
      if (allowed && !viewer.roles.some((role) => allowed.includes(role))) {
        throw new Error(`Forbidden: ${capability}`);
      }

      return next({ ...ctx, viewer });
    });
}

function createLenderOrganizationMiddleware(
  capability: Capability,
  allowedRoles: readonly LenderRoleSlug[]
) {
  return fluent
    .$context<LenderOrganizationReadContext>()
    .createMiddleware(async (ctx, next) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized");
      }

      const authorization = await resolveActiveLenderOrganizationContext(
        ctx,
        identity,
        capability
      );
      if (
        !authorization.activeOrganization.roles.some((role) =>
          allowedRoles.includes(role)
        )
      ) {
        throw new Error(`Forbidden: ${capability}`);
      }
      return next({ ...ctx, ...authorization });
    });
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export { lenderRoleSlugs, resolveActiveLenderOrganizationContext };
