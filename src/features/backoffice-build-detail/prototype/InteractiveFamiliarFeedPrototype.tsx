"use client";

import type {
  CollaborationTagOption,
  CollaborationTagReference,
} from "../../build-collaboration/CollaborationRichTextEditor.tsx";
import { useMemo, useState } from "react";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "../MilestoneDetailSheet.tsx";
import {
  ENTITIES,
  ENTITY_SUMMARY_PREFIX_PATTERN,
  INITIAL_POSTS,
  PARTICIPANTS,
  type ActionEditorState,
  type ActionItem,
  type ActionStatus,
  type ActionView,
  type AudienceId,
  type BuildEntity,
  type FeedFilter,
  type FeedPost,
  type ParticipantId,
  type PostTab,
} from "./-interactive-familiar-feed-contracts.ts";
import {
  audienceLabel,
  canParticipantViewPost,
  canReferenceBeUsedInPost,
  entityById,
  entityKindLabel,
  participantById,
  resolveAudienceParticipantIds,
  richTextHasContent,
  richTextToPlainText,
  statusLabel,
  toMilestoneSheetData,
  toggleInList,
} from "./-interactive-familiar-feed-utils.tsx";
import { Composer, FeedToolbar } from "./-interactive-familiar-feed-controls.tsx";
import {
  ActionItemSheet,
  BuildEntityDetailSheet,
  DailyRail,
  EmptyFeed,
  RestrictedPostPlaceholder,
} from "./-interactive-familiar-feed-detail.tsx";
import { InteractivePost } from "./-interactive-familiar-feed-posts.tsx";

