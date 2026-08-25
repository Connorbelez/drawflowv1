import { GitBranch } from "lucide-react";

import { Card } from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";
import { getActiveScenario, type TimelineSettingsTemplateDraft } from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-4 sm:border-r xl:border-b-0">
      <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TraceBadge({ ids }: { ids: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-muted-foreground text-xs">
      <GitBranch className="size-3" />
      {ids.slice(0, 3).join(" / ")}
    </span>
  );
}

export function tabClass(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 font-medium text-sm transition",
    active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
  );
}

export function StatusStrip({
  settings,
  templates,
}: {
  settings: any;
  templates: TimelineSettingsTemplateDraft[];
}) {
  const milestoneCount = templates.reduce(
    (total, template) => total + template.milestones.length,
    0
  );
  const scenarioCount = templates.reduce(
    (total, template) => total + template.scenarios.length,
    0
  );
  const readyCount =
    settings?.completeness?.readyTemplateCount ??
    templates.filter((template) => getActiveScenario(template)).length;
  return (
    <Card className="grid overflow-hidden rounded-lg sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Templates" value={`${templates.length || 0} loaded`} />
      <Metric label="Worksheets" value={`${milestoneCount} milestones`} />
      <Metric label="Scenarios" value={`${scenarioCount} configured`} />
      <Metric
        label="Active state"
        value={`${readyCount} of ${settings?.completeness?.requiredTemplateCount ?? 3} valid`}
      />
    </Card>
  );
}
