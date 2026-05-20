export interface DashboardMetric {
  detail: string;
  id: string;
  label: string;
  tone: "default" | "success" | "warning" | "destructive";
  trend?: string;
  value: number;
}

export interface ActiveBuild {
  activeMilestone: string;
  address: string;
  builder: string;
  daysActive: number;
  id: string;
  milestoneState: "backlog" | "inProgress" | "inReview";
  status: "onTrack" | "behind" | "overBudget";
  statusLabel: string;
}

export interface DashboardKanbanColumn {
  description?: string;
  id: string;
  name: string;
}

export interface MilestoneKanbanCard {
  address: string;
  buildId: string;
  column: string;
  dueLabel?: string;
  id: string;
  name: string;
  priority: "low" | "medium" | "high";
  reviewerInitials?: string;
}

export interface ProposalKanbanCard {
  address: string;
  builder: string;
  closeLabel?: string;
  column: string;
  id: string;
  loanAmount: string;
  ltv: number;
  name: string;
}

export interface ScheduleEvent {
  date: string;
  id: string;
  kind: "siteVisit" | "drawReview" | "milestoneReview";
  label: string;
}

export interface QuickAction {
  actionLabel: string;
  address: string;
  buildId: string;
  dueLabel: string;
  id: string;
  title: string;
  type: "milestone" | "siteVisit" | "drawRequest";
}

export interface BackofficeDashboardData {
  activeBuilds: ActiveBuild[];
  metrics: DashboardMetric[];
  milestoneColumns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
  proposalColumns: DashboardKanbanColumn[];
  proposals: ProposalKanbanCard[];
  quickActions: QuickAction[];
  scheduleDate: Date;
  scheduleEvents: ScheduleEvent[];
}

