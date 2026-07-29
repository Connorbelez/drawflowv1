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
import type { FocusedReference } from "./model.ts";

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
        <p className="font-medium text-primary text-xs uppercase tracking-wide">
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
  focusedWorkspace = false,
  onOpenChange,
  onOpenWorkspace,
  reference,
}: {
  focusedWorkspace?: boolean;
  onOpenChange: (open: boolean) => void;
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
