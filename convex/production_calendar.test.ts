/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_production_foundation";
const APP_PERMISSION_RESOURCES = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "contractor",
  "material",
  "capitalEvent",
  "reminder",
] as const;

function tiptap(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

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
  return { base, seed, t };
}

function appPermissionGrants(
  allowed: Partial<Record<(typeof APP_PERMISSION_RESOURCES)[number], { canView?: boolean }>>,
) {
  return APP_PERMISSION_RESOURCES.map((resourceType) => ({
    canCreate: false,
    canDelete: false,
    canUpdate: false,
    canView: allowed[resourceType]?.canView ?? false,
    resourceType,
  }));
}

async function grantOrgMembership(t: any, subject: string) {
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      directoryManaged: false,
      roleSlug: "builder-staff",
      roleSlugs: ["builder-staff"],
      sourceEventId: `test_membership_${subject}`,
      sourceEventType: "test.production_calendar",
      status: "active",
      updatedAt: now,
      workosMembershipId: `test_membership_${subject}`,
      workosOrganizationId: ORG,
      workosUserId: subject,
    });
  });
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
            fieldGuidance: {
              cameraAnglesTiptapJson: tiptap(
                "Capture the north and east foundation elevations.",
              ),
              whatToVerifyTiptapJson: tiptap(
                "Verify the completed foundation forms and reinforcing.",
              ),
            },
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
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.patch(proposalId, {
      selectedPlan: {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 55,
          startingCashCents: 35_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 120_000_000,
        },
        name: "Cheapest Feasible",
        planKey: "cheapestFeasible",
        recommendationReason: "Selected by production calendar test setup.",
        selectedAt: now,
        selectedByWorkosUserId: "production_calendar_test_setup",
      },
    });
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
      ])
    );
    expect(workspace.events.some((event: any) => event.kind === "audit")).toBe(false);
    expect(workspace.events.some((event: any) => event.kind === "workingCapital")).toBe(false);
    expect(
      workspace.events.some((event: any) =>
        /borrower working[-\s]capital exposure/i.test(event.title)
      )
    ).toBe(false);
    expect(workspace.savedViews.map((view: any) => view.id)).toEqual(
      expect.arrayContaining(["proposal-feasibility", "capital-release"])
    );
  });

  test("stores reminder-only proposal calendar events without changing timeline projections", async () => {
    const { seed, t } = await seededAdmin();
    const proposalId = await createCalendarProposal(t, seed);

    const invitees = await t.query(
      (api as any).production_proposals.listProposalCalendarAssignableParticipants,
      { proposalId, workosOrganizationId: ORG }
    );
    const builderInvitee = invitees.find(
      (participant: any) => participant.participantType === "builderProfile"
    );
    expect(builderInvitee).toBeTruthy();
    const { key: _key, ...builderReminderInvitee } = builderInvitee;

    const reminderId = await t.mutation(
      (api as any).production_proposals.createProposalReminderCalendarEvent,
      {
        allDay: true,
        assignedParticipants: [builderReminderInvitee],
        description: "Ask whether updated site access is ready.",
        endsAt: "2026-06-16",
        location: "Site office",
        proposalId,
        startsAt: "2026-06-15",
        timezone: "America/Toronto",
        title: "Check in with builder",
        workosOrganizationId: ORG,
      }
    );

    let workspace = await t.query(
      (api as any).production_proposals.getProposalCalendarWorkspace,
      { proposalId, workosOrganizationId: ORG }
    );
    expect(workspace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: expect.objectContaining({
            id: String(reminderId),
            type: "calendarReminder",
          }),
          kind: "reminder",
          location: "Site office",
          participants: expect.arrayContaining([
            expect.objectContaining({ participantType: "builderProfile" }),
          ]),
          startsAt: "2026-06-15",
          title: "Check in with builder",
        }),
      ])
    );
    expect(
      workspace.events.filter((event: any) => event.kind === "milestone")
    ).toHaveLength(2);

    await t.mutation(
      (api as any).production_proposals.updateProposalReminderCalendarEvent,
      {
        allDay: false,
        assignedParticipants: [],
        description: "Move the check-in after permit packet review.",
        eventId: reminderId,
        proposalId,
        startsAt: "2026-06-18",
        timezone: "America/Toronto",
        title: "Builder permit check-in",
        workosOrganizationId: ORG,
      }
    );
    workspace = await t.query(
      (api as any).production_proposals.getProposalCalendarWorkspace,
      { proposalId, workosOrganizationId: ORG }
    );
    expect(workspace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "reminder",
          startsAt: "2026-06-18",
          title: "Builder permit check-in",
        }),
      ])
    );

    await t.mutation(
      (api as any).production_proposals.deleteProposalReminderCalendarEvent,
      {
        eventId: reminderId,
        proposalId,
        reason: "No longer needed.",
        workosOrganizationId: ORG,
      }
    );
    workspace = await t.query(
      (api as any).production_proposals.getProposalCalendarWorkspace,
      { proposalId, workosOrganizationId: ORG }
    );
    expect(workspace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "reminder",
          status: "cancelled",
          title: "Builder permit check-in",
        }),
      ])
    );
  });

  test("creates durable proposal calendar ICS subscriptions with reminder events", async () => {
    const { seed, t } = await seededAdmin();
    const proposalId = await createCalendarProposal(t, seed);
    await t.mutation(
      (api as any).production_proposals.createProposalReminderCalendarEvent,
      {
        allDay: true,
        assignedParticipants: [],
        proposalId,
        startsAt: "2026-06-15",
        timezone: "America/Toronto",
        title: "Follow up with broker",
        workosOrganizationId: ORG,
      }
    );
    const subscription = await t.mutation(
      (api as any).production_proposals.createCalendarSyncSubscription,
      {
        direction: "outbound",
        filters: {},
        proposalId,
        provider: "ics",
        surface: "proposal",
        workosOrganizationId: ORG,
      }
    );
    expect(subscription.feedUrl).toBe(
      `/api/calendar/${subscription.subscriptionKey}.ics`
    );

    const ics = await t.query(
      (api as any).production_proposals.getCalendarSubscriptionIcs,
      { subscriptionKey: subscription.subscriptionKey }
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Follow up with broker");
    expect(ics).toContain("SUMMARY:Foundation");
  });

  test("rejects calendar sync subscriptions without a source record", async () => {
    const { t } = await seededAdmin();

    await expect(
      t.mutation((api as any).production_proposals.createCalendarSyncSubscription, {
        direction: "outbound",
        filters: {},
        provider: "ics",
        surface: "proposal",
        workosOrganizationId: ORG,
      })
    ).rejects.toThrow("Proposal calendar subscriptions require a proposal id.");
  });

  test("projects active build calendar events and audits schedule revisions", async () => {
    const { base, seed, t } = await seededAdmin();
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
    await t.mutation(
      (api as any).production_proposals.recordProposalClosing,
      {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 65_000_000,
        },
        proposalId,
        reason: "Closed for calendar workspace.",
        workosOrganizationId: ORG,
      },
    );
    const closing = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Closed for calendar workspace.",
        workosOrganizationId: ORG,
      },
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
    const scheduledSiteVisit = await t.mutation((api as any).production_proposals.scheduleActiveBuildSiteVisit, {
      buildId: closing.buildId,
      idempotencyKey: "calendar-foundation-site-visit",
      milestoneKey: "foundation",
      note: "Inspect revised foundation window.",
      requestedDay: 24,
      submilestoneKeys: ["forms"],
      workosOrganizationId: ORG,
    });

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildCalendarWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG }
    );
    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const forms = detail.submilestones.find(
      (submilestone: any) => submilestone.key === "forms",
    );
    expect(scheduledSiteVisit.submilestoneId).toBe(forms?._id);
    expect(
      detail.auditEvents.find(
        (event: any) => event.eventType === "site_visit.scheduled",
      ),
    ).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: forms?._id,
        },
        canonicalTargetContext: { selectedTab: "review" },
      }),
    );

    const limitedSubject = "user_calendar_site_visit_resource_only";
    await grantOrgMembership(t, limitedSubject);
    await t.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ evidence: { canView: true } }),
        staffWorkosUserId: limitedSubject,
        workosOrganizationId: ORG,
      },
    );
    const limitedStaff = withIdentity(base, ["builder-staff"], limitedSubject);
    const resourceOnlyDetail = await limitedStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      resourceOnlyDetail.auditEvents.some(
        (event: any) => event.eventType === "site_visit.scheduled",
      ),
    ).toBe(false);

    await t.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          evidence: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: limitedSubject,
        workosOrganizationId: ORG,
      },
    );
    const allowedDetail = await limitedStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      allowedDetail.auditEvents.find(
        (event: any) => event.eventType === "site_visit.scheduled",
      ),
    ).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: forms?._id,
        },
      }),
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
    expect(workspace.events.some((event: any) => event.kind === "workingCapital")).toBe(false);
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining(["active_build.milestone.schedule_revised"])
    );
  });

  test("updates active build non-financial details with location metadata audit", async () => {
    const { seed, t } = await seededAdmin();
    const proposalId = await createCalendarProposal(t, seed);
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before non-financial edit test.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.recordProposalClosing,
      {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 65_000_000,
        },
        proposalId,
        reason: "Closed before metadata correction.",
        workosOrganizationId: ORG,
      },
    );
    const closing = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Closed before metadata correction.",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildNonFinancialDetails,
      {
        buildId: closing.buildId,
        buildName: "Calendar build renamed",
        location: "26 Luverne, ON",
        locationLatitude: 43.653226,
        locationLongitude: -79.383184,
        locationPlaceId: "place_26_luverne",
        reason: "Correct active build location metadata.",
        startDate: "2026-08-02",
        workosOrganizationId: ORG,
      }
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG }
    );

    expect(detail.build).toMatchObject({
      buildName: "Calendar build renamed",
      location: "26 Luverne, ON",
      locationLatitude: 43.653226,
      locationLongitude: -79.383184,
      locationPlaceId: "place_26_luverne",
      startDate: "2026-08-02",
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "active_build.non_financial_details.updated"
    );
  });
});
