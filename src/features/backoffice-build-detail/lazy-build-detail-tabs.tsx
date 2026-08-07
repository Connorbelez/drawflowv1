import {
  type ComponentProps,
  type ComponentType,
  lazy,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const COLLABORATION_DEFER_FALLBACK_MS = 1500;

export function BuildDetailTabFallback({ label }: { label: string }) {
  return (
    <Frame data-testid="build-detail-tab-fallback">
      <FramePanel className="grid min-h-[24rem] place-items-center p-6 text-muted-foreground text-sm">
        Loading {label}…
      </FramePanel>
    </Frame>
  );
}

export const LazyActiveBuildTimelineWorkspace = lazy(() =>
  import("./ActiveBuildTimelineWorkspace.tsx").then((m) => ({
    default: m.ActiveBuildTimelineWorkspace,
  }))
);

export const LazyActiveBuildGanttWorkspace = lazy(() =>
  import("./ActiveBuildGanttWorkspace.tsx").then((m) => ({
    default: m.ActiveBuildGanttWorkspace,
  }))
);

export const LazyCalendarWorkspace = lazy(() =>
  import("#/features/calendar-workspace/CalendarWorkspace.tsx").then((m) => ({
    default: m.CalendarWorkspace,
  }))
);

export const LazyMaterialPlanningTab = lazy(() =>
  import("#/features/material-planning/MaterialPlanningTab.tsx").then((m) => ({
    default: m.MaterialPlanningTab,
  }))
);

export const LazyBuildCollaborationWorkspace = lazy(() =>
  import("#/features/build-collaboration/BuildCollaborationWorkspace.tsx").then(
    (m) => ({
      default: m.BuildCollaborationWorkspace,
    })
  )
);

type BuildCollaborationWorkspaceProps = ComponentProps<
  typeof LazyBuildCollaborationWorkspace
>;

export function DeferredBuildCollaborationWorkspace({
  eager = false,
  ...props
}: BuildCollaborationWorkspaceProps & { eager?: boolean }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const supportsViewportObserver = typeof IntersectionObserver !== "undefined";
  const [mounted, setMounted] = useState(
    () => eager || !supportsViewportObserver
  );
  const shouldMount = eager || mounted || !supportsViewportObserver;

  useEffect(() => {
    if (shouldMount) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const fallbackTimer = window.setTimeout(
      () => setMounted(true),
      COLLABORATION_DEFER_FALLBACK_MS
    );
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -30% 0px" }
    );
    observer.observe(sentinel);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [shouldMount]);

  return (
    <div data-testid="deferred-build-collaboration" ref={sentinelRef}>
      {shouldMount ? (
        <LazyBuildCollaborationWorkspace {...props} />
      ) : (
        <Frame>
          <FramePanel
            aria-live="polite"
            className="flex min-h-28 items-center p-4 text-muted-foreground text-sm"
          >
            <span>Collaboration loads when this section enters view.</span>
            <Button
              className="ml-auto shrink-0"
              onClick={() => setMounted(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Load collaboration
            </Button>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}

export const LazyCostDocumentBatchWorkspace = lazy(() =>
  import("#/features/cost-documents/CostDocumentBatchWorkspace.tsx").then(
    (m) => ({
      default: m.CostDocumentBatchWorkspace,
    })
  )
);

export const LazyCostDocumentRoadmapReconciliation = lazy(() =>
  import(
    "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx"
  ).then((m) => ({
    default: m.CostDocumentRoadmapReconciliation,
  }))
);

export const LazyQuoteRoundsSurface = lazy(() =>
  import("#/features/quote-solicitation/QuoteRoundsSurface.tsx").then((m) => ({
    default: m.QuoteRoundsSurface,
  }))
);

export const LazyQuoteRoundComparisonSurface = lazy(() =>
  import("#/features/quote-solicitation/QuoteRoundComparisonSurface.tsx").then(
    (m) => ({
      default: m.QuoteRoundComparisonSurface,
    })
  )
);

export const LazyBuilderStaffPermissionsPanel = lazy(() =>
  import("#/features/builder-staff/BuilderStaffPermissionsPanel.tsx").then(
    (m) => ({
      default: m.BuilderStaffPermissionsPanel,
    })
  )
);

type PreloadFn = () => Promise<{ default: ComponentType<unknown> }>;

const tabPreloaders: Partial<Record<string, PreloadFn>> = {
  calendar: () =>
    import("#/features/calendar-workspace/CalendarWorkspace.tsx").then((m) => ({
      default: m.CalendarWorkspace as ComponentType<unknown>,
    })),
  costs: () =>
    import("#/features/cost-documents/CostDocumentBatchWorkspace.tsx").then(
      (m) => ({
        default: m.CostDocumentBatchWorkspace as ComponentType<unknown>,
      })
    ),
  gantt: () =>
    import("./ActiveBuildGanttWorkspace.tsx").then((m) => ({
      default: m.ActiveBuildGanttWorkspace as ComponentType<unknown>,
    })),
  materials: () =>
    import("#/features/material-planning/MaterialPlanningTab.tsx").then(
      (m) => ({ default: m.MaterialPlanningTab as ComponentType<unknown> })
    ),
  quotes: () =>
    import("#/features/quote-solicitation/QuoteRoundsSurface.tsx").then(
      (m) => ({ default: m.QuoteRoundsSurface as ComponentType<unknown> })
    ),
  staff: () =>
    import("#/features/builder-staff/BuilderStaffPermissionsPanel.tsx").then(
      (m) => ({
        default: m.BuilderStaffPermissionsPanel as ComponentType<unknown>,
      })
    ),
  timeline: () =>
    import("./ActiveBuildTimelineWorkspace.tsx").then((m) => ({
      default: m.ActiveBuildTimelineWorkspace as ComponentType<unknown>,
    })),
};

export function preloadBuildDetailTab(tab: string) {
  const preload = tabPreloaders[tab];
  if (preload) {
    preload();
  }
}
