"use client";

import type { JSONContent } from "@tiptap/react";
import { useQuery } from "convex/react";
import { History, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useBuildCollaborationMutation } from "./BuildCollaborationMutationGate.tsx";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  formatTimestamp,
  plainTextFromDocument,
  toBackendReferenceKind,
} from "./model.ts";

type EditingEntity =
  | {
      commentId: Id<"buildCollaborationComments">;
      kind: "comment";
    }
  | {
      kind: "post";
      postId: Id<"buildCollaborationPosts">;
    };

interface RevisionHistoryEntry {
  _id: string;
  createdAt: number;
  editReason?: string;
  revision: number;
  tiptapJson: string;
}

function editingSheetTitle({
  canEdit,
  entity,
}: {
  canEdit: boolean;
  entity: EditingEntity | null;
}) {
  if (!canEdit) {
    return "Revision history";
  }
  return entity?.kind === "post" ? "Edit Build post" : "Edit reply";
}

function RevisionHistory({
  history,
  tagOptions,
}: {
  history: RevisionHistoryEntry[] | undefined;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Revision history</h3>
      </div>
      {history === undefined ? (
        <p className="text-muted-foreground text-sm">Loading history…</p>
      ) : (
        <div className="space-y-2">
          {history.map((revision) => (
            <details
              className="rounded-lg border bg-muted/10 px-3 py-2"
              key={revision._id}
            >
              <summary className="cursor-pointer text-sm">
                Revision {revision.revision} ·{" "}
                {formatTimestamp(revision.createdAt)}
              </summary>
              {revision.editReason ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  {revision.editReason}
                </p>
              ) : null}
              <CollaborationRichTextPreview
                ariaLabel={`Revision ${revision.revision}`}
                className="mt-2"
                tagOptions={tagOptions}
                value={revision.tiptapJson}
              />
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function RemovalControl({
  confirming,
  disabled,
  onCancel,
  onConfirm,
  onRequest,
}: {
  confirming: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRequest: () => void;
}) {
  return (
    <section className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm">
            Replace the visible content with an auditable tombstone? Revision
            history remains durable.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={disabled}
              onClick={onConfirm}
              type="button"
              variant="destructive"
            >
              Confirm removal
            </Button>
            <Button onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={onRequest} type="button" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4" />
          Remove visible content
        </Button>
      )}
    </section>
  );
}

export function BuildCollaborationEditSheet({
  buildId,
  canEdit,
  entity,
  initialDocument,
  initialReferences,
  initialRevision,
  onOpenChange,
  open,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  canEdit: boolean;
  entity: EditingEntity | null;
  initialDocument: JSONContent;
  initialReferences: CollaborationTagReference[];
  initialRevision: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  const editPost = useBuildCollaborationMutation(
    api.build_collaboration_editing.editBuildCollaborationPost
  );
  const editComment = useBuildCollaborationMutation(
    api.build_collaboration_editing.editBuildCollaborationComment
  );
  const tombstonePost = useBuildCollaborationMutation(
    api.build_collaboration_editing.tombstoneBuildCollaborationPost
  );
  const tombstoneComment = useBuildCollaborationMutation(
    api.build_collaboration_editing.tombstoneBuildCollaborationComment
  );
  const postHistory = useQuery(
    api.build_collaboration_editing.listBuildCollaborationPostRevisionHistory,
    entity?.kind === "post" && open
      ? {
          buildId,
          organizationId,
          postId: entity.postId,
        }
      : "skip"
  );
  const commentHistory = useQuery(
    api.build_collaboration_editing
      .listBuildCollaborationCommentRevisionHistory,
    entity?.kind === "comment" && open
      ? {
          buildId,
          commentId: entity.commentId,
          organizationId,
        }
      : "skip"
  );
  const [editorValue, setEditorValue] = useState<string | JSONContent>(
    initialDocument
  );
  const [document, setDocument] = useState<JSONContent>(initialDocument);
  const [references, setReferences] =
    useState<CollaborationTagReference[]>(initialReferences);
  const [editReason, setEditReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState(initialRevision);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setEditorValue(initialDocument);
    setDocument(initialDocument);
    setReferences(initialReferences);
    setEditReason("");
    setError(null);
    setBaseRevision(initialRevision);
    setRevisionConflict(false);
    setConfirmingRemoval(false);
  }, [initialDocument, initialReferences, initialRevision, open]);

  const optionByKey = useMemo(
    () =>
      new Map(
        tagOptions.map((option) => [`${option.kind}:${option.id}`, option])
      ),
    [tagOptions]
  );
  const history = postHistory ?? commentHistory;
  const latestHistoryRevision = history?.[0]?.revision ?? baseRevision;
  const canRebase =
    revisionConflict && latestHistoryRevision > baseRevision && !saving;

  const save = async () => {
    if (!(entity && canEdit) || saving) {
      return;
    }
    if (!plainTextFromDocument(document)) {
      setError("Collaboration content is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const referenceInputs = references.map((reference, index) => ({
      entityId: reference.id,
      entityKind:
        optionByKey.get(`${reference.kind}:${reference.id}`)?.entityKind ??
        toBackendReferenceKind(reference.kind),
      primary: index === 0,
    }));
    try {
      if (entity.kind === "post") {
        await editPost({
          buildId,
          editReason: editReason.trim() || undefined,
          expectedRevision: baseRevision,
          organizationId,
          postId: entity.postId,
          references: referenceInputs,
          tiptapJson: JSON.stringify(document),
        });
      } else {
        await editComment({
          buildId,
          commentId: entity.commentId,
          editReason: editReason.trim() || undefined,
          expectedRevision: baseRevision,
          organizationId,
          references: referenceInputs,
          tiptapJson: JSON.stringify(document),
        });
      }
      toast.success(
        entity.kind === "post" ? "Post updated." : "Reply updated."
      );
      onOpenChange(false);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to save this edit.";
      setError(message);
      setRevisionConflict(message.includes("Revision conflict"));
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(entity && canEdit) || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (entity.kind === "post") {
        await tombstonePost({
          buildId,
          expectedRevision: baseRevision,
          organizationId,
          postId: entity.postId,
        });
      } else {
        await tombstoneComment({
          buildId,
          commentId: entity.commentId,
          expectedRevision: baseRevision,
          organizationId,
        });
      }
      toast.success(
        entity.kind === "post" ? "Post removed." : "Reply removed."
      );
      onOpenChange(false);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unable to remove this content.";
      setError(message);
      setRevisionConflict(message.includes("Revision conflict"));
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup data-testid="build-collaboration-edit-sheet">
        <SheetHeader>
          <SheetTitle>{editingSheetTitle({ canEdit, entity })}</SheetTitle>
          <SheetDescription>
            Edits preserve the original record and create an auditable revision.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-5">
          {canEdit ? (
            <>
              <CollaborationRichTextEditor
                ariaLabel={
                  entity?.kind === "post"
                    ? "Edit Build post"
                    : "Edit collaboration reply"
                }
                onChange={(value, nextReferences) => {
                  setEditorValue(value);
                  setReferences(nextReferences);
                }}
                onDocumentChange={(nextDocument) => setDocument(nextDocument)}
                placeholder="Update this content. Type @ to link Build work."
                tagOptions={tagOptions}
                value={editorValue}
              />
              <Input
                aria-label="Edit reason"
                onChange={(event) => setEditReason(event.target.value)}
                placeholder="Reason for edit (optional)"
                value={editReason}
              />
            </>
          ) : null}

          {error ? (
            <Frame>
              <FramePanel className="text-destructive text-sm">
                {error}
                {revisionConflict ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-muted-foreground text-xs">
                      Your draft remains in the editor. Compare it with the
                      latest server revision below before rebasing.
                    </p>
                    {canRebase ? (
                      <Button
                        onClick={() => {
                          setBaseRevision(latestHistoryRevision);
                          setRevisionConflict(false);
                          setError(null);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Rebase draft onto revision {latestHistoryRevision}
                      </Button>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Waiting for the latest revision…
                      </p>
                    )}
                  </div>
                ) : null}
              </FramePanel>
            </Frame>
          ) : null}

          <RevisionHistory history={history} tagOptions={tagOptions} />

          {canEdit ? (
            <RemovalControl
              confirming={confirmingRemoval}
              disabled={saving}
              onCancel={() => setConfirmingRemoval(false)}
              onConfirm={remove}
              onRequest={() => setConfirmingRemoval(true)}
            />
          ) : null}
        </SheetPanel>
        <SheetFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Close
          </Button>
          {canEdit ? (
            <Button disabled={saving} onClick={save} type="button">
              {saving ? "Saving…" : "Save revision"}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

export type { EditingEntity as BuildCollaborationEditingEntity };
