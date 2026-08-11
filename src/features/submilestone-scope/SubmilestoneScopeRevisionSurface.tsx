"use client";

import { ArrowLeft, ArrowRight, FilePlus2, Save, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { tiptapJsonEqual } from "#/components/rich-text/tiptap-json.ts";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export type ScopeRevisionStatus = "draft" | "published";

/** Metadata returned for the history list. Rich text is hydrated separately. */
export interface ScopeRevisionSummary {
  authoredByWorkosUserId?: string | null;
  basedOnRevisionId?: string | null;
  changeReason?: string | null;
  createdAt: number;
  id: string;
  publishedAt?: number | null;
  savedAt?: number | null;
  status: ScopeRevisionStatus;
  version: number;
}

/** Content for the one revision currently selected by the route/controller. */
export interface ScopeRevisionContent {
  revisionId: string;
  scopeOfWorkTiptapJson: string;
}

/** Explicit route capability input. The component never derives these values from roles. */
export interface ScopeRevisionSurfaceCapabilities {
  canEditDraft: boolean;
  canLoadUnpublishedDraft: boolean;
  canPublishDraft: boolean;
  canStartDraft: boolean;
}

export type ScopeRevisionSurfaceRoute =
  | "active-build"
  | "backoffice-proposal"
  | "builder-proposal";

export interface ScopeDraftSaveInput {
  revisionId: string;
  scopeOfWorkTiptapJson: string;
}

export interface ScopePublishInput {
  changeReason?: string;
  revisionId: string;
}

export type ScopeRevisionLoadResult =
  | ScopeRevisionContent
  | {
      content?: string;
      revision: ScopeRevisionSummary;
    }
  | ScopeRevisionSummary
  | undefined;

export interface SubmilestoneScopeRevisionSurfaceProps {
  activeDraftRevision?: ScopeRevisionSummary | null;
  capabilities: ScopeRevisionSurfaceCapabilities;
  effectiveRevisionId?: string | null;
  onCreateDraftFromRevision?: (
    sourceRevisionId: string
  ) => Promise<ScopeRevisionLoadResult | undefined>;
  onDirtyChange?: (dirty: boolean) => void;
  onLoadDraft?: () => Promise<ScopeRevisionLoadResult | undefined>;
  onPublishDraft?: (input: ScopePublishInput) => Promise<void>;
  onSaveDraft?: (input: ScopeDraftSaveInput) => Promise<void>;
  onSelectRevision?: (revisionId: string) => void;
  revisions: readonly ScopeRevisionSummary[];
  scopeRoute: ScopeRevisionSurfaceRoute;
  selectedRevisionContent?: ScopeRevisionContent | null;
  selectedRevisionId?: string | null;
  selectedRevisionLoading?: boolean;
}

interface PendingNavigation {
  action: () => void;
  label: string;
}

const APP_TIME_ZONE = "America/Toronto";
const SCOPE_REVISION_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: APP_TIME_ZONE,
});

function formatTimestamp(timestamp: number | null | undefined) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "Time not recorded";
  }
  return SCOPE_REVISION_TIMESTAMP_FORMATTER.format(timestamp);
}

function authorLabel(author: string | null | undefined) {
  return author?.trim() || "Unknown author";
}

function resultRevision(result: ScopeRevisionLoadResult | undefined) {
  if (!result || typeof result !== "object") {
    return;
  }
  if ("revision" in result) {
    return result.revision;
  }
  if ("id" in result && "version" in result && "status" in result) {
    return result as ScopeRevisionSummary;
  }
  return;
}

function resultContent(result: ScopeRevisionLoadResult | undefined) {
  if (!result || typeof result !== "object") {
    return;
  }
  if ("scopeOfWorkTiptapJson" in result) {
    return {
      revisionId: result.revisionId,
      scopeOfWorkTiptapJson: result.scopeOfWorkTiptapJson,
    };
  }
  if ("revision" in result && typeof result.content === "string") {
    return {
      revisionId: result.revision.id,
      scopeOfWorkTiptapJson: result.content,
    };
  }
  return;
}

function statusVariant(status: ScopeRevisionStatus) {
  return status === "draft" ? "warning" : "success";
}

/**
 * Shared, route-aware Scope history surface.
 *
 * History metadata and selected rich text are deliberately separate inputs so
 * routes can hydrate only the revision the user opened. Authorization is also
 * explicit: this component consumes capabilities and never infers roles.
 */
