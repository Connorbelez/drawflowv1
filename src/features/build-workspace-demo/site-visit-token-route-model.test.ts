import { describe, expect, test } from "vitest";

import {
  formatSiteVisitBytes,
  normalizeSiteVisitTokenRoute,
  resolveSiteVisitUnavailableCopy,
} from "./site-visit-token-route-model";

describe("site visit token route model", () => {
  test("formats package sizes in the field packet style", () => {
    expect(formatSiteVisitBytes(412_000_000)).toBe("412 MB");
    expect(formatSiteVisitBytes(3_100_000)).toBe("3.1 MB");
    expect(formatSiteVisitBytes(1_200)).toBe("1.2 KB");
  });

  test("separates expired tokens from consumed or invalid tokens", () => {
    expect(
      resolveSiteVisitUnavailableCopy({ reason: "expired", status: "expired" })
    ).toMatchObject({
      stamp: "TOKEN EXPIRED",
      title: "Visit window closed",
    });

    expect(
      resolveSiteVisitUnavailableCopy({
        reason: "consumed",
        status: "completed",
      })
    ).toMatchObject({
      stamp: "TOKEN INVALID",
      title: "Visit unavailable",
    });
  });

  test("normalizes legacy backoffice site visit links to the standalone route", () => {
    expect(
      normalizeSiteVisitTokenRoute({
        url: "/backoffice/builds/active-maple-ridge/newsitevisit/token-123",
      })
    ).toBe("/newsitevisit/active-maple-ridge/token-123");

    expect(
      normalizeSiteVisitTokenRoute({
        token: "token/with/slash",
        buildId: "active-maple-ridge",
        url: "/backoffice/builds/active-maple-ridge/newsitevisit/old",
      })
    ).toBe("/newsitevisit/active-maple-ridge/token%2Fwith%2Fslash");
  });
});
