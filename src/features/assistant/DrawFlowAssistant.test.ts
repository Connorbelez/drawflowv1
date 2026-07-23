import { describe, expect, test, vi } from "vitest";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext";
import {
  buildCostItemActionFromDraft,
  buildReminderActions,
  extractReminderDate,
  extractReminderDateTime,
} from "./DrawFlowAssistant";

const baseContext: DrawFlowAssistantRouteContext = {
  authDiagnostics: {
    hasOrganization: true,
    hasToken: true,
    hasUser: true,
    normalizedRoles: ["builder"],
    roleCount: 1,
  },
  organizationId: "org_test",
  pathname: "/builder",
  role: "builder",
  roles: ["builder"],
  search: {},
  userId: "user_test",
  workspace: "builder",
};

describe("DrawFlowAssistant reminder planning", () => {
  test("parses month-day reminder dates using the current calendar year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    expect(extractReminderDate("remind me to buy stucco on June 26th")).toBe(
      "2026-06-26"
    );

    vi.useRealTimers();
  });

  test("parses supplier purchase prompts as timed reminders, not material forms", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    expect(
      extractReminderDateTime(
        "Add a reminder for me to purchase stucco from my supplier tomorrow at 9am"
      )
    ).toEqual({
      allDay: false,
      startsAt: "2026-06-26T09:00:00",
    });

    const result = buildReminderActions(
      "Add a reminder for me to purchase stucco from my supplier tomorrow at 9am",
      baseContext
    );

    expect(result).toMatchObject({
      kind: "select",
      selection: {
        intent: {
          allDay: false,
          startsAt: "2026-06-26T09:00:00",
          timezone: "America/Toronto",
          title: "purchase stucco from my supplier",
        },
        type: "reminderTarget",
      },
    });

    vi.useRealTimers();
  });

  test("creates live-build reminder actions from active build route context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    const result = buildReminderActions(
      "Add a reminder to purchase stucco supplies on june 26th",
      {
        ...baseContext,
        activeBuildId: "active-build-01",
        pathname: "/builder/builds/active-build-01",
        selectedPanel: "contractors",
      }
    );

    expect(result).toMatchObject({
      actions: [
        {
          actionKey: "create_proposal_reminder",
          input: {
            allDay: true,
            buildId: "active-build-01",
            startsAt: "2026-06-26",
            timezone: "America/Toronto",
            title: "purchase stucco supplies",
          },
        },
      ],
      kind: "actions",
    });

    vi.useRealTimers();
  });

  test("creates timed live-build reminder actions when route context is already scoped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    const result = buildReminderActions(
      "Add a reminder for me to purchase stucco from my supplier tomorrow at 9am",
      {
        ...baseContext,
        activeBuildId: "active-build-01",
        pathname: "/builder/builds/active-build-01",
      }
    );

    expect(result).toMatchObject({
      actions: [
        {
          actionKey: "create_proposal_reminder",
          input: {
            allDay: false,
            buildId: "active-build-01",
            startsAt: "2026-06-26T09:00:00",
            timezone: "America/Toronto",
            title: "purchase stucco from my supplier",
          },
        },
      ],
      kind: "actions",
    });

    vi.useRealTimers();
  });

  test("trims scoped reminder titles before creating HITL action input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    const result = buildReminderActions(
      "Add a reminder for me to purchase stucco supplies   on June 26th",
      {
        ...baseContext,
        activeBuildId: "active-build-01",
        pathname: "/builder/builds/active-build-01",
      }
    );

    expect(result).toMatchObject({
      actions: [
        {
          input: {
            title: "purchase stucco supplies",
          },
        },
      ],
      kind: "actions",
    });

    vi.useRealTimers();
  });

  test("asks for a target selection when no proposal or live build is in route context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00-04:00"));

    const result = buildReminderActions(
      "remind me to call the framer on June 26th",
      baseContext
    );

    expect(result).toMatchObject({
      kind: "select",
      selection: {
        intent: {
          startsAt: "2026-06-26",
          title: "call the framer",
        },
        type: "reminderTarget",
      },
    });

    vi.useRealTimers();
  });
});

describe("DrawFlowAssistant generated UI actions", () => {
  test("turns a proposal material form draft into a confirmable cost-item action", () => {
    expect(
      buildCostItemActionFromDraft({
        costCents: 125_000,
        description: "Exterior finish material",
        itemType: "material",
        milestoneKey: "exterior",
        quantity: 3,
        supplier: "Stucco Supply Co",
        target: {
          kind: "proposal",
          proposalId: "proposal_123",
        },
        title: "Stucco supplies",
        unit: "bags",
      })
    ).toMatchObject({
      actionKey: "create_proposal_cost_item",
      input: {
        costCents: 125_000,
        description: "Exterior finish material Unit: bags.",
        itemType: "material",
        milestoneKey: "exterior",
        proposalId: "proposal_123",
        quantity: 3,
        supplier: "Stucco Supply Co",
        title: "Stucco supplies",
        unit: "bags",
      },
    });
  });

  test("turns a live-build material form draft into the active-build cost-item action", () => {
    expect(
      buildCostItemActionFromDraft({
        costCents: 90_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        quantity: 1,
        target: {
          buildId: "build_123",
          kind: "activeBuild",
        },
        title: "Concrete pump rental",
      })
    ).toMatchObject({
      actionKey: "create_active_build_cost_item",
      input: {
        buildId: "build_123",
        costCents: 90_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        quantity: 1,
        title: "Concrete pump rental",
      },
    });
  });
});
