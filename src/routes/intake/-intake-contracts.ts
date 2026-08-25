import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building,
  Building2,
  Check,
  ClipboardList,
  Clock3,
  FileClock,
  FilePenLine,
  FileText,
  HardHat,
  House,
  Landmark,
  Layers3,
  MapPin,
  Search,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { flushSync } from "react-dom";

import buildProgressFinishedImageAsset from "./assets/Build Progress Finished.webp";
import buildProgressFoundationImageAsset from "./assets/Build Progress Foundation.webp";
import buildProgressLotImageAsset from "./assets/Build Progress Lot.webp";
import buildProgressPolishedImageAsset from "./assets/Build Progress Polished.webp";
import buildProgressStructureImageAsset from "./assets/Build Progress Structure.webp";

export const trustItems = [
  { icon: ShieldCheck, label: "No credit check" },
  { icon: ClipboardList, label: "No documents required" },
  { icon: Clock3, label: "Takes about 2 minutes" },
] as const;

export const testimonials: Array<{
  icon: LucideIcon;
  label: string;
  name: string;
  quote: string;
  role: string;
}> = [
  {
    icon: Building2,
    label: "Developer",
    name: "Rachel Torres,",
    role: "Development Manager",
    quote:
      "The draw plan finally matched the reality of our construction schedule. DrawFlow helped our lender see the sequence, the evidence, and the funding need in one place.",
  },
  {
    icon: Landmark,
    label: "Lender",
    name: "Marcus Lee,",
    role: "Lending Officer",
    quote:
      "I did not have to reconstruct the project from email threads. The milestone context was clear enough for our team to review faster and ask better questions.",
  },
  {
    icon: HardHat,
    label: "Builder",
    name: "Nina Patel,",
    role: "Builder",
    quote:
      "We knew which work unlocked the next draw before crews started. That clarity kept our cash planning honest and reduced the last-minute scramble.",
  },
  {
    icon: Building2,
    label: "Owner-builder",
    name: "Olivia Grant,",
    role: "Owner-Builder",
    quote:
      "We stopped guessing between draws and started planning around real milestones. DrawFlow made the money side feel connected to the jobsite.",
  },
] as const;

export const extractedSqueezeAssetBase = "/assets/builders-squeezed-extracted";

export const rigidDrawNotes = [
  {
    alt: "Draw 1 released note",
    className: "is-draw-1",
    src: `${extractedSqueezeAssetBase}/draw-note-1-upfront.webp`,
  },
  {
    alt: "Draw 2 released note",
    className: "is-draw-2",
    src: `${extractedSqueezeAssetBase}/draw-note-2-midpoint.webp`,
  },
  {
    alt: "Draw 3 released note",
    className: "is-draw-3",
    src: `${extractedSqueezeAssetBase}/draw-note-3-final.webp`,
  },
] as const;

export const milestoneUnlocksForSqueeze = [
  {
    amount: "$220,000",
    className: "is-foundation",
    label: "Foundation Complete",
    src: `${extractedSqueezeAssetBase}/unlock-tag-foundation-220k.svg`,
  },
  {
    amount: "$250,000",
    className: "is-framing",
    label: "Framing Complete",
    src: `${extractedSqueezeAssetBase}/unlock-tag-framing-250k.svg`,
  },
  {
    amount: "$180,000",
    className: "is-roof",
    label: "Roof Complete",
    src: `${extractedSqueezeAssetBase}/unlock-tag-roof-180k.svg`,
  },
  {
    amount: "$210,000",
    className: "is-dry-in",
    label: "Dry-In Complete",
    src: `${extractedSqueezeAssetBase}/unlock-tag-dry-in-210k.svg`,
  },
  {
    amount: "$200,000",
    className: "is-interiors",
    label: "Interiors Complete",
    src: `${extractedSqueezeAssetBase}/unlock-tag-interiors-200k.svg`,
  },
  {
    amount: "$300,000",
    className: "is-final",
    label: "Final Inspection",
    src: `${extractedSqueezeAssetBase}/unlock-tag-final-300k.svg`,
  },
] as const;

export const cashGapRisks = [
  {
    body: "Upfront draws fund tomorrow's expenses today.",
    icon: "cash-out-too-early.svg",
    title: "Capital out too early",
  },
  {
    body: "Locked-up funds earn nothing while you keep building.",
    icon: "idle-cash-clock-coin.svg",
    title: "Idle cash sits unused",
  },
  {
    body: "Bills don't wait for bank schedules, and gaps cost more.",
    icon: "broken-chain.svg",
    title: "Gaps before next draw",
  },
] as const;

