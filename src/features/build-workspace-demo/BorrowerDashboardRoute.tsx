import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Gauge,
  Info,
  LayoutDashboard,
  ListChecks,
  MapPinOff,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Settings,
  SquareArrowOutUpRight,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { IntroDisclosure } from "#/components/ui/intro-disclosure.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";
import { useBuilderProposalDemo } from "../builder-proposal-demo/convex-builder-proposal-adapter";
import { BuildWorkspaceDemo } from "./BuildWorkspaceDemo";
import { useConvexBuildWorkspace } from "./convex-workspace-adapter";
import type {
  DrawGroup,
  EvidenceFileSummary,
  EvidenceStatus,
  Milestone,
  MilestoneStatus,
  WorkspaceMode,
} from "./types";
import { BuildWorkspaceProvider, useBuildWorkspace } from "./workspace-adapter";

type BorrowerDashboardTab = "overview" | "gantt" | "chat" | "documents";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const compactDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

const statusText = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());

const initials = (value: string) =>
  value
    .split(/\s+|&/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const formatBytes = (value: number) =>
  `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: "compact",
  }).format(value)}B`;

const evidenceStatusText: Record<EvidenceStatus, string> = {
  accepted: "Accepted",
  draft: "Draft",
  locationUnverified: "Location unverified",
  needsInfo: "Needs info",
  notStarted: "Not started",
  submitted: "Submitted",
};

const evidenceTypeLabel = (file: EvidenceFileSummary) => {
  if (file.mimeType.startsWith("image/")) {
    return "Photo";
  }
  if (file.mimeType === "application/pdf") {
    return "Document";
  }
  return "Evidence";
};

const milestoneIssueTone: Record<
  Exclude<MilestoneStatus, "approved">,
  { card: string; cta: string; icon: string; marker: "alert" | "info" }
> = {
  blocked: {
    card: "border-danger/40 bg-danger/10 hover:border-danger hover:bg-danger/15",
    cta: "text-danger",
    icon: "text-danger",
    marker: "alert",
  },
  evidenceRequired: {
    card: "border-warning/40 bg-warning/10 hover:border-warning hover:bg-warning/15",
    cta: "text-warning",
    icon: "text-warning",
    marker: "alert",
  },
  evidenceSubmitted: {
    card: "border-info/40 bg-info/10 hover:border-info hover:bg-info/15",
    cta: "text-info",
    icon: "text-info",
    marker: "info",
  },
  inProgress: {
    card: "border-warning/40 bg-warning/10 hover:border-warning hover:bg-warning/15",
    cta: "text-warning",
    icon: "text-warning",
    marker: "info",
  },
  notStarted: {
    card: "border-border bg-bg-base hover:border-primary/50 hover:bg-primary/5",
    cta: "text-muted-foreground",
    icon: "text-muted-foreground",
    marker: "info",
  },
  proposed: {
    card: "border-border bg-bg-base hover:border-primary/50 hover:bg-primary/5",
    cta: "text-muted-foreground",
    icon: "text-muted-foreground",
    marker: "info",
  },
  underReview: {
    card: "border-info/40 bg-info/10 hover:border-info hover:bg-info/15",
    cta: "text-info",
    icon: "text-info",
    marker: "info",
  },
};

const evidenceIssueTone = (milestone: Milestone) => {
  const isDue = milestone.endAt.getTime() <= Date.now();
  if (isDue) {
    return {
      badge: "destructive" as const,
      card: "border-danger/35 bg-danger/10 hover:border-danger hover:bg-danger/15",
      cta: "text-danger",
      icon: "text-danger",
    };
  }
  if (milestone.evidenceStatus === "submitted") {
    return {
      badge: "outline" as const,
      card: "border-info/35 bg-info/10 hover:border-info hover:bg-info/15",
      cta: "text-info",
      icon: "text-info",
    };
  }
  return {
    badge: "outline" as const,
    card: "border-border bg-bg-base hover:border-primary/50 hover:bg-primary/5",
    cta: "text-muted-foreground",
    icon: "text-muted-foreground",
  };
};

export function ConvexBorrowerDashboardRoute({
  mode = "active",
}: {
  mode?: WorkspaceMode;
}) {
  const workspace = useConvexBuildWorkspace(mode);

  return (
    <BuildWorkspaceProvider workspace={workspace}>
      <BorrowerDashboard />
    </BuildWorkspaceProvider>
  );
}

function BorrowerDashboard() {
  const workspace = useBuildWorkspace();
  const navigate = useNavigate();
  const { startDraft } = useBuilderProposalDemo();
  const [activeTab, setActiveTab] = useState<BorrowerDashboardTab>("overview");
  const [dashboardSelectedMilestoneId, setDashboardSelectedMilestoneId] =
    useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isStartingProposal, setIsStartingProposal] = useState(false);

  const resolvedSelectedMilestoneId =
    dashboardSelectedMilestoneId &&
    workspace.milestones.some(
      (milestone) => milestone.id === dashboardSelectedMilestoneId
    )
      ? dashboardSelectedMilestoneId
      : workspace.selectedMilestoneId;
  const workspaceSelectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === resolvedSelectedMilestoneId
    ) ?? workspace.milestones[0];
  const selectedMilestone = workspaceSelectedMilestone;
  const selectedDraw = selectedMilestone
    ? workspace.drawGroups.find(
        (drawGroup) => drawGroup.id === selectedMilestone.drawGroupId
      )
    : workspace.drawGroups[0];

  const dashboardStats = useMemo(() => {
    const totalBudget =
      workspace.budget.totalBuildBudget ||
      workspace.milestones.reduce(
        (total, milestone) => total + milestone.estimatedCost,
        0
      );
    const spent = workspace.milestones.reduce(
      (total, milestone) => total + milestone.actualCost,
      0
    );
    const averageProgress = workspace.milestones.length
      ? Math.round(
          workspace.milestones.reduce(
            (total, milestone) => total + milestone.progress,
            0
          ) / workspace.milestones.length
        )
      : 0;

    return {
      averageProgress,
      remaining: Math.max(0, totalBudget - spent),
      spent,
      totalBudget,
    };
  }, [workspace.budget.totalBuildBudget, workspace.milestones]);

  async function handleStartProposal() {
    setIsStartingProposal(true);
    try {
      const result = await startDraft({});
      await navigate({
        search: { draftId: result.draftId },
        to: "/demo/drawflow/new-proposal",
      });
    } finally {
      setIsStartingProposal(false);
    }
  }

  const handleDashboardSelectMilestone = useCallback(
    (milestoneId: string) => {
      setDashboardSelectedMilestoneId(milestoneId);
      workspace.selectMilestone(milestoneId);
    },
    [workspace]
  );

  if (workspace.isLoading || workspace.needsSeed || !selectedMilestone) {
    return (
      <main className="fixed inset-x-0 top-16 bottom-0 grid place-items-center bg-bg-base text-foreground">
        <div
          className="rounded-md border border-border bg-card px-4 py-3 text-sm"
          data-testid="borrower-dashboard-loading"
        >
          Loading borrower dashboard...
        </div>
      </main>
    );
  }

  const dashboardWorkspace = {
    ...workspace,
    selectMilestone: handleDashboardSelectMilestone,
    selectedMilestoneId: selectedMilestone.id,
  };

  return (
    <BuildWorkspaceProvider workspace={dashboardWorkspace}>
      <main
        className="fixed inset-x-0 top-16 bottom-0 overflow-hidden bg-bg-base text-foreground"
        data-testid="builder-dashboard-shell"
      >
        <div
          className={cn(
            "grid h-full min-h-0 grid-cols-1 overflow-hidden",
            isSidebarCollapsed
              ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]"
              : "lg:grid-cols-[14rem_minmax(0,1fr)]"
          )}
          data-testid="borrower-dashboard-shell"
        >
          <DashboardSidebar
            collapsed={isSidebarCollapsed}
            isStartingProposal={isStartingProposal}
            onStartProposal={handleStartProposal}
          />
          <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
            <DashboardTopbar
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={() =>
                setIsSidebarCollapsed((current) => !current)
              }
            />
            <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="min-h-0 overflow-y-auto bg-bg-base">
              {activeTab === "overview" ? (
                <OverviewTab
                  dashboardStats={dashboardStats}
                  selectedDraw={selectedDraw}
                  selectedMilestone={selectedMilestone}
                />
              ) : null}
              {activeTab === "gantt" ? (
                <div className="h-full min-h-[calc(100vh-14rem)] overflow-auto p-2 sm:p-3">
                  <BuildWorkspaceDemo layout="embedded" />
                </div>
              ) : null}
              {activeTab === "chat" ? <ChatTab /> : null}
              {activeTab === "documents" ? <DocumentsTab /> : null}
            </div>
          </section>
        </div>
      </main>
    </BuildWorkspaceProvider>
  );
}

