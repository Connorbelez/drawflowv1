"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  MapPin,
  PlayCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import {
  type DrawWorkflowActionMetadata,
  type DrawWorkflowCapabilities,
  type DrawWorkflowStatus,
  drawWorkflowReadCapabilitiesForRoles,
  drawWorkflowRouteContextForRoles,
  resolveDrawWorkflow,
} from "../draw-workflow/drawWorkflow.ts";
import type {
  CollaborationFeedPostEntry,
  CollaborationSystemPresentation,
} from "./model.ts";

type CollaborationSystemPost = NonNullable<
  CollaborationFeedPostEntry["post"]["systemPost"]
>;
type SystemDrawFacts = NonNullable<CollaborationSystemPost["drawFacts"]>;
type WorkColumn = Exclude<
  CollaborationSystemPresentation["column"],
  "superseded"
>;
type DrawLifecycleStep =
  | "scheduled"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved"
  | "released"
  | "closed";

const DRAW_LIFECYCLE_STEPS: DrawLifecycleStep[] = [
  "scheduled",
  "requested",
  "in_review",
  "ready_for_admin",
  "approved",
  "released",
  "closed",
];

export function DrawBoardlessExperience({
  drawCapabilities,
  facts,
  onOpenActionItem,
  viewerRole,
  viewerRoles,
}: {
  drawCapabilities?: DrawWorkflowCapabilities;
  facts?: SystemDrawFacts;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  viewerRole?: string;
  viewerRoles?: string[];
}) {
  if (!facts) {
    return (
      <section
        aria-label="Draw lifecycle facts"
        className="space-y-2"
        data-testid="system-post-draw-facts-unavailable"
      >
        <p className="font-medium text-xs">Draw lifecycle facts</p>
        <p className="text-muted-foreground text-xs" role="status">
          Draw facts are unavailable in this view. Open the canonical Draw
          surface for authoritative lifecycle details.
        </p>
      </section>
    );
  }

  const step = drawLifecycleStep(facts);
  const amount = facts.request?.amountCents ?? facts.planned?.amountCents;
  const roles = viewerRoles ?? (viewerRole ? [viewerRole] : []);
  const workflow = resolveDrawWorkflow({
    capabilities:
      drawCapabilities ?? drawWorkflowReadCapabilitiesForRoles(roles),
    drawId: facts.request?._id ?? facts.planned?._id,
    routeContext: drawWorkflowRouteContextForRoles(roles),
    status: drawWorkflowStatus(facts),
    viewerRoles: roles,
  });
  const drawTarget = workflow.target;

  return (
    <div className="space-y-4" data-testid="system-post-draw-facts">
      <Frame>
        <FramePanel className="grid gap-3 p-3 sm:grid-cols-4">
          <SummaryMetric
            label="Canonical state"
            value={drawLifecycleLabel(step)}
          />
          <SummaryMetric
            label="Requested"
            value={amount === undefined ? "—" : drawFactMoney(amount)}
          />
          <SummaryMetric
            label="Generated items"
            value={String(facts.generatedActionItems)}
          />
          <SummaryMetric label="Workflow authority" value="Canonical Draw" />
        </FramePanel>
      </Frame>
      <Frame>
        <FramePanel className="space-y-5 p-4 sm:p-5">
          <DrawLifecycleStepper active={step} />
          {workflow.actions.open && drawTarget ? (
            <DrawWorkflowEntrypoint
              action={workflow.actions.open}
              drawLabel={
                facts.request?.displayId ?? facts.planned?.label ?? "Draw"
              }
              onOpenActionItem={onOpenActionItem}
              target={drawTarget}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <FactCard
              icon={<Banknote />}
              label="Requested amount"
              value={
                amount === undefined ? "Not requested" : drawFactMoney(amount)
              }
            />
            <FactCard
              icon={<FileText />}
              label="Evidence Package"
              value={`${humanizeEnumLabel(facts.evidence.state)}${
                facts.evidence.assetCount > 0
                  ? ` · ${facts.evidence.assetCount} assets`
                  : ""
              }`}
            />
            <FactCard
              icon={<MapPin />}
              label="Site Visit"
              value={
                facts.siteVisit.count > 0
                  ? `${facts.siteVisit.count} visit${facts.siteVisit.count === 1 ? "" : "s"} · ${facts.siteVisit.complete} complete`
                  : "None ordered"
              }
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              Evidence · {humanizeEnumLabel(facts.evidence.state)}
            </Badge>
            <Badge variant="secondary">
              Site Visits · {facts.siteVisit.count}
            </Badge>
            <Badge variant="secondary">
              Approval · {humanizeEnumLabel(facts.approval.state)}
            </Badge>
            {facts.disposition ? (
              <Badge variant="warning">
                Disposition · {humanizeEnumLabel(facts.disposition.kind)}
              </Badge>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function DrawWorkflowEntrypoint({
  action,
  drawLabel,
  onOpenActionItem,
  target,
}: {
  action: DrawWorkflowActionMetadata;
  drawLabel: string;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  target: BuildDetailTarget;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-sm">Canonical Draw workflow</p>
          <p className="text-muted-foreground text-xs">
            {action.context === "decision"
              ? "Open the lender admin decision context for this Draw."
              : action.context === "review"
                ? "Open the canonical evidence and review context for this Draw."
                : "Open the canonical Draw record and its read-only history when applicable."}
          </p>
        </div>
        <Button
          aria-label={`${action.label} ${drawLabel}`}
          data-testid="system-post-draw-open"
          onClick={() => onOpenActionItem(target)}
          size="sm"
          type="button"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
          {action.label}
        </Button>
      </FramePanel>
    </Frame>
  );
}

function DrawLifecycleStepper({ active }: { active: DrawLifecycleStep }) {
  const activeIndex = DRAW_LIFECYCLE_STEPS.indexOf(active);
  return (
    <section>
      <div>
        <h2 className="font-semibold text-sm">Canonical Draw lifecycle</h2>
        <p className="text-muted-foreground text-xs">
          Projection only · the System Post never requests or releases funds by
          itself
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-7">
        {DRAW_LIFECYCLE_STEPS.map((state, index) => (
          <div
            className="flex items-center gap-2 sm:flex-col sm:items-start"
            key={state}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border",
                index <= activeIndex &&
                  "border-primary bg-primary text-primary-foreground"
              )}
            >
              {index < activeIndex ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3" />
              )}
            </span>
            <p
              className={cn(
                "text-xs",
                index === activeIndex
                  ? "font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {drawLifecycleLabel(state)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-base">{value}</p>
    </div>
  );
}

function FactCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-medium text-sm">{value}</p>
    </div>
  );
}

export function StatePulseIcon({ state }: { state: WorkColumn }) {
  if (state === "behind_schedule") {
    return <AlertTriangle className="size-3.5 text-destructive" />;
  }
  if (state === "in_progress") {
    return <PlayCircle className="size-3.5 text-info" />;
  }
  if (state === "in_review") {
    return <Eye className="size-3.5 text-warning" />;
  }
  if (state === "approved") {
    return <CheckCircle2 className="size-3.5 text-success" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" />;
}

export function columnTone(
  column: CollaborationSystemPresentation["column"]
): BadgeProps["variant"] {
  if (column === "behind_schedule") {
    return "error";
  }
  if (column === "in_progress") {
    return "info";
  }
  if (column === "in_review") {
    return "warning";
  }
  if (column === "approved") {
    return "success";
  }
  return "secondary";
}

function drawLifecycleStep(facts: SystemDrawFacts): DrawLifecycleStep {
  const workflowStatus = drawWorkflowStatus(facts);
  if (
    workflowStatus === "rejected" ||
    workflowStatus === "withdrawn" ||
    workflowStatus === "cancelled"
  ) {
    return "closed";
  }
  if (facts.release.state === "released") {
    return "released";
  }
  if (
    facts.approval.state === "approved" ||
    facts.release.state === "approved_for_release"
  ) {
    return "approved";
  }
  if (facts.review.state === "ready_for_admin") {
    return "ready_for_admin";
  }
  if (facts.review.state === "in_review") {
    return "in_review";
  }
  if (facts.request) {
    return "requested";
  }
  return "scheduled";
}

function drawWorkflowStatus(facts: SystemDrawFacts): DrawWorkflowStatus {
  const status = facts.request?.status ?? facts.planned?.status;
  if (status) {
    return status === "approved" ? "approved_for_release" : status;
  }
  if (facts.release.state === "released") {
    return "released";
  }
  if (
    facts.approval.state === "approved" ||
    facts.release.state === "approved_for_release"
  ) {
    return "approved_for_release";
  }
  if (facts.review.state === "ready_for_admin") {
    return "ready_for_admin";
  }
  if (facts.review.state === "in_review") {
    return "in_review";
  }
  if (facts.request) {
    return "requested";
  }
  return "planned";
}

function drawLifecycleLabel(state: DrawLifecycleStep) {
  const labels: Record<DrawLifecycleStep, string> = {
    approved: "Approved",
    closed: "Closed",
    in_review: "In review",
    ready_for_admin: "Ready for admin",
    released: "Released",
    requested: "Requested",
    scheduled: "Scheduled",
  };
  return labels[state];
}

function drawFactMoney(amountCents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountCents / 100);
}

export function humanizeEnumLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : value;
}

export function formatPlanDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatPlanDateShort(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}