export const approvedWorkBenefits = [
  {
    body: "Funds release when approved milestones are met.",
    icon: "right-time-calendar-check.svg",
    title: "Right capital, right time",
  },
  {
    body: "Keep money working in your build, not sitting in the bank.",
    icon: "stronger-cash-flow-chart.svg",
    title: "Stronger cash flow",
  },
  {
    body: "Fewer surprises. More control. Better project outcomes.",
    icon: "build-confidence-shield.svg",
    title: "Build with confidence",
  },
] as const;

export const fairlendSystemSteps: ReadonlyArray<{
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
}> = [
  {
    body: "Run a structured review across CMHC requirements, project docs, permits, budget, timeline, and borrower readiness.",
    icon: ClipboardList,
    label: "01",
    title: "CMHC readiness checklist",
  },
  {
    body: "Convert the build story into a lender-readable package with the risks, mitigants, evidence, and draw logic surfaced.",
    icon: FileText,
    label: "02",
    title: "Good underwriting narrative",
  },
  {
    body: "Experienced consultants pressure-test order of work, schedule, budget, dependencies, and the most efficient draw plan.",
    icon: Users,
    label: "03",
    title: "Build and draw planning session",
  },
  {
    body: "Completed, approved milestones unlock draw availability that builders can request when they actually need capital.",
    icon: Landmark,
    label: "04",
    title: "On-demand milestone draws",
  },
  {
    body: "Dedicated site-visit staff verify progress, gather evidence, and keep approval context moving instead of buried in email.",
    icon: MapPin,
    label: "05",
    title: "Site visits and evidence",
  },
  {
    body: "When the build stalls, we can help find practical fixes, including access to reliable, cost-effective contractors.",
    icon: Wrench,
    label: "06",
    title: "Unstuck support network",
  },
] as const;

export const referralMoments = [
  "Before the builder locks budget, trades, or construction sequence",
  "Before the CMHC insurance package starts bouncing between parties",
  "When a broker sees a good project with a messy file",
  "When drawings, scope, or contractor pricing may affect fundability",
  "When a build is stuck because cash, evidence, or trades are out of sync",
] as const;

export const propertyStatusOptions: Array<{
  icon: LucideIcon;
  label: string;
  value: string;
}> = [
  { icon: House, label: "I/we own the property", value: "I/we own it" },
  {
    icon: Landmark,
    label: "Related entity owns it",
    value: "Related entity owns it",
  },
  {
    icon: FilePenLine,
    label: "Firm purchase agreement signed",
    value: "Firm purchase agreement signed",
  },
  {
    icon: FileClock,
    label: "Conditional purchase agreement signed",
    value: "Conditional purchase agreement signed",
  },
  {
    icon: FileText,
    label: "Offer / LOI submitted",
    value: "Offer / LOI submitted",
  },
  {
    icon: BriefcaseBusiness,
    label: "Under negotiation",
    value: "Under negotiation",
  },
  {
    icon: Search,
    label: "Property identified, no control yet",
    value: "Property identified, no control yet",
  },
  {
    icon: MapPin,
    label: "No specific property yet",
    value: "No specific property yet",
  },
] as const;

export const TOTAL_STEPS = 7;

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface IntakeAnswers {
  address: string;
  borrowerEquity: string;
  borrowerExperience: string;
  buildPermitFileName: string;
  buildType: string;
  contactRole: string;
  email: string;
  financingNeeds: string[];
  financingTimeline: string;
  name: string;
  notes: string;
  phone: string;
  projectCost: string;
  projectStage: string;
  projectTeam: string[];
  requestedLoan: string;
  siteControl: string;
  unitCount: string;
}

export interface StepVisual {
  image: string;
  label: string;
  summary: string[];
  title: string;
}

export type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>;
  };
};

export function runIntakeStepTransition(update: () => void): void {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const startViewTransition = (document as ViewTransitionDocument)
    .startViewTransition;

  if (typeof startViewTransition !== "function") {
    update();
    return;
  }

  startViewTransition.call(document, () => {
    flushSync(update);
  });
}

export const defaultAnswers: IntakeAnswers = {
  address: "",
  buildPermitFileName: "",
  siteControl: "I/we own it",
  buildType: "Multiplex / small rental build",
  unitCount: "5-6",
  projectStage: "Permit submitted",
  financingNeeds: ["Construction financing", "Bridge to CMHC financing"],
  financingTimeline: "31-60 days",
  requestedLoan: "$2.5M-$5M",
  projectCost: "$5M-$10M",
  borrowerEquity: "$1M-$2.5M",
  projectTeam: ["Builder / general contractor", "Architect / designer"],
  borrowerExperience: "Owns/manages rental properties",
  contactRole: "Developer",
  name: "",
  email: "",
  phone: "",
  notes: "",
};

