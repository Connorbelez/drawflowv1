// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { QuoteTemplateRegistry } from "./QuoteTemplateRegistry";

const mutationByRef = new Map<string, (...args: any[]) => unknown>();
const useQuery = vi.fn();
const queryByRef = new Map<string, unknown>();
const usePaginatedQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => mutationByRef.get(getFunctionName(ref)),
  usePaginatedQuery: (ref: Parameters<typeof getFunctionName>[0]) => usePaginatedQuery(ref),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({ ariaLabel, onChange, value }: { ariaLabel: string; onChange: (value: string) => void; value: string }) => <textarea aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} value={value} />,
}));

const registry = {
  templates: [
    {
      _id: "template-1",
      audience: "either",
      createdAt: 1,
      createdByWorkosUserId: "builder",
      currentVersion: {
        _id: "version-1",
        audience: "either",
        createdAt: 1,
        description: "Reusable trade response.",
        fields: [
          { allowAlternates: true, allowExclusions: true, fieldKey: "labour_line_items", isPermanent: true, kind: "priced_line", label: "Labour", order: 0, repeatable: true, required: false, scope: "labour", supportsTax: true },
          { allowAlternates: true, allowExclusions: true, fieldKey: "materials_line_items", isPermanent: true, kind: "priced_line", label: "Materials", order: 1, repeatable: true, required: false, scope: "materials", supportsTax: true },
          { fieldKey: "additional_comments", isPermanent: true, kind: "long_text", label: "Additional comments", order: 2, renderer: "tiptap", required: false, richTextDefaultHtml: "<p>Explain assumptions.</p>", scope: "whole_quote" },
          { fieldKey: "crew_size", kind: "short_text", label: "Estimated crew size", order: 3, required: false, scope: "labour", validation: { maxLength: 24 } },
          { allowAlternates: true, allowExclusions: true, fieldKey: "equipment_line", kind: "priced_line", label: "Equipment allowance", order: 4, repeatable: true, required: false, scope: "materials", supportsTax: false },
        ],
        publishedAt: 2,
        releaseNote: "Initial",
        status: "published",
        updatedAt: 2,
        validationState: "valid",
        version: 1,
        name: "Standard trade quote",
      },
      description: "Reusable trade response.",
      name: "Standard trade quote",
      selectedVersion: {
        _id: "version-1",
        audience: "either",
        createdAt: 1,
        description: "Reusable trade response.",
        fields: [],
        publishedAt: 2,
        releaseNote: "Initial",
        status: "published",
        updatedAt: 2,
        validationState: "valid",
        version: 1,
        name: "Standard trade quote",
      },
      status: "active",
      templateKey: "standard-trade-quote",
      updatedAt: 2,
      versions: [{ _id: "version-1", createdAt: 1, publishedAt: 2, releaseNote: "Initial", status: "published", updatedAt: 2, validationState: "valid", version: 1 }],
    },
  ],
};

describe("QuoteTemplateRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationByRef.clear();
    queryByRef.clear();
    useQuery.mockImplementation((ref: Parameters<typeof getFunctionName>[0]) => queryByRef.get(getFunctionName(ref)));
    usePaginatedQuery.mockReturnValue({
      loadMore: vi.fn(),
      results: registry.templates,
      status: "CanLoadMore",
    });
    queryByRef.set(getFunctionName(api.quote_response_templates.getQuoteResponseTemplate), registry.templates[0]);
    queryByRef.set(getFunctionName(api.quote_response_templates.getQuoteResponseTemplateVersion), registry.templates[0]?.selectedVersion);
    mutationByRef.set(getFunctionName(api.quote_response_templates.createQuoteResponseTemplateDraft), vi.fn().mockResolvedValue({ templateId: "template-1", versionId: "version-2" }));
    mutationByRef.set(getFunctionName(api.quote_response_templates.updateQuoteResponseTemplateDraft), vi.fn().mockResolvedValue({ issues: [], valid: true }));
    mutationByRef.set(getFunctionName(api.quote_response_templates.publishQuoteResponseTemplate), vi.fn().mockResolvedValue({ templateId: "template-1", versionId: "version-2", version: 2 }));
    mutationByRef.set(getFunctionName(api.quote_response_templates.selectQuoteResponseTemplateVersion), vi.fn().mockResolvedValue({ templateId: "template-1", versionId: "version-1" }));
  });

  afterEach(() => cleanup());

  test("exposes a responsive registry with permanent regions and immutable history", async () => {
    const select = mutationByRef.get(getFunctionName(api.quote_response_templates.selectQuoteResponseTemplateVersion)) as ReturnType<typeof vi.fn>;
    render(<QuoteTemplateRegistry workosOrganizationId="org_quote_templates" />);
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    expect(screen.getAllByText("Labour").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Materials").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Additional comments").length).toBeGreaterThan(0);
    expect(screen.getByText("v1 · published")).toBeTruthy();
    expect(screen.getByText("Selected version inspection")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create next version draft" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(screen.getByText("Inspecting v1 · Read-only")).toBeTruthy();
    expect(select).not.toHaveBeenCalled();
  });

  test("creates the next version on the same template and exposes validation/tax controls", async () => {
    const createNext = mutationByRef.get(getFunctionName(api.quote_response_templates.createQuoteResponseTemplateDraft)) as ReturnType<typeof vi.fn>;
    render(<QuoteTemplateRegistry workosOrganizationId="org_quote_templates" />);
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create next version draft" }));
    await waitFor(() => expect(createNext).toHaveBeenCalledWith(expect.objectContaining({ sourceTemplateId: "template-1", workosOrganizationId: "org_quote_templates" })));
    fireEvent.click(screen.getByRole("button", { name: "2. Questions" }));
    expect(screen.getByText("Additional questions")).toBeTruthy();
    expect(screen.getByText("Maximum length")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Maximum length for Estimated crew size"), { target: { value: "80" } });
    expect((screen.getByLabelText("Maximum length for Estimated crew size") as HTMLInputElement).value).toBe("80");
    fireEvent.click(screen.getByRole("button", { name: "Tax" }));
    expect(screen.getByText("Tax label")).toBeTruthy();
    expect(screen.getByText("Tax rate (bps)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const update = mutationByRef.get(getFunctionName(api.quote_response_templates.updateQuoteResponseTemplateDraft)) as ReturnType<typeof vi.fn>;
    await waitFor(() => expect(update).toHaveBeenCalled());
    const lastPayload = update.mock.calls[update.mock.calls.length - 1]?.[0] as { fields: Array<Record<string, unknown>> };
    expect(lastPayload.fields.every((field) => !("_id" in field) && !("isPermanent" in field))).toBe(true);
  });

  test("does not publish when saving the draft fails", async () => {
    const save = mutationByRef.get(getFunctionName(api.quote_response_templates.updateQuoteResponseTemplateDraft)) as ReturnType<typeof vi.fn>;
    const publish = mutationByRef.get(getFunctionName(api.quote_response_templates.publishQuoteResponseTemplate)) as ReturnType<typeof vi.fn>;
    save.mockRejectedValue(new Error("ConvexError: internal database stack at secret"));

    render(<QuoteTemplateRegistry workosOrganizationId="org_quote_templates" />);
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create next version draft" }));
    await waitFor(() => expect(mutationByRef.get(getFunctionName(api.quote_response_templates.createQuoteResponseTemplateDraft))).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "5. Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish immutable version" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not save draft."));
    expect(publish).not.toHaveBeenCalled();
  });
});
