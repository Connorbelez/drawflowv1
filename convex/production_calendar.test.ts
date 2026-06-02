/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_production_foundation";

function withIdentity(t: any, roles: string[], subject: string) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seededAdmin() {
  const base = convexTest(schema, modules);
  const t = withIdentity(base, ["admin"], "user_admin");
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG }
  );
  return { seed, t };
}

async function createCalendarProposal(t: any, seed: any) {
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Calendar build",
      location: "123 Calendar Lane",
      workosOrganizationId: ORG,
    }
  );
  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 35_000_000,
    documents: [
      {
        documentType: "permit",
        fileName: "permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
    ],
    lenderDrawPolicyLimitCents: 65_000_000,
    milestones: [
      {
        budgetCents: 50_000_000,
        dayEnd: 20,
        dayStart: 0,
        dependencyKeys: [],
        durationDays: 20,
        key: "foundation",
        name: "Foundation",
        order: 1,
        submilestones: [
          {
            budgetCents: 15_000_000,
            durationDays: 8,
            key: "forms",
            name: "Forms",
            order: 1,
          },
        ],
      },
      {
        budgetCents: 70_000_000,
        dayEnd: 55,
        dayStart: 24,
        dependencyKeys: ["foundation"],
        durationDays: 31,
        key: "framing",
        name: "Framing",
        order: 2,
        submilestones: [],
      },
    ],
    proposalId,
    workosOrganizationId: ORG,
  });
  return proposalId;
}

describe("production calendar workspace", () => {
  test("projects proposal calendar events with timeframe metadata and action capabilities", async () => {
    const { seed, t } = await seededAdmin();
    const proposalId = await createCalendarProposal(t, seed);

    const workspace = await t.query(
      (api as any).production_proposals.getProposalCalendarWorkspace,
      { proposalId, workosOrganizationId: ORG }
    );

    expect(workspace.surface).toBe("proposal");
    expect(workspace.defaultTimeframe).toBe("month");
    expect(workspace.timeframes).toEqual([
      "day",
      "week",
      "month",
      "quarter",
      "agenda",
    ]);
    expect(workspace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: expect.objectContaining({ type: "milestone" }),
          kind: "milestone",
          milestoneKey: "foundation",
          status: "proposed",
          timeBucket: "allDay",
          title: "Foundation",
        }),
        expect.objectContaining({
          kind: "draw",
          status: "proposed",
          timeBucket: "endOfDay",
        }),
        expect.objectContaining({
          kind: "workingCapital",
          status: "planned",
          timeBucket: "allDay",
        }),
      ])
    );
    expect(workspace.events.some((event: any) => event.kind === "audit")).toBe(false);
    expect(workspace.savedViews.map((view: any) => view.id)).toEqual(
      expect.arrayContaining(["proposal-feasibility", "capital-release"])
    );
  });

  test("projects active build calendar events and audits schedule revisions", async () => {
    const { seed, t } = await seededAdmin();
    const proposalId = await createCalendarProposal(t, seed);
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Calendar proposal approved.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 65_000_000,
        },
        proposalId,
        reason: "Closed for calendar workspace.",
        workosOrganizationId: ORG,
      }
    );

    await t.mutation(
      (api as any).production_proposals.reviseActiveBuildMilestoneSchedule,
      {
        buildId: closing.buildId,
        dayEnd: 24,
        dayStart: 2,
        milestoneKey: "foundation",
        reason: "Weather pushed excavation.",
        workosOrganizationId: ORG,
      }
    );
    await t.mutation((api as any).production_proposals.scheduleActiveBuildSiteVisit, {
      buildId: closing.buildId,
      milestoneKey: "foundation",
      note: "Inspect revised foundation window.",
      requestedDay: 24,
      workosOrganizationId: ORG,
    });

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildCalendarWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG }
    );

    expect(workspace.surface).toBe("activeBuild");
    expect(workspace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "milestone",
          milestoneKey: "foundation",
          startsAt: "2026-08-03",
          endsAt: "2026-08-25",
          status: "planned",
        }),
        expect.objectContaining({
          kind: "siteVisit",
          milestoneKey: "foundation",
          status: "planned",
          timeBucket: "morning",
        }),
      ])
    );
    expect(workspace.events.some((event: any) => event.kind === "audit")).toBe(false);
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining(["active_build.milestone.schedule_revised"])
    );
  });
});
