import { type ReactNode, useRef } from "react";
import { toast } from "sonner";
import {
  ScheduleWindowPicker,
  type ScheduleWindowValue,
} from "#/features/timeline-workspace/-ScheduleWindowPicker.tsx";
import {
  dateFromProposalDayOffset,
  isValidIsoDateOnly,
} from "./proposalScheduleDates.ts";
import type {
  PacketMilestoneFormDraft,
  PacketMilestoneGroup,
  PacketMilestonePatch,
  PacketSubmilestonePatch,
  PacketSubmilestoneTableRow,
  ProductionProposalDetail,
  ProductionSubmilestone,
} from "./production-proposal-surface-contracts";
import {
  allocateEvenlyCents,
  centsToDollarsInput,
  dollarsInputToCents,
  dollarsInputToOptionalCents,
  parseInteger,
  parseRequiredInteger,
} from "./production-proposal-surface-shared";

export function packetMilestoneFormDraftFromGroup(
  group: PacketMilestoneGroup
): PacketMilestoneFormDraft {
  return {
    budgetDollars: centsToDollarsInput(group.milestone.budgetCents),
    dayEnd: String(group.milestone.dayEnd),
    dayStart: String(group.milestone.dayStart),
    milestoneKey: group.milestone.key,
    mode: "edit",
    name: group.milestone.name,
    order: group.milestone.order,
    submilestones: group.submilestones.map((submilestone, index) => {
      const budgetCents =
        submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
      const durationDays =
        submilestone.durationDays ?? group.fallbackDurations[index] ?? 1;
      const startDay =
        submilestone.startDay ??
        group.milestone.dayStart + group.fallbackStartOffsets[index];
      return {
        budgetDollars: centsToDollarsInput(budgetCents),
        dayEnd: String(startDay + durationDays),
        key: submilestone.key,
        name: submilestone.name,
        order: submilestone.order ?? index + 1,
        startDay: String(startDay),
      };
    }),
  };
}

export function packetSubmilestoneTableRows(
  group: PacketMilestoneGroup,
  draft: PacketMilestoneFormDraft | null
): PacketSubmilestoneTableRow[] {
  if (draft) {
    return draft.submilestones.map((submilestone) => {
      const startDay = parseInteger(submilestone.startDay);
      return {
        budgetCents: dollarsInputToCents(submilestone.budgetDollars),
        budgetDollars: submilestone.budgetDollars,
        dayEndDraft: submilestone.dayEnd,
        durationDays: Math.max(1, parseInteger(submilestone.dayEnd) - startDay),
        key: submilestone.key,
        name: submilestone.name,
        startDay,
        startDayDraft: submilestone.startDay,
      };
    });
  }

  return group.submilestones.map((submilestone, index) => {
    const budgetCents =
      submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
    const durationDays = submilestone.durationDays ?? 1;
    const startDay =
      submilestone.startDay ??
      group.milestone.dayStart + group.fallbackStartOffsets[index];
    return {
      budgetCents,
      budgetDollars: centsToDollarsInput(budgetCents),
      dayEndDraft: String(startDay + durationDays),
      durationDays,
      key: submilestone.key,
      name: submilestone.name,
      startDay,
      startDayDraft: String(startDay),
    };
  });
}

/**
 * Clickable window cell for a packet submilestone row. Holds the transient
 * ScheduleWindowValue while the picker is open and commits the rebuilt
 * PacketMilestonePatch on close. Exclusive-end semantics match the packet
 * labels ("Day X to Y" where Y = start + duration) and the save path.
 */
