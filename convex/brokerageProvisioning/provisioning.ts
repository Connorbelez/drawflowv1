import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteAction,
  userManagementWriteMutation,
} from "../authz";
import type { BrokerMemberResolution } from "../brokerAssignments";
import {
  ensureBuilderBrokerAssignmentForWorkflow,
  requireDefaultBrokerMember,
  requireEligibleBrokerMember,
} from "../brokerAssignments";
import {
  FAIRLEND_BROKERAGE_NAME,
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "../fairLendConfig";
import { internalMutation } from "../fluent";
import type { Doc, Id, MutationCtx } from "../types";
import { queueIdentityInvitationEmail } from "../workosManagement/invitationEmails";

export const provisionBrokerageProfile = userManagementWriteMutation
  .input({
    displayName: v.optional(v.string()),
    legalName: v.optional(v.string()),
    principalBrokerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx, args) => {
    const membership = await requireProvisioningScope(
      ctx,
      args.workosOrganizationId
    );
    const now = Date.now();
    const organization = await requireWorkosOrganizationProjection(
      ctx,
      args.workosOrganizationId
    );
    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId)
      )
      .unique();
    const requestedPrincipalBrokerWorkosUserId =
      args.principalBrokerWorkosUserId?.trim() ||
      (hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])
        ? membership.workosUserId
        : undefined);
    const principal =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? await requireDefaultBrokerMember(ctx, {
            principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
            principalBrokerWorkosUserId: requestedPrincipalBrokerWorkosUserId,
            workosOrganizationId: args.workosOrganizationId,
          })
        : requestedPrincipalBrokerWorkosUserId
          ? {
              ...(await requireEligibleBrokerMember(ctx, {
                workosOrganizationId: args.workosOrganizationId,
                workosUserId: requestedPrincipalBrokerWorkosUserId,
              })),
              workosUserId: requestedPrincipalBrokerWorkosUserId,
            }
          : existing
            ? await requireDefaultBrokerMember(ctx, existing)
            : null;
    if (!principal) {
      throw new Error(
        "Configure an active principal broker before provisioning the brokerage."
      );
    }
    const principalBrokerEmail = normalizeEmail(principal.broker.email);
    if (!principalBrokerEmail) {
      throw new Error("The principal broker must have a valid email address.");
    }
    const displayName =
      args.displayName?.trim() ||
      (args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? FAIRLEND_BROKERAGE_NAME
        : organization.name);
    const legalName = args.legalName?.trim() || displayName;

    if (existing) {
      const priorState = {
        displayName: existing.displayName,
        legalName: existing.legalName,
        principalBrokerEmail: existing.principalBrokerEmail,
        principalBrokerWorkosUserId: existing.principalBrokerWorkosUserId,
        status: existing.status,
      };
      await ctx.db.patch(existing._id, {
        displayName,
        legalName,
        principalBrokerEmail,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
        updatedAt: now,
      });
      await recordBrokerageProvisioningAudit(ctx, {
        brokerageId: existing._id,
        newState: {
          displayName,
          legalName,
          principalBrokerEmail,
          principalBrokerWorkosUserId: principal.workosUserId,
          status: "active",
        },
        operation: "updated",
        organizationId: args.workosOrganizationId,
        priorState,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName,
      legalName,
      principalBrokerEmail,
      principalBrokerWorkosUserId: principal.workosUserId,
      status: "active",
      updatedAt: now,
      workosOrganizationId: args.workosOrganizationId,
    });
    await recordBrokerageProvisioningAudit(ctx, {
      brokerageId,
      newState: {
        displayName,
        legalName,
        principalBrokerEmail,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
      },
      operation: "created",
      organizationId: args.workosOrganizationId,
    });
    return { brokerageId, operation: "created" as const };
  })
  .public();

