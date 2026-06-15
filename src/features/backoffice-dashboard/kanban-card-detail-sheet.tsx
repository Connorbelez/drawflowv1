"use client";

import { ArrowUpRight, Building2, Info } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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
import type {
  DashboardKanbanColumn,
  MilestoneKanbanCard,
  ProposalKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";

const milestonePriorityVariant: Record<
  MilestoneKanbanCard["priority"],
  "outline" | "warning" | "destructive"
> = {
  high: "destructive",
  low: "outline",
  medium: "warning",
};

const milestonePriorityCopy: Record<MilestoneKanbanCard["priority"], string> = {
  high: "High priority",
  low: "Low priority",
  medium: "Medium priority",
};

function findColumnName(
  columns: DashboardKanbanColumn[],
  columnId: string
): string {
  return columns.find((column) => column.id === columnId)?.name ?? columnId;
}

function findColumnDescription(
  columns: DashboardKanbanColumn[],
  columnId: string
): string | undefined {
  const column = columns.find((entry) => entry.id === columnId);
  return typeof column?.description === "string"
    ? column.description
    : undefined;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 border-border/60 border-b py-2.5 last:border-b-0">
      <dt className="shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </h3>
  );
}

export function MilestoneCardDetailSheet({
  card,
  columns,
  onOpenChange,
}: {
  card: MilestoneKanbanCard | null;
  columns: DashboardKanbanColumn[];
  onOpenChange: (open: boolean) => void;
}): ReactElement | null {
  if (!card) {
    return null;
  }

  const stageName = findColumnName(columns, card.column);
  const stageDescription = findColumnDescription(columns, card.column);

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent className="w-full min-w-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="outline">{card.buildId}</Badge>
            <Badge variant={milestonePriorityVariant[card.priority]}>
              {milestonePriorityCopy[card.priority]}
            </Badge>
            {card.dueLabel ? (
              <Badge variant="outline">{card.dueLabel}</Badge>
            ) : null}
          </div>
          <SheetTitle className="pr-8">{card.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Building2 aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{card.address}</span>
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <SectionTitle>Stage</SectionTitle>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium text-sm">{stageName}</p>
                {stageDescription ? (
                  <p className="mt-1 text-muted-foreground text-xs">
                    {stageDescription}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-1">
              <SectionTitle>Review</SectionTitle>
              <dl>
                <DetailRow
                  label="Reviewer"
                  value={
                    card.reviewerInitials ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="grid size-6 place-items-center rounded-full bg-primary text-[0.625rem] text-primary-foreground"
                        >
                          {card.reviewerInitials}
                        </span>
                        <span>{card.reviewerInitials}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )
                  }
                />
                <DetailRow
                  label="Due"
                  value={
                    card.dueLabel ? (
                      card.dueLabel
                    ) : (
                      <span className="text-muted-foreground">No date</span>
                    )
                  }
                />
              </dl>
            </section>

            <section className="flex flex-col gap-1">
              <SectionTitle>References</SectionTitle>
              <dl>
                <DetailRow
                  label="Build"
                  value={
                    <code className="font-mono text-xs">{card.buildKey}</code>
                  }
                />
                <DetailRow
                  label="Milestone"
                  value={
                    <code className="font-mono text-xs">
                      {card.milestoneKey}
                    </code>
                  }
                />
                <DetailRow
                  label="Card"
                  value={<code className="font-mono text-xs">{card.id}</code>}
                />
              </dl>
            </section>
          </div>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          <Button render={<a href={card.href} />}>
            Open build
            <ArrowUpRight />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function ProposalCardDetailSheet({
  card,
  columns,
  onOpenChange,
}: {
  card: ProposalKanbanCard | null;
  columns: DashboardKanbanColumn[];
  onOpenChange: (open: boolean) => void;
}): ReactElement | null {
  if (!card) {
    return null;
  }

  const stageName = findColumnName(columns, card.column);
  const hasMockFlags = Boolean(
    card.isMockAddress || card.isMockBuilder || card.isMockLtv
  );

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent className="w-full min-w-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="outline">{stageName}</Badge>
            {card.statusLabel ? (
              <Badge variant="outline">{card.statusLabel}</Badge>
            ) : null}
            {card.closeLabel ? (
              <Badge variant="success">{card.closeLabel}</Badge>
            ) : null}
          </div>
          <SheetTitle className="pr-8">{card.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Building2 aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{card.address}</span>
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Loan amount
                </p>
                <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">
                  {card.loanAmount}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  LTV
                </p>
                <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">
                  {card.ltv}
                  <span className="ml-0.5 text-base text-muted-foreground">
                    %
                  </span>
                </p>
                {card.isMockLtv ? (
                  <p className="mt-1 text-muted-foreground text-xs">
                    Mock value
                  </p>
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-1">
              <SectionTitle>Counterparty</SectionTitle>
              <dl>
                <DetailRow label="Builder" value={card.builder} />
                <DetailRow label="Address" value={card.address} />
              </dl>
            </section>

            <section className="flex flex-col gap-1">
              <SectionTitle>Pipeline</SectionTitle>
              <dl>
                <DetailRow label="Stage" value={stageName} />
                {card.statusLabel ? (
                  <DetailRow label="Status" value={card.statusLabel} />
                ) : null}
                {card.closeLabel ? (
                  <DetailRow label="Close target" value={card.closeLabel} />
                ) : null}
                <DetailRow
                  label="Proposal"
                  value={<code className="font-mono text-xs">{card.id}</code>}
                />
              </dl>
            </section>

            {hasMockFlags ? (
              <section
                aria-labelledby="proposal-mock-notice"
                className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3"
              >
                <Info
                  aria-hidden
                  className="size-4 shrink-0 text-warning-foreground"
                />
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-sm" id="proposal-mock-notice">
                    Mock data in this proposal
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {card.isMockAddress ? (
                      <Badge variant="outline">Mock address</Badge>
                    ) : null}
                    {card.isMockBuilder ? (
                      <Badge variant="outline">Mock builder</Badge>
                    ) : null}
                    {card.isMockLtv ? (
                      <Badge variant="outline">Mock LTV</Badge>
                    ) : null}
                  </ul>
                </div>
              </section>
            ) : null}
          </div>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          {card.href ? (
            <Button render={<a href={card.href} />}>
              Open proposal
              <ArrowUpRight />
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
