import {
  FileText,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import type {
  ProductionKanbanCard,
  ProductionBuilderOption,
  ProductionKanban,
} from "./production-proposal-surface-contracts";
import { formatCents } from "./production-proposal-surface-shared";

export function ProductionProposalKanbanSurface({
  builders = [],
  controls,
  kanban,
  loadingMore = false,
  onLoadMore,
  onAssignBuilder,
  onDeleteDraft,
  onOpen,
}: {
  builders?: ProductionBuilderOption[];
  controls?: ReactNode;
  kanban: ProductionKanban;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onAssignBuilder?: (
    card: ProductionKanbanCard,
    builderProfileId: string
  ) => Promise<unknown> | unknown;
  onDeleteDraft?: (card: ProductionKanbanCard) => Promise<unknown> | unknown;
  onOpen?: (card: ProductionKanbanCard) => void;
}) {
  const [assignCard, setAssignCard] = useState<ProductionKanbanCard | null>(
    null
  );
  const [deleteCard, setDeleteCard] = useState<ProductionKanbanCard | null>(
    null
  );

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="p-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            Proposal kanban
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Production Build Proposals move only through workflow mutations.
            Right-click a card to assign a builder or delete a draft.
          </p>
          {controls ? (
            <div className="mt-4 border-t pt-4">{controls}</div>
          ) : null}
        </FramePanel>
      </Frame>
      <div className="grid gap-3 lg:grid-cols-4">
        {kanban.columns.map((column) => (
          <Card data-testid="production-kanban-column" key={column.id}>
            <CardHeader className="border-b p-4">
              <CardTitle className="text-base">{column.name}</CardTitle>
              <CardDescription>{column.cards.length} proposals</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-3">
              {column.cards.length === 0 ? (
                <p className="text-muted-foreground text-sm">No proposals.</p>
              ) : null}
              {column.cards.map((card) => (
                <ProposalKanbanCard
                  canAssign={Boolean(onAssignBuilder)}
                  canDelete={Boolean(onDeleteDraft)}
                  card={card}
                  key={card.proposalId}
                  onAssignRequest={() => setAssignCard(card)}
                  onDeleteRequest={() => setDeleteCard(card)}
                  onOpen={() => onOpen?.(card)}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {onLoadMore ? (
        <div className="flex justify-center">
          <Button loading={loadingMore} onClick={onLoadMore} variant="outline">
            Load more proposals
          </Button>
        </div>
      ) : null}
      <AssignBuilderDialog
        builders={builders}
        card={assignCard}
        onAssign={onAssignBuilder}
        onOpenChange={(open) => {
          if (!open) {
            setAssignCard(null);
          }
        }}
      />
      <DeleteDraftDialog
        card={deleteCard}
        onDelete={onDeleteDraft}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCard(null);
          }
        }}
      />
    </main>
  );
}

function ProposalKanbanCard({
  card,
  canAssign,
  canDelete,
  onAssignRequest,
  onDeleteRequest,
  onOpen,
}: {
  card: ProductionKanbanCard;
  canAssign: boolean;
  canDelete: boolean;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpen: () => void;
}) {
  const isDraft = card.column === "draft";
  const assigned =
    card.builderAssigned ?? !isUnassignedBuilderName(card.builderName);
  const showAssign = canAssign && isDraft && !assigned;
  const showDelete = canDelete && isDraft;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            className="w-full rounded-lg border bg-card p-3 text-left shadow-xs/5 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent/40"
            data-testid="production-kanban-card"
            onClick={onOpen}
            type="button"
          />
        }
      >
        <p className="font-medium text-sm leading-snug">{card.title}</p>
        {card.subtitle ? (
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {card.subtitle}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
          {assigned ? (
            <span className="flex min-w-0 items-start gap-1.5 text-foreground text-xs">
              <UserRound
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="grid min-w-0">
                <span className="truncate font-medium">{card.builderName}</span>
                {card.builderEmail ? (
                  <span className="truncate text-muted-foreground">
                    {card.builderEmail}
                  </span>
                ) : null}
              </span>
            </span>
          ) : (
            <span
              className="flex min-w-0 items-center gap-1.5 text-warning text-xs"
              data-testid="production-kanban-card-unassigned"
            >
              <UserRoundX aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate font-medium">Unassigned</span>
            </span>
          )}
          <span className="shrink-0 font-medium text-muted-foreground text-xs tabular-nums">
            {formatCents(card.totalBudgetCents)}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">{card.title}</ContextMenuLabel>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onOpen}>
          <FileText aria-hidden />
          Open
        </ContextMenuItem>
        {showAssign ? (
          <ContextMenuItem onClick={onAssignRequest}>
            <UserPlus aria-hidden />
            Assign builder
          </ContextMenuItem>
        ) : null}
        {showDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDeleteRequest} variant="destructive">
              <Trash2 aria-hidden />
              Delete draft
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function AssignBuilderDialog({
  builders,
  card,
  onAssign,
  onOpenChange,
}: {
  builders: ProductionBuilderOption[];
  card: ProductionKanbanCard | null;
  onAssign?: (
    card: ProductionKanbanCard,
    builderProfileId: string
  ) => Promise<unknown> | unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    setError(null);
    setPending(false);
  }, [card?.proposalId]);

  async function handleAssign() {
    if (!(card && selected && onAssign)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAssign(card, selected);
      onOpenChange(false);
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Could not assign builder."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={card !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign builder</DialogTitle>
          <DialogDescription>
            {card
              ? `Assign a builder to "${card.title}". This is only available while the proposal is an unassigned draft.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-1">
          {builders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active builders are available in this brokerage yet.
            </p>
          ) : (
            <Select
              onValueChange={(value) => setSelected(value as string)}
              value={selected ?? undefined}
            >
              <SelectTrigger data-testid="assign-builder-select">
                <SelectValue placeholder="Select a builder" />
              </SelectTrigger>
              <SelectContent>
                {builders.map((builder) => (
                  <SelectItem key={builder._id} value={builder._id}>
                    {builder.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {error ? (
            <p className="mt-2 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            data-testid="assign-builder-confirm"
            disabled={!selected}
            loading={pending}
            onClick={handleAssign}
          >
            Assign builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDraftDialog({
  card,
  onDelete,
  onOpenChange,
}: {
  card: ProductionKanbanCard | null;
  onDelete?: (card: ProductionKanbanCard) => Promise<unknown> | unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [card?.proposalId]);

  async function handleDelete() {
    if (!(card && onDelete)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(card);
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete draft."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={card !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft proposal</AlertDialogTitle>
          <AlertDialogDescription>
            {card
              ? `"${card.title}" and its draft plan will be permanently removed. This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button
            data-testid="delete-draft-confirm"
            loading={pending}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete draft
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isUnassignedBuilderName(builderName?: string) {
  return !builderName || builderName === "Unassigned builder";
}