export const provisionFairLendBrokerage = userManagementWriteMutation
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx) => {
    const now = Date.now();
    await requireWorkosOrganizationProjection(
      ctx,
      FAIRLEND_WORKOS_ORGANIZATION_ID
    );
    const principal = await requireDefaultBrokerMember(ctx, {
      principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
      principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });

    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
      )
      .unique();
    if (existing) {
      const priorState = {
        displayName: existing.displayName,
        legalName: existing.legalName,
        principalBrokerEmail: existing.principalBrokerEmail,
        principalBrokerWorkosUserId: existing.principalBrokerWorkosUserId,
        status: existing.status,
      };
      await ctx.db.patch(existing._id, {
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
        updatedAt: now,
      });
      await recordBrokerageProvisioningAudit(ctx, {
        brokerageId: existing._id,
        newState: {
          displayName: FAIRLEND_BROKERAGE_NAME,
          legalName: FAIRLEND_BROKERAGE_NAME,
          principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
          principalBrokerWorkosUserId: principal.workosUserId,
          status: "active",
        },
        operation: "updated",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        priorState,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
      principalBrokerWorkosUserId: principal.workosUserId,
      status: "active",
      updatedAt: now,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    await recordBrokerageProvisioningAudit(ctx, {
      brokerageId,
      newState: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
      },
      operation: "created",
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    return { brokerageId, operation: "created" as const };
  })
  .public();

export type BuilderOnboardingMode =
  | "invite_new_owner"
  | "attach_existing_owner";

export interface CompleteBuilderOnboardingInput {
  actorRoles: readonly RoleSlug[];
  actorWorkosUserId: string;
  assignedBrokerWorkosUserId?: string;
  displayName: string;
  mode: BuilderOnboardingMode;
  now?: number;
  ownerEmail?: string;
  ownerName?: string;
  ownerWorkosUserId?: string;
  workosInvitationId?: string;
  workosOrganizationId: string;
}

export interface CompleteBuilderOnboardingResult {
  assignmentId: Id<"builderBrokerAssignments">;
  assignmentOperation: "assigned" | "reassigned" | "repaired" | "unchanged";
  brokerage: Doc<"brokerages">;
  builderProfile: Doc<"builderProfiles">;
  builderProfileId: Id<"builderProfiles">;
  linkId: Id<"builderAccountLinks"> | null;
  profileOperation: "created" | "reactivated";
}

/**
 * Complete the application-owned part of builder onboarding.
 *
 * WorkOS users and memberships are resolved from their webhook projections;
 * this command only writes DrawFlow brokerage, builder, link, assignment, and
 * audit rows. Surface handlers own authorization and any external invitation.
 */
export async function completeBuilderOnboarding(
  ctx: MutationCtx,
  input: CompleteBuilderOnboardingInput
): Promise<CompleteBuilderOnboardingResult> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("A builder company name is required.");
  }

  const ownerWorkosUserId = input.ownerWorkosUserId?.trim() || undefined;
  const assignedBrokerWorkosUserId =
    input.assignedBrokerWorkosUserId?.trim() || undefined;
  if (input.mode === "invite_new_owner" && !ownerWorkosUserId) {
    throw new Error("A WorkOS owner user is required for a new-owner invite.");
  }
  await requireWorkosOrganizationProjection(ctx, input.workosOrganizationId);
  const now = input.now ?? Date.now();
  const { brokerage, principal } = await ensureOnboardingBrokerage(
    ctx,
    input.workosOrganizationId,
    now
  );

  if (displayName.toLowerCase() === brokerage.displayName.toLowerCase()) {
    throw new Error(
      "A builder profile must use the builder's own company name, not the brokerage name."
    );
  }

  const ensuredProfile = await ensureBuilderProfile(ctx, {
    brokerage,
    displayName,
    now,
    ownerWorkosUserId,
    organizationId: input.workosOrganizationId,
  });
  const ownerLink = await ensureBuilderOwnerLink(ctx, {
    brokerageId: brokerage._id,
    builderProfileId: ensuredProfile.builderProfile._id,
    now,
    ownerWorkosUserId,
  });
  const { builderProfile } = ensuredProfile;

  if (assignedBrokerWorkosUserId) {
    await requireEligibleBrokerMember(ctx, {
      workosOrganizationId: input.workosOrganizationId,
      workosUserId: assignedBrokerWorkosUserId,
    });
  }
  const assignment = await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    assignedBrokerWorkosUserId:
      assignedBrokerWorkosUserId ?? principal.workosUserId,
    brokerage,
    builderProfile,
    command: "completeBuilderOnboarding",
    now,
    reason:
      input.mode === "invite_new_owner"
        ? "Completing new-owner builder onboarding with an active broker assignment."
        : "Completing existing-owner builder onboarding with an active broker assignment.",
  });

  if (input.workosInvitationId) {
    if (!input.ownerEmail) {
      throw new Error("A valid owner email is required for an invitation.");
    }
    await queueIdentityInvitationEmail(ctx, {
      brokerageId: brokerage._id,
      email: input.ownerEmail,
      organizationId: input.workosOrganizationId,
      recipientName: input.ownerName,
      relatedEntityId: String(builderProfile._id),
      relatedEntityType: "builderProfile",
      roleSlug: "builder",
      workosInvitationId: input.workosInvitationId,
    });
  }

  const actorRoles = normalizeRoleSlugs(input.actorRoles);
  await ctx.db.insert("auditEvents", {
    ...(actorRoles.includes("principle-broker")
      ? { actorRole: "principle-broker" as const }
      : actorRoles.includes("admin")
        ? { actorRole: "admin" as const }
        : {}),
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: brokerage._id,
    command: "completeBuilderOnboarding",
    createdAt: now,
    entityId: String(builderProfile._id),
    entityType: "builderProfile",
    eventType: "builder.onboarding.completed",
    newState: JSON.stringify({
      assignmentId: assignment.assignmentId,
      builderProfileId: builderProfile._id,
      linkId: ownerLink.linkId,
      mode: input.mode,
      profileStatus: "active",
    }),
    organizationId: input.workosOrganizationId,
    ...(ensuredProfile.priorState
      ? {
          priorState: JSON.stringify({
            ...ensuredProfile.priorState,
            ownerLinkExisted: ownerLink.existed,
          }),
        }
      : {}),
    reason:
      input.mode === "invite_new_owner"
        ? "Completed the WorkOS-invited owner and builder profile onboarding workflow."
        : "Completed the existing-owner builder profile onboarding workflow.",
    reconciliationKey: `builder-onboarding:${input.workosOrganizationId}:${builderProfile._id}:${now}`,
    warnings: [],
  });

  return {
    assignmentId: assignment.assignmentId,
    assignmentOperation: assignment.operation,
    brokerage,
    builderProfile,
    builderProfileId: builderProfile._id,
    linkId: ownerLink.linkId,
    profileOperation: ensuredProfile.profileOperation,
  };
}

