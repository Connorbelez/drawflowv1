import { afterEach, describe, expect, test, vi } from "vitest";

import {
  identityInvitationLandingUrl,
  identityInvitationPersonaForRole,
  identityInvitationPayload,
  renderIdentityInvitationEmail,
} from "./identity_invitation_emails";

describe("identity invitation emails", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    ["contractor", "contractor"],
    ["member", "contractor"],
    ["builder-staff", "builder"],
    ["lender-admin", "lender"],
    ["principal-broker", "brokerage"],
  ])("maps %s to the %s persona", (roleSlug, persona) => {
    expect(identityInvitationPersonaForRole(roleSlug)).toBe(persona);
  });

  test("keeps the three product invitation subjects and CTAs distinct", () => {
    const emails = ["contractor", "builder", "lender"].map((roleSlug) =>
      renderIdentityInvitationEmail({
        invitationUrl: "https://drawflow.test/invitations/inv_test",
        recipientName: "Avery",
        roleSlug,
      })
    );

    expect(new Set(emails.map((email) => email.subject)).size).toBe(3);
    expect(emails[0]?.text).toContain("contractor");
    expect(emails[1]?.text).toContain("builder");
    expect(emails[2]?.text).toContain("lender");
    expect(emails[0]?.html).toContain("Avery");
    expect(
      renderIdentityInvitationEmail({
        invitationUrl: "https://drawflow.test/invitations/inv_test",
        recipientName: "<Avery>",
        roleSlug: "contractor",
      }).html
    ).toContain("&lt;Avery&gt;");
  });

  test("serializes an opaque WorkOS invitation reference", () => {
    expect(identityInvitationPayload("inv_123", "builder")).toBe(
      '{"roleSlug":"builder","workosInvitationId":"inv_123"}'
    );
  });

  test("builds invitation landing links from the configured application origin", () => {
    vi.stubEnv("DRAWFLOW_APP_ORIGINS", "https://app.drawflow.test,https://backup.test");

    expect(identityInvitationLandingUrl("inv_123")).toBe(
      "https://app.drawflow.test/invitations/inv_123"
    );
  });
});
