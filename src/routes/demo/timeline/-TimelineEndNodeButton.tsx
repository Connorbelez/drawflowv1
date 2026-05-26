"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { cn } from "#/lib/utils.ts";
import { getMilestoneEndX } from "./-timeline-milestone-schedule.ts";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

export function TimelineEndNodeButton({
  active,
  complete,
  item,
  onClick,
  reducedMotion,
  testIdPrefix = "demo-timeline",
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  reducedMotion: boolean;
  testIdPrefix?: string;
}) {
  const endDay = Math.round(getMilestoneEndX(item));

  return (
    <motion.button
      aria-label={`Milestone end on day ${endDay} for ${
        item.data?.name ?? item.label ?? item.id
      }`}
      className={cn(
        "grid size-8 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
        active &&
          !complete &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700",
      )}
      data-testid={`${testIdPrefix}-end-node-${item.id}`}
      onClick={onClick}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      <Check className="size-4" />
    </motion.button>
  );
}
