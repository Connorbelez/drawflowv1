// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { SiteVisitOrderDialog } from "./SiteVisitOrderDialog.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    ariaLabel,
    editable = true,
    onChange,
    onDocumentChange,
    testId,
    value,
  }: {
    ariaLabel: string;
    editable?: boolean;
    onChange?: (value: string) => void;
    onDocumentChange?: (document: Record<string, unknown>) => void;
    testId?: string;
    value: unknown;
  }) => {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value ?? "");
    return (
      <textarea
        aria-label={ariaLabel}
        data-editable={editable ? "true" : "false"}
        data-testid={testId}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange?.(next);
          onDocumentChange?.({
            content: next.trim()
              ? [
                  {
                    content: [{ text: next, type: "text" }],
                    type: "paragraph",
                  },
                ]
              : [{ type: "paragraph" }],
            type: "doc",
          });
        }}
        readOnly={!editable}
        value={serialized}
      />
    );
  },
  FieldRichTextPreview: ({ ariaLabel, value }: { ariaLabel: string; value: unknown }) => (
    <output aria-label={ariaLabel}>{JSON.stringify(value)}</output>
  ),
}));

const doc = (text: string) =>
  JSON.stringify({
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    type: "doc",
  });

const emptyDoc = JSON.stringify({
  content: [{ type: "paragraph" }],
  type: "doc",
});

afterEach(() => cleanup());

function renderOrderDialog(
  onConfirm: (input: unknown) => Promise<unknown> | unknown,
  overrides: Record<string, unknown> = {},
) {
  return render(
    <SiteVisitOrderDialog
      build={{ name: "Test build", location: "Toronto, ON" }}
      milestone={{ key: "foundation", name: "Foundation" }}
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      open
      request={{ milestoneKey: "foundation" }}
      submilestones={[
        {
          _id: "build-sub-2",
          fieldGuidance: {
            cameraAnglesTiptapJson: doc("Capture framing"),
            whatToVerifyTiptapJson: doc("Check forms"),
          },
          key: "footings",
          name: "Footings",
          proposalSubmilestoneId: "proposal-sub-2",
        },
        {
          _id: "build-sub-1",
          fieldGuidance: {
            cameraAnglesTiptapJson: emptyDoc,
            whatToVerifyTiptapJson: doc("Check excavation"),
          },
          key: "excavation",
          name: "Excavation",
          proposalSubmilestoneId: "proposal-sub-1",
        },
      ]}
      {...overrides}
    />,
  );
}

describe("SiteVisitOrderDialog per-submilestone guidance", () => {
  test("renders ordered canonical pairs and requires both sections for every selected row", () => {
    renderOrderDialog(vi.fn());

    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));
    expect(dialog.getByRole("heading", { name: "Footings" })).toBeTruthy();
    expect(dialog.getByRole("heading", { name: "Excavation" })).toBeTruthy();
    expect(dialog.getByLabelText("Footings what to verify")).toBeTruthy();
    expect(dialog.getByLabelText("Footings recommended camera angles")).toBeTruthy();
    expect(dialog.getByLabelText("Excavation what to verify")).toBeTruthy();
    expect(dialog.getByLabelText("Excavation recommended camera angles")).toBeTruthy();
    expect(
      dialog.getByRole("button", { name: "Confirm and order site visit" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });

  test("keeps edits local and sends one ordered complete pair array on confirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderOrderDialog(onConfirm);
    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));

    fireEvent.change(dialog.getByLabelText("Excavation recommended camera angles"), {
      target: { value: "Capture excavation context" },
    });
    const confirm = dialog.getByRole("button", {
      name: "Confirm and order site visit",
    });
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(false));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneKey: "foundation",
        siteVisitGuidance: expect.any(Object),
        submilestoneGuidanceSections: [
          {
            buildSubmilestoneId: "build-sub-2",
            cameraAnglesTiptapJson: doc("Capture framing"),
            proposalSubmilestoneId: "proposal-sub-2",
            whatToVerifyTiptapJson: doc("Check forms"),
          },
          {
            buildSubmilestoneId: "build-sub-1",
            cameraAnglesTiptapJson: doc("Capture excavation context"),
            proposalSubmilestoneId: "proposal-sub-1",
            whatToVerifyTiptapJson: doc("Check excavation"),
          },
        ],
        submilestoneKeys: ["footings", "excavation"],
      }),
    );
  });

  test("disables editors while confirming and preserves local values after failure", async () => {
    let rejectConfirm: ((reason?: unknown) => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectConfirm = reject;
        }),
    );
    renderOrderDialog(onConfirm);
    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));
    const editor = dialog.getByLabelText("Excavation recommended camera angles");
    fireEvent.change(editor, { target: { value: "Local edit survives" } });
    await waitFor(() =>
      expect(
        dialog
          .getByRole("button", { name: "Confirm and order site visit" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      dialog.getByRole("button", { name: "Confirm and order site visit" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(editor.getAttribute("data-editable")).toBe("false");
    rejectConfirm?.(new Error("network unavailable"));
    await waitFor(() => expect(dialog.getByRole("alert")).toBeTruthy());
    expect(
      (dialog.getByLabelText("Excavation recommended camera angles") as HTMLTextAreaElement)
        .value,
    ).toContain("Local edit survives");
  });
});