// The state machine is intentionally kept at this public seam: all navigation,
// draft hydration, and save/publish gates must share one dirty baseline.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: revision controls are one cohesive public state machine
export function SubmilestoneScopeRevisionSurface({
  activeDraftRevision = null,
  capabilities,
  effectiveRevisionId = null,
  onCreateDraftFromRevision,
  onDirtyChange,
  onLoadDraft,
  onPublishDraft,
  onSaveDraft,
  onSelectRevision,
  revisions,
  scopeRoute,
  selectedRevisionContent = null,
  selectedRevisionId,
  selectedRevisionLoading = false,
}: SubmilestoneScopeRevisionSurfaceProps) {
  const [internalSelectedRevisionId, setInternalSelectedRevisionId] = useState<
    string | null
  >(null);
  const [loadedDraft, setLoadedDraft] = useState<{
    content?: string;
    revision: ScopeRevisionSummary;
  } | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [savedEditorValue, setSavedEditorValue] = useState("");
  const [publishReason, setPublishReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const selectionInitialized = useRef(false);
  const selectionKeyRef = useRef<string | null>(null);
  const hydratedContentRef = useRef<string | undefined>(undefined);
  const onDirtyChangeRef = useRef(onDirtyChange);

  const allRevisions = useMemo(() => {
    const byId = new Map<string, ScopeRevisionSummary>();
    for (const revision of revisions) {
      byId.set(revision.id, revision);
    }
    if (
      capabilities.canLoadUnpublishedDraft &&
      activeDraftRevision &&
      !byId.has(activeDraftRevision.id)
    ) {
      byId.set(activeDraftRevision.id, activeDraftRevision);
    }
    if (loadedDraft && !byId.has(loadedDraft.revision.id)) {
      byId.set(loadedDraft.revision.id, loadedDraft.revision);
    }
    return [...byId.values()].sort(
      (left, right) => left.version - right.version
    );
  }, [
    activeDraftRevision,
    capabilities.canLoadUnpublishedDraft,
    loadedDraft,
    revisions,
  ]);

  const resolvedSelectedRevisionId =
    internalSelectedRevisionId ??
    selectedRevisionId ??
    (effectiveRevisionId &&
    allRevisions.some((revision) => revision.id === effectiveRevisionId)
      ? effectiveRevisionId
      : allRevisions[0]?.id) ??
    null;
  const selectedRevision = allRevisions.find(
    (revision) => revision.id === resolvedSelectedRevisionId
  );
  const selectedLoadedContent =
    loadedDraft?.revision.id === resolvedSelectedRevisionId
      ? loadedDraft.content
      : undefined;
  const serverContent =
    selectedRevisionContent?.revisionId === resolvedSelectedRevisionId
      ? selectedRevisionContent.scopeOfWorkTiptapJson
      : selectedLoadedContent;
  const dirty = Boolean(
    selectedRevision &&
      selectedRevision.status === "draft" &&
      !tiptapJsonEqual(editorValue, savedEditorValue)
  );
  const selectedIndex = selectedRevision
    ? allRevisions.findIndex((revision) => revision.id === selectedRevision.id)
    : -1;
  const canEditSelectedDraft = Boolean(
    selectedRevision?.status === "draft" &&
      capabilities.canEditDraft &&
      (!activeDraftRevision || selectedRevision.id === activeDraftRevision.id)
  );
  const canPublishSelectedDraft = Boolean(
    canEditSelectedDraft && capabilities.canPublishDraft && onPublishDraft
  );
  const reasonRequired = Boolean(
    selectedRevision && selectedRevision.version > 1
  );
  const publishDisabled = Boolean(
    !canPublishSelectedDraft ||
      dirty ||
      saving ||
      publishing ||
      selectedRevisionLoading ||
      (reasonRequired && !publishReason.trim())
  );

  useEffect(() => {
    if (
      internalSelectedRevisionId &&
      selectedRevisionId === internalSelectedRevisionId
    ) {
      setInternalSelectedRevisionId(null);
    }
  }, [internalSelectedRevisionId, selectedRevisionId]);

  useEffect(() => {
    const nextSelectionKey = resolvedSelectedRevisionId;
    if (
      selectionKeyRef.current === nextSelectionKey &&
      selectionInitialized.current
    ) {
      if (
        !dirty &&
        serverContent !== undefined &&
        serverContent !== hydratedContentRef.current
      ) {
        hydratedContentRef.current = serverContent;
        setEditorValue(serverContent);
        setSavedEditorValue(serverContent);
      }
      return;
    }
    selectionKeyRef.current = nextSelectionKey;
    selectionInitialized.current = true;
    hydratedContentRef.current = serverContent;
    setError(null);
    setEditorValue(serverContent ?? "");
    setSavedEditorValue(serverContent ?? "");
    setPublishReason(selectedRevision?.changeReason ?? "");
  }, [dirty, resolvedSelectedRevisionId, selectedRevision, serverContent]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  const commitSelection = (revisionId: string) => {
    setInternalSelectedRevisionId(revisionId);
    onSelectRevision?.(revisionId);
  };

  const requestNavigation = (label: string, action: () => void) => {
    if (dirty) {
      setPendingNavigation({ action, label });
      return;
    }
    action();
  };

  const selectRevision = (revisionId: string) => {
    if (revisionId === resolvedSelectedRevisionId) {
      return;
    }
    requestNavigation(
      `Load v${allRevisions.find((revision) => revision.id === revisionId)?.version ?? "revision"}`,
      () => commitSelection(revisionId)
    );
  };

  const loadDraft = () => {
    if (!(activeDraftRevision && capabilities.canLoadUnpublishedDraft)) {
      return;
    }
    const load = async () => {
      setLoadingDraft(true);
      setError(null);
      try {
        const result = await onLoadDraft?.();
        const revision = resultRevision(result) ?? activeDraftRevision;
        const content = resultContent(result)?.scopeOfWorkTiptapJson;
        if (content !== undefined) {
          setLoadedDraft({ content, revision });
        }
        commitSelection(revision.id);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the unpublished Scope draft."
        );
      } finally {
        setLoadingDraft(false);
      }
    };
    requestNavigation("Load unpublished draft", load);
  };

  const startDraft = () => {
    if (
      !selectedRevision ||
      selectedRevision.status !== "published" ||
      !capabilities.canStartDraft ||
      !onCreateDraftFromRevision
    ) {
      return;
    }
    const start = async () => {
      setStartingDraft(true);
      setError(null);
      try {
        const result = await onCreateDraftFromRevision(selectedRevision.id);
        const revision = resultRevision(result);
        const content = resultContent(result)?.scopeOfWorkTiptapJson;
        if (revision) {
          if (content !== undefined) {
            setLoadedDraft({ content, revision });
          }
          commitSelection(revision.id);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to start a new Scope draft."
        );
      } finally {
        setStartingDraft(false);
      }
    };
    requestNavigation("Start a new Scope draft", start);
  };

  const saveDraft = async () => {
    if (
      !(selectedRevision && onSaveDraft && canEditSelectedDraft && dirty) ||
      saving
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveDraft({
        revisionId: selectedRevision.id,
        scopeOfWorkTiptapJson: editorValue,
      });
      setSavedEditorValue(editorValue);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save the Scope draft."
      );
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!(selectedRevision && onPublishDraft) || publishDisabled) {
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await onPublishDraft({
        changeReason: publishReason.trim() || undefined,
        revisionId: selectedRevision.id,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish the Scope draft."
      );
    } finally {
      setPublishing(false);
    }
  };

  if (!selectedRevision) {
    return (
      <Frame data-testid="submilestone-scope-revision-surface">
        <FramePanel>
          <p className="text-muted-foreground text-sm">
            No Scope revision is available for this Sub-milestone.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  const previousRevision = allRevisions[selectedIndex - 1];
  const nextRevision = allRevisions[selectedIndex + 1];
  const selectedContent = serverContent ?? editorValue;
  const showEditor = canEditSelectedDraft;
  const showDraftChip = Boolean(
    capabilities.canLoadUnpublishedDraft &&
      activeDraftRevision &&
      activeDraftRevision.id !== selectedRevision.id
  );

  return (
    <>
      <Frame
        data-scope-route={scopeRoute}
        data-testid="submilestone-scope-revision-surface"
      >
        <FramePanel className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-base">Scope</h2>
                <Badge variant={statusVariant(selectedRevision.status)}>
                  v{selectedRevision.version} · {selectedRevision.status}
                </Badge>
                {selectedRevision.id === effectiveRevisionId ? (
                  <Badge variant="success">Effective</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                Authored by{" "}
                {authorLabel(selectedRevision.authoredByWorkosUserId)} ·{" "}
                {formatTimestamp(
                  selectedRevision.publishedAt ??
                    selectedRevision.savedAt ??
                    selectedRevision.createdAt
                )}
              </p>
            </div>
            <nav
              aria-label="Scope revision history"
              className="flex items-center gap-1"
            >
              <Button
                aria-label="Previous Scope revision"
                data-testid="submilestone-scope-revision-previous"
                disabled={
                  !previousRevision ||
                  saving ||
                  publishing ||
                  loadingDraft ||
                  startingDraft
                }
                onClick={() =>
                  previousRevision && selectRevision(previousRevision.id)
                }
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              <Button
                aria-label="Next Scope revision"
                data-testid="submilestone-scope-revision-next"
                disabled={
                  !nextRevision ||
                  saving ||
                  publishing ||
                  loadingDraft ||
                  startingDraft
                }
                onClick={() => nextRevision && selectRevision(nextRevision.id)}
                size="icon-sm"
                variant="ghost"
              >
                <ArrowRight aria-hidden="true" />
              </Button>
            </nav>
          </div>

          {showDraftChip ? (
            <Badge
              data-testid="submilestone-scope-unpublished-draft-chip"
              render={<button onClick={loadDraft} type="button" />}
              variant="warning"
            >
              Unpublished draft · v{activeDraftRevision?.version}
            </Badge>
          ) : null}

          <Separator />

          {selectedRevision.changeReason ? (
            <p className="text-muted-foreground text-sm">
              <span className="font-medium text-foreground">
                Change reason:
              </span>{" "}
              {selectedRevision.changeReason}
            </p>
          ) : null}

          {selectedRevisionLoading || loadingDraft ? (
            <p className="text-muted-foreground text-sm">
              Loading Scope content…
            </p>
          ) : showEditor ? (
            <FieldRichTextEditor
              ariaLabel={`Scope revision v${selectedRevision.version}`}
              editable={!(saving || publishing)}
              onChange={setEditorValue}
              placeholder="Describe the work included in this Sub-milestone."
              testId="submilestone-scope-revision-editor"
              value={editorValue}
            />
          ) : selectedContent.trim() ? (
            <FieldRichTextPreview
              ariaLabel={`Scope revision v${selectedRevision.version}`}
              value={selectedContent}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No Scope content recorded for this revision.
            </p>
          )}

          {canEditSelectedDraft ? (
            <div className="flex flex-wrap items-end justify-end gap-3">
              <Button
                data-testid="submilestone-scope-save-draft"
                disabled={!dirty || publishing || !onSaveDraft}
                loading={saving}
                onClick={saveDraft}
              >
                <Save aria-hidden="true" />
                Save draft
              </Button>
            </div>
          ) : capabilities.canStartDraft &&
            selectedRevision.status === "published" ? (
            <Button
              data-testid="submilestone-scope-start-draft"
              disabled={startingDraft || !onCreateDraftFromRevision}
              loading={startingDraft}
              onClick={startDraft}
              variant="outline"
            >
              <FilePlus2 aria-hidden="true" />
              Start new draft from this version
            </Button>
          ) : null}

          {canPublishSelectedDraft ? (
            <div className="space-y-3 border-t pt-4">
              {reasonRequired ? (
                <label
                  className="block space-y-1.5"
                  htmlFor="submilestone-scope-publish-reason"
                >
                  <span className="font-medium text-sm">Change reason</span>
                  <Textarea
                    data-testid="submilestone-scope-publish-reason"
                    disabled={saving || publishing}
                    id="submilestone-scope-publish-reason"
                    onChange={(event) => setPublishReason(event.target.value)}
                    placeholder="Explain what changed in this Scope revision."
                    value={publishReason}
                  />
                </label>
              ) : null}
              <Button
                data-testid="submilestone-scope-publish"
                disabled={publishDisabled}
                loading={publishing}
                onClick={publishDraft}
                variant="default"
              >
                <Send aria-hidden="true" />
                Publish v{selectedRevision.version}
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </FramePanel>
      </Frame>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingNavigation(null);
          }
        }}
        open={pendingNavigation !== null}
      >
        <AlertDialogContent
          className="sm:max-w-md"
          data-testid="submilestone-scope-unsaved-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved Scope changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Scope edits have not been saved. {pendingNavigation?.label}{" "}
              and discard those local changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline">Keep editing</Button>}
            />
            <Button
              data-testid="submilestone-scope-unsaved-discard"
              onClick={() => {
                const action = pendingNavigation?.action;
                if (!action) {
                  return;
                }
                setPendingNavigation(null);
                setEditorValue(savedEditorValue);
                action();
              }}
              variant="destructive"
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