async function findOwnerLinkedBuilderProfiles(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    workosUserId: string;
  }
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .collect();
  const profiles: Doc<"builderProfiles">[] = [];
  for (const link of links) {
    if (link.brokerageId !== input.brokerageId) {
      continue;
    }
    const profile = await ctx.db.get(link.builderProfileId);
    if (!profile) {
      continue;
    }
    if (profile.organizationId !== input.organizationId) {
      throw new Error(
        "The builder account link has an invalid organization scope."
      );
    }
    if (!profiles.some((candidate) => candidate._id === profile._id)) {
      profiles.push(profile);
    }
  }
  return profiles;
}

async function ensureOnboardingBrokerage(
  ctx: MutationCtx,
  workosOrganizationId: string,
  now: number
) {
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!existing && workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
    throw new Error(
      "Provision a brokerage profile for this organization before adding a builder."
    );
  }

  const principal = await requireDefaultBrokerMember(
    ctx,
    existing ?? {
      principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
      principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
      workosOrganizationId,
    }
  );
  return {
    brokerage: await ensureBrokerage(ctx, workosOrganizationId, now, principal),
    principal,
  };
}

async function ensureBuilderProfile(
  ctx: MutationCtx,
  input: {
    brokerage: Doc<"brokerages">;
    displayName: string;
    now: number;
    organizationId: string;
    ownerWorkosUserId?: string;
  }
) {
  const ownerLinkedProfiles = input.ownerWorkosUserId
    ? await findOwnerLinkedBuilderProfiles(ctx, {
        brokerageId: input.brokerage._id,
        organizationId: input.organizationId,
        workosUserId: input.ownerWorkosUserId,
      })
    : [];
  if (ownerLinkedProfiles.length > 1) {
    throw new Error(
      "The owner is linked to multiple builder profiles in this brokerage. Resolve the duplicate builder links before onboarding."
    );
  }

  const existing =
    ownerLinkedProfiles[0] ??
    (await ctx.db
      .query("builderProfiles")
      .withIndex("by_brokerage", (q) =>
        q.eq("brokerageId", input.brokerage._id)
      )
      .filter((q) => q.eq(q.field("displayName"), input.displayName))
      .first());
  const priorState = existing
    ? {
        builderProfileId: existing._id,
        displayName: existing.displayName,
        status: existing.status,
      }
    : undefined;
  const builderProfileId = existing
    ? existing._id
    : await ctx.db.insert("builderProfiles", {
        brokerageId: input.brokerage._id,
        createdAt: input.now,
        displayName: input.displayName,
        legalName: input.displayName,
        organizationId: input.organizationId,
        status: "active",
        updatedAt: input.now,
      });
  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName: input.displayName,
      status: "active",
      updatedAt: input.now,
    });
  }

  const builderProfile = await ctx.db.get(builderProfileId);
  if (!builderProfile) {
    throw new Error(
      "The builder profile could not be loaded after provisioning."
    );
  }
  return {
    builderProfile,
    priorState,
    profileOperation: existing
      ? ("reactivated" as const)
      : ("created" as const),
  };
}

