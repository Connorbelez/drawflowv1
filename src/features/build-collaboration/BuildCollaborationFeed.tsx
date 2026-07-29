"use client";

import type { JSONContent } from "@tiptap/react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Bell,
  CircleDot,
  Flag,
  List,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Search,
  Send,
  SquareKanban,
  Users,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
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
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
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
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagKind,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "../backoffice-build-detail/prototype/CollaborationRichTextEditor.tsx";

type AudienceMode = "author_tier_and_higher" | "build_wide" | "custom";
type FeedFilter = "actionable" | "all" | "following" | "pinned";
type PostType = "announcement" | "decision" | "issue" | "question" | "update";
type ActionStatus =
  | "blocked"
  | "cancelled"
  | "done"
  | "in_progress"
  | "in_review"
  | "todo";

interface ReferenceOption extends CollaborationTagOption {
  entityKind: string;
  href: string;
}

interface FocusedReference extends ReferenceOption {}

interface CollaborationActionItem {
  _id: Id<"buildActionItems">;
  currentRevision: number;
  priority: string;
  status: ActionStatus;
  title: string;
}

interface CollaborationFeedReference {
  entityId: string;
  entityKind: string;
  labelSnapshot: string;
  summarySnapshot?: string;
}

interface CollaborationFeedPostEntry {
  acknowledgement: {
    acknowledged: boolean;
    dueAt?: number;
    required: boolean;
  };
  actionItems: CollaborationActionItem[];
  following: boolean;
  kind: "post";
  pins: unknown[];
  post: {
    _id: Id<"buildCollaborationPosts">;
    audienceMode: AudienceMode;
    authorDisplayNameSnapshot: string;
    authorRole?: string;
    commentCount: number;
    createdAt: number;
    postType: PostType;
  };
  reactions: unknown[];
  receipts: Array<{ lastViewedAt: number }>;
  references: CollaborationFeedReference[];
  revision: { plainText: string; tiptapJson: string };
}

interface CollaborationFeedPlaceholder {
  kind: "restricted" | "unavailable";
  placeholderKey: string;
}

type CollaborationFeedEntry =
  | CollaborationFeedPlaceholder
  | CollaborationFeedPostEntry;

interface CollaborationCommentRow {
  comment: {
    _id: Id<"buildCollaborationComments">;
    authorDisplayNameSnapshot: string;
    createdAt: number;
    logicalDepth: number;
  };
  revision?: { tiptapJson: string } | null;
}

interface RawCollaborationTagOption {
  entityId: string;
  entityKind: string;
  eyebrow: string;
  href: string;
  label: string;
  searchTerms: string[];
  summary: string;
}

interface CollaborationDraftSummary {
  _id: Id<"buildCollaborationDrafts">;
  bundleJson: string;
  preparedByAgent?: boolean;
  revision: number;
  updatedAt: number;
}

interface CollaborationDraftBundle {
  acknowledgementRequired?: boolean;
  actionItems: Array<{ title: string }>;
  audienceMode: AudienceMode;
  plainText: string;
  postType: PostType;
  references: Array<{
    entityId: string;
    entityKind: string;
    label: string;
    summary?: string;
  }>;
  requestedReaderIds: string[];
  tiptapJson: string;
}

const WHITESPACE_PATTERN = /\s+/;

