"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/react";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
} from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  AtSign,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  Flag,
  HardHat,
  Image,
  PackageCheck,
  Star,
  UserRound,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { cn } from "#/lib/utils.ts";

export type CollaborationTagKind =
  | "action_item"
  | "document"
  | "draw"
  | "evidence"
  | "material"
  | "milestone"
  | "participant"
  | "site_visit"
  | "submilestone";

export interface CollaborationTagOption {
  eyebrow: string;
  id: string;
  initials?: string;
  kind: CollaborationTagKind;
  label: string;
  searchTerms?: string[];
  summary: string;
}

export interface CollaborationTagReference {
  eyebrow: string;
  id: string;
  kind: CollaborationTagKind;
  label: string;
  summary: string;
}

interface CollaborationRichTextEditorProps {
  ariaLabel: string;
  className?: string;
  editorMinHeightClass?: string;
  onChange: (value: string, references: CollaborationTagReference[]) => void;
  onDocumentChange?: (
    document: JSONContent,
    html: string,
    references: CollaborationTagReference[]
  ) => void;
  placeholder: string;
  tagOptions: CollaborationTagOption[];
  value: string | JSONContent;
}

interface CollaborationRichTextPreviewProps {
  ariaLabel: string;
  className?: string;
  onReferenceOpen?: (reference: CollaborationTagReference) => void;
  tagOptions: CollaborationTagOption[];
  value: string | JSONContent;
}

interface TagNodeAttributes {
  eyebrow: string | null;
  id: string | null;
  kind: CollaborationTagKind | null;
  label: string | null;
  summary: string | null;
}

interface TagMenuProps {
  command: (option: CollaborationTagOption) => void;
  items: CollaborationTagOption[];
}

const TAG_MENU_SELECTOR = "[data-collaboration-tag-menu]";

export function CollaborationRichTextEditor({
  ariaLabel,
  className,
  editorMinHeightClass,
  onChange,
  onDocumentChange,
  placeholder,
  tagOptions,
  value,
}: CollaborationRichTextEditorProps) {
  const tagExtension = useMemo(
    () => createTagExtension(tagOptions),
    [tagOptions]
  );

  return (
    <FieldRichTextEditor
      ariaLabel={ariaLabel}
      className={className}
      editorMinHeightClass={editorMinHeightClass}
      extensions={[tagExtension]}
      onChange={(nextValue) =>
        onChange(nextValue, extractTagReferences(nextValue, tagOptions))
      }
      onDocumentChange={(document, html) =>
        onDocumentChange?.(
          document,
          html,
          extractTagReferences(html, tagOptions)
        )
      }
      placeholder={placeholder}
      value={value}
    />
  );
}

export function CollaborationRichTextPreview({
  ariaLabel,
  className,
  onReferenceOpen,
  tagOptions,
  value,
}: CollaborationRichTextPreviewProps) {
  const tagExtension = useMemo(
    () => createTagExtension(tagOptions, onReferenceOpen),
    [onReferenceOpen, tagOptions]
  );

  return (
    <FieldRichTextPreview
      ariaLabel={ariaLabel}
      className={className}
      extensions={[tagExtension]}
      value={value}
    />
  );
}

