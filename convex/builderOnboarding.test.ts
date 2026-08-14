/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import {
  FAIRLEND_BROKERAGE_NAME,
  FAIRLEND_DEFAULT_BROKER_EMAIL,
} from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const FAIRLEND_ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";
const fixtureTime = "2026-05-01T00:00:00.000Z";

function identity(roles: string[], subject: string) {
  return {
    email: `${subject}@example.com`,
    name: subject,
    organizationId: FAIRLEND_ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any;
}

function asRole(
  base: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
) {
  return base.withIdentity(identity(roles, subject));
}

async function projectActiveWorkosMembership(
  base: ReturnType<typeof convexTest>,
  input: {
    email: string;
    membershipId?: string;
    roleSlugs: string[];
    userId: string;
  },
) {
  const eventKey = input.userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  await base.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data: {
      created_at: fixtureTime,
      email: input.email,
      email_verified: true,
      first_name: input.userId,
      id: input.userId,
      updated_at: fixtureTime,
    },
    event: "user.created",
    id: `evt_test_user_${eventKey}`,
  });
  await base.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data: {
      created_at: fixtureTime,
      directory_managed: false,
      id: input.membershipId ?? `om_test_${eventKey}`,
      organization_id: FAIRLEND_ORG,
      role: { slug: input.roleSlugs[0] },
      roles: input.roleSlugs.map((slug) => ({ slug })),
      status: "active",
      updated_at: fixtureTime,
      user_id: input.userId,
    },
    event: "organization_membership.created",
    id: `evt_test_membership_${eventKey}`,
  });
}

async function reconcileProvisionedBuilder(
  base: ReturnType<typeof convexTest>,
  provisioned: { ownerEmail: string; ownerWorkosUserId: string },
) {
  await projectActiveWorkosMembership(base, {
    email: provisioned.ownerEmail,
    roleSlugs: ["builder"],
    userId: provisioned.ownerWorkosUserId,
  });
}

/**
 * Bootstrap the FairLend brokerage and the principal broker membership on a
 * shared in-memory instance, then return the broker-scoped handle.
 */
async function bootstrappedBroker() {
  const base = convexTest(schema, modules);
  const broker = asRole(base, ["principle-broker"], PRINCIPAL_BROKER);
  await broker.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data: {
      created_at: fixtureTime,
      domains: [],
      id: FAIRLEND_ORG,
      name: FAIRLEND_BROKERAGE_NAME,
      updated_at: fixtureTime,
    },
    event: "organization.created",
    id: "evt_test_fairlend_organization",
  });
  await broker.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data: {
      created_at: fixtureTime,
      email: FAIRLEND_DEFAULT_BROKER_EMAIL,
      email_verified: true,
      first_name: "Elie",
      id: PRINCIPAL_BROKER,
      last_name: "Soberano",
      updated_at: fixtureTime,
    },
    event: "user.created",
    id: "evt_test_fairlend_principal",
  });
  await broker.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data: {
      created_at: fixtureTime,
      directory_managed: false,
      id: "om_test_fairlend_principal",
      organization_id: FAIRLEND_ORG,
      role: { slug: "principle-broker" },
      roles: [{ slug: "principle-broker" }],
      status: "active",
      updated_at: fixtureTime,
      user_id: PRINCIPAL_BROKER,
    },
    event: "organization_membership.created",
    id: "evt_test_fairlend_principal_membership",
  });
  await broker.mutation(
    (api as any).brokerageProvisioning.provisionFairLendBrokerage,
    {},
  );
  return { base, broker };
}

