import { describe, expect, test } from "vitest";

import { tiptapJsonEqual } from "./tiptap-json.ts";

describe("tiptapJsonEqual", () => {
  test("treats empty editor representations as equal", () => {
    expect(tiptapJsonEqual("", "<p></p>")).toBe(true);
    expect(
      tiptapJsonEqual(
        "",
        '{"content":[{"type":"paragraph"}],"type":"doc"}',
      ),
    ).toBe(true);
  });

  test("does not treat malformed paragraph content as empty", () => {
    for (const content of ["not-an-array", null, {}]) {
      expect(
        tiptapJsonEqual(
          "",
          JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content }],
          }),
        ),
      ).toBe(false);
    }
  });

  test("ignores JSON object-key ordering but detects content changes", () => {
    expect(
      tiptapJsonEqual(
        '{"type":"doc","content":[{"type":"paragraph"}]}',
        '{"content":[{"type":"paragraph"}],"type":"doc"}',
      ),
    ).toBe(true);
    expect(
      tiptapJsonEqual(
        '{"type":"doc","content":[{"type":"paragraph"}]}',
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Changed"}]}]}',
      ),
    ).toBe(false);
  });
});
