// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

const invalidate = vi.fn<() => Promise<void>>().mockResolvedValue();
const signOut = vi.fn<() => Promise<void>>().mockResolvedValue();
const switchToOrganization =
  vi.fn<(organizationId: string) => Promise<void | { error: string }>>()
    .mockResolvedValue();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAuth: () => ({
    organizationId: "org_oakline",
    role: "builder",
    roles: ["builder"],
    signOut,
    switchToOrganization,
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({
    organizations: [
      {
        membershipId: "om_fairlend",
        organizationName: "FairLend",
        roleNames: ["Principal Broker"],
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        workosOrganizationId: "org_fairlend",
      },
      {
        membershipId: "om_oakline",
        organizationName: "Oakline Builds",
        roleNames: ["Builder"],
        roleSlug: "builder",
        roleSlugs: ["builder"],
        workosOrganizationId: "org_oakline",
      },
      {
        membershipId: "om_fairlend_duplicate",
        organizationName: "FairLend",
        roleNames: ["Admin"],
        roleSlug: "admin",
        roleSlugs: ["admin"],
        workosOrganizationId: "org_fairlend_duplicate",
      },
    ],
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { SidebarProvider } from "#/components/ui/sidebar.tsx";
import { NavUser } from "./nav-user";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  invalidate.mockClear();
  signOut.mockClear();
  switchToOrganization.mockClear();
});

describe("NavUser", () => {
  test("renders the account menu as a WorkOS organization switcher", async () => {
    renderNavUser();

    fireEvent.click(screen.getByRole("button", { name: /Connor Belezney/i }));

    expect(screen.queryByText("Upgrade to Pro")).toBeNull();
    expect(screen.queryByText("Billing")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.getByText("Active organization")).toBeTruthy();
    expect(screen.getAllByText("Oakline Builds").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Builder").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FairLend")).toHaveLength(1);
    expect(screen.getByText("Principal Broker")).toBeTruthy();

    fireEvent.click(screen.getByText("FairLend").closest('[role="menuitem"]')!);

    await waitFor(() =>
      expect(switchToOrganization).toHaveBeenCalledWith("org_fairlend")
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  test("keeps log out wired to AuthKit sign out", async () => {
    renderNavUser();

    fireEvent.click(screen.getByRole("button", { name: /Connor Belezney/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ returnTo: "/" })
    );
  });
});

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser
        user={{
          avatar: "",
          email: "connor.belez@gmail.com",
          name: "Connor Belezney",
        }}
      />
    </SidebarProvider>
  );
}