async function ensureBuilderOwnerLink(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    builderProfileId: Id<"builderProfiles">;
    now: number;
    ownerWorkosUserId?: string;
  }
) {
  if (!input.ownerWorkosUserId) {
    return { existed: false, linkId: null as Id<"builderAccountLinks"> | null };
  }

  const ownerLinks = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", input.builderProfileId)
        .eq("workosUserId", input.ownerWorkosUserId as string)
    )
    .collect();
  if (ownerLinks.length > 1) {
    throw new Error(
      "The owner has duplicate links to this builder profile. Resolve the duplicate builder links before onboarding."
    );
  }
  const existing = ownerLinks[0];
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: "owner",
      status: "active",
      updatedAt: input.now,
    });
    return { existed: true, linkId: existing._id };
  }
  const linkId = await ctx.db.insert("builderAccountLinks", {
    brokerageId: input.brokerageId,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    role: "owner",
    status: "active",
    updatedAt: input.now,
    workosUserId: input.ownerWorkosUserId,
  });
  return { existed: false, linkId };
}

export const provisionBuilderProfile = userManagementWriteMutation
  .input({
    assignedBrokerWorkosUserId: v.optional(v.string()),
    displayName: v.string(),
    ownerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      linkId: v.union(v.id("builderAccountLinks"), v.null()),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx, args) => {
    await requireProvisioningScope(ctx, args.workosOrganizationId);
    const result = await completeBuilderOnboarding(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      assignedBrokerWorkosUserId: args.assignedBrokerWorkosUserId,
      displayName: args.displayName,
      mode: "attach_existing_owner",
      ownerWorkosUserId: args.ownerWorkosUserId,
      workosOrganizationId: args.workosOrganizationId,
    });
    return {
      builderProfileId: result.builderProfileId,
      linkId: result.linkId,
      operation:
        result.profileOperation === "created"
          ? ("created" as const)
          : "updated",
    };
  })
  .public();