export function BuildCollaborationFeed({
  buildId,
  organizationId,
  onOpenReference,
}: {
  buildId: string;
  organizationId?: string;
  onOpenReference?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
}) {
  const activeBuildId = buildId as Id<"activeBuilds">;
  const feed = usePaginatedQuery(
    api.build_collaboration.listBuildCollaborationFeed,
    organizationId ? { buildId: activeBuildId, organizationId } : "skip",
    { initialNumItems: 20 }
  );
  const rawTagOptions = useQuery(
    api.build_collaboration_references.listBuildCollaborationTagOptions,
    organizationId ? { buildId: activeBuildId, organizationId } : "skip"
  );
  const notificationPreferences = useQuery(
    api.build_collaboration_notifications
      .getMyBuildCollaborationNotificationPreferences,
    organizationId ? { buildId: activeBuildId, organizationId } : "skip"
  );
  const drafts = useQuery(
    api.build_collaboration_drafts.listMyBuildCollaborationDrafts,
    organizationId ? { buildId: activeBuildId, organizationId } : "skip"
  ) as CollaborationDraftSummary[] | undefined;
  const publish = useMutation(
    api.build_collaboration.approveAndPublishBuildCollaborationBundle
  );
  const saveDraft = useMutation(
    api.build_collaboration_drafts.saveMyBuildCollaborationDraft
  );
  const publishDraft = useMutation(
    api.build_collaboration_drafts.approveAndPublishBuildCollaborationDraft
  );
  const discardDraft = useMutation(
    api.build_collaboration_drafts.discardMyBuildCollaborationDraft
  );
  const updateNotificationPreferences = useMutation(
    api.build_collaboration_notifications
      .updateMyBuildCollaborationNotificationPreferences
  );
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("update");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("build_wide");
  const [requestedReaderIds, setRequestedReaderIds] = useState<string[]>([]);
  const [html, setHtml] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [actionTitle, setActionTitle] = useState("");
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [focusedReference, setFocusedReference] =
    useState<FocusedReference | null>(null);

  const tagOptions = useMemo<ReferenceOption[]>(
    () => (rawTagOptions ?? []).map(toCollaborationTagOption),
    [rawTagOptions]
  );
  const referenceByKey = useMemo<Map<string, ReferenceOption>>(
    () =>
      new Map(
        tagOptions.map((option) => [`${option.kind}:${option.id}`, option])
      ),
    [tagOptions]
  );
  const participants = tagOptions.filter(
    (option) => option.kind === "participant"
  );
  const feedEntries = useMemo(
    () => feed.results as CollaborationFeedEntry[],
    [feed.results]
  );
  const visibleResults = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return feedEntries.filter((entry) => {
      if (entry.kind !== "post") {
        return filter === "all" && !normalizedSearch;
      }
      const matchesSearch =
        !normalizedSearch ||
        [
          entry.revision.plainText,
          entry.post.authorDisplayNameSnapshot,
          ...entry.references.map((reference) => reference.labelSnapshot),
          ...entry.actionItems.map((actionItem) => actionItem.title),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      if (!matchesSearch) {
        return false;
      }
      if (filter === "pinned") {
        return entry.pins.length > 0;
      }
      if (filter === "following") {
        return entry.following;
      }
      if (filter === "actionable") {
        return entry.actionItems.some(
          (item) => item.status !== "done" && item.status !== "cancelled"
        );
      }
      return true;
    });
  }, [feedEntries, filter, search]);

  const resetComposer = () => {
    setHtml("");
    setDocument(emptyDocument());
    setReferences([]);
    setActionTitle("");
    setAcknowledgementRequired(false);
    setRequestedReaderIds([]);
    setPostType("update");
    setAudienceMode("build_wide");
    setComposerOpen(false);
  };

  const publishBundle = async () => {
    if (!organizationId || publishing) {
      return;
    }
    const plainText = plainTextFromDocument(document);
    if (!plainText) {
      toast.error("Write an update before publishing.");
      return;
    }
    setPublishing(true);
    try {
      await publish({
        acknowledgementRequired,
        actionItems: composerActionItems(actionTitle),
        audienceMode,
        buildId: activeBuildId,
        organizationId,
        plainText,
        postType,
        references: references.map((reference, index) => ({
          entityId: reference.id,
          entityKind:
            referenceByKey.get(`${reference.kind}:${reference.id}`)
              ?.entityKind ?? toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary:
            index ===
            references.findIndex(
              (candidate) => candidate.kind !== "participant"
            ),
          summary: reference.summary,
        })),
        requestedReaderIds: audienceMode === "custom" ? requestedReaderIds : [],
        tiptapJson: JSON.stringify(document),
      });
      toast.success("Update published.");
      resetComposer();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to publish update."
      );
    } finally {
      setPublishing(false);
    }
  };

  const saveCurrentDraft = async () => {
    if (!organizationId) {
      return;
    }
    const plainText = plainTextFromDocument(document);
    if (!plainText) {
      toast.error("Write an update before saving the draft.");
      return;
    }
    try {
      await saveDraft({
        acknowledgementRequired,
        actionItems: composerActionItems(actionTitle),
        audienceMode,
        buildId: activeBuildId,
        organizationId,
        plainText,
        postType,
        preparedByAgent: false,
        references: references.map((reference, index) => ({
          entityId: reference.id,
          entityKind:
            referenceByKey.get(`${reference.kind}:${reference.id}`)
              ?.entityKind ?? toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary:
            index ===
            references.findIndex(
              (candidate) => candidate.kind !== "participant"
            ),
          summary: reference.summary,
        })),
        requestedReaderIds: audienceMode === "custom" ? requestedReaderIds : [],
        tiptapJson: JSON.stringify(document),
      });
      toast.success("Draft saved.");
      resetComposer();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save draft."
      );
    }
  };

  const loadDraftIntoComposer = (draft: CollaborationDraftSummary) => {
    const bundle = parseDraftBundle(draft.bundleJson);
    if (!bundle) {
      toast.error("This draft is invalid and cannot be opened.");
      return;
    }
    setAcknowledgementRequired(bundle.acknowledgementRequired ?? false);
    setActionTitle(bundle.actionItems[0]?.title ?? "");
    setAudienceMode(bundle.audienceMode);
    setDocument(parseDocument(bundle.tiptapJson));
    setHtml(`<p>${escapeHtml(bundle.plainText)}</p>`);
    setPostType(bundle.postType);
    setReferences(
      bundle.references.map((reference) => ({
        id: reference.entityId,
        kind: toEditorReferenceKind(reference.entityKind),
        label: reference.label,
        summary: reference.summary ?? "",
      }))
    );
    setRequestedReaderIds(bundle.requestedReaderIds);
    setComposerOpen(true);
  };

  if (!organizationId) {
    return (
      <Frame data-testid="build-collaboration-unavailable">
        <FramePanel>
          <p className="font-medium text-sm">Collaboration unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            The Build must be associated with its originating organization.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <section
      aria-label="Build collaboration"
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]"
      data-testid="build-collaboration-feed"
    >
      <div className="min-w-0 space-y-4">
        {drafts && drafts.length > 0 ? (
          <Frame data-testid="build-collaboration-drafts">
            <FramePanel className="space-y-3">
              <div>
                <p className="font-medium text-sm">Drafts awaiting you</p>
                <p className="text-muted-foreground text-xs">
                  Publication is always a human-in-the-loop action and you
                  remain the author.
                </p>
              </div>
              <div className="space-y-2">
                {drafts.map((draft) => {
                  const bundle = parseDraftBundle(draft.bundleJson);
                  return (
                    <Card key={draft._id}>
                      <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-sm">
                              {bundle?.plainText ?? "Invalid draft"}
                            </p>
                            {draft.preparedByAgent ? (
                              <Badge variant="outline">Agent prepared</Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Revision {draft.revision} · saved{" "}
                            {formatTimestamp(draft.updatedAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => loadDraftIntoComposer(draft)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Review
                          </Button>
                          <Button
                            onClick={async () => {
                              try {
                                await publishDraft({
                                  buildId: activeBuildId,
                                  draftId: draft._id,
                                  organizationId,
                                });
                                toast.success(
                                  "Draft approved and published under your name."
                                );
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to publish draft."
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                          >
                            Approve & publish
                          </Button>
                          <Button
                            onClick={async () => {
                              try {
                                await discardDraft({
                                  buildId: activeBuildId,
                                  draftId: draft._id,
                                  organizationId,
                                });
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to discard draft."
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Discard
                          </Button>
                        </div>
                      </CardPanel>
                    </Card>
                  );
                })}
              </div>
            </FramePanel>
          </Frame>
        ) : null}
        <Frame>
          <FramePanel className="p-0">
            <button
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
              onClick={() => setComposerOpen(true)}
              type="button"
            >
              <Avatar className="size-9">
                <AvatarFallback>+</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 rounded-full border bg-muted/20 px-4 py-2.5 text-muted-foreground text-sm">
                What should people involved in this Build know?
              </span>
            </button>
            {composerOpen ? (
              <div className="space-y-3 border-t p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    onValueChange={(value) => setPostType(value as PostType)}
                    value={postType}
                  >
                    <SelectTrigger aria-label="Post type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="question">Question</SelectItem>
                      <SelectItem value="decision">Decision</SelectItem>
                      <SelectItem value="issue">Issue / blocker</SelectItem>
                      <SelectItem value="announcement">Announcement</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    onValueChange={(value) =>
                      setAudienceMode(value as AudienceMode)
                    }
                    value={audienceMode}
                  >
                    <SelectTrigger aria-label="Post audience">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="build_wide">
                        Everyone on this Build
                      </SelectItem>
                      <SelectItem value="author_tier_and_higher">
                        My tier and higher
                      </SelectItem>
                      <SelectItem value="custom">
                        Custom participants
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {audienceMode === "custom" ? (
                  <div className="grid gap-2 rounded-lg border bg-muted/15 p-3 sm:grid-cols-2">
                    {participants.map((participant) => (
                      <label
                        className="flex items-center gap-2 text-sm"
                        key={participant.id}
                      >
                        <input
                          checked={requestedReaderIds.includes(participant.id)}
                          onChange={(event) =>
                            setRequestedReaderIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, participant.id])]
                                : current.filter((id) => id !== participant.id)
                            )
                          }
                          type="checkbox"
                        />
                        <span>{participant.label}</span>
                      </label>
                    ))}
                    <p className="col-span-full text-muted-foreground text-xs">
                      Higher and peer roles remain included automatically.
                    </p>
                  </div>
                ) : null}
                <CollaborationRichTextEditor
                  ariaLabel="Build update"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-36"
                  onChange={(nextHtml, nextReferences) => {
                    setHtml(nextHtml);
                    setReferences(nextReferences);
                  }}
                  onDocumentChange={(nextDocument) => setDocument(nextDocument)}
                  placeholder="Write an update. Type @ to link people, milestones, evidence, site visits, documents, materials, draws, or Action Items."
                  tagOptions={tagOptions}
                  value={html}
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    onChange={(event) => setActionTitle(event.target.value)}
                    placeholder="Optional Action Item to publish with this post"
                    value={actionTitle}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={resetComposer}
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={publishing}
                      onClick={saveCurrentDraft}
                      type="button"
                      variant="outline"
                    >
                      Save draft
                    </Button>
                    <Button
                      disabled={publishing}
                      onClick={publishBundle}
                      type="button"
                    >
                      <Send aria-hidden="true" className="size-4" />
                      {publishing ? "Publishing…" : "Publish"}
                    </Button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={acknowledgementRequired}
                    onChange={(event) =>
                      setAcknowledgementRequired(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Require acknowledgement from participants at or below my role
                </label>
              </div>
            ) : null}
          </FramePanel>
        </Frame>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            onValueChange={(value) => setFilter(value as FeedFilter)}
            value={filter}
          >
            <TabsList aria-label="Feed filters" variant="underline">
              <TabsTab value="all">All</TabsTab>
              <TabsTab value="actionable">Actionable</TabsTab>
              <TabsTab value="pinned">Pinned</TabsTab>
              <TabsTab value="following">Following</TabsTab>
            </TabsList>
          </Tabs>
          <div className="relative block min-w-0 sm:w-64">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search loaded collaboration posts"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this Build"
              value={search}
            />
          </div>
        </div>

        {feed.status === "LoadingFirstPage" ? (
          <Frame>
            <FramePanel className="animate-pulse text-muted-foreground text-sm">
              Loading Build collaboration…
            </FramePanel>
          </Frame>
        ) : null}
        {visibleResults.map((entry) =>
          entry.kind === "restricted" ? (
            <Frame key={entry.placeholderKey}>
              <FramePanel className="flex min-h-24 items-center justify-center gap-2 text-muted-foreground text-sm">
                <LockKeyhole aria-hidden="true" className="size-4" />
                Restricted update
              </FramePanel>
            </Frame>
          ) : entry.kind === "post" ? (
            <CollaborationPostCard
              buildId={activeBuildId}
              entry={entry}
              key={entry.post._id}
              onFocusReference={setFocusedReference}
              organizationId={organizationId}
              referenceByKey={referenceByKey}
              tagOptions={tagOptions}
            />
          ) : null
        )}
        {feed.status === "CanLoadMore" ? (
          <Button
            className="w-full"
            onClick={() => feed.loadMore(20)}
            type="button"
            variant="outline"
          >
            Load older activity
          </Button>
        ) : null}
        {feed.status === "Exhausted" && visibleResults.length === 0 ? (
          <Frame>
            <FramePanel className="py-10 text-center text-muted-foreground text-sm">
              No collaboration posts match this view.
            </FramePanel>
          </Frame>
        ) : null}
      </div>

      <aside className="space-y-3">
        <SummaryCard
          description="Important threads for this Build"
          icon={<Pin aria-hidden="true" className="size-4" />}
          title="Pinned"
          value={String(
            feedEntries.filter(
              (entry) => entry.kind === "post" && entry.pins.length > 0
            ).length
          )}
        />
        <SummaryCard
          description="Open work attached to visible posts"
          icon={<Flag aria-hidden="true" className="size-4" />}
          title="Action Items"
          value={String(
            feedEntries.reduce(
              (total, entry) =>
                total +
                (entry.kind === "post"
                  ? entry.actionItems.filter(
                      (item) =>
                        item.status !== "done" && item.status !== "cancelled"
                    ).length
                  : 0),
              0
            )
          )}
        />
        <SummaryCard
          description="Authorized people and organizations"
          icon={<Users aria-hidden="true" className="size-4" />}
          title="Participants"
          value={String(participants.length)}
        />
        <SummaryCard
          description="Immediate and digest delivery controls"
          icon={<Bell aria-hidden="true" className="size-4" />}
          title="Notifications"
          value={notificationPreferences?.ordinaryMuted ? "Muted" : "On"}
        />
        <Button
          className="w-full"
          onClick={async () => {
            try {
              const muted = notificationPreferences?.ordinaryMuted ?? false;
              await updateNotificationPreferences({
                buildId: activeBuildId,
                channels: notificationPreferences?.channels ?? [
                  "in_app",
                  "email",
                ],
                digestCadence:
                  notificationPreferences?.digestCadence ?? "daily",
                digestEnabled: notificationPreferences?.digestEnabled ?? true,
                ordinaryMuted: !muted,
                organizationId,
              });
              toast.success(
                muted
                  ? "Ordinary collaboration notifications enabled."
                  : "Ordinary collaboration notifications muted."
              );
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to update notification preferences."
              );
            }
          }}
          type="button"
          variant="outline"
        >
          {notificationPreferences?.ordinaryMuted
            ? "Enable ordinary notifications"
            : "Mute ordinary notifications"}
        </Button>
      </aside>

      <ReferenceDetailSheet
        onOpenChange={(open) => {
          if (!open) {
            setFocusedReference(null);
          }
        }}
        onOpenWorkspace={() => {
          if (!focusedReference) {
            return;
          }
          if (onOpenReference) {
            onOpenReference({
              entityId: focusedReference.id,
              entityKind: focusedReference.entityKind,
              href: focusedReference.href,
            });
          } else {
            window.location.assign(focusedReference.href);
          }
        }}
        reference={focusedReference}
      />
    </section>
  );
}

function CollaborationPostCard({
  buildId,
  entry,
  onFocusReference,
  organizationId,
  referenceByKey,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
  onFocusReference: (reference: FocusedReference) => void;
  organizationId: string;
  referenceByKey: Map<string, ReferenceOption>;
  tagOptions: ReferenceOption[];
}) {
  const [tab, setTab] = useState<"actions" | "discussion">("discussion");
  const [actionView, setActionView] = useState<"board" | "list">("list");
  const [replyHtml, setReplyHtml] = useState("");
  const [replyDocument, setReplyDocument] = useState<JSONContent>(
    emptyDocument()
  );
  const [replyReferences, setReplyReferences] = useState<
    CollaborationTagReference[]
  >([]);
  const [replyingTo, setReplyingTo] = useState<string | undefined>();
  const comments = useQuery(
    api.build_collaboration_threads.listBuildCollaborationComments,
    tab === "discussion"
      ? { buildId, organizationId, postId: entry.post._id }
      : "skip"
  );
  const addComment = useMutation(
    api.build_collaboration_threads.addBuildCollaborationComment
  );
  const react = useMutation(
    api.build_collaboration_threads.reactToBuildCollaborationPost
  );
  const togglePin = useMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const toggleFollow = useMutation(
    api.build_collaboration_threads.toggleBuildCollaborationFollow
  );
  const markViewed = useMutation(
    api.build_collaboration_threads.markBuildCollaborationPostViewed
  );
  const updateAction = useMutation(
    api.build_action_items.updateBuildActionItem
  );
  const acknowledge = useMutation(
    api.build_collaboration_acknowledgements.acknowledgeBuildCollaborationPost
  );
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    markViewed({
      buildId,
      organizationId,
      postId: entry.post._id,
    }).catch(() => undefined);
  }, [buildId, entry.post._id, markViewed, organizationId]);

  const submitReply = async () => {
    const plainText = plainTextFromDocument(replyDocument);
    if (!plainText || submittingReply) {
      return;
    }
    setSubmittingReply(true);
    try {
      await addComment({
        buildId,
        organizationId,
        parentCommentId: replyingTo as
          | Id<"buildCollaborationComments">
          | undefined,
        plainText,
        postId: entry.post._id,
        references: replyReferences.map((reference, index) => ({
          entityId: reference.id,
          entityKind:
            referenceByKey.get(`${reference.kind}:${reference.id}`)
              ?.entityKind ?? toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        tiptapJson: JSON.stringify(replyDocument),
      });
      setReplyHtml("");
      setReplyDocument(emptyDocument());
      setReplyReferences([]);
      setReplyingTo(undefined);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to publish reply."
      );
    } finally {
      setSubmittingReply(false);
    }
  };

  const openReference = (reference: CollaborationTagReference) => {
    const option = referenceByKey.get(`${reference.kind}:${reference.id}`);
    if (option) {
      onFocusReference(option);
    }
  };

  return (
    <Card data-testid={`collaboration-post-${entry.post._id}`}>
      <CardHeader className="gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-9">
            <AvatarFallback>
              {initials(entry.post.authorDisplayNameSnapshot)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">
              {entry.post.authorDisplayNameSnapshot}
            </CardTitle>
            <CardDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span>{roleLabel(entry.post.authorRole)}</span>
              <span aria-hidden="true">·</span>
              <time>{formatTimestamp(entry.post.createdAt)}</time>
              <Badge variant="outline">
                {postTypeLabel(entry.post.postType)}
              </Badge>
            </CardDescription>
          </div>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Post actions"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      togglePin({
                        buildId,
                        kind: "personal",
                        organizationId,
                        postId: entry.post._id,
                      }).catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to save post."
                        )
                      )
                    }
                  >
                    Save privately
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      togglePin({
                        buildId,
                        kind: "build",
                        organizationId,
                        postId: entry.post._id,
                      }).catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to pin post."
                        )
                      )
                    }
                  >
                    Pin for Build
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      toggleFollow({
                        buildId,
                        organizationId,
                        postId: entry.post._id,
                      }).catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to update follow state."
                        )
                      )
                    }
                  >
                    {entry.following ? "Unfollow thread" : "Follow thread"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </div>
      </CardHeader>
      <CardPanel className="space-y-3 px-4 pb-4">
        <CollaborationRichTextPreview
          ariaLabel="Published Build update"
          className="border-0 bg-transparent [&_.ProseMirror]:px-0"
          onReferenceOpen={openReference}
          tagOptions={tagOptions}
          value={parseDocument(entry.revision.tiptapJson)}
        />
        {entry.references.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.references.map((reference) => {
              const kind = toEditorReferenceKind(reference.entityKind);
              const option = referenceByKey.get(
                `${kind}:${reference.entityId}`
              );
              return (
                <ReferenceChip
                  key={reference._id}
                  onOpen={() => option && onFocusReference(option)}
                  reference={{
                    eyebrow: option?.eyebrow ?? roleLabel(reference.entityKind),
                    label: option?.label ?? reference.labelSnapshot,
                    summary:
                      option?.summary ??
                      reference.summarySnapshot ??
                      "Referenced on this Build",
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </CardPanel>
      <div className="grid grid-cols-2 border-y">
        <button
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 border-r text-sm",
            tab === "discussion" && "bg-primary/5 text-primary"
          )}
          onClick={() => setTab("discussion")}
          type="button"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          Discussion {entry.post.commentCount}
        </button>
        <button
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 text-sm",
            tab === "actions" && "bg-primary/5 text-primary"
          )}
          onClick={() => setTab("actions")}
          type="button"
        >
          <Flag aria-hidden="true" className="size-4" />
          Action Items {entry.actionItems.length}
        </button>
      </div>
      {tab === "discussion" ? (
        <CardPanel className="space-y-3 p-4">
          {((comments ?? []) as CollaborationCommentRow[]).map((row) => (
            <div
              className="flex gap-2"
              key={row.comment._id}
              style={{
                marginLeft: `${Math.min(row.comment.logicalDepth, 3) * 18}px`,
              }}
            >
              <Avatar className="size-7">
                <AvatarFallback>
                  {initials(row.comment.authorDisplayNameSnapshot)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-xl bg-muted/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-xs">
                    {row.comment.authorDisplayNameSnapshot}
                  </span>
                  <time className="text-muted-foreground text-xs">
                    {formatTimestamp(row.comment.createdAt)}
                  </time>
                </div>
                {row.revision ? (
                  <CollaborationRichTextPreview
                    ariaLabel="Collaboration reply"
                    className="mt-1 border-0 bg-transparent [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
                    onReferenceOpen={openReference}
                    tagOptions={tagOptions}
                    value={parseDocument(row.revision.tiptapJson)}
                  />
                ) : null}
                <button
                  className="mt-1 text-muted-foreground text-xs hover:text-foreground"
                  onClick={() => setReplyingTo(row.comment._id)}
                  type="button"
                >
                  Reply
                </button>
              </div>
            </div>
          ))}
          {replyingTo ? (
            <p className="text-muted-foreground text-xs">
              Replying in thread.{" "}
              <button
                className="underline"
                onClick={() => setReplyingTo(undefined)}
                type="button"
              >
                Cancel
              </button>
            </p>
          ) : null}
          <CollaborationRichTextEditor
            ariaLabel="Reply to this Build update"
            editorMinHeightClass="[&_.ProseMirror]:min-h-24"
            onChange={(nextHtml, nextReferences) => {
              setReplyHtml(nextHtml);
              setReplyReferences(nextReferences);
            }}
            onDocumentChange={(nextDocument) => setReplyDocument(nextDocument)}
            placeholder="Write a reply. Type @ to link Build work."
            tagOptions={tagOptions}
            value={replyHtml}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1">
              {(["acknowledged", "agree", "question"] as const).map(
                (reaction) => (
                  <Button
                    key={reaction}
                    onClick={() =>
                      react({
                        buildId,
                        organizationId,
                        postId: entry.post._id,
                        reaction,
                      })
                    }
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {reactionLabel(reaction)}
                  </Button>
                )
              )}
            </div>
            <Button
              disabled={submittingReply}
              onClick={submitReply}
              size="sm"
              type="button"
            >
              <Send aria-hidden="true" className="size-4" />
              Reply
            </Button>
          </div>
        </CardPanel>
      ) : (
        <CardPanel className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Work stays anchored to this post.
            </p>
            <div className="flex gap-1">
              <Button
                aria-pressed={actionView === "list"}
                onClick={() => setActionView("list")}
                size="icon-xs"
                type="button"
                variant={actionView === "list" ? "secondary" : "ghost"}
              >
                <List aria-hidden="true" className="size-4" />
              </Button>
              <Button
                aria-pressed={actionView === "board"}
                onClick={() => setActionView("board")}
                size="icon-xs"
                type="button"
                variant={actionView === "board" ? "secondary" : "ghost"}
              >
                <SquareKanban aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
          <ActionItemsView
            actionView={actionView}
            items={entry.actionItems}
            onMove={async (actionItemId, status, reason, expectedRevision) => {
              try {
                await updateAction({
                  actionItemId,
                  ...(status === "blocked" ? { blockedReason: reason } : {}),
                  buildId,
                  ...(status === "cancelled"
                    ? { cancellationReason: reason }
                    : {}),
                  expectedRevision,
                  organizationId,
                  status,
                });
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Unable to move Action Item."
                );
              }
            }}
          />
        </CardPanel>
      )}
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-muted-foreground text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {entry.receipts.length > 0
              ? `Seen by ${entry.receipts.length} · ${formatTimestamp(
                  Math.max(
                    ...entry.receipts.map((receipt) => receipt.lastViewedAt)
                  )
                )}`
              : "No visible receipts yet"}
          </span>
          {entry.acknowledgement?.required ? (
            entry.acknowledgement.acknowledged ? (
              <Badge variant="secondary">Acknowledged</Badge>
            ) : (
              <Button
                onClick={async () => {
                  try {
                    await acknowledge({
                      buildId,
                      organizationId,
                      postId: entry.post._id,
                    });
                    toast.success("Post acknowledged.");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to acknowledge this post."
                    );
                  }
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Acknowledge
              </Button>
            )
          ) : null}
        </div>
        <span>{audienceLabel(entry.post.audienceMode)}</span>
      </CardFooter>
    </Card>
  );
}

function ActionItemsView({
  actionView,
  items,
  onMove,
}: {
  actionView: "board" | "list";
  items: CollaborationActionItem[];
  onMove: (
    actionItemId: Id<"buildActionItems">,
    status: ActionStatus,
    reason?: string,
    expectedRevision?: number
  ) => Promise<void>;
}) {
  const columns: Array<{ label: string; status: ActionStatus }> = [
    { label: "To do", status: "todo" },
    { label: "In progress", status: "in_progress" },
    { label: "In review", status: "in_review" },
    { label: "Done", status: "done" },
  ];
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-8 text-center text-muted-foreground text-sm">
        No Action Items on this post.
      </div>
    );
  }
  if (actionView === "board") {
    return (
      <div className="grid gap-2 lg:grid-cols-4">
        {columns.map((column) => (
          <div className="rounded-xl bg-muted/30 p-2" key={column.status}>
            <p className="mb-2 font-medium text-xs">{column.label}</p>
            <div className="space-y-2">
              {items
                .filter((item) => item.status === column.status)
                .map((item) => (
                  <ActionItemCard item={item} key={item._id} onMove={onMove} />
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ActionItemCard item={item} key={item._id} onMove={onMove} />
      ))}
    </div>
  );
}

function ActionItemCard({
  item,
  onMove,
}: {
  item: CollaborationActionItem;
  onMove: (
    actionItemId: Id<"buildActionItems">,
    status: ActionStatus,
    reason?: string,
    expectedRevision?: number
  ) => Promise<void>;
}) {
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<
    "blocked" | "cancelled" | null
  >(null);
  const [reason, setReason] = useState("");

  const selectStatus = (status: ActionStatus) => {
    if (status === "blocked" || status === "cancelled") {
      setPendingTerminalStatus(status);
      setReason("");
      return;
    }
    setPendingTerminalStatus(null);
    onMove(item._id, status, undefined, item.currentRevision).catch(
      () => undefined
    );
  };

  const confirmReasonedTransition = () => {
    const normalizedReason = reason.trim();
    if (!(pendingTerminalStatus && normalizedReason)) {
      toast.error(
        pendingTerminalStatus === "cancelled"
          ? "Explain why this Action Item is being cancelled."
          : "Explain what is blocking this Action Item."
      );
      return;
    }
    onMove(
      item._id,
      pendingTerminalStatus,
      normalizedReason,
      item.currentRevision
    ).catch(() => undefined);
    setPendingTerminalStatus(null);
    setReason("");
  };

  return (
    <Card className="rounded-xl">
      <CardPanel className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{item.title}</p>
          <Badge variant="outline">{item.priority}</Badge>
        </div>
        <Select
          onValueChange={(value) => selectStatus(value as ActionStatus)}
          value={item.status}
        >
          <SelectTrigger aria-label={`Status for ${item.title}`} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">To do</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {pendingTerminalStatus ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
            <Input
              aria-label={
                pendingTerminalStatus === "cancelled"
                  ? `Cancellation reason for ${item.title}`
                  : `Blocked reason for ${item.title}`
              }
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                pendingTerminalStatus === "cancelled"
                  ? "Why is this being cancelled?"
                  : "What is blocking this work?"
              }
              value={reason}
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setPendingTerminalStatus(null)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmReasonedTransition}
                size="sm"
                type="button"
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function ReferenceChip({
  onOpen,
  reference,
}: {
  onOpen: () => void;
  reference: { eyebrow: string; label: string; summary: string };
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            className="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/15 px-3 py-2 text-left hover:bg-muted/30"
            onClick={onOpen}
            type="button"
          />
        }
      >
        <CircleDot
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
        <span className="min-w-0">
          <span className="block truncate font-medium text-xs">
            {reference.label}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {reference.summary}
          </span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <p className="font-medium text-primary text-xs uppercase tracking-wide">
          {reference.eyebrow}
        </p>
        <p className="mt-2 font-semibold text-sm">{reference.label}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {reference.summary}
        </p>
        <p className="mt-3 text-muted-foreground text-xs">
          Click to open the focused Build detail.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function ReferenceDetailSheet({
  onOpenChange,
  onOpenWorkspace,
  reference,
}: {
  onOpenChange: (open: boolean) => void;
  onOpenWorkspace: () => void;
  reference: FocusedReference | null;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(reference)}>
      <SheetPopup>
        <SheetHeader>
          <SheetTitle>{reference?.label ?? "Build reference"}</SheetTitle>
          <SheetDescription>
            {reference?.eyebrow ?? "Referenced Build work"}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-4">
          <Frame>
            <FramePanel>
              <p className="text-muted-foreground text-sm">
                {reference?.summary}
              </p>
            </FramePanel>
          </Frame>
          <Button className="w-full" onClick={onOpenWorkspace} type="button">
            Open focused workspace
          </Button>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function SummaryCard({
  description,
  icon,
  title,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 p-4">
        <span className="text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {description}
          </CardDescription>
        </div>
        <Badge variant="secondary">{value}</Badge>
      </CardHeader>
    </Card>
  );
}

function toCollaborationTagOption(
  option: RawCollaborationTagOption
): ReferenceOption {
  return {
    entityKind: option.entityKind,
    eyebrow: option.eyebrow,
    href: option.href,
    id: String(option.entityId),
    kind: toEditorReferenceKind(option.entityKind),
    label: option.label,
    searchTerms: option.searchTerms,
    summary: option.summary,
  };
}

function toEditorReferenceKind(kind: string): CollaborationTagKind {
  switch (kind) {
    case "actionItem":
      return "action_item";
    case "evidenceAsset":
    case "evidencePackage":
      return "evidence";
    case "siteVisit":
      return "site_visit";
    default:
      return kind as CollaborationTagKind;
  }
}

function toBackendReferenceKind(kind: CollaborationTagKind) {
  switch (kind) {
    case "action_item":
      return "actionItem" as const;
    case "evidence":
      return "evidencePackage" as const;
    case "site_visit":
      return "siteVisit" as const;
    default:
      return kind;
  }
}

function emptyDocument(): JSONContent {
  return { content: [{ type: "paragraph" }], type: "doc" };
}

function composerActionItems(actionTitle: string) {
  const title = actionTitle.trim();
  return title
    ? [
        {
          descriptionPlainText: "",
          descriptionTiptapJson: JSON.stringify(emptyDocument()),
          priority: "none" as const,
          requiresAcceptance: false,
          title,
        },
      ]
    : [];
}

function parseDraftBundle(value: string): CollaborationDraftBundle | null {
  try {
    return JSON.parse(value) as CollaborationDraftBundle;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDocument(value: string): JSONContent {
  try {
    return JSON.parse(value) as JSONContent;
  } catch {
    return emptyDocument();
  }
}

function plainTextFromDocument(document: JSONContent) {
  const parts: string[] = [];
  const visit = (node: JSONContent) => {
    if (typeof node.text === "string") {
      parts.push(node.text);
    } else if (
      node.type === "collaborationMention" &&
      typeof node.attrs?.label === "string"
    ) {
      parts.push(`@${node.attrs.label}`);
    }
    for (const child of node.content ?? []) {
      visit(child);
    }
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "listItem"
    ) {
      parts.push("\n");
    }
  };
  visit(document);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function initials(name: string) {
  return name
    .split(WHITESPACE_PATTERN)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function roleLabel(role?: string) {
  if (!role) {
    return "Build participant";
  }
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function postTypeLabel(type: string) {
  return type === "issue" ? "Issue / blocker" : roleLabel(type);
}

function reactionLabel(reaction: "acknowledged" | "agree" | "question") {
  switch (reaction) {
    case "acknowledged":
      return "Acknowledge";
    case "agree":
      return "Agree";
    case "question":
      return "Question";
  }
}

function audienceLabel(mode: AudienceMode) {
  switch (mode) {
    case "build_wide":
      return "Everyone on this Build";
    case "author_tier_and_higher":
      return "Author tier and higher";
    case "custom":
      return "Custom audience";
  }
}
