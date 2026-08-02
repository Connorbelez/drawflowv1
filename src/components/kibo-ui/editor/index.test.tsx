// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { useCurrentEditor } from "@tiptap/react";
import { useEffect } from "react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { EditorProvider } from "./index.tsx";

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

afterEach(() => {
  cleanup();
});

describe("EditorProvider structural formatting", () => {
  test("slash menu Heading 1 changes the TipTap document node", async () => {
    let editor: Editor | null = null;

    render(
      <EditorProvider content="<p></p>">
        <CaptureEditor onReady={(currentEditor) => (editor = currentEditor)} />
      </EditorProvider>
    );

    await waitFor(() => expect(editor).not.toBeNull());
    editor?.commands.focus("start");
    editor?.commands.insertContent("/");

    await screen.findByRole("listbox", { name: "Editor command menu" });

    fireEvent.mouseDown(
      await screen.findByRole("option", { name: /Heading 1/i })
    );
    editor?.commands.insertContent("Waterproofing inspection");

    await waitFor(() => {
      expect(editor?.getJSON().content?.[0]).toEqual({
        type: "heading",
        attrs: { level: 1 },
        content: [
          {
            type: "text",
            text: "Waterproofing inspection",
          },
        ],
      });
    });
    expect(document.querySelector(".ProseMirror h1")).not.toBeNull();
    expect(document.querySelector(".ProseMirror h1")?.className).toContain(
      "font-semibold"
    );
    expect(
      document.querySelector(".ProseMirror")?.parentElement?.parentElement
        ?.className
    ).toContain("[&_.ProseMirror_h1]:text-2xl");
  });

  test("keyboard-selected slash heading keeps subsequent input in the heading", async () => {
    let editor: Editor | null = null;

    render(
      <EditorProvider content="<p></p>">
        <CaptureEditor onReady={(currentEditor) => (editor = currentEditor)} />
      </EditorProvider>
    );

    await waitFor(() => expect(editor).not.toBeNull());
    editor?.commands.focus("start");
    editor?.commands.insertContent("/");

    const editorElement = document.querySelector(".ProseMirror");
    expect(editorElement).not.toBeNull();
    await screen.findByRole("option", { name: /Heading 1/i });
    fireEvent.keyDown(editorElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(editorElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(editorElement as Element, { key: "Enter" });
    editor?.commands.insertContent("Waterproofing inspection");

    await waitFor(() => {
      expect(editor?.getJSON().content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
        content: [
          {
            type: "text",
            text: "Waterproofing inspection",
          },
        ],
      });
    });
  });

  test("toolbar Heading 1 changes the TipTap document node", async () => {
    let documentType: string | undefined;

    render(
      <FieldRichTextEditor
        ariaLabel="Project note"
        onChange={() => undefined}
        onDocumentChange={(document) => {
          documentType = document.content?.[0]?.type;
        }}
        value="<p>Foundation scope</p>"
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Heading 1" })
    );

    await waitFor(() => expect(documentType).toBe("heading"));
    expect(document.querySelector(".ProseMirror h1")?.textContent).toBe(
      "Foundation scope"
    );
  });

  test("slash menu To-do List creates task-list and task-item nodes", async () => {
    let editor: Editor | null = null;

    render(
      <EditorProvider content="<p></p>">
        <CaptureEditor onReady={(currentEditor) => (editor = currentEditor)} />
      </EditorProvider>
    );

    await waitFor(() => expect(editor).not.toBeNull());
    editor?.commands.focus("start");
    editor?.commands.insertContent("/");
    fireEvent.mouseDown(
      await screen.findByRole("option", { name: /To-do List/i })
    );

    await waitFor(() => {
      expect(editor?.getJSON().content?.[0]?.type).toBe("taskList");
      expect(editor?.getJSON().content?.[0]?.content?.[0]?.type).toBe(
        "taskItem"
      );
    });
    expect(
      document.querySelector('.ProseMirror input[type="checkbox"]')
    ).not.toBeNull();
  });

  test("toolbar To-do List creates task-list and task-item nodes", async () => {
    let documentContent: ReturnType<Editor["getJSON"]>["content"];

    render(
      <FieldRichTextEditor
        ariaLabel="Project note"
        onChange={() => undefined}
        onDocumentChange={(document) => {
          documentContent = document.content;
        }}
        value="<p>Confirm waterproofing inspection</p>"
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "To-do List" })
    );

    await waitFor(() => {
      expect(documentContent?.[0]?.type).toBe("taskList");
      expect(documentContent?.[0]?.content?.[0]?.type).toBe("taskItem");
    });
  });

  test("slash menu Table inserts a headed three-by-three table", async () => {
    let editor: Editor | null = null;

    render(
      <EditorProvider content="<p></p>">
        <CaptureEditor onReady={(currentEditor) => (editor = currentEditor)} />
      </EditorProvider>
    );

    await waitFor(() => expect(editor).not.toBeNull());
    editor?.commands.focus("start");
    editor?.commands.insertContent("/");
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Table/i }));

    await waitFor(() => {
      const table = editor?.getJSON().content?.find(
        (node) => node.type === "table"
      );
      expect(table?.content).toHaveLength(3);
      expect(table?.content?.[0]?.content).toHaveLength(3);
      expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
      expect(table?.content?.[1]?.content?.[0]?.type).toBe("tableCell");
    });
    expect(document.querySelectorAll(".ProseMirror table")).toHaveLength(1);
  });

  test("toolbar Table inserts a headed three-by-three table", async () => {
    let documentContent: ReturnType<Editor["getJSON"]>["content"];

    render(
      <FieldRichTextEditor
        ariaLabel="Project note"
        onChange={() => undefined}
        onDocumentChange={(document) => {
          documentContent = document.content;
        }}
        value="<p>Foundation scope</p>"
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Table" }));

    await waitFor(() => {
      const table = documentContent?.find((node) => node.type === "table");
      expect(table?.content).toHaveLength(3);
      expect(table?.content?.[0]?.content).toHaveLength(3);
      expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
    });
  });
});

function CaptureEditor({ onReady }: { onReady: (editor: Editor) => void }) {
  const { editor } = useCurrentEditor();

  useEffect(() => {
    if (editor) {
      onReady(editor);
    }
  }, [editor, onReady]);

  return null;
}