export const linkBuilderAccount = userManagementWriteMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    role: v.union(v.literal("owner"), v.literal("staff")),
    workosUserId: v.string(),
  })
  .returns(
    v.object({
      linkId: v.id("builderAccountLinks"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireProvisioningScope(ctx, profile.organizationId);
    const brokerage = await ctx.db.get(profile.brokerageId);
    if (brokerage?.status !== "active") {
      throw new Error("Builder brokerage is not active.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (q) =>
        q
          .eq("builderProfileId", args.builderProfileId)
          .eq("workosUserId", args.workosUserId)
      )
      .unique();
    let linkId: Id<"builderAccountLinks">;
    let operation: "created" | "updated";
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        updatedAt: now,
      });
      linkId = existing._id;
      operation = "updated";
    } else {
      linkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: profile.brokerageId,
        builderProfileId: args.builderProfileId,
        createdAt: now,
        role: args.role,
        status: "active",
        updatedAt: now,
        workosUserId: args.workosUserId,
      });
      operation = "created";
    }

    await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerage,
      builderProfile: profile,
      command: "linkBuilderAccount",
      now,
      reason:
        "Validating the principal broker assignment while linking a builder account.",
    });

    return { linkId, operation };
  })
  .public();

export const unlinkBuilderAccount = userManagementWriteMutation
  .input({
    linkId: v.id("builderAccountLinks"),
  })
  .returns(v.object({ operation: v.literal("removed") }))
  .handler(async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Builder account link not found.");
    }
    const profile = await ctx.db.get(link.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireProvisioningScope(ctx, profile.organizationId);
    await ctx.db.patch(args.linkId, {
      status: "inactive",
      updatedAt: Date.now(),
    });
    return { operation: "removed" as const };
  })
  .public();

type ProvisionNewBuilderResult = {
  brokerageId: Id<"brokerages">;
  builderProfileId: Id<"builderProfiles">;
  displayName: string;
  invite: {
    adapter: string;
    status: string;
    sync: string;
    workosInviteId: string;
  };
  linkId: Id<"builderAccountLinks">;
  operation: "created" | "reactivated";
  ownerEmail: string;
  ownerWorkosUserId: string;
  workosOrganizationId: string;
};

const provisionNewBuilderReturn = v.object({
  brokerageId: v.id("brokerages"),
  builderProfileId: v.id("builderProfiles"),
  displayName: v.string(),
  invite: v.object({
    adapter: v.string(),
    status: v.string(),
    sync: v.string(),
    workosInviteId: v.string(),
  }),
  linkId: v.id("builderAccountLinks"),
  operation: v.union(v.literal("created"), v.literal("reactivated")),
  ownerEmail: v.string(),
  ownerWorkosUserId: v.string(),
  workosOrganizationId: v.string(),
});

/**
 * Orchestrates new-builder onboarding from the brokerage backoffice:
 *   1. create a WorkOS account for the builder owner (invitation),
 *   2. provision the builder profile + owner account link under the brokerage.
 *
 * Account creation is a WorkOS-owned write, so this is an action that calls the
 * WorkOS adapter first, then commits the local projection + domain rows through
 * an internal mutation. Idempotent: re-running for the same email reactivates
 * the existing profile/link instead of duplicating rows.
 */
