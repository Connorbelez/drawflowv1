"use client";

import {
  Bell,
  ChevronRight,
  Circle,
  CircleCheck,
  Flag,
  List,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Send,
  ShieldCheck,
  SquareKanban,
  Users,
  X,
} from "lucide-react";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "../../build-collaboration/CollaborationRichTextEditor.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";
import {
  type ActionItem,
  type ActionStatus,
  type ActionView,
  type BuildEntity,
  type FeedComment,
  type FeedPost,
  type ParticipantId,
  type PostTab,
  STATUS_COLUMNS,
} from "./-interactive-familiar-feed-contracts.ts";
import {
  buildEntityToReference,
  canParticipantViewPost,
  entityById,
  entityIcon,
  entityKindLabel,
  audienceLabel,
  normalizeRichText,
  participantById,
  richTextHasContent,
} from "./-interactive-familiar-feed-utils.tsx";
import {
  MentionAccessWarning,
} from "./-interactive-familiar-feed-controls.tsx";
import {
  EmptyActions,
  ParticipantAvatar,
  PriorityBadge,
  StatusBadge,
} from "./-interactive-familiar-feed-detail.tsx";

export function InteractivePost({
  actionView,
  commentDraft,
  commentMentionIds,
  draggedAction,
  onActionDrag,
  onActionDrop,
  onActionOpen,
  onActionStatusChange,
  onActionViewChange,
  onAddAction,
  onCommentChange,
  onCommentMentionsChange,
  onCommentPin,
  onCommentSubmit,
  onFollow,
  onPin,
  onReferenceOpen,
  onReply,
  onReplyCancel,
  onTabChange,
  post,
  replyTargetId,
  tab,
  tagOptions,
  viewerId,
}: {
  actionView: ActionView;
  commentDraft: string;
  commentMentionIds: ParticipantId[];
  draggedAction: { actionId: string; postId: string } | null;
  onActionDrag: (dragged: { actionId: string; postId: string } | null) => void;
  onActionDrop: (status: ActionStatus) => void;
  onActionOpen: (actionItem: ActionItem) => void;
  onActionStatusChange: (actionId: string, status: ActionStatus) => void;
  onActionViewChange: (view: ActionView) => void;
  onAddAction: () => void;
  onCommentChange: (body: string) => void;
  onCommentMentionsChange: (mentionIds: ParticipantId[]) => void;
  onCommentPin: (commentId: string) => void;
  onCommentSubmit: () => void;
  onFollow: () => void;
  onPin: () => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  onReplyCancel: () => void;
  onTabChange: (tab: PostTab) => void;
  post: FeedPost;
  replyTargetId: string | null;
  tab: PostTab;
  tagOptions: CollaborationTagOption[];
  viewerId: ParticipantId;
}) {
  const author = participantById(post.authorId);
  const following = post.followingIds.includes(viewerId);
  const pinnedComments = post.comments.filter((comment) => comment.pinned);
  const replyTarget = post.comments.find(
    (comment) => comment.id === replyTargetId
  );
  const excludedCommentMentions = commentMentionIds.filter(
    (participantId) => !canParticipantViewPost(participantId, post)
  );

  return (
    <Card id={`prototype-${post.id}`} render={<article />}>
      <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
        <ParticipantAvatar participant={author} />
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            {author.name}
            <span className="font-normal text-muted-foreground">
              · {author.roleLabel}
            </span>
          </CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {post.createdAt}
            <Badge variant="outline">
              <Users />
              {audienceLabel(post.audienceId)}
            </Badge>
            {post.pinned ? (
              <Badge variant="info">
                <Pin />
                Pinned
              </Badge>
            ) : null}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Post options"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Thread</DropdownMenuLabel>
              <DropdownMenuItem onClick={onPin}>
                <Pin />
                {post.pinned ? "Unpin from Build" : "Pin to Build"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onFollow}>
                <Bell />
                {following ? "Stop following" : "Follow thread"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Paperclip />
                Copy thread link
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardPanel className="p-4 pt-0">
        <RichBody
          body={post.body}
          onReferenceOpen={onReferenceOpen}
          tagOptions={tagOptions}
        />
        {post.entityIds.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {post.entityIds.map((entityId) => {
              const entity = entityById(entityId);
              return (
                <EntityReferenceCard
                  entity={entity}
                  key={entity.id}
                  onOpen={() => onReferenceOpen(buildEntityToReference(entity))}
                />
              );
            })}
          </div>
        ) : null}
      </CardPanel>
      <CardFooter className="block border-t p-0">
        <Tabs
          onValueChange={(value) => onTabChange(value as PostTab)}
          value={tab}
        >
          <TabsList className="w-full justify-start px-4" variant="underline">
            <TabsTab value="discussion">
              <MessageCircle />
              Discussion {post.comments.length}
            </TabsTab>
            <TabsTab value="actions">
              <Flag />
              Action Items {post.actionItems.length}
            </TabsTab>
          </TabsList>
          <TabsPanel className="p-4" value="discussion">
            {pinnedComments.length > 0 ? (
              <div className="mb-3 grid gap-2">
                {pinnedComments.map((comment) => (
                  <div
                    className="flex gap-2 rounded-lg border border-primary/20 bg-primary/4 p-3"
                    key={comment.id}
                  >
                    <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium text-xs">
                        Pinned reply · {participantById(comment.authorId).name}
                      </p>
                      <RichBody
                        body={comment.body}
                        className="mt-1 text-muted-foreground text-xs"
                        onReferenceOpen={onReferenceOpen}
                        tagOptions={tagOptions}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <CommentTree
              comments={post.comments}
              onPin={onCommentPin}
              onReferenceOpen={onReferenceOpen}
              onReply={onReply}
              tagOptions={tagOptions}
            />
            {post.comments.length === 0 ? (
              <p className="py-3 text-center text-muted-foreground text-sm">
                No replies yet. Start the discussion.
              </p>
            ) : null}
            <div className="mt-3 border-t pt-3">
              {replyTarget ? (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span>
                    Replying to {participantById(replyTarget.authorId).name}
                  </span>
                  <Button
                    aria-label="Cancel nested reply"
                    onClick={onReplyCancel}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
              <div className="flex items-start gap-2">
                <ParticipantAvatar
                  participant={participantById(viewerId)}
                  small
                />
                <CollaborationRichTextEditor
                  aria-label="Reply to post"
                  className="min-w-0 flex-1"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-20"
                  onChange={(value, references) => {
                    onCommentChange(value);
                    onCommentMentionsChange(
                      references
                        .filter((reference) => reference.kind === "participant")
                        .map((reference) => reference.id as ParticipantId)
                    );
                  }}
                  placeholder="Write a reply… Type @ to tag people or Build work."
                  tagOptions={tagOptions}
                  value={commentDraft}
                />
                <Button
                  aria-label="Post reply"
                  disabled={!richTextHasContent(commentDraft)}
                  onClick={onCommentSubmit}
                  size="icon-sm"
                >
                  <Send />
                </Button>
              </div>
              <MentionAccessWarning participantIds={excludedCommentMentions} />
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3" />
                Replies inherit: {audienceLabel(post.audienceId)}
              </p>
            </div>
          </TabsPanel>
          <TabsPanel className="p-4" value="actions">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-muted-foreground text-xs">
                <LockKeyhole className="size-3.5" />
                Visibility inherited from this post
              </p>
              <div className="flex gap-1">
                <Button
                  aria-label="Action item list view"
                  onClick={() => onActionViewChange("list")}
                  size="icon-sm"
                  variant={actionView === "list" ? "secondary" : "ghost"}
                >
                  <List />
                </Button>
                <Button
                  aria-label="Action item kanban view"
                  onClick={() => onActionViewChange("board")}
                  size="icon-sm"
                  variant={actionView === "board" ? "secondary" : "ghost"}
                >
                  <SquareKanban />
                </Button>
                <Button onClick={onAddAction} size="sm">
                  <Plus />
                  Action item
                </Button>
              </div>
            </div>
            {post.actionItems.length === 0 ? (
              <EmptyActions onAdd={onAddAction} />
            ) : actionView === "list" ? (
              <ActionItemList
                actionItems={post.actionItems}
                onOpen={onActionOpen}
                onStatusChange={onActionStatusChange}
              />
            ) : (
              <ActionItemBoard
                actionItems={post.actionItems}
                draggedAction={draggedAction}
                onDrag={onActionDrag}
                onDrop={onActionDrop}
                onOpen={onActionOpen}
                postId={post.id}
              />
            )}
          </TabsPanel>
        </Tabs>
      </CardFooter>
    </Card>
  );
}
function EntityReferenceCard({
  entity,
  onOpen,
}: {
  entity: BuildEntity;
  onOpen: () => void;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Card
            aria-label={`Open ${entityKindLabel(entity.kind)}: ${entity.label}`}
            className="group rounded-xl shadow-none transition-colors hover:border-primary/35 hover:bg-primary/3 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
            onClick={onOpen}
            render={<button type="button" />}
          />
        }
      >
        <CardPanel className="flex items-center gap-3 p-3 text-left">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-primary transition-colors group-hover:bg-primary/10">
            {entityIcon(entity.kind)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-xs">
              {entity.label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {entity.summary}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </CardPanel>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3" side="top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {entityIcon(entity.kind)}
          </span>
          <div className="min-w-0">
            <Badge variant="outline">{entityKindLabel(entity.kind)}</Badge>
            <p className="mt-2 font-semibold text-sm">{entity.label}</p>
            <p className="mt-1 text-muted-foreground">{entity.detail}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
          {entity.details.slice(0, 3).map((detail) => (
            <div className="min-w-0" key={detail.label}>
              <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
                {detail.label}
              </p>
              <p className="mt-0.5 truncate font-medium text-xs">
                {detail.value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 font-medium text-primary">
          Open {entityKindLabel(entity.kind)} detail
          <ChevronRight className="size-3" />
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function RichBody({
  body,
  className,
  onReferenceOpen,
  tagOptions,
}: {
  body: string;
  className?: string;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <CollaborationRichTextPreview
      ariaLabel="Collaboration message"
      className={cn(
        "border-0 bg-transparent text-foreground [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0 [&_.ProseMirror]:leading-6",
        className
      )}
      onReferenceOpen={onReferenceOpen}
      tagOptions={tagOptions}
      value={normalizeRichText(body)}
    />
  );
}

function CommentTree({
  comments,
  onPin,
  onReferenceOpen,
  onReply,
  tagOptions,
}: {
  comments: FeedComment[];
  onPin: (commentId: string) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  tagOptions: CollaborationTagOption[];
}) {
  const roots = comments.filter((comment) => !comment.parentId);
  return (
    <div>
      {roots.map((comment) => (
        <CommentNode
          allComments={comments}
          comment={comment}
          depth={0}
          key={comment.id}
          onPin={onPin}
          onReferenceOpen={onReferenceOpen}
          onReply={onReply}
          tagOptions={tagOptions}
        />
      ))}
    </div>
  );
}

function CommentNode({
  allComments,
  comment,
  depth,
  onPin,
  onReferenceOpen,
  onReply,
  tagOptions,
}: {
  allComments: FeedComment[];
  comment: FeedComment;
  depth: number;
  onPin: (commentId: string) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  tagOptions: CollaborationTagOption[];
}) {
  const author = participantById(comment.authorId);
  const replies = allComments.filter(
    (candidate) => candidate.parentId === comment.id
  );
  const visualDepth = Math.min(depth, 2);
  return (
    <div
      className="relative py-2"
      style={{ marginLeft: `${visualDepth * 22}px` }}
    >
      {depth > 0 ? (
        <div className="absolute top-0 -left-3 h-full w-px bg-border" />
      ) : null}
      <div className="flex gap-2">
        <ParticipantAvatar participant={author} small />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-muted/55 px-3 py-2">
            <p className="font-medium text-xs">{author.name}</p>
            {depth > 2 ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Deep reply · ancestor path preserved
              </p>
            ) : null}
            <RichBody
              body={comment.body}
              className="mt-1 text-sm [&_.ProseMirror]:leading-5"
              onReferenceOpen={onReferenceOpen}
              tagOptions={tagOptions}
            />
          </div>
          <div className="mt-1 flex gap-3 px-2 text-muted-foreground text-xs">
            <button onClick={() => onReply(comment.id)} type="button">
              Reply
            </button>
            <button onClick={() => onPin(comment.id)} type="button">
              {comment.pinned ? "Unpin" : "Pin"}
            </button>
            <span>{comment.createdAt}</span>
          </div>
        </div>
      </div>
      {replies.map((reply) => (
        <CommentNode
          allComments={allComments}
          comment={reply}
          depth={depth + 1}
          key={reply.id}
          onPin={onPin}
          onReferenceOpen={onReferenceOpen}
          onReply={onReply}
          tagOptions={tagOptions}
        />
      ))}
    </div>
  );
}

function ActionItemList({
  actionItems,
  onOpen,
  onStatusChange,
}: {
  actionItems: ActionItem[];
  onOpen: (actionItem: ActionItem) => void;
  onStatusChange: (actionId: string, status: ActionStatus) => void;
}) {
  return (
    <div className="grid gap-2">
      {actionItems.map((actionItem) => (
        <Card className="rounded-xl shadow-none" key={actionItem.id}>
          <CardPanel className="flex items-center gap-3 p-3">
            <button
              aria-label={
                actionItem.status === "done"
                  ? `Reopen ${actionItem.title}`
                  : `Complete ${actionItem.title}`
              }
              onClick={() =>
                onStatusChange(
                  actionItem.id,
                  actionItem.status === "done" ? "todo" : "done"
                )
              }
              type="button"
            >
              {actionItem.status === "done" ? (
                <CircleCheck className="size-5 text-success-foreground" />
              ) : (
                <Circle className="size-5 text-muted-foreground" />
              )}
            </button>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => onOpen(actionItem)}
              type="button"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {actionItem.identifier}
                </span>
                <PriorityBadge priority={actionItem.priority} />
                <StatusBadge status={actionItem.status} />
              </span>
              <span
                className={cn(
                  "mt-1 block truncate text-sm",
                  actionItem.status === "done" &&
                    "text-muted-foreground line-through"
                )}
              >
                {actionItem.title}
              </span>
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-xs">
                {participantById(actionItem.assigneeId).name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Due {actionItem.dueDate}
              </p>
            </div>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ActionItemBoard({
  actionItems,
  draggedAction,
  onDrag,
  onDrop,
  onOpen,
  postId,
}: {
  actionItems: ActionItem[];
  draggedAction: { actionId: string; postId: string } | null;
  onDrag: (dragged: { actionId: string; postId: string } | null) => void;
  onDrop: (status: ActionStatus) => void;
  onOpen: (actionItem: ActionItem) => void;
  postId: string;
}) {
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-4">
      {STATUS_COLUMNS.map((column) => {
        const items = actionItems.filter(
          (actionItem) => actionItem.status === column.id
        );
        return (
          <Frame
            className={cn(
              "min-w-56",
              draggedAction?.postId === postId && "ring-1 ring-primary/20"
            )}
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(column.id)}
          >
            <FramePanel className="min-h-40 p-2">
              <div className="flex items-center justify-between px-1 py-1">
                <p className="font-semibold text-xs">{column.label}</p>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              <div className="mt-2 grid gap-2">
                {items.map((actionItem) => (
                  <Card
                    className="cursor-grab rounded-xl shadow-none active:cursor-grabbing"
                    draggable
                    key={actionItem.id}
                    onDragEnd={() => onDrag(null)}
                    onDragStart={() =>
                      onDrag({ actionId: actionItem.id, postId })
                    }
                    render={<button type="button" />}
                  >
                    <CardPanel
                      className="p-3 text-left"
                      onClick={() => onOpen(actionItem)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {actionItem.identifier}
                        </span>
                        <PriorityBadge priority={actionItem.priority} />
                      </div>
                      <p className="mt-2 text-sm leading-5">
                        {actionItem.title}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <ParticipantAvatar
                          participant={participantById(actionItem.assigneeId)}
                          small
                        />
                        <span className="truncate text-[11px] text-muted-foreground">
                          {actionItem.dueDate}
                        </span>
                      </div>
                    </CardPanel>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-2 py-6 text-center text-muted-foreground text-xs">
                    Drop here
                  </div>
                ) : null}
              </div>
            </FramePanel>
          </Frame>
        );
      })}
    </div>
  );
}