function DashboardSidebar({
  collapsed,
  isStartingProposal,
  onStartProposal,
}: {
  collapsed: boolean;
  isStartingProposal: boolean;
  onStartProposal: () => Promise<void>;
}) {
  const workspace = useBuildWorkspace();
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: Building2, label: "Projects" },
    { icon: Banknote, label: "Draw Proposals" },
    { icon: Gauge, label: "Estimates" },
    { icon: FileText, label: "Documents" },
    { icon: ListChecks, label: "Conditions" },
    { icon: FolderOpen, label: "Reports" },
    { icon: Settings, label: "Settings" },
  ];

  return (
    <aside
      className={cn(
        "hidden min-h-0 border-border border-r bg-bg-sunken transition-[width] lg:grid",
        collapsed
          ? "lg:grid-rows-[4.5rem_minmax(0,1fr)]"
          : "lg:grid-rows-[4.5rem_minmax(0,1fr)_auto_auto]"
      )}
      data-sidebar-collapsed={collapsed}
      data-testid="borrower-dashboard-sidebar"
    >
      <div
        className={cn(
          "flex items-center border-border border-b",
          collapsed ? "justify-center px-3" : "gap-3 px-5"
        )}
      >
        <div className="grid size-8 place-items-center rounded-md bg-primary font-black text-primary-foreground">
          D
        </div>
        <div
          className={cn("font-semibold leading-tight", collapsed && "sr-only")}
        >
          DrawFlow
          <div className="text-[0.62rem] text-muted-foreground uppercase tracking-[0.08em]">
            Lending
          </div>
        </div>
      </div>
      <nav aria-label="Project nav" className="space-y-1 overflow-y-auto p-3">
        {navItems.map((item, index) => (
          <button
            className={cn(
              "flex h-10 w-full items-center rounded-md text-left text-sm transition hover:bg-muted",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
              index === 1
                ? "bg-primary/12 text-foreground"
                : "text-muted-foreground"
            )}
            key={item.label}
            type="button"
          >
            <item.icon className="size-4" />
            <span className={cn(collapsed && "sr-only")}>{item.label}</span>
          </button>
        ))}
      </nav>
      <div
        className={cn(
          "m-3 rounded-md border border-border bg-card p-3 text-xs",
          collapsed && "hidden"
        )}
      >
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <CircleHelp className="size-4 text-primary" />
          Need help?
        </div>
        <p className="mt-2 text-muted-foreground">
          Help center access stays available without interrupting draw work.
        </p>
        <Button
          className="mt-3 w-full"
          data-testid="builder-dashboard-new-proposal"
          disabled={isStartingProposal}
          onClick={() => void onStartProposal()}
          size="sm"
          variant="outline"
        >
          <Plus />
          New proposal
        </Button>
      </div>
      <div
        className={cn(
          "flex items-center gap-3 border-border border-t p-4 text-sm",
          collapsed && "hidden"
        )}
      >
        <div className="grid size-9 place-items-center rounded-full bg-muted font-semibold">
          {initials(workspace.build.borrowerName)}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">
            {workspace.build.borrowerName}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {statusText(workspace.role)}
          </div>
        </div>
      </div>
    </aside>
  );
}

