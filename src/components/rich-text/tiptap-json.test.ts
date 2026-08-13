import { describe, expect, test } from "vitest";
import { tiptapContent, tiptapJsonEqual } from "./tiptap-json.ts";

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

describe("tiptapContent", () => {
  test("parses a serialized TipTap document for rich-text rendering", () => {
    const value = JSON.stringify({
      content: [
        {
          content: [{ marks: [{ type: "bold" }], text: "Approved Scope", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });

    expect(tiptapContent(value)).toEqual({
      content: [
        {
          content: [{ marks: [{ type: "bold" }], text: "Approved Scope", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
  });

  test("preserves HTML, ordinary text, and unrelated JSON", () => {
    expect(tiptapContent("<p>Approved Scope</p>")).toBe(
      "<p>Approved Scope</p>"
    );
    expect(tiptapContent("Approved Scope")).toBe("Approved Scope");
    expect(tiptapContent('{"status":"approved"}')).toBe(
      '{"status":"approved"}'
    );
  });
});
