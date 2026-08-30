// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const headerActionsProps = vi.hoisted(() => vi.fn());

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAuth: () => ({
    organizationId: "org_lender_active",
    role: "lender-admin",
    roles: ["lender-admin"],
    user: {
      email: "lender@example.com",
      firstName: "Lena",
      lastName: "Lender",
      profilePictureUrl: "",
    },
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({
    organization: { displayName: "Northstar Lending" },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("#/components/app-header.tsx", () => ({
  AppHeaderActions: (props: { workosOrganizationId?: string | null }) => {
    headerActionsProps(props);
    return <div data-testid="shared-header-actions">Header actions</div>;
  },
}));

vi.mock("#/components/ui/breadcrumb.tsx", () => ({
  Breadcrumb: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  BreadcrumbLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  BreadcrumbList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BreadcrumbPage: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
}));

vi.mock("#/components/ui/sidebar.tsx", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Sidebar: Container,
    SidebarContent: Container,
    SidebarFooter: Container,
    SidebarGroup: Container,
    SidebarGroupLabel: Container,
    SidebarHeader: Container,
    SidebarInset: Container,
    SidebarMenu: Container,
    SidebarMenuButton: Container,
    SidebarMenuItem: Container,
    SidebarProvider: Container,
    SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
  };
});

import { LenderShell } from "./lender-shell.tsx";

afterEach(() => {
  cleanup();
  headerActionsProps.mockReset();
});

describe("LenderShell", () => {
  test("reuses the shared functional header actions with the active WorkOS organization", () => {
    render(
      <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
        <main>Proposal workspace</main>
      </LenderShell>
    );

    expect(screen.getByTestId("shared-header-actions")).toBeTruthy();
    expect(headerActionsProps).toHaveBeenCalledWith({
      workosOrganizationId: "org_lender_active",
    });
    expect(screen.getByText("Proposal review")).toBeTruthy();
    expect(screen.getByText("Proposal workspace")).toBeTruthy();
  });
});
