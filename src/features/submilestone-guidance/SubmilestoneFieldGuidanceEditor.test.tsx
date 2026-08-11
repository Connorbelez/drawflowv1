// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  hasMeaningfulTipTapContent,
  SubmilestoneFieldGuidanceEditor,
  type SubmilestoneFieldGuidance,
} from "./SubmilestoneFieldGuidanceEditor.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    ariaLabel,
    editable,
    onChange,
    onDocumentChange,
    testId,
    value,
  }: {
    ariaLabel: string;
    editable?: boolean;
    onChange?: (html: string) => void;
    onDocumentChange?: (document: Record<string, unknown>) => void;
    testId?: string;
    value: unknown;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-editable={editable ? "true" : "false"}
      data-testid={testId}
      onChange={() => {
        // TipTap emits HTML before the canonical JSON document.  Keep this
        // ordering in the mock so the component test proves HTML cannot leak
        // into the persisted field.
        onChange?.("<p>html-only-value</p>");
        onDocumentChange?.(updatedDocument);
      }}
      value={typeof value === "string" ? value : JSON.stringify(value)}
      readOnly={!editable}
    />
  ),
  FieldRichTextPreview: ({ ariaLabel, value }: { ariaLabel: string; value: unknown }) => (
    <output aria-label={ariaLabel}>{JSON.stringify(value)}</output>
  ),
}));

const updatedDocument = {
  content: [{ content: [{ text: "updated" }], type: "paragraph" }],
  type: "doc",
};

const guidance: SubmilestoneFieldGuidance = {
  cameraAnglesTiptapJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
  whatToVerifyTiptapJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
};

afterEach(() => cleanup());

describe("SubmilestoneFieldGuidanceEditor", () => {
  test("uses the same semantic image and rule criteria as Site Visit validation", () => {
    expect(
      hasMeaningfulTipTapContent(
        JSON.stringify({
          content: [{ attrs: {}, type: "image" }],
          type: "doc",
        }),
      ),
    ).toBe(false);
    expect(
      hasMeaningfulTipTapContent(
        JSON.stringify({
          content: [{ attrs: { src: "https://example.test/site.jpg" }, type: "image" }],
          type: "doc",
        }),
      ),
    ).toBe(true);
    expect(
      hasMeaningfulTipTapContent(
        JSON.stringify({ content: [{ type: "horizontalRule" }], type: "doc" }),
      ),
    ).toBe(true);
  });

  test("keeps two editors under one explicit save and reports dirty state", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={guidance}
        id="footings"
        onDirtyChange={onDirtyChange}
        onSave={onSave}
        rowName="Foundation"
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    const save = screen.getByRole("button", { name: "Save field guidance" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
      { target: { value: "updated" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms recommended camera angles" }),
      { target: { value: "updated" } },
    );
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    expect(onDirtyChange).toHaveBeenCalledWith(true);

    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual({
      cameraAnglesTiptapJson: JSON.stringify(updatedDocument),
      whatToVerifyTiptapJson: JSON.stringify(updatedDocument),
    });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test("keeps save disabled when TipTap JSON only differs by object-key order", () => {
    render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={{
          cameraAnglesTiptapJson:
            '{"content":[{"type":"paragraph"}],"type":"doc"}',
          whatToVerifyTiptapJson:
            '{"content":[{"type":"paragraph"}],"type":"doc"}',
        }}
        id="footings"
        onSave={vi.fn()}
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Save field guidance" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("retains both local sections and retry affordance after a failed save", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Guidance service unavailable"))
      .mockResolvedValueOnce(undefined);
    render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={guidance}
        id="footings"
        onSave={onSave}
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
      { target: { value: "updated" } },
    );
    const save = screen.getByRole("button", { name: "Save field guidance" });
    fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("unavailable"),
    );
    expect(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
    ).toBeTruthy();
    expect(save.hasAttribute("disabled")).toBe(false);

    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
  });

  test("uses read-only previews and does not expose an edit or save control", () => {
    render(
      <SubmilestoneFieldGuidanceEditor
        guidance={guidance}
        id="footings"
        readOnly
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    expect(screen.queryByRole("button", { name: "Save field guidance" })).toBeNull();
    expect(screen.getByLabelText("Footing forms what to verify")).toBeTruthy();
  });

  test("supports a parent-owned deferred draft without rendering a save action", () => {
    const onDraftChange = vi.fn();
    render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={guidance}
        id="footings"
        onDraftChange={onDraftChange}
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    expect(screen.queryByRole("button", { name: "Save field guidance" })).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
      { target: { value: "updated" } },
    );
    expect(onDraftChange).toHaveBeenCalledWith({
      cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
      whatToVerifyTiptapJson: JSON.stringify(updatedDocument),
    });
  });

  test("emits one deferred draft under StrictMode and drops it when the identity changes", async () => {
    const onDraftChange = vi.fn();
    const view = render(
      <StrictMode>
        <SubmilestoneFieldGuidanceEditor
          canEdit
          guidance={guidance}
          id="footings"
          onDraftChange={onDraftChange}
          subMilestoneName="Footing forms"
          testIdPrefix="test"
        />
      </StrictMode>,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
      { target: { value: "updated" } },
    );
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledTimes(1));

    onDraftChange.mockClear();
    view.rerender(
      <StrictMode>
        <SubmilestoneFieldGuidanceEditor
          canEdit
          guidance={guidance}
          id="walls"
          onDraftChange={onDraftChange}
          subMilestoneName="Foundation walls"
          testIdPrefix="test"
        />
      </StrictMode>,
    );

    await waitFor(() => expect(onDraftChange).not.toHaveBeenCalled());
  });

  test("keeps the editor mounted but blocks input while the parent command is pending", () => {
    const onDraftChange = vi.fn();
    render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        disabled
        guidance={guidance}
        id="footings"
        onDraftChange={onDraftChange}
        subMilestoneName="Footing forms"
        testIdPrefix="test"
      />,
    );

    const editor = screen.getByRole("textbox", {
      name: "Footing forms what to verify",
    });
    expect(editor.getAttribute("data-editable")).toBe("false");
    expect(editor.hasAttribute("readonly")).toBe(true);
  });

  test("clears dirty state when the identity changes", async () => {
    const onDirtyChange = vi.fn();
    const view = render(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={guidance}
        id="footings"
        onDirtyChange={onDirtyChange}
        onSave={vi.fn()}
        subMilestoneName="Footing forms"
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Footing forms what to verify" }),
      { target: { value: "updated" } },
    );
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    view.rerender(
      <SubmilestoneFieldGuidanceEditor
        canEdit
        guidance={guidance}
        id="walls"
        onDirtyChange={onDirtyChange}
        onSave={vi.fn()}
        subMilestoneName="Foundation walls"
      />,
    );
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });
});
