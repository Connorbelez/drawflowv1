"use client";

import { useState } from "react";
import {
  EditorClearFormatting,
  EditorFormatBold,
  EditorFormatItalic,
  EditorImageSelector,
  EditorLinkSelector,
  EditorNodeBulletList,
  EditorNodeOrderedList,
  EditorProvider,
} from "#/components/kibo-ui/editor/index.tsx";
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

export type FieldRichTextEditorProps = {
  ariaLabel: string;
  className?: string;
  editorMinHeightClass?: string;
  id?: string;
  imageMaxHeightClass?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  value: string;
};

export function FieldRichTextEditor({
  ariaLabel,
  className,
  editorMinHeightClass = "[&_.ProseMirror]:min-h-32",
  id,
  imageMaxHeightClass = "[&_.ProseMirror_img]:max-h-56",
  onChange,
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
      content={value || "<p></p>"}
      editorContainerProps={{
        "aria-label": ariaLabel,
        className: "field-rich-text-editor-content",
        "data-testid": testId,
        id,
      }}
      onUpdate={({ editor }) => onChange(editor.getHTML())}
      placeholder={placeholder}
      slotBefore={<FieldRichTextToolbar />}
    />
  );
}

export type FieldRichTextPreviewProps = {
  ariaLabel: string;
  className?: string;
  imageMaxHeightClass?: string;
  value: string;
};

export function FieldRichTextPreview({
  ariaLabel,
  className,
  imageMaxHeightClass = "[&_.ProseMirror_img]:max-h-48",
  value,
}: FieldRichTextPreviewProps) {
  if (!value.trim()) {
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
      content={value}
      editable={false}
      editorContainerProps={{
        "aria-label": ariaLabel,
      }}
    />
  );
}

function FieldRichTextToolbar() {
  const [imageOpen, setImageOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-px border-b bg-muted/30 p-1">
      <EditorFormatBold hideName />
      <EditorFormatItalic hideName />
      <EditorNodeBulletList hideName />
      <EditorNodeOrderedList hideName />
      <EditorLinkSelector onOpenChange={setLinkOpen} open={linkOpen} />
      <EditorImageSelector onOpenChange={setImageOpen} open={imageOpen} />
      <EditorClearFormatting hideName />
    </div>
  );
}
