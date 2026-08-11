import { CircleDot } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { BuildCollaborationActionItemQueue } from "./BuildCollaborationActionItems.tsx";
import type {
  CollaborationActionItemQueueRow,
  FocusedReference,
} from "./model.ts";

export function BuildCollaborationReferenceChip({
  onOpen,
  reference,
}: {
  onOpen: () => void;
  reference: { eyebrow: string; label: string; summary: string };
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            className="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/15 px-3 py-2 text-left hover:bg-muted/30"
            onClick={onOpen}
            type="button"
          />
        }
      >
        <CircleDot
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
        <span className="min-w-0">
          <span className="block truncate font-medium text-xs">
            {reference.label}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {reference.summary}
          </span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <p className="font-medium text-foreground text-xs uppercase tracking-wide">
          {reference.eyebrow}
        </p>
        <p className="mt-2 font-semibold text-sm">{reference.label}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {reference.summary}
        </p>
        <p className="mt-3 text-muted-foreground text-xs">
          Click to open the focused Build detail.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

export function BuildCollaborationReferenceSheet({
  actionItems = [],
  actionItemsHasMore = false,
  actionItemsLoading = false,
  actionItemsLoadingMore = false,
  onLoadMoreActionItems,
  focusedWorkspace = false,
  onOpenActionItem,
  onOpenChange,
  onOpenWorkspace,
  reference,
}: {
  actionItems?: CollaborationActionItemQueueRow[];
  actionItemsHasMore?: boolean;
  actionItemsLoading?: boolean;
  actionItemsLoadingMore?: boolean;
  focusedWorkspace?: boolean;
  onOpenActionItem: (row: CollaborationActionItemQueueRow) => void;
  onOpenChange: (open: boolean) => void;
  onLoadMoreActionItems?: () => void;
  onOpenWorkspace: () => void;
  reference: FocusedReference | null;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(reference)}>
      <SheetPopup
        data-reference-key={
          reference ? `${reference.entityKind}:${reference.id}` : undefined
        }
        data-testid="build-collaboration-focused-reference"
      >
        <SheetHeader>
          <SheetTitle>{reference?.label ?? "Build reference"}</SheetTitle>
          <SheetDescription>
            {reference?.eyebrow ?? "Referenced Build work"}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-4">
          <Frame>
            <FramePanel>
              <p className="text-muted-foreground text-sm">
                {reference?.summary}
              </p>
            </FramePanel>
          </Frame>
          {reference && reference.entityKind !== "participant" ? (
            <BuildCollaborationActionItemQueue
              emptyLabel="No open Action Items reference this work."
              hasMore={actionItemsHasMore}
              loading={actionItemsLoading}
              loadingMore={actionItemsLoadingMore}
              onLoadMore={onLoadMoreActionItems}
              onOpen={onOpenActionItem}
              rows={actionItems}
              title="Related Action Items"
            />
          ) : null}
          {focusedWorkspace ? (
            <p className="text-muted-foreground text-sm">
              Focused participant detail for this Build.
            </p>
          ) : (
            <Button className="w-full" onClick={onOpenWorkspace} type="button">
              Open focused workspace
            </Button>
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
