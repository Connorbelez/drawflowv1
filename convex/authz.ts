import type { Auth, UserIdentity } from "convex/server";

import { fluent } from "./fluent";

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

export type Capability =
  | "authenticated"
  | "admin"
  | "backoffice"
  | "builder"
  | "contractor"
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
  backoffice: ["admin", "principle-broker", "broker", "broker-staff"],
  builder: ["admin", "builder", "builder-staff"],
  contractor: ["contractor"],
  userManagementWrite: ["admin", "principle-broker"],
  nonDestructiveWrite: ["admin", "principle-broker", "broker", "broker-staff"],
  destructiveWrite: ["admin", "principle-broker"],
};

export interface AuthorizedViewer {
  capability: Capability;
  email?: string;
  organizationId?: string;
  roles: RoleSlug[];
  subject: string;
  tokenIdentifier: string;
}

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
    capability,
    email: identity.email,
    ...(organizationId ? { organizationId } : {}),
    roles,
    subject: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
  };
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

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
