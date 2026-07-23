"use client";

import { ChevronLeft, ChevronRight, FlaskConical, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "#/components/ui/button.tsx";

export interface PrototypeVariantOption<TVariant extends string> {
  label: string;
  value: TVariant;
}

export function PrototypeSwitcher<TVariant extends string>({
  current,
  onChange,
  onExit,
  variants,
}: {
  current: TVariant;
  onChange: (variant: TVariant) => void;
  onExit?: () => void;
  variants: PrototypeVariantOption<TVariant>[];
}) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.value === current)
  );
  const currentVariant = variants[currentIndex] ?? variants[0];

  const cycle = (direction: -1 | 1) => {
    const nextIndex =
      (currentIndex + direction + variants.length) % variants.length;
    const nextVariant = variants[nextIndex];
    if (nextVariant) {
      onChange(nextVariant.value);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycle(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        cycle(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (import.meta.env.PROD || !currentVariant) {
    return null;
  }

  return (
    <div
      aria-label="Prototype variant switcher"
      className="fixed bottom-4 left-1/2 z-[80] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-white/15 bg-neutral-950/95 p-1 text-white shadow-2xl backdrop-blur"
      data-testid="prototype-switcher"
      role="toolbar"
    >
      <Button
        aria-label="Previous prototype"
        className="border-white/10 bg-white/5 text-white hover:bg-white/15"
        onClick={() => cycle(-1)}
        size="icon"
        variant="outline"
      >
        <ChevronLeft />
      </Button>
      <div className="flex min-w-0 items-center gap-2 px-2">
        <FlaskConical className="size-4 shrink-0 text-lime-300" />
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] text-white/55 uppercase tracking-wider">
            Throwaway prototype
          </p>
          <p className="truncate font-medium text-xs">
            {String.fromCharCode(65 + currentIndex)} — {currentVariant.label}
          </p>
        </div>
      </div>
      <Button
        aria-label="Next prototype"
        className="border-white/10 bg-white/5 text-white hover:bg-white/15"
        onClick={() => cycle(1)}
        size="icon"
        variant="outline"
      >
        <ChevronRight />
      </Button>
      {onExit ? (
        <Button
          aria-label="Exit prototype"
          className="border-transparent text-white/70 hover:bg-white/15 hover:text-white"
          onClick={onExit}
          size="icon"
          variant="ghost"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
