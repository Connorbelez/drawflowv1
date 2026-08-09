import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { SheetHeader } from "#/components/ui/sheet.tsx";

/**
 * The common chrome for route-independent Build detail targets.
 *
 * Action Items and canonical Sub-milestones share the same navigation and
 * dismissal semantics. Keeping the chrome target-neutral lets each detail
 * surface own only its domain header content while preserving familiar
 * keyboard and focus behaviour.
 */
export function BuildDetailTargetHeader({
  canGoBack,
  canGoForward,
  children,
  onClose,
  onGoBack,
  onGoForward,
  targetLabel = "Action Item",
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  children: ReactNode;
  onClose: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  targetLabel?: string;
}) {
  return (
    <SheetHeader className="sticky top-0 z-20 border-b bg-background/96 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            aria-keyshortcuts="Alt+ArrowLeft"
            aria-label={`Previous linked ${targetLabel}`}
            disabled={!canGoBack}
            onClick={onGoBack}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-keyshortcuts="Alt+ArrowRight"
            aria-label={`Next linked ${targetLabel}`}
            disabled={!canGoForward}
            onClick={onGoForward}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <Button
          aria-label={`Close ${targetLabel} detail`}
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {children}
    </SheetHeader>
  );
}
