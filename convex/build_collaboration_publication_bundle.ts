import { v } from "convex/values";

import { buildCollaborationValidationError } from "./build_collaboration_validation";

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
  references: v.optional(v.array(referenceInputValidator)),
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
  expectedRevision: v.optional(v.number()),
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
  effectiveAssignmentState?: "assigned" | "requested" | "unassigned";
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  references?: ReferenceInput[];
  requiresAcceptance?: boolean;
  title: string;
}

export interface NotificationEffectInput {
  channel: "in_app" | "email" | "push";
  recipientWorkosUserIds: string[];
  summary: string;
}

export interface ResolvedNotificationEffect extends NotificationEffectInput {
  approvedChannel?: NotificationEffectInput["channel"];
}

export interface SharedMutationInput {
  entityId?: string;
  entityKind: string;
  expectedRevision?: number;
  operation: string;
  summary: string;
}

export interface BuildCollaborationPublicationBundle {
  acknowledgementRequired?: boolean;
  actionItems: ActionItemInput[];
  attachmentAssetIds: Id<"buildCollaborationAssets">[];
  audienceMode: "build_wide" | "author_tier_and_higher" | "custom";
  effectiveNotificationEffects: ResolvedNotificationEffect[];
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
    actionItems: input.actionItems.map(normalizeActionItem),
    attachmentAssetIds: [...new Set(input.attachmentAssetIds ?? [])].sort(),
    audienceMode: input.audienceMode,
    effectiveNotificationEffects: [],
    effectiveReaderIds: [],
    excludedReaderIds: normalizeIds(input.excludedReaderIds ?? []),
    mandatoryReaderIds: [],
    notificationEffects: (input.notificationEffects ?? []).map(
      normalizeNotificationEffect
    ),
    plainText: content.plainText,
    postType: input.postType,
    references: input.references.map(normalizeReference),
    requestedReaderIds: normalizeIds(input.requestedReaderIds),
    sharedMutations: (input.sharedMutations ?? []).map(normalizeSharedMutation),
    tiptapJson: content.tiptapJson,
  };
}

export function canonicalizeTiptapContent(tiptapJson: string) {
  let document: unknown;
  try {
    document = JSON.parse(tiptapJson);
  } catch {
    throw buildCollaborationValidationError(
      "Post rich text must be valid TipTap JSON."
    );
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw buildCollaborationValidationError(
      "Post rich text must contain a TipTap document."
    );
  }
  const plainText = tiptapNodeText(document).trim();
  if (!plainText) {
    throw buildCollaborationValidationError("Post content is required.");
  }
  return {
    plainText,
    tiptapJson: JSON.stringify(document),
  };
}

