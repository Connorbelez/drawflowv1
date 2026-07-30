"use client";

import type { JSONContent } from "@tiptap/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { History, MessageCircle, Paperclip, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
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
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  emptyDocument,
  formatTimestamp,
  parseDocument,
  plainTextFromDocument,
  toBackendReferenceKind,
} from "./model.ts";

type ActionItemDetail = FunctionReturnType<
  typeof api.build_action_item_details.getBuildActionItemDetail
>;
type VisibleActionItemDetail = Extract<ActionItemDetail, { state: "visible" }>;
type ActionPriority = VisibleActionItemDetail["item"]["priority"];

export type BuildActionItemSheetTarget =
  | {
      actionItemId: Id<"buildActionItems">;
      kind: "detail";
    }
  | {
      kind: "create";
      postId: Id<"buildCollaborationPosts">;
    };

export function BuildActionItemDetailSheet({
  buildId,
  onCreated,
  onOpenChange,
  open,
  organizationId,
  tagOptions,
  target,
}: {
  buildId: Id<"activeBuilds">;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
  target: BuildActionItemSheetTarget | null;
}) {
  const actionItemId =
    target?.kind === "detail" ? target.actionItemId : undefined;
  const detail = useQuery(
    api.build_action_item_details.getBuildActionItemDetail,
    open && actionItemId ? { actionItemId, buildId, organizationId } : "skip"
  ) as ActionItemDetail | undefined;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup side="right" variant="inset">
        {target?.kind === "create" ? (
          <ActionItemCreatePanel
            buildId={buildId}
            onCreated={onCreated}
            onOpenChange={onOpenChange}
            organizationId={organizationId}
            postId={target.postId}
            tagOptions={tagOptions}
          />
        ) : (
          <ActionItemDetailPanel
            buildId={buildId}
            detail={detail}
            onOpenChange={onOpenChange}
            organizationId={organizationId}
            tagOptions={tagOptions}
          />
        )}
      </SheetPopup>
    </Sheet>
  );
}

