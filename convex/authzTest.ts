import { v } from "convex/values";

import {
  adminQuery,
  authenticatedQuery,
  backofficeQuery,
  builderQuery,
  destructiveWriteMutation,
  nonDestructiveWriteMutation,
  userManagementWriteMutation,
} from "./authz";

const viewerReturn = v.object({
  capability: v.string(),
  email: v.optional(v.string()),
  roles: v.array(v.string()),
  subject: v.string(),
  tokenIdentifier: v.string(),
});

export const requireAuthenticated = authenticatedQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireAdmin = adminQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireBackoffice = backofficeQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireBuilder = builderQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireUserManagementWrite = userManagementWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireNonDestructiveWrite = nonDestructiveWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();

export const requireDestructiveWrite = destructiveWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .public();
