// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildWorkosUserOptions,
  WorkosUserAutocomplete,
} from "./WorkosUserAutocomplete";

afterEach(() => cleanup());

describe("buildWorkosUserOptions", () => {
  test("scopes WorkOS user options to the current organization", () => {
    const options = buildWorkosUserOptions(
      {
        memberships: [
          {
            roleSlug: "contractor",
            roleSlugs: ["contractor"],
            status: "active",
            workosOrganizationId: "org_current",
            workosUserId: "user_contractor",
          },
          {
            roleSlug: "builder",
            roleSlugs: ["builder"],
            status: "active",
            workosOrganizationId: "org_other",
            workosUserId: "user_builder",
          },
          {
            roleSlug: "contractor",
            roleSlugs: ["contractor"],
            status: "deleted",
            workosOrganizationId: "org_current",
            workosUserId: "user_deleted",
          },
        ],
        organizations: [
          {
            name: "Current Brokerage",
            workosOrganizationId: "org_current",
          },
        ],
        users: [
          {
            email: "maya.singh@northstar.example",
            name: "Maya Singh",
            roleSlugs: ["contractor"],
            status: "active",
            workosUserId: "user_contractor",
          },
          {
            email: "alex@oakline.example",
            name: "Alex Morgan",
            roleSlugs: ["builder"],
            status: "active",
            workosUserId: "user_builder",
          },
        ],
      },
      "org_current",
    );

    expect(options).toEqual([
      expect.objectContaining({
        email: "maya.singh@northstar.example",
        organizationName: "Current Brokerage",
        roleSlugs: ["contractor"],
        workosUserId: "user_contractor",
      }),
    ]);
  });

  test("keeps membership-only WorkOS identities selectable", () => {
    const options = buildWorkosUserOptions(
      {
        memberships: [
          {
            roleSlug: "contractor",
            roleSlugs: ["contractor"],
            status: "pending",
            workosOrganizationId: "org_current",
            workosUserId: "user_pending_contractor",
          },
        ],
        organizations: [
          {
            name: "Current Brokerage",
            workosOrganizationId: "org_current",
          },
        ],
        users: [],
      },
      "org_current",
    );

    expect(options).toEqual([
      expect.objectContaining({
        membershipStatus: "pending",
        organizationName: "Current Brokerage",
        workosUserId: "user_pending_contractor",
      }),
    ]);
  });
});

describe("WorkosUserAutocomplete", () => {
  test("selects a WorkOS user from searchable directory options", async () => {
    const onValueChange = vi.fn();

    render(
      <WorkosUserAutocomplete
        onValueChange={onValueChange}
        options={[
          {
            email: "maya.singh@northstar.example",
            membershipStatus: "active",
            name: "Maya Singh",
            organizationName: "FairLendBrokerage",
            roleSlugs: ["contractor"],
            workosUserId: "user_visual_contractor_masonry",
          },
          {
            email: "alex.morgan@oaklinebuilds.com",
            membershipStatus: "active",
            name: "Alex Morgan",
            organizationName: "Oakline Lending",
            roleSlugs: ["builder"],
            workosUserId: "user_visual_builder",
          },
        ]}
        value=""
      />,
    );

    const input = screen.getByRole("combobox", { name: "WorkOS user" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "Maya" } });
    fireEvent.click(await screen.findByText("Maya Singh"));

    expect(onValueChange).toHaveBeenLastCalledWith(
      "user_visual_contractor_masonry",
    );
  });
});