export function canonicalizeTiptapReferences(
  tiptapJson: string,
  references: Array<{
    aliases?: Array<Pick<ReferenceInput, "entityId" | "entityKind">>;
    entityId: string;
    entityKind: ReferenceInput["entityKind"];
    eyebrow: string;
    label: string;
    summary: string;
  }>,
  options?: { allowEmpty?: boolean }
) {
  let document: unknown;
  try {
    document = JSON.parse(tiptapJson);
  } catch {
    throw buildCollaborationValidationError(
      "Rich text must be valid TipTap JSON."
    );
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw buildCollaborationValidationError(
      "Rich text must contain a TipTap document."
    );
  }
  const referenceByKey = new Map();
  for (const reference of references) {
    referenceByKey.set(
      `${editorReferenceKind(reference.entityKind)}:${reference.entityId}`,
      reference,
    );
    for (const alias of reference.aliases ?? []) {
      referenceByKey.set(
        `${editorReferenceKind(alias.entityKind)}:${alias.entityId}`,
        reference,
      );
    }
  }
  const rewrittenDocument = rewriteTiptapReferenceNodes(
    document,
    referenceByKey
  );
  const rewrittenJson = JSON.stringify(rewrittenDocument);
  if (options?.allowEmpty) {
    return {
      plainText: tiptapNodeText(rewrittenDocument).trim(),
      tiptapJson: rewrittenJson,
    };
  }
  return canonicalizeTiptapContent(rewrittenJson);
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

function rewriteTiptapReferenceNodes(
  node: unknown,
  referenceByKey: Map<
    string,
    {
      aliases?: Array<Pick<ReferenceInput, "entityId" | "entityKind">>;
      entityId: string;
      entityKind: ReferenceInput["entityKind"];
      eyebrow: string;
      label: string;
      summary: string;
    }
  >
): unknown {
  if (Array.isArray(node)) {
    return node.map((child) =>
      rewriteTiptapReferenceNodes(child, referenceByKey)
    );
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  const record = node as Record<string, unknown>;
  const content = Array.isArray(record.content)
    ? rewriteTiptapReferenceNodes(record.content, referenceByKey)
    : record.content;
  if (record.type !== "collaborationMention") {
    return { ...record, ...(content ? { content } : {}) };
  }
  const attributes =
    record.attrs && typeof record.attrs === "object"
      ? (record.attrs as Record<string, unknown>)
      : {};
  const id = typeof attributes.id === "string" ? attributes.id.trim() : "";
  const kind =
    typeof attributes.kind === "string" ? attributes.kind.trim() : "";
  const canonical = referenceByKey.get(`${kind}:${id}`);
  if (!canonical) {
    throw buildCollaborationValidationError(
      "Every rich-text Build reference must match an authorized canonical reference."
    );
  }
  return {
    ...record,
    attrs: {
      eyebrow: canonical.eyebrow,
      id: canonical.entityId,
      kind: editorReferenceKind(canonical.entityKind),
      label: canonical.label,
      summary: canonical.summary,
    },
    ...(content ? { content } : {}),
  };
}

function editorReferenceKind(entityKind: ReferenceInput["entityKind"]) {
  switch (entityKind) {
    case "actionItem":
      return "action_item";
    case "evidenceAsset":
    case "evidencePackage":
      return "evidence";
    case "siteVisit":
      return "site_visit";
    default:
      return entityKind;
  }
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

function normalizeActionItem(input: ActionItemInput): ActionItemInput {
  const description = input.descriptionTiptapJson
    ? canonicalizeOptionalTiptapContent(input.descriptionTiptapJson)
    : {
        plainText: input.descriptionPlainText?.trim() ?? "",
        tiptapJson: JSON.stringify({ content: [], type: "doc" }),
      };
  return {
    assigneeWorkosUserId: input.assigneeWorkosUserId?.trim() || undefined,
    descriptionPlainText: description.plainText,
    descriptionTiptapJson: description.tiptapJson,
    dueAt: input.dueAt,
    priority: input.priority ?? "none",
    references: (input.references ?? []).map(normalizeReference),
    requiresAcceptance: input.requiresAcceptance,
    title: input.title.trim(),
  };
}

function normalizeNotificationEffect(
  input: NotificationEffectInput
): NotificationEffectInput {
  return {
    channel: input.channel,
    recipientWorkosUserIds: normalizeIds(input.recipientWorkosUserIds),
    summary: input.summary.trim(),
  };
}

function normalizeReference(input: ReferenceInput): ReferenceInput {
  return {
    entityId: input.entityId.trim(),
    entityKind: input.entityKind,
    label: input.label.trim(),
    primary: input.primary ?? false,
    summary: input.summary?.trim() || undefined,
  };
}

function normalizeSharedMutation(
  input: SharedMutationInput
): SharedMutationInput {
  if (
    input.expectedRevision !== undefined &&
    (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)
  ) {
    throw buildCollaborationValidationError(
      "Shared mutation expected revisions must be non-negative integers."
    );
  }
  return {
    entityId: input.entityId?.trim() || undefined,
    entityKind: input.entityKind.trim(),
    expectedRevision: input.expectedRevision,
    operation: input.operation.trim(),
    summary: input.summary.trim(),
  };
}

function normalizeIds(values: string[]) {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].sort();
}

function canonicalizeOptionalTiptapContent(tiptapJson: string) {
  let document: unknown;
  try {
    document = JSON.parse(tiptapJson);
  } catch {
    throw buildCollaborationValidationError(
      "Action Item rich text must be valid TipTap JSON."
    );
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw buildCollaborationValidationError(
      "Action Item rich text must contain a TipTap document."
    );
  }
  return {
    plainText: tiptapNodeText(document).trim(),
    tiptapJson: JSON.stringify(document),
  };
}
