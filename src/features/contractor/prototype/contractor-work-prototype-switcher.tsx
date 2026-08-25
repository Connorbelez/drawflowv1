import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect } from "react";

import {
  type ContractorWorkPrototypeVariant,
  prototypeVariants,
  variantMeta,
} from "./contractor-work-prototype-contracts.ts";

export function ContractorWorkPrototypeSwitcher({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: ContractorWorkPrototypeVariant) => void;
  variant: ContractorWorkPrototypeVariant;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const currentIndex = prototypeVariants.indexOf(variant);
      const nextIndex =
        event.key === "ArrowRight"
          ? (currentIndex + 1) % prototypeVariants.length
          : (currentIndex - 1 + prototypeVariants.length) %
            prototypeVariants.length;
      onVariantChange(prototypeVariants[nextIndex]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onVariantChange, variant]);

  if (import.meta.env.PROD) {
    return null;
  }

  const currentIndex = prototypeVariants.indexOf(variant);
  const move = (direction: -1 | 1) => {
    onVariantChange(
      prototypeVariants[
        (currentIndex + direction + prototypeVariants.length) %
          prototypeVariants.length
      ]
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      data-prototype-only="true"
    >
      <div className="flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <button
          aria-label="Previous prototype variant"
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background"
          onClick={() => move(-1)}
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-[190px] px-3 text-center">
          <p className="font-semibold text-xs">
            {variant} · {variantMeta[variant].label}
          </p>
          <p className="hidden text-background/65 text-xs sm:block">
            {variantMeta[variant].description}
          </p>
        </div>
        <button
          aria-label="Next prototype variant"
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background"
          onClick={() => move(1)}
          type="button"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