describe("new builder onboarding", () => {
  test("brokerage provisioning preserves the organization name projected from WorkOS", async () => {
    const workosOrganizationId = "org_test_organization";
    const principalBrokerWorkosUserId = "user_test_principal";
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "TestOrganization",
        sourceEventId: "evt_test_organization",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId,
      });
      await ctx.db.insert("users", {
        authId: principalBrokerWorkosUserId,
        email: "principal@test-organization.example",
        name: "Test Principal",
        sourceEventId: "evt_test_principal",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: principalBrokerWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "evt_test_principal_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_test_principal",
        workosOrganizationId,
        workosUserId: principalBrokerWorkosUserId,
      });
    });

    await admin.mutation(
      (api as any).brokerageProvisioning.provisionBrokerageProfile,
      {
        displayName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerWorkosUserId,
        workosOrganizationId,
      },
    );

    const provisioning = await admin.query(
      (api as any).brokerageProvisioning.listBrokerageProvisioning,
      {},
    );
    expect(
      provisioning.organizations.find(
        (organization: any) =>
          organization.workosOrganizationId === workosOrganizationId,
      ),
    ).toMatchObject({
      name: "TestOrganization",
      workosOrganizationId,
    });
    const audits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_createdAt", (q: any) =>
          q.eq("organizationId", workosOrganizationId),
        )
        .collect(),
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorWorkosUserId: "user_admin",
          eventType: "brokerage.provisioning.created",
          organizationId: workosOrganizationId,
        }),
      ]),
    );
  });

  test("brokerage provisioning waits for the authoritative WorkOS organization projection", async () => {
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    await expect(
      admin.mutation(
        (api as any).brokerageProvisioning.provisionBrokerageProfile,
        {
          displayName: "Pending Projection Brokerage",
          principalBrokerWorkosUserId: "user_pending_principal",
          workosOrganizationId: "org_pending_projection",
        },
      ),
    ).rejects.toThrow(/authoritative WorkOS organization projection/i);

    const rows = await admin.run(async (ctx: any) => ({
      brokerages: await ctx.db.query("brokerages").collect(),
      organizations: await ctx.db.query("workosOrganizations").collect(),
    }));
    expect(rows.brokerages).toHaveLength(0);
    expect(rows.organizations).toHaveLength(0);
  });

  test("standalone brokerages resolve their stored principal email after a WorkOS id change", async () => {
    const workosOrganizationId = "org_rotated_principal";
    const originalPrincipalWorkosUserId = "user_original_principal";
    const currentPrincipalWorkosUserId = "user_current_principal";
    const principalEmail = "principal@rotated-brokerage.example";
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    let originalUserId: string;
    let originalMembershipId: string;
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Rotated Brokerage",
        sourceEventId: "evt_rotated_brokerage",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId,
      });
      originalUserId = await ctx.db.insert("users", {
        authId: originalPrincipalWorkosUserId,
        email: principalEmail,
        name: "Original Principal",
        sourceEventId: "evt_original_principal",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: originalPrincipalWorkosUserId,
      });
      originalMembershipId = await ctx.db.insert(
        "workosOrganizationMemberships",
        {
          roleSlug: "principle-broker",
          roleSlugs: ["principle-broker"],
          sourceEventId: "evt_original_principal_membership",
          sourceEventType: "organization_membership.created",
          status: "active",
          workosMembershipId: "om_original_principal",
          workosOrganizationId,
          workosUserId: originalPrincipalWorkosUserId,
        },
      );
    });
    await admin.mutation(
      (api as any).brokerageProvisioning.provisionBrokerageProfile,
      {
        displayName: "Rotated Brokerage",
        principalBrokerWorkosUserId: originalPrincipalWorkosUserId,
        workosOrganizationId,
      },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(originalUserId, { status: "deleted" });
      await ctx.db.patch(originalMembershipId, { status: "deleted" });
      await ctx.db.insert("users", {
        authId: currentPrincipalWorkosUserId,
        email: principalEmail,
        name: "Current Principal",
        sourceEventId: "evt_current_principal",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: currentPrincipalWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "evt_current_principal_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_current_principal",
        workosOrganizationId,
        workosUserId: currentPrincipalWorkosUserId,
      });
    });

    const provisioned = await admin.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Rotated Principal Builder",
        ownerWorkosUserId: "user_rotated_principal_owner",
        workosOrganizationId,
      },
    );
    const assignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .unique(),
    );

    expect(assignment.assignedBrokerWorkosUserId).toBe(
      currentPrincipalWorkosUserId,
    );
  });

  test("provisionNewBuilder creates a WorkOS account, builder profile, and owner link", async () => {
    const { broker } = await bootstrappedBroker();

    const result = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Northgate Builders",
        ownerEmail: "Lead@Northgate.com",
        ownerName: "Jamie Lead",
      },
    );

    // WorkOS account creation step ran (invitation accepted, waiting for webhook).
    expect(result.invite).toMatchObject({
      adapter: "fake",
      status: "accepted",
      sync: "waiting-for-webhook",
    });
    expect(result.operation).toBe("created");
    expect(result.displayName).toBe("Northgate Builders");
    // Email is normalized to lowercase and drives a deterministic provisional id.
    expect(result.ownerEmail).toBe("lead@northgate.com");
    expect(result.ownerWorkosUserId).toBe(
      "provisioned_builder_lead_northgate_com",
    );
    expect(result.workosOrganizationId).toBe(FAIRLEND_ORG);

    const rows = await broker.run(async (ctx: any) => {
      const profile = await ctx.db.get(result.builderProfileId);
      const link = await ctx.db.get(result.linkId);
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", result.ownerWorkosUserId),
        )
        .first();
      return { link, membership, profile };
    });
    expect(rows.profile?.status).toBe("active");
    expect(rows.link?.role).toBe("owner");
    expect(rows.link?.status).toBe("active");
    expect(rows.membership).toBeNull();
  });

  test("provisionNewBuilder always assigns Elie when the FairLend operator is not an eligible broker member", async () => {
    const { base } = await bootstrappedBroker();
    const operator = asRole(
      base,
      ["admin", "broker"],
      "user_fairlend_operator_without_membership",
    );
    await projectActiveWorkosMembership(base, {
      email: "operator@fairlend.example",
      roleSlugs: ["admin"],
      userId: "user_fairlend_operator_without_membership",
    });

    const result = await operator.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Default Broker Builders",
        ownerEmail: "owner@default-broker-builders.com",
      },
    );
    const builderProposalId = await operator.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: result.brokerageId,
        builderProfileId: result.builderProfileId,
        buildName: "Default Broker Build",
        location: "1 Default Broker Way",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const unassignedProposalId = await operator.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      {
        buildName: "Default Broker Intake",
        location: "2 Default Broker Way",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    const persisted = await operator.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", result.builderProfileId)
            .eq("status", "active"),
        )
        .unique();
      const broker = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q: any) =>
          q.eq("workosUserId", assignment?.assignedBrokerWorkosUserId),
        )
        .unique();
      const builderProposal = await ctx.db.get(builderProposalId);
      const unassignedProposal = await ctx.db.get(unassignedProposalId);
      return { assignment, broker, builderProposal, unassignedProposal };
    });

    expect(persisted.assignment?.assignedBrokerWorkosUserId).toBe(
      PRINCIPAL_BROKER,
    );
    expect(persisted.broker?.email).toBe(FAIRLEND_DEFAULT_BROKER_EMAIL);
    expect(persisted.builderProposal?.assignedBrokerWorkosUserId).toBe(
      PRINCIPAL_BROKER,
    );
    expect(persisted.unassignedProposal?.assignedBrokerWorkosUserId).toBe(
      PRINCIPAL_BROKER,
    );
  });

  test("provisionNewBuilder is idempotent for the same company and email", async () => {
    const { broker } = await bootstrappedBroker();
    const input = {
      displayName: "Repeat Builders",
      ownerEmail: "owner@repeat.com",
    };

    const first = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      input,
    );
    const second = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      input,
    );

    expect(first.operation).toBe("created");
    expect(second.operation).toBe("reactivated");
    expect(second.builderProfileId).toBe(first.builderProfileId);
    expect(second.linkId).toBe(first.linkId);

    const counts = await broker.run(async (ctx: any) => {
      const profiles = await ctx.db
        .query("builderProfiles")
        .withIndex("by_organization", (q: any) =>
          q.eq("organizationId", FAIRLEND_ORG),
        )
        .collect();
      const links = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", "provisioned_builder_owner_repeat_com"),
        )
        .collect();
      return {
        linkCount: links.length,
        repeatProfiles: profiles.filter(
          (p: any) => p.displayName === "Repeat Builders",
        ).length,
      };
    });
    expect(counts.repeatProfiles).toBe(1);
    expect(counts.linkCount).toBe(1);
  });

  test("provisionNewBuilder rejects an invalid owner email", async () => {
    const { broker } = await bootstrappedBroker();
    await expect(
      broker.action((api as any).brokerageProvisioning.provisionNewBuilder, {
        displayName: "Bad Email Builders",
        ownerEmail: "not-an-email",
      }),
    ).rejects.toThrow(/valid owner email/i);
  });

  test("provisionNewBuilder requires user-management write capability", async () => {
    const { base } = await bootstrappedBroker();
    const outsider = asRole(base, ["builder"], "user_outsider");
    await expect(
      outsider.action((api as any).brokerageProvisioning.provisionNewBuilder, {
        displayName: "Forbidden Builders",
        ownerEmail: "x@forbidden.com",
      }),
    ).rejects.toThrow();
  });

  test("getBuilderOnboardingState tracks the path from no profile to first value", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      { displayName: "Aha Builders", ownerEmail: "founder@aha.com" },
    );
    await reconcileProvisionedBuilder(base, provisioned);

    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    // Freshly provisioned builder: profile exists, no proposals yet -> first-run.
    const initial = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(initial).toMatchObject({
      complete: false,
      dismissed: false,
      hasProfile: true,
      hasProposals: false,
      isBuilder: true,
      proposalCount: 0,
    });
    expect(initial.builderProfile?._id).toBe(provisioned.builderProfileId);

    // Builder creates their first proposal -> reaches the aha moment.
    await builder.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: provisioned.brokerageId,
        builderProfileId: provisioned.builderProfileId,
        buildName: "First Build",
        location: "1 Aha Way",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    const afterProposal = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(afterProposal).toMatchObject({
      complete: true,
      hasProposals: true,
      proposalCount: 1,
    });
  });

  test("dismissBuilderOnboarding persists per user and is idempotent", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      { displayName: "Skip Builders", ownerEmail: "skip@builders.com" },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    await builder.mutation(
      (api as any).production_proposals.dismissBuilderOnboarding,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    await builder.mutation(
      (api as any).production_proposals.dismissBuilderOnboarding,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    const state = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state.dismissed).toBe(true);

    const dismissalCount = await builder.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("builderOnboardingDismissals")
        .withIndex("by_user_org", (q: any) =>
          q
            .eq("workosUserId", provisioned.ownerWorkosUserId)
            .eq("organizationId", FAIRLEND_ORG),
        )
        .collect();
      return rows.length;
    });
    expect(dismissalCount).toBe(1);
  });

  test("getBuilderOnboardingState returns a typed recovery contract when a builder token has no active membership", async () => {
    const { base } = await bootstrappedBroker();
    const outsider = asRole(base, ["builder"], "user_missing_membership");

    const state = await outsider.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(state).toMatchObject({
      recovery: {
        intendedDestination: "/builder",
        invitationStatus: "missing",
        kind: "missing-membership",
        organization: { id: FAIRLEND_ORG },
        projectionStatus: "missing",
        requiredRole: "Builder",
        responsibleOwner: "Organization Admin or invitation sender",
      },
    });
    expect(state.recovery.supportReference).toMatch(/^BLDR-[A-Z0-9]{7}$/);
    expect(JSON.stringify(state)).not.toMatch(
      /forbidden|convex|requestId|stack|workosOrganizationMemberships/i,
    );
  });

  test("distinguishes pending, failed, and missing-profile Builder activation states", async () => {
    const { base, broker } = await bootstrappedBroker();
    const subject = "user_activation_recovery";
    const now = Date.now();
    const membershipId = await broker.run(async (ctx: any) =>
      ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "builder",
        roleSlugs: ["builder"],
        sourceEventId: "test:activation-recovery",
        sourceEventType: "test.membership",
        status: "pending",
        updatedAt: now,
        workosMembershipId: "membership_activation_recovery",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: subject,
      }),
    );
    const builder = asRole(base, ["builder"], subject);

    let state = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state.recovery).toMatchObject({
      invitationStatus: "pending",
      kind: "projection-pending",
      projectionStatus: "pending",
    });

    await broker.run((ctx: any) =>
      ctx.db.patch(membershipId, { status: "inactive", updatedAt: now + 1 }),
    );
    state = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state.recovery).toMatchObject({
      invitationStatus: "inactive",
      kind: "projection-failed",
      projectionStatus: "failed",
      responsibleOwner: "Platform Admin",
    });

    await broker.run((ctx: any) =>
      ctx.db.patch(membershipId, { status: "active", updatedAt: now + 2 }),
    );
    state = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state.recovery).toMatchObject({
      invitationStatus: "active",
      kind: "missing-builder-profile",
      projectionStatus: "ready",
      responsibleOwner: "Principal Broker",
    });
    expect(JSON.stringify(state)).not.toMatch(
      /requestId|stack|validator|payload/i,
    );
  });

  test("projects tenant invitation, role-change, deactivation, and integration-only access states", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Tenant State Builders",
        ownerEmail: "tenant-state@example.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);
    const membership = await broker.run(async (ctx: any) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", provisioned.ownerWorkosUserId),
        )
        .first(),
    );

    let state = await builder.query(
      (api as any).brokerageProvisioning.getTenantActivationState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state).toMatchObject({
      intendedDestination: "/backoffice",
      invitationStatus: "active",
      projectionStatus: "ready",
      state: "active",
    });

    await broker.run((ctx: any) =>
      ctx.db.patch(membership._id, {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        updatedAt: Date.now(),
      }),
    );
    state = await builder.query(
      (api as any).brokerageProvisioning.getTenantActivationState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state).toMatchObject({
      affectedWorkWarning: expect.stringContaining("assigned work"),
      capabilityDelta: {
        gained: ["Principle Broker"],
        lost: ["Builder"],
      },
      projectionStatus: "pending",
      responsibleOwner: "Organization Admin",
      state: "role-change-pending",
    });
    expect(state.supportReference).toMatch(/^TEN-[A-Z0-9]{7}$/);

    await broker.run((ctx: any) =>
      ctx.db.patch(membership._id, {
        roleSlug: "builder",
        roleSlugs: ["builder"],
        status: "inactive",
        updatedAt: Date.now() + 1,
      }),
    );
    state = await builder.query(
      (api as any).brokerageProvisioning.getTenantActivationState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state).toMatchObject({
      invitationStatus: "inactive",
      projectionStatus: "failed",
      state: "deactivated",
    });

    await broker.run((ctx: any) =>
      ctx.db.patch(membership._id, {
        roleSlug: "technical-admin",
        roleSlugs: ["technical-admin"],
        status: "active",
        updatedAt: Date.now() + 2,
      }),
    );
    const technicalAdmin = asRole(
      base,
      ["technical-admin"],
      provisioned.ownerWorkosUserId,
    );
    state = await technicalAdmin.query(
      (api as any).brokerageProvisioning.getTenantActivationState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state).toMatchObject({
      actions: expect.arrayContaining(["open-integrations"]),
      intendedDestination: "/backoffice/integrations",
      state: "integration-only",
    });
    expect(JSON.stringify(state)).not.toMatch(
      /requestId|stack|validator|workosOrganizationMemberships|payload/i,
    );
  });

  test("getBuilderOnboardingState returns a typed recovery contract for ambiguous active builder ownership", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      { displayName: "Twin Builders", ownerEmail: "owner@twin.com" },
    );
    await reconcileProvisionedBuilder(base, provisioned);

    await broker.run(async (ctx: any) => {
      const now = Date.now();
      const duplicateProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: provisioned.brokerageId,
        createdAt: now,
        displayName: "Twin Builders Duplicate",
        legalName: "Twin Builders Duplicate",
        organizationId: FAIRLEND_ORG,
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: provisioned.brokerageId,
        builderProfileId: duplicateProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: provisioned.ownerWorkosUserId,
      });
    });

    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);
    const state = await builder.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(state).toMatchObject({
      recovery: {
        kind: "ambiguous-builder-profile",
      },
    });
    expect(JSON.stringify(state)).not.toMatch(/forbidden|convex/i);
  });

  test("getBuilderBrokerRelationshipSummary returns the canonical active builder/broker relationship", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Relationship Builders",
        ownerEmail: "owner@relationship.com",
        ownerName: "Riley Relationship",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    const relationship = await builder.query(
      (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(relationship).toMatchObject({
      brokerage: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        workosOrganizationId: FAIRLEND_ORG,
      },
      broker: {
        workosUserId: PRINCIPAL_BROKER,
      },
      relationship: {
        status: "active",
      },
    });
    expect(relationship.relationship.effectiveAt).toEqual(expect.any(Number));
    expect(relationship.relationship.updatedAt).toEqual(expect.any(Number));
  });

  test("repairOwnBuilderBrokerAssignment heals legacy backoffice profiles", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Legacy Relationship Builders",
        ownerEmail: "owner@legacy-relationship.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    await broker.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.delete(assignment._id);
    });
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    const repair = await builder.mutation(
      (api as any).brokerageProvisioning.repairOwnBuilderBrokerAssignment,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    const relationship = await builder.query(
      (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(repair.operation).toBe("assigned");
    expect(relationship).toMatchObject({
      broker: { workosUserId: PRINCIPAL_BROKER },
      recovery: null,
      relationship: { status: "active" },
    });
  });

  test("provisionBuilderProfile assigns the brokerage principal broker for an existing builder account", async () => {
    const { broker } = await bootstrappedBroker();

    const provisioned = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Backoffice Relationship Builders",
        ownerWorkosUserId: "user_existing_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    const assignment = await broker.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );

    expect(assignment).toMatchObject({
      assignedBrokerWorkosUserId: PRINCIPAL_BROKER,
      builderProfileId: provisioned.builderProfileId,
      organizationId: FAIRLEND_ORG,
      status: "active",
    });
  });

  test("non-broker admin can select an eligible broker while provisioning a builder", async () => {
    const selectedBrokerWorkosUserId = "user_selected_builder_broker";
    const { base, broker } = await bootstrappedBroker();
    await broker.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: selectedBrokerWorkosUserId,
        email: "selected.broker@example.com",
        name: "Selected Broker",
        sourceEventId: "evt_selected_builder_broker",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: selectedBrokerWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "evt_selected_builder_broker_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_selected_builder_broker",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: selectedBrokerWorkosUserId,
      });
    });
    const admin = asRole(base, ["admin"], "user_non_broker_admin");

    const provisioned = await admin.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        assignedBrokerWorkosUserId: selectedBrokerWorkosUserId,
        displayName: "Admin Provisioned Builders",
        ownerWorkosUserId: "user_admin_provisioned_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const assignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .unique(),
    );

    expect(assignment.assignedBrokerWorkosUserId).toBe(
      selectedBrokerWorkosUserId,
    );
  });

  test("provisionBuilderProfile resolves the FairLend principal by email after a WorkOS id change", async () => {
    const currentPrincipalBrokerWorkosUserId = "user_current_fairlend_principal";
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: FAIRLEND_BROKERAGE_NAME,
        sourceEventId: "evt_fairlend",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: FAIRLEND_ORG,
      });
      await ctx.db.insert("users", {
        authId: currentPrincipalBrokerWorkosUserId,
        email: FAIRLEND_DEFAULT_BROKER_EMAIL,
        emailVerified: true,
        name: "Elie Soberano",
        sourceEventId: "evt_current_fairlend_principal",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: currentPrincipalBrokerWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "evt_current_fairlend_principal_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_current_fairlend_principal",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: currentPrincipalBrokerWorkosUserId,
      });
      await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerWorkosUserId: PRINCIPAL_BROKER,
        status: "active",
        updatedAt: 1,
        workosOrganizationId: FAIRLEND_ORG,
      });
    });

    const provisioned = await admin.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Rotated Principal Builders",
        ownerWorkosUserId: "user_rotated_principal_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const assignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .unique(),
    );

    expect(assignment.assignedBrokerWorkosUserId).toBe(
      currentPrincipalBrokerWorkosUserId,
    );
  });

  test("provisionBuilderProfile accepts an explicitly selected eligible broker", async () => {
    const selectedBrokerWorkosUserId = "user_selected_broker";
    const { broker } = await bootstrappedBroker();
    await broker.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: selectedBrokerWorkosUserId,
        email: "selected-broker@fairlend.ca",
        emailVerified: true,
        name: "Selected Broker",
        sourceEventId: "evt_selected_broker",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: selectedBrokerWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "evt_selected_broker_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_selected_broker",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: selectedBrokerWorkosUserId,
      });
    });

    const provisioned = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        assignedBrokerWorkosUserId: selectedBrokerWorkosUserId,
        displayName: "Selected Broker Builders",
        ownerWorkosUserId: "user_selected_broker_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const assignment = await broker.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .unique(),
    );

    expect(assignment.assignedBrokerWorkosUserId).toBe(
      selectedBrokerWorkosUserId,
    );
  });

  test("provisionBuilderProfile preserves a healthy assignment instead of transferring implicitly", async () => {
    const selectedBrokerWorkosUserId = "user_existing_selected_broker";
    const { broker } = await bootstrappedBroker();
    await broker.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: selectedBrokerWorkosUserId,
        email: "existing-selected-broker@fairlend.ca",
        emailVerified: true,
        name: "Existing Selected Broker",
        sourceEventId: "evt_existing_selected_broker",
        sourceEventType: "user.created",
        status: "active",
        workosUserId: selectedBrokerWorkosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "evt_existing_selected_broker_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_existing_selected_broker",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: selectedBrokerWorkosUserId,
      });
    });
    const first = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        assignedBrokerWorkosUserId: selectedBrokerWorkosUserId,
        displayName: "Existing Assignment Builders",
        ownerWorkosUserId: "user_existing_assignment_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        assignedBrokerWorkosUserId: PRINCIPAL_BROKER,
        displayName: "Existing Assignment Builders",
        ownerWorkosUserId: "user_existing_assignment_builder",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const assignment = await broker.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q.eq("builderProfileId", first.builderProfileId).eq("status", "active"),
        )
        .unique(),
    );

    expect(assignment.assignedBrokerWorkosUserId).toBe(
      selectedBrokerWorkosUserId,
    );
  });

  test("principal resolution fails closed when duplicate active broker accounts share the configured email", async () => {
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: FAIRLEND_BROKERAGE_NAME,
        sourceEventId: "evt_duplicate_principal_org",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: FAIRLEND_ORG,
      });
      await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: PRINCIPAL_BROKER,
        status: "active",
        updatedAt: 1,
        workosOrganizationId: FAIRLEND_ORG,
      });
      for (const suffix of ["old", "current"]) {
        const workosUserId = `user_duplicate_principal_${suffix}`;
        await ctx.db.insert("users", {
          authId: workosUserId,
          email: FAIRLEND_DEFAULT_BROKER_EMAIL,
          emailVerified: true,
          name: `Duplicate Principal ${suffix}`,
          sourceEventId: `evt_duplicate_principal_${suffix}`,
          sourceEventType: "user.created",
          status: "active",
          workosUserId,
        });
        await ctx.db.insert("workosOrganizationMemberships", {
          roleSlug: "principle-broker",
          roleSlugs: ["principle-broker"],
          sourceEventId: `evt_duplicate_principal_membership_${suffix}`,
          sourceEventType: "organization_membership.created",
          status: "active",
          workosMembershipId: `om_duplicate_principal_${suffix}`,
          workosOrganizationId: FAIRLEND_ORG,
          workosUserId,
        });
      }
    });

    await expect(
      admin.mutation(
        (api as any).brokerageProvisioning.provisionBuilderProfile,
        {
          displayName: "Duplicate Principal Builders",
          ownerWorkosUserId: "user_duplicate_principal_builder",
          workosOrganizationId: FAIRLEND_ORG,
        },
      ),
    ).rejects.toThrow(/multiple active broker members/i);
    await expect(
      admin.query((api as any).builderRoster.listAssignableBrokers, {}),
    ).rejects.toThrow(/multiple active broker members/i);
  });

  test("principal resolution rejects a stale active projection superseded by a deleted user", async () => {
    const workosUserId = "user_superseded_principal";
    const base = convexTest(schema, modules);
    const admin = asRole(base, ["admin"], "user_admin");
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: FAIRLEND_BROKERAGE_NAME,
        sourceEventId: "evt_superseded_principal_org",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: FAIRLEND_ORG,
      });
      await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: workosUserId,
        status: "active",
        updatedAt: 1,
        workosOrganizationId: FAIRLEND_ORG,
      });
      await ctx.db.insert("users", {
        authId: "auth_superseded_principal_old",
        email: FAIRLEND_DEFAULT_BROKER_EMAIL,
        emailVerified: true,
        name: "Superseded Principal",
        sourceEventId: "evt_superseded_principal_old",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: 1,
        workosUserId,
      });
      await ctx.db.insert("users", {
        authId: "auth_superseded_principal_deleted",
        email: FAIRLEND_DEFAULT_BROKER_EMAIL,
        emailVerified: true,
        name: "Deleted Principal",
        sourceEventId: "evt_superseded_principal_deleted",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: 2,
        workosUserId,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "evt_superseded_principal_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_superseded_principal",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId,
      });
    });

    await expect(
      admin.mutation(
        (api as any).brokerageProvisioning.provisionBuilderProfile,
        {
          displayName: "Superseded Principal Builders",
          ownerWorkosUserId: "user_superseded_principal_builder",
          workosOrganizationId: FAIRLEND_ORG,
        },
      ),
    ).rejects.toThrow(/must be an active broker member/i);
  });

  test("linkBuilderAccount repairs a missing principal broker assignment", async () => {
    const { broker } = await bootstrappedBroker();
    const ownerWorkosUserId = "user_existing_linked_builder";
    const provisioned = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Linked Relationship Builders",
        ownerWorkosUserId,
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    await broker.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.delete(assignment._id);
    });

    await broker.mutation(
      (api as any).brokerageProvisioning.linkBuilderAccount,
      {
        builderProfileId: provisioned.builderProfileId,
        role: "owner",
        workosUserId: ownerWorkosUserId,
      },
    );

    const repairedAssignment = await broker.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );

    expect(repairedAssignment).toMatchObject({
      assignedBrokerWorkosUserId: PRINCIPAL_BROKER,
      builderProfileId: provisioned.builderProfileId,
      organizationId: FAIRLEND_ORG,
      status: "active",
    });
  });

  test("invalid broker assignments gate the builder workspace, proposal creation, and submission", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Invalid Broker Builders",
        ownerEmail: "owner@invalid-broker.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);
    const existingProposalId = await builder.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: provisioned.brokerageId,
        builderProfileId: provisioned.builderProfileId,
        buildName: "Existing Draft",
        location: "1 Existing Draft Way",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        documents: [],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId: existingProposalId,
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    await broker.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      const now = Date.now();
      await ctx.db.patch(assignment._id, {
        assignedBrokerWorkosUserId: provisioned.ownerWorkosUserId,
        updatedAt: now,
      });
      await ctx.db.patch(existingProposalId, {
        selectedPlan: {
          metrics: {
            drawCount: 1,
            drawFeesCents: 50_000,
            interestCostCents: 100_000,
            minimumCashReserveCents: 0,
            projectedDurationDays: 30,
            startingCashCents: 40_000_000,
            totalCostCents: 150_000,
            totalDrawAmountCents: 40_000_000,
          },
          name: "Cheapest Feasible",
          planKey: "cheapestFeasible",
          recommendationReason: "Selected by assignment health test setup.",
          selectedAt: now,
          selectedByWorkosUserId: provisioned.ownerWorkosUserId,
        },
      });
    });

    const relationship = await builder.query(
      (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(relationship).toMatchObject({
      recovery: { kind: "failed" },
      relationship: { status: "failed" },
    });
    await expect(
      builder.mutation((api as any).production_proposals.createDraftProposal, {
        brokerageId: provisioned.brokerageId,
        builderProfileId: provisioned.builderProfileId,
        buildName: "Must Stay Blocked",
        location: "1 Invalid Broker Way",
        workosOrganizationId: FAIRLEND_ORG,
      }),
    ).rejects.toThrow(/broker assignment/i);
    await expect(
      builder.mutation((api as any).production_proposals.submitProposal, {
        proposalId: existingProposalId,
        workosOrganizationId: FAIRLEND_ORG,
      }),
    ).rejects.toThrow(/broker assignment/i);
  });

  test("repairOwnBuilderBrokerAssignment canonicalizes duplicate active assignments", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Duplicate Assignment Builders",
        ownerEmail: "owner@duplicate-assignment.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    await broker.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("builderBrokerAssignments", {
        assignedBrokerWorkosUserId: PRINCIPAL_BROKER,
        brokerageId: provisioned.brokerageId,
        builderProfileId: provisioned.builderProfileId,
        createdAt: now,
        effectiveAt: now,
        organizationId: FAIRLEND_ORG,
        status: "active",
        updatedAt: now,
      });
    });
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    const before = await builder.query(
      (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    const repair = await builder.mutation(
      (api as any).brokerageProvisioning.repairOwnBuilderBrokerAssignment,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    const result = await broker.run(async (ctx: any) => {
      const activeAssignments = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "BuilderBrokerAssignment")
            .eq("entityId", provisioned.builderProfileId),
        )
        .collect();
      return { activeAssignments, audits };
    });

    expect(before.relationship.status).toBe("failed");
    expect(repair.operation).toBe("repaired");
    expect(result.activeAssignments).toHaveLength(1);
    expect(
      result.audits.some(
        (event: any) =>
          event.eventType === "builder.broker_assignment.repaired",
      ),
    ).toBe(true);
  });

  test("repairOwnBuilderBrokerAssignment refuses an implicit broker transfer", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Governed Transfer Builders",
        ownerEmail: "owner@governed-transfer.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    await broker.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.insert("users", {
        authId: "user_distinct_broker",
        email: "distinct.broker@example.com",
        name: "Distinct Broker",
        status: "active",
        workosUserId: "user_distinct_broker",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "evt_distinct_broker",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_distinct_broker",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: "user_distinct_broker",
      });
      await ctx.db.patch(assignment._id, {
        assignedBrokerWorkosUserId: "user_distinct_broker",
        updatedAt: Date.now(),
      });
    });
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    await expect(
      builder.mutation(
        (api as any).brokerageProvisioning.repairOwnBuilderBrokerAssignment,
        { workosOrganizationId: FAIRLEND_ORG },
      ),
    ).rejects.toThrow(/governed reassignment workflow/i);
  });

  test("reconcileBrokerageBuilderAssignments repairs legacy profiles in bounded batches", async () => {
    const { broker } = await bootstrappedBroker();
    const first = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Legacy Batch One",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const second = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Legacy Batch Two",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    await broker.run(async (ctx: any) => {
      const firstAssignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", first.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.delete(firstAssignment._id);

      const secondProfile = await ctx.db.get(second.builderProfileId);
      const now = Date.now();
      await ctx.db.insert("builderBrokerAssignments", {
        assignedBrokerWorkosUserId: PRINCIPAL_BROKER,
        brokerageId: secondProfile.brokerageId,
        builderProfileId: second.builderProfileId,
        createdAt: now,
        effectiveAt: now,
        organizationId: FAIRLEND_ORG,
        status: "active",
        updatedAt: now,
      });
    });

    const reconciliation = await broker.mutation(
      (api as any).brokerageProvisioning.reconcileBrokerageBuilderAssignments,
      {
        paginationOpts: { cursor: null, numItems: 50 },
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    const activeCounts = await broker.run(async (ctx: any) =>
      Promise.all(
        [first.builderProfileId, second.builderProfileId].map(
          async (builderProfileId) =>
            (
              await ctx.db
                .query("builderBrokerAssignments")
                .withIndex(
                  "by_builderProfileId_and_status_and_effectiveAt",
                  (q: any) =>
                    q
                      .eq("builderProfileId", builderProfileId)
                      .eq("status", "active"),
                )
                .collect()
            ).length,
        ),
      ),
    );

    expect(reconciliation).toMatchObject({
      assigned: 1,
      isDone: true,
      processed: 2,
      repaired: 1,
    });
    expect(activeCounts).toEqual([1, 1]);
  });

  test("provisionBuilderProfile uses Elie when the stored FairLend principal is missing", async () => {
    const { broker } = await bootstrappedBroker();
    const brokerageId = await broker.run(async (ctx: any) => {
      const brokerage = await ctx.db
        .query("brokerages")
        .withIndex("by_workos_organization", (q: any) =>
          q.eq("workosOrganizationId", FAIRLEND_ORG),
        )
        .unique();
      await ctx.db.patch(brokerage._id, {
        principalBrokerWorkosUserId: undefined,
        updatedAt: Date.now(),
      });
      return brokerage._id;
    });

    const provisioned = await broker.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Must Not Provision Builders",
        ownerWorkosUserId: "user_must_not_provision",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );

    const persisted = await broker.run(async (ctx: any) => {
      const profile = await ctx.db
        .query("builderProfiles")
        .withIndex("by_brokerage", (q: any) => q.eq("brokerageId", brokerageId))
        .filter((q: any) =>
          q.eq(q.field("displayName"), "Must Not Provision Builders"),
        )
        .first();
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .unique();
      return { assignment, profile };
    });
    expect(persisted.profile?._id).toBe(provisioned.builderProfileId);
    expect(persisted.assignment?.assignedBrokerWorkosUserId).toBe(
      PRINCIPAL_BROKER,
    );
  });

  test("getBuilderBrokerRelationshipSummary ignores inactive membership states", async () => {
    const membershipStatuses = ["inactive", "pending", "deleted"] as const;

    for (const membershipStatus of membershipStatuses) {
      const { base, broker } = await bootstrappedBroker();
      const provisioned = await broker.action(
        (api as any).brokerageProvisioning.provisionNewBuilder,
        {
          displayName: `Relationship ${membershipStatus} Builders`,
          ownerEmail: `${membershipStatus}@relationship.com`,
        },
      );
      await reconcileProvisionedBuilder(base, provisioned);
      await broker.run(async (ctx: any) => {
        const membership = await ctx.db
          .query("workosOrganizationMemberships")
          .withIndex("by_user", (q: any) =>
            q.eq("workosUserId", provisioned.ownerWorkosUserId),
          )
          .first();
        await ctx.db.patch(membership._id, {
          status: membershipStatus,
          updatedAt: Date.now(),
        });
      });
      const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

      const relationship = await builder.query(
        (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
        { workosOrganizationId: FAIRLEND_ORG },
      );

      expect(relationship).toMatchObject({
        broker: null,
        recovery: {
          kind: "missing-membership",
        },
        relationship: {
          effectiveAt: null,
          status: "missing-membership",
          updatedAt: null,
        },
      });
      expect(JSON.stringify(relationship)).not.toMatch(
        /workosOrganizationMemberships|requestId|stack/i,
      );
    }
  });

  test("getBuilderBrokerRelationshipSummary continues past deleted same-org membership history", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Historical Membership Builders",
        ownerEmail: "history@relationship.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);

    await broker.run(async (ctx: any) => {
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", provisioned.ownerWorkosUserId),
        )
        .first();
      const now = Date.now();

      await ctx.db.patch(membership._id, {
        status: "deleted",
        updatedAt: now,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now + 1,
        roleSlug: "builder",
        roleSlugs: ["builder"],
        sourceEventId: `test:${provisioned.ownerWorkosUserId}:replacement-membership`,
        sourceEventType: "test.membership.replacement",
        status: "active",
        updatedAt: now + 1,
        workosMembershipId: `replacement_${provisioned.ownerWorkosUserId}`,
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: provisioned.ownerWorkosUserId,
      });
    });

    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);
    const relationship = await builder.query(
      (api as any).brokerageProvisioning.getBuilderBrokerRelationshipSummary,
      { workosOrganizationId: FAIRLEND_ORG },
    );

    expect(relationship).toMatchObject({
      brokerage: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        workosOrganizationId: FAIRLEND_ORG,
      },
      broker: {
        workosUserId: PRINCIPAL_BROKER,
      },
      recovery: null,
      relationship: {
        status: "active",
      },
    });
    expect(relationship.relationship.effectiveAt).toEqual(expect.any(Number));
    expect(relationship.relationship.updatedAt).toEqual(expect.any(Number));
  });

  test("createDraftProposal rejects builders whose broker assignment is not active", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      {
        displayName: "Unassigned Builders",
        ownerEmail: "owner@unassigned-builder.com",
      },
    );
    await reconcileProvisionedBuilder(base, provisioned);
    await broker.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", provisioned.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.patch(assignment._id, {
        status: "failed",
        updatedAt: Date.now(),
      });
    });
    const builder = asRole(base, ["builder"], provisioned.ownerWorkosUserId);

    await expect(
      builder.mutation((api as any).production_proposals.createDraftProposal, {
        brokerageId: provisioned.brokerageId,
        builderProfileId: provisioned.builderProfileId,
        buildName: "Should Stay Blocked",
        location: "1 Missing Broker Way",
        workosOrganizationId: FAIRLEND_ORG,
      }),
    ).rejects.toThrow(/broker assignment/i);
  });

  test("backoffice viewers are never gated into first-run", async () => {
    const { broker } = await bootstrappedBroker();
    const state = await broker.query(
      (api as any).production_proposals.getBuilderOnboardingState,
      { workosOrganizationId: FAIRLEND_ORG },
    );
    expect(state).toMatchObject({
      complete: true,
      hasProfile: false,
      isBuilder: false,
    });
  });
});
