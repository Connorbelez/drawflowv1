import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildDetailTarget,
  detailTargetFromResolution,
  isBuildDetailFocusCandidate,
  parseBuildDetailFocus,
} from "./buildDetailTarget.ts";
import { useBuildDetailTargetController } from "./useBuildDetailTargetController.ts";

type TargetResolution =
  | undefined
  | { state: "revoked" }
  | { code: string; message: string; state: "integrity_error" }
  | {
      state: "visible";
      target: {
        actionItemId?: Id<"buildActionItems">;
        companionId?: Id<"buildActionItems">;
        kind: "actionItem" | "milestone" | "submilestone";
        milestoneId?: Id<"buildMilestones">;
        readOnly: boolean;
        submilestoneId?: Id<"buildSubmilestones">;
      };
    }
  | {
      state: "visible";
      target: {
        drawId: Id<"activeBuildDrawRequests"> | Id<"plannedDrawScheduleRows">;
        kind: "draw";
        readOnly: boolean;
      };
    };

export interface BuildDetailSheetHostState {
  controller: ReturnType<typeof useBuildDetailTargetController>;
  integrityError?: { code: string; message: string };
  readOnly: boolean;
  resolutionState:
    | "idle"
    | "integrity_error"
    | "loading"
    | "revoked"
    | "visible";
  target?: BuildDetailTarget;
}

/**
 * One route-independent owner for target authorization and navigation. The
 * current ticket deliberately delegates rendering to the caller; ENG-427
 * supplies the unified Sub-milestone sheet content.
 */
export function BuildDetailSheetHost({
  buildId,
  children,
  detailTab,
  focus,
  onTargetResolved,
  organizationId,
  viewerCapacity,
}: {
  buildId: Id<"activeBuilds">;
  children: (state: BuildDetailSheetHostState) => ReactNode;
  detailTab?: string;
  focus?: string;
  onTargetResolved?: (target: BuildDetailTarget | undefined) => void;
  organizationId: string;
  viewerCapacity?:
    | "admin"
    | "broker"
    | "broker-staff"
    | "builder"
    | "builder-staff"
    | "contractor"
    | "homeowner"
    | "principle-broker";
}) {
  const parsed = parseBuildDetailFocus(focus);
  const resolution = useQuery(
    api.build_collaboration_focus.resolveBuildDetailTarget,
    parsed && focus
      ? { buildId, focus, organizationId, viewerCapacity }
      : "skip"
  ) as TargetResolution;
  const target = useMemo(
    () =>
      resolution?.state === "visible"
        ? detailTargetFromResolution(resolution.target)
        : undefined,
    [resolution]
  );
  const resolutionState = !parsed
    ? isBuildDetailFocusCandidate(focus)
      ? "revoked"
      : "idle"
    : resolution === undefined
      ? "loading"
      : resolution.state;
  const controller = useBuildDetailTargetController({
    detailTab,
    focus,
    resolutionState: resolutionState === "idle" ? "visible" : resolutionState,
    target,
  });
  useEffect(() => {
    onTargetResolved?.(resolutionState === "visible" ? target : undefined);
  }, [onTargetResolved, resolutionState, target]);
  return children({
    controller,
    integrityError:
      resolution?.state === "integrity_error"
        ? { code: resolution.code, message: resolution.message }
        : undefined,
    readOnly:
      resolution?.state === "visible" ? resolution.target.readOnly : true,
    resolutionState,
    target,
  });
}

export function BuildDetailIntegritySheet({
  error,
  onClose,
}: {
  error: { code: string; message: string };
  onClose: () => void;
}) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetPopup
        className="h-svh max-h-svh w-full max-w-none sm:h-[calc(100svh-2rem)] sm:w-[min(34rem,calc(100vw-2rem))]"
        side="right"
        variant="inset"
      >
        <SheetHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/8 text-destructive-text">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </div>
          <SheetTitle>Sub-milestone link needs attention</SheetTitle>
          <SheetDescription>
            This generated collaboration record is not safely bound to its
            canonical Sub-milestone. Editing is disabled.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-3">
          <p className="text-sm">{error.message}</p>
          <p className="break-all font-mono text-muted-foreground text-xs">
            Reference: {error.code}
          </p>
        </SheetPanel>
        <SheetFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}
