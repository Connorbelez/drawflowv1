/**
 * Production proposals notification delivery helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { type Doc, type MutationCtx } from "../types";
import { normalizeOptionalString } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES } from "./contracts_foundation.js";

export type ActiveBuildDeliveryAuth = {
  brokerage: Doc<"brokerages">;
  build: Doc<"activeBuilds">;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
};

async function activeBuilderRecipientWorkosUserIds(
  ctx: MutationCtx,
  auth: ActiveBuildDeliveryAuth,
) {
  const builderProfileId = auth.proposal.builderProfileId;
  if (!builderProfileId) {
    return [];
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (q) => q.eq("builderProfileId", builderProfileId))
    .collect();
  return [
    ...new Set(
      links
        .filter(
          (link) =>
            link.status === "active" && link.brokerageId === auth.brokerage._id,
        )
        .map((link) => link.workosUserId),
    ),
  ];
}

export async function upsertBuilderMilestoneDecisionDeliveries(
  ctx: MutationCtx,
  input: {
    auth: ActiveBuildDeliveryAuth;
    milestone: Doc<"buildMilestones">;
    note?: string;
    status: "approved" | "rejected";
  },
) {
  const recipients = await activeBuilderRecipientWorkosUserIds(ctx, input.auth);
  const now = Date.now();
  const rejected = input.status === "rejected";
  const dedupeKey = `milestone-decision:${input.auth.build._id}:${input.milestone.key}:${input.status}`;
  const title = rejected
    ? `${input.milestone.name} changes requested`
    : `${input.milestone.name} approved`;
  const body =
    normalizeOptionalString(input.note) ??
    (rejected
      ? "Review the lender decision and update the milestone before resubmitting."
      : "The milestone review is complete. Open the build to review the approved state.");

  for (const recipientWorkosUserId of recipients) {
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.auth.build.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey),
      )
      .first();
    const delivery = {
      actionLabel: rejected ? "Review milestone" : "View milestone",
      actionRequired: rejected,
      body,
      createdAt: now,
      entityId: String(input.auth.build._id),
      entityLabel: `${input.auth.build.buildName} · ${input.milestone.name}`,
      entityType: "activeBuild",
      href: `/builder/builds/${input.auth.build._id}?milestone=${encodeURIComponent(input.milestone.key)}`,
      resolutionMode: "domain" as const,
      sourceLabel: "Lender Admin",
      status: "unread" as const,
      title,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, delivery);
    } else {
      await ctx.db.insert("recipientDeliveries", {
        ...delivery,
        brokerageId: input.auth.brokerage._id,
        dedupeKey,
        organizationId: input.auth.build.organizationId,
        recipientWorkosUserId,
      });
    }
  }
}

export async function upsertBuilderDrawDecisionDeliveries(
  ctx: MutationCtx,
  input: {
    auth: ActiveBuildDeliveryAuth;
    draw: Doc<"activeBuildDrawRequests">;
    note?: string;
    status: "approved" | "rejected" | "released" | "cancelled";
  },
) {
  const recipients = await activeBuilderRecipientWorkosUserIds(ctx, input.auth);
  const now = Date.now();
  const rejected = input.status === "rejected";
  const released = input.status === "released";
  const cancelled = input.status === "cancelled";
  const dedupeKey = `draw-decision:${input.auth.build._id}:${input.draw.requestKey}:${input.status}`;
  const title = rejected
    ? `${input.draw.displayId} changes requested`
    : released
      ? `${input.draw.displayId} funds released`
      : cancelled
        ? `${input.draw.displayId} cancelled`
        : `${input.draw.displayId} approved`;
  const body =
    normalizeOptionalString(input.note) ??
    (rejected
      ? "Review the lender decision, correct the request, and submit it again."
      : released
        ? "Confirm receipt of the released reimbursement and report any settlement discrepancy."
        : cancelled
          ? "The draw request was cancelled by Lender Admin and will not be released."
          : "The draw is approved and is waiting for Lender Admin release authority.");
  for (const recipientWorkosUserId of recipients) {
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.auth.build.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey),
      )
      .first();
    const delivery = {
      actionLabel: rejected
        ? "Correct draw request"
        : released
          ? "Acknowledge release"
          : "View draw",
      actionRequired: rejected || released || cancelled,
      body,
      createdAt: now,
      entityId: String(input.auth.build._id),
      entityLabel: `${input.auth.build.buildName} · ${input.draw.displayId}`,
      entityType: "activeBuild",
      href: `/builder/builds/${input.auth.build._id}?tab=details&rail=open`,
      resolutionMode: (released ? "recipient" : "domain") as
        | "domain"
        | "recipient",
      sourceLabel: released || cancelled ? "Lender Admin" : "Lender Operations",
      status: "unread" as const,
      title,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, delivery);
    } else {
      await ctx.db.insert("recipientDeliveries", {
        ...delivery,
        brokerageId: input.auth.brokerage._id,
        dedupeKey,
        organizationId: input.auth.build.organizationId,
        recipientWorkosUserId,
      });
    }
  }
}

export async function upsertBackofficeSiteVisitReportDeliveries(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    reportNotes: string;
    visit: Pick<Doc<"buildSiteVisits">, "visitId">;
  },
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (q) =>
      q.eq("workosOrganizationId", input.build.organizationId),
    )
    .collect();
  const recipients = new Set(
    memberships
      .filter(
        (membership) =>
          membership.status === "active" &&
          [membership.roleSlug, ...membership.roleSlugs].some(
            (role) =>
              role !== undefined &&
              (BACKOFFICE_ROLES as readonly string[]).includes(role),
          ),
      )
      .map((membership) => membership.workosUserId),
  );
  const dedupeKey = `site-visit-report:${input.build._id}:${input.visit.visitId}`;
  const now = Date.now();
  for (const recipientWorkosUserId of recipients) {
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.build.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey),
      )
      .first();
    const delivery = {
      actionLabel: "Review site visit",
      actionRequired: true,
      body:
        input.reportNotes ||
        "A site visitor submitted a recommendation for lender review.",
      createdAt: now,
      entityId: String(input.build._id),
      entityLabel: `${input.build.buildName} · ${input.milestone.name}`,
      entityType: "activeBuild",
      href: `/backoffice/builds/${input.build._id}?milestone=${encodeURIComponent(input.milestone.key)}&rail=open`,
      resolutionMode: "domain" as const,
      sourceLabel: "Site Visit Staff",
      status: "unread" as const,
      title: `${input.milestone.name} site visit submitted`,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, delivery);
    } else {
      await ctx.db.insert("recipientDeliveries", {
        ...delivery,
        brokerageId: input.build.brokerageId,
        dedupeKey,
        organizationId: input.build.organizationId,
        recipientWorkosUserId,
      });
    }
  }
}

export async function upsertBackofficeUnassignedEvidenceDeliveries(
  ctx: MutationCtx,
  input: {
    asset: Doc<"buildEvidenceAssets">;
    build: Doc<"activeBuilds">;
    targetLabel: string;
  },
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (q) =>
      q.eq("workosOrganizationId", input.build.organizationId),
    )
    .collect();
  const recipients = new Set(
    memberships
      .filter(
        (membership) =>
          membership.status === "active" &&
          [membership.roleSlug, ...membership.roleSlugs].some(
            (role) =>
              role !== undefined &&
              (BACKOFFICE_ROLES as readonly string[]).includes(role),
          ),
      )
      .map((membership) => membership.workosUserId),
  );
  const dedupeKey = `evidence-target-unassigned:${input.build._id}:${input.asset._id}`;
  const now = Date.now();
  const body = `${input.asset.label} was preserved, but target ${input.targetLabel} is no longer active or could not be found. Lender review is required.`;
  for (const recipientWorkosUserId of recipients) {
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.build.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey),
      )
      .first();
    const delivery = {
      actionLabel: "Review Evidence",
      actionRequired: true,
      body,
      createdAt: now,
      entityId: String(input.build._id),
      entityLabel: `${input.build.buildName} · ${input.asset.fileName}`,
      entityType: "activeBuild",
      href: `/backoffice/builds/${input.build._id}?milestone=${encodeURIComponent(input.asset.milestoneKey)}&rail=open`,
      resolutionMode: "domain" as const,
      sourceLabel: "Site Visit Staff",
      status: "unread" as const,
      title: "Site Visit Evidence needs assignment",
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, delivery);
    } else {
      await ctx.db.insert("recipientDeliveries", {
        ...delivery,
        brokerageId: input.build.brokerageId,
        dedupeKey,
        organizationId: input.build.organizationId,
        recipientWorkosUserId,
      });
    }
  }
}

export async function resolveBuilderMilestoneDecisionDeliveries(
  ctx: MutationCtx,
  input: {
    auth: ActiveBuildDeliveryAuth;
    milestone: Doc<"buildMilestones">;
    status: "approved" | "rejected";
  },
) {
  const recipients = await activeBuilderRecipientWorkosUserIds(ctx, input.auth);
  const dedupeKey = `milestone-decision:${input.auth.build._id}:${input.milestone.key}:${input.status}`;
  const now = Date.now();
  for (const recipientWorkosUserId of recipients) {
    const delivery = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.auth.build.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey),
      )
      .first();
    if (delivery && delivery.status !== "resolved") {
      await ctx.db.patch(delivery._id, { status: "resolved", updatedAt: now });
    }
  }
}
