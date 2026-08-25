import type { JSONContent } from "@tiptap/react";

export function plainTextFromHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function plainTextFromTiptapJson(value: string) {
  if (!value.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      (parsed as { type?: unknown }).type !== "doc"
    ) {
      return plainTextFromHtml(value);
    }
    const document = parsed as JSONContent;
    const text: string[] = [];
    const blockNodeTypes = new Set([
      "blockquote",
      "codeBlock",
      "doc",
      "heading",
      "listItem",
      "bulletList",
      "orderedList",
      "paragraph",
      "table",
      "tableCell",
      "tableHeader",
      "tableRow",
    ]);
    const visit = (node: JSONContent) => {
      if (typeof node.text === "string") {
        text.push(node.text);
        return;
      }
      if (node.type === "hardBreak") {
        text.push("\n");
        return;
      }
      for (const child of node.content ?? []) {
        visit(child);
      }
      if (node.type && blockNodeTypes.has(node.type)) {
        text.push("\n");
      }
    };
    visit(document);
    return text.join("").replace(/\s+/g, " ").trim();
  } catch {
    return plainTextFromHtml(value);
  }
}
