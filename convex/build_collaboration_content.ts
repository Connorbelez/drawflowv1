import { canonicalizeTiptapReferences } from "./build_collaboration_publication_bundle";
import type { CanonicalBuildCollaborationReference } from "./build_collaboration_references";

const MAX_PLAIN_TEXT_LENGTH = 50_000;
const MAX_RICH_TEXT_LENGTH = 250_000;

export function canonicalizeEditedCollaborationContent(input: {
  references: CanonicalBuildCollaborationReference[];
  tiptapJson: string;
}) {
  if (input.tiptapJson.length > MAX_RICH_TEXT_LENGTH) {
    throw new Error(
      `Collaboration rich text may not exceed ${MAX_RICH_TEXT_LENGTH} characters.`
    );
  }
  const content = canonicalizeTiptapReferences(
    input.tiptapJson,
    input.references
  );
  if (content.plainText.length > MAX_PLAIN_TEXT_LENGTH) {
    throw new Error(
      `Collaboration text may not exceed ${MAX_PLAIN_TEXT_LENGTH} characters.`
    );
  }
  return content;
}

export function collaborationTombstoneContent(kind: "comment" | "post") {
  const plainText =
    kind === "post"
      ? "This post was removed by its author."
      : "This reply was removed by its author.";
  return {
    plainText,
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

export function collaborationModeratedContent(kind: "comment" | "post") {
  const plainText =
    kind === "post"
      ? "This post is unavailable while it is under moderation."
      : "This reply is unavailable while it is under moderation.";
  return {
    plainText,
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

export function collaborationContentHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_296;
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}`;
}

export function projectCollaborationRevisionForViewer(input: {
  references: CanonicalBuildCollaborationReference[];
  tiptapJson: string;
}) {
  let document: unknown;
  try {
    document = JSON.parse(input.tiptapJson);
  } catch {
    return collaborationUnavailableRevisionContent();
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    return collaborationUnavailableRevisionContent();
  }
  const referenceKeys = new Set(
    input.references.map(
      (reference) =>
        `${editorReferenceKind(reference.entityKind)}:${reference.entityId}`
    )
  );
  const projectedDocument = redactUnavailableReferenceNodes(
    document,
    referenceKeys
  );
  return canonicalizeTiptapReferences(
    JSON.stringify(projectedDocument),
    input.references,
    { allowEmpty: true }
  );
}

function redactUnavailableReferenceNodes(
  node: unknown,
  referenceKeys: Set<string>
): unknown {
  if (Array.isArray(node)) {
    return node.map((child) =>
      redactUnavailableReferenceNodes(child, referenceKeys)
    );
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "collaborationMention") {
    const attributes =
      record.attrs && typeof record.attrs === "object"
        ? (record.attrs as Record<string, unknown>)
        : {};
    const id = typeof attributes.id === "string" ? attributes.id.trim() : "";
    const kind =
      typeof attributes.kind === "string" ? attributes.kind.trim() : "";
    if (!referenceKeys.has(`${kind}:${id}`)) {
      return {
        text: "[Referenced item unavailable]",
        type: "text",
      };
    }
  }
  const content = Array.isArray(record.content)
    ? redactUnavailableReferenceNodes(record.content, referenceKeys)
    : record.content;
  return { ...record, ...(content ? { content } : {}) };
}

function collaborationUnavailableRevisionContent() {
  const plainText = "This revision is unavailable.";
  return {
    plainText,
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

function editorReferenceKind(
  entityKind: CanonicalBuildCollaborationReference["entityKind"]
) {
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
