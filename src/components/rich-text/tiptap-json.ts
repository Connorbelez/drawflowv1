import type { JSONContent } from "@tiptap/react";

/**
 * TipTap accepts either HTML or a JSON document. Persisted Scope revisions use
 * both representations, so parse only valid TipTap documents and leave HTML
 * and ordinary text untouched.
 */
export function tiptapContent(
  value: string | JSONContent
): string | JSONContent {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (!(normalized.startsWith("{") && normalized.endsWith("}"))) {
    return value;
  }

  try {
    const parsed = JSON.parse(normalized) as JSONContent;
    return parsed?.type === "doc" && Array.isArray(parsed.content)
      ? parsed
      : value;
  } catch {
    return value;
  }
}

/**
 * Compare serialized TipTap documents by their content rather than by the
 * incidental order of object keys emitted by an editor instance.
 *
 * Empty TipTap documents can arrive as an empty string, an empty paragraph in
 * HTML, or the canonical JSON document. Treat those representations as the
 * same value so mounting an editor cannot create a false dirty state.
 */
export function tiptapJsonEqual(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (isEmptyTiptapValue(left) && isEmptyTiptapValue(right)) {
    return true;
  }

  try {
    return (
      JSON.stringify(canonicalizeJson(JSON.parse(left))) ===
      JSON.stringify(canonicalizeJson(JSON.parse(right)))
    );
  } catch {
    return left.trim() === right.trim();
  }
}

function isEmptyTiptapValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<p></p>") {
    return true;
  }

  try {
    return isEmptyTiptapDocument(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

function isEmptyTiptapDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const document = value as {
    content?: unknown;
    type?: unknown;
  };
  if (document.type !== "doc") {
    return false;
  }

  if (!Array.isArray(document.content) || document.content.length === 0) {
    return true;
  }

  return document.content.every((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const paragraph = node as { content?: unknown; type?: unknown };
    const paragraphContent = paragraph.content;
    const isEmptyParagraphContent =
      paragraphContent === undefined ||
      (Array.isArray(paragraphContent) &&
        (paragraphContent.length === 0 ||
          paragraphContent.every(
            (child) =>
              child &&
              typeof child === "object" &&
              !Array.isArray(child) &&
              "text" in child &&
              typeof child.text === "string" &&
              child.text.trim().length === 0
          )));

    return paragraph.type === "paragraph" && isEmptyParagraphContent;
  });
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)])
    );
  }

  return value;
}
