// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    viewTransition: _viewTransition,
    ...props
  }: {
    children?: ReactNode;
    params?: unknown;
    to: string;
  }) => (
    <a href={to} data-params={JSON.stringify(params)} {...props}>
      {children}
    </a>
  ),
}));

import { LenderOrganizationMembersTable } from "#/features/lender-organizations/LenderOrganizationMembersTable.tsx";
import { LenderActiveBuildList } from "./LenderActiveBuildList.tsx";
import { LenderAssignedProposalList } from "./LenderAssignedProposalList.tsx";

afterEach(() => cleanup());

const build = {
  buildId: "build_1",
  buildName: "Harbourline Residences",
  location: "Toronto, ON",
  proposalId: "proposal_1",
  status: "active" as const,
  updatedAt: Date.parse("2026-08-15T00:00:00.000Z"),
};

const proposal = {
  assignedAt: Date.parse("2026-08-15T00:00:00.000Z"),
  assignmentStatus: "current" as const,
  buildName: "Harbourline Residences",
  lenderConfirmation: "pending" as const,
  location: "Toronto, ON",
  proposalId: "proposal_1",
  proposalStatus: "approved" as const,
  readOnly: false,
};

describe("shared lender portfolio lists", () => {
  test("preserves loading, empty, formatting, and Back Office Build links", () => {
    const { rerender } = render(
      <LenderActiveBuildList
        builds={undefined}
        linkTo="/backoffice/builds/$buildId"
      />
    );
    expect(screen.getByText("Loading active Builds…")).toBeTruthy();

    rerender(
      <LenderActiveBuildList
        builds={[]}
        linkTo="/backoffice/builds/$buildId"
      />
    );
    expect(screen.getByText("No active Builds")).toBeTruthy();

    rerender(
      <LenderActiveBuildList
        builds={[build] as never}
        linkTo="/backoffice/builds/$buildId"
      />
    );
    expect(
      screen
        .getByRole("link", { name: "Open Build Harbourline Residences" })
        .getAttribute("href")
    ).toBe("/backoffice/builds/$buildId");
    expect(screen.getByText("Active")).toBeTruthy();
  });

  test("preserves Proposal assignment wording, withdrawal state, empty state, and route links", () => {
    const { rerender } = render(
      <LenderAssignedProposalList
        linkTo="/backoffice/proposals/$planId"
        proposals={undefined}
      />
    );
    expect(screen.getByText("Loading assigned Proposals…")).toBeTruthy();

    rerender(
      <LenderAssignedProposalList
        linkTo="/backoffice/proposals/$planId"
        proposals={[]}
      />
    );
    expect(screen.getByText("No assigned Proposals")).toBeTruthy();

    rerender(
      <LenderAssignedProposalList
        linkTo="/backoffice/proposals/$planId"
        proposals={[{ ...proposal, readOnly: true, assignmentStatus: "withdrawn" }] as never}
      />
    );
    expect(screen.getByText("Withdrawn")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open Proposal Harbourline Residences" })
        .getAttribute("href")
    ).toBe("/backoffice/proposals/$planId");
  });

  test("renders active member status and final-decision capability from the canonical member query", () => {
    render(
      <LenderOrganizationMembersTable
        members={[
          {
            assignmentId: "assignment_1",
            membershipId: "membership_1",
            userId: "user_1",
            workosUserId: "workos_1",
            name: "Northstar Member",
            email: "member@northstar.example.com",
            roleSlugs: ["lender-admin"],
            assignmentStatus: "active",
            membershipStatus: "active",
            canMakeFinalDecision: true,
          },
        ] as never}
        mode="table"
      />
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Northstar Member")).toBeTruthy();
    expect(screen.getByText("member@northstar.example.com")).toBeTruthy();
    expect(screen.getByText("Lender Admin")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
  });
});
