"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "#/lib/utils.ts";

export const inlineEditVariants = cva(
  [
    "group/inline-edit relative inline-flex w-[var(--inline-edit-reserve-width,auto)] max-w-full items-baseline whitespace-nowrap align-baseline text-foreground tabular-nums",
    "transition-[background-color,box-shadow,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "focus-within:text-foreground",
    "has-disabled:pointer-events-none has-disabled:opacity-64",
  ].join(" "),
  {
    defaultVariants: {
      affordance: "glint",
      align: "left",
      size: "metric",
      tone: "accent",
      weight: "semibold",
    },
    variants: {
      affordance: {
        dotted:
          "after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:border-muted-foreground/45 after:border-b after:border-dotted hover:after:border-primary/70 focus-within:after:border-primary",
        glint:
          "rounded-[5px] border border-transparent px-1 shadow-[inset_0_1px_2px_rgba(24,24,27,0.10),inset_0_-1px_0_rgba(255,255,255,0.70),0_1px_0_rgba(255,255,255,0.50)] after:pointer-events-none after:absolute after:top-px after:right-1 after:left-1 after:h-px after:rounded-full after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.86)_45%,rgba(16,185,129,0.34),transparent)] after:opacity-0 after:transition-opacity after:duration-200 hover:shadow-[inset_0_1px_3px_rgba(24,24,27,0.12),inset_0_-1px_0_rgba(255,255,255,0.64),0_1px_0_rgba(255,255,255,0.48)] hover:after:opacity-80 focus-within:shadow-[inset_0_1px_3px_rgba(16,185,129,0.18),inset_0_-1px_0_rgba(255,255,255,0.60),0_0_0_1px_rgba(16,185,129,0.18)] focus-within:after:opacity-100",
        none: "",
        solid:
          "after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:bg-muted-foreground/35 hover:after:bg-primary/70 focus-within:after:bg-primary",
      },
      align: {
        center: "justify-center text-center",
        left: "justify-start text-left",
        right: "justify-end text-right",
      },
      size: {
        body: "text-sm leading-5",
        metric: "text-sm leading-5",
        "metric-sm": "text-xs leading-4",
        "money-lg": "text-[25px] leading-8",
      },
      tone: {
        accent: "focus-within:text-foreground",
        danger: "focus-within:text-destructive-foreground",
        neutral: "focus-within:text-foreground",
        success: "focus-within:text-success-foreground",
        warning: "focus-within:text-warning-foreground",
      },
      weight: {
        medium: "font-medium",
        regular: "font-normal",
        semibold: "font-semibold",
      },
    },
  },
);

type InlineEditVariantProps = VariantProps<typeof inlineEditVariants>;

const defaultFormatInlineEditNumberDraft = (value: number) =>
  String(Math.round(value));
const glintBorderBackgroundStyle: CSSProperties = {
  backgroundClip: "padding-box, border-box",
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.42)), linear-gradient(145deg, rgba(24,24,27,0.14), rgba(255,255,255,0.82) 48%, rgba(16,185,129,0.2))",
  backgroundOrigin: "border-box",
};

export interface InlineEditProps
  extends Omit<
      ComponentPropsWithoutRef<"span">,
      "children" | "defaultValue" | "onCancel" | "onChange" | "onCommit"
    >,
    InlineEditVariantProps {
  ariaLabel: string;
  autoSelect?: boolean;
  disabled?: boolean;
  displayValue: ReactNode;
  draftValue?: string;
  inputClassName?: string;
  inputWidth?: CSSProperties["width"];
  inputMode?: ComponentPropsWithoutRef<"input">["inputMode"];
  invalid?: boolean;
  onCancel?: () => void;
  onCommit: (draftValue: string) => void;
  onDraftValueChange?: (draftValue: string) => void;
  prefix?: ReactNode;
  reserveWidth?: CSSProperties["width"];
  suffix?: ReactNode;
  testId?: string;
}