function createTagExtension(
  options: CollaborationTagOption[],
  onReferenceOpen?: (reference: CollaborationTagReference) => void
) {
  const pluginKey = new PluginKey("collaboration-tag");

  return Node.create({
    name: "collaborationMention",
    priority: 110,
    group: "inline",
    inline: true,
    selectable: false,
    atom: true,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-reference-id") ??
            element.getAttribute("data-participant-id"),
          renderHTML: (attributes: TagNodeAttributes) =>
            attributes.id ? { "data-reference-id": attributes.id } : {},
        },
        kind: {
          default: "participant",
          parseHTML: (element) =>
            element.getAttribute(
              "data-reference-kind"
            ) as CollaborationTagKind | null,
          renderHTML: (attributes: TagNodeAttributes) =>
            attributes.kind ? { "data-reference-kind": attributes.kind } : {},
        },
        label: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-label"),
          renderHTML: (attributes: TagNodeAttributes) =>
            attributes.label ? { "data-label": attributes.label } : {},
        },
        eyebrow: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-eyebrow"),
          renderHTML: (attributes: TagNodeAttributes) =>
            attributes.eyebrow ? { "data-eyebrow": attributes.eyebrow } : {},
        },
        summary: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-summary"),
          renderHTML: (attributes: TagNodeAttributes) =>
            attributes.summary ? { "data-summary": attributes.summary } : {},
        },
      };
    },

    parseHTML() {
      return [
        { tag: 'span[data-type="collaboration-reference"]' },
        { tag: 'span[data-type="collaboration-mention"]' },
      ];
    },

    renderHTML({ HTMLAttributes, node }) {
      return [
        "span",
        mergeAttributes(
          {
            class:
              "rounded bg-primary/10 px-1 font-medium text-primary ring-1 ring-primary/15",
            "data-type": "collaboration-reference",
          },
          HTMLAttributes
        ),
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },

    renderText({ node }: { node: ProseMirrorNode }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },

    addNodeView() {
      return ReactNodeViewRenderer((props) => (
        <TagNodeView
          {...props}
          onReferenceOpen={onReferenceOpen}
          options={options}
        />
      ));
    },

    addKeyboardShortcuts() {
      return {
        Backspace: () =>
          this.editor.commands.command(({ state, tr }) => {
            const { anchor, empty } = state.selection;
            if (!empty || anchor === 0) {
              return false;
            }
            let tagDeleted = false;
            state.doc.nodesBetween(anchor - 1, anchor, (node, position) => {
              if (node.type.name !== this.name) {
                return;
              }
              tagDeleted = true;
              tr.insertText("@", position, position + node.nodeSize);
            });
            return tagDeleted;
          }),
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion<CollaborationTagOption, TagNodeAttributes>({
          editor: this.editor,
          char: "@",
          pluginKey,
          allowSpaces: true,
          items: ({ query }) => {
            const normalizedQuery = query.trim().toLowerCase();
            return options
              .map((option) => {
                const searchable = [
                  option.label,
                  option.eyebrow,
                  option.summary,
                  ...(option.searchTerms ?? []),
                ].map((value) => value.toLowerCase());
                return {
                  labelMatches: option.label
                    .toLowerCase()
                    .includes(normalizedQuery),
                  matches:
                    !normalizedQuery ||
                    searchable.some((value) => value.includes(normalizedQuery)),
                  option,
                };
              })
              .filter(({ matches }) => matches)
              .sort(
                (left, right) =>
                  Number(right.labelMatches) - Number(left.labelMatches)
              )
              .slice(0, 12)
              .map(({ option }) => option);
          },
          command: ({ editor, props, range }) => {
            const nodeAfter = editor.view.state.selection.$to.nodeAfter;
            if (nodeAfter?.text?.startsWith(" ")) {
              range.to += 1;
            }
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  attrs: {
                    eyebrow: props.eyebrow,
                    id: props.id,
                    kind: props.kind,
                    label: props.label,
                    summary: props.summary,
                  },
                  type: this.name,
                },
                { text: " ", type: "text" },
              ])
              .run();
          },
          allow: ({ range, state }) => {
            const $from = state.doc.resolve(range.from);
            const type = state.schema.nodes[this.name];
            return Boolean(
              type && $from.parent.type.contentMatch.matchType(type)
            );
          },
          render: renderTagSuggestions,
        }),
      ];
    },
  });
}

function TagNodeView({
  node,
  onReferenceOpen,
  options,
}: NodeViewProps & {
  onReferenceOpen?: (reference: CollaborationTagReference) => void;
  options: CollaborationTagOption[];
}) {
  const attrs = node.attrs as TagNodeAttributes;
  const reference = resolveReference(attrs, options);
  const interactive =
    reference.kind !== "participant" && Boolean(onReferenceOpen);

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <HoverCard>
        <HoverCardTrigger
          render={
            <button
              aria-label={`Open ${reference.eyebrow}: ${reference.label}`}
              className={cn(
                "inline-flex items-center gap-1 rounded bg-primary/10 px-1 font-medium text-primary ring-1 ring-primary/15 transition-colors",
                interactive &&
                  "cursor-pointer hover:bg-primary/15 hover:ring-primary/30"
              )}
              onClick={() =>
                interactive ? onReferenceOpen?.(reference) : undefined
              }
              type="button"
            />
          }
        >
          {tagIcon(reference.kind, "size-3")}@{reference.label}
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-80 p-3" side="top">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {tagIcon(reference.kind, "size-4")}
            </span>
            <div className="min-w-0">
              <Badge variant="outline">{reference.eyebrow}</Badge>
              <p className="mt-2 font-semibold text-sm">{reference.label}</p>
              <p className="mt-1 text-muted-foreground">{reference.summary}</p>
            </div>
          </div>
          {interactive ? (
            <p className="mt-3 flex items-center gap-1 border-t pt-2 font-medium text-primary">
              <ExternalLink className="size-3" />
              Click the reference to open its detail
            </p>
          ) : null}
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}

