import type { JSONContent } from "@tiptap/react";

/**
 * Quote scope is persisted as canonical TipTap JSON. A malformed historic
 * value stays non-renderable rather than being treated as HTML.
 */
export function parseQuoteRoundTiptapJson(
  value: string | undefined
): JSONContent | undefined {
  if (!value?.trim()) {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("type" in parsed) ||
      parsed.type !== "doc"
    ) {
      return;
    }
    return parsed as JSONContent;
  } catch {
    return;
  }
}
