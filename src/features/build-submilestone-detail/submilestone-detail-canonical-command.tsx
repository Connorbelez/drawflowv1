"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { RetryAction } from "./submilestone-detail-canonical-contracts.ts";
import { isCanonicalStaleConflict } from "./submilestone-detail-canonical-contracts.ts";

function retryButton(retry: RetryAction | null, label = "Retry") {
  return retry ? (
    <Button
      onClick={() => {
        void retry().catch(() => undefined);
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <RotateCcw aria-hidden="true" />
      {label}
    </Button>
  ) : null;
}

export function CommandError({
  error,
  retry,
}: {
  error: string;
  retry: RetryAction | null;
}) {
  return (
    <Frame aria-live="assertive">
      <FramePanel
        className="space-y-2 border-destructive/35 p-3 text-sm"
        role="alert"
      >
        <div className="flex items-center gap-2 text-destructive-text">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <p className="font-medium">Sub-milestone update failed</p>
        </div>
        <p>{error}</p>
        {isCanonicalStaleConflict(error) ? (
          <p className="text-muted-foreground text-xs">
            The canonical record changed while this draft was open. Your draft
            is retained; retry after confirming the latest values.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">{retryButton(retry)}</div>
      </FramePanel>
    </Frame>
  );
}