export function InlineEdit({
  affordance,
  align,
  ariaLabel,
  autoSelect = true,
  className,
  disabled = false,
  displayValue,
  draftValue,
  inputClassName,
  inputWidth,
  inputMode = "text",
  invalid = false,
  onCancel,
  onCommit,
  onDraftValueChange,
  prefix,
  reserveWidth,
  size,
  style,
  suffix,
  testId,
  tone,
  weight,
  ...props
}: InlineEditProps): React.ReactElement {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = draftValue !== undefined;
  const [editing, setEditing] = useState(false);
  const [internalDraftValue, setInternalDraftValue] = useState(
    draftValue ?? "",
  );
  const resolvedDraftValue = draftValue ?? internalDraftValue;
  const resolvedAffordance = affordance ?? "glint";

  useEffect(() => {
    if (!(editing || isControlled)) {
      setInternalDraftValue(draftValue ?? "");
    }
  }, [draftValue, editing, isControlled]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (autoSelect) {
        inputRef.current?.select();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoSelect, editing]);

  const setDraftValue = (nextValue: string) => {
    if (!isControlled) {
      setInternalDraftValue(nextValue);
    }
    onDraftValueChange?.(nextValue);
  };

  const beginEdit = () => {
    if (disabled) {
      return;
    }
    if (!isControlled) {
      setInternalDraftValue(draftValue ?? "");
    }
    setEditing(true);
  };

  const commit = (nextDraftValue = inputRef.current?.value ?? resolvedDraftValue) => {
    onCommit(nextDraftValue);
    setEditing(false);
  };

  const cancel = () => {
    onCancel?.();
    setEditing(false);
  };

  return (
    <span
      className={cn(
        inlineEditVariants({ affordance, align, className, size, tone, weight }),
      )}
      data-editing={editing ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      data-slot="inline-edit"
      data-testid={testId}
      style={
        {
          ...(resolvedAffordance === "glint"
            ? glintBorderBackgroundStyle
            : undefined),
          ...style,
          "--inline-edit-input-width":
            typeof inputWidth === "number" ? `${inputWidth}px` : inputWidth,
          "--inline-edit-reserve-width":
            typeof reserveWidth === "number" ? `${reserveWidth}px` : reserveWidth,
        } as CSSProperties
      }
      {...props}
    >
      {editing ? (
        <span
          className={cn(
            "inline-flex w-full items-baseline gap-1 whitespace-nowrap",
            align === "right" && "justify-end",
            align === "center" && "justify-center",
          )}
          data-slot="inline-edit-editor"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {prefix ? (
            <span
              className="shrink-0 text-muted-foreground"
              data-slot="inline-edit-prefix"
              data-testid={testId ? `${testId}-prefix` : undefined}
            >
              {prefix}
            </span>
          ) : null}
          <input
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            className={cn(
              "w-[var(--inline-edit-input-width,auto)] min-w-[1ch] shrink-0 border-0 bg-transparent p-0 text-[inherit] font-[inherit] leading-[inherit] text-current outline-none selection:bg-primary/20",
              "appearance-none [font-variant-numeric:tabular-nums] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              align === "right" && "text-right",
              align === "center" && "text-center",
              inputClassName,
            )}
            data-slot="inline-edit-input"
            data-testid={testId ? `${testId}-input` : undefined}
            id={generatedId}
            inputMode={inputMode}
            onBlur={(event) => commit(event.currentTarget.value)}
            onChange={(event) => setDraftValue(event.currentTarget.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commit(event.currentTarget.value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            ref={inputRef}
            type="text"
            value={resolvedDraftValue}
          />
          {suffix ? (
            <span
              className="shrink-0 text-muted-foreground"
              data-slot="inline-edit-suffix"
              data-testid={testId ? `${testId}-suffix` : undefined}
            >
              {suffix}
            </span>
          ) : null}
        </span>
      ) : (
        <button
          aria-label={ariaLabel}
          className={cn(
            "inline-flex w-full cursor-text items-baseline gap-1 border-0 bg-transparent p-0 text-inherit font-inherit leading-inherit outline-none",
            "whitespace-nowrap",
            "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            align === "right" && "justify-end text-right",
            align === "center" && "justify-center text-center",
          )}
          data-slot="inline-edit-display"
          data-testid={testId ? `${testId}-display` : undefined}
          disabled={disabled}
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
          type="button"
        >
          {displayValue}
        </button>
      )}
    </span>
  );
}

export interface InlineEditNumberProps
  extends Omit<
    InlineEditProps,
    | "displayValue"
    | "draftValue"
    | "inputMode"
    | "onCommit"
    | "onDraftValueChange"
  > {
  formatDisplay: (value: number) => ReactNode;
  formatDraft?: (value: number) => string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  parseCommit?: (draftValue: string, previousValue: number) => number;
  step?: number;
  value: number;
}

export function InlineEditNumber({
  formatDisplay,
  formatDraft = defaultFormatInlineEditNumberDraft,
  max,
  min,
  onCancel,
  onCommit,
  parseCommit,
  step: _step,
  value,
  ...props
}: InlineEditNumberProps): React.ReactElement {
  const [draftValue, setDraftValue] = useState(formatDraft(value));

  useEffect(() => {
    setDraftValue(formatDraft(value));
  }, [formatDraft, value]);

  const normalizeDraft = (nextDraftValue: string) => {
    const parsedValue =
      parseCommit?.(nextDraftValue, value) ??
      parseInlineEditNumber(nextDraftValue, value, { max, min });

    setDraftValue(formatDraft(parsedValue));
    onCommit(parsedValue);
  };

  return (
    <InlineEdit
      {...props}
      displayValue={formatDisplay(value)}
      draftValue={draftValue}
      inputMode="numeric"
      onCancel={() => {
        setDraftValue(formatDraft(value));
        onCancel?.();
      }}
      onCommit={normalizeDraft}
      onDraftValueChange={setDraftValue}
    />
  );
}

export function parseInlineEditNumber(
  value: string,
  fallback: number,
  bounds: { max?: number; min?: number } = {},
): number {
  const parsed = Math.round(Number(value));
  const fallbackValue = Math.round(fallback);
  const finiteValue = Number.isFinite(parsed) ? parsed : fallbackValue;
  const minBounded =
    bounds.min === undefined ? finiteValue : Math.max(bounds.min, finiteValue);

  return bounds.max === undefined
    ? minBounded
    : Math.min(bounds.max, minBounded);
}
