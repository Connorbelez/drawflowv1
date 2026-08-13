"use client";

import { type JSONContent, useCurrentEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  EditorClearFormatting,
  EditorFormatBold,
  EditorFormatItalic,
  EditorImageSelector,
  EditorLinkSelector,
  EditorNodeBulletList,
  EditorNodeHeading1,
  EditorNodeHeading2,
  EditorNodeHeading3,
  EditorNodeOrderedList,
  EditorNodeTable,
  EditorNodeTaskList,
  EditorProvider,
  type EditorProviderProps,
} from "#/components/kibo-ui/editor/index.tsx";
import { tiptapContent } from "#/components/rich-text/tiptap-json.ts";
import { cn } from "#/lib/utils.ts";

const EDITOR_IMAGE_CLASSES =
  "[&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-md [&_.ProseMirror_img]:border [&_.ProseMirror_img]:object-contain";

const EDITOR_BASE_CLASSES = cn(
  "overflow-hidden rounded-lg border bg-background text-sm",
  "[&_.ProseMirror]:outline-none",
  EDITOR_IMAGE_CLASSES
);

const PREVIEW_BASE_CLASSES = cn(
  "rounded-md border bg-muted/20 text-muted-foreground text-sm",
  "[&_.ProseMirror]:outline-none",
  EDITOR_IMAGE_CLASSES
);

export interface FieldRichTextEditorProps {
  ariaLabel: string;
  className?: string;
  editable?: boolean;
  editorMinHeightClass?: string;
  extensions?: EditorProviderProps["extensions"];
  id?: string;
  imageMaxHeightClass?: string;
  onChange: (value: string) => void;
  onDocumentChange?: (document: JSONContent, html: string) => void;
  placeholder?: string;
  testId?: string;
  value: string | JSONContent;
}

export function FieldRichTextEditor({
  ariaLabel,
  className,
  editable = true,
  editorMinHeightClass = "[&_.ProseMirror]:min-h-32",
  extensions,
  id,
  imageMaxHeightClass = "[&_.ProseMirror_img]:max-h-56",
  onChange,
  onDocumentChange,
  placeholder,
  testId,
  value,
}: FieldRichTextEditorProps) {
  return (
    <EditorProvider
      className={cn(
        EDITOR_BASE_CLASSES,
        editorMinHeightClass,
        "[&_.ProseMirror]:px-3 [&_.ProseMirror]:py-3",
        imageMaxHeightClass,
        className
      )}
      content={tiptapContent(value || "<p></p>")}
      editable={editable}
      editorContainerProps={{
        "aria-label": ariaLabel,
        className: "field-rich-text-editor-content",
        id,
        ...({ "data-testid": testId } as Record<string, string | undefined>),
      }}
      extensions={extensions}
      onUpdate={({ editor }) => {
        const html = editor.getHTML();
        onChange(html);
        onDocumentChange?.(editor.getJSON(), html);
      }}
      placeholder={placeholder}
      slotBefore={
        <FieldRichTextToolbar
          className={editable ? undefined : "pointer-events-none opacity-60"}
          disabled={!editable}
        />
      }
    >
      <FieldRichTextEditableSync editable={editable} />
      <FieldRichTextValueSync value={value} />
    </EditorProvider>
  );
}

function FieldRichTextEditableSync({ editable }: { editable: boolean }) {
  const { editor } = useCurrentEditor();

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return null;
}

function FieldRichTextValueSync({ value }: { value: string | JSONContent }) {
  const { editor } = useCurrentEditor();

  useEffect(() => {
    if (!editor) {
      return;
    }
    const nextValue = tiptapContent(
      typeof value === "string" ? value || "<p></p>" : value
    );
    const matches =
      typeof nextValue === "string"
        ? editor.getHTML() === nextValue
        : JSON.stringify(editor.getJSON()) === JSON.stringify(nextValue);
    if (!matches) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  return null;
}

export interface FieldRichTextPreviewProps {
  ariaLabel: string;
  className?: string;
  extensions?: EditorProviderProps["extensions"];
  imageMaxHeightClass?: string;
  value: string | JSONContent;
}

export function FieldRichTextPreview({
  ariaLabel,
  className,
  extensions,
  imageMaxHeightClass = "[&_.ProseMirror_img]:max-h-48",
  value,
}: FieldRichTextPreviewProps) {
  if (typeof value === "string" && !value.trim()) {
    return null;
  }

  return (
    <EditorProvider
      className={cn(
        PREVIEW_BASE_CLASSES,
        "[&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2",
        imageMaxHeightClass,
        className
      )}
      content={tiptapContent(value)}
      editable={false}
      editorContainerProps={{
        "aria-label": ariaLabel,
      }}
      extensions={extensions}
    />
  );
}

function FieldRichTextToolbar({
  className,
  disabled,
}: {
  className?: string;
  disabled: boolean;
}) {
  const [imageOpen, setImageOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (disabled) {
      setImageOpen(false);
      setLinkOpen(false);
    }
  }, [disabled]);

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "flex flex-wrap items-center gap-px border-b bg-muted/30 p-1",
        className
      )}
      inert={disabled}
      onClickCapture={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDownCapture={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      role="toolbar"
      tabIndex={disabled ? -1 : undefined}
    >
      <EditorFormatBold hideName />
      <EditorFormatItalic hideName />
      <EditorNodeHeading1 hideName />
      <EditorNodeHeading2 hideName />
      <EditorNodeHeading3 hideName />
      <EditorNodeBulletList hideName />
      <EditorNodeOrderedList hideName />
      <EditorNodeTaskList hideName />
      <EditorNodeTable hideName />
      <EditorLinkSelector
        onOpenChange={(open) => {
          if (!disabled) {
            setLinkOpen(open);
          }
        }}
        open={linkOpen}
      />
      <EditorImageSelector
        onOpenChange={(open) => {
          if (!disabled) {
            setImageOpen(open);
          }
        }}
        open={imageOpen}
      />
      <EditorClearFormatting hideName />
    </div>
  );
}
