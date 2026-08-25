"use client";
import type React from "react";
import { useEffect, } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildCollaborationSearchResult,
} from "./BuildCollaborationSearch.tsx";
import "./build-collaboration.css";
import {
  type CollaborationFeedEntry,
  type CollaborationFeedPostEntry,
  type ReferenceOption,
  roleLabel,
  toEditorReferenceKind,
} from "./model.ts";
export function SummaryCard({
  description,
  icon,
  title,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 p-4">
        <span className="text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {description}
          </CardDescription>
        </div>
        <Badge variant="secondary">{value}</Badge>
      </CardHeader>
    </Card>
  );
}

export function FocusedDiscussionStatus({
  focused,
  postHydrated,
  state,
}: {
  focused: boolean;
  postHydrated: boolean;
  state?: "revoked" | "visible";
}) {
  if (!focused) {
    return null;
  }
  if (state === undefined || (state === "visible" && !postHydrated)) {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          Loading focused discussion…
        </FramePanel>
      </Frame>
    );
  }
  if (state === "revoked") {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          This focused discussion is unavailable or your access was revoked.
        </FramePanel>
      </Frame>
    );
  }
  return null;
}

export function FocusedPostStatus({
  focused,
  state,
}: {
  focused: boolean;
  state?: "revoked" | "visible";
}) {
  if (!focused || state === "visible") {
    return null;
  }
  return (
    <Frame>
      <FramePanel aria-live="polite" className="text-muted-foreground text-sm">
        {state === "revoked"
          ? "This focused post is unavailable or your access was revoked."
          : "Loading focused post…"}
      </FramePanel>
    </Frame>
  );
}

export function mergeFocusedPostEntry(
  entries: CollaborationFeedEntry[],
  context?:
    | { entry: CollaborationFeedPostEntry; state: "visible" }
    | { state: "revoked" }
) {
  if (
    context?.state !== "visible" ||
    entries.some(
      (entry) =>
        entry.kind === "post" && entry.post._id === context.entry.post._id
    )
  ) {
    return entries;
  }
  return [context.entry, ...entries];
}

export function focusedPostCollaborationResults({
  feedEntries,
  focusedPostId,
  otherwise,
}: {
  feedEntries: CollaborationFeedEntry[];
  focusedPostId?: string;
  otherwise: CollaborationFeedEntry[];
}) {
  if (!focusedPostId) {
    return otherwise;
  }
  const focusedPostEntry = feedEntries.find(
    (entry): entry is CollaborationFeedPostEntry =>
      entry.kind === "post" && entry.post._id === focusedPostId
  );
  if (!focusedPostEntry) {
    return otherwise;
  }
  return otherwise.some(
    (entry) =>
      entry.kind === "post" && entry.post._id === focusedPostEntry.post._id
  )
    ? otherwise
    : [focusedPostEntry, ...otherwise];
}

export function useFocusedCollaborationPostCard(
  cardRef: React.RefObject<HTMLDivElement | null>,
  focused: boolean
) {
  useEffect(() => {
    if (!focused) {
      return;
    }
    cardRef.current?.focus({ preventScroll: true });
  }, [cardRef, focused]);
}

export function focusedPostCardPresentation(focused: boolean) {
  if (!focused) {
    return {
      className: undefined,
      dataFocused: undefined,
      tabIndex: undefined,
    };
  }
  return {
    className: "ring-2 ring-primary ring-offset-2",
    dataFocused: "true",
    tabIndex: -1,
  } as const;
}

export function focusedCommentCollaborationResults({
  context,
  feedEntries,
  focusedCommentId,
  visibleResults,
}: {
  context?:
    | { state: "revoked" }
    | { postId: Id<"buildCollaborationPosts">; state: "visible" };
  feedEntries: CollaborationFeedEntry[];
  focusedCommentId?: Id<"buildCollaborationComments">;
  visibleResults: CollaborationFeedEntry[];
}) {
  if (!focusedCommentId || context?.state === "revoked") {
    return { displayedResults: visibleResults, focusedPostEntry: undefined };
  }
  if (context?.state !== "visible") {
    return {
      displayedResults: visibleResults,
      focusedPostEntry: undefined,
    };
  }
  const focusedPostEntry = feedEntries.find(
    (entry): entry is CollaborationFeedPostEntry =>
      entry.kind === "post" && entry.post._id === context.postId
  );
  return {
    displayedResults:
      focusedPostEntry &&
      !visibleResults.some(
        (entry) =>
          entry.kind === "post" && entry.post._id === focusedPostEntry.post._id
      )
        ? [focusedPostEntry, ...visibleResults]
        : visibleResults,
    focusedPostEntry,
  };
}

export function searchResultReference(result: BuildCollaborationSearchResult) {
  if (result.focusEntityKind && result.focusEntityId) {
    return {
      entityId: result.focusEntityId,
      entityKind: result.focusEntityKind,
    };
  }
  switch (result.resultType) {
    case "comment":
      return { entityId: result.commentId ?? result.id, entityKind: "comment" };
    case "actionItem":
      return {
        entityId: result.actionItemId ?? result.id,
        entityKind: "actionItem",
      };
    case "asset":
      return {
        entityId: result.entityId ?? result.id,
        entityKind: "asset",
      };
    case "reference":
      return {
        entityId: result.entityId ?? result.id,
        entityKind: result.entityKind ?? "milestone",
      };
    default:
      return { entityId: result.postId, entityKind: "post" };
  }
}

export function collaborationReferencesForEditor(
  references: CollaborationFeedPostEntry["references"],
  referenceByKey: Map<string, ReferenceOption>
) {
  return references.map((reference) => {
    const kind = toEditorReferenceKind(reference.entityKind);
    const option = referenceByKey.get(`${kind}:${reference.entityId}`);
    return {
      eyebrow: option?.eyebrow ?? roleLabel(reference.entityKind),
      id: reference.entityId,
      kind,
      label: option?.label ?? reference.labelSnapshot,
      summary:
        option?.summary ??
        reference.summarySnapshot ??
        "Referenced on this Build",
    };
  });
}
