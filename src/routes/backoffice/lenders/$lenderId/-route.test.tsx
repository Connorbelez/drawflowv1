// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  createFileRoute: () => (config: unknown) => config,
}));

import { LenderOrganizationSummary, Route } from "./route.tsx";

const routeConfig = Route as unknown as {
  staticData?: { breadcrumb?: unknown };
};

describe("Back Office lender organization detail route", () => {
  test("keeps the parent breadcrumb target and detail breadcrumb contract", () => {
    expect(routeConfig.staticData?.breadcrumb).toMatchObject({
      label: expect.any(Function),
      to: "/backoffice/lenders/$lenderId",
    });
  });

  test("renders summary values from organization-scoped query data", () => {
    render(
      <LenderOrganizationSummary
        activeBuildCount={2}
        activeMemberCount={3}
        currentProposalCount={4}
      />
    );
    expect(screen.getByText("Active Builds")).toBeTruthy();
    expect(screen.getByText("Current assigned Proposals")).toBeTruthy();
    expect(screen.getByText("Active members")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });
});
