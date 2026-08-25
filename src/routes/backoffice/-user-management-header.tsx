import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Filter,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import type { ReactElement } from "react";

import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { DirectoryStats } from "./-user-management-logic";
import type { WorkosReceiptRow } from "./-user-management-types";

export function PageHeader({
  attentionCount,
  onShowGaps,
  onInvite,
  onSync,
  pending,
  receipts,
  stats,
  syncing,
}: {
  attentionCount: number;
  onShowGaps: () => void;
  onInvite: () => void;
  onSync: () => Promise<void>;
  pending: boolean;
  receipts: WorkosReceiptRow[];
  stats: DirectoryStats;
  syncing: boolean;
}): ReactElement {
  const latestReceipt = receipts[0];
  const healthVariant: BadgeProps["variant"] = pending
    ? "secondary"
    : attentionCount > 0
      ? "warning"
      : "success";
  const healthLabel = pending
    ? "Loading directory"
    : attentionCount > 0
      ? attentionCount === 1
        ? "1 person needs attention"
        : `${attentionCount} people need attention`
      : "Directory healthy";

  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
                User Management
              </h1>
              <Badge variant={healthVariant}>
                {attentionCount > 0 ? (
                  <AlertTriangle className="size-3" />
                ) : (
                  <ShieldCheck className="size-3" />
                )}
                {healthLabel}
              </Badge>
            </div>
            <p className="max-w-[68ch] text-muted-foreground text-sm">
              WorkOS-backed access, organization memberships, and DrawFlow
              profile links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <HeaderMetric label="People" value={stats.people} />
            <HeaderMetric label="Orgs" value={stats.organizations} />
            <HeaderMetric label="Brokers" value={stats.brokers} />
            <HeaderMetric label="Builders" value={stats.builders} />
            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-muted-foreground">
              <Database className="size-3.5" />
              {syncing
                ? "Syncing WorkOS"
                : latestReceipt
                  ? `Latest ${latestReceipt.eventType}: ${latestReceipt.status}`
                  : "No webhook receipts"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {attentionCount > 0 ? (
            <Button onClick={onShowGaps} size="sm" variant="outline">
              <Filter />
              Resolve gaps
            </Button>
          ) : null}
          <Button
            disabled={syncing}
            onClick={() => {
              onSync();
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={syncing ? "animate-spin" : undefined} />
            Sync WorkOS
          </Button>
          <Button onClick={onInvite} size="sm">
            <UserPlus />
            Invite person
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function HeaderMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}): ReactElement {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-md border bg-background px-2.5">
      <span className="font-heading font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function FeedbackBar({
  accepted,
  actionError,
  onDismiss,
}: {
  accepted: string | null;
  actionError: string | null;
  onDismiss: () => void;
}): ReactElement | null {
  if (!(accepted || actionError)) {
    return null;
  }
  const tone = actionError ? "destructive" : "success";
  const Icon = actionError ? AlertTriangle : CheckCircle2;
  return (
    <div
      className={
        tone === "destructive"
          ? "flex items-start gap-3 rounded-lg border border-destructive/24 bg-destructive/4 px-3.5 py-2.5 text-destructive-foreground text-sm"
          : "flex items-start gap-3 rounded-lg border border-success/24 bg-success/4 px-3.5 py-2.5 text-sm text-success-foreground"
      }
      role={actionError ? "alert" : "status"}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{actionError ?? accepted}</p>
      <Button
        aria-label="Dismiss"
        onClick={onDismiss}
        size="icon-xs"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  );
}

export function StatStrip({ stats }: { stats: DirectoryStats }): ReactElement {
  const cards: Array<{ hint: string; label: string; value: number }> = [
    { hint: "active accounts", label: "People", value: stats.people },
    { hint: "broker memberships", label: "Brokers", value: stats.brokers },
    { hint: "builder memberships", label: "Builders", value: stats.builders },
    {
      hint: "WorkOS organizations",
      label: "Organizations",
      value: stats.organizations,
    },
    {
      hint: "need brokerage profile",
      label: "Brokerage gaps",
      value: stats.missingBrokerageProfile,
    },
    {
      hint: "need builder profile",
      label: "Builder gaps",
      value: stats.missingBuilderProfile,
    },
  ];

  return (
    <section
      aria-label="Directory metrics"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {cards.map((card) => (
        <div
          className="rounded-lg border bg-card/60 px-3.5 py-3"
          key={card.label}
        >
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {card.label}
          </p>
          <p className="mt-1 font-heading font-semibold text-xl tabular-nums">
            {card.value}
          </p>
          <p className="text-muted-foreground/80 text-xs">{card.hint}</p>
        </div>
      ))}
    </section>
  );
}
