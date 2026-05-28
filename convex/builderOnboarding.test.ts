/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const FAIRLEND_ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";

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

function asRole(base: ReturnType<typeof convexTest>, roles: string[], subject: string) {
  return base.withIdentity(identity(roles, subject));
}

/**
 * Bootstrap the FairLend brokerage and the principal broker membership on a
 * shared in-memory instance, then return the broker-scoped handle.
 */
async function bootstrappedBroker() {
  const base = convexTest(schema, modules);
  const broker = asRole(base, ["principle-broker"], PRINCIPAL_BROKER);
  await broker.mutation(
    (api as any).brokerageProvisioning.provisionFairLendBrokerage,
    {},
  );
  return { base, broker };
}

describe("new builder onboarding", () => {
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
    expect(rows.membership?.roleSlugs).toContain("builder");
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
      outsider.action(
        (api as any).brokerageProvisioning.provisionNewBuilder,
        { displayName: "Forbidden Builders", ownerEmail: "x@forbidden.com" },
      ),
    ).rejects.toThrow();
  });

  test("getBuilderOnboardingState tracks the path from no profile to first value", async () => {
    const { base, broker } = await bootstrappedBroker();
    const provisioned = await broker.action(
      (api as any).brokerageProvisioning.provisionNewBuilder,
      { displayName: "Aha Builders", ownerEmail: "founder@aha.com" },
    );

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
