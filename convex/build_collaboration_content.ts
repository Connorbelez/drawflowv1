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

export function collaborationContentHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_296;
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}`;
}
