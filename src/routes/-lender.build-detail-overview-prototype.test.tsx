import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LenderBuildDetailOverviewPrototypeSurface } from "./lender.build-detail-overview-prototype.tsx";

const variants = ["A", "B", "C"] as const;

describe("Lender Build Detail Overview prototype", () => {
  for (const variant of variants) {
    it(`renders the narrow canonical projection for Variant ${variant}`, () => {
      const markup = renderToStaticMarkup(
        <LenderBuildDetailOverviewPrototypeSurface variant={variant} />,
      );

      expect(markup).toContain("Harbourline Residences");
      expect(markup).toContain("Milestone records");
      expect(markup).toContain("Draw records");
      expect(markup).toContain("Evidence package complete");
      expect(markup).toContain("Open Milestone review");
      expect(markup).toContain("Open Draw review");

      if (variant === "C") {
        expect(markup).toContain("Receipt / invoice coverage");
        expect(markup).toContain("Budget");
        expect(markup).toContain("Date range");
        expect(markup).toContain("Expand Site prep &amp; foundation Sub-milestones");
        expect(markup).toContain("Collaboration");
        expect(markup).toContain("Material plan is copied from the approved proposal.");
        expect(markup).toContain("Not recorded");
        expect(markup).not.toContain("Prototype only");
        expect(markup).not.toContain("Local representative data");
        expect(markup).not.toContain("No variant selected");
        expect(markup).not.toContain("permission-shaped");
        expect(markup).not.toContain("Canonical Build state");
        expect(markup).not.toContain("Read-only participant projection");
        expect(markup).not.toContain('data-slot="frame"');
        expect(markup).not.toContain('data-slot="card"');
        expect(markup).not.toContain("Confirm supplier lead times");
      } else {
        expect(markup).toContain("Read-only");
        expect(markup).toContain("Local representative data");
        expect(markup).toContain("C approved and locked");
      }

      expect(markup).not.toContain("Gantt");
      expect(markup).not.toContain("Contractors");
      expect(markup).not.toContain("Internal notes");
      expect(markup).not.toContain("Document library");
      expect(markup).not.toContain("Release Draw");
      expect(markup).not.toContain("Back Office + lender quorum");
      expect(markup).not.toContain("Open record for detail");
      expect(markup).not.toContain("<form");
      expect(markup).not.toContain("<input");
      expect(markup).not.toContain("<textarea");
    });
  }
});
