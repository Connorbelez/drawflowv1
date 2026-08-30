"use client";
import {
  Banknote,
  ChevronDown,
  Flag,
  MoreHorizontal,
  Paperclip,
  Pencil,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
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
import { Input } from "#/components/ui/input.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  useBuildCollaborationMutation,
  useBuildCollaborationPersonalMutation,
} from "./BuildCollaborationMutationGate.tsx";
import "./build-collaboration.css";
import {
  audienceLabel,
  type CollaborationFeedPostEntry,
  formatTimestamp,
  postTypeLabel,
  roleLabel,
} from "./model.ts";
import {
  systemPostTitle,
} from "./SystemPostExperience.tsx";
import { moderationActionLabel } from "./build-collaboration-feed-contracts.ts";

export function ComposerAttachmentInput({
  assets,
  buildId,
  existingCount,
  files,
  onFilesChange,
  onRemove,
  organizationId,
  savingDraft,
}: {
  assets: BuildCollaborationAssetSummary[];
  buildId: Id<"activeBuilds">;
  existingCount: number;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onRemove: (asset: BuildCollaborationAssetSummary) => Promise<void>;
  organizationId: string;
  savingDraft: boolean;
}) {
  const hasAttachments = files.length > 0 || existingCount > 0;
  let status = "";
  if (existingCount > 0) {
    status = `${existingCount} scanned attachment${existingCount === 1 ? "" : "s"} already linked. `;
  }
  if (files.length > 0) {
    status += `${files.length} file${files.length === 1 ? "" : "s"} will be hashed and scanned before ${savingDraft ? "the draft is saved" : "publication"}.`;
  }
  return (
    <div className="space-y-2">
      <label
        className="flex items-center gap-2 font-medium text-sm"
        htmlFor="build-collaboration-attachments"
      >
        <Paperclip aria-hidden="true" className="size-4" />
        Governed attachments
      </label>
      <Input
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        capture="environment"
        id="build-collaboration-attachments"
        multiple
        nativeInput
        onChange={(event) =>
          onFilesChange(Array.from(event.target.files ?? []))
        }
        type="file"
      />
      {hasAttachments ? (
        <p className="text-muted-foreground text-xs">{status}</p>
      ) : null}
      {assets.length > 0 ? (
        <BuildCollaborationAssetList
          assets={assets}
          buildId={buildId}
          onRemove={onRemove}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

export interface ResolvedSystemPostCollapseControl {
  contentId: string;
  expanded: boolean;
  label: string;
  onToggle: () => void;
}

export function CollaborationPostHeader({
  buildId,
  canEdit,
  collapseControl,
  coordinationVisible,
  entry,
  mutationsAllowed,
  onEdit,
  onManageThread,
  onModerate,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  canEdit: boolean;
  collapseControl?: ResolvedSystemPostCollapseControl;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  organizationId: string;
}) {
  const toggleBuildPin = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const togglePersonalPin = useBuildCollaborationPersonalMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const toggleFollow = useBuildCollaborationPersonalMutation(
    api.build_collaboration_threads.toggleBuildCollaborationFollow
  );
  const savePost = (kind: "build" | "personal") =>
    (kind === "build" ? toggleBuildPin : togglePersonalPin)({
      buildId,
      kind,
      organizationId,
      postId: entry.post._id,
    }).catch((error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : kind === "build"
            ? "Unable to pin post."
            : "Unable to save post."
      )
    );
  const followPost = () =>
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
    );
  const canViewHistory =
    entry.post.viewerIsAuthor ||
    (entry.post.contentState === "active" && entry.post.revision > 1);
  const presentation = collaborationPostHeaderPresentation(entry);
  const HeaderIcon = presentation.icon;

  return (
    <CardHeader
      className={cn("gap-3 border-b p-4", presentation.headerClassName)}
      data-post-origin={entry.post.systemPost ? "system" : "user"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            presentation.iconClassName
          )}
        >
          <HeaderIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle
            className={cn(
              "truncate font-semibold text-base tracking-tight sm:text-lg",
              presentation.titleClassName
            )}
            render={<h3 />}
          >
            {presentation.label}
          </CardTitle>
          {presentation.entityTitle ? (
            <p className="mt-1 line-clamp-2 font-medium text-foreground text-sm leading-snug">
              {presentation.entityTitle}
            </p>
          ) : null}
          <CardDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground/90">
              {entry.post.authorDisplayNameSnapshot}
            </span>
            {entry.post.systemPost ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>{roleLabel(entry.post.authorRole)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <time>{formatTimestamp(entry.post.createdAt)}</time>
            <PostStatusBadges entry={entry} />
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {collapseControl ? (
            <Button
              aria-controls={collapseControl.contentId}
              aria-expanded={collapseControl.expanded}
              aria-label={`${collapseControl.expanded ? "Collapse" : "Expand"} resolved system post: ${collapseControl.label}`}
              onClick={collapseControl.onToggle}
              size="icon-xl"
              type="button"
              variant="ghost"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-200",
                  collapseControl.expanded && "rotate-180"
                )}
              />
            </Button>
          ) : null}
          <CollaborationPostActions
            canEdit={canEdit}
            canViewHistory={canViewHistory}
            coordinationVisible={coordinationVisible}
            entry={entry}
            followPost={followPost}
            mutationsAllowed={mutationsAllowed}
            onEdit={onEdit}
            onManageThread={onManageThread}
            onModerate={onModerate}
            savePost={savePost}
          />
        </div>
      </div>
    </CardHeader>
  );
}

export function collaborationPostHeaderPresentation(
  entry: CollaborationFeedPostEntry
) {
  if (entry.post.systemPost?.kind === "draw") {
    return {
      entityTitle: systemPostTitle(entry),
      headerClassName: "bg-info/5",
      icon: Banknote,
      iconClassName: "bg-info/12 text-info-foreground",
      label: "Draw system post",
      titleClassName: "text-info-foreground",
    };
  }
  if (entry.post.systemPost?.kind === "milestone") {
    return {
      entityTitle: systemPostTitle(entry),
      headerClassName: "bg-success/5",
      icon: Flag,
      iconClassName: "bg-success/12 text-success-foreground",
      label: "Milestone system post",
      titleClassName: "text-success-foreground",
    };
  }
  return {
    entityTitle: null,
    headerClassName: "bg-muted/25",
    icon: UserRound,
    iconClassName: "bg-secondary text-secondary-foreground",
    label: "User post",
    titleClassName: "text-foreground",
  };
}

export function PostStatusBadges({ entry }: { entry: CollaborationFeedPostEntry }) {
  const contentStatus =
    entry.post.contentState === "tombstoned" ? "Removed" : "Moderated";
  const systemLifecycle = entry.post.systemPost?.lifecycle;
  const announcementProminent = useAnnouncementProminence(
    entry.post.announcementExpiresAt,
    entry.post.announcementProminent
  );
  return (
    <>
      {entry.post.contentState === "active" ? (
        entry.post.revision > 1 ? (
          <Badge variant="outline">Edited</Badge>
        ) : null
      ) : (
        <Badge variant="secondary">{contentStatus}</Badge>
      )}
      <Badge variant="outline">{postTypeLabel(entry.post.postType)}</Badge>
      {entry.post.systemPost ? (
        <>
          {systemLifecycle === "reopened" ? (
            <Badge variant="info">Reopened</Badge>
          ) : systemLifecycle === "resolved" ? (
            <Badge variant="success">Resolved</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )}
        </>
      ) : systemLifecycle === "reopened" ? (
        <Badge variant="warning">Reopened</Badge>
      ) : systemLifecycle === "resolved" ||
        entry.post.threadState === "resolved" ? (
        <Badge>Resolved</Badge>
      ) : null}
      {entry.post.postType === "announcement" ? (
        <Badge variant={announcementProminent ? "secondary" : "outline"}>
          {announcementProminent ? "Prominent" : "Prominence expired"}
        </Badge>
      ) : null}
    </>
  );
}

export function useAnnouncementProminence(
  expiresAt: number | undefined,
  serverProminent: boolean
) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (expiresAt === undefined || expiresAt <= Date.now()) {
      return;
    }
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(expiresAt - Date.now() + 1, 2_147_483_647)
    );
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);
  return serverProminent && (expiresAt === undefined || expiresAt > now);
}

