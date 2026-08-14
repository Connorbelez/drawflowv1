// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { DirectoryUser } from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosUserRow,
} from "#/routes/backoffice/-user-management-types.ts";

import { LenderOrganizationOperationDialog } from "./LenderOrganizationOperationDialog.tsx";
import {
  LenderMemberAdministrationDetails,
  LenderOrganizationManagementVariantE,
} from "./LenderOrganizationManagementVariantE.tsx";

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
  });
  class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => cleanup());

const organization: WorkosOrganizationRow = {
  name: "Northstar Lending",
  status: "active",
  workosOrganizationId: "org_northstar",
};
const principal = directoryUser({
  email: "principal@northstar.test",
  membershipId: "om_principal",
  name: "Pat Principal",
  roles: ["admin", "principle-broker"],
  status: "active",
  userId: "user_principal",
});
const broker = directoryUser({
  email: "broker@northstar.test",
  membershipId: "om_broker",
  name: "Blair Broker",
  roles: ["broker"],
  status: "inactive",
  userId: "user_broker",
});

describe("approved lender organization management Variant E", () => {
  test("renders the approved hierarchy through SSR without prototype fixtures", () => {
    const markup = renderToStaticMarkup(
      <LenderOrganizationManagementVariantE
        activeMemberCount={1}
        administrationContext="Admin · Principal Broker"
        directoryUsers={[principal, broker]}
        mode="production"
        onOpenOperation={() => undefined}
        onOpenUser={() => undefined}
        organizationName={organization.name ?? "Northstar Lending"}
        organizationsById={new Map([[organization.workosOrganizationId, organization]])}
        pending={false}
        provisioningByOrg={new Map()}
      />
    );

    expect(markup).toContain("Organization members");
    expect(markup).toContain("Northstar Lending");
    expect(markup).toContain("Membership context");
    expect(markup).toContain("Policy boundary");
    expect(markup).not.toContain("visual fixture");
    expect(markup).not.toContain("Variant E");
  });

  test("filters the canonical shared table and exposes the organization invite action", () => {
    const onOpenOperation = vi.fn();
    const onOpenUser = vi.fn();
    render(
      <LenderOrganizationManagementVariantE
        activeMemberCount={1}
        administrationContext="Admin · Principal Broker"
        directoryUsers={[principal, broker]}
        mode="production"
        onOpenOperation={onOpenOperation}
        onOpenUser={onOpenUser}
        organizationName="Northstar Lending"
        organizationsById={new Map([[organization.workosOrganizationId, organization]])}
        pending={false}
        provisioningByOrg={new Map()}
      />
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search organization members" }), {
      target: { value: "Blair" },
    });
    expect(screen.getByText("Blair Broker")).toBeTruthy();
    expect(screen.queryByText("Pat Principal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Active1/ }));
    expect(screen.getByText("No organization members match this view.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Invite member/ }));
    expect(onOpenOperation).toHaveBeenCalledWith("invite");
  });

  test("preserves the four member tabs and protected transfer workflow", () => {
    const onOpenOperation = vi.fn();
    render(
      <LenderMemberAdministrationDetails
        activeMembershipCount={1}
        historyCount={3}
        member={principal}
        mode="production"
        onOpenOperation={onOpenOperation}
        organizationName="Northstar Lending"
      />
    );

    expect(screen.getByRole("tab", { name: "Access" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Administration" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review relationship" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "History" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Administration" }));
    fireEvent.click(screen.getByRole("button", { name: /Transfer control/ }));
    expect(onOpenOperation).toHaveBeenCalledWith("transfer-principal");
    fireEvent.click(screen.getByRole("tab", { name: "Review relationship" }));
    expect(screen.getByText("Not derived on this surface")).toBeTruthy();
    expect(screen.getByText(/cannot change approval policy/)).toBeTruthy();
  });

  test("requires draft validation and review before a canonical invitation command", async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    render(
      <LenderOrganizationOperationDialog
        directoryUsers={[principal, broker]}
        member={null}
        onExecute={onExecute}
        onOpenChange={() => undefined}
        operation="invite"
        organizationName="Northstar Lending"
        pending={false}
      />
    );

    const review = screen.getByRole("button", { name: /Review draft/ });
    expect(review.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Member email"), {
      target: { value: "new.broker@northstar.test" },
    });
    expect(screen.getByLabelText("Starting access")).toBeTruthy();
    expect(review.hasAttribute("disabled")).toBe(false);
    fireEvent.click(review);
    expect(screen.getByText("Ready to submit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm command" }));
    expect(onExecute).toHaveBeenCalledWith({
      email: "new.broker@northstar.test",
      kind: "invite",
      roleSlug: "broker",
    });
  });

  test("blocks ordinary deactivation of the projected Principal Broker", () => {
    render(
      <LenderOrganizationOperationDialog
        directoryUsers={[principal, broker]}
        member={principal}
        onExecute={vi.fn()}
        onOpenChange={() => undefined}
        operation="deactivate"
        organizationName="Northstar Lending"
        pending={false}
      />
    );
    fireEvent.change(screen.getByLabelText("Operational reason"), {
      target: { value: "Principal is leaving the brokerage" },
    });
    const acknowledgement = screen.getByRole("checkbox");
    fireEvent.click(acknowledgement);
    fireEvent.click(screen.getByRole("button", { name: /Review draft/ }));
    expect(screen.getByText("Transfer required")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm command" }).hasAttribute("disabled")).toBe(true);
  });
  test("ignores an incomplete transfer candidate without crashing", () => {
    const incompleteCandidate = directoryUser({
      email: "incomplete@northstar.test",
      membershipId: "om_incomplete",
      name: "Incomplete Candidate",
      roles: ["broker"],
      status: "active",
      userId: "user_incomplete",
    });
    incompleteCandidate.memberships[0]!.roleSlugs = undefined;

    render(
      <LenderOrganizationOperationDialog
        directoryUsers={[principal, incompleteCandidate]}
        member={principal}
        onExecute={vi.fn()}
        onOpenChange={() => undefined}
        operation="transfer-principal"
        organizationName="Northstar Lending"
        pending={false}
      />
    );

    expect(screen.getByLabelText("Replacement Principal Broker")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Incomplete Candidate" })).toBeNull();
  });

});

function directoryUser(input: {
  email: string;
  membershipId: string;
  name: string;
  roles: string[];
  status: WorkosMembershipRow["status"];
  userId: string;
}): DirectoryUser {
  const membership: WorkosMembershipRow = {
    roleSlug: input.roles[0],
    roleSlugs: input.roles,
    status: input.status,
    workosMembershipId: input.membershipId,
    workosOrganizationId: organization.workosOrganizationId,
    workosUserId: input.userId,
  };
  return {
    displayName: input.name,
    initials: input.name.split(" ").map((part) => part[0]).join(""),
    memberships: [membership],
    user: {
      email: input.email,
      name: input.name,
      roleSlugs: input.roles,
      roles: input.roles.join(", "),
      status: input.status === "active" ? "active" : "deleted",
      workosUserId: input.userId,
    } as unknown as WorkosUserRow,
  };
}
