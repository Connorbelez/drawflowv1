import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { MilestoneCardDetailSheet } from "#/features/backoffice-dashboard/kanban-card-detail-sheet.tsx";
import type {
  DashboardKanbanColumn,
  MilestoneKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "#/features/backoffice-dashboard/readonly-kanban.tsx";
import { cn } from "#/lib/utils.ts";

const priorityVariant: Record<
  MilestoneKanbanCard["priority"],
  "outline" | "warning" | "destructive"
> = {
  high: "destructive",
  low: "outline",
  medium: "warning",
};

export function MilestoneKanban({
  columns,
  milestones,
}: {
  columns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
}) {
  const [activeMilestone, setActiveMilestone] =
    useState<MilestoneKanbanCard | null>(null);
  useEffect(() => {
    if (!activeMilestone) {
      return;
    }
    const latest = milestones.find((entry) => entry.id === activeMilestone.id);
    if (latest && latest !== activeMilestone) {
      setActiveMilestone(latest);
    } else if (!latest) {
      setActiveMilestone(null);
    }
  }, [activeMilestone, milestones]);

  return (
    <>
      <Card id="milestones-kanban">
        <CardHeader className="gap-3 border-b p-4">
          <CardTitle className="text-base">Milestone Kanban</CardTitle>
          <CardDescription>
            Milestones grouped by build and review state
          </CardDescription>
          <CardAction className="row-span-1 flex items-center gap-2 text-muted-foreground text-sm">
            <Switch aria-label="Show completed milestones" />
            Show completed
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <ClientOnly fallback={<div className="min-h-80 min-w-4xl" />}>
            <KanbanProvider
              className="min-h-80 min-w-4xl gap-0"
              columns={columns}
              data={milestones}
            >
              {(column) => (
                <KanbanBoard
                  className={cn(
                    "rounded-none border-0 border-r bg-card shadow-none ring-0 last:border-r-0",
                    column.id === "behindSchedule" && "bg-destructive/5"
                  )}
                  id={column.id}
                  key={column.id}
                >
                  <KanbanHeader
                    className={cn(
                      "space-y-1 border-b p-4",
                      column.id === "behindSchedule" && "bg-destructive/8"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{column.name}</span>
                      <Badge variant="outline">
                        {
                          milestones.filter((card) => card.column === column.id)
                            .length
                        }
                      </Badge>
                    </div>
                    {column.description ? (
                      <p className="font-normal text-muted-foreground text-xs">
                        {column.description}
                      </p>
                    ) : null}
                  </KanbanHeader>
                  <KanbanCards<MilestoneKanbanCard>
                    className="gap-2 p-3"
                    id={column.id}
                  >
                    {(card) => (
                      <MilestoneCard
                        card={card}
                        onSelect={setActiveMilestone}
                      />
                    )}
                  </KanbanCards>
                </KanbanBoard>
              )}
            </KanbanProvider>
          </ClientOnly>
        </CardContent>
      </Card>
      <MilestoneCardDetailSheet
        card={activeMilestone}
        columns={columns}
        onOpenChange={(open) => {
          if (!open) {
            setActiveMilestone(null);
          }
        }}
      />
    </>
  );
}

function MilestoneCard({
  card,
  onSelect,
}: {
  card: MilestoneKanbanCard;
  onSelect: (card: MilestoneKanbanCard) => void;
}) {
  return (
    <KanbanCard {...card} className="gap-2 p-3">
      <button
        aria-label={`Open ${card.name} detail`}
        className="contents text-left"
        onClick={() => onSelect(card)}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">
              {card.buildId} · {card.address}
            </p>
            <p className="truncate font-medium text-sm">{card.name}</p>
          </div>
          {card.reviewerInitials ? (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[0.625rem] text-primary-foreground">
              {card.reviewerInitials}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={priorityVariant[card.priority]}>
            {card.priority}
          </Badge>
          {card.dueLabel ? (
            <Badge variant="outline">{card.dueLabel}</Badge>
          ) : null}
        </div>
      </button>
    </KanbanCard>
  );
}
