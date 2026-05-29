import { describe, expect, test } from "vitest";

import {
  LANDING_PRIMARY_ONBOARDING_CTA,
  LANDING_SECONDARY_ONBOARDING_CTA,
} from "./onboarding-cta";

describe("landing onboarding CTAs", () => {
  test("send builder and broker traffic into production onboarding", () => {
    expect(LANDING_PRIMARY_ONBOARDING_CTA).toMatchObject({
      label: "Start builder onboarding",
      to: "/builder/proposals/new",
    });

    expect(LANDING_SECONDARY_ONBOARDING_CTA).toMatchObject({
      label: "Broker: onboard a builder",
      shortLabel: "Broker onboarding",
      to: "/backoffice/onboard-builder",
    });
  });
});
