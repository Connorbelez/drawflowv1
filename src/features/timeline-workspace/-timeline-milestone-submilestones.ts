import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

export type DemoSubmilestoneStatus = "todo" | "in_progress" | "done";

export interface DemoSubmilestone {
  budgetCents?: number;
  description?: string;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
  status?: DemoSubmilestoneStatus;
}

export interface TimelineSubmilestoneSnapshotRow {
  budgetCents?: number;
  description?: string;
  durationDays?: number;
  key?: string;
  name: string;
  order?: number;
  startDay?: number;
  status?: DemoSubmilestoneStatus;
}

export function mapSubmilestoneSnapshotRows(
  rows: TimelineSubmilestoneSnapshotRow[],
  milestoneKey: string
): DemoSubmilestone[] {
  return rows
    .map((row, index) => ({
      ...(row.budgetCents === undefined
        ? {}
        : { budgetCents: row.budgetCents }),
      ...(row.description?.trim()
        ? { description: row.description.trim() }
        : {}),
      ...(row.durationDays === undefined
        ? {}
        : { durationDays: row.durationDays }),
      key:
        row.key ?? `${milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`,
      name: row.name.trim(),
      order: row.order ?? index + 1,
      ...(row.startDay === undefined ? {} : { startDay: row.startDay }),
      ...(row.status ? { status: row.status } : {}),
    }))
    .filter((row) => row.name.length > 0)
    .sort((a, b) => a.order - b.order);
}

export function resolveMilestoneSubmilestones(
  milestone: Pick<DemoMilestone, "subMilestones" | "submilestoneDetails">,
  milestoneKey: string
): DemoSubmilestone[] {
  if (milestone.submilestoneDetails?.length) {
    return [...milestone.submilestoneDetails].sort((a, b) => a.order - b.order);
  }

  return (milestone.subMilestones ?? [])
    .map((name, index) => ({
      key: `${milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`,
      name: name.trim(),
      order: index + 1,
    }))
    .filter((row) => row.name.length > 0);
}

export function submilestoneNames(
  details: DemoSubmilestone[]
): DemoMilestone["subMilestones"] {
  return details.map((row) => row.name);
}
