import { describe, expect, test } from "vitest";

import {
  SITE_VISIT_GEOFENCE_RADIUS_METERS,
  distanceBetweenCoordinatesMeters,
  formatSiteVisitBytes,
  locationAttemptFromError,
  locationAttemptFromPosition,
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
      body: expect.stringContaining("report was already submitted"),
      canRequestReplacement: true,
      stamp: "TOKEN CONSUMED",
      title: "Site visit already complete",
    });

    expect(
      resolveSiteVisitUnavailableCopy({
        reason: "guidance_sections_overflow",
        status: "invalid",
      }),
    ).toMatchObject({
      body: expect.stringContaining("Visit data could not be loaded"),
      canRequestReplacement: false,
      stamp: "VISIT DATA INVALID",
      title: "Visit data unavailable",
    });
  });

  test("records geofence pass, geofence failure, and denied attempts without discarding report state", () => {
    expect(
      locationAttemptFromPosition(
        {
          accuracy: 8.4,
          latitude: 43.25571,
          longitude: -79.87109,
        },
        1_721_234_567_890,
        {
          latitude: 43.2557,
          longitude: -79.8711,
        },
      ),
    ).toMatchObject({
      accuracyMeters: 8,
      attempted: true,
      attemptedAt: 1_721_234_567_890,
      distanceMeters: 1,
      geofenceRadiusMeters: SITE_VISIT_GEOFENCE_RADIUS_METERS,
      latitude: 43.25571,
      longitude: -79.87109,
      permissionOutcome: "granted",
      verified: true,
    });

    expect(
      locationAttemptFromPosition(
        {
          accuracy: 8.4,
          latitude: 43.2605,
          longitude: -79.8711,
        },
        1_721_234_567_890,
        {
          latitude: 43.2557,
          longitude: -79.8711,
        },
      ),
    ).toMatchObject({
      attempted: true,
      failureReason: expect.stringContaining("outside the"),
      permissionOutcome: "granted",
      verified: false,
    });

    expect(
      locationAttemptFromPosition(
        {
          accuracy: 25,
          latitude: 43.2578,
          longitude: -79.8711,
        },
        1_721_234_567_890,
        {
          latitude: 43.2557,
          longitude: -79.8711,
        },
      ),
    ).toMatchObject({
      attempted: true,
      failureReason: expect.stringContaining("accuracy overlaps"),
      permissionOutcome: "granted",
      verified: false,
    });

    expect(
      locationAttemptFromError({ code: 1 }, 1_721_234_567_891)
    ).toEqual({
      attempted: true,
      attemptedAt: 1_721_234_567_891,
      failureReason: "Browser location permission was denied.",
      permissionOutcome: "denied",
      verified: false,
    });
  });

  test("calculates great-circle distance in meters", () => {
    expect(
      distanceBetweenCoordinatesMeters(
        { latitude: 43.2557, longitude: -79.8711 },
        { latitude: 43.2567, longitude: -79.8711 },
      ),
    ).toBeGreaterThan(110);
    expect(
      distanceBetweenCoordinatesMeters(
        { latitude: 43.2557, longitude: -79.8711 },
        { latitude: 43.2567, longitude: -79.8711 },
      ),
    ).toBeLessThan(112);
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
