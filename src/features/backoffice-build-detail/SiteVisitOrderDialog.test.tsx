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
  return render(orderDialog(onConfirm, overrides));
}

function orderDialog(
  onConfirm: (input: unknown) => Promise<unknown> | unknown,
  overrides: Record<string, unknown> = {},
) {
  return (
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
    />
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

  test("lets the operator exclude individual Sub-milestones from the visit scope", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderOrderDialog(onConfirm);
    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));

    const footings = dialog.getByRole("checkbox", {
      name: /Include Footings in site visit/,
    });
    const excavation = dialog.getByRole("checkbox", {
      name: /Include Excavation in site visit/,
    });
    expect(footings.getAttribute("aria-checked")).toBe("true");
    expect(excavation.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(excavation);
    expect(excavation.getAttribute("aria-checked")).toBe("false");
    expect(
      dialog.queryByLabelText("Excavation recommended camera angles"),
    ).toBeNull();

    const confirm = dialog.getByRole("button", {
      name: "Confirm and order site visit",
    });
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        submilestoneGuidanceSections: [
          expect.objectContaining({ buildSubmilestoneId: "build-sub-2" }),
        ],
        submilestoneKeys: ["footings"],
      }),
    );
  });

  test("writes guidance for one Sub-milestone and uses its current draft as context", async () => {
    const onGenerate = vi.fn().mockResolvedValue({
      cameraAngles: "<ul><li>Capture HVAC connections.</li></ul>",
      source: "openai",
      whatToVerify: "<ul><li>Verify HVAC rough-ins.</li></ul>",
    });
    renderOrderDialog(vi.fn(), {
      onGenerate,
      submilestones: [
        {
          _id: "build-hvac",
          fieldGuidance: null,
          key: "hvac",
          name: "HVAC",
          proposalSubmilestoneId: "proposal-hvac",
        },
      ],
    });
    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));

    fireEvent.click(
      dialog.getByRole("button", { name: "Write HVAC with DrawFlow AI" }),
    );

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentGuidance: { cameraAngles: "", whatToVerify: "" },
        milestone: { key: "foundation", name: "Foundation" },
        submilestones: [{ key: "hvac", name: "HVAC" }],
      }),
    );
    await waitFor(() =>
      expect(
        (dialog.getByLabelText("HVAC what to verify") as HTMLTextAreaElement)
          .value,
      ).toContain("Verify HVAC rough-ins."),
    );
    expect(
      (dialog.getByLabelText("HVAC recommended camera angles") as HTMLTextAreaElement)
        .value,
    ).toContain("Capture HVAC connections.");
    expect(
      dialog.getByRole("button", { name: "Rewrite HVAC with DrawFlow AI" }),
    ).toBeTruthy();

    fireEvent.click(
      dialog.getByRole("button", { name: "Rewrite HVAC with DrawFlow AI" }),
    );
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(2));
    expect(onGenerate.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        currentGuidance: {
          cameraAngles: expect.stringContaining("Capture HVAC connections."),
          whatToVerify: expect.stringContaining("Verify HVAC rough-ins."),
        },
        submilestones: [{ key: "hvac", name: "HVAC" }],
      }),
    );
  });

  test("keeps AI visit-wide guidance when rebuilt parent props arrive", async () => {
    const onConfirm = vi.fn();
    const onGenerate = vi.fn().mockResolvedValue({
      cameraAngles: "<ul><li>Generated wide context.</li></ul>",
      source: "openai",
      whatToVerify: "<ul><li>Generated completion check.</li></ul>",
    });
    const view = renderOrderDialog(onConfirm, { onGenerate });
    const dialog = within(screen.getByRole("dialog", { name: "Configure site visit" }));

    fireEvent.click(
      dialog.getByRole("button", {
        name: "Rewrite visit-wide guidance with DrawFlow AI",
      }),
    );
    await waitFor(() =>
      expect(
        (dialog.getByLabelText("Visit-wide what to verify") as HTMLTextAreaElement)
          .value,
      ).toContain("Generated completion check."),
    );

    view.rerender(
      orderDialog(onConfirm, {
        milestone: { key: "foundation", name: "Foundation" },
        onGenerate,
      }),
    );

    expect(
      (dialog.getByLabelText("Visit-wide what to verify") as HTMLTextAreaElement)
        .value,
    ).toContain("Generated completion check.");
    expect(
      (dialog.getByLabelText("Visit-wide required photo angles") as HTMLTextAreaElement)
        .value,
    ).toContain("Generated wide context.");
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
