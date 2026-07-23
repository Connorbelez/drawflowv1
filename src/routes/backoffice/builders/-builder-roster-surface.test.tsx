// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { BuilderRosterSurface } from "./-builder-roster-surface";
import type {
  AssignableBrokerage,
  BuilderRow,
} from "./-builder-roster-types";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      disconnect() {
        return undefined;
      }
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
    };
  }
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BROKERAGE_ID = "brokerage_fairlend";
const ORGANIZATION_ID = "org_fairlend";
const ALEX_BROKER_ID = "user_alex_broker";

const assignableBrokerages = [
  {
    brokerageId: BROKERAGE_ID,
    brokerageName: "FairLendBrokerage",
    brokers: [
      {
        email: "alex.broker@example.com",
        isPrincipal: true,
        name: "Alex Broker",
        profilePictureUrl: null,
        roleSlugs: ["principle-broker"],
        status: "active",
        workosUserId: ALEX_BROKER_ID,
      },
      {
        email: "morgan.broker@example.com",
        isPrincipal: false,
        name: "Morgan Broker",
        profilePictureUrl: null,
        roleSlugs: ["broker"],
        status: "active",
        workosUserId: "user_morgan_broker",
      },
    ],
    principalBrokerWorkosUserId: ALEX_BROKER_ID,
    workosOrganizationId: ORGANIZATION_ID,
  },
] as AssignableBrokerage[];

function builderRow(
  id: string,
  displayName: string,
  assigned: boolean
): BuilderRow {
  const now = Date.now();
  return {
    _id: id,
    accountCount: 1,
    accounts: [],
    activeBuildCapitalCents: 0,
    approvedCapitalCents: 0,
    brokerAssignment: assigned
      ? {
          activeAssignmentCount: 1,
          assignedBrokerWorkosUserId: ALEX_BROKER_ID,
          broker: {
            email: "alex.broker@example.com",
            name: "Alex Broker",
            profilePictureUrl: null,
            roleSlugs: ["principle-broker"],
            status: "active",
            workosUserId: ALEX_BROKER_ID,
          },
          healthy: true,
          reason: "healthy",
          status: "active",
        }
      : {
          activeAssignmentCount: 0,
          assignedBrokerWorkosUserId: null,
          broker: null,
          healthy: false,
          reason: "assignment_missing",
          status: null,
        },
    brokerage: {
      _id: BROKERAGE_ID,
      displayName: "FairLendBrokerage",
      status: "active",
    },
    builds: [],
    createdAt: now,
    displayName,
    lastActivityAt: now,
    legalName: null,
    organizationName: displayName,
    organizationStatus: "active",
    ownerAccount: null,
    proposalCount: 0,
    proposalCounts: { approved: 0, closed: 0, draft: 0, submitted: 0 },
    proposals: [],
    proposedCapitalCents: 0,
    stage: "no_proposal",
    status: "active",
    updatedAt: now,
    workosOrganizationId: ORGANIZATION_ID,
  } as BuilderRow;
}

function renderRoster(onAssignBroker = vi.fn().mockResolvedValue({
  assigned: 1,
  processed: 1,
  reassigned: 0,
  repaired: 0,
  unchanged: 0,
})) {
  const builders = [
    builderRow("builder_alpha", "Alpha Builders", true),
    builderRow("builder_beta", "Beta Builders", false),
  ];
  render(
    <BuilderRosterSurface
      assignableBrokerages={assignableBrokerages}
      brokerages={[
        {
          _id: BROKERAGE_ID,
          displayName: "FairLendBrokerage",
          status: "active",
        },
      ]}
      brokerOptionsPending={false}
      builders={builders}
      onAssignBroker={onAssignBroker}
      onInviteBuilder={vi.fn()}
      onLinkAccount={vi.fn().mockResolvedValue(undefined)}
      onProvisionBuilder={vi.fn().mockResolvedValue(undefined)}
      onSetProfileStatus={vi.fn().mockResolvedValue(undefined)}
      onUnlinkAccount={vi.fn().mockResolvedValue(undefined)}
      pending={false}
      unprovisionedBuilders={[]}
    />
  );
  return { builders, onAssignBroker };
}

