import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const ACTION_ITEMS_TAB_PATTERN = /Action Items \d+/;
const SEEN_BY_PATTERN = /Seen by \d+/;

interface CollaborationPersonaFixture {
  actionItemText: string;
  buildUrl: string;
  expectRestricted: boolean;
  externalOrganization: boolean;
  grantOnly: boolean;
  referenceLabel: string;
  role:
    | "admin"
    | "principle-broker"
    | "broker"
    | "builder"
    | "broker-staff"
    | "builder-staff"
    | "homeowner"
    | "contractor";
  storageState: string;
  visiblePostText: string;
  workosUserId: string;
}

interface CollaborationRevocationFixture {
  controlToken: string;
  controlUrl: string;
  role: "homeowner" | "contractor";
}

interface CollaborationE2EFixture {
  buildId: string;
  organizationId: string;
  personas: CollaborationPersonaFixture[];
  revocation: CollaborationRevocationFixture;
}

const fixturePath = process.env.BUILD_COLLABORATION_E2E_FIXTURE;
const fixture = fixturePath
  ? (JSON.parse(
      readFileSync(resolve(fixturePath), "utf8")
    ) as CollaborationE2EFixture)
  : null;

test.describe("Build collaboration production personas", () => {
  test("has an explicit authenticated fixture for every approved persona", () => {
    test.skip(
      !(fixture || process.env.CI),
      "Set BUILD_COLLABORATION_E2E_FIXTURE to run authenticated persona E2E locally."
    );
    expect(
      fixture,
      "CI must provide BUILD_COLLABORATION_E2E_FIXTURE; collaboration persona coverage is a required acceptance gate."
    ).not.toBeNull();
    expect(fixture?.personas.map((persona) => persona.role).sort()).toEqual(
      [
        "admin",
        "principle-broker",
        "broker",
        "builder",
        "broker-staff",
        "builder-staff",
        "homeowner",
        "contractor",
      ].sort()
    );
    expect(
      fixture?.personas.find((persona) => persona.role === "homeowner")
    ).toMatchObject({
      externalOrganization: true,
      grantOnly: true,
    });
    expect(
      fixture?.personas.find((persona) => persona.role === "contractor")
    ).toMatchObject({ grantOnly: true });
  });
});

for (const persona of fixture?.personas ?? []) {
  test.describe(`${persona.role} production collaboration`, () => {
    test.use({ storageState: resolve(persona.storageState) });

    test("renders visible posts, placeholders, actions, receipts, references, and focused navigation", async ({
      page,
    }) => {
      await page.goto(persona.buildUrl);
      const feed = page.getByTestId("build-collaboration-feed");
      await expect(feed).toBeVisible();
      await expect(feed).toHaveAttribute("data-build-id", fixture!.buildId);
      await expect(feed).toHaveAttribute(
        "data-organization-id",
        fixture!.organizationId
      );
      await expect(feed).toHaveAttribute("data-viewer-role", persona.role);
      await expect(feed).toHaveAttribute(
        "data-viewer-workos-user-id",
        persona.workosUserId
      );
      await expect(feed.getByText(persona.visiblePostText)).toBeVisible();
      await expect(
        feed.getByRole("button", { name: ACTION_ITEMS_TAB_PATTERN }).first()
      ).toBeVisible();
      await feed
        .getByRole("button", { name: ACTION_ITEMS_TAB_PATTERN })
        .first()
        .click();
      await expect(feed.getByText(persona.actionItemText)).toBeVisible();
      await expect(feed.getByText(persona.referenceLabel)).toBeVisible();
      await expect(feed.getByText(SEEN_BY_PATTERN)).toBeVisible();
      if (persona.expectRestricted) {
        await expect(feed.getByText("Restricted update").first()).toBeVisible();
      }
      const focusedReference = new URL(
        persona.buildUrl,
        "http://drawflow.invalid"
      ).searchParams.get("focus");
      if (focusedReference) {
        await expect(page).toHaveURL(
          new RegExp(`focus=${encodeURIComponent(focusedReference)}`)
        );
        if (focusedReference.startsWith("actionItem:")) {
          await expect(
            page.locator(`[data-collaboration-focus="${focusedReference}"]`)
          ).toBeVisible();
        } else {
          await expect(
            page.getByTestId("build-collaboration-focused-reference")
          ).toHaveAttribute("data-reference-key", focusedReference);
        }
      }
    });
  });
}

const revocationPersona = fixture?.personas.find(
  (persona) => persona.role === fixture.revocation.role
);

if (fixture && revocationPersona) {
  test.describe("loaded-state participation revocation", () => {
    test.use({ storageState: resolve(revocationPersona.storageState) });

    test("revokes the open workspace without a page reload", async ({
      page,
      request,
    }) => {
      await page.goto(revocationPersona.buildUrl);
      const feed = page.getByTestId("build-collaboration-feed");
      await expect(feed).toBeVisible();

      const response = await request.post(fixture.revocation.controlUrl, {
        headers: {
          authorization: `Bearer ${fixture.revocation.controlToken}`,
        },
      });
      expect(response.ok()).toBe(true);

      await expect(feed).toBeHidden({ timeout: 30_000 });
      await expect(
        page.getByText(revocationPersona.visiblePostText)
      ).toBeHidden({ timeout: 30_000 });
    });
  });
}
