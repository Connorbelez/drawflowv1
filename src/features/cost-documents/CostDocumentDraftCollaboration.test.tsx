// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CostDocumentDraftCollaboration } from "./CostDocumentDraftCollaboration.tsx";

const creator = {
  displayName: "Maya Chen",
  email: "maya@example.com",
  roleLabel: "Homeowner",
  workosUserId: "user-maya",
};

const collaborator = {
  displayName: "Sam Rivera",
  email: "sam@example.com",
  grantedAt: 1_723_000_000_000,
  roleLabel: "Builder Staff",
  workosUserId: "user-sam",
};

const eligible = {
  displayName: "Anika Patel",
  email: "anika@example.com",
  roleLabel: "Builder owner",
  workosUserId: "user-anika",
};

describe("CostDocumentDraftCollaboration", () => {
  afterEach(() => cleanup());

  test("keeps creator ownership and exact-Draft scope explicit while granting access at the current revision", () => {
    const onGrant = vi.fn();
    render(
      <CostDocumentDraftCollaboration
        canManageAccess
        collaborators={[collaborator]}
        creator={creator}
        draftReference="CD-8DF3"
        eligibleCollaborators={[eligible]}
        onGrant={onGrant}
        onRevoke={vi.fn()}
        revision={7}
        title="Electrical rough-in invoice"
      />
    );

    expect(screen.getByText("Share this Draft")).toBeTruthy();
    expect(screen.getByText("Exact Draft")).toBeTruthy();
    expect(screen.getByText("Creator · Homeowner")).toBeTruthy();
    expect(screen.getByText("Collaborator · Builder Staff")).toBeTruthy();
    expect(screen.getByText(/never reveals any other Cost Document/i)).toBeTruthy();
    expect(screen.getByText(/Every change keeps its actual actor/i)).toBeTruthy();

    const collaboratorSearch = screen.getByLabelText(
      "Search eligible collaborators"
    );
    expect(collaboratorSearch.className).toContain("min-h-11");
    fireEvent.click(collaboratorSearch);
    fireEvent.change(collaboratorSearch, {
      target: { value: "anika" },
    });
    fireEvent.click(
      screen.getByRole("option", { name: /Anika Patel/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm Draft access" }));

    expect(onGrant).toHaveBeenCalledWith({
      expectedRevision: 7,
      granteeWorkosUserId: "user-anika",
    });
  });

  test("requires confirmation before revoking and preserves the prior contribution explanation", () => {
    const onRevoke = vi.fn();
    render(
      <CostDocumentDraftCollaboration
        canManageAccess
        collaborators={[collaborator]}
        creator={creator}
        draftReference="CD-8DF3"
        eligibleCollaborators={[]}
        onGrant={vi.fn()}
        onRevoke={onRevoke}
        revision={9}
        title="Electrical rough-in invoice"
      />
    );

    const revokeButton = screen.getByRole("button", {
      name: "Revoke Sam Rivera Draft access",
    });
    expect(revokeButton.className).toContain("min-h-11");
    fireEvent.click(revokeButton);
    expect(
      screen.getByText(/prior contributions remain attributed to Sam Rivera/i)
    ).toBeTruthy();
    expect(onRevoke).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", {
      name: "Confirm revocation",
    });
    expect(confirmButton.className).toContain("min-h-11");
    fireEvent.click(confirmButton);
    expect(onRevoke).toHaveBeenCalledWith({
      collaboratorWorkosUserId: "user-sam",
      expectedRevision: 9,
    });
  });

  test("renders a collaborator-safe read view without creator controls or participant directory", () => {
    render(
      <CostDocumentDraftCollaboration
        canManageAccess={false}
        collaborators={[collaborator]}
        creator={creator}
        draftReference="CD-8DF3"
        eligibleCollaborators={[]}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        revision={4}
        title="Electrical rough-in invoice"
      />
    );

    expect(
      screen.getByText(
        "Draft access cannot be changed from your current capacity."
      )
    ).toBeTruthy();
    expect(screen.queryByLabelText("Search eligible collaborators")).toBeNull();
    expect(screen.queryByText("Owner-only controls")).toBeNull();
    expect(screen.queryByRole("button", { name: /Grant .* Draft access/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revoke .* Draft access/ })).toBeNull();
  });

  test("surfaces stale-access errors beside the ledger without dropping current access", () => {
    render(
      <CostDocumentDraftCollaboration
        canManageAccess
        collaborators={[collaborator]}
        creator={creator}
        draftReference="CD-8DF3"
        eligibleCollaborators={[]}
        error="Draft access changed while you were reviewing it. Refresh and try again."
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        revision={12}
        title="Electrical rough-in invoice"
      />
    );

    expect(screen.getByText("Draft access not changed")).toBeTruthy();
    expect(screen.getByText(/Refresh and try again/)).toBeTruthy();
    expect(screen.getByText("Sam Rivera")).toBeTruthy();
  });
});