async function submitAssignment(reason: string) {
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Audit reason"), {
    target: { value: reason },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /^Assign / }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("BuilderRosterSurface broker assignment", () => {
  test("shows the current broker and assigns a single Builder from the table", async () => {
    const { onAssignBroker } = renderRoster();

    expect(screen.getAllByText("Alex Broker").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs assignment")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Change broker for Alpha Builders",
      })
    );
    await submitAssignment(
      "Keep Alpha Builders with the principal broker for continuity."
    );

    expect(onAssignBroker).toHaveBeenCalledWith({
      assignedBrokerWorkosUserId: ALEX_BROKER_ID,
      builderProfileIds: ["builder_alpha"],
      reason: "Keep Alpha Builders with the principal broker for continuity.",
    });
  });

  test("selects an eligible broker for an unassigned Builder", async () => {
    const { onAssignBroker } = renderRoster();

    fireEvent.click(
      screen.getByRole("button", { name: "Assign broker for Beta Builders" })
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Broker"));
    fireEvent.click(
      await screen.findByRole("option", { name: /Morgan Broker/i })
    );
    await submitAssignment(
      "Assign Beta Builders to Morgan for the next underwriting cycle."
    );

    expect(onAssignBroker).toHaveBeenCalledWith({
      assignedBrokerWorkosUserId: "user_morgan_broker",
      builderProfileIds: ["builder_beta"],
      reason: "Assign Beta Builders to Morgan for the next underwriting cycle.",
    });
  });

  test("batch assigns selected Builders and clears selection after success", async () => {
    const onAssignBroker = vi.fn().mockResolvedValue({
      assigned: 1,
      processed: 2,
      reassigned: 0,
      repaired: 0,
      unchanged: 1,
    });
    renderRoster(onAssignBroker);

    fireEvent.click(screen.getByLabelText("Select Alpha Builders"));
    fireEvent.click(screen.getByLabelText("Select Beta Builders"));
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Assign broker" }));
    await submitAssignment(
      "Assign the selected Builder portfolio to one accountable broker."
    );

    expect(onAssignBroker).toHaveBeenCalledWith({
      assignedBrokerWorkosUserId: ALEX_BROKER_ID,
      builderProfileIds: ["builder_alpha", "builder_beta"],
      reason: "Assign the selected Builder portfolio to one accountable broker.",
    });
    expect(screen.queryByText("2 selected")).toBeNull();
  });
});

describe("BuilderRosterSurface builder provisioning", () => {
  test("requires and submits an eligible broker instead of a stale principal", async () => {
    const onProvisionBuilder = vi.fn().mockResolvedValue(undefined);
    const stalePrincipalBrokerages = [
      {
        ...assignableBrokerages[0],
        principalBrokerWorkosUserId: "user_non_broker_admin",
      },
    ] as AssignableBrokerage[];

    render(
      <BuilderRosterSurface
        assignableBrokerages={stalePrincipalBrokerages}
        brokerages={[]}
        brokerOptionsPending={false}
        builders={[]}
        onAssignBroker={vi.fn()}
        onInviteBuilder={vi.fn()}
        onLinkAccount={vi.fn().mockResolvedValue(undefined)}
        onProvisionBuilder={onProvisionBuilder}
        onSetProfileStatus={vi.fn().mockResolvedValue(undefined)}
        onUnlinkAccount={vi.fn().mockResolvedValue(undefined)}
        pending={false}
        unprovisionedBuilders={[
          {
            brokerageDisplayName: "FairLendBrokerage",
            email: "casey@builder.example.com",
            name: "Casey Builder",
            profilePictureUrl: null,
            roleSlugs: ["builder"],
            workosMembershipId: "om_casey_builder",
            workosOrganizationId: ORGANIZATION_ID,
            workosUserId: "user_casey_builder",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));
    const dialog = await screen.findByRole("dialog");
    const brokerSelect = within(dialog).getByLabelText("Assigned broker");
    expect(brokerSelect.textContent).toContain("Alex Broker");

    fireEvent.click(brokerSelect);
    fireEvent.click(
      await screen.findByRole("option", { name: /Morgan Broker/i })
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create profile" })
    );

    await waitFor(() =>
      expect(onProvisionBuilder).toHaveBeenCalledWith({
        assignedBrokerWorkosUserId: "user_morgan_broker",
        displayName: "Casey Builder",
        ownerWorkosUserId: "user_casey_builder",
        workosOrganizationId: ORGANIZATION_ID,
      })
    );
  });
});
