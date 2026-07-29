import { v } from "convex/values";

import {
  buildActionItemPriorityValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationNotificationChannelValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import type { Id } from "./types";

export const referenceInputValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  label: v.string(),
  primary: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

export const actionItemInputValidator = v.object({
  assigneeWorkosUserId: v.optional(v.string()),
  descriptionPlainText: v.optional(v.string()),
  descriptionTiptapJson: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  priority: v.optional(buildActionItemPriorityValidator),
  requiresAcceptance: v.optional(v.boolean()),
  title: v.string(),
});

export const notificationEffectInputValidator = v.object({
  channel: buildCollaborationNotificationChannelValidator,
  recipientWorkosUserIds: v.array(v.string()),
  summary: v.string(),
});

export const sharedMutationInputValidator = v.object({
  entityId: v.optional(v.string()),
  entityKind: v.string(),
  operation: v.string(),
  summary: v.string(),
});

export const publicationBundleFields = {
  acknowledgementRequired: v.optional(v.boolean()),
  actionItems: v.array(actionItemInputValidator),
  attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
  audienceMode: buildCollaborationAudienceModeValidator,
  excludedReaderIds: v.optional(v.array(v.string())),
  notificationEffects: v.optional(v.array(notificationEffectInputValidator)),
  plainText: v.string(),
  postType: buildCollaborationPostTypeValidator,
  references: v.array(referenceInputValidator),
  requestedReaderIds: v.array(v.string()),
  sharedMutations: v.optional(v.array(sharedMutationInputValidator)),
  tiptapJson: v.string(),
};

export interface ReferenceInput {
  entityId: string;
  entityKind:
    | "participant"
    | "milestone"
    | "submilestone"
    | "draw"
    | "evidencePackage"
    | "evidenceAsset"
    | "siteVisit"
    | "document"
    | "material"
    | "actionItem";
  label: string;
  primary?: boolean;
  summary?: string;
}

export interface ActionItemInput {
  assigneeWorkosUserId?: string;
  descriptionPlainText?: string;
  descriptionTiptapJson?: string;
  dueAt?: number;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  requiresAcceptance?: boolean;
  title: string;
}

export interface NotificationEffectInput {
  channel: "in_app" | "email" | "push";
  recipientWorkosUserIds: string[];
  summary: string;
}

export interface SharedMutationInput {
  entityId?: string;
  entityKind: string;
  operation: string;
  summary: string;
}

export interface BuildCollaborationPublicationBundle {
  acknowledgementRequired?: boolean;
  actionItems: ActionItemInput[];
  attachmentAssetIds: Id<"buildCollaborationAssets">[];
  audienceMode: "build_wide" | "author_tier_and_higher" | "custom";
  effectiveNotificationEffects: NotificationEffectInput[];
  effectiveReaderIds: string[];
  excludedReaderIds: string[];
  mandatoryReaderIds: string[];
  notificationEffects: NotificationEffectInput[];
  plainText: string;
  postType: "update" | "question" | "issue" | "decision" | "announcement";
  references: ReferenceInput[];
  requestedReaderIds: string[];
  sharedMutations: SharedMutationInput[];
  tiptapJson: string;
}

export type BuildCollaborationPublicationBundleInput = Omit<
  BuildCollaborationPublicationBundle,
  | "attachmentAssetIds"
  | "effectiveNotificationEffects"
  | "effectiveReaderIds"
  | "excludedReaderIds"
  | "mandatoryReaderIds"
  | "notificationEffects"
  | "sharedMutations"
> &
  Partial<
    Pick<
      BuildCollaborationPublicationBundle,
      | "attachmentAssetIds"
      | "excludedReaderIds"
      | "notificationEffects"
      | "sharedMutations"
    >
  >;

export function normalizePublicationBundle(
  input: BuildCollaborationPublicationBundleInput
): BuildCollaborationPublicationBundle {
  const content = canonicalizeTiptapContent(input.tiptapJson);
  return {
    acknowledgementRequired: input.acknowledgementRequired,
    actionItems: input.actionItems,
    attachmentAssetIds: input.attachmentAssetIds ?? [],
    audienceMode: input.audienceMode,
    effectiveNotificationEffects: [],
    effectiveReaderIds: [],
    excludedReaderIds: input.excludedReaderIds ?? [],
    mandatoryReaderIds: [],
    notificationEffects: input.notificationEffects ?? [],
    plainText: content.plainText,
    postType: input.postType,
    references: input.references,
    requestedReaderIds: input.requestedReaderIds,
    sharedMutations: input.sharedMutations ?? [],
    tiptapJson: content.tiptapJson,
  };
}

export function canonicalizeTiptapContent(tiptapJson: string) {
  let document: unknown;
  try {
    document = JSON.parse(tiptapJson);
  } catch {
    throw new Error("Post rich text must be valid TipTap JSON.");
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw new Error("Post rich text must contain a TipTap document.");
  }
  const plainText = tiptapNodeText(document).trim();
  if (!plainText) {
    throw new Error("Post content is required.");
  }
  return {
    plainText,
    tiptapJson: JSON.stringify(document),
  };
}

export function canonicalPublicationBundleJson(
  bundle: BuildCollaborationPublicationBundle
) {
  return JSON.stringify(sortJsonValue(bundle));
}

export async function publicationBundleHash(
  bundleJson: string
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(bundleJson)
  );
  return `sha256-${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }
  return value;
}

function tiptapNodeText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (record.type === "hardBreak") {
    return "\n";
  }
  if (record.type === "collaborationMention") {
    const attributes =
      record.attrs && typeof record.attrs === "object"
        ? (record.attrs as Record<string, unknown>)
        : undefined;
    return typeof attributes?.label === "string" ? attributes.label : "";
  }
  const content = Array.isArray(record.content)
    ? record.content.map(tiptapNodeText).join("")
    : "";
  return isTiptapBlockNode(record.type) && content ? `${content}\n` : content;
}

function isTiptapBlockNode(type: unknown) {
  return (
    typeof type === "string" &&
    [
      "blockquote",
      "bulletList",
      "codeBlock",
      "heading",
      "listItem",
      "orderedList",
      "paragraph",
      "taskItem",
      "taskList",
    ].includes(type)
  );
}