export const provisionNewBuilder = userManagementWriteAction
  .input({
    displayName: v.string(),
    ownerEmail: v.string(),
    ownerName: v.optional(v.string()),
    ownerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.optional(v.string()),
  })
  .returns(provisionNewBuilderReturn)
  .handler(async (ctx, args): Promise<ProvisionNewBuilderResult> => {
    const workosOrganizationId =
      args.workosOrganizationId?.trim() || FAIRLEND_WORKOS_ORGANIZATION_ID;
    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("Builder company name is required.");
    }
    const ownerEmail = normalizeEmail(args.ownerEmail);
    if (!ownerEmail) {
      throw new Error("A valid owner email is required.");
    }
    const ownerName = args.ownerName?.trim() || displayName;
    const ownerWorkosUserId =
      args.ownerWorkosUserId?.trim() ||
      provisionedBuilderWorkosUserId(ownerEmail);
    // Step 1: create the WorkOS account (invitation) for the builder owner.
    const invite = await ctx.runAction(
      internal.workosManagement.inviteBuilderUser,
      {
        email: ownerEmail,
        organizationId: workosOrganizationId,
      }
    );
    const resolvedOwnerWorkosUserId =
      invite.workosUserId ?? ownerWorkosUserId;

    // Step 2: commit the brokerage-scoped builder profile + owner link locally.
    const committed: {
      brokerageId: Id<"brokerages">;
      builderProfileId: Id<"builderProfiles">;
      displayName: string;
      linkId: Id<"builderAccountLinks">;
      operation: "created" | "reactivated";
    } = await ctx.runMutation(
      internal.brokerageProvisioning.completeBuilderOnboardingCommand,
      {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        displayName,
        mode: "invite_new_owner",
        ownerEmail,
        ownerName,
        ownerWorkosUserId: resolvedOwnerWorkosUserId,
        ...(invite.adapter === "workos" && invite.workosId
          ? { workosInvitationId: invite.workosId }
          : {}),
        workosOrganizationId,
      }
    );

    return {
      ...committed,
      invite: {
        adapter: invite.adapter,
        status: invite.status,
        sync: invite.sync,
        workosInviteId: invite.workosId ?? "",
      },
      ownerEmail,
      ownerWorkosUserId: resolvedOwnerWorkosUserId,
      workosOrganizationId,
    };
  })
  .public();

export const completeBuilderOnboardingCommand = internalMutation
  .input({
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    displayName: v.string(),
    mode: v.union(
      v.literal("invite_new_owner"),
      v.literal("attach_existing_owner")
    ),
    ownerEmail: v.string(),
    ownerName: v.string(),
    ownerWorkosUserId: v.string(),
    workosInvitationId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      builderProfileId: v.id("builderProfiles"),
      displayName: v.string(),
      linkId: v.id("builderAccountLinks"),
      operation: v.union(v.literal("created"), v.literal("reactivated")),
    })
  )
  .handler(async (ctx, args) => {
    const result = await completeBuilderOnboarding(ctx, {
      actorRoles: normalizeRoleSlugs(args.actorRoles),
      actorWorkosUserId: args.actorWorkosUserId,
      displayName: args.displayName,
      mode: args.mode,
      ownerEmail: args.ownerEmail,
      ownerName: args.ownerName,
      ownerWorkosUserId: args.ownerWorkosUserId,
      workosInvitationId: args.workosInvitationId,
      workosOrganizationId: args.workosOrganizationId,
    });

    return {
      brokerageId: result.brokerage._id,
      builderProfileId: result.builderProfileId,
      displayName: result.builderProfile.displayName,
      linkId: result.linkId as Id<"builderAccountLinks">,
      operation:
        result.profileOperation === "created"
          ? ("created" as const)
          : ("reactivated" as const),
    };
  })
  .internal();

async function requireProvisioningScope(
  ctx: MutationCtx & {
    viewer: { roles: RoleSlug[]; subject: string };
  },
  workosOrganizationId: string
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", ctx.viewer.subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();

  if (ctx.viewer.roles.includes("admin")) {
    return (
      membership ?? {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        status: "active",
        workosMembershipId: `platform_admin:${ctx.viewer.subject}`,
        workosOrganizationId,
        workosUserId: ctx.viewer.subject,
      }
    );
  }

  if (membership?.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  if (!hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])) {
    throw new Error("Forbidden: brokerage provisioning");
  }
  return membership;
}

