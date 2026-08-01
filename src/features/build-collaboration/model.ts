import type { JSONContent } from "@tiptap/react";
import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";
import type {
  CollaborationTagKind,
  CollaborationTagOption,
} from "./CollaborationRichTextEditor.tsx";

type CollaborationFeedResult = FunctionReturnType<
  typeof api.build_collaboration.listBuildCollaborationFeed
>;

export type CollaborationFeedEntry = CollaborationFeedResult["page"][number];
export type CollaborationFeedPostEntry = Extract<
  CollaborationFeedEntry,
  { kind: "post" }
>;
export type CollaborationActionItem =
  CollaborationFeedPostEntry["actionItems"][number];
export type CollaborationActionItemQueueRow = FunctionReturnType<
  typeof api.build_action_item_queues.listBuildActionItemQueue
>["page"][number];
export type CollaborationFeedReference =
  CollaborationFeedPostEntry["references"][number];
export type CollaborationCommentRow = FunctionReturnType<
  typeof api.build_collaboration_threads.listBuildCollaborationComments
>[number];
export type RawCollaborationTagOption = FunctionReturnType<
  typeof api.build_collaboration_references.listBuildCollaborationTagOptions
>[number];
export type CollaborationDraftSummary = FunctionReturnType<
  typeof api.build_collaboration_drafts.listMyBuildCollaborationDrafts
>[number];

export type AudienceMode = CollaborationFeedPostEntry["post"]["audienceMode"];
export type PostType = CollaborationFeedPostEntry["post"]["postType"];
export type ActionStatus = CollaborationActionItem["status"];
export type FeedFilter = "actionable" | "all" | "following" | "pinned";

export interface ReferenceOption extends CollaborationTagOption {
  entityKind: RawCollaborationTagOption["entityKind"];
  href: string;
}

export type FocusedReference = ReferenceOption;

export interface CollaborationDraftBundle {
  acknowledgementRequired?: boolean;
  actionItems: Array<{
    assigneeWorkosUserId?: string;
    descriptionPlainText?: string;
    descriptionTiptapJson?: string;
    dueAt?: number;
    effectiveAssignmentState?: "assigned" | "requested" | "unassigned";
    priority?: "urgent" | "high" | "medium" | "low" | "none";
    requiresAcceptance?: boolean;
    title: string;
  }>;
  attachmentAssetIds?: string[];
  audienceMode: AudienceMode;
  effectiveNotificationEffects?: Array<{
    channel: "email" | "in_app" | "push";
    recipientWorkosUserIds: string[];
    summary: string;
  }>;
  effectiveReaderIds?: string[];
  excludedReaderIds?: string[];
  mandatoryReaderIds?: string[];
  notificationEffects?: Array<{
    channel: "email" | "in_app" | "push";
    recipientWorkosUserIds: string[];
    summary: string;
  }>;
  plainText: string;
  postType: PostType;
  references: Array<{
    entityId: string;
    entityKind: ReturnType<typeof toBackendReferenceKind>;
    label: string;
    primary?: boolean;
    summary?: string;
  }>;
  requestedReaderIds: string[];
  sharedMutations?: Array<{
    entityId?: string;
    entityKind: string;
    expectedRevision?: number;
    operation: string;
    summary: string;
  }>;
  tiptapJson: string;
}

const WHITESPACE_PATTERN = /\s+/;

export function toCollaborationTagOption(
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

export function toEditorReferenceKind(kind: string): CollaborationTagKind {
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

export function toBackendReferenceKind(kind: CollaborationTagKind) {
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

export function emptyDocument(): JSONContent {
  return { content: [{ type: "paragraph" }], type: "doc" };
}

export function composerActionItems(actionTitle: string) {
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

export function parseDraftBundle(
  value: string
): CollaborationDraftBundle | null {
  try {
    return JSON.parse(value) as CollaborationDraftBundle;
  } catch {
    return null;
  }
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseDocument(value: string): JSONContent {
  try {
    return JSON.parse(value) as JSONContent;
  } catch {
    return emptyDocument();
  }
}

export function plainTextFromDocument(document: JSONContent) {
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

export function initials(name: string) {
  return name
    .split(WHITESPACE_PATTERN)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function roleLabel(role?: string) {
  if (!role) {
    return "Build participant";
  }
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function postTypeLabel(type: string) {
  return type === "issue" ? "Issue / blocker" : roleLabel(type);
}

export function reactionLabel(reaction: "acknowledged" | "agree" | "question") {
  switch (reaction) {
    case "acknowledged":
      return "Acknowledge";
    case "agree":
      return "Agree";
    case "question":
      return "Question";
  }
}

export function audienceLabel(mode: AudienceMode) {
  switch (mode) {
    case "build_wide":
      return "Everyone on this Build";
    case "author_tier_and_higher":
      return "Author tier and higher";
    case "custom":
      return "Custom audience";
  }
}
