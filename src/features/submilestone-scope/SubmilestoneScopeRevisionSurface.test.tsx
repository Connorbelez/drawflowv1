// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  SubmilestoneScopeRevisionSurface,
  type ScopeRevisionContent,
  type ScopeRevisionSummary,
} from "./SubmilestoneScopeRevisionSurface.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    editable,
    onChange,
    testId,
    value,
  }: {
    editable?: boolean;
    onChange: (value: string) => void;
    testId?: string;
    value: string;
  }) => (
    <textarea
      aria-label="Scope editor"
      data-testid={testId}
      disabled={!editable}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
  FieldRichTextPreview: ({
    ariaLabel,
    value,
  }: {
    ariaLabel: string;
    value: string;
  }) => <div aria-label={ariaLabel}>{value}</div>,
}));

const v1: ScopeRevisionSummary = {
  authoredByWorkosUserId: "alice",
  createdAt: Date.parse("2026-08-01T12:00:00Z"),
  id: "scope-v1",
  publishedAt: Date.parse("2026-08-02T12:00:00Z"),
  status: "published",
  version: 1,
};

const v2: ScopeRevisionSummary = {
  authoredByWorkosUserId: "bob",
  changeReason: "Updated quantities",
  createdAt: Date.parse("2026-08-03T12:00:00Z"),
  id: "scope-v2",
  status: "published",
  version: 2,
};

const draftV2: ScopeRevisionSummary = {
  authoredByWorkosUserId: "bob",
  createdAt: Date.parse("2026-08-03T12:00:00Z"),
  id: "scope-v2-draft",
  savedAt: Date.parse("2026-08-03T12:30:00Z"),
  status: "draft",
  version: 2,
};

const draftV3: ScopeRevisionSummary = {
  authoredByWorkosUserId: "carol",
  createdAt: Date.parse("2026-08-04T12:00:00Z"),
  id: "scope-v3-draft",
  savedAt: Date.parse("2026-08-04T12:30:00Z"),
  status: "draft",
  version: 3,
};

const content = (revisionId: string, value: string): ScopeRevisionContent => ({
  revisionId,
  scopeOfWorkTiptapJson: value,
});

