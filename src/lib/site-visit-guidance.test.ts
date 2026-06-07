import { describe, expect, test } from "vitest";

import {
  coerceGuidanceField,
  coerceSiteVisitGuidance,
  guidanceLinesToHtml,
} from "./site-visit-guidance.ts";

describe("site visit guidance coercion", () => {
  test("converts legacy line arrays into HTML lists", () => {
    expect(
      coerceGuidanceField(["Verify footing pins", "Confirm anchor bolts"])
    ).toBe(
      "<ul><li>Verify footing pins</li><li>Confirm anchor bolts</li></ul>"
    );
  });

  test("preserves existing HTML strings", () => {
    const html = "<p>Verify footing pins</p><img src='data:image/png;base64,abc' />";
    expect(coerceGuidanceField(html)).toBe(html);
    expect(coerceGuidanceField([html])).toBe(html);
  });

  test("normalizes partial guidance objects", () => {
    expect(
      coerceSiteVisitGuidance({
        cameraAngles: ["Wide shot"],
        whatToVerify: "<p>Done</p>",
      })
    ).toEqual({
      cameraAngles: guidanceLinesToHtml(["Wide shot"]),
      whatToVerify: "<p>Done</p>",
    });
  });
});