function ActionItemCreatePanel({
  buildId,
  onCreated,
  onOpenChange,
  organizationId,
  postId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
  tagOptions: CollaborationTagOption[];
}) {
  const createActionItem = useMutation(
    api.build_action_items.createBuildActionItem
  );
  const generateUploadUrl = useMutation(
    api.build_action_item_details.generateBuildActionItemAttachmentUploadUrl
  );
  const registerAttachment = useMutation(
    api.build_action_item_details.registerBuildActionItemAttachment
  );
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [priority, setPriority] = useState<ActionPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [assigneeWorkosUserId, setAssigneeWorkosUserId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [requestId] = useState(() => newActionItemRequestId());
  const [submitting, setSubmitting] = useState(false);
  const participants = tagOptions.filter(
    (option) => option.kind === "participant"
  );

  const create = async () => {
    if (!(title.trim() && plainTextFromDocument(document)) || submitting) {
      toast.error("Add a title and a useful description.");
      return;
    }
    setSubmitting(true);
    try {
      const attachmentAssetIds = await uploadAttachments(files, {
        buildId,
        generateUploadUrl,
        organizationId,
        postId,
        registerAttachment,
      });
      const actionItemId = await createActionItem({
        assigneeWorkosUserId: assigneeWorkosUserId || undefined,
        attachmentAssetIds,
        buildId,
        descriptionPlainText: plainTextFromDocument(document),
        descriptionTiptapJson: JSON.stringify(document),
        dueAt: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : undefined,
        labels: labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        organizationId,
        postId,
        priority,
        references: references.map((reference, index) => ({
          entityId: reference.id,
          entityKind: toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        requestId,
        title: title.trim(),
      });
      toast.success("Action Item created.");
      onCreated?.(actionItemId);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create Action Item."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">New Action Item</Badge>
          <Badge variant="secondary">{priority}</Badge>
        </div>
        <SheetTitle>Create accountable work</SheetTitle>
        <SheetDescription>
          The Action Item inherits the post audience and cannot widen it.
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="space-y-5">
        <AudienceInheritanceNotice />
        <Field label="Title">
          <Input
            aria-label="Action Item title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to happen?"
            value={title}
          />
        </Field>
        <Field label="Description">
          <CollaborationRichTextEditor
            ariaLabel="Action Item description"
            editorMinHeightClass="[&_.ProseMirror]:min-h-32"
            onChange={(nextHtml, nextReferences) => {
              setDescriptionHtml(nextHtml);
              setReferences(nextReferences);
            }}
            onDocumentChange={setDocument}
            placeholder="What does done look like? Type @ to link Build work."
            tagOptions={tagOptions}
            value={descriptionHtml}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <PrioritySelect onChange={setPriority} value={priority} />
          </Field>
          <Field label="Due date">
            <Input
              aria-label="Action Item due date"
              nativeInput
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </Field>
        </div>
        <Field label="Assignee">
          <Select
            onValueChange={(value) => setAssigneeWorkosUserId(value ?? "")}
            value={assigneeWorkosUserId}
          >
            <SelectTrigger aria-label="Action Item assignee">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((participant) => (
                <SelectItem key={participant.id} value={participant.id}>
                  {participant.label} · {participant.eyebrow}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Labels">
          <Input
            aria-label="Action Item labels"
            onChange={(event) => setLabels(event.target.value)}
            placeholder="Evidence, Draw 3"
            value={labels}
          />
        </Field>
        <Field label="Attachments">
          <Input
            aria-label="Action Item attachments"
            multiple
            nativeInput
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
          {files.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </p>
          ) : null}
        </Field>
      </SheetPanel>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Cancel
        </Button>
        <Button disabled={submitting} onClick={create}>
          {submitting ? "Creating…" : "Create Action Item"}
        </Button>
      </SheetFooter>
    </>
  );
}

function ActionItemDetailPanel({
  buildId,
  detail,
  onOpenChange,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: ActionItemDetail | undefined;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  if (detail === undefined) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Action Item</SheetTitle>
          <SheetDescription>Loading accountable work…</SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <Frame>
            <FramePanel aria-live="polite">Loading Action Item…</FramePanel>
          </Frame>
        </SheetPanel>
      </>
    );
  }
  if (detail.state === "revoked") {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Action Item unavailable</SheetTitle>
          <SheetDescription>
            The item was removed or its originating post is restricted.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </>
    );
  }
  return (
    <VisibleActionItemDetail
      buildId={buildId}
      detail={detail}
      onOpenChange={onOpenChange}
      organizationId={organizationId}
      tagOptions={tagOptions}
    />
  );
}

function VisibleActionItemDetail({
  buildId,
  detail,
  onOpenChange,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  const updateActionItem = useMutation(
    api.build_action_items.updateBuildActionItem
  );
  const addComment = useMutation(
    api.build_action_item_details.addBuildActionItemComment
  );
  const [title, setTitle] = useState(detail.item.title);
  const [priority, setPriority] = useState(detail.item.priority);
  const [dueDate, setDueDate] = useState(dateInputValue(detail.item.dueAt));
  const [commentHtml, setCommentHtml] = useState("");
  const [commentDocument, setCommentDocument] = useState<JSONContent>(
    emptyDocument()
  );
  const [commentReferences, setCommentReferences] = useState<
    CollaborationTagReference[]
  >([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(detail.item.title);
    setPriority(detail.item.priority);
    setDueDate(dateInputValue(detail.item.dueAt));
  }, [detail.item.dueAt, detail.item.priority, detail.item.title]);

  const save = async () => {
    setSaving(true);
    try {
      await updateActionItem({
        actionItemId: detail.item.actionItemId,
        buildId,
        dueAt: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : null,
        expectedRevision: detail.item.currentRevision,
        organizationId,
        priority,
        title,
      });
      toast.success("Action Item updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update Action Item."
      );
    } finally {
      setSaving(false);
    }
  };
  const comment = async () => {
    if (!plainTextFromDocument(commentDocument)) {
      return;
    }
    try {
      await addComment({
        actionItemId: detail.item.actionItemId,
        buildId,
        organizationId,
        references: commentReferences.map((reference, index) => ({
          entityId: reference.id,
          entityKind: toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        tiptapJson: JSON.stringify(commentDocument),
      });
      setCommentDocument(emptyDocument());
      setCommentHtml("");
      setCommentReferences([]);
      toast.success("Comment added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add comment."
      );
    }
  };

  return (
    <>
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{detail.item.status}</Badge>
          <Badge variant="secondary">{detail.item.priority}</Badge>
          <Badge variant="outline">
            Revision {detail.item.currentRevision}
          </Badge>
        </div>
        <SheetTitle>{detail.item.title}</SheetTitle>
        <SheetDescription>
          Created by {detail.item.creatorDisplayName} ·{" "}
          {detail.item.assigneeDisplayName
            ? `assigned to ${detail.item.assigneeDisplayName}`
            : "unassigned"}
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="space-y-6">
        <AudienceInheritanceNotice audienceMode={detail.item.audienceMode} />
        <section className="space-y-3">
          <h3 className="font-semibold text-sm">Work definition</h3>
          <Field label="Title">
            <Input
              aria-label="Edit Action Item title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <PrioritySelect onChange={setPriority} value={priority} />
            </Field>
            <Field label="Due date">
              <Input
                aria-label="Edit Action Item due date"
                nativeInput
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </Field>
          </div>
          <CollaborationRichTextPreview
            ariaLabel="Action Item description"
            tagOptions={tagOptions}
            value={parseDocument(detail.item.descriptionTiptapJson)}
          />
          <Button disabled={saving} onClick={save} size="sm">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </section>
        <DetailContext detail={detail} />
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle aria-hidden="true" className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Discussion</h3>
          </div>
          {detail.comments.map((entry) => (
            <Card key={entry.commentId}>
              <CardPanel className="space-y-1 p-3">
                <p className="font-medium text-xs">
                  {entry.authorDisplayName} ·{" "}
                  <span className="text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </p>
                <CollaborationRichTextPreview
                  ariaLabel="Action Item comment"
                  tagOptions={tagOptions}
                  value={parseDocument(entry.tiptapJson)}
                />
              </CardPanel>
            </Card>
          ))}
          <CollaborationRichTextEditor
            ariaLabel="Comment on Action Item"
            editorMinHeightClass="[&_.ProseMirror]:min-h-24"
            onChange={(nextHtml, nextReferences) => {
              setCommentHtml(nextHtml);
              setCommentReferences(nextReferences);
            }}
            onDocumentChange={setCommentDocument}
            placeholder="Add context. Type @ to link Build work."
            tagOptions={tagOptions}
            value={commentHtml}
          />
          <Button onClick={comment} size="sm">
            Add comment
          </Button>
        </section>
        <RevisionHistory detail={detail} />
        <ActivityHistory detail={detail} />
      </SheetPanel>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

function DetailContext({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Build context</h3>
      <div className="flex flex-wrap gap-2">
        {detail.labels.map((label) => (
          <Badge key={label} variant="outline">
            {label}
          </Badge>
        ))}
        {detail.references.map((reference) => (
          <Badge key={`${reference.entityKind}:${reference.entityId}`}>
            @{reference.label}
          </Badge>
        ))}
      </div>
      {detail.attachments.map((attachment) => (
        <Card key={attachment.assetId}>
          <CardPanel className="flex items-center gap-3 p-3">
            <Paperclip aria-hidden="true" className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">
                {attachment.fileName}
              </p>
              <p className="text-muted-foreground text-xs">
                {attachment.mimeType} · {attachment.state}
              </p>
            </div>
            {attachment.url ? (
              <a
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={attachment.url}
                rel="noreferrer"
                target="_blank"
              >
                Open
              </a>
            ) : null}
          </CardPanel>
        </Card>
      ))}
    </section>
  );
}

function RevisionHistory({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Revision history</h3>
      </div>
      {detail.revisions.map((revision) => {
        const snapshot = parseSnapshot(revision.snapshotJson);
        return (
          <details
            className="rounded-lg border bg-muted/10 px-3 py-2"
            key={revision.revision}
          >
            <summary className="cursor-pointer text-sm">
              Revision {revision.revision} ·{" "}
              {formatTimestamp(revision.createdAt)}
            </summary>
            <p className="mt-2 font-medium text-sm">{snapshot.title}</p>
            <p className="text-muted-foreground text-xs">
              {snapshot.status} · {snapshot.priority} · by{" "}
              {revision.actorDisplayName}
            </p>
          </details>
        );
      })}
    </section>
  );
}

function ActivityHistory({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Activity</h3>
      <div className="space-y-3 border-l pl-4">
        {detail.activity.map((activity) => (
          <div className="text-sm" key={activity.eventId}>
            <p className="font-medium">
              {activity.eventType.replaceAll("_", " ")}
            </p>
            <p className="text-muted-foreground text-xs">
              {activity.actorDisplayName} ·{" "}
              {formatTimestamp(activity.createdAt)}
              {activity.reason ? ` · ${activity.reason}` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AudienceInheritanceNotice({
  audienceMode,
}: {
  audienceMode?: "author_tier_and_higher" | "build_wide" | "custom";
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <p className="flex items-center gap-2 font-medium text-xs">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Audience inherited from the post
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {audienceMode === "custom"
            ? "Restricted to the post’s current readers."
            : audienceMode === "author_tier_and_higher"
              ? "Visible to the author’s role tier and every higher tier."
              : "Visible to everyone who can read the parent post."}{" "}
          This Action Item cannot widen visibility.
        </p>
      </FramePanel>
    </Frame>
  );
}

function PrioritySelect({
  onChange,
  value,
}: {
  onChange: (value: ActionPriority) => void;
  value: ActionPriority;
}) {
  return (
    <Select
      onValueChange={(nextValue) => onChange(nextValue as ActionPriority)}
      value={value}
    >
      <SelectTrigger aria-label="Action Item priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["urgent", "high", "medium", "low", "none"] as const).map(
          (priority) => (
            <SelectItem key={priority} value={priority}>
              {priority}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

async function uploadAttachments(
  files: File[],
  context: {
    buildId: Id<"activeBuilds">;
    generateUploadUrl: (args: {
      buildId: Id<"activeBuilds">;
      organizationId: string;
      postId: Id<"buildCollaborationPosts">;
    }) => Promise<string>;
    organizationId: string;
    postId: Id<"buildCollaborationPosts">;
    registerAttachment: (args: {
      buildId: Id<"activeBuilds">;
      fileName: string;
      mimeType?: string;
      organizationId: string;
      postId: Id<"buildCollaborationPosts">;
      storageId: Id<"_storage">;
    }) => Promise<Id<"buildCollaborationAssets">>;
  }
) {
  const assetIds: Id<"buildCollaborationAssets">[] = [];
  for (const file of files) {
    const uploadUrl = await context.generateUploadUrl({
      buildId: context.buildId,
      organizationId: context.organizationId,
      postId: context.postId,
    });
    const response = await fetch(uploadUrl, {
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Unable to upload ${file.name}.`);
    }
    const payload = (await response.json()) as { storageId?: string };
    if (!payload.storageId) {
      throw new Error(`Upload for ${file.name} did not return a storage ID.`);
    }
    assetIds.push(
      await context.registerAttachment({
        buildId: context.buildId,
        fileName: file.name,
        mimeType: file.type || undefined,
        organizationId: context.organizationId,
        postId: context.postId,
        storageId: payload.storageId as Id<"_storage">,
      })
    );
  }
  return assetIds;
}

function parseSnapshot(snapshotJson: string) {
  try {
    return JSON.parse(snapshotJson) as {
      priority: string;
      status: string;
      title: string;
    };
  } catch {
    return { priority: "unknown", status: "unknown", title: "Unavailable" };
  }
}

function dateInputValue(timestamp?: number) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function newActionItemRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`;
}