export function PacketSubmilestoneWindowCell({
  dateDisplayMode,
  durationDays,
  onCommit,
  pending,
  proposedStartDate,
  startDay,
  submilestoneName,
  testId,
}: {
  dateDisplayMode: "relative" | "real";
  durationDays: number;
  onCommit: (window: ScheduleWindowValue) => void;
  pending: boolean;
  proposedStartDate: string;
  startDay: number;
  submilestoneName: string;
  testId: string;
}) {
  const pendingWindowRef = useRef<ScheduleWindowValue | null>(null);

  return (
    <ScheduleWindowPicker
      durationDays={durationDays}
      label={submilestoneName}
      minDayOffset={0}
      onCommit={() => {
        const next = pendingWindowRef.current;
        if (next && !pending) {
          onCommit(next);
        }
        pendingWindowRef.current = null;
      }}
      onWindowChange={(next) => {
        pendingWindowRef.current = next;
      }}
      proposedStartDate={proposedStartDate}
      startDay={startDay}
      testId={testId}
      trigger={
        <span className="text-left underline-offset-2 hover:underline">
          {formatPacketWindow({
            dateDisplayMode,
            dayEnd: startDay + durationDays,
            dayStart: startDay,
            proposedStartDate,
          })}
          <span className="ml-1 text-muted-foreground text-xs">
            {durationDays}d
          </span>
        </span>
      }
      triggerClassName="inline-flex items-center gap-1 text-sm tabular-nums rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}

export function formatPacketWindow({
  dateDisplayMode,
  dayEnd,
  dayStart,
  proposedStartDate,
}: {
  dateDisplayMode: "relative" | "real";
  dayEnd: number;
  dayStart: number;
  proposedStartDate: string;
}) {
  if (
    dateDisplayMode === "real" &&
    isValidProposalStartDate(proposedStartDate)
  ) {
    return `${formatPacketDate(
      dateFromProposalDayOffset(proposedStartDate, dayStart)
    )} to ${formatPacketDate(
      dateFromProposalDayOffset(proposedStartDate, dayEnd)
    )}`;
  }
  return `Day ${dayStart} to ${dayEnd}`;
}

export function formatPacketDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function isValidProposalStartDate(date: string) {
  return Boolean(date) && isValidIsoDateOnly(date);
}

export function packetMilestoneDraftPreview(draft: PacketMilestoneFormDraft) {
  const draftDayStart = Math.max(0, parseInteger(draft.dayStart));
  const draftDayEnd = Math.max(draftDayStart, parseInteger(draft.dayEnd));
  const draftBudgetCents = Math.max(
    0,
    dollarsInputToCents(draft.budgetDollars)
  );
  const submilestoneWindows = draft.submilestones
    .map((submilestone) => {
      const startDay = parseRequiredInteger(submilestone.startDay);
      const dayEnd = parseRequiredInteger(submilestone.dayEnd);
      const budgetCents = dollarsInputToOptionalCents(
        submilestone.budgetDollars
      );
      if (startDay === null || dayEnd === null) {
        return null;
      }
      return {
        budgetCents:
          budgetCents === undefined || budgetCents < 0 ? 0 : budgetCents,
        dayEnd: Math.max(startDay + 1, dayEnd),
        dayStart: Math.max(0, startDay),
      };
    })
    .filter(
      (
        submilestone
      ): submilestone is {
        budgetCents: number;
        dayEnd: number;
        dayStart: number;
      } => Boolean(submilestone)
    );

  if (submilestoneWindows.length === 0) {
    return {
      budgetCents: draftBudgetCents,
      dayEnd: draftDayEnd,
      dayStart: draftDayStart,
      durationDays: Math.max(1, draftDayEnd - draftDayStart),
    };
  }

  const dayStart = Math.min(
    ...submilestoneWindows.map((submilestone) => submilestone.dayStart)
  );
  const dayEnd = Math.max(
    ...submilestoneWindows.map((submilestone) => submilestone.dayEnd)
  );
  return {
    budgetCents: submilestoneWindows.reduce(
      (total, submilestone) => total + submilestone.budgetCents,
      0
    ),
    dayEnd,
    dayStart,
    durationDays: Math.max(1, dayEnd - dayStart),
  };
}

export function normalizePacketMilestoneFormDraft(
  draft: PacketMilestoneFormDraft
): PacketMilestonePatch | null {
  const name = draft.name.trim();
  const draftDayStart = parseRequiredInteger(draft.dayStart);
  const draftDayEnd = parseRequiredInteger(draft.dayEnd);
  const draftBudgetCents = dollarsInputToCents(draft.budgetDollars);
  if (!name) {
    toast.error("Milestone scope is required.");
    return null;
  }
  if (
    draftDayStart === null ||
    draftDayEnd === null ||
    draftDayStart < 0 ||
    draftDayEnd < draftDayStart
  ) {
    toast.error("Milestone window is invalid.");
    return null;
  }
  if (draftBudgetCents < 0) {
    toast.error("Milestone budget is invalid.");
    return null;
  }
  const submilestones = draft.submilestones
    .map<PacketSubmilestonePatch | null>((submilestone, index) => {
      const submilestoneName = submilestone.name.trim();
      if (!submilestoneName) {
        return null;
      }
      const startDay = parseRequiredInteger(submilestone.startDay);
      const dayEnd = parseRequiredInteger(submilestone.dayEnd);
      const submilestoneBudgetCents = dollarsInputToOptionalCents(
        submilestone.budgetDollars
      );
      if (startDay === null || startDay < 0) {
        toast.error("Submilestone start day is invalid.");
        return null;
      }
      if (dayEnd === null || dayEnd <= startDay) {
        toast.error("Submilestone end day is invalid.");
        return null;
      }
      if (
        submilestoneBudgetCents !== undefined &&
        submilestoneBudgetCents < 0
      ) {
        toast.error("Submilestone budget is invalid.");
        return null;
      }
      return {
        ...(submilestoneBudgetCents === undefined
          ? {}
          : { budgetCents: submilestoneBudgetCents }),
        durationDays: dayEnd - startDay,
        key: submilestone.key,
        name: submilestoneName,
        order: index + 1,
        startDay,
      };
    })
    .filter((submilestone): submilestone is PacketSubmilestonePatch =>
      Boolean(submilestone)
    );
  const submilestoneWindows = submilestones.flatMap((submilestone) => {
    const startDay = submilestone.startDay;
    const durationDays = submilestone.durationDays;
    if (startDay === undefined || durationDays === undefined) {
      return [];
    }
    return [
      {
        budgetCents: submilestone.budgetCents ?? 0,
        dayEnd: startDay + durationDays,
        dayStart: startDay,
      },
    ];
  });
  const computedDayStart =
    submilestoneWindows.length === 0
      ? draftDayStart
      : Math.min(
          ...submilestoneWindows.map((submilestone) => submilestone.dayStart)
        );
  const computedDayEnd =
    submilestoneWindows.length === 0
      ? draftDayEnd
      : Math.max(
          ...submilestoneWindows.map((submilestone) => submilestone.dayEnd)
        );
  const computedBudgetCents =
    submilestoneWindows.length === 0
      ? draftBudgetCents
      : submilestoneWindows.reduce(
          (total, submilestone) => total + submilestone.budgetCents,
          0
        );

  return {
    budgetCents: computedBudgetCents,
    dayEnd: computedDayEnd,
    dayStart: computedDayStart,
    durationDays: Math.max(1, computedDayEnd - computedDayStart),
    name,
    submilestones,
  };
}

export function uniquePacketKey(
  value: string,
  fallback: string,
  existingKeys: Set<string>
) {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    fallback
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "item";
  let candidate = base;
  let suffix = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function proposalPacketMilestoneGroups(
  detail: ProductionProposalDetail
) {
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }

  return (detail.milestones ?? [])
    .slice()
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((milestone) => {
      const milestoneDurationDays =
        milestone.durationDays ??
        Math.max(1, Math.round(milestone.dayEnd - milestone.dayStart));
      const persistedSubmilestones = (
        submilestonesByMilestone.get(milestone.key) ?? []
      )
        .slice()
        .sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key)
        );
      const submilestones =
        persistedSubmilestones.length > 0
          ? persistedSubmilestones
          : [
              {
                budgetCents: milestone.budgetCents,
                durationDays: milestoneDurationDays,
                key: `${milestone.key}-scope`,
                milestoneKey: milestone.key,
                name: `${milestone.name} scope`,
                order: 1,
                startDay: milestone.dayStart,
              },
            ];
      const fallbackBudgets = allocateEvenlyCents(
        milestone.budgetCents,
        submilestones.length
      );
      const fallbackDurations = allocateWholeDays(
        milestoneDurationDays,
        submilestones.length
      );
      let elapsedDays = 0;
      const fallbackStartOffsets = fallbackDurations.map((duration) => {
        const offset = elapsedDays;
        elapsedDays += duration;
        return offset;
      });

      return {
        fallbackBudgets,
        fallbackDurations,
        fallbackStartOffsets,
        milestone,
        submilestones,
      };
    });
}

export function allocateWholeDays(totalDays: number, count: number) {
  if (count <= 0) {
    return [];
  }
  const normalizedTotal = Math.max(count, Math.round(totalDays));
  const base = Math.floor(normalizedTotal / count);
  let remainder = normalizedTotal - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}
