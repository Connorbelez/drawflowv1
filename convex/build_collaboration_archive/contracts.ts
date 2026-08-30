import type { Id } from "../types";

export const ARCHIVE_ROW_LIMIT = 2000;
export const ARCHIVE_PAGE_SIZE = 2;

export const COLLABORATION_POST_ARCHIVE_SECTIONS = [
  "core",
  "revisions",
  "post_revision_attachments",
  "post_revision_audience_snapshots",
  "post_revision_references",
  "comments",
  "comment_revisions",
  "comment_revision_attachments",
  "comment_revision_references",
  "action_items",
  "action_item_attachments",
  "action_item_checklist",
  "action_item_comments",
  "action_item_events",
  "action_item_labels",
  "action_item_post_links",
  "action_item_references",
  "action_item_relations_incoming",
  "action_item_relations_outgoing",
  "action_item_revisions",
  "acknowledgements",
  "acknowledgement_events",
  "audience_members",
  "creation_requests",
  "decision_outcomes",
  "follows",
  "moderation",
  "moderation_events",
  "pins",
  "reactions",
  "receipts",
  "references",
  "thread_events",
] as const;

export type CollaborationPostArchiveSection =
  (typeof COLLABORATION_POST_ARCHIVE_SECTIONS)[number];

export type ActionItemChildArchiveSection = Extract<
  CollaborationPostArchiveSection,
  `action_item_${string}`
>;

export interface ActionItemChildArchiveCursor {
  actionItemId?: Id<"buildActionItems">;
  childCursor: string | null;
  nextItemCursor: string | null;
}

export interface NestedArchiveCursor {
  childCursor: string | null;
  nextParentCursor: string | null;
  parentId?: string;
}

export interface CollaborationPostArchiveSnapshot {
  createdAt: number;
  currentRevisionId?: Id<"buildCollaborationPostRevisions">;
  postId: Id<"buildCollaborationPosts">;
  revision: number;
  threadRevision?: number;
  updatedAt: number;
  [key: string]: unknown;
}

export type BuildCollaborationHistoryArchiveSection =
  | "build_state"
  | "lifecycle_events"
  | "closure_waivers"
  | "lifecycle_audit";

