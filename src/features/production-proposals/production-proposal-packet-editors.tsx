import { Plus, Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { useIsMobile } from "#/hooks/use-media-query.ts";
import type {
  PacketSubmilestoneFormDraft,
  PacketMilestoneFormDraft,
  PacketSubmilestoneOverlayDraft,
} from "./production-proposal-surface-contracts";
import { digitDraftValue } from "./production-proposal-surface-shared";

export function PacketMilestoneEditorOverlay({
  draft,
  onAddSubmilestone,
  onClose,
  onDraftChange,
  onRemoveSubmilestone,
  onSave,
  onSubmilestoneChange,
  pending,
}: {
  draft: PacketMilestoneFormDraft | null;
  onAddSubmilestone: () => void;
  onClose: () => void;
  onDraftChange: (patch: Partial<PacketMilestoneFormDraft>) => void;
  onRemoveSubmilestone: (key: string) => void;
  onSave: () => void;
  onSubmilestoneChange: (
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) => void;
  pending: boolean;
}) {
  const isMobile = useIsMobile();
  const open = Boolean(draft);
  const title =
    draft?.mode === "create" ? "Add milestone" : "Edit milestone packet";
  const description =
    draft?.mode === "create"
      ? "Create a packet milestone with its schedule, budget, and submilestones."
      : "Update milestone scope, window, budget, and all submilestone rows.";
  const body = draft ? (
    <PacketMilestoneEditorForm
      draft={draft}
      onAddSubmilestone={onAddSubmilestone}
      onDraftChange={onDraftChange}
      onRemoveSubmilestone={onRemoveSubmilestone}
      onSubmilestoneChange={onSubmilestoneChange}
    />
  ) : null;
  const footer = (
    <>
      {isMobile ? (
        <DrawerClose render={<Button disabled={pending} variant="outline" />}>
          Cancel
        </DrawerClose>
      ) : (
        <SheetClose render={<Button disabled={pending} variant="outline" />}>
          Cancel
        </SheetClose>
      )}
      <Button loading={pending} onClick={onSave}>
        Save milestone
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
        <DrawerPopup className="max-h-[88dvh]" showBar showCloseButton>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerPanel>{body}</DrawerPanel>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerPopup>
      </Drawer>
    );
  }

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetPanel>{body}</SheetPanel>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PacketMilestoneEditorForm({
  draft,
  onAddSubmilestone,
  onDraftChange,
  onRemoveSubmilestone,
  onSubmilestoneChange,
}: {
  draft: PacketMilestoneFormDraft;
  onAddSubmilestone: () => void;
  onDraftChange: (patch: Partial<PacketMilestoneFormDraft>) => void;
  onRemoveSubmilestone: (key: string) => void;
  onSubmilestoneChange: (
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="packet-milestone-name">Scope</Label>
          <Input
            id="packet-milestone-name"
            onChange={(event) =>
              onDraftChange({ name: event.currentTarget.value })
            }
            placeholder="Permits, demo & foundation"
            value={draft.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="packet-milestone-start">Start day</Label>
          <Input
            id="packet-milestone-start"
            inputMode="numeric"
            onChange={(event) =>
              onDraftChange({
                dayStart: digitDraftValue(event.currentTarget.value),
              })
            }
            value={draft.dayStart}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="packet-milestone-end">End day</Label>
          <Input
            id="packet-milestone-end"
            inputMode="numeric"
            onChange={(event) =>
              onDraftChange({
                dayEnd: digitDraftValue(event.currentTarget.value),
              })
            }
            value={draft.dayEnd}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="packet-milestone-budget">Budget dollars</Label>
          <Input
            id="packet-milestone-budget"
            inputMode="decimal"
            onChange={(event) =>
              onDraftChange({ budgetDollars: event.currentTarget.value })
            }
            value={draft.budgetDollars}
          />
        </div>
      </div>

      <div className="grid gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm">Submilestones</h3>
            <p className="text-muted-foreground text-xs">
              Edit the full packet breakdown that rolls up to this milestone.
            </p>
          </div>
          <Button onClick={onAddSubmilestone} size="sm" variant="outline">
            <Plus aria-hidden />
            Add submilestone
          </Button>
        </div>

        {draft.submilestones.length > 0 ? (
          <div className="grid gap-3">
            {draft.submilestones.map((submilestone, index) => (
              <div
                className="grid gap-3 rounded-lg border bg-muted/20 p-3"
                key={submilestone.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-xs">
                    Submilestone {index + 1}
                  </span>
                  <Button
                    aria-label={`Remove ${submilestone.name || `submilestone ${index + 1}`}`}
                    onClick={() => onRemoveSubmilestone(submilestone.key)}
                    size="icon-xs"
                    title="Remove submilestone"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_6rem_6rem_8rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={`packet-submilestone-${submilestone.key}`}>
                      Name
                    </Label>
                    <Input
                      id={`packet-submilestone-${submilestone.key}`}
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          name: event.currentTarget.value,
                        })
                      }
                      value={submilestone.name}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-start-${submilestone.key}`}
                    >
                      Start
                    </Label>
                    <Input
                      id={`packet-submilestone-start-${submilestone.key}`}
                      inputMode="numeric"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          startDay: digitDraftValue(event.currentTarget.value),
                        })
                      }
                      value={submilestone.startDay}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-end-${submilestone.key}`}
                    >
                      End
                    </Label>
                    <Input
                      id={`packet-submilestone-end-${submilestone.key}`}
                      inputMode="numeric"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          dayEnd: digitDraftValue(event.currentTarget.value),
                        })
                      }
                      value={submilestone.dayEnd}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-budget-${submilestone.key}`}
                    >
                      Budget
                    </Label>
                    <Input
                      id={`packet-submilestone-budget-${submilestone.key}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          budgetDollars: event.currentTarget.value,
                        })
                      }
                      value={submilestone.budgetDollars}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
            No submilestones yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function PacketSubmilestoneOverlay({
  draft,
  onClose,
  onDraftChange,
  onEndDayChange,
  onSave,
  onStartDayChange,
}: {
  draft: PacketSubmilestoneOverlayDraft | null;
  onClose: () => void;
  onDraftChange: (patch: Partial<PacketSubmilestoneOverlayDraft>) => void;
  onEndDayChange: (value: string) => void;
  onSave: () => void;
  onStartDayChange: (value: string) => void;
}) {
  const isMobile = useIsMobile();
  const open = Boolean(draft);
  const body = draft ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="packet-new-submilestone-name">Name</Label>
        <Input
          id="packet-new-submilestone-name"
          onChange={(event) =>
            onDraftChange({ name: event.currentTarget.value })
          }
          placeholder="Excavation and foundation"
          value={draft.name}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="packet-new-submilestone-start">Start day</Label>
        <Input
          id="packet-new-submilestone-start"
          inputMode="numeric"
          onChange={(event) => onStartDayChange(event.currentTarget.value)}
          value={draft.startDay}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="packet-new-submilestone-end">End day</Label>
        <Input
          id="packet-new-submilestone-end"
          inputMode="numeric"
          onChange={(event) => onEndDayChange(event.currentTarget.value)}
          value={draft.dayEnd}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="packet-new-submilestone-budget">Budget dollars</Label>
        <Input
          id="packet-new-submilestone-budget"
          inputMode="decimal"
          onChange={(event) =>
            onDraftChange({ budgetDollars: event.currentTarget.value })
          }
          value={draft.budgetDollars}
        />
      </div>
    </div>
  ) : null;
  const footer = (
    <>
      {isMobile ? (
        <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
      ) : (
        <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
      )}
      <Button onClick={onSave}>Add submilestone</Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
        <DrawerPopup className="max-h-[82dvh]" showBar showCloseButton>
          <DrawerHeader>
            <DrawerTitle>Add submilestone</DrawerTitle>
            <DrawerDescription>
              Add a scoped packet row to the active milestone.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerPanel>{body}</DrawerPanel>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerPopup>
      </Drawer>
    );
  }

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add submilestone</SheetTitle>
          <SheetDescription>
            Add a scoped packet row to the active milestone.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>{body}</SheetPanel>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
