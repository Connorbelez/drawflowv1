"use client";
import {
  CalendarClock,
  ChevronDown,
  LockKeyhole,
  Paperclip,
  Pin,
  Send,
  Users,
  WifiOff,
} from "lucide-react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildActionItemDetailSheet,
} from "./BuildActionItemDetailSheet.tsx";
import {
  BuildCollaborationActionItemQueue,
} from "./BuildCollaborationActionItems.tsx";
import { BuildCollaborationNotificationCard } from "./BuildCollaborationNotificationControls.tsx";
import {
  BuildCollaborationReferenceSheet,
} from "./BuildCollaborationReference.tsx";
import {
  BuildCollaborationSearch,
} from "./BuildCollaborationSearch.tsx";
import "./build-collaboration.css";
import {
  CollaborationRichTextEditor,
} from "./CollaborationRichTextEditor.tsx";
import {
  type AudienceMode,
  classifyCollaborationActionItem,
  type CollaborationFeedEntry,
  type FeedFilter,
  formatTimestamp,
  type PostType,
  plainTextFromDocument,
  type ReferenceOption,
} from "./model.ts";
import {
  buildDetailTargetQueueHref,
  minimumScheduledPublicationTimestamp,
  toLocalDateTimeInput,
} from "./build-collaboration-feed-contracts.ts";
import {
  CollaborationPostCard,
} from "./build-collaboration-feed-post-card.tsx";
import { ComposerAttachmentInput } from "./build-collaboration-feed-post-parts.tsx";
import {
  FocusedDiscussionStatus,
  FocusedPostStatus,
  SummaryCard,
} from "./build-collaboration-feed-focus.tsx";
import { BuildCollaborationDraftSurface } from "./build-collaboration-feed-drafts.tsx";

export type BuildCollaborationSurfaceProps = Record<string, any>;