function DashboardTopbar({
  isSidebarCollapsed,
  onToggleSidebar,
}: {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const workspace = useBuildWorkspace();

  return (
    <header className="flex min-h-12 items-center gap-3 border-border border-b bg-bg-base px-4 py-2">
      <Button
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden lg:inline-flex"
        data-testid="borrower-sidebar-toggle"
        onClick={onToggleSidebar}
        size="icon"
        variant="ghost"
      >
        {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
      <div className="min-w-0">
        <h1 className="truncate font-semibold text-base tracking-normal sm:text-lg">
          Day-to-Day Build Tracker
        </h1>
        <p className="truncate text-[0.68rem] text-muted-foreground sm:text-[0.7rem]">
          {workspace.build.borrowerName} / {workspace.build.siteAddress} /
          organization scoped as {workspace.build.organizationId}
        </p>
      </div>
    </header>
  );
}

function DashboardTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: BorrowerDashboardTab;
  onTabChange: (tab: BorrowerDashboardTab) => void;
}) {
  const tabs: { label: string; value: BorrowerDashboardTab }[] = [
    { label: "Overview", value: "overview" },
    { label: "Gantt View", value: "gantt" },
    { label: "Chat", value: "chat" },
    { label: "Documents", value: "documents" },
  ];

  return (
    <nav
      aria-label="Build workspace tabs"
      className="grid gap-1 border-border border-b bg-bg-sunken px-2 py-1 md:flex md:min-h-12 md:items-center md:gap-2 md:px-4 md:py-2"
      data-testid="borrower-dashboard-tabs"
    >
      <div className="grid grid-cols-4 gap-0.5 md:flex">
        {tabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab.value}
            className={cn(
              "h-7 min-h-0 min-w-0 rounded-sm px-1 py-0 font-medium text-[0.62rem] leading-none transition sm:h-8 sm:text-[0.68rem] md:h-11 md:min-w-fit md:rounded-md md:px-3 md:py-2 md:text-sm",
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            data-testid={`borrower-dashboard-tab-${tab.value}`}
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function OverviewTab({
  dashboardStats,
  selectedDraw,
  selectedMilestone,
}: {
  dashboardStats: {
    averageProgress: number;
    remaining: number;
    spent: number;
    totalBudget: number;
  };
  selectedDraw?: DrawGroup;
  selectedMilestone: Milestone;
}) {
  const [isMilestoneRailCollapsed, setIsMilestoneRailCollapsed] =
    useState(false);
  const [isStatusColumnCollapsed, setIsStatusColumnCollapsed] = useState(false);
  const [isMobilePanelsOpen, setIsMobilePanelsOpen] = useState(false);

  return (
    <div
      className={cn(
        "grid min-h-full gap-3 p-2 pb-36 sm:gap-4 sm:p-4 sm:pb-36 xl:pb-4",
        isMilestoneRailCollapsed && isStatusColumnCollapsed
          ? "xl:grid-cols-[4.75rem_minmax(24rem,1fr)_5rem]"
          : isMilestoneRailCollapsed
            ? "xl:grid-cols-[4.75rem_minmax(24rem,1fr)_minmax(18rem,22rem)] 2xl:grid-cols-[4.75rem_minmax(28rem,1fr)_minmax(22rem,30rem)]"
            : isStatusColumnCollapsed
              ? "xl:grid-cols-[minmax(16rem,22rem)_minmax(24rem,1fr)_5rem] 2xl:grid-cols-[minmax(18rem,24rem)_minmax(28rem,1fr)_5rem]"
              : "xl:grid-cols-[minmax(16rem,22rem)_minmax(24rem,1fr)_minmax(18rem,22rem)] 2xl:grid-cols-[minmax(18rem,24rem)_minmax(28rem,1fr)_minmax(22rem,30rem)]"
      )}
      data-testid="borrower-dashboard-overview"
    >
      <div className="hidden xl:contents">
        <MilestoneRail
          collapsed={isMilestoneRailCollapsed}
          onCollapsedChange={setIsMilestoneRailCollapsed}
        />
      </div>
      <div className="order-1 grid min-w-0 content-start gap-3 sm:gap-4 xl:order-none">
        <SelectedMilestoneSummary
          selectedDraw={selectedDraw}
          selectedMilestone={selectedMilestone}
        />
        <EvidenceManager selectedMilestone={selectedMilestone} />
        <FinancialControls dashboardStats={dashboardStats} />
      </div>
      <div className="hidden xl:contents">
        <StatusColumn
          collapsed={isStatusColumnCollapsed}
          onCollapsedChange={setIsStatusColumnCollapsed}
          selectedDraw={selectedDraw}
        />
      </div>
      <IntroDisclosure
        className="xl:hidden"
        defaultTabId="milestones"
        open={isMobilePanelsOpen}
        setOpen={setIsMobilePanelsOpen}
        tabs={[
          {
            badge: (
              <Badge variant="outline">
                {selectedMilestone.drawGroupId.toUpperCase()}
              </Badge>
            ),
            content: (
              <MilestoneRail
                collapsed={false}
                focusActiveOnMount
                onCollapsedChange={setIsMilestoneRailCollapsed}
              />
            ),
            description:
              "Select a milestone, open draw groups, and keep the active draw in view.",
            icon: <ListChecks className="size-4" />,
            id: "milestones",
            label: "Milestones",
          },
          {
            badge: (
              <Badge variant="outline">{selectedDraw?.label ?? "Draw"}</Badge>
            ),
            content: <DrawGroupStatus selectedDraw={selectedDraw} />,
            description:
              "Review blockers, evidence gaps, and the draw request action.",
            icon: <Banknote className="size-4" />,
            id: "draw-status",
            label: "Draw status",
          },
        ]}
        title="Milestones and draw status"
        triggerDescription={`${selectedMilestone.name} · ${selectedDraw?.label ?? "Draw"}`}
        triggerHidden
        triggerIcon={<ListChecks className="size-5" />}
        triggerLabel="Open milestones and draw status"
      />
      <MobileMilestoneActionBar
        onOpenPanels={() => setIsMobilePanelsOpen(true)}
        selectedDraw={selectedDraw}
      />
    </div>
  );
}

function MilestoneRail({
  collapsed,
  focusActiveOnMount = false,
  onCollapsedChange,
}: {
  collapsed: boolean;
  focusActiveOnMount?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const workspace = useBuildWorkspace();
  const activeMilestoneRef = useRef<HTMLButtonElement | null>(null);
  const activeDrawGroupId =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId
    )?.drawGroupId ?? workspace.drawGroups[0]?.id;
  const [openDrawGroupIds, setOpenDrawGroupIds] = useState<Set<string>>(
    () => new Set(activeDrawGroupId ? [activeDrawGroupId] : [])
  );
  const milestoneOrder = new Map(
    workspace.milestones.map((milestone, index) => [milestone.id, index])
  );
  const groupedMilestones = workspace.drawGroups.map((drawGroup) => ({
    drawGroup,
    milestones: workspace.milestones.filter(
      (milestone) => milestone.drawGroupId === drawGroup.id
    ),
  }));
  const ungroupedMilestones = workspace.milestones.filter(
    (milestone) =>
      !workspace.drawGroups.some(
        (drawGroup) => drawGroup.id === milestone.drawGroupId
      )
  );
  const toggleDrawGroup = (drawGroupId: string) => {
    setOpenDrawGroupIds((current) => {
      const next = new Set(current);
      if (next.has(drawGroupId)) {
        next.delete(drawGroupId);
      } else {
        next.add(drawGroupId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!activeDrawGroupId) {
      return;
    }
    setOpenDrawGroupIds((current) => {
      if (focusActiveOnMount) {
        if (current.size === 1 && current.has(activeDrawGroupId)) {
          return current;
        }
        return new Set([activeDrawGroupId]);
      }
      if (current.has(activeDrawGroupId)) {
        return current;
      }
      const next = new Set(current);
      next.add(activeDrawGroupId);
      return next;
    });
  }, [activeDrawGroupId, focusActiveOnMount]);

  useEffect(() => {
    if (!(focusActiveOnMount && activeDrawGroupId)) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      activeMilestoneRef.current?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeDrawGroupId, focusActiveOnMount, workspace.selectedMilestoneId]);

  const activateMilestone = (milestone: Milestone) => {
    setOpenDrawGroupIds((current) => {
      const next = new Set(current);
      next.add(milestone.drawGroupId);
      return next;
    });
    workspace.selectMilestone(milestone.id);
  };

  if (collapsed) {
    return (
      <section
        className="order-2 flex max-h-[calc(100vh-11rem)] min-h-0 flex-col items-center gap-3 rounded-md border border-border bg-card p-2 xl:order-none"
        data-testid="borrower-milestone-rail"
      >
        <Button
          aria-label="Expand milestone rail"
          data-testid="borrower-expand-milestone-rail"
          onClick={() => onCollapsedChange(false)}
          size="icon"
          variant="ghost"
        >
          <PanelRightOpen />
        </Button>
        <div className="h-px w-full bg-border" />
        <TooltipProvider>
          <div className="grid w-full gap-2 overflow-y-auto">
            {workspace.milestones.map((milestone, index) => {
              const isActive = milestone.id === workspace.selectedMilestoneId;

              return (
                <Tooltip key={milestone.id}>
                  <TooltipTrigger
                    render={
                      <button
                        aria-label={`Select ${milestone.name}`}
                        className={cn(
                          "grid min-h-11 place-items-center rounded-md border px-1 py-2 text-center font-semibold text-xs transition hover:border-primary hover:bg-primary/10",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-bg-sunken text-muted-foreground"
                        )}
                        data-testid={`borrower-milestone-preview-${milestone.id}`}
                        onClick={() => activateMilestone(milestone)}
                        type="button"
                      />
                    }
                  >
                    {index + 1}
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {milestone.name} · {milestone.drawGroupId.toUpperCase()}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </section>
    );
  }

  return (
    <section
      className="order-2 flex max-h-[28rem] min-h-0 flex-col rounded-md border border-border bg-card p-3 sm:p-4 xl:order-none xl:max-h-[calc(100vh-11rem)]"
      data-testid="borrower-milestone-rail"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="font-semibold text-base">Milestones</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{workspace.milestones.length} total</Badge>
          <Button
            aria-label="Collapse milestone rail"
            className="hidden xl:inline-flex"
            data-testid="borrower-collapse-milestone-rail"
            onClick={() => onCollapsedChange(true)}
            size="icon"
            variant="ghost"
          >
            <PanelLeftClose />
          </Button>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-3">
          {groupedMilestones.map(({ drawGroup, milestones }) => {
            const isOpen = openDrawGroupIds.has(drawGroup.id);
            const isSelectedDrawGroup = drawGroup.id === activeDrawGroupId;
            const isCurrentDrawGroup = drawGroup.status === "evidencePending";

            return (
              <div
                className={cn(
                  "rounded-md border bg-bg-sunken p-2",
                  isSelectedDrawGroup ? "border-primary/50" : "border-border"
                )}
                data-testid={`borrower-draw-group-${drawGroup.id}`}
                key={drawGroup.id}
              >
                <button
                  aria-expanded={isOpen}
                  className="mb-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-1 py-1 text-left transition hover:bg-muted/50"
                  onClick={() => toggleDrawGroup(drawGroup.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        !isOpen && "-rotate-90"
                      )}
                    />
                    <span className="truncate font-semibold text-xs">
                      {drawGroup.label}
                    </span>
                    {isCurrentDrawGroup ? <Badge>Active</Badge> : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {milestones.length} milestone
                    {milestones.length === 1 ? "" : "s"}
                  </span>
                </button>
                {isOpen ? (
                  <div className="grid gap-2">
                    {milestones.map((milestone, index) => (
                      <MilestoneRailCard
                        index={milestoneOrder.get(milestone.id) ?? index}
                        key={milestone.id}
                        milestone={milestone}
                        refCallback={
                          focusActiveOnMount &&
                          milestone.id === workspace.selectedMilestoneId
                            ? (node) => {
                                activeMilestoneRef.current = node;
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {ungroupedMilestones.length > 0 ? (
            <div className="rounded-md border border-border bg-bg-sunken p-2">
              <div className="mb-2 px-1 font-semibold text-xs">
                Ungrouped milestones
              </div>
              <div className="grid gap-2">
                {ungroupedMilestones.map((milestone, index) => (
                  <MilestoneRailCard
                    index={index}
                    key={milestone.id}
                    milestone={milestone}
                    refCallback={
                      focusActiveOnMount &&
                      milestone.id === workspace.selectedMilestoneId
                        ? (node) => {
                            activeMilestoneRef.current = node;
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MilestoneRailCard({
  index,
  milestone,
  refCallback,
}: {
  index: number;
  milestone: Milestone;
  refCallback?: (node: HTMLButtonElement | null) => void;
}) {
  const workspace = useBuildWorkspace();

  return (
    <button
      className={cn(
        "grid min-h-24 gap-2 rounded-md border p-3 text-left transition hover:border-primary/60",
        milestone.id === workspace.selectedMilestoneId
          ? "border-primary bg-primary/10"
          : "border-border bg-bg-elevated"
      )}
      data-testid={`borrower-milestone-card-${milestone.id}`}
      onClick={() => workspace.selectMilestone(milestone.id)}
      ref={refCallback}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-muted text-xs">
            {index + 1}
          </span>
          <span className="font-semibold">{milestone.name}</span>
        </span>
        <Badge className="shrink-0" variant="outline">
          {milestone.drawGroupId.toUpperCase()}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {statusText(milestone.status)}
        </span>
        <span className="font-medium">{milestone.progress}%</span>
      </div>
      <Progress value={milestone.progress} />
      <div className="grid grid-cols-2 gap-2 text-muted-foreground text-xs">
        <span>{money(milestone.estimatedCost)} budget</span>
        <span>{milestone.estimatedDurationDays} days</span>
      </div>
    </button>
  );
}

function SelectedMilestoneSummary({
  selectedDraw,
  selectedMilestone,
}: {
  selectedDraw?: DrawGroup;
  selectedMilestone: Milestone;
}) {
  const status = selectedMilestone.status;
  const statusLabel = statusText(status);

  const statusDotColor =
    {
      proposed: "bg-fg-tertiary",
      notStarted: "bg-fg-tertiary",
      inProgress: "bg-accent",
      blocked: "bg-danger",
      evidenceRequired: "bg-warning",
      evidenceSubmitted: "bg-warning",
      underReview: "bg-warning",
      approved: "bg-success",
    }[status] ?? "bg-fg-tertiary";

  const statusTextColor =
    {
      proposed: "text-fg-tertiary",
      notStarted: "text-fg-tertiary",
      inProgress: "text-accent",
      blocked: "text-danger",
      evidenceRequired: "text-warning",
      evidenceSubmitted: "text-warning",
      underReview: "text-warning",
      approved: "text-success",
    }[status] ?? "text-fg-tertiary";

  const incurredCost =
    selectedMilestone.actualCost > 0
      ? selectedMilestone.actualCost
      : selectedMilestone.estimatedCost;

  return (
    <section
      className="rounded-lg border border-border bg-bg-elevated p-4"
      data-testid="borrower-selected-milestone-summary"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-1.5 size-2.5 shrink-0 rounded-full",
              statusDotColor
            )}
          />
          <div className="min-w-0">
            <h2 className="font-semibold text-base text-fg-primary leading-tight">
              {selectedMilestone.name}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={cn("font-medium", statusTextColor)}>
                {statusLabel}
              </span>
              {selectedDraw ? (
                <>
                  <span className="text-fg-tertiary">·</span>
                  <span className="text-fg-secondary">
                    {selectedDraw.label}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-medium text-[0.65rem] text-fg-tertiary uppercase tracking-wider">
            Target
          </div>
          <div className="mt-0.5 font-mono text-fg-secondary text-sm">
            {compactDate(selectedMilestone.endAt)}
          </div>
        </div>
      </div>

      <div className="my-3 h-px bg-border" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-[0.65rem] text-fg-tertiary uppercase tracking-wider">
            Cost
          </div>
          <div className="mt-0.5 font-medium font-mono text-fg-primary text-sm">
            {money(incurredCost)}
          </div>
        </div>
        <CompleteMilestoneButton
          selectedMilestone={selectedMilestone}
          testId={`borrower-mark-complete-${selectedMilestone.id}`}
        />
      </div>
    </section>
  );
}

function CompleteMilestoneButton({
  className,
  selectedMilestone,
  testId,
}: {
  className?: string;
  selectedMilestone: Milestone;
  testId: string;
}) {
  const workspace = useBuildWorkspace();
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasEvidence = selectedMilestone.evidenceFiles.length > 0;
  const isComplete = selectedMilestone.progress >= 100;
  const isApproved = selectedMilestone.status === "approved";
  const isUnderReview = selectedMilestone.status === "underReview";
  const canSubmitCompletion = !(isApproved || isUnderReview);

  useEffect(() => {
    setActionError(null);
    setIsCompletionDialogOpen(false);
  }, [selectedMilestone.id]);

  async function runAction(action: () => Promise<void>) {
    setIsUpdating(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Milestone update failed."
      );
    } finally {
      setIsUpdating(false);
    }
  }

  const completeMilestone = () =>
    runAction(() =>
      (async () => {
        if (!isComplete) {
          await workspace.updateProgress(selectedMilestone.id, 100);
        }
        await workspace.submitCompletionClaim(
          selectedMilestone.id,
          Math.max(0, selectedMilestone.estimatedCost) * 100
        );
        setIsCompletionDialogOpen(false);
      })()
    );

  const completionDialog = (
    <Dialog
      onOpenChange={(open) => {
        setIsCompletionDialogOpen(open);
        if (!open) {
          setActionError(null);
        }
      }}
      open={isCompletionDialogOpen}
    >
      <DialogContent data-testid="borrower-completion-dialog">
        <DialogHeader>
          <DialogTitle>Complete milestone</DialogTitle>
          <DialogDescription>
            Submit {selectedMilestone.name} as complete for lender review.
            Evidence can be added now or later if review asks for it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 rounded-md border border-border bg-bg-elevated p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-fg-secondary">Requested amount</span>
            <span className="font-semibold text-fg-primary">
              {money(selectedMilestone.estimatedCost)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-fg-secondary">Evidence</span>
            <span className="font-medium text-fg-primary">
              {hasEvidence
                ? `${selectedMilestone.evidenceFiles.length} file${selectedMilestone.evidenceFiles.length === 1 ? "" : "s"} attached`
                : "No files attached"}
            </span>
          </div>
        </div>
        {actionError ? (
          <div className="rounded-md border border-danger/35 bg-danger/10 p-3 text-danger text-sm">
            {actionError}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            data-testid={`borrower-confirm-completion-${selectedMilestone.id}`}
            disabled={isUpdating || !canSubmitCompletion}
            onClick={() => void completeMilestone()}
          >
            <ClipboardCheck />
            Submit completion claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {isApproved ? (
        <div
          className={cn(
            "flex items-center gap-2 font-medium text-sm text-success",
            className
          )}
          data-testid={testId}
          role="status"
        >
          <CheckCircle2 className="size-4" />
          Completed
        </div>
      ) : (
        <>
          <Button
            className={cn("min-h-10", className)}
            data-testid={testId}
            disabled={isUpdating || isUnderReview}
            onClick={() => setIsCompletionDialogOpen(true)}
          >
            <CheckCircle2 className="size-4" />
            {isUnderReview ? "Under review" : "Complete milestone"}
          </Button>
          {completionDialog}
        </>
      )}
    </>
  );
}

function MobileMilestoneActionBar({
  onOpenPanels,
  selectedDraw,
}: {
  onOpenPanels: () => void;
  selectedDraw?: DrawGroup;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card/95 px-3 py-3 backdrop-blur xl:hidden">
      <Button
        className="min-h-12 w-full justify-center px-2 text-xs"
        data-testid="borrower-mobile-open-panels"
        onClick={onOpenPanels}
        size="sm"
        variant="outline"
      >
        <ListChecks />
        <span>Milestones</span>
        <span className="rounded-full border border-border px-1.5 text-[0.62rem] text-muted-foreground">
          {selectedDraw?.label ?? "Draw"}
        </span>
      </Button>
    </div>
  );
}

function EvidenceManager({
  selectedMilestone,
}: {
  selectedMilestone: Milestone;
}) {
  const workspace = useBuildWorkspace();
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "camera">("upload");
  const [isDraggingEvidence, setIsDraggingEvidence] = useState(false);
  const evidenceFiles = [...selectedMilestone.evidenceFiles].sort(
    (left, right) => right.uploadedAt.localeCompare(left.uploadedAt)
  );
  const evidenceTypes = Array.from(
    new Set(evidenceFiles.map(evidenceTypeLabel))
  );
  const addEvidence = useCallback(() => {
    void workspace.addSampleEvidence(selectedMilestone.id);
  }, [selectedMilestone.id, workspace]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsStartingCamera(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera capture is not available in this browser. Use file upload instead."
      );
      cameraInputRef.current?.click();
      return;
    }

    setIsCameraOpen(true);
    setIsStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraError(
        "Camera access was blocked or unavailable. You can still upload a photo from the device."
      );
      cameraInputRef.current?.click();
    } finally {
      setIsStartingCamera(false);
    }
  }, []);

  const captureCameraFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!(video && canvas) || video.readyState < 2) {
      setCameraError("Camera preview is not ready yet. Try again in a moment.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    addEvidence();
    stopCamera();
  }, [addEvidence, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    stopCamera();
    setCameraError(null);
  }, [selectedMilestone.id, stopCamera]);

  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      data-testid="borrower-evidence-manager"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base">Evidence Manager</h2>
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition",
              activeTab === "upload"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="borrower-evidence-upload"
            onClick={() => {
              setActiveTab("upload");
              stopCamera();
            }}
            type="button"
          >
            <Upload className="size-4" />
            Upload
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition",
              activeTab === "camera"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="borrower-evidence-camera"
            onClick={() => setActiveTab("camera")}
            type="button"
          >
            <Camera className="size-4" />
            Camera
          </button>
        </div>
      </div>

      <input
        className="sr-only"
        data-testid="borrower-evidence-file-input"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            addEvidence();
            event.currentTarget.value = "";
          }
        }}
        ref={documentInputRef}
        type="file"
      />
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid="borrower-evidence-camera-input"
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            addEvidence();
            event.currentTarget.value = "";
          }
        }}
        ref={cameraInputRef}
        type="file"
      />

      {activeTab === "upload" && (
        <div className="mb-3">
          <button
            className={cn(
              "flex min-h-[120px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all duration-200",
              isDraggingEvidence
                ? "border-primary bg-primary/10"
                : "border-border bg-bg-elevated hover:border-primary/60"
            )}
            data-testid="borrower-evidence-dropzone"
            onClick={() => documentInputRef.current?.click()}
            onDragLeave={() => setIsDraggingEvidence(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingEvidence(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingEvidence(false);
              if (event.dataTransfer.files?.length) {
                addEvidence();
              }
            }}
            type="button"
          >
            <span className="flex flex-col items-center py-6 text-center">
              <span className="mb-2 text-4xl motion-safe:animate-bounce">
                📁
              </span>
              <span className="font-medium text-foreground">
                Drag & drop files here, or{" "}
                <span className="text-primary underline">browse</span>
              </span>
              <span className="mt-1 text-muted-foreground text-xs">
                (PNG, JPG, PDF, etc. up to 5MB each)
              </span>
            </span>
          </button>
        </div>
      )}

      {activeTab === "camera" && (
        <div className="mb-3">
          {cameraError ? (
            <div
              className="mb-3 rounded-md border border-warning/35 bg-warning/10 p-3 text-sm text-warning"
              data-testid="borrower-evidence-camera-error"
            >
              {cameraError}
            </div>
          ) : null}
          {isCameraOpen ? (
            <div
              className="rounded-md border border-border bg-bg-elevated p-3"
              data-testid="borrower-evidence-camera-panel"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-sm">Camera capture</h3>
                  <p className="text-muted-foreground text-xs">
                    Take a site photo for {selectedMilestone.name}.
                  </p>
                </div>
                <Button onClick={stopCamera} size="sm" variant="ghost">
                  Cancel
                </Button>
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-border bg-black">
                <video
                  aria-label="Camera preview"
                  autoPlay
                  className="aspect-video w-full object-cover"
                  muted
                  playsInline
                  ref={videoRef}
                />
              </div>
              <canvas className="hidden" ref={canvasRef} />
              <Button
                className="mt-3 min-h-11 w-full"
                data-testid="borrower-evidence-camera-capture"
                disabled={isStartingCamera}
                onClick={captureCameraFrame}
              >
                <Camera />
                {isStartingCamera ? "Starting camera..." : "Capture photo"}
              </Button>
            </div>
          ) : (
            <button
              className="group relative flex w-full cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border-2 border-border border-dashed bg-bg-elevated p-8 text-center transition-all duration-300 ease-out hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-[0_0_24px_-6px_rgba(var(--color-primary),0.15)] active:scale-[0.98] active:duration-100"
              onClick={() => void startCamera()}
              type="button"
            >
              <span className="relative grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 ease-out group-hover:scale-110 group-hover:bg-primary/[0.15] group-hover:shadow-[0_0_20px_-4px_rgba(var(--color-primary),0.25)]">
                <Camera className="size-7 transition-transform duration-300 group-hover:scale-105" />
              </span>
              <span className="flex flex-col items-center gap-1">
                <span className="block font-semibold text-foreground text-sm transition-colors group-hover:text-primary">
                  Camera capture
                </span>
                <span className="block max-w-[16rem] text-muted-foreground text-xs leading-relaxed">
                  Take a site photo for {selectedMilestone.name}. Your camera
                  will open in the browser.
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-0.5 scale-x-0 bg-primary transition-transform duration-300 ease-out group-hover:scale-x-100" />
            </button>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(evidenceTypes.length > 0 ? evidenceTypes : ["No files yet"]).map(
          (label, index) => (
            <Badge
              className={
                index === 0 ? "bg-primary text-primary-foreground" : ""
              }
              key={label}
              variant={index === 0 ? "default" : "outline"}
            >
              {label}
            </Badge>
          )
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {evidenceFiles.map((file) => (
          <EvidenceTile
            file={file}
            key={file.id}
            status={evidenceStatusText[selectedMilestone.evidenceStatus]}
            tone={
              selectedMilestone.evidenceStatus === "locationUnverified"
                ? "warning"
                : "default"
            }
          />
        ))}
        {evidenceFiles.length === 0 ? (
          <div
            className="col-span-full grid min-h-32 gap-4 rounded-md border border-border border-dashed bg-bg-elevated p-4 text-left sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
            data-testid="borrower-evidence-empty"
          >
            <span className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground text-sm">
                No evidence for {selectedMilestone.name}
              </span>
              <span className="mt-1 block max-w-prose text-muted-foreground text-sm">
                Upload or capture evidence for this milestone.
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FinancialControls({
  dashboardStats,
}: {
  dashboardStats: {
    averageProgress: number;
    remaining: number;
    spent: number;
    totalBudget: number;
  };
}) {
  const workspace = useBuildWorkspace();
  const selectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId
    ) ?? workspace.milestones[0];
  const expenseRows =
    selectedMilestone && selectedMilestone.actualCost > 0
      ? [
          {
            amount: money(selectedMilestone.actualCost),
            context: selectedMilestone.name,
            status:
              selectedMilestone.evidenceStatus === "accepted"
                ? "ok"
                : evidenceStatusText[selectedMilestone.evidenceStatus],
          },
        ]
      : [];
  const selectedMilestoneName =
    selectedMilestone?.name ?? "the selected milestone";

  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      data-testid="borrower-financial-controls"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base">Financial Controls</h2>
        <Button className="min-h-11 md:min-h-0" size="sm" variant="outline">
          <Plus />
          Add Expense
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">Budget</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
                Original
              </div>
              <div className="mt-1 font-semibold text-sm">
                {money(dashboardStats.totalBudget)}
              </div>
            </div>
            <div>
              <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
                Spent
              </div>
              <div className="mt-1 font-semibold text-sm">
                {money(dashboardStats.spent)}
              </div>
            </div>
            <div>
              <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
                Remaining
              </div>
              <div className="mt-1 font-semibold text-sm">
                {money(dashboardStats.remaining)}
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">Expenses</h3>
            <Badge variant="outline">{selectedMilestoneName}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.map((row) => (
                  <TableRow key={row.context}>
                    <TableCell>{workspace.build.phaseLabel}</TableCell>
                    <TableCell>{row.context}</TableCell>
                    <TableCell>{row.amount}</TableCell>
                    <TableCell
                      className={
                        row.status === "ok" ? "text-success" : "text-warning"
                      }
                    >
                      {row.status}
                    </TableCell>
                  </TableRow>
                ))}
                {expenseRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={4}>
                      No reimbursable expenses have been submitted for{" "}
                      {selectedMilestoneName}.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusColumn({
  collapsed,
  onCollapsedChange,
  selectedDraw,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  selectedDraw?: DrawGroup;
}) {
  const workspace = useBuildWorkspace();
  const selectedDrawMilestones = workspace.milestones.filter(
    (milestone) => milestone.drawGroupId === selectedDraw?.id
  );
  const incompleteMilestones = selectedDrawMilestones.filter(
    (milestone) => milestone.status !== "approved"
  );
  const completedEvidenceNeeded = selectedDrawMilestones.filter(
    (milestone) =>
      milestone.progress >= 100 && milestone.evidenceStatus !== "accepted"
  );
  const requestAmount = Math.min(
    selectedDraw?.amount ?? 0,
    workspace.budget.borrowerWorkingCapitalLimit,
    workspace.budget.lenderDrawPolicyLimit
  );
  const drawRequestBlocked =
    selectedDrawMilestones.length === 0 ||
    incompleteMilestones.length > 0 ||
    completedEvidenceNeeded.length > 0;

  if (collapsed) {
    return (
      <aside
        className="order-3 flex max-h-[calc(100vh-11rem)] min-h-0 flex-col items-center gap-3 rounded-md border border-border bg-card p-2 xl:order-none"
        data-testid="borrower-status-column"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Expand draw controls"
                  data-testid="borrower-expand-status-column"
                  onClick={() => onCollapsedChange(false)}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <PanelLeftOpen />
            </TooltipTrigger>
            <TooltipContent side="left">Expand draw controls</TooltipContent>
          </Tooltip>
          <div className="h-px w-full bg-border" />
          <CollapsedStatusItem
            icon={<Banknote className="size-4" />}
            label={`Reimbursement eligible: ${money(selectedDraw?.amount ?? 0)}`}
            value={money(selectedDraw?.amount ?? 0)}
          />
          <CollapsedStatusItem
            icon={<Gauge className="size-4" />}
            label={`Working capital limit: ${money(workspace.budget.borrowerWorkingCapitalLimit)}`}
            value={money(workspace.budget.borrowerWorkingCapitalLimit)}
          />
          <CollapsedStatusItem
            icon={<ListChecks className="size-4" />}
            label={`${incompleteMilestones.length} milestone approval blocker${incompleteMilestones.length === 1 ? "" : "s"}`}
            tone={incompleteMilestones.length > 0 ? "warning" : "success"}
            value={String(incompleteMilestones.length)}
          />
          <CollapsedStatusItem
            icon={<Upload className="size-4" />}
            label={`${completedEvidenceNeeded.length} completed milestone evidence blocker${completedEvidenceNeeded.length === 1 ? "" : "s"}`}
            tone={completedEvidenceNeeded.length > 0 ? "warning" : "success"}
            value={String(completedEvidenceNeeded.length)}
          />
          <CollapsedStatusItem
            icon={<Send className="size-4" />}
            label={
              drawRequestBlocked
                ? `Draw request blocked. Current request amount: ${money(requestAmount)}`
                : `Ready to request ${money(requestAmount)}`
            }
            tone={drawRequestBlocked ? "muted" : "success"}
            value={drawRequestBlocked ? "Hold" : "Ready"}
          />
        </TooltipProvider>
      </aside>
    );
  }

  return (
    <div
      className="order-3 grid min-w-0 content-start gap-3 sm:gap-4 xl:order-none"
      data-testid="borrower-status-column"
    >
      <DrawStatusPanel
        onCollapse={() => onCollapsedChange(true)}
        selectedDraw={selectedDraw}
      />
      <DrawGroupStatus selectedDraw={selectedDraw} />
    </div>
  );
}

function CollapsedStatusItem({
  icon,
  label,
  tone = "default",
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: "default" | "muted" | "success" | "warning";
  value: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className={cn(
              "grid min-h-14 w-full place-items-center rounded-md border px-1 py-2 text-center transition",
              tone === "success" &&
                "border-success/40 bg-success/10 text-success",
              tone === "warning" &&
                "border-warning/40 bg-warning/10 text-warning",
              tone === "muted" &&
                "border-border bg-bg-sunken text-muted-foreground",
              tone === "default" &&
                "border-border bg-bg-sunken text-foreground hover:border-primary/60"
            )}
            type="button"
          />
        }
      >
        {icon}
        <span className="mt-1 max-w-full truncate font-semibold text-[0.62rem]">
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function DrawStatusPanel({
  onCollapse,
  selectedDraw,
}: {
  onCollapse: () => void;
  selectedDraw?: DrawGroup;
}) {
  const workspace = useBuildWorkspace();

  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      data-testid="borrower-draw-status-panel"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-base">Draw Status</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{selectedDraw?.label ?? "No draw"}</Badge>
          <Button
            aria-label="Collapse draw controls"
            className="hidden h-7 px-2 text-xs xl:inline-flex"
            data-testid="borrower-collapse-status-column"
            onClick={onCollapse}
            size="sm"
            variant="outline"
          >
            <PanelRightClose />
            Collapse
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        <div>
          <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
            Reimbursement eligible
          </div>
          <div className="mt-1 break-words font-semibold text-lg">
            {money(selectedDraw?.amount ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
            Working capital limit
          </div>
          <div className="mt-1 break-words font-semibold text-lg">
            {money(workspace.budget.borrowerWorkingCapitalLimit)}
          </div>
        </div>
        <div>
          <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
            Draw policy limit
          </div>
          <div className="mt-1 break-words font-semibold text-lg">
            {money(workspace.budget.lenderDrawPolicyLimit)}
          </div>
        </div>
      </div>
    </section>
  );
}

function DrawGroupStatus({ selectedDraw }: { selectedDraw?: DrawGroup }) {
  const workspace = useBuildWorkspace();
  const selectedDrawMilestones = workspace.milestones.filter(
    (milestone) => milestone.drawGroupId === selectedDraw?.id
  );
  const outstandingMilestones = selectedDrawMilestones.filter(
    (milestone) => milestone.status !== "approved"
  );
  const outstandingEvidence = selectedDrawMilestones.filter(
    (milestone) =>
      milestone.status === "approved" && milestone.evidenceStatus !== "accepted"
  );
  const drawRequestBlocked =
    selectedDrawMilestones.length === 0 ||
    outstandingMilestones.length > 0 ||
    outstandingEvidence.length > 0;
  const isDrawReleased = selectedDraw?.status === "released";
  const isDrawEligible = !(drawRequestBlocked || isDrawReleased);
  const drawRequestBlockers = [
    outstandingMilestones.length > 0
      ? `${outstandingMilestones.length} milestone approval${outstandingMilestones.length === 1 ? "" : "s"}`
      : null,
    outstandingEvidence.length > 0
      ? `${outstandingEvidence.length} completed milestone evidence requirement${outstandingEvidence.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  const requestAmount = Math.min(
    selectedDraw?.amount ?? 0,
    workspace.budget.borrowerWorkingCapitalLimit,
    workspace.budget.lenderDrawPolicyLimit
  );
  const statusCallout = isDrawReleased
    ? {
        body: `${selectedDraw?.label ?? "This draw"} reimbursement has already been released. No borrower action is needed.`,
        icon: CheckCircle2,
        meta: `Released amount ${money(requestAmount)}`,
        title: "Draw already released",
        tone: "border-success/35 bg-success/10 text-success [&_p]:text-success/85",
      }
    : isDrawEligible
      ? {
          body: "All milestones and evidence controls are clear. Submit the reimbursement request for lender review.",
          icon: Send,
          meta: `Request amount ${money(requestAmount)}`,
          title: "Draw eligible to request",
          tone: "border-primary/35 bg-primary/10 text-primary [&_p]:text-primary/85",
        }
      : {
          body:
            drawRequestBlockers.length > 0
              ? `Resolve ${drawRequestBlockers.join(" and ")} before requesting reimbursement.`
              : "Select a draw group with scoped milestones before requesting reimbursement.",
          icon: AlertTriangle,
          meta: `${selectedDraw?.label ?? "This draw"} is on hold`,
          title: "Draw not ready",
          tone: "border-warning/35 bg-warning/10 text-warning [&_p]:text-warning/90",
        };
  const StatusCalloutIcon = statusCallout.icon;
  const focusMilestone = (milestone: Milestone, targetTestId: string) => {
    workspace.selectMilestone(milestone.id);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-testid="${targetTestId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      data-testid="borrower-draw-group-status"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-base">Draw Group Status</h2>
        <Badge
          variant={
            drawRequestBlocked && !isDrawReleased ? "outline" : "default"
          }
        >
          {isDrawReleased
            ? "Released"
            : drawRequestBlocked
              ? "Incomplete"
              : "Ready"}
        </Badge>
      </div>
      <div className="grid gap-3">
        <div
          className={cn("rounded-md border p-3", statusCallout.tone)}
          data-testid="borrower-draw-state-callout"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-current/10">
              <StatusCalloutIcon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-sm">
                {statusCallout.title}
              </span>
              <p className="mt-1 text-xs">{statusCallout.body}</p>
              <span className="mt-2 inline-flex rounded-full border border-current/25 px-2 py-0.5 font-medium text-[0.68rem]">
                {statusCallout.meta}
              </span>
            </span>
          </div>
        </div>
        <div
          className="rounded-md border border-border bg-bg-elevated p-3"
          data-testid="borrower-draw-outstanding-milestones"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">Milestones to Complete</h3>
            <Badge
              variant={outstandingMilestones.length ? "outline" : "default"}
            >
              {outstandingMilestones.length || "Clear"}
            </Badge>
          </div>
          <div className="grid gap-2">
            {outstandingMilestones.length > 0 ? (
              outstandingMilestones.map((milestone) => {
                const tone =
                  milestoneIssueTone[
                    milestone.status as Exclude<MilestoneStatus, "approved">
                  ] ?? milestoneIssueTone.notStarted;
                const StatusIcon =
                  tone.marker === "info" ? Info : AlertTriangle;

                return (
                  <button
                    className={cn(
                      "grid min-h-28 gap-2 rounded-md border p-3 text-left text-sm transition",
                      tone.card
                    )}
                    key={`milestone-${milestone.id}`}
                    onClick={() =>
                      focusMilestone(
                        milestone,
                        "borrower-selected-milestone-summary"
                      )
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 gap-2">
                        <StatusIcon
                          className={cn("mt-0.5 size-4 shrink-0", tone.icon)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {milestone.name}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {milestone.progress}% complete
                          </span>
                        </span>
                      </span>
                      <Badge variant="outline">
                        {statusText(milestone.status)}
                      </Badge>
                    </div>
                    <Progress value={milestone.progress} />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium text-xs",
                        tone.cta
                      )}
                    >
                      Open milestone details{" "}
                      <SquareArrowOutUpRight className="size-3" />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="size-4" />
                All milestones in {selectedDraw?.label ?? "this draw"} are
                approved.
              </div>
            )}
          </div>
        </div>
        <div
          className="rounded-md border border-border bg-bg-elevated p-3"
          data-testid="borrower-draw-outstanding-evidence"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">Evidence Still Needed</h3>
            <Badge variant={outstandingEvidence.length ? "outline" : "default"}>
              {outstandingEvidence.length || "Clear"}
            </Badge>
          </div>
          <div className="grid gap-2">
            {outstandingEvidence.length > 0 ? (
              outstandingEvidence.map((milestone) => {
                const tone = evidenceIssueTone(milestone);

                return (
                  <button
                    className={cn(
                      "min-h-24 rounded-md border p-3 text-left text-sm transition",
                      tone.card
                    )}
                    key={`evidence-${milestone.id}`}
                    onClick={() =>
                      focusMilestone(milestone, "borrower-evidence-manager")
                    }
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <MapPinOff
                          className={cn("size-4 shrink-0", tone.icon)}
                        />
                        <span className="min-w-0 truncate font-semibold">
                          {milestone.name}
                        </span>
                      </span>
                      <Badge variant={tone.badge}>
                        {evidenceStatusText[milestone.evidenceStatus]}
                      </Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground text-xs">
                      {milestone.evidenceFiles.length > 0
                        ? `${milestone.evidenceFiles.length} evidence file${milestone.evidenceFiles.length === 1 ? "" : "s"} uploaded`
                        : "No evidence files uploaded"}
                    </div>
                    <span
                      className={cn(
                        "mt-2 inline-flex items-center gap-1 font-medium text-xs",
                        tone.cta
                      )}
                    >
                      Upload or review evidence{" "}
                      <SquareArrowOutUpRight className="size-3" />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="size-4" />
                No completed milestones in {selectedDraw?.label ?? "this draw"}{" "}
                are waiting on evidence.
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Request amount</span>
          <span className="font-semibold">{money(requestAmount)}</span>
        </div>
        <button
          className="inline-flex min-h-11 w-full select-none items-center justify-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm transition hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50 md:min-h-8 md:text-xs/relaxed"
          data-testid="borrower-submit-draw-request"
          disabled={!isDrawEligible}
          type="button"
        >
          {isDrawReleased ? "Draw Released" : "Submit Draw Request"}
        </button>
      </div>
    </section>
  );
}

function ChatTab() {
  const workspace = useBuildWorkspace();
  const selectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId
    ) ?? workspace.milestones[0];
  const chatItems = [
    ...workspace.issues.slice(0, 3).map((issue) => ({
      actor: "Workspace validation",
      message: `${issue.title}: ${issue.message}`,
    })),
    ...workspace.outboxEvents.slice(0, 3).map((event) => ({
      actor: event.eventType,
      message: event.payloadPreview,
    })),
  ];
  if (chatItems.length === 0 && selectedMilestone) {
    chatItems.push({
      actor: workspace.build.borrowerName,
      message: `${selectedMilestone.name} is ${statusText(selectedMilestone.status)} with ${evidenceStatusText[selectedMilestone.evidenceStatus]} evidence.`,
    });
  }

  return (
    <div
      className="grid min-h-full content-start gap-3 p-2 sm:gap-4 sm:p-4"
      data-testid="borrower-chat-tab"
    >
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-base">Project Chat</h2>
          <Badge variant="outline">
            {chatItems.length} update{chatItems.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="grid gap-3">
          {chatItems.map(({ actor, message }) => (
            <div
              className="rounded-md border border-border bg-bg-elevated p-3"
              key={`${actor}-${message}`}
            >
              <div className="font-semibold text-sm">{actor}</div>
              <p className="mt-1 text-muted-foreground text-sm">{message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DocumentsTab() {
  const workspace = useBuildWorkspace();
  const evidenceDocuments = workspace.milestones.flatMap((milestone) =>
    milestone.evidenceFiles.map((file) => ({
      context: milestone.name,
      file,
      status: evidenceStatusText[milestone.evidenceStatus],
    }))
  );
  const documentRows = [
    {
      context: `Budget version ${workspace.budget.version}`,
      name: `${workspace.build.buildName} approved budget`,
      status: "Versioned",
    },
    ...evidenceDocuments.map(({ context, file, status }) => ({
      context,
      name: file.fileName,
      status,
    })),
  ];

  return (
    <div
      className="grid min-h-full content-start gap-3 p-2 sm:gap-4 sm:p-4"
      data-testid="borrower-documents-tab"
    >
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-base">Project Documents</h2>
          <Badge variant="outline">
            {documentRows.length} file{documentRows.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="grid gap-2 md:hidden">
          {documentRows.map(({ context, name, status }) => (
            <div
              className="rounded-md border border-border bg-bg-elevated p-3"
              key={name}
            >
              <div className="font-semibold text-sm">{name}</div>
              <div className="mt-2 grid gap-1 text-muted-foreground text-xs">
                <span>{context}</span>
                <span>{status}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentRows.map(({ context, name, status }) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>{context}</TableCell>
                  <TableCell>{status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  progress,
  value,
}: {
  label: string;
  progress?: number;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
      <div className="text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="mt-2 break-words font-semibold text-lg">{value}</div>
      {typeof progress === "number" ? (
        <Progress className="mt-3" value={progress} />
      ) : null}
    </div>
  );
}

function EvidenceTile({
  file,
  status,
  tone = "default",
}: {
  file: EvidenceFileSummary;
  status: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "grid min-h-24 content-between rounded-md border p-3 text-xs",
        tone === "warning"
          ? "border-warning/40 bg-warning/10"
          : "border-border bg-bg-elevated"
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {tone === "warning" ? (
          <MapPinOff className="size-4" />
        ) : (
          <FileText className="size-4" />
        )}
        <span className="min-w-0 truncate">{file.fileName}</span>
      </div>
      <div className="mt-3 grid gap-1">
        <span
          className={cn(
            "text-muted-foreground",
            tone === "warning" && "text-warning"
          )}
        >
          {status}
        </span>
        <span className="text-muted-foreground">
          {evidenceTypeLabel(file)} / {formatBytes(file.sizeBytes)}
        </span>
      </div>
    </div>
  );
}
