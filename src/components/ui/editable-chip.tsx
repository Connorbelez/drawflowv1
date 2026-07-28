"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Check, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "#/lib/utils.ts";

const editableFilterChipVariants = cva(
  [
    "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors",
    "border-border bg-muted/25 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ].join(" "),
  {
    defaultVariants: {
      tone: "neutral",
    },
    variants: {
      tone: {
        accent:
          "border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-50",
        neutral: "border-border bg-muted/25 text-foreground",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-50",
      },
    },
  }
);

const editableNumberChipVariants = cva(
  [
    "group/editable-chip relative inline-flex min-w-[var(--editable-chip-reserve-width,auto)] max-w-none items-center rounded-full border",
    "tabular-nums",
    "transition-[background-color,border-color,box-shadow,transform] duration-200",
    "has-disabled:pointer-events-none has-disabled:opacity-60",
  ].join(" "),
  {
    defaultVariants: {
      size: "metric",
      tone: "dark",
      weight: "semibold",
    },
    variants: {
      size: {
        metric:
          "min-h-9 gap-1.5 px-2.5 py-1 text-sm leading-none [--editable-chip-action-size:1.75rem]",
        "metric-sm":
          "min-h-7 gap-1 px-1.5 py-0.5 text-xs leading-none [--editable-chip-action-size:1.45rem]",
        "money-lg":
          "min-h-10 gap-2 px-3 py-1 text-[1.2rem] leading-none [--editable-chip-action-size:2rem]",
      },
      tone: {
        dark: [
          "border-[#3f414c] bg-[#1d1d22] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]",
          "hover:border-[#555762] focus-within:border-white focus-within:ring-2 focus-within:ring-white",
          "data-editing:border-white data-editing:ring-2 data-editing:ring-white",
        ].join(" "),
        light: [
          "border-border bg-background text-foreground shadow-xs dark:bg-card dark:text-card-foreground",
          "hover:border-primary/45 hover:bg-muted/40 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/35 dark:hover:bg-muted/60",
          "data-editing:border-primary/60 data-editing:ring-2 data-editing:ring-primary/35",
        ].join(" "),
      },
      weight: {
        medium: "font-medium",
        regular: "font-normal",
        semibold: "font-semibold",
      },
    },
  }
);

type EditableFilterChipTone = VariantProps<
  typeof editableFilterChipVariants
>["tone"];

export interface EditableFilterChipProps
  extends Omit<
    ComponentPropsWithoutRef<"button">,
    "onClick" | "onRemove" | "type"
  > {
  Icon?: ReactNode;
  labelKey: ReactNode;
  labelValue?: ReactNode;
  onClick?: () => void;
  onRemove?: () => void;
  testId?: string;
  tone?: EditableFilterChipTone;
  type?: "filter" | "sort" | "value";
}

export function EditableFilterChip({
  className,
  disabled,
  Icon,
  labelKey,
  labelValue,
  onClick,
  onRemove,
  testId,
  tone,
  type: _type = "filter",
  ...props
}: EditableFilterChipProps) {
  const interactive = Boolean(onClick);
  const content = (
    <>
      {Icon ? (
        <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
          {Icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium">{labelKey}</span>
      {labelValue ? (
        <span className="shrink-0 rounded-sm bg-background/75 px-1.5 py-0.5 font-semibold text-[11px] text-foreground tabular-nums">
          {labelValue}
        </span>
      ) : null}
    </>
  );

  if (!interactive && !onRemove) {
    return (
      <span
        className={cn(editableFilterChipVariants({ tone }), className)}
        data-slot="editable-filter-chip"
        data-testid={testId}
      >
        {content}
      </span>
    );
  }

  return (
    <span
      className={cn(editableFilterChipVariants({ tone }), className)}
      data-slot="editable-filter-chip"
      data-testid={testId}
    >
      <button
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent p-0 text-left outline-none disabled:cursor-not-allowed"
        disabled={disabled || !interactive}
        onClick={onClick}
        type="button"
        {...props}
      >
        {content}
      </button>
      {onRemove ? (
        <button
          aria-label="Remove chip"
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}

export interface EditableNumberChipProps
  extends Omit<ComponentPropsWithoutRef<"span">, "onChange" | "onCommit">,
    VariantProps<typeof editableNumberChipVariants> {
  ariaLabel: string;
  disabled?: boolean;
  formatDisplay: (value: number) => ReactNode;
  formatDraft?: (value: number) => string;
  inputMode?: ComponentPropsWithoutRef<"input">["inputMode"];
  inputWidth?: CSSProperties["width"];
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  parseCommit?: (draftValue: string, previousValue: number) => number;
  prefix?: ReactNode;
  reserveWidth?: CSSProperties["width"];
  step?: number;
  suffix?: ReactNode;
  testId?: string;
  value: number;
}

export function EditableNumberChip({
  ariaLabel,
  className,
  disabled = false,
  formatDisplay,
  formatDraft = defaultFormatNumberDraft,
  inputMode = "numeric",
  inputWidth,
  max,
  min,
  onCommit,
  parseCommit,
  prefix,
  reserveWidth,
  size,
  step = 1,
  style,
  suffix,
  testId,
  tone,
  value,
  weight,
  ...props
}: EditableNumberChipProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(formatDraft(value));

  useEffect(() => {
    if (!editing) {
      setDraftValue(formatDraft(value));
    }
  }, [editing, formatDraft, value]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  const beginEdit = () => {
    if (!disabled) {
      setDraftValue(formatDraft(value));
      setEditing(true);
    }
  };

  const commit = () => {
    const nextValue =
      parseCommit?.(draftValue, value) ??
      parseEditableNumberChipValue(draftValue, value, {
        max,
        min,
      });
    setDraftValue(formatDraft(nextValue));
    setEditing(false);
    if (nextValue !== value) {
      onCommit(nextValue);
    }
  };

  const cancel = () => {
    setDraftValue(formatDraft(value));
    setEditing(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const resolvedInputWidth =
    inputWidth ??
    `${Math.max(3, draftValue.length + (prefix ? 1 : 0) + (suffix ? 2 : 0))}ch`;
  const lightTone = tone === "light";

  return (
    <motion.span
      animate={{
        scale: editing ? 1.01 : 1,
      }}
      className={cn(
        editableNumberChipVariants({ size, tone, weight }),
        className
      )}
      data-editing={editing ? "" : undefined}
      data-slot="editable-number-chip"
      data-testid={testId}
      style={
        {
          ...style,
          "--editable-chip-input-width":
            typeof resolvedInputWidth === "number"
              ? `${resolvedInputWidth}px`
              : resolvedInputWidth,
          "--editable-chip-reserve-width":
            typeof reserveWidth === "number" ? `${reserveWidth}px` : reserveWidth,
        } as CSSProperties
      }
      layout
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {editing ? (
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
            className="inline-flex min-w-[var(--editable-chip-reserve-width,auto)] max-w-none items-center justify-between gap-2"
            exit={{ filter: "blur(3px)", opacity: 0, scale: 0.98 }}
            initial={{ filter: "blur(3px)", opacity: 0, scale: 0.98 }}
            key="editor"
            layout
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {prefix ? (
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap",
                  lightTone ? "text-foreground/90" : "text-white/95"
                )}
              >
                {prefix}
              </span>
            ) : null}
            <input
              aria-label={ariaLabel}
              className={cn(
                "w-[var(--editable-chip-input-width,6rem)] min-w-[3ch] border-0 bg-transparent p-0 text-[inherit] font-[inherit] leading-[inherit] outline-none",
                lightTone
                  ? "text-foreground selection:bg-primary/30 selection:text-foreground"
                  : "text-white selection:bg-white/25 selection:text-white"
              )}
              inputMode={inputMode}
              max={max}
              min={min}
              onChange={(event) => setDraftValue(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleInputKeyDown}
              ref={inputRef}
              step={step}
              type="text"
              value={draftValue}
            />
            {suffix ? (
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap",
                  lightTone ? "text-foreground/90" : "text-white/95"
                )}
              >
                {suffix}
              </span>
            ) : null}
            <motion.button
              aria-label={`Save ${ariaLabel}`}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "grid size-[var(--editable-chip-action-size)] shrink-0 place-items-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.22)] transition-colors focus-visible:outline-none focus-visible:ring-2",
                lightTone
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/45"
                  : "bg-white text-black hover:bg-white/90 focus-visible:ring-white/70"
              )}
              initial={{ opacity: 0, scale: 0.84 }}
              onClick={(event) => {
                event.stopPropagation();
                commit();
              }}
              type="button"
              whileTap={{ scale: 0.9 }}
            >
              <Check className="size-1/2 stroke-[3]" />
            </motion.button>
          </motion.span>
        ) : (
          <motion.button
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
            aria-label={ariaLabel}
            className="inline-flex min-w-[var(--editable-chip-reserve-width,auto)] max-w-none cursor-text items-center justify-between gap-2 border-0 bg-transparent p-0 text-inherit font-inherit leading-inherit outline-none"
            disabled={disabled}
            exit={{ filter: "blur(3px)", opacity: 0, scale: 0.98 }}
            initial={{ filter: "blur(3px)", opacity: 0, scale: 0.98 }}
            key="display"
            layout
            onClick={(event) => {
              event.stopPropagation();
              beginEdit();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                beginEdit();
              }
            }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            type="button"
          >
            <span className="whitespace-nowrap">{formatDisplay(value)}</span>
            {!disabled ? (
              <span
                className={cn(
                  "grid size-[var(--editable-chip-action-size)] shrink-0 place-items-center rounded-full transition-colors",
                  lightTone
                    ? "bg-muted text-muted-foreground ring-1 ring-border/80 group-hover/editable-chip:bg-primary/15 group-hover/editable-chip:text-primary-foreground"
                    : "bg-[#303036] text-[#c9cbd5] group-hover/editable-chip:bg-[#383941] group-hover/editable-chip:text-white"
                )}
              >
                <Pencil className="size-1/2 fill-current stroke-[2.5]" />
              </span>
            ) : null}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

function defaultFormatNumberDraft(value: number) {
  return String(Math.round(value));
}

function parseEditableNumberChipValue(
  value: string,
  fallback: number,
  bounds: { max?: number; min?: number }
) {
  const parsed = Math.round(Number(value));
  const finiteValue = Number.isFinite(parsed) ? parsed : Math.round(fallback);
  const minBounded =
    bounds.min === undefined ? finiteValue : Math.max(bounds.min, finiteValue);
  return bounds.max === undefined
    ? minBounded
    : Math.min(bounds.max, minBounded);
}