export function CollaborationPostActions({
  canEdit,
  canViewHistory,
  coordinationVisible,
  entry,
  followPost,
  mutationsAllowed,
  onEdit,
  onManageThread,
  onModerate,
  savePost,
}: {
  canEdit: boolean;
  canViewHistory: boolean;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  followPost: () => void;
  mutationsAllowed: boolean;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  savePost: (kind: "build" | "personal") => Promise<unknown>;
}) {
  const canUseModeration =
    entry.post.viewerCanModerate ||
    entry.post.viewerCanAppeal ||
    entry.post.viewerCanResolveAppeal;
  const hasHistoryActions = canViewHistory;
  const hasModerationActions = mutationsAllowed && canUseModeration;
  const hasCoordinationActions = coordinationVisible;
  if (!(hasHistoryActions || hasModerationActions || hasCoordinationActions)) {
    return null;
  }
  return (
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
            {canViewHistory ? (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil aria-hidden="true" className="size-4" />
                {canEdit ? "Edit post" : "View revision history"}
              </DropdownMenuItem>
            ) : null}
            {mutationsAllowed && canUseModeration ? (
              <DropdownMenuItem onClick={onModerate}>
                <ShieldAlert aria-hidden="true" className="size-4" />
                {moderationActionLabel(entry.post)}
              </DropdownMenuItem>
            ) : null}
            {coordinationVisible && entry.post.contentState === "active" ? (
              <DropdownMenuItem onClick={onManageThread}>
                {mutationsAllowed && entry.post.viewerCanManageThread
                  ? "Manage thread outcome"
                  : "View thread outcome"}
              </DropdownMenuItem>
            ) : null}
            {coordinationVisible ? (
              <>
                <DropdownMenuItem onClick={() => savePost("personal")}>
                  Save privately
                </DropdownMenuItem>
                {mutationsAllowed ? (
                  <DropdownMenuItem onClick={() => savePost("build")}>
                    Pin for Build
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={followPost}>
                  {entry.following ? "Unfollow thread" : "Follow thread"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardAction>
  );
}

export function CollaborationPostFooter({
  buildId,
  entry,
  mutationsAllowed,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  organizationId: string;
}) {
  const acknowledge = useBuildCollaborationMutation(
    api.build_collaboration_acknowledgements.acknowledgeBuildCollaborationPost
  );
  const acknowledgePost = async () => {
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
  };
  const latestReceipt = entry.receipts.reduce(
    (latest, receipt) => Math.max(latest, receipt.lastViewedAt),
    0
  );

  return (
    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-muted-foreground text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {entry.receipts.length > 0
            ? `Seen by ${entry.receipts.length} · ${formatTimestamp(latestReceipt)}`
            : "No view receipts are visible to your role yet"}
        </span>
        {entry.acknowledgement?.required &&
        !entry.acknowledgement.acknowledged ? (
          <Button
            disabled={!mutationsAllowed}
            onClick={acknowledgePost}
            size="sm"
            type="button"
            variant="outline"
          >
            Acknowledge
          </Button>
        ) : entry.acknowledgement?.acknowledged ? (
          <Badge variant="secondary">Acknowledged</Badge>
        ) : null}
      </div>
      <span>{audienceLabel(entry.post.audienceMode)}</span>
    </CardFooter>
  );
}

export function ThreadOutcomeSummary({
  entry,
}: {
  entry: CollaborationFeedPostEntry;
}) {
  if (entry.post.threadState !== "resolved") {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-xs">
            {entry.post.postType === "question"
              ? "Accepted answer"
              : entry.post.postType === "decision"
                ? "Decision outcome"
                : entry.post.postType === "issue"
                  ? "Issue disposition"
                  : "Resolution"}
          </p>
          {entry.post.resolvedAt ? (
            <time className="text-muted-foreground text-xs">
              {formatTimestamp(entry.post.resolvedAt)}
            </time>
          ) : null}
        </div>
        {entry.post.postType === "decision" ? (
          <>
            <p className="font-medium text-sm">{entry.post.decisionOutcome}</p>
            <p className="text-muted-foreground text-xs">
              Owner: {entry.post.decisionOwnerDisplayName ?? "Former Build participant"}
            </p>
          </>
        ) : entry.post.resolutionSummary ? (
          <p className="text-muted-foreground text-sm">
            {entry.post.resolutionSummary}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            This thread has been resolved.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}