export function getBackofficeDashboardData(): BackofficeDashboardData {
  return {
    metrics: [
      {
        id: "draw-requests",
        label: "Draw requests",
        value: 3,
        detail: "Awaiting underwriting review",
        trend: "1 location-unverified package",
        tone: "warning",
      },
      {
        id: "active-builds",
        label: "Active builds",
        value: 8,
        detail: "1 behind schedule, 1 over budget",
        trend: "4 site visits this week",
        tone: "destructive",
      },
      {
        id: "proposals",
        label: "Proposals",
        value: 3,
        detail: "1 new this week",
        trend: "2 lender-admin decisions pending",
        tone: "default",
      },
      {
        id: "milestones",
        label: "Milestones",
        value: 5,
        detail: "2 backlog, 3 in review",
        trend: "Evidence review queue",
        tone: "success",
      },
    ],
    activeBuilds: [
      {
        id: "B152",
        address: "8 Beachview",
        builder: "Yates Build Grp",
        daysActive: 312,
        status: "onTrack",
        statusLabel: "On track",
        activeMilestone: "Punch List",
        milestoneState: "inReview",
      },
      {
        id: "B123",
        address: "445 Downsview",
        builder: "Petrov Builds",
        daysActive: 211,
        status: "behind",
        statusLabel: "Behind 4 days",
        activeMilestone: "Drywall",
        milestoneState: "inReview",
      },
      {
        id: "B131",
        address: "57 Charles St",
        builder: "Mira Construct",
        daysActive: 168,
        status: "overBudget",
        statusLabel: "Over $14k",
        activeMilestone: "Foundation",
        milestoneState: "inProgress",
      },
      {
        id: "B111",
        address: "60 Downing",
        builder: "Hartwell Co.",
        daysActive: 142,
        status: "onTrack",
        statusLabel: "On track",
        activeMilestone: "Excavation",
        milestoneState: "backlog",
      },
      {
        id: "B141",
        address: "208 Cresthill",
        builder: "Sokolov & Sons",
        daysActive: 95,
        status: "onTrack",
        statusLabel: "On track",
        activeMilestone: "Framing",
        milestoneState: "inProgress",
      },
      {
        id: "B113",
        address: "12 Haig",
        builder: "Hartwell Co.",
        daysActive: 89,
        status: "onTrack",
        statusLabel: "On track",
        activeMilestone: "Rough Ins",
        milestoneState: "backlog",
      },
    ],
    milestoneColumns: [
      {
        id: "backlog",
        name: "Backlog",
        description: "Builder marked complete; triage",
      },
      {
        id: "needsSiteVisit",
        name: "Needs site visit",
        description: "Visit ordered or requested",
      },
      {
        id: "inProgress",
        name: "In progress",
        description: "Visit picked up and scheduled",
      },
      {
        id: "inReview",
        name: "In review",
        description: "Pending staff approval",
      },
    ],
    milestones: [
      {
        id: "m-b111-excavation",
        name: "Excavation",
        column: "backlog",
        buildId: "B111",
        address: "60 Downing",
        priority: "medium",
      },
      {
        id: "m-b113-rough-ins",
        name: "Rough Ins",
        column: "backlog",
        buildId: "B113",
        address: "12 Haig",
        priority: "medium",
        reviewerInitials: "KO",
      },
      {
        id: "m-b111-footings",
        name: "Footings",
        column: "needsSiteVisit",
        buildId: "B111",
        address: "60 Downing",
        priority: "low",
        reviewerInitials: "JM",
      },
      {
        id: "m-b111a-excavation",
        name: "Excavation",
        column: "needsSiteVisit",
        buildId: "B111A",
        address: "62 Twigg",
        priority: "medium",
        reviewerInitials: "TS",
      },
      {
        id: "m-b111a-shoring",
        name: "Shoring",
        column: "needsSiteVisit",
        buildId: "B111A",
        address: "62 Twigg",
        priority: "high",
        dueLabel: "overdue",
        reviewerInitials: "TS",
      },
      {
        id: "m-b131-cabinets",
        name: "Cabinets",
        column: "inProgress",
        buildId: "B131",
        address: "62 Haig",
        priority: "medium",
        reviewerInitials: "RD",
      },
      {
        id: "m-b131c-foundation",
        name: "Foundation",
        column: "inProgress",
        buildId: "B131C",
        address: "57 Charles",
        priority: "high",
        dueLabel: "Tue 10:00",
        reviewerInitials: "AL",
      },
      {
        id: "m-b123-mep",
        name: "MEP Rough",
        column: "inProgress",
        buildId: "B123",
        address: "445 Downsview",
        priority: "low",
        dueLabel: "Fri 14:30",
        reviewerInitials: "KO",
      },
      {
        id: "m-b131c-site-survey",
        name: "Site Survey",
        column: "inReview",
        buildId: "B131C",
        address: "57 Charles",
        priority: "medium",
        reviewerInitials: "AL",
      },
      {
        id: "m-b123-drywall",
        name: "Drywall",
        column: "inReview",
        buildId: "B123",
        address: "445 Downsview",
        priority: "medium",
        reviewerInitials: "JM",
      },
    ],
    proposalColumns: [
      {
        id: "draft",
        name: "Draft",
      },
      {
        id: "submitted",
        name: "Submitted",
      },
      {
        id: "approved",
        name: "Approved",
      },
      {
        id: "closed",
        name: "Closed",
      },
    ],
    proposals: [
      {
        id: "p-204",
        name: "P-204",
        column: "draft",
        address: "88 Glencairn",
        builder: "Hartwell Co.",
        loanAmount: "$1.92M",
        ltv: 72,
      },
      {
        id: "p-209",
        name: "P-209",
        column: "draft",
        address: "14 Roxborough",
        builder: "Mira Construct",
        loanAmount: "$3.40M",
        ltv: 68,
      },
      {
        id: "p-198",
        name: "P-198",
        column: "submitted",
        address: "210 Eglinton W",
        builder: "Petrov Builds",
        loanAmount: "$2.74M",
        ltv: 65,
      },
      {
        id: "p-191",
        name: "P-191",
        column: "approved",
        address: "67 Lytton",
        builder: "Sokolov & Sons",
        loanAmount: "$2.18M",
        ltv: 70,
        closeLabel: "closes Jun 12",
      },
      {
        id: "p-187",
        name: "P-187",
        column: "approved",
        address: "402 Avenue Rd",
        builder: "Yates Build Grp",
        loanAmount: "$4.55M",
        ltv: 63,
        closeLabel: "closes Jun 19",
      },
      {
        id: "p-176",
        name: "P-176",
        column: "closed",
        address: "19 Forest Hill",
        builder: "Hartwell Co.",
        loanAmount: "$2.92M",
        ltv: 69,
      },
      {
        id: "p-172",
        name: "P-172",
        column: "closed",
        address: "551 Russell Hl",
        builder: "Mira Construct",
        loanAmount: "$3.84M",
        ltv: 71,
      },
      {
        id: "p-168",
        name: "P-168",
        column: "closed",
        address: "74 Old Forest",
        builder: "Petrov Builds",
        loanAmount: "$2.10M",
        ltv: 64,
      },
    ],
    scheduleDate: new Date(2026, 5, 6),
    scheduleEvents: [
      {
        id: "s-b113",
        date: "2026-06-01T09:30:00",
        label: "B113 Site Visit",
        kind: "siteVisit",
      },
      {
        id: "s-b131-foundation",
        date: "2026-06-02T10:00:00",
        label: "B131C Foundation",
        kind: "milestoneReview",
      },
      {
        id: "s-draw-review",
        date: "2026-06-02T14:00:00",
        label: "Draw review",
        kind: "drawReview",
      },
      {
        id: "s-b111",
        date: "2026-06-04T11:00:00",
        label: "B111 Walk",
        kind: "siteVisit",
      },
      {
        id: "s-b123",
        date: "2026-06-05T14:30:00",
        label: "MEP Rough - B123",
        kind: "siteVisit",
      },
    ],
    quickActions: [
      {
        id: "qa-b123-milestone",
        type: "milestone",
        buildId: "B123",
        address: "445 Downsview",
        title: "Milestone Complete",
        dueLabel: "2 days",
        actionLabel: "Review / req. Site Visit",
      },
      {
        id: "qa-b131-visit",
        type: "siteVisit",
        buildId: "B131",
        address: "57 Charles St",
        title: "Site Visit Complete",
        dueLabel: "1 day",
        actionLabel: "Open Report",
      },
      {
        id: "qa-b111-draw",
        type: "drawRequest",
        buildId: "B111",
        address: "60 Charles St E",
        title: "Draw 2 Requested",
        dueLabel: "1 day",
        actionLabel: "Review Draw Request",
      },
    ],
  };
}
