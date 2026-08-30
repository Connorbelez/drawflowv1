import { ClientOnly, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
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
  DialogPanel,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { ProposalCardDetailSheet } from "#/features/backoffice-dashboard/kanban-card-detail-sheet.tsx";
import type {
  DashboardKanbanColumn,
  ProposalKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "#/features/backoffice-dashboard/readonly-kanban.tsx";
import type { ProductionBuilderOption } from "./-backoffice-queue-surfaces.tsx";
import { ArchiveProposalDialog } from "./-backoffice-queue-surfaces.tsx";

export function ProposalKanban({
  builders,
  columns,
  controls,
  loadingMore = false,
  onActivateClosedProposal,
  onArchiveProposal,
  onAssignBuilder,
  onDeleteDraft,
  onLoadMore,
  onOpenApprovedProposal,
  onRecordClosing,
  onStartNewBuildWorkflow = () => undefined,
  proposals,
}: {
  builders: ProductionBuilderOption[];
  columns: DashboardKanbanColumn[];
  controls?: ReactElement;
  loadingMore?: boolean;
  onActivateClosedProposal?: (proposal: ProposalKanbanCard) => void;
  onArchiveProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onAssignBuilder: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onDeleteDraft: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onLoadMore?: () => void;
  onOpenApprovedProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  onStartNewBuildWorkflow?: () => Promise<unknown> | unknown;
  proposals: ProposalKanbanCard[];
}) {
  const [assignTarget, setAssignTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const [archiveTarget, setArchiveTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const navigate = useNavigate();
  const [activeProposal, setActiveProposal] =
    useState<ProposalKanbanCard | null>(null);
  useEffect(() => {
    if (!activeProposal) {
      return;
    }
    const latest = proposals.find((entry) => entry.id === activeProposal.id);
    if (latest && latest !== activeProposal) {
      setActiveProposal(latest);
    } else if (!latest) {
      setActiveProposal(null);
    }
  }, [activeProposal, proposals]);

  return (
    <>
      <Card id="proposals-kanban">
        <CardHeader className="flex flex-col items-stretch gap-3 border-b p-4">
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Builds - Proposals</CardTitle>
              <CardDescription>Pipeline by stage</CardDescription>
            </div>
            <Button
              className="shrink-0"
              onClick={onStartNewBuildWorkflow}
              variant="outline"
            >
              <Plus />
              Draft new
            </Button>
          </div>
          {controls ? (
            <div className="w-full min-w-0 border-t pt-3">{controls}</div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <ClientOnly fallback={<div className="min-h-96 min-w-4xl" />}>
            <KanbanProvider
              className="min-h-96 min-w-4xl gap-0"
              columns={columns}
              data={proposals}
            >
              {(column) => (
                <KanbanBoard
                  className="rounded-none border-0 border-r bg-card shadow-none ring-0 last:border-r-0"
                  id={column.id}
                  key={column.id}
                >
                  <KanbanHeader className="border-b p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span>{column.name}</span>
                        <Badge variant="outline">
                          {
                            proposals.filter(
                              (card) => card.column === column.id
                            ).length
                          }
                        </Badge>
                      </div>
                      {column.id === "draft" ? (
                        <Button
                          aria-label="Draft new proposal"
                          onClick={onStartNewBuildWorkflow}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <Plus />
                        </Button>
                      ) : null}
                    </div>
                  </KanbanHeader>
                  <KanbanCards<ProposalKanbanCard>
                    className="gap-3 p-3"
                    id={column.id}
                  >
                    {(card) => (
                      <ProposalCard
                        card={card}
                        onActivateRequest={
                          onActivateClosedProposal
                            ? () => onActivateClosedProposal(card)
                            : undefined
                        }
                        onArchiveRequest={() => setArchiveTarget(card)}
                        onAssignRequest={() => setAssignTarget(card)}
                        onDeleteRequest={() => setDeleteTarget(card)}
                        onOpenApprovedProposal={onOpenApprovedProposal}
                        onRecordClosing={onRecordClosing}
                        onSelect={(selected) => {
                          if (selected.column === "approved") {
                            onOpenApprovedProposal(selected);
                            return;
                          }
                          if (
                            selected.href?.startsWith("/backoffice/proposals/")
                          ) {
                            navigate({
                              params: { planId: selected.id },
                              to: "/backoffice/proposals/$planId",
                            });
                            return;
                          }
                          setActiveProposal(selected);
                        }}
                      />
                    )}
                  </KanbanCards>
                </KanbanBoard>
              )}
            </KanbanProvider>
          </ClientOnly>
        </CardContent>
        {onLoadMore ? (
          <div className="flex justify-center border-t p-3">
            <Button
              loading={loadingMore}
              onClick={onLoadMore}
              variant="outline"
            >
              Load more proposals
            </Button>
          </div>
        ) : null}
      </Card>
      <ProposalCardDetailSheet
        card={activeProposal}
        columns={columns}
        onOpenChange={(open) => {
          if (!open) {
            setActiveProposal(null);
          }
        }}
      />
      <AssignBuilderDialog
        builders={builders}
        card={assignTarget}
        onAssign={onAssignBuilder}
        onOpenChange={(open) => {
          if (!open) {
            setAssignTarget(null);
          }
        }}
      />
      <ArchiveProposalDialog
        onArchive={onArchiveProposal}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
        proposal={archiveTarget}
      />
      <DeleteDraftDialog
        card={deleteTarget}
        onDelete={onDeleteDraft}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

function isUnassignedProposalBuilder(builder: string | undefined) {
  if (!builder) {
    return true;
  }
  const normalized = builder.trim().toLowerCase();
  return normalized === "" || normalized === "unassigned builder";
}

function ProposalCard({
  card,
  onActivateRequest,
  onArchiveRequest,
  onAssignRequest,
  onDeleteRequest,
  onOpenApprovedProposal,
  onRecordClosing,
  onSelect,
}: {
  card: ProposalKanbanCard;
  onActivateRequest?: () => void;
  onArchiveRequest: () => void;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpenApprovedProposal: (card: ProposalKanbanCard) => void;
  onRecordClosing: (card: ProposalKanbanCard) => void;
  onSelect: (card: ProposalKanbanCard) => void;
}) {
  const isDraft = card.column === "draft";
  const isSubmitted = card.column === "submitted";
  const assigned =
    card.builderAssigned ?? !isUnassignedProposalBuilder(card.builder);
  const body = (
    <KanbanCard {...card} className="gap-3 p-3">
      <button
        aria-label={`Open ${card.name} detail`}
        className="contents text-left"
        onClick={() => onSelect(card)}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{card.name}</p>
            <p className="truncate font-medium text-sm">{card.address}</p>
            {assigned ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                <UserRound aria-hidden className="size-3.5 shrink-0" />
                <span className="grid min-w-0">
                  <span className="truncate">{card.builder}</span>
                  {card.builderEmail ? (
                    <span className="truncate text-muted-foreground">
                      {card.builderEmail}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span
                className="mt-0.5 flex min-w-0 items-center gap-1.5 text-warning text-xs"
                data-testid="proposal-card-unassigned"
              >
                <UserRoundX aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate font-medium">Unassigned</span>
              </span>
            )}
            {card.isMockAddress || card.isMockBuilder ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {card.isMockAddress ? (
                  <Badge variant="outline">Mock address</Badge>
                ) : null}
                {card.isMockBuilder ? (
                  <Badge variant="outline">Mock builder</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {card.closeLabel ? (
              <Badge
                data-ixc-ref={card.tag === "demo" ? "UI-DEMO-TAG" : undefined}
                variant="success"
              >
                {card.closeLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-medium">{card.loanAmount}</span>
          {card.ltv ? (
            <span className="text-muted-foreground">{card.ltv}% LTV</span>
          ) : (
            <span className="text-muted-foreground">Production proposal</span>
          )}
        </div>
      </button>
    </KanbanCard>
  );

  return (
    <ProposalContextMenu
      onActivateRequest={onActivateRequest}
      onArchiveRequest={onArchiveRequest}
      onAssignRequest={onAssignRequest}
      onDeleteRequest={onDeleteRequest}
      onOpen={() =>
        card.column === "approved"
          ? onOpenApprovedProposal(card)
          : onSelect(card)
      }
      onRecordClosing={() => onRecordClosing(card)}
      proposal={card}
      showActivate={
        card.column === "closed" &&
        !card.activeBuildId &&
        Boolean(onActivateRequest)
      }
      showArchive={isSubmitted}
      showAssign={isDraft && !assigned}
      showDelete={isDraft}
      showRecordClosing={card.column === "approved"}
    >
      {body}
    </ProposalContextMenu>
  );
}

function ProposalContextMenu({
  children,
  onActivateRequest,
  onArchiveRequest,
  onAssignRequest,
  onDeleteRequest,
  onOpen,
  onRecordClosing,
  proposal,
  showArchive,
  showActivate,
  showAssign,
  showDelete,
  showRecordClosing,
}: {
  children: ReactElement;
  onActivateRequest?: () => void;
  onArchiveRequest: () => void;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpen: () => void;
  onRecordClosing: () => void;
  proposal: ProposalKanbanCard;
  showArchive: boolean;
  showActivate: boolean;
  showAssign: boolean;
  showDelete: boolean;
  showRecordClosing: boolean;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">
            {proposal.name}
          </ContextMenuLabel>
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
          {showRecordClosing ? (
            <ContextMenuItem onClick={onRecordClosing}>
              <ClipboardCheck aria-hidden />
              Record closing
            </ContextMenuItem>
          ) : null}
          {showActivate ? (
            <ContextMenuItem onClick={onActivateRequest}>
              <CheckCircle2 aria-hidden />
              Activate Build
            </ContextMenuItem>
          ) : null}
          {showArchive || showDelete ? (
            <>
              <ContextMenuSeparator />
              {showArchive ? (
                <ContextMenuItem
                  onClick={onArchiveRequest}
                  variant="destructive"
                >
                  <Trash2 aria-hidden />
                  Archive proposal
                </ContextMenuItem>
              ) : null}
              {showDelete ? (
                <ContextMenuItem
                  onClick={onDeleteRequest}
                  variant="destructive"
                >
                  <Trash2 aria-hidden />
                  Delete draft
                </ContextMenuItem>
              ) : null}
            </>
          ) : null}
        </ContextMenuGroup>
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
  card: ProposalKanbanCard | null;
  onAssign: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardKey = card?.proposalId ?? card?.id ?? null;

  useEffect(() => {
    setSelected(null);
    setError(null);
    setPending(false);
  }, [cardKey]);

  async function handleAssign() {
    if (!(card && selected)) {
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
              ? `Assign a builder to "${card.name}". This is only available while the proposal is an unassigned draft.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
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
        </DialogPanel>
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
  card: ProposalKanbanCard | null;
  onDelete: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardKey = card?.proposalId ?? card?.id ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [cardKey]);

  async function handleDelete() {
    if (!card) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(card);
      toast.success("Draft proposal deleted.");
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
              ? `"${card.name}" and its draft plan will be permanently removed. This cannot be undone.`
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
