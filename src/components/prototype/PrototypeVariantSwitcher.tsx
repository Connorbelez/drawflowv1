"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeVariantSwitcher({
  current,
  onChange,
  variants,
}: {
  current: string;
  onChange: (variant: string) => void;
  variants: readonly PrototypeVariant[];
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, [contenteditable='true']") ||
          target.closest("input, textarea, [contenteditable='true']"))
      ) {
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const currentIndex = Math.max(
        0,
        variants.findIndex((variant) => variant.key === current)
      );
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (currentIndex + offset + variants.length) % variants.length;
      onChange(variants[nextIndex]?.key ?? variants[0]?.key ?? current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, onChange, variants]);

  if (import.meta.env.PROD || variants.length === 0) {
    return null;
  }

  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );
  const active = variants[currentIndex] ?? variants[0];
  const selectOffset = (offset: number) => {
    const nextIndex =
      (currentIndex + offset + variants.length) % variants.length;
    onChange(variants[nextIndex]?.key ?? current);
  };

  return (
    <Frame className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 bg-foreground/90 shadow-2xl backdrop-blur">
      <FramePanel className="flex items-center justify-between gap-2 border-white/10 bg-foreground p-1.5 text-background">
        <Button
          aria-label="Previous prototype variant"
          className="text-background hover:bg-background/12 hover:text-background"
          onClick={() => selectOffset(-1)}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate font-semibold text-sm">
            {active?.key} — {active?.name}
          </p>
          <p className="text-[11px] text-background/60">
            Prototype only · use ← and →
          </p>
        </div>
        <Button
          aria-label="Next prototype variant"
          className="text-background hover:bg-background/12 hover:text-background"
          onClick={() => selectOffset(1)}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
      </FramePanel>
    </Frame>
  );
}
