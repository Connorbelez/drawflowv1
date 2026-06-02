"use client";

import { Check, Info, X } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useState,
} from "react";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { EditableNumberChip } from "#/components/ui/editable-chip.tsx";
import { cn } from "#/lib/utils.ts";
import {
  Expandable,
  ExpandableCard,
  ExpandableContent,
  ExpandableTrigger,
} from "@/components/cult-ui/expandableCard";
import { getMilestonePaymentSchedule } from "./-timeline-milestone-schedule.ts";
import type {
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const MILESTONE_CARD_COLLAPSED_HEIGHT = 260;
const MILESTONE_CARD_COLLAPSED_WIDTH = 232;
const MILESTONE_CARD_EXPANDED_HEIGHT = 420;
const MILESTONE_CARD_EXPANDED_WIDTH = 380;
const MILESTONE_LAYOUT_TRANSITION = {
  damping: 30,
  mass: 0.8,
  stiffness: 260,
  type: "spring",
} as const;

export function IsometricMilestoneIcon({
  className,
  type,
}: {
  className?: string;
  type: IsometricIconKey;
}) {
  return (
    <img
      alt=""
      className={cn("pointer-events-none object-contain", className)}
      height={160}
      src={`/milestone-icons/${type}.png`}
      width={160}
    />
  );
}

export interface MilestoneCardProps {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onUpdate: (itemId: string, patch: MilestoneCardUpdate) => void;
  readOnly?: boolean;
  reducedMotion: boolean;
}

export interface MilestoneCardUpdate {
  amount?: number;
  durationDays?: number;
  initialPaymentAmount?: number;
  x?: number;
}

export function MilestoneCard({
  active,
  complete,
  item,
  onUpdate,
  readOnly = false,
  reducedMotion,
}: MilestoneCardProps) {
  const [cardExpanded, setCardExpanded] = useState(false);
  const milestone = item.data;
  if (!milestone) {
    return null;
  }
  const schedule = getMilestonePaymentSchedule(item);
  const statusLabel = complete
    ? "Complete"
    : active
      ? "In progress"
      : milestone.status === "ready" || milestone.status === "complete"
        ? "Ready"
        : "Upcoming";
  const statusTone =
    statusLabel === "Complete"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-500/10"
      : "border-zinc-200 bg-zinc-50 text-zinc-500 shadow-zinc-500/10";
  const nameLength = milestone.name.length;
  const collapsedTitleFontSize = 17;
  const collapsedTitleLineHeight = "22px";
  const expandedTitleFontSize = nameLength > 26 ? 18 : 20;
  const expandedTitleLineHeight = nameLength > 26 ? "24px" : "26px";
  const openCard = (event: MouseEvent<HTMLDivElement>) => {
    if (cardExpanded) {
      return;
    }

    event.stopPropagation();
    setCardExpanded(true);
  };
  const openCardWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.key === "Enter" || event.key === " ")) {
      return;
    }

    event.preventDefault();
    if (!cardExpanded) {
      setCardExpanded(true);
    }
  };

  return (
    <Expandable
      expandDirection="both"
      expanded={cardExpanded}
      transitionDuration={reducedMotion ? 0 : 0.32}
    >
      {({ isExpanded }) => (
        <ExpandableTrigger
          className={cn("relative w-fit", isExpanded ? "z-[120]" : "z-0")}
          data-timeline-expanded-card={isExpanded ? "true" : undefined}
          onClick={openCard}
          onKeyDown={openCardWithKeyboard}
        >
          <ExpandableCard
            className={cn(
              "relative rounded-lg border bg-white text-left shadow-sm outline-none transition-colors dark:bg-card",
              isExpanded ? "z-[120]" : "z-0",
              isExpanded ? "overflow-visible" : "overflow-hidden",
              "border-rose-200 shadow-rose-500/10",
              active && "border-rose-300 shadow-md shadow-rose-500/15",
              complete && "border-emerald-200 shadow-emerald-500/10"
            )}
            collapsedSize={{
              height: MILESTONE_CARD_COLLAPSED_HEIGHT,
              width: MILESTONE_CARD_COLLAPSED_WIDTH,
            }}
            data-testid={`timeline-card-${item.id}`}
            data-timeline-expanded-card={isExpanded ? "true" : undefined}
            expandedSize={{
              height: MILESTONE_CARD_EXPANDED_HEIGHT,
              width: MILESTONE_CARD_EXPANDED_WIDTH,
            }}
            unstyled
          >
            <LayoutGroup id={`timeline-card-layout-${item.id}`}>
              <motion.div
                className={cn(
                  "relative flex h-full flex-col",
                  isExpanded ? "overflow-visible" : "overflow-hidden",
                  isExpanded ? "p-5" : "p-[18px]"
                )}
                transition={MILESTONE_LAYOUT_TRANSITION}
              >
                {isExpanded ? (
                  <motion.button
                    animate={{ opacity: 1, scale: 1 }}
                    aria-label={`Close ${milestone.name} milestone card`}
                    className="absolute top-3 right-3 z-40 grid size-7 place-items-center rounded-full border border-border/70 bg-white/92 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid={`timeline-card-close-${item.id}`}
                    exit={{ opacity: 0, scale: 0.92 }}
                    initial={{ opacity: 0, scale: 0.92 }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setCardExpanded(false);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    transition={{
                      duration: reducedMotion ? 0 : 0.16,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    type="button"
                  >
                    <X className="size-3.5" strokeWidth={2.2} />
                  </motion.button>
                ) : null}
                <div className="relative z-10">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[11px] text-muted-foreground uppercase">
                      {item.eyebrow}
                    </p>
                    <motion.span
                      animate={{
                        opacity: isExpanded ? 1 : 0.6,
                        x: isExpanded ? 0 : -2,
                      }}
                      className="h-px flex-1 bg-border"
                      transition={{
                        duration: reducedMotion ? 0 : 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>
                  {isExpanded ? (
                    <motion.div
                      className="mt-3 flex items-start justify-between gap-4"
                      layout
                      transition={MILESTONE_LAYOUT_TRANSITION}
                    >
                      <motion.div
                        className="min-w-0 flex-1"
                        layout
                        transition={MILESTONE_LAYOUT_TRANSITION}
                      >
                        <motion.h3
                          animate={{
                            fontSize: expandedTitleFontSize,
                            lineHeight: expandedTitleLineHeight,
                          }}
                          className="max-h-14 overflow-hidden font-semibold tracking-normal"
                          layout="position"
                          layoutId={`timeline-card-title-${item.id}`}
                          transition={MILESTONE_LAYOUT_TRANSITION}
                        >
                          {milestone.name}
                        </motion.h3>

                        <motion.div
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 max-w-[13.5rem]"
                          initial={{ opacity: 0, y: 8 }}
                          transition={{
                            duration: reducedMotion ? 0 : 0.2,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <p className="text-muted-foreground text-xs">
                            Planned cost
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <EditableNumberChip
                              ariaLabel={`${milestone.name} planned cost`}
                              disabled={readOnly}
                              formatDisplay={(value) => money(value)}
                              inputWidth="5.75rem"
                              min={0}
                              onCommit={(amount) => onUpdate(item.id, { amount })}
                              prefix="$"
                              reserveWidth="8.25rem"
                              size="money-lg"
                              step={1000}
                              testId={`timeline-card-cost-${item.id}`}
                              value={schedule.totalAmount}
                              weight="semibold"
                            />
                          </div>
                        </motion.div>
                      </motion.div>

                      <motion.div
                        animate={{
                          opacity: 1,
                          rotate: 0,
                          x: 2,
                          y: -4,
                        }}
                        className="grid size-[7.35rem] shrink-0 place-items-center"
                        initial={{ opacity: reducedMotion ? 1 : 0 }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                        }
                      >
                        <IsometricMilestoneIcon
                          className="size-[7.35rem]"
                          type={milestone.icon}
                        />
                      </motion.div>
                    </motion.div>
                  ) : (
                    <div className="relative h-[138px]">
                      <motion.h3
                        animate={{
                          fontSize: collapsedTitleFontSize,
                          lineHeight: collapsedTitleLineHeight,
                        }}
                        className="mt-3 max-h-11 overflow-hidden font-semibold tracking-normal"
                        layout="position"
                        layoutId={`timeline-card-title-${item.id}`}
                        transition={MILESTONE_LAYOUT_TRANSITION}
                      >
                        {milestone.name}
                      </motion.h3>

                      <motion.div
                        animate={{
                          opacity: 1,
                          rotate: -2,
                          x: 4,
                          y: 2,
                        }}
                        className="absolute top-[7px] left-[50px] grid size-40 shrink-0 place-items-center"
                        initial={{ opacity: reducedMotion ? 1 : 0 }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                        }
                      >
                        <IsometricMilestoneIcon
                          className="size-40"
                          type={milestone.icon}
                        />
                      </motion.div>
                    </div>
                  )}
                </div>

                {isExpanded ? null : (
                  <motion.div
                    animate={{
                      y: 10,
                    }}
                    className="relative z-10 mt-auto mb-4"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : MILESTONE_LAYOUT_TRANSITION
                    }
                  >
                    <p className="text-muted-foreground text-xs">
                      Planned cost
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="w-[6.75rem] shrink-0 font-semibold text-[25px] tabular-nums leading-8">
                        {money(milestone.amount)}
                      </p>
                      <StatusIndicator
                        isExpanded={isExpanded}
                        reducedMotion={reducedMotion}
                        statusLabel={statusLabel}
                        statusTone={statusTone}
                        testId={`timeline-card-status-${item.id}`}
                      />
                    </div>
                  </motion.div>
                )}

                <ExpandableContent
                  animateIn={{
                    animate: { opacity: 1, y: 0 },
                    initial: { opacity: 0, y: 18 },
                    transition: {
                      damping: 24,
                      stiffness: 280,
                      type: "spring",
                    },
                  }}
                  className="relative z-10 pt-2"
                  keepMounted={false}
                  overflowVisible
                  preset="fade"
                >
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <ExpandedFadeIn index={0} reducedMotion={reducedMotion}>
                      <InlineEditableMetric
                        disabled={readOnly}
                        inputWidth="2.75rem"
                        label="Start date"
                        min={0}
                        onCommit={(x) => onUpdate(item.id, { x })}
                        prefix="Day"
                        reserveWidth="5.8rem"
                        testId={`timeline-card-start-date-${item.id}`}
                        value={schedule.startX}
                      />
                    </ExpandedFadeIn>
                    <ExpandedFadeIn index={1} reducedMotion={reducedMotion}>
                      <InlineEditableMetric
                        disabled={readOnly}
                        inputWidth="2.75rem"
                        label="Duration"
                        min={1}
                        onCommit={(durationDays) =>
                          onUpdate(item.id, { durationDays })
                        }
                        reserveWidth="6.75rem"
                        suffix="days"
                        testId={`timeline-card-duration-${item.id}`}
                        value={schedule.durationDays}
                      />
                    </ExpandedFadeIn>
                    <ExpandedFadeIn index={2} reducedMotion={reducedMotion}>
                      <InlineEditableMetric
                        disabled={readOnly}
                        formatDisplay={(value) => money(value)}
                        inputWidth="5.5rem"
                        label="Down Payment"
                        max={schedule.totalAmount}
                        min={0}
                        onCommit={(initialPaymentAmount) =>
                          onUpdate(item.id, { initialPaymentAmount })
                        }
                        prefix="$"
                        reserveWidth="7.5rem"
                        step={1000}
                        testId={`timeline-card-initial-payment-${item.id}`}
                        value={schedule.initialPaymentAmount}
                      />
                    </ExpandedFadeIn>
                    <ExpandedFadeIn index={3} reducedMotion={reducedMotion}>
                      <TimelineMetric
                        label="On Completion"
                        testId={`timeline-card-completion-payment-${item.id}`}
                        value={money(schedule.completionPaymentAmount)}
                      />
                    </ExpandedFadeIn>
                  </div>

                  <ExpandedFadeIn
                    className="mt-5 border-border border-t pt-4"
                    index={4}
                    reducedMotion={reducedMotion}
                  >
                    <p className="font-medium text-[10px] text-muted-foreground uppercase">
                      Sub-milestones
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {milestone.subMilestones.map((subMilestone, index) => (
                        <motion.span
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-md border border-border bg-muted/35 px-2 py-1 text-[11px]"
                          initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
                          key={subMilestone}
                          transition={{
                            delay: reducedMotion ? 0 : 0.16 + index * 0.025,
                            duration: reducedMotion ? 0 : 0.18,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          {subMilestone}
                        </motion.span>
                      ))}
                    </div>
                  </ExpandedFadeIn>
                </ExpandableContent>
              </motion.div>
            </LayoutGroup>
          </ExpandableCard>
        </ExpandableTrigger>
      )}
    </Expandable>
  );
}

function TimelineMetric({
  label,
  testId,
  value,
}: {
  label: string;
  testId?: string;
  value: string;
}) {
  return (
    <div>
      <MetricLabel>{label}</MetricLabel>
      <p
        className="mt-1 font-semibold text-sm tabular-nums"
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}

function MetricLabel({ children }: { children: ReactNode }) {
  return (
    <p className="min-h-4 whitespace-nowrap text-muted-foreground text-xs leading-4">
      {children}
    </p>
  );
}

function InlineEditableMetric({
  disabled = false,
  formatDisplay = (value) => String(Math.round(value)),
  label,
  inputWidth,
  max,
  min,
  onCommit,
  prefix,
  reserveWidth,
  step = 1,
  suffix,
  testId,
  value,
}: {
  disabled?: boolean;
  formatDisplay?: (value: number) => string;
  inputWidth?: string;
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  prefix?: string;
  reserveWidth: string;
  step?: number;
  suffix?: string;
  testId: string;
  value: number;
}) {
  const formattedValue = formatDisplay(value);
  const displayValue = `${prefix && !formattedValue.startsWith(prefix) ? `${prefix} ` : ""}${formattedValue}${
    suffix && !formattedValue.endsWith(suffix) ? ` ${suffix}` : ""
  }`;

  return (
    <div>
      <MetricLabel>{label}</MetricLabel>
      <EditableNumberInput
        className="mt-1"
        disabled={disabled}
        formatDisplay={() => displayValue}
        inputWidth={inputWidth}
        max={max}
        min={min}
        onCommit={onCommit}
        prefix={prefix}
        reserveWidth={reserveWidth}
        step={step}
        suffix={suffix}
        testId={testId}
        value={value}
      />
    </div>
  );
}

function EditableNumberInput({
  className,
  disabled = false,
  formatDisplay,
  inputWidth,
  max,
  min,
  onCommit,
  prefix,
  reserveWidth,
  step = 1,
  suffix,
  testId,
  value,
}: {
  className?: string;
  disabled?: boolean;
  formatDisplay: (value: number) => string;
  inputWidth?: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  prefix?: string;
  reserveWidth: string;
  step?: number;
  suffix?: string;
  testId: string;
  value: number;
}) {
  return (
    <EditableNumberChip
      ariaLabel={testId}
      className={className}
      disabled={disabled}
      formatDisplay={formatDisplay}
      inputWidth={inputWidth}
      max={max}
      min={min}
      onCommit={onCommit}
      prefix={prefix}
      reserveWidth={reserveWidth}
      size="metric"
      step={step}
      suffix={suffix}
      testId={testId}
      value={value}
      weight="semibold"
    />
  );
}

function ExpandedFadeIn({
  children,
  className,
  index,
  reducedMotion,
}: {
  children: ReactNode;
  className?: string;
  index: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
      transition={{
        delay: reducedMotion ? 0 : 0.06 + index * 0.025,
        duration: reducedMotion ? 0 : 0.2,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

function StatusIndicator({
  isExpanded,
  reducedMotion,
  statusLabel,
  statusTone,
  testId,
}: {
  isExpanded: boolean;
  reducedMotion: boolean;
  statusLabel: string;
  statusTone: string;
  testId: string;
}) {
  const StatusIcon = statusLabel === "Complete" ? Check : Info;

  return (
    <motion.span
      animate={{
        height: isExpanded ? 30 : 28,
        width: isExpanded ? 30 : 28,
      }}
      aria-label={statusLabel}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border shadow-sm",
        statusTone
      )}
      data-testid={testId}
      title={statusLabel}
      transition={{
        duration: reducedMotion ? 0 : 0.2,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <StatusIcon
        aria-hidden="true"
        className={cn(isExpanded ? "size-4" : "size-3.5")}
        strokeWidth={statusLabel === "Complete" ? 2.7 : 2.4}
      />
      <span className="sr-only">{statusLabel}</span>
    </motion.span>
  );
}
