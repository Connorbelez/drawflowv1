import type { Auth, UserIdentity } from "convex/server";

import { fluent } from "./fluent";
import type { Id, MutationCtx, QueryCtx } from "./types";
import { hasProjectedWorkosPermission } from "./workos_permission_access";

export const roleSlugs = [
  "member",
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
  "builder",
  "builder-staff",
  "contractor",
] as const;

export type RoleSlug = (typeof roleSlugs)[number];

const lenderRoleSlugs = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

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
  member: "member",
};

const capabilities: Record<Capability, readonly RoleSlug[] | null> = {
  authenticated: null,
  admin: ["admin"],
  backoffice: backofficeRoleSlugs,
  builder: ["admin", "builder", "builder-staff"],
  contractor: ["contractor"],
  lenderOrganization: lenderRoleSlugs,
  lenderUserManagementWrite: ["admin", "principle-broker"],
  userManagementWrite: ["admin", "principle-broker"],
  nonDestructiveWrite: ["admin", "principle-broker", "broker", "broker-staff"],
  destructiveWrite: ["admin", "principle-broker"],
};

const MAX_LENDER_ORGANIZATION_MEMBERSHIPS = 100;

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
  membershipIds: string[];
  organizationName: string;
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
    "principle-broker",
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
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  workosUserId: string
) {
  const projectedUsers = await ctx.db
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
  const workosUserId = identity.subject.trim();
  if (!workosUserId) {
    throw new Error("Forbidden: WorkOS identity");
  }

  const user = await requireActiveWorkosUser(ctx, workosUserId);
  const claimedWorkosOrganizationId = identityViewer.organizationId?.trim();
  let workosOrganizationId = claimedWorkosOrganizationId;
  const memberships = claimedWorkosOrganizationId
    ? await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query) =>
          query
            .eq("workosUserId", workosUserId)
            .eq("workosOrganizationId", claimedWorkosOrganizationId)
        )
        .take(MAX_LENDER_ORGANIZATION_MEMBERSHIPS + 1)
    : await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (query) => query.eq("workosUserId", workosUserId))
        .take(MAX_LENDER_ORGANIZATION_MEMBERSHIPS + 1);
  if (memberships.length > MAX_LENDER_ORGANIZATION_MEMBERSHIPS) {
    throw new Error("Forbidden: organization membership context exceeds limit");
  }
  const activeOrganizationIds = [
    ...new Set(
      memberships
        .filter((membership) => membership.status === "active")
        .map((membership) => membership.workosOrganizationId)
    ),
  ];
  if (!workosOrganizationId) {
    if (activeOrganizationIds.length === 0) {
      throw new Error("Forbidden: active organization context missing");
    }
    if (activeOrganizationIds.length !== 1) {
      throw new Error("Forbidden: active organization context ambiguous");
    }
    [workosOrganizationId] = activeOrganizationIds;
  }

  const selectedMemberships = memberships.filter(
    (membership) => membership.workosOrganizationId === workosOrganizationId
  );
  if (selectedMemberships.length === 0) {
    throw new Error("Forbidden: foreign organization context");
  }
  const activeMemberships = selectedMemberships.filter(
    (membership) => membership.status === "active"
  );
  if (activeMemberships.length === 0) {
    throw new Error("Forbidden: inactive organization membership");
  }

  const roles = normalizeRoleSlugs(
    activeMemberships.flatMap((membership) => [
      membership.roleSlug,
      ...membership.roleSlugs,
    ])
  );
  const activeRoles = roles.filter((role): role is LenderRoleSlug =>
    lenderRoleSlugs.includes(role as LenderRoleSlug)
  );
  if (activeRoles.length === 0) {
    throw new Error("Forbidden: unsupported lender role");
  }

  const organization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (query) =>
      query.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!organization || organization.status !== "active") {
    throw new Error("Forbidden: inactive organization");
  }

  const brokerages = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", workosOrganizationId)
    )
    .take(2);
  if (brokerages.length !== 1) {
    throw new Error(
      brokerages.length === 0
        ? "Forbidden: lender tenant missing"
        : "Forbidden: lender tenant ambiguous"
    );
  }
  const [brokerage] = brokerages;
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: inactive lender tenant");
  }

  const viewer: AuthorizedViewer = {
    ...identityViewer,
    capability,
    organizationId: workosOrganizationId,
    roles: activeRoles,
  };
  return {
    activeOrganization: {
      brokerageId: brokerage._id,
      membershipIds: activeMemberships
        .map((membership) => membership.workosMembershipId)
        .sort(),
      organizationName: organization.name,
      roles: activeRoles,
      userId: user._id,
      workosOrganizationId,
      workosUserId,
    },
    viewer,
  };
}

export function requireLenderOrganizationResource(
  activeOrganization: ActiveLenderOrganizationContext,
  resource: {
    brokerageId?: Id<"brokerages">;
    organizationId?: string;
  }
) {
  if (
    resource.organizationId !== undefined &&
    resource.organizationId !== activeOrganization.workosOrganizationId
  ) {
    throw new Error("Forbidden: organization resource");
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
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  activeOrganization: ActiveLenderOrganizationContext,
  permission: string
) {
  const allowed = await hasProjectedWorkosPermission(
    ctx,
    activeOrganization.workosOrganizationId,
    activeOrganization.roles,
    permission
  );
  if (!allowed) {
    throw new Error(`Forbidden: permission ${permission}`);
  }
  return activeOrganization;
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