export function InteractiveFamiliarFeedPrototype() {
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [viewerId, setViewerId] = useState<ParticipantId>("connor");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [composerAudience, setComposerAudience] = useState<AudienceId>("all");
  const [customAudienceIds, setCustomAudienceIds] = useState<ParticipantId[]>([
    "connor",
    "alex",
  ]);
  const [composerAttachedEntityIds, setComposerAttachedEntityIds] = useState<
    string[]
  >([]);
  const [composerTaggedEntityIds, setComposerTaggedEntityIds] = useState<
    string[]
  >([]);
  const [composerTaggedActionItemIds, setComposerTaggedActionItemIds] =
    useState<string[]>([]);
  const [composerMentionIds, setComposerMentionIds] = useState<ParticipantId[]>(
    []
  );
  const [pickerMode, setPickerMode] = useState<"entities" | null>(null);
  const [postTabs, setPostTabs] = useState<Record<string, PostTab>>({
    "post-inspection": "discussion",
  });
  const [actionViews, setActionViews] = useState<Record<string, ActionView>>({
    "post-inspection": "list",
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [commentMentionDrafts, setCommentMentionDrafts] = useState<
    Record<string, ParticipantId[]>
  >({});
  const [replyTargets, setReplyTargets] = useState<
    Record<string, string | null>
  >({});
  const [actionEditor, setActionEditor] = useState<ActionEditorState | null>(
    null
  );
  const [focusedEntity, setFocusedEntity] = useState<BuildEntity | null>(null);
  const [focusedMilestone, setFocusedMilestone] =
    useState<MilestoneSheetData | null>(null);
  const [draggedAction, setDraggedAction] = useState<{
    actionId: string;
    postId: string;
  } | null>(null);
  const [lastEvent, setLastEvent] = useState(
    "Prototype ready — all changes stay in memory."
  );

  const viewer = participantById(viewerId);
  const tagOptions = useMemo<CollaborationTagOption[]>(() => {
    const people = PARTICIPANTS.map((participant) => ({
      eyebrow: participant.roleLabel,
      id: participant.id,
      initials: participant.initials,
      kind: "participant" as const,
      label: participant.name,
      searchTerms: [participant.role],
      summary: `${participant.roleLabel} on this Build`,
    }));
    const entities = ENTITIES.filter((entity) =>
      entity.visibleTo.includes(viewerId)
    ).map((entity) => ({
      eyebrow: entityKindLabel(entity.kind),
      id: entity.id,
      kind: entity.kind,
      label: entity.label,
      searchTerms: [entity.target],
      summary: entity.summary.replace(ENTITY_SUMMARY_PREFIX_PATTERN, ""),
    }));
    const actions = posts
      .filter((post) => canParticipantViewPost(viewerId, post))
      .flatMap((post) =>
        post.actionItems.map((actionItem) => ({
          eyebrow: "Action Item",
          id: actionItem.id,
          kind: "action_item" as const,
          label: `${actionItem.identifier} · ${actionItem.title}`,
          searchTerms: [
            actionItem.identifier,
            actionItem.title,
            ...actionItem.labels,
          ],
          summary: `${statusLabel(actionItem.status)} · ${participantById(actionItem.assigneeId).name}`,
        }))
      );
    return [...people, ...entities, ...actions];
  }, [posts, viewerId]);
  const composerEntityIds = [
    ...new Set([...composerAttachedEntityIds, ...composerTaggedEntityIds]),
  ];
  const visiblePosts = useMemo(
    () =>
      posts.filter((post) => {
        const searchable = [
          richTextToPlainText(post.body),
          participantById(post.authorId).name,
          ...post.entityIds.map((entityId) => entityById(entityId).label),
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch =
          searchQuery.trim().length === 0 ||
          searchable.includes(searchQuery.trim().toLowerCase());
        if (!matchesSearch) {
          return false;
        }
        if (feedFilter === "pinned") {
          return post.pinned;
        }
        if (feedFilter === "following") {
          return post.followingIds.includes(viewerId);
        }
        if (feedFilter === "mentions") {
          return post.mentionedParticipantIds.includes(viewerId);
        }
        if (feedFilter === "actionable") {
          return post.actionItems.some(
            (item) => item.status !== "done" && item.assigneeId === viewerId
          );
        }
        return true;
      }),
    [feedFilter, posts, searchQuery, viewerId]
  );

  const composerRecipients = resolveAudienceParticipantIds(
    composerAudience,
    customAudienceIds
  );
  const entityConstrainedRecipients = composerTaggedActionItemIds.reduce(
    (current, actionItemId) => {
      const owningPost = posts.find((post) =>
        post.actionItems.some((actionItem) => actionItem.id === actionItemId)
      );
      return owningPost
        ? current.filter((participantId) =>
            canParticipantViewPost(participantId, owningPost)
          )
        : current;
    },
    composerEntityIds.reduce(
      (current, entityId) =>
        current.filter((participantId) =>
          entityById(entityId).visibleTo.includes(participantId)
        ),
      composerRecipients
    )
  );
  const excludedMentions = composerMentionIds.filter(
    (participantId) => !entityConstrainedRecipients.includes(participantId)
  );
  const pinnedVisiblePosts = posts.filter(
    (post) => post.pinned && canParticipantViewPost(viewerId, post)
  );
  const myOpenActions = posts
    .filter((post) => canParticipantViewPost(viewerId, post))
    .flatMap((post) =>
      post.actionItems
        .filter(
          (actionItem) =>
            actionItem.assigneeId === viewerId && actionItem.status !== "done"
        )
        .map((actionItem) => ({ actionItem, postId: post.id }))
    );

  const createPost = () => {
    const body = composerBody.trim();
    if (!richTextHasContent(body) || entityConstrainedRecipients.length === 0) {
      setLastEvent(
        richTextHasContent(body)
          ? "Post blocked — the selected audience cannot access the attached work."
          : "Write an update before posting."
      );
      return;
    }
    const post: FeedPost = {
      actionItems: [],
      audienceId: composerAudience,
      authorId: viewerId,
      body,
      comments: [],
      createdAt: "Just now",
      customAudienceIds:
        composerAudience === "custom" ? customAudienceIds : undefined,
      entityIds: composerEntityIds,
      followingIds: [viewerId],
      id: `post-${Date.now()}`,
      mentionedParticipantIds: composerMentionIds,
      pinned: false,
    };
    setPosts((current) => [post, ...current]);
    setComposerBody("");
    setComposerAttachedEntityIds([]);
    setComposerTaggedEntityIds([]);
    setComposerTaggedActionItemIds([]);
    setComposerMentionIds([]);
    setPickerMode(null);
    setComposerExpanded(false);
    setLastEvent(
      `Posted as ${viewer.name} to ${audienceLabel(composerAudience)} · ${entityConstrainedRecipients.length} recipients.`
    );
  };

  const togglePostPin = (postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, pinned: !post.pinned } : post
      )
    );
    const post = posts.find((candidate) => candidate.id === postId);
    setLastEvent(
      post?.pinned ? "Post unpinned." : "Post pinned for this Build."
    );
  };

  const toggleFollow = (postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              followingIds: post.followingIds.includes(viewerId)
                ? post.followingIds.filter(
                    (participantId) => participantId !== viewerId
                  )
                : [...post.followingIds, viewerId],
            }
          : post
      )
    );
    setLastEvent("Thread notification preference updated.");
  };

  const addComment = (postId: string) => {
    const body = commentDrafts[postId]?.trim();
    if (!richTextHasContent(body)) {
      return;
    }
    const targetPost = posts.find((post) => post.id === postId);
    const requestedMentionIds = commentMentionDrafts[postId] ?? [];
    const mentionedParticipantIds = targetPost
      ? requestedMentionIds.filter((participantId) =>
          canParticipantViewPost(participantId, targetPost)
        )
      : [];
    const excludedMentionCount =
      requestedMentionIds.length - mentionedParticipantIds.length;
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [
                ...post.comments,
                {
                  authorId: viewerId,
                  body,
                  createdAt: "now",
                  id: `comment-${Date.now()}`,
                  mentionedParticipantIds,
                  parentId: replyTargets[postId] ?? undefined,
                  pinned: false,
                },
              ],
              followingIds: post.followingIds.includes(viewerId)
                ? post.followingIds
                : [...post.followingIds, viewerId],
            }
          : post
      )
    );
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setCommentMentionDrafts((current) => ({ ...current, [postId]: [] }));
    setReplyTargets((current) => ({ ...current, [postId]: null }));
    setLastEvent(
      requestedMentionIds.length
        ? `Reply posted · ${mentionedParticipantIds.length} mention notification${mentionedParticipantIds.length === 1 ? "" : "s"} queued${excludedMentionCount ? `; ${excludedMentionCount} excluded by post visibility` : ""}.`
        : "Reply posted with the parent post’s audience."
    );
  };

  const toggleCommentPin = (postId: string, commentId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments.map((comment) =>
                comment.id === commentId
                  ? { ...comment, pinned: !comment.pinned }
                  : comment
              ),
            }
          : post
      )
    );
    setLastEvent("Pinned-reply state updated.");
  };

  const saveAction = () => {
    if (!actionEditor?.title.trim()) {
      return;
    }
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== actionEditor.postId) {
          return post;
        }
        const item: ActionItem = {
          assigneeId: actionEditor.assigneeId,
          description: actionEditor.description,
          dueDate: actionEditor.dueDate,
          id: actionEditor.id,
          identifier: actionEditor.identifier,
          labels: actionEditor.labels,
          priority: actionEditor.priority,
          status: actionEditor.status,
          title: actionEditor.title.trim(),
        };
        return {
          ...post,
          actionItems: actionEditor.isNew
            ? [...post.actionItems, item]
            : post.actionItems.map((actionItem) =>
                actionItem.id === item.id ? item : actionItem
              ),
        };
      })
    );
    setLastEvent(
      actionEditor.isNew
        ? `${actionEditor.identifier} created with inherited post visibility.`
        : `${actionEditor.identifier} updated.`
    );
    setActionEditor(null);
  };

  const updateActionStatus = (
    postId: string,
    actionId: string,
    status: ActionStatus
  ) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              actionItems: post.actionItems.map((actionItem) =>
                actionItem.id === actionId
                  ? { ...actionItem, status }
                  : actionItem
              ),
            }
          : post
      )
    );
    setLastEvent(`Action moved to ${statusLabel(status)}.`);
  };

  const openNewAction = (postId: string) => {
    const sequence =
      posts.reduce((count, post) => count + post.actionItems.length, 0) + 207;
    setActionEditor({
      assigneeId: viewerId,
      description: "",
      dueDate: "2026-07-31",
      id: `action-${Date.now()}`,
      identifier: `DF-${sequence}`,
      isNew: true,
      labels: [],
      postId,
      priority: "medium",
      status: "todo",
      title: "",
    });
  };

  const openExistingAction = (postId: string, actionItem: ActionItem) => {
    setActionEditor({ ...actionItem, isNew: false, postId });
  };

  const openReference = (reference: CollaborationTagReference) => {
    if (reference.kind === "participant") {
      setLastEvent(
        `${reference.label} is a ${reference.eyebrow} on this Build.`
      );
      return;
    }
    if (reference.kind === "action_item") {
      const owningPost = posts.find((post) =>
        post.actionItems.some((actionItem) => actionItem.id === reference.id)
      );
      const actionItem = owningPost?.actionItems.find(
        (candidate) => candidate.id === reference.id
      );
      if (owningPost && actionItem) {
        openExistingAction(owningPost.id, actionItem);
      }
      return;
    }
    const entity = entityById(reference.id);
    if (entity.kind === "milestone" || entity.kind === "submilestone") {
      setFocusedMilestone(toMilestoneSheetData(entity));
      return;
    }
    setFocusedEntity(entity);
  };

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <FeedToolbar
            feedFilter={feedFilter}
            lastEvent={lastEvent}
            onFilterChange={setFeedFilter}
            onSearchChange={setSearchQuery}
            searchQuery={searchQuery}
            visibleCount={visiblePosts.length}
          />

          <Composer
            attachedEntityIds={composerAttachedEntityIds}
            audienceId={composerAudience}
            body={composerBody}
            customAudienceIds={customAudienceIds}
            effectiveRecipients={entityConstrainedRecipients}
            entityIds={composerEntityIds}
            excludedMentionIds={excludedMentions}
            expanded={composerExpanded}
            mentionIds={composerMentionIds}
            onAudienceChange={setComposerAudience}
            onBodyChange={(value, references) => {
              setComposerBody(value);
              setComposerMentionIds(
                references
                  .filter((reference) => reference.kind === "participant")
                  .map((reference) => reference.id as ParticipantId)
              );
              setComposerTaggedEntityIds(
                references
                  .filter(
                    (reference) =>
                      reference.kind !== "participant" &&
                      reference.kind !== "action_item"
                  )
                  .map((reference) => reference.id)
              );
              setComposerTaggedActionItemIds(
                references
                  .filter((reference) => reference.kind === "action_item")
                  .map((reference) => reference.id)
              );
              setComposerExpanded(true);
            }}
            onCancel={() => {
              setComposerExpanded(false);
              setPickerMode(null);
            }}
            onCustomAudienceChange={setCustomAudienceIds}
            onEntityToggle={(entityId) =>
              setComposerAttachedEntityIds((current) =>
                toggleInList(current, entityId)
              )
            }
            onExpand={() => setComposerExpanded(true)}
            onPickerModeChange={setPickerMode}
            onPost={createPost}
            pickerMode={pickerMode}
            tagOptions={tagOptions}
            viewer={viewer}
          />

          <div className="flex flex-col gap-4">
            {visiblePosts.length === 0 ? (
              <EmptyFeed
                onClear={() => {
                  setFeedFilter("all");
                  setSearchQuery("");
                }}
              />
            ) : (
              visiblePosts.map((post) =>
                canParticipantViewPost(viewerId, post) ? (
                  <InteractivePost
                    actionView={actionViews[post.id] ?? "list"}
                    commentDraft={commentDrafts[post.id] ?? ""}
                    commentMentionIds={commentMentionDrafts[post.id] ?? []}
                    draggedAction={draggedAction}
                    key={post.id}
                    onActionDrag={setDraggedAction}
                    onActionDrop={(status) => {
                      if (draggedAction?.postId === post.id) {
                        updateActionStatus(
                          post.id,
                          draggedAction.actionId,
                          status
                        );
                      }
                      setDraggedAction(null);
                    }}
                    onActionOpen={(actionItem) =>
                      openExistingAction(post.id, actionItem)
                    }
                    onActionStatusChange={(actionId, status) =>
                      updateActionStatus(post.id, actionId, status)
                    }
                    onActionViewChange={(view) =>
                      setActionViews((current) => ({
                        ...current,
                        [post.id]: view,
                      }))
                    }
                    onAddAction={() => openNewAction(post.id)}
                    onCommentChange={(body) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: body,
                      }))
                    }
                    onCommentMentionsChange={(mentionIds) =>
                      setCommentMentionDrafts((current) => ({
                        ...current,
                        [post.id]: mentionIds,
                      }))
                    }
                    onCommentPin={(commentId) =>
                      toggleCommentPin(post.id, commentId)
                    }
                    onCommentSubmit={() => addComment(post.id)}
                    onFollow={() => toggleFollow(post.id)}
                    onPin={() => togglePostPin(post.id)}
                    onReferenceOpen={openReference}
                    onReply={(commentId) =>
                      setReplyTargets((current) => ({
                        ...current,
                        [post.id]: commentId,
                      }))
                    }
                    onReplyCancel={() =>
                      setReplyTargets((current) => ({
                        ...current,
                        [post.id]: null,
                      }))
                    }
                    onTabChange={(tab) =>
                      setPostTabs((current) => ({
                        ...current,
                        [post.id]: tab,
                      }))
                    }
                    post={post}
                    replyTargetId={replyTargets[post.id] ?? null}
                    tab={postTabs[post.id] ?? "discussion"}
                    tagOptions={tagOptions.filter((option) =>
                      canReferenceBeUsedInPost(option, post, posts)
                    )}
                    viewerId={viewerId}
                  />
                ) : (
                  <RestrictedPostPlaceholder key={post.id} />
                )
              )
            )}
          </div>
        </section>

        <DailyRail
          myOpenActions={myOpenActions}
          onActionOpen={(postId, actionItem) =>
            openExistingAction(postId, actionItem)
          }
          onPinnedPostOpen={(postId) =>
            document
              .getElementById(`prototype-${postId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          onViewerChange={(participantId) => {
            setViewerId(participantId);
            setLastEvent(
              `Viewing the same Build as ${participantById(participantId).name}.`
            );
          }}
          pinnedPosts={pinnedVisiblePosts}
          viewer={viewer}
        />
      </div>

      <ActionItemSheet
        editor={actionEditor}
        onChange={setActionEditor}
        onClose={() => setActionEditor(null)}
        onSave={saveAction}
        parentAudience={
          actionEditor
            ? audienceLabel(
                posts.find((post) => post.id === actionEditor.postId)
                  ?.audienceId ?? "all"
              )
            : ""
        }
        tagOptions={
          actionEditor
            ? tagOptions.filter((option) => {
                const parentPost = posts.find(
                  (post) => post.id === actionEditor.postId
                );
                return parentPost
                  ? canReferenceBeUsedInPost(option, parentPost, posts)
                  : option.kind === "participant";
              })
            : tagOptions
        }
      />
      <MilestoneDetailSheet
        assignmentsSourceLabel="Prototype Build assignments"
        data={focusedMilestone}
        eventsSourceLabel="Prototype collaboration activity"
        onClose={() => setFocusedMilestone(null)}
      />
      <BuildEntityDetailSheet
        entity={focusedEntity}
        onClose={() => setFocusedEntity(null)}
        onNavigate={(entity) => {
          setLastEvent(`Focused ${entity.target}.`);
          setFocusedEntity(null);
        }}
      />
    </>
  );
}
