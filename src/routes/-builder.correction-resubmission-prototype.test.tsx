import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuilderCorrectionPrototypeSurface } from "./builder.correction-resubmission-prototype.tsx";

describe("Builder correction prototype", () => {
  for (const variant of ["A", "B", "C"] as const) {
    it(`SSR renders Builder-safe Milestone Variant ${variant}`, () => {
      const markup = renderToStaticMarkup(<BuilderCorrectionPrototypeSurface variant={variant} />);
      for (const text of ["Correct and resubmit", "MR-07-018", "Decision cycle 2", "same request", "Correction required", "Local state only", "Awaiting variant decision", "Resubmit corrected request", "Permitted request history"]) expect(markup).toContain(text);
      for (const text of ["Release Draw", "Approve this request", "Reject this request", "Private decline reason", "Morgan Lee", "Gantt", "Contractors"]) expect(markup).not.toContain(text);
    });
    it(`SSR keeps Draw Variant ${variant} free of Milestone-only gates`, () => {
      const markup = renderToStaticMarkup(<BuilderCorrectionPrototypeSurface initialRequestKind="draw" variant={variant} />);
      expect(markup).toContain("DR-2048");
      expect(markup).toContain(
        variant === "C"
          ? "no configured receipt/invoice or Site Visit gate"
          : "No Draw-level Site Visit or receipt/invoice evidence gate"
      );
      expect(markup).not.toContain("Receipt and invoice total equals actual cost");
      expect(markup).not.toContain("Required Site Visit report and photo");
    });
  }

  it("keeps rejected cycle history and current-cycle evidence after resubmission", () => {
    const markup = renderToStaticMarkup(
      <BuilderCorrectionPrototypeSurface
        initialAttached
        initialCycle={3}
        initialState="pending"
        variant="A"
      />
    );

    expect(markup).toContain("Decision cycle 1");
    expect(markup).toContain("Decision cycle 2");
    expect(markup).toContain("Decision cycle 3");
    expect(markup).toContain("Returned for correction");
    expect(markup).toContain("Referenced by decision cycle 3");
    expect(markup).not.toContain("attached to cycle 2");
  });
});