export function BuildCollaborationSurface({
  activeBuildId,
  actionItemFocusedAssetId,
  actionTitle,
  acknowledgementRequired,
  attachmentAssetIds,
  audienceMode,
  buildQueue,
  canCustomizeAudience,
  canPublishAnnouncements,
  closeActionItemSheet,
  collaborationState,
  commentFocusedPostEntry,
  composerAssets,
  composerExtraCount,
  composerExtrasOpen,
  composerFiles,
  composerOpen,
  connectionOnline,
  detailCanGoBack,
  detailCanGoForward,
  discardDraft,
  document,
  displayedResults,
  drawCapabilities,
  drafts,
  editingHumanDraftId,
  entityQueue,
  feed,
  feedEntries,
  filter,
  focusedAssetActionItemId,
  focusedAssetContext,
  focusedAssetId,
  focusedCommentContext,
  focusedCommentId,
  focusedEntityReference,
  focusedPostContext,
  focusedPostId,
  focusedReference,
  focusReference,
  html,
  isOnline,
  latestEditingDraft,
  latestEditingDraftBundle,
  loadDraftIntoComposer,
  loadOfflineDraftIntoComposer,
  openActionItemSheetReference,
  openDetailTarget,
  openSearchResult,
  onDetailGoBack,
  onDetailGoForward,
  onOpenReference,
  organizationId,
  participants,
  personalQueue,
  postType,
  prepareScheduledPublication,
  publishComposerPost,
  publishDraft,
  publishing,
  removeComposerAttachment,
  requestedReaderIds,
  resetComposer,
  reviewingDraftId,
  saveCurrentDraft,
  scheduleDraft,
  schedulingCapabilities,
  setAcknowledgementRequired,
  setActionItemSheetTarget,
  setActionTitle,
  setAudienceMode,
  setComposerExtrasOpen,
  setComposerFiles,
  setComposerOpen,
  setDocument,
  setFilter,
  setHtml,
  setPostType,
  setPublishing,
  setReferences,
  setRequestedReaderIds,
  setReviewingDraftId,
  setScheduledForInput,
  setFocusedReference,
  scheduledForInput,
  tagOptions,
  autosaveStatus,
  draftConflictMessage,
  offlineDraft,
  referenceByKey,
  renderedActionItemSheetTarget,
  viewerRole,
  viewerRoles,
  visibleResults,
}: BuildCollaborationSurfaceProps) {
  return (

    <>
      <aside
        aria-label="My collaboration work"
        className="build-collaboration-rail build-collaboration-personal-rail order-first xl:order-none"
      >
        <BuildCollaborationActionItemQueue
          compactOnNarrow
          emptyLabel="No open work for you across your authorized Builds."
          hasMore={personalQueue.hasMore}
          loading={personalQueue.loading}
          loadingMore={personalQueue.loadingMore}
          onLoadMore={personalQueue.loadMore}
          onOpen={(row) => {
            const target = classifyCollaborationActionItem(row.item).target;
            if (row.buildId === activeBuildId) {
              openDetailTarget(target);
              return;
            }
            window.location.assign(
              buildDetailTargetQueueHref(
                window.location.href,
                row.buildId,
                target
              )
            );
          }}
          rows={personalQueue.rows}
          title="My Action Items"
        />
      </aside>

      <div className="build-collaboration-main space-y-4 p-3 sm:p-4">
        {connectionOnline ? null : (
          <Frame data-testid="build-collaboration-offline-banner">
            <FramePanel
              aria-live="polite"
              className="flex items-start gap-3"
              role="status"
            >
              <WifiOff aria-hidden="true" className="mt-0.5 size-4" />
              <div>
                <p className="font-medium text-sm">Private offline mode</p>
                <p className="text-muted-foreground text-xs">
                  Draft text, camera captures, and staged files stay on this
                  device. Publishing and every shared mutation remain blocked
                  until reconnect.
                </p>
              </div>
            </FramePanel>
          </Frame>
        )}
        {collaborationState === undefined ? (
          <Frame data-testid="build-collaboration-lifecycle-loading">
            <FramePanel aria-live="polite" role="status">
              <p className="font-medium text-sm">
                Loading collaboration access…
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Publishing controls will appear after this Build's lifecycle
                state is verified.
              </p>
            </FramePanel>
          </Frame>
        ) : collaborationState === "open" ? null : (
          <Frame data-testid="build-collaboration-read-only-banner">
            <FramePanel aria-live="polite" role="status">
              <p className="font-medium text-sm">Collaboration is read-only</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {collaborationState === "purged"
                  ? "This Build's collaboration content was purged under its retention policy."
                  : "This Build's collaboration archive is closed. Existing activity remains available, but new shared changes are disabled."}
              </p>
            </FramePanel>
          </Frame>
        )}
        {offlineDraft ? (
          <Frame data-testid="build-collaboration-offline-draft">
            <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  Private device draft from{" "}
                  {formatTimestamp(offlineDraft.capturedAt)}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {offlineDraft.bundle.plainText} · {offlineDraft.files.length}{" "}
                  staged file{offlineDraft.files.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                onClick={loadOfflineDraftIntoComposer}
                size="sm"
                type="button"
                variant="outline"
              >
                {connectionOnline ? "Load and reconcile" : "Continue offline"}
              </Button>
            </FramePanel>
          </Frame>
        ) : null}
        <BuildCollaborationDraftSurface
          activeBuildId={activeBuildId}
          discardDraft={discardDraft}
          drafts={drafts}
          isOnline={isOnline}
          loadDraftIntoComposer={loadDraftIntoComposer}
          organizationId={organizationId}
          publishDraft={publishDraft}
          publishing={publishing}
          reviewingDraftId={reviewingDraftId}
          scheduleDraft={scheduleDraft}
          schedulingCapabilities={schedulingCapabilities}
          setPublishing={setPublishing}
          setReviewingDraftId={setReviewingDraftId}
        />
        <div className="space-y-3">
          <Tabs
            onValueChange={(value) => setFilter(value as FeedFilter)}
            value={filter}
          >
            <TabsList
              aria-label="Feed filters"
              className="max-w-full justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="all">All</TabsTab>
              <TabsTab value="active_operations">Active operations</TabsTab>
              <TabsTab value="actionable">Actionable</TabsTab>
              <TabsTab value="pinned">Pinned</TabsTab>
              <TabsTab value="following">Following</TabsTab>
            </TabsList>
          </Tabs>
          <BuildCollaborationSearch
            buildId={activeBuildId}
            onOpen={openSearchResult}
            organizationId={organizationId}
            participants={participants}
          />
          {collaborationState === "open" || !connectionOnline ? (
            <Frame>
              <FramePanel className="p-0">
                <button
                  aria-label="What should people involved in this Build know?"
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
                    {draftConflictMessage ? (
                      <Card data-testid="build-collaboration-draft-conflict">
                        <CardHeader>
                          <div>
                            <CardTitle>Draft changed elsewhere</CardTitle>
                            <CardDescription>
                              Your unsaved composer is preserved. Compare it
                              with the latest private server revision before
                              retrying.
                            </CardDescription>
                          </div>
                          <Badge variant="destructive">Conflict</Badge>
                        </CardHeader>
                        <CardPanel className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="font-medium text-xs uppercase tracking-wide">
                              Your draft
                            </p>
                            <p className="mt-1 text-sm">
                              {plainTextFromDocument(document) || "No content"}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-xs uppercase tracking-wide">
                              Latest server revision{" "}
                              {latestEditingDraft?.revision}
                            </p>
                            <p className="mt-1 text-sm">
                              {latestEditingDraftBundle?.plainText ??
                                "Latest content unavailable"}
                            </p>
                            {latestEditingDraft ? (
                              <Button
                                className="mt-2"
                                onClick={() =>
                                  loadDraftIntoComposer(latestEditingDraft)
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Use latest revision
                              </Button>
                            ) : null}
                          </div>
                        </CardPanel>
                        <CardPanel className="border-t text-muted-foreground text-xs">
                          {draftConflictMessage}
                        </CardPanel>
                      </Card>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        onValueChange={(value) =>
                          setPostType(value as PostType)
                        }
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
                          {canPublishAnnouncements ? (
                            <SelectItem value="announcement">
                              Announcement
                            </SelectItem>
                          ) : null}
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
                            My role level and above
                          </SelectItem>
                          {canCustomizeAudience ? (
                            <SelectItem value="custom">
                              Custom participants
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    {audienceMode === "custom" ? (
                      <div className="grid gap-2 rounded-lg border bg-muted/15 p-3 sm:grid-cols-2">
                        {participants.map((participant: ReferenceOption) => (
                          <label
                            className="flex items-center gap-2 text-sm"
                            key={participant.id}
                          >
                            <input
                              checked={requestedReaderIds.includes(
                                participant.id
                              )}
                              onChange={(event) =>
                                setRequestedReaderIds((current: string[]) =>
                                  event.target.checked
                                    ? [...new Set([...current, participant.id])]
                                    : current.filter(
                                        (id: string) => id !== participant.id
                                      )
                                )
                              }
                              type="checkbox"
                            />
                            <span>{participant.label}</span>
                          </label>
                        ))}
                        <p className="col-span-full text-muted-foreground text-xs">
                          Participants at your role level and above remain
                          mandatory readers. Referenced work may narrow the
                          final audience.
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
                      onDocumentChange={(nextDocument) =>
                        setDocument(nextDocument)
                      }
                      placeholder="Write an update. Type @ to link people, milestones, evidence, site visits, documents, materials, draws, or Action Items."
                      tagOptions={tagOptions}
                      value={html}
                    />
                    {autosaveStatus === "idle" ? null : (
                      <p
                        aria-live="polite"
                        className={cn(
                          "text-xs",
                          autosaveStatus === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                        role="status"
                      >
                        {autosaveStatus === "saving"
                          ? "Saving private draft…"
                          : autosaveStatus === "saved"
                            ? "Private draft autosaved. Publishing still requires you."
                            : "Autosave could not finish. Keep this composer open and retry Save draft."}
                      </p>
                    )}
                    <Collapsible
                      onOpenChange={setComposerExtrasOpen}
                      open={composerExtrasOpen}
                    >
                      <CollapsibleTrigger
                        render={
                          <Button
                            aria-label="Add attachments, scheduling, an Action Item, or acknowledgement"
                            className="w-full justify-between"
                            type="button"
                            variant="outline"
                          />
                        }
                      >
                        <span className="flex items-center gap-2">
                          <Paperclip aria-hidden="true" className="size-4" />
                          Add to update
                          {composerExtraCount > 0 ? (
                            <Badge variant="secondary">
                              {composerExtraCount} selected
                            </Badge>
                          ) : null}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "size-4 transition-transform",
                            composerExtrasOpen && "rotate-180"
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-3 pt-3">
                          {schedulingCapabilities?.canSchedule &&
                          (postType === "update" ||
                            postType === "announcement") ? (
                            <label
                              className="grid gap-1 text-sm sm:max-w-sm"
                              htmlFor="build-collaboration-scheduled-for"
                            >
                              <span className="font-medium">
                                Optional publish time
                              </span>
                              <Input
                                aria-label="Scheduled publication time"
                                id="build-collaboration-scheduled-for"
                                min={toLocalDateTimeInput(
                                  minimumScheduledPublicationTimestamp(
                                    Date.now()
                                  )
                                )}
                                onChange={(event) =>
                                  setScheduledForInput(event.target.value)
                                }
                                type="datetime-local"
                                value={scheduledForInput}
                              />
                              <span className="text-muted-foreground text-xs">
                                The exact final bundle still requires your
                                approval.
                              </span>
                            </label>
                          ) : null}
                          <ComposerAttachmentInput
                            assets={composerAssets}
                            buildId={activeBuildId}
                            existingCount={attachmentAssetIds.length}
                            files={composerFiles}
                            onFilesChange={setComposerFiles}
                            onRemove={removeComposerAttachment}
                            organizationId={organizationId}
                            savingDraft={Boolean(editingHumanDraftId)}
                          />
                          <div>
                            <label
                              className="sr-only"
                              htmlFor="build-collaboration-action-title"
                            >
                              Optional Action Item title
                            </label>
                            <Input
                              id="build-collaboration-action-title"
                              onChange={(event) =>
                                setActionTitle(event.target.value)
                              }
                              placeholder="Optional Action Item to publish with this post"
                              value={actionTitle}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                checked={acknowledgementRequired}
                                onChange={(event) =>
                                  setAcknowledgementRequired(
                                    event.target.checked
                                  )
                                }
                                type="checkbox"
                              />
                              Require acknowledgement from eligible participants
                              at or below my role level
                            </label>
                            <p className="pl-6 text-muted-foreground text-xs">
                              Acknowledgement confirms review; it is not an
                              approval.
                            </p>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <Button
                        className="w-full sm:w-auto"
                        onClick={resetComposer}
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        disabled={publishing}
                        onClick={saveCurrentDraft}
                        type="button"
                        variant="outline"
                      >
                        {isOnline ? "Save draft" : "Save privately on device"}
                      </Button>
                      {scheduledForInput &&
                      schedulingCapabilities?.canSchedule &&
                      (postType === "update" || postType === "announcement") ? (
                        <Button
                          className="col-span-2 w-full sm:w-auto"
                          disabled={publishing || !isOnline}
                          onClick={prepareScheduledPublication}
                          type="button"
                          variant="outline"
                        >
                          <CalendarClock
                            aria-hidden="true"
                            className="size-4"
                          />
                          Review & schedule
                        </Button>
                      ) : null}
                      <Button
                        className="col-span-2 w-full sm:w-auto"
                        disabled={publishing || !isOnline}
                        onClick={publishComposerPost}
                        type="button"
                      >
                        <Send aria-hidden="true" className="size-4" />
                        Publish
                      </Button>
                    </div>
                  </div>
                ) : null}
              </FramePanel>
            </Frame>
          ) : null}
        </div>

        {feed.status === "LoadingFirstPage" ? (
          <Frame>
            <FramePanel className="animate-pulse text-muted-foreground text-sm">
              Loading Build collaboration…
            </FramePanel>
          </Frame>
        ) : null}
        <FocusedDiscussionStatus
          focused={Boolean(focusedCommentId)}
          postHydrated={Boolean(commentFocusedPostEntry)}
          state={focusedCommentContext?.state}
        />
        <FocusedPostStatus
          focused={Boolean(focusedPostId)}
          state={focusedPostContext?.state}
        />
        {displayedResults.map((entry: CollaborationFeedEntry) =>
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
              drawCapabilities={drawCapabilities}
              entry={entry}
              focusedAssetId={
                focusedAssetContext?.state === "visible" &&
                focusedAssetContext.postId === entry.post._id
                  ? focusedAssetContext.assetId
                  : undefined
              }
              focusedCommentId={
                focusedCommentContext?.state === "visible" &&
                focusedCommentContext.postId === entry.post._id
                  ? focusedCommentContext.focusCommentId
                  : undefined
              }
              focusedPost={entry.post._id === focusedPostId}
              focusedReference={focusedEntityReference}
              key={entry.post._id}
              mutationsAllowed={isOnline}
              onCreateActionItem={(postId) =>
                setActionItemSheetTarget({ kind: "create", postId })
              }
              onFocusReference={focusReference}
              onOpenActionItem={openDetailTarget}
              organizationId={organizationId}
              referenceByKey={referenceByKey}
              tagOptions={tagOptions}
              viewerRole={viewerRole}
              viewerRoles={viewerRoles}
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

      <aside
        aria-label="Build collaboration context"
        className="build-collaboration-context-rail build-collaboration-rail"
      >
        <SummaryCard
          description="Important threads for this Build"
          icon={<Pin aria-hidden="true" className="size-4" />}
          title="Pinned"
          value={String(
            feedEntries.filter(
              (entry: CollaborationFeedEntry) =>
                entry.kind === "post" && entry.pins.length > 0
            ).length
          )}
        />
        <BuildCollaborationActionItemQueue
          emptyLabel="No open Action Items on this Build."
          hasMore={buildQueue.hasMore}
          loading={buildQueue.loading}
          loadingMore={buildQueue.loadingMore}
          onLoadMore={buildQueue.loadMore}
          onOpen={(row) =>
            openDetailTarget(classifyCollaborationActionItem(row.item).target)
          }
          rows={buildQueue.rows}
          title="Build Action Items"
        />
        <SummaryCard
          description="Authorized people and organizations"
          icon={<Users aria-hidden="true" className="size-4" />}
          title="Participants"
          value={String(participants.length)}
        />
        <BuildCollaborationNotificationCard
          activeBuildId={activeBuildId}
          organizationId={organizationId}
        />
      </aside>

      <BuildActionItemDetailSheet
        buildId={activeBuildId}
        canGoBack={detailCanGoBack}
        canGoForward={detailCanGoForward}
        focusedAssetId={actionItemFocusedAssetId({
          actionItemId: focusedAssetActionItemId,
          assetId: focusedAssetId as Id<"buildCollaborationAssets"> | undefined,
          target: renderedActionItemSheetTarget,
        })}
        onGoBack={onDetailGoBack}
        onGoForward={onDetailGoForward}
        onOpenCanonicalTarget={openDetailTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeActionItemSheet();
          }
        }}
        onReferenceOpen={openActionItemSheetReference}
        open={Boolean(renderedActionItemSheetTarget)}
        organizationId={organizationId}
        readOnly={!isOnline}
        tagOptions={tagOptions}
        target={renderedActionItemSheetTarget}
      />
      <BuildCollaborationReferenceSheet
        actionItems={entityQueue.rows}
        actionItemsHasMore={entityQueue.hasMore}
        actionItemsLoading={entityQueue.loading}
        actionItemsLoadingMore={entityQueue.loadingMore}
        focusedWorkspace={
          Boolean(focusedReference) &&
          focusedReference?.entityKind === "participant" &&
          focusedEntityReference ===
            `${focusedReference?.entityKind}:${focusedReference?.id}`
        }
        onLoadMoreActionItems={entityQueue.loadMore}
        onOpenActionItem={(row) => {
          setFocusedReference(null);
          openDetailTarget(classifyCollaborationActionItem(row.item).target);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setFocusedReference(null);
          }
        }}
        onOpenWorkspace={() => {
          if (!focusedReference) {
            return;
          }
          const reference = focusedReference;
          if (reference.entityKind !== "participant") {
            setFocusedReference(null);
          }
          if (onOpenReference) {
            onOpenReference({
              entityId: reference.id,
              entityKind: reference.entityKind,
              href: reference.href,
            });
          } else {
            window.location.assign(reference.href);
          }
        }}
        reference={focusedReference}
      />
    </>
  );
}