function renderSurface(
  overrides: Partial<ComponentProps<typeof SubmilestoneScopeRevisionSurface>> = {},
) {
  return render(
    <SubmilestoneScopeRevisionSurface
      capabilities={{
        canEditDraft: false,
        canLoadUnpublishedDraft: false,
        canPublishDraft: false,
        canStartDraft: false,
      }}
      effectiveRevisionId={v1.id}
      revisions={[v1, v2]}
      scopeRoute="backoffice-proposal"
      selectedRevisionContent={content(v1.id, "<p>Approved scope</p>")}
      selectedRevisionId={v1.id}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SubmilestoneScopeRevisionSurface", () => {
  test("shows revision metadata, effective state, reason, and history bounds", () => {
    renderSurface();

    expect(screen.getByText("v1 · published")).toBeTruthy();
    expect(screen.getByText("Effective")).toBeTruthy();
    expect(screen.getByText(/Authored by alice/)).toBeTruthy();
    expect(screen.getByText(/Aug 2, 2026, 8:00 a\.m\./)).toBeTruthy();
    expect(
      screen.queryByText("No Scope content recorded for this revision."),
    ).toBeNull();
    expect(
      (screen.getByTestId("submilestone-scope-revision-previous") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("submilestone-scope-revision-next") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  test("loads adjacent revisions through the public selection callback", () => {
    const onSelectRevision = vi.fn();
    renderSurface({ onSelectRevision });

    fireEvent.click(screen.getByTestId("submilestone-scope-revision-next"));

    expect(onSelectRevision).toHaveBeenCalledWith(v2.id);
  });

  test("renders historical content read-only", () => {
    renderSurface({
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: false,
        canPublishDraft: true,
        canStartDraft: true,
      },
      selectedRevisionContent: content(v2.id, "<p>Historical scope</p>"),
      selectedRevisionId: v2.id,
    });

    expect(screen.queryByTestId("submilestone-scope-revision-editor")).toBeNull();
    expect(screen.getByLabelText("Scope revision v2").textContent).toContain(
      "Historical scope",
    );
    expect(screen.getByText("Change reason:")).toBeTruthy();
    expect(screen.getByTestId("submilestone-scope-start-draft")).toBeTruthy();
  });

  test("shows an authorized unpublished draft chip and loads its content", async () => {
    const onLoadDraft = vi.fn(async () => ({
      content: "<p>Draft scope</p>",
      revision: draftV3,
    }));
    renderSurface({
      activeDraftRevision: draftV3,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: true,
      },
      onLoadDraft,
    });

    fireEvent.click(screen.getByTestId("submilestone-scope-unpublished-draft-chip"));

    await waitFor(() => expect(onLoadDraft).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByTestId(
          "submilestone-scope-revision-editor",
        ) as HTMLTextAreaElement).value,
      ).toBe("<p>Draft scope</p>"),
    );
  });

  test("does not expose draft existence when capability or data is absent", () => {
    renderSurface({
      activeDraftRevision: draftV3,
      capabilities: {
        canEditDraft: false,
        canLoadUnpublishedDraft: false,
        canPublishDraft: false,
        canStartDraft: false,
      },
    });

    expect(
      screen.queryByTestId("submilestone-scope-unpublished-draft-chip"),
    ).toBeNull();
    expect(screen.queryByText("v3 · draft")).toBeNull();
  });

  test("starts a successor draft from the selected published revision", async () => {
    const onCreateDraftFromRevision = vi.fn(async () => ({
      content: "<p>Successor scope</p>",
      revision: draftV2,
    }));
    renderSurface({
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: false,
        canPublishDraft: true,
        canStartDraft: true,
      },
      onCreateDraftFromRevision,
    });

    fireEvent.click(screen.getByTestId("submilestone-scope-start-draft"));

    await waitFor(() =>
      expect(onCreateDraftFromRevision).toHaveBeenCalledWith(v1.id),
    );
    await waitFor(() =>
      expect(
        (screen.getByTestId(
          "submilestone-scope-revision-editor",
        ) as HTMLTextAreaElement).value,
      ).toBe("<p>Successor scope</p>"),
    );
  });

  test("saves the complete local content and keeps editing disabled while saving", async () => {
    let resolveSave!: () => void;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderSurface({
      activeDraftRevision: draftV2,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: false,
      },
      onSaveDraft,
      selectedRevisionContent: content(draftV2.id, "<p>Original</p>"),
      selectedRevisionId: draftV2.id,
    });

    const editor = await screen.findByTestId("submilestone-scope-revision-editor");
    fireEvent.change(editor, { target: { value: "<p>Local draft</p>" } });
    fireEvent.click(screen.getByTestId("submilestone-scope-save-draft"));

    await waitFor(() =>
      expect(onSaveDraft).toHaveBeenCalledWith({
        revisionId: draftV2.id,
        scopeOfWorkTiptapJson: "<p>Local draft</p>",
      }),
    );
    expect((editor as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByTestId("submilestone-scope-save-draft") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveSave();
    await waitFor(() => expect((editor as HTMLTextAreaElement).disabled).toBe(false));
  });

  test("keeps local content and dirty state after a failed save", async () => {
    const onSaveDraft = vi.fn(async () => {
      throw new Error("Save failed");
    });
    renderSurface({
      activeDraftRevision: draftV2,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: false,
      },
      onSaveDraft,
      selectedRevisionContent: content(draftV2.id, "<p>Original</p>"),
      selectedRevisionId: draftV2.id,
    });

    const editor = await screen.findByTestId("submilestone-scope-revision-editor");
    fireEvent.change(editor, { target: { value: "<p>Keep me</p>" } });
    fireEvent.click(screen.getByTestId("submilestone-scope-save-draft"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Save failed"),
    );
    expect((editor as HTMLTextAreaElement).value).toBe("<p>Keep me</p>");
    expect(
      (screen.getByTestId("submilestone-scope-save-draft") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  test("requires a reason and a clean editor before publishing v2+", async () => {
    const onPublishDraft = vi.fn(async () => undefined);
    renderSurface({
      activeDraftRevision: draftV2,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: false,
      },
      onPublishDraft,
      selectedRevisionContent: content(draftV2.id, "<p>Draft</p>"),
      selectedRevisionId: draftV2.id,
    });

    const publish = await screen.findByTestId("submilestone-scope-publish");
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("submilestone-scope-publish-reason"), {
      target: { value: "Clarified included quantities" },
    });
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publish);

    await waitFor(() =>
      expect(onPublishDraft).toHaveBeenCalledWith({
        changeReason: "Clarified included quantities",
        revisionId: draftV2.id,
      }),
    );
  });

  test("confirms before navigating away from dirty local content", async () => {
    const onSelectRevision = vi.fn();
    renderSurface({
      activeDraftRevision: draftV2,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: false,
      },
      onSelectRevision,
      revisions: [v1],
      selectedRevisionContent: content(draftV2.id, "<p>Draft</p>"),
      selectedRevisionId: draftV2.id,
    });

    const editor = await screen.findByTestId("submilestone-scope-revision-editor");
    fireEvent.change(editor, { target: { value: "<p>Unsaved</p>" } });
    fireEvent.click(screen.getByTestId("submilestone-scope-revision-previous"));

    expect(screen.getByTestId("submilestone-scope-unsaved-dialog")).toBeTruthy();
    expect(onSelectRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("submilestone-scope-unsaved-discard"));

    await waitFor(() => expect(onSelectRevision).toHaveBeenCalledWith(v1.id));
  });

  test("does not report a transient clean state when the dirty callback changes", async () => {
    const firstDirtyCallback = vi.fn();
    const { rerender } = renderSurface({
      activeDraftRevision: draftV2,
      capabilities: {
        canEditDraft: true,
        canLoadUnpublishedDraft: true,
        canPublishDraft: true,
        canStartDraft: false,
      },
      onDirtyChange: firstDirtyCallback,
      selectedRevisionContent: content(draftV2.id, "<p>Draft</p>"),
      selectedRevisionId: draftV2.id,
    });

    const editor = await screen.findByTestId("submilestone-scope-revision-editor");
    fireEvent.change(editor, { target: { value: "<p>Unsaved</p>" } });
    await waitFor(() => expect(firstDirtyCallback).toHaveBeenLastCalledWith(true));

    const secondDirtyCallback = vi.fn();
    rerender(
      <SubmilestoneScopeRevisionSurface
        activeDraftRevision={draftV2}
        capabilities={{
          canEditDraft: true,
          canLoadUnpublishedDraft: true,
          canPublishDraft: true,
          canStartDraft: false,
        }}
        effectiveRevisionId={v1.id}
        onDirtyChange={secondDirtyCallback}
        revisions={[v1, v2]}
        scopeRoute="backoffice-proposal"
        selectedRevisionContent={content(draftV2.id, "<p>Draft</p>")}
        selectedRevisionId={draftV2.id}
      />,
    );

    await waitFor(() => expect(secondDirtyCallback).toHaveBeenLastCalledWith(true));
    expect(firstDirtyCallback.mock.calls).toEqual([[false], [true]]);
    expect(secondDirtyCallback.mock.calls).toEqual([[true]]);
  });

  test("reports clean only when the surface unmounts", async () => {
    const onDirtyChange = vi.fn();
    const { unmount } = renderSurface({ onDirtyChange });

    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
    expect(onDirtyChange).toHaveBeenCalledTimes(1);

    unmount();

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onDirtyChange).toHaveBeenCalledTimes(2);
  });
});
