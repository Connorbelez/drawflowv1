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
  FieldRichTextPreview: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => <div aria-label={ariaLabel}>{value}</div>,
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
          { allowAlternates: true, allowExclusions: true, fieldKey: "labour_line_items", isPermanent: true, kind: "priced_line", label: "Labour", order: 0, repeatable: true, required: false, scope: "labour", supportsTax: true, tax: { label: "GST", rateBps: 500 }, validation: { minValueCents: 1000, maxValueCents: 500000 } },
          { allowAlternates: true, allowExclusions: true, fieldKey: "materials_line_items", isPermanent: true, kind: "priced_line", label: "Materials", order: 1, repeatable: true, required: false, scope: "materials", supportsTax: true },
          { fieldKey: "additional_comments", isPermanent: true, kind: "long_text", label: "Additional comments", order: 2, renderer: "tiptap", required: false, richTextDefaultHtml: "<p>Explain assumptions.</p>", scope: "whole_quote" },
          { fieldKey: "crew_size", kind: "short_text", label: "Estimated crew size", order: 3, required: false, scope: "labour", validation: { minLength: 1, maxLength: 24, pattern: "^[A-Z]" } },
          { allowAlternates: true, allowExclusions: true, fieldKey: "equipment_line", kind: "priced_line", label: "Equipment allowance", order: 4, repeatable: true, required: false, scope: "materials", supportsTax: false },
          { fieldKey: "available_date", kind: "date", label: "Available date", order: 5, required: false, scope: "whole_quote" },
          { choiceOptions: ["Included", "Excluded"], fieldKey: "warranty", kind: "choice", label: "Warranty", order: 6, required: true, scope: "whole_quote" },
          { fieldKey: "insurance_certificate", kind: "attachment", label: "Insurance certificate", order: 7, required: true, scope: "whole_quote", validation: { allowedMimeTypes: ["application/pdf"], maxFiles: 2 } },
          { fieldKey: "scope_notes", kind: "long_text", label: "Scope notes", order: 8, renderer: "tiptap", required: false, richTextDefaultHtml: "<p>Describe scope.</p>", scope: "whole_quote" },
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
        fields: [] as any[],
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
      versions: [{ _id: "version-1", audience: "either", createdAt: 1, description: "Reusable trade response.", name: "Standard trade quote", publishedAt: 2, releaseNote: "Initial", status: "published", updatedAt: 2, validationState: "valid", version: 1 }],
    },
  ],
};

describe("QuoteTemplateRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationByRef.clear();
    queryByRef.clear();
    if (registry.templates[0]?.selectedVersion && registry.templates[0].currentVersion) {
      registry.templates[0].selectedVersion.fields = registry.templates[0].currentVersion.fields;
      registry.templates[0].description = "Reusable trade response.";
      registry.templates[0].currentVersion.description = "Reusable trade response.";
      registry.templates[0].selectedVersion.description = "Reusable trade response.";
    }
    useQuery.mockImplementation((ref: Parameters<typeof getFunctionName>[0]) => queryByRef.get(getFunctionName(ref)));
    usePaginatedQuery.mockImplementation((ref: Parameters<typeof getFunctionName>[0]) => {
      if (getFunctionName(ref) === getFunctionName(api.quote_response_templates.listQuoteResponseTemplateVersions)) {
        return {
          loadMore: vi.fn(),
          results: registry.templates[0]?.versions ?? [],
          status: "CanLoadMore",
        };
      }
      return {
        loadMore: vi.fn(),
        results: registry.templates,
        status: "CanLoadMore",
      };
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
    expect(registry.templates[0]?.selectedVersion?.fields).toHaveLength(9);
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
    expect(screen.getAllByText("Permanent").length).toBeGreaterThan(0);
    expect(screen.getByText("Choices: Included · Excluded")).toBeTruthy();
    expect(screen.getByText(/MIME application\/pdf/)).toBeTruthy();
    expect(screen.getAllByText("TipTap default HTML").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Maximum length").length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole("button", { name: "4. Preview" }));
    expect(screen.getByLabelText("Labour line title")).toBeTruthy();
    expect(screen.getByLabelText("Available date")).toBeTruthy();
    expect(screen.getByLabelText("Warranty (required)")).toBeTruthy();
    expect(screen.getByLabelText("Insurance certificate (required)")).toBeTruthy();
    expect(screen.getByLabelText("Scope notes TipTap preview")).toBeTruthy();
    expect(screen.getByText(/Amount bounds: 1000–500000¢/)).toBeTruthy();
    expect(screen.getAllByText(/Tax: GST \(500 bps\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Alternates: allowed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Exclusions: allowed/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Estimated crew size").getAttribute("minlength")).toBe("1");
    expect(screen.getByLabelText("Estimated crew size").getAttribute("maxlength")).toBe("80");
    expect(screen.getByLabelText("Estimated crew size").getAttribute("pattern")).toBe("^[A-Z]");
    expect(screen.getByText(/Text constraints: min length 1 · max length 80 · pattern \^\[A-Z\]/)).toBeTruthy();
    const crewDescriptionId = screen.getByLabelText("Estimated crew size").getAttribute("aria-describedby");
    expect(crewDescriptionId).toBeTruthy();
    expect(document.getElementById(crewDescriptionId ?? "")).toBeTruthy();
    expect(screen.getByLabelText("Warranty (required)").getAttribute("required")).toBe("");
    expect(screen.getByLabelText("Insurance certificate (required)").getAttribute("required")).toBe("");
    expect(screen.getByLabelText("Labour amount in cents").getAttribute("min")).toBe("1000");
    expect(screen.getByLabelText("Labour amount in cents").getAttribute("max")).toBe("500000");
    expect(screen.getByLabelText("Labour amount in cents").getAttribute("aria-describedby")).toBe("preview-labour-line-contract");
  });

  test("keeps an intentionally cleared version description empty when reopening a draft", async () => {
    const template = registry.templates[0];
    if (!(template?.currentVersion && template.selectedVersion)) {
      throw new Error("Missing quote template fixture.");
    }
    template.currentVersion.description = undefined as never;
    template.selectedVersion.description = undefined as never;
    render(<QuoteTemplateRegistry workosOrganizationId="org_quote_templates" />);
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create next version draft" }));
    await waitFor(() =>
      expect(
        mutationByRef.get(
          getFunctionName(api.quote_response_templates.createQuoteResponseTemplateDraft)
        )
      ).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }))
    );
    expect((screen.getByRole("textbox", { name: "Internal description" }) as HTMLInputElement).value).toBe("");
  });

  test("resets template identity and release-note state between authoring workflows", async () => {
    render(<QuoteTemplateRegistry workosOrganizationId="org_quote_templates" />);
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create next version draft" }));
    await waitFor(() =>
      expect(
        mutationByRef.get(
          getFunctionName(api.quote_response_templates.createQuoteResponseTemplateDraft)
        )
      ).toHaveBeenCalled()
    );
    fireEvent.click(screen.getByRole("button", { name: "5. Publish" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Release note" }), {
      target: { value: "Stale release note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to template registry" }));
    fireEvent.click(screen.getByRole("button", { name: "New template" }));
    expect((screen.getByRole("textbox", { name: "Template name" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Internal description" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("combobox", { name: "Intended recipient" }) as HTMLSelectElement).value).toBe("either");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /Standard trade quote/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create next version draft" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "5. Publish" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "5. Publish" }));
    expect((screen.getByRole("textbox", { name: "Release note" }) as HTMLInputElement).value).toBe("");
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