export const buildTypeOptions = [
  { icon: Building, label: "New residential construction" },
  { icon: Layers3, label: "Multiplex / small rental build" },
  { icon: ArrowRight, label: "Addition or conversion to add units" },
  { icon: Wrench, label: "Major renovation / repositioning" },
  { icon: Landmark, label: "Existing rental refinance" },
  { icon: Check, label: "Completion take-out" },
  { icon: MapPin, label: "Land acquisition before construction" },
  { icon: Building2, label: "Mixed-use project" },
  { icon: Search, label: "Not sure" },
] as const;

export const unitCountOptions = [
  "1",
  "2",
  "3-4",
  "5-6",
  "7-10",
  "11-20",
  "21-50",
  "51+",
  "Not sure",
];

export const projectStageOptions = [
  "Idea / feasibility",
  "Property identified",
  "Owned / under contract",
  "Concept design complete",
  "Zoning/planning reviewed",
  "Permit being prepared",
  "Permit submitted",
  "Permit issued",
  "Construction started",
  "Partially complete",
  "Substantially complete",
  "Stabilized / rented",
];

export const financingNeedOptions = [
  "Construction financing",
  "Land acquisition",
  "Pre-development / permit-stage capital",
  "Bridge to construction financing",
  "Bridge to CMHC financing",
  "Completion take-out",
  "Refinance existing debt",
  "Existing lender maturity",
  "Appraisal came in low",
  "Need more leverage",
  "Cost overrun / additional construction funds",
  "Debt consolidation",
  "Equity partner / capital stack help",
  "Not sure",
];

export const financingTimelineOptions = [
  "Immediately / under 14 days",
  "15-30 days",
  "31-60 days",
  "61-90 days",
  "3-6 months",
  "6-12 months",
  "No deadline yet / exploratory",
];

export const loanRangeOptions = [
  "Under $500K",
  "$500K-$1M",
  "$1M-$2.5M",
  "$2.5M-$5M",
  "$5M-$10M",
  "$10M-$25M",
  "$25M+",
  "Not sure",
];

export const equityRangeOptions = [
  "Under $100K",
  "$100K-$250K",
  "$250K-$500K",
  "$500K-$1M",
  "$1M-$2.5M",
  "$2.5M-$5M",
  "$5M+",
  "Equity is mostly in the property / land",
  "Not sure",
];

export const teamOptions = [
  "Builder / general contractor",
  "Architect / designer",
  "Planner / permit consultant",
  "Engineer",
  "Quantity surveyor",
  "Appraiser",
  "Mortgage broker",
  "Realtor",
  "Lawyer",
  "Accountant",
  "Property manager",
  "None yet",
  "Other",
];

export const experienceOptions = [
  "Experienced builder/developer",
  "Owns/manages rental properties",
  "Completed similar construction projects",
  "Completed smaller renovation/build projects",
  "First project, but experienced team is involved",
  "First project, no experienced team yet",
  "Not sure",
];

export const contactRoleOptions = [
  "Borrower / property owner",
  "Developer",
  "Builder / general contractor",
  "Mortgage broker",
  "Realtor",
  "Architect / designer",
  "Planner / permit consultant",
  "Investor / capital partner",
  "Lawyer / accountant",
  "Property manager",
  "Other advisor",
];

export const stepVisuals: Record<2 | 3 | 4 | 5 | 6 | 7 | 8, StepVisual> = {
  2: {
    image: buildProgressFoundationImageAsset,
    label: "Site identified",
    title: "Foundation profile",
    summary: ["Site control", "Lot + foundation", "Routing starts"],
  },
  3: {
    image: buildProgressLotImageAsset,
    label: "Build profile",
    title: "Structure rising",
    summary: [
      "5-6 unit rental",
      "Permit submitted",
      "Multi-unit path likely relevant",
    ],
  },
  4: {
    image: buildProgressStructureImageAsset,
    label: "Financing lane",
    title: "Capital path forming",
    summary: ["Construction financing", "Bridge to CMHC", "31-60 days"],
  },
  5: {
    image: buildProgressFinishedImageAsset,
    label: "Capital snapshot",
    title: "Budget base",
    summary: ["$2.5M-$5M request", "$5M-$10M cost", "Equity base added"],
  },
  6: {
    image: buildProgressPolishedImageAsset,
    label: "Execution team",
    title: "Team on site",
    summary: ["Builder", "Architect", "Rental experience"],
  },
  7: {
    image: buildProgressPolishedImageAsset,
    label: "Review ready",
    title: "Lights on",
    summary: ["Contact route", "No credit check", "No obligation"],
  },
  8: {
    image: buildProgressPolishedImageAsset,
    label: "Project received",
    title: "Finished profile",
    summary: ["Project received", "Routing next step", "Calendar ready"],
  },
};
