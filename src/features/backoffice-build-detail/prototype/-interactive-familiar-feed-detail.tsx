"use client";

import {
  ChevronRight,
  Eye,
  Filter,
  Flag,
  LockKeyhole,
  Pin,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  CollaborationRichTextEditor,
  type CollaborationTagOption,
} from "../../build-collaboration/CollaborationRichTextEditor.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
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
import {
  type ActionEditorState,
  type ActionItem,
  type ActionPriority,
  type ActionStatus,
  type BuildEntity,
  PARTICIPANTS,
  type Participant,
  type ParticipantId,
  type FeedPost,
  STATUS_COLUMNS,
} from "./-interactive-familiar-feed-contracts.ts";
import {
  entityIcon,
  entityKindLabel,
  participantById,
  richTextToPlainText,
  statusLabel,
  titleCase,
} from "./-interactive-familiar-feed-utils.tsx";
import { cn } from "#/lib/utils.ts";

export function EmptyActions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <Flag className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 font-medium text-sm">No Action Items yet</p>
      <p className="mt-1 text-muted-foreground text-xs">
        Turn discussion into accountable work without leaving the post.
      </p>
      <Button className="mt-3" onClick={onAdd} size="sm" variant="outline">
        <Plus />
        Add the first item
      </Button>
    </div>
  );
}
export function DailyRail({
  myOpenActions,
  onActionOpen,
  onPinnedPostOpen,
  onViewerChange,
  pinnedPosts,
  viewer,
}: {
  myOpenActions: Array<{ actionItem: ActionItem; postId: string }>;
  onActionOpen: (postId: string, actionItem: ActionItem) => void;
  onPinnedPostOpen: (postId: string) => void;
  onViewerChange: (participantId: ParticipantId) => void;
  pinnedPosts: FeedPost[];
  viewer: Participant;
}) {
  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">View as participant</p>
              <p className="text-muted-foreground text-xs">
                Feel how permissions change the same feed
              </p>
            </div>
          </div>
          <Select
            onValueChange={(value) => onViewerChange(value as ParticipantId)}
            value={viewer.id}
          >
            <SelectTrigger aria-label="View feed as" className="mt-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["connor", "eva", "priya", "marco"].map((participantId) => {
                const participant = participantById(
                  participantId as ParticipantId
                );
                return (
                  <SelectItem key={participant.id} value={participant.id}>
                    {participant.name} · {participant.roleLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/45 p-3">
            <ParticipantAvatar participant={viewer} />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{viewer.name}</p>
              <p className="truncate text-muted-foreground text-xs">
                {viewer.roleLabel}
              </p>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-start gap-2">
            <Pin className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">Pinned for this Build</p>
              <p className="text-muted-foreground text-xs">
                {pinnedPosts.length} visible threads
              </p>
            </div>
          </div>
          <div className="mt-3">
            {pinnedPosts.map((post) => (
              <button
                className="flex w-full items-center gap-2 border-b py-2 text-left last:border-b-0"
                key={post.id}
                onClick={() => onPinnedPostOpen(post.id)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {richTextToPlainText(post.body).slice(0, 48)}
                    {richTextToPlainText(post.body).length > 48 ? "…" : ""}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {participantById(post.authorId).name} ·{" "}
                    {
                      post.actionItems.filter((item) => item.status !== "done")
                        .length
                    }{" "}
                    open actions
                  </span>
                </span>
              </button>
            ))}
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">My Action Items</p>
              <p className="text-muted-foreground text-xs">
                {myOpenActions.length} open across visible posts
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {myOpenActions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">
                Nothing assigned to {viewer.name}.
              </p>
            ) : (
              myOpenActions.map(({ actionItem, postId }) => (
                <button
                  className="flex items-center gap-2 rounded-lg border bg-background p-2 text-left"
                  key={actionItem.id}
                  onClick={() => onActionOpen(postId, actionItem)}
                  type="button"
                >
                  <Flag
                    className={cn(
                      "size-3.5",
                      actionItem.priority === "urgent"
                        ? "text-destructive"
                        : "text-primary"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">
                      {actionItem.identifier}
                    </span>
                    <span className="block truncate text-xs">
                      {actionItem.title}
                    </span>
                  </span>
                  <StatusBadge status={actionItem.status} />
                </button>
              ))
            )}
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">Build participants</p>
              <p className="text-muted-foreground text-xs">
                8 people · 5 organizations
              </p>
            </div>
          </div>
          <div className="mt-3 flex -space-x-2">
            {PARTICIPANTS.map((participant) => (
              <div
                className="rounded-full border-2 border-background"
                key={participant.id}
                title={`${participant.name} · ${participant.roleLabel}`}
              >
                <ParticipantAvatar participant={participant} small />
              </div>
            ))}
          </div>
          <Button className="mt-3 w-full" size="sm" variant="outline">
            Manage participation
          </Button>
        </FramePanel>
      </Frame>
    </aside>
  );
}

export function RestrictedPostPlaceholder() {
  return (
    <Card
      className="border-dashed bg-muted/25 shadow-none"
      render={<article />}
    >
      <CardPanel className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <LockKeyhole className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">Restricted update</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            You do not have permission to view this update.
          </p>
        </div>
        <Button
          className="ml-auto hidden sm:inline-flex"
          size="sm"
          variant="ghost"
        >
          Why can’t I view this?
        </Button>
      </CardPanel>
    </Card>
  );
}

export function EmptyFeed({ onClear }: { onClear: () => void }) {
  return (
    <Frame>
      <FramePanel className="p-10 text-center">
        <Filter className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">No updates match this view</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Clear the current filters to return to the complete Build feed.
        </p>
        <Button className="mt-4" onClick={onClear} size="sm" variant="outline">
          Clear filters
        </Button>
      </FramePanel>
    </Frame>
  );
}

export function BuildEntityDetailSheet({
  entity,
  onClose,
  onNavigate,
}: {
  entity: BuildEntity | null;
  onClose: () => void;
  onNavigate: (entity: BuildEntity) => void;
}) {
  return (
    <Sheet
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(entity)}
    >
      <SheetPopup side="right" variant="inset">
        {entity ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {entityIcon(entity.kind)}
                </span>
                <Badge variant="outline">{entityKindLabel(entity.kind)}</Badge>
              </div>
              <SheetTitle>{entity.label}</SheetTitle>
              <SheetDescription>{entity.summary}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="grid gap-4">
              <Frame>
                <FramePanel className="p-4">
                  <p className="text-sm leading-6">{entity.detail}</p>
                </FramePanel>
              </Frame>
              <div className="grid grid-cols-2 gap-2">
                {entity.details.map((detail) => (
                  <Card className="shadow-none" key={detail.label}>
                    <CardPanel className="p-3">
                      <p className="text-muted-foreground text-xs">
                        {detail.label}
                      </p>
                      <p className="mt-1 font-semibold text-sm">
                        {detail.value}
                      </p>
                    </CardPanel>
                  </Card>
                ))}
              </div>
              <Frame>
                <FramePanel className="p-4">
                  <p className="font-medium text-xs">Canonical location</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {entity.target}
                  </p>
                </FramePanel>
              </Frame>
            </SheetPanel>
            <SheetFooter>
              <Button onClick={() => onNavigate(entity)}>
                Open and focus in Build
                <ChevronRight />
              </Button>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

export function ActionItemSheet({
  editor,
  onChange,
  onClose,
  onSave,
  parentAudience,
  tagOptions,
}: {
  editor: ActionEditorState | null;
  onChange: (editor: ActionEditorState | null) => void;
  onClose: () => void;
  onSave: () => void;
  parentAudience: string;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <Sheet
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(editor)}
    >
      <SheetPopup side="right" variant="inset">
        {editor ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{editor.identifier}</Badge>
                <PriorityBadge priority={editor.priority} />
              </div>
              <SheetTitle>
                {editor.isNew ? "Create Action Item" : editor.title}
              </SheetTitle>
              <SheetDescription>
                Linear-style work attached to the originating post.
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="grid gap-5">
              <div className="rounded-lg border border-primary/20 bg-primary/4 p-3">
                <p className="flex items-center gap-2 font-medium text-xs">
                  <ShieldCheck className="size-4 text-primary" />
                  Audience inherited from the post
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {parentAudience}. This Action Item cannot widen visibility.
                </p>
              </div>

              <EditorField label="Title">
                <Input
                  onChange={(event) =>
                    onChange({ ...editor, title: event.target.value })
                  }
                  value={editor.title}
                />
              </EditorField>
              <EditorField label="Description">
                <CollaborationRichTextEditor
                  ariaLabel="Action Item description"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-28"
                  onChange={(value) =>
                    onChange({ ...editor, description: value })
                  }
                  placeholder="What does done look like? Type @ to tag Build context."
                  tagOptions={tagOptions}
                  value={editor.description}
                />
              </EditorField>
              <div className="grid gap-4 sm:grid-cols-2">
                <EditorField label="Status">
                  <Select
                    onValueChange={(value) =>
                      onChange({
                        ...editor,
                        status: value as ActionStatus,
                      })
                    }
                    value={editor.status}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_COLUMNS.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
                <EditorField label="Priority">
                  <Select
                    onValueChange={(value) =>
                      onChange({
                        ...editor,
                        priority: value as ActionPriority,
                      })
                    }
                    value={editor.priority}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["urgent", "high", "medium", "low"].map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {titleCase(priority)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
              </div>
              <EditorField label="Assignee">
                <Select
                  onValueChange={(value) =>
                    onChange({
                      ...editor,
                      assigneeId: value as ParticipantId,
                    })
                  }
                  value={editor.assigneeId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTICIPANTS.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        {participant.name} · {participant.roleLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditorField>
              <EditorField label="Due date">
                <Input
                  nativeInput
                  onChange={(event) =>
                    onChange({ ...editor, dueDate: event.target.value })
                  }
                  type="date"
                  value={editor.dueDate}
                />
              </EditorField>
              <EditorField label="Labels">
                <Input
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      labels: event.target.value
                        .split(",")
                        .map((label) => label.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Evidence, Draw 3"
                  value={editor.labels.join(", ")}
                />
              </EditorField>
              <div>
                <p className="font-medium text-xs">Activity</p>
                <div className="mt-2 grid gap-3 border-l pl-4 text-xs">
                  <p>
                    <span className="font-medium">Created</span>
                    <span className="ml-2 text-muted-foreground">
                      by {participantById(editor.assigneeId).name}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium">Visibility set</span>
                    <span className="ml-2 text-muted-foreground">
                      inherited from parent post
                    </span>
                  </p>
                </div>
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button disabled={!editor.title.trim()} onClick={onSave}>
                {editor.isNew ? "Create Action Item" : "Save changes"}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

function EditorField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="font-medium text-xs">{label}</span>
      {children}
    </div>
  );
}

export function ParticipantAvatar({
  participant,
  small = false,
}: {
  participant: Participant;
  small?: boolean;
}) {
  return (
    <Avatar className={small ? "size-7" : "size-9"}>
      <AvatarFallback
        className={cn(
          participant.tone === "blue" && "bg-blue-100 text-blue-800",
          participant.tone === "amber" && "bg-amber-100 text-amber-800",
          participant.tone === "green" && "bg-emerald-100 text-emerald-800",
          participant.tone === "rose" && "bg-rose-100 text-rose-800",
          participant.tone === "violet" && "bg-violet-100 text-violet-800"
        )}
      >
        {participant.initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function PriorityBadge({ priority }: { priority: ActionPriority }) {
  return (
    <Badge
      variant={
        priority === "urgent"
          ? "error"
          : priority === "high"
            ? "warning"
            : "outline"
      }
    >
      <Flag />
      {titleCase(priority)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ActionStatus }) {
  return (
    <Badge
      variant={
        status === "blocked"
          ? "error"
          : status === "done"
            ? "success"
            : status === "in_progress"
              ? "info"
              : "outline"
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}