async function requireWorkosOrganizationProjection(
  ctx: MutationCtx,
  workosOrganizationId: string
) {
  const organization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!organization || organization.status !== "active") {
    throw new Error(
      "Wait for the authoritative WorkOS organization projection before provisioning."
    );
  }
  return organization;
}

function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
) {
  return normalizeRoleSlugs([
    membership.roleSlug,
    ...(membership.roleSlugs ?? []),
  ]);
}

function hasAnyRole(
  actual: readonly RoleSlug[],
  expected: readonly RoleSlug[]
) {
  return actual.some((role) => expected.includes(role));
}

async function recordBrokerageProvisioningAudit(
  ctx: MutationCtx & { viewer: { roles: string[]; subject: string } },
  input: {
    brokerageId: Id<"brokerages">;
    newState: unknown;
    operation: "created" | "updated";
    organizationId: string;
    priorState?: unknown;
  }
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRole: ctx.viewer.roles.includes("principle-broker")
      ? "principle-broker"
      : "admin",
    actorRoles: ctx.viewer.roles,
    actorWorkosUserId: ctx.viewer.subject,
    brokerageId: input.brokerageId,
    command: "provisionBrokerageProfile",
    entityId: input.brokerageId,
    entityType: "brokerage",
    eventType: `brokerage.provisioning.${input.operation}`,
    newState: JSON.stringify(input.newState),
    organizationId: input.organizationId,
    ...(input.priorState === undefined
      ? {}
      : { priorState: JSON.stringify(input.priorState) }),
    reason:
      "Provision or reconcile the canonical brokerage and Principal Broker mapping.",
    reconciliationKey: `brokerage-provisioning:${input.organizationId}:${input.operation}:${now}`,
    warnings: [],
    createdAt: now,
  });
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  // Minimal structural check: exactly one @ with non-empty local and domain parts.
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "";
  }
  if (!trimmed.slice(at + 1).includes(".")) {
    return "";
  }
  return trimmed;
}

/**
 * Deterministic provisional WorkOS user id for the product-owned builder link.
 * Authoritative WorkOS user and membership projections still arrive only from
 * WorkOS webhook reconciliation. Stable for a given email.
 */
function provisionedBuilderWorkosUserId(email: string): string {
  const slug = email.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `provisioned_builder_${slug}`;
}

async function ensureBrokerage(
  ctx: MutationCtx,
  workosOrganizationId: string,
  now: number,
  principal: Extract<BrokerMemberResolution, { ok: true }>
): Promise<Doc<"brokerages">> {
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (existing) {
    const principalPatch =
      workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? {
            principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
            principalBrokerWorkosUserId: principal.workosUserId,
          }
        : {
            principalBrokerEmail:
              normalizeEmail(principal.broker.email) ||
              existing.principalBrokerEmail,
            principalBrokerWorkosUserId: principal.workosUserId,
          };
    if (
      existing.status !== "active" ||
      existing.principalBrokerEmail !== principalPatch.principalBrokerEmail ||
      existing.principalBrokerWorkosUserId !==
        principalPatch.principalBrokerWorkosUserId
    ) {
      await ctx.db.patch(existing._id, {
        ...principalPatch,
        status: "active",
        updatedAt: now,
      });
      return {
        ...existing,
        ...principalPatch,
        status: "active",
      };
    }
    return existing;
  }
  if (workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
    throw new Error(
      "Provision a brokerage profile for this organization before adding a builder."
    );
  }
  const brokerageId = await ctx.db.insert("brokerages", {
    createdAt: now,
    displayName: FAIRLEND_BROKERAGE_NAME,
    legalName: FAIRLEND_BROKERAGE_NAME,
    principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
    principalBrokerWorkosUserId: principal.workosUserId,
    status: "active",
    updatedAt: now,
    workosOrganizationId,
  });
  const brokerage = await ctx.db.get(brokerageId);
  if (!brokerage) {
    throw new Error("Unable to provision FairLend brokerage.");
  }
  return brokerage;
}