function renderTagSuggestions() {
  let component: ReactRenderer<TagMenuProps> | null = null;
  let popup: TippyInstance | null = null;

  return {
    onStart: (
      props: TagMenuProps & { clientRect?: (() => DOMRect) | null }
    ) => {
      component = new ReactRenderer(TagMenu, {
        editor: (props as { editor: never }).editor,
        props,
      });
      popup = tippy(document.body, {
        appendTo: () => document.body,
        content: component.element,
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        hideOnClick: false,
        interactive: true,
        maxWidth: "none",
        offset: [0, 8],
        placement: "bottom-start",
        showOnCreate: true,
        trigger: "manual",
        zIndex: 80,
      });
    },
    onUpdate: (
      props: TagMenuProps & { clientRect?: (() => DOMRect) | null }
    ) => {
      component?.updateProps(props);
      popup?.setProps({
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
      });
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "Escape") {
        popup?.hide();
        return true;
      }
      return forwardTagMenuKey(event);
    },
    onExit: () => {
      popup?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

function TagMenu({ command, items }: TagMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  const choose = useCallback(
    (option: CollaborationTagOption | undefined) => {
      if (option) {
        command(option);
      }
    },
    [command]
  );

  return (
    <Frame className="w-96 max-w-[calc(100vw-2rem)] shadow-xl">
      <FramePanel
        className="max-h-96 overflow-y-auto p-1"
        data-collaboration-tag-menu
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) =>
              items.length ? (current - 1 + items.length) % items.length : 0
            );
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) =>
              items.length ? (current + 1) % items.length : 0
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            choose(items[safeActiveIndex]);
          }
        }}
        role="listbox"
      >
        <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs">
          <AtSign className="size-3.5" />
          Tag people or Build work
        </div>
        {items.length ? (
          items.map((option, index) => (
            <Button
              aria-selected={safeActiveIndex === index}
              className="h-auto w-full justify-start px-2 py-2"
              key={`${option.kind}:${option.id}`}
              onClick={() => choose(option)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              variant={safeActiveIndex === index ? "secondary" : "ghost"}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-xs">
                {option.initials ?? tagIcon(option.kind, "size-4")}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm">{option.label}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {option.eyebrow} · {option.summary}
                </span>
              </span>
            </Button>
          ))
        ) : (
          <p className="px-2 py-3 text-center text-muted-foreground text-xs">
            No accessible people or Build work match
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function resolveReference(
  attrs: TagNodeAttributes,
  options: CollaborationTagOption[]
): CollaborationTagReference {
  const matched = options.find(
    (option) =>
      option.id === attrs.id && option.kind === (attrs.kind ?? "participant")
  );
  if (!matched) {
    return {
      eyebrow: "Build reference",
      id: "unavailable",
      kind: "participant",
      label: "Unavailable reference",
      summary: "This reference is no longer available to you.",
    };
  }
  return {
    eyebrow: matched.eyebrow,
    id: matched.id,
    kind: matched.kind,
    label: matched.label,
    summary: matched.summary,
  };
}

export function extractTagReferences(
  value: string,
  options: CollaborationTagOption[]
) {
  const references: CollaborationTagReference[] = [];
  for (const match of value.matchAll(
    /<span[^>]+data-type="collaboration-(?:reference|mention)"[^>]*>/g
  )) {
    const element = match[0];
    const id =
      readAttribute(element, "data-reference-id") ??
      readAttribute(element, "data-participant-id");
    if (!id) {
      continue;
    }
    const kind =
      (readAttribute(
        element,
        "data-reference-kind"
      ) as CollaborationTagKind | null) ?? "participant";
    const reference = resolveReference(
      {
        eyebrow: readAttribute(element, "data-eyebrow"),
        id,
        kind,
        label: readAttribute(element, "data-label"),
        summary: readAttribute(element, "data-summary"),
      },
      options
    );
    if (
      !references.some(
        (candidate) =>
          candidate.id === reference.id && candidate.kind === reference.kind
      )
    ) {
      references.push(reference);
    }
  }
  return references;
}

function readAttribute(element: string, attribute: string) {
  return element.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? null;
}

function forwardTagMenuKey(event: KeyboardEvent) {
  if (!["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
    return false;
  }
  const menu = document.querySelector(TAG_MENU_SELECTOR);
  if (!menu) {
    return false;
  }
  menu.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: event.key,
    })
  );
  return true;
}

function tagIcon(kind: CollaborationTagKind, className?: string) {
  const props = { className };
  if (kind === "participant") {
    return <UserRound {...props} />;
  }
  if (kind === "milestone") {
    return <Star {...props} />;
  }
  if (kind === "submilestone") {
    return <Flag {...props} />;
  }
  if (kind === "evidence") {
    return <Image {...props} />;
  }
  if (kind === "site_visit") {
    return <HardHat {...props} />;
  }
  if (kind === "document") {
    return <FileText {...props} />;
  }
  if (kind === "action_item") {
    return <ClipboardCheck {...props} />;
  }
  if (kind === "draw") {
    return <Clock3 {...props} />;
  }
  return <PackageCheck {...props} />;
}
