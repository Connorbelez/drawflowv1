import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileClock,
  FilePenLine,
  FileText,
  HardHat,
  House,
  Landmark,
  Layers3,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  User,
  Users,
  Wrench,
} from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import {
  KokonutBentoCard,
  KokonutBentoGridShell,
} from "#/components/kokonutui/bento-grid.tsx";
import { AnimatedBeam } from "#/components/ui/animated-beam.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame } from "#/components/ui/frame.tsx";
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "#/components/ui/timeline.tsx";
import buildProgressFinishedImage from "./assets/Build Progress Finished.webp";
import buildProgressFoundationImage from "./assets/Build Progress Foundation.webp";
import buildProgressLotImage from "./assets/Build Progress Lot.webp";
import buildProgressPolishedImage from "./assets/Build Progress Polished.webp";
import buildProgressStructureImage from "./assets/Build Progress Structure.webp";
import blueprintImage from "./assets/Landing Page Blueprint.png";
import backgroundImage from "./assets/Landing Page Hero Background.png";
import milestoneBlueprintStackImage from "./assets/Milestone Blueprint Stack Trimmed.png";
import multiplexImage from "./assets/Multiplex Transparent Asset.png";
import sitePlanBlueprintFieldImage from "./assets/Property Site Plan Blueprint Field.webp";
import sitePlanForegroundImage from "./assets/Property Site Plan Foreground.webp";
import "./-buildpath.css";

export const Route = createFileRoute("/intake/")({
  component: IntakeLandingPage,
});

const trustItems = [
  {
    icon: ShieldCheck,
    label: "No credit check",
  },
  {
    icon: ClipboardList,
    label: "No documents required",
  },
  {
    icon: Clock3,
    label: "Takes about 2 minutes",
  },
] as const;

const testimonials: Array<{
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

const extractedSqueezeAssetBase = "/assets/builders-squeezed-extracted";

const rigidDrawNotes = [
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

const milestoneUnlocksForSqueeze = [
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

const cashGapRisks = [
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

const approvedWorkBenefits = [
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

const fairlendSystemSteps: ReadonlyArray<{
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

const referralMoments = [
  "Before the builder locks budget, trades, or construction sequence",
  "Before the CMHC insurance package starts bouncing between parties",
  "When a broker sees a good project with a messy file",
  "When drawings, scope, or contractor pricing may affect fundability",
  "When a build is stuck because cash, evidence, or trades are out of sync",
] as const;

const propertyStatusOptions: Array<{
  icon: LucideIcon;
  label: string;
  value: string;
}> = [
  {
    icon: House,
    label: "I/we own the property",
    value: "I/we own it",
  },
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

const TOTAL_STEPS = 7;

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface IntakeAnswers {
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

interface StepVisual {
  image: string;
  label: string;
  summary: string[];
  title: string;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>;
  };
};

function runIntakeStepTransition(update: () => void): void {
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

const defaultAnswers: IntakeAnswers = {
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

const buildTypeOptions = [
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

const unitCountOptions = [
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

const projectStageOptions = [
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

const financingNeedOptions = [
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

const financingTimelineOptions = [
  "Immediately / under 14 days",
  "15-30 days",
  "31-60 days",
  "61-90 days",
  "3-6 months",
  "6-12 months",
  "No deadline yet / exploratory",
];

const loanRangeOptions = [
  "Under $500K",
  "$500K-$1M",
  "$1M-$2.5M",
  "$2.5M-$5M",
  "$5M-$10M",
  "$10M-$25M",
  "$25M+",
  "Not sure",
];

const equityRangeOptions = [
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

const teamOptions = [
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

const experienceOptions = [
  "Experienced builder/developer",
  "Owns/manages rental properties",
  "Completed similar construction projects",
  "Completed smaller renovation/build projects",
  "First project, but experienced team is involved",
  "First project, no experienced team yet",
  "Not sure",
];

const contactRoleOptions = [
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

const stepVisuals: Record<2 | 3 | 4 | 5 | 6 | 7 | 8, StepVisual> = {
  2: {
    image: buildProgressFoundationImage,
    label: "Site identified",
    title: "Foundation profile",
    summary: ["Site control", "Lot + foundation", "Routing starts"],
  },
  3: {
    image: buildProgressLotImage,
    label: "Build profile",
    title: "Structure rising",
    summary: [
      "5-6 unit rental",
      "Permit submitted",
      "Multi-unit path likely relevant",
    ],
  },
  4: {
    image: buildProgressStructureImage,
    label: "Financing lane",
    title: "Capital path forming",
    summary: ["Construction financing", "Bridge to CMHC", "31-60 days"],
  },
  5: {
    image: buildProgressFinishedImage,
    label: "Capital snapshot",
    title: "Budget base",
    summary: ["$2.5M-$5M request", "$5M-$10M cost", "Equity base added"],
  },
  6: {
    image: buildProgressPolishedImage,
    label: "Execution team",
    title: "Team on site",
    summary: ["Builder", "Architect", "Rental experience"],
  },
  7: {
    image: buildProgressPolishedImage,
    label: "Review ready",
    title: "Lights on",
    summary: ["Contact route", "No credit check", "No obligation"],
  },
  8: {
    image: buildProgressPolishedImage,
    label: "Project received",
    title: "Finished profile",
    summary: ["Project received", "Routing next step", "Calendar ready"],
  },
};

function IntakeLandingPage(): ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [answers, setAnswers] = useState<IntakeAnswers>(defaultAnswers);
  const isFormStep = step > 1;
  const isSuccessStep = step === 8;

  useEffect(() => {
    window.localStorage.setItem(
      "build-financing-intake",
      JSON.stringify(answers)
    );
  }, [answers]);

  useEffect(() => {
    if (step) {
      window.scrollTo({ behavior: "auto", top: 0 });
    }
  }, [step]);

  const summaryItems = useMemo(() => buildProjectSummary(answers), [answers]);

  const updateAnswer = <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ): void => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const goBack = (): void => {
    runIntakeStepTransition(() => {
      setStep((current) => {
        if (current <= 2) {
          return 1;
        }
        return (current - 1) as WizardStep;
      });
    });
  };

  const goForward = (): void => {
    runIntakeStepTransition(() => {
      setStep((current) => Math.min(current + 1, 8) as WizardStep);
    });
  };

  const goToLandingSection = (sectionId: string): void => {
    runIntakeStepTransition(() => {
      setStep(1);
    });

    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 90);
  };

  return (
    <>
      <DirectionalHoverHeader />
      <main className="bp-page bp-page--with-public-header">
        <Frame className="bp-shell">
          <section
            aria-labelledby={isFormStep ? "bp-form-title" : "bp-hero-title"}
            className={
              isFormStep
                ? isSuccessStep
                  ? `bp-canvas bp-canvas-form bp-canvas-success bp-intake-step-${step}`
                  : `bp-canvas bp-canvas-form bp-intake-step-${step}`
                : "bp-canvas"
            }
          >
            <img
              alt=""
              aria-hidden="true"
              className="bp-background"
              decoding="async"
              draggable={false}
              fetchPriority="high"
              height={936}
              loading="eager"
              src={backgroundImage}
              width={1681}
            />

            {isSuccessStep ? (
              <BuildPathSuccessStep
                answers={answers}
                onAddAnother={() => {
                  runIntakeStepTransition(() => {
                    setAnswers(defaultAnswers);
                    setStep(1);
                  });
                }}
                onBack={() => {
                  runIntakeStepTransition(() => setStep(7));
                }}
                summaryItems={summaryItems}
              />
            ) : isFormStep ? (
              step === 2 ? (
                <BuildPathPropertyStep
                  answers={answers}
                  onBack={goBack}
                  onContinue={() => {
                    if (answers.buildPermitFileName) {
                      runIntakeStepTransition(() => setStep(7));
                      return;
                    }
                    goForward();
                  }}
                  updateAnswer={updateAnswer}
                />
              ) : (
                <BuildPathWizardStep
                  answers={answers}
                  onBack={goBack}
                  onContinue={
                    step === 7
                      ? () => {
                          runIntakeStepTransition(() => setStep(8));
                        }
                      : goForward
                  }
                  step={step}
                  summaryItems={summaryItems}
                  updateAnswer={updateAnswer}
                />
              )
            ) : (
              <BuildPathHeroStart
                onStart={() => {
                  runIntakeStepTransition(() => setStep(2));
                }}
              />
            )}
          </section>
          {!isFormStep && (
            <>
              <BuildPathTestimonials />
              <CapitalFeatureSection />
              <BuildPathLandingSections
                onStart={() => {
                  runIntakeStepTransition(() => setStep(2));
                }}
              />
            </>
          )}
        </Frame>
      </main>
    </>
  );
}

function BuildPathStepProgress({
  step,
  total = TOTAL_STEPS,
}: {
  step: number;
  total?: number;
}): ReactElement {
  return (
    <div className="bp-step">
      <span>
        Step {step} of {total}
      </span>
      <span aria-hidden="true" className="bp-step-dots">
        {Array.from({ length: total }, (_, index) => index + 1).map(
          (dotStep) => (
            <i
              className={dotStep === step ? "is-active" : undefined}
              key={dotStep}
            />
          )
        )}
      </span>
    </div>
  );
}

function BuildPathHeroStart({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <>
      <div aria-hidden="true" className="bp-annotation bp-annotation-plan">
        Modern multiplex
        <span>6 units</span>
        <span>Lot size&nbsp;&nbsp;60&apos; x 100&apos;</span>
        <span>Zoning&nbsp;&nbsp;RM-2</span>
      </div>
      <div aria-hidden="true" className="bp-annotation bp-annotation-return">
        Smart design.
        <span>Strong returns.</span>
      </div>
      <div aria-hidden="true" className="bp-dashed-arc" />

      <div className="bp-copy">
        <BuildPathStepProgress step={1} />

        <h1 id="bp-hero-title">
          <span>Build financing that </span>
          <span>moves with the work</span>
        </h1>

        <p className="bp-subtitle">
          Plan draws around real construction progress,{" "}
          <span>
            not rigid schedules that ignore what is happening on site.
          </span>
        </p>

        <ul className="bp-trust-row">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card className="bp-trust-chip" key={item.label} render={<li />}>
                <span aria-hidden="true" className="bp-trust-icon">
                  <Icon strokeWidth={1.9} />
                </span>
                <span>{item.label}</span>
              </Card>
            );
          })}
        </ul>
      </div>

      <img
        alt=""
        aria-hidden="true"
        className="bp-blueprint"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={955}
        loading="eager"
        src={blueprintImage}
        width={1328}
      />
      <img
        alt=""
        aria-hidden="true"
        className="bp-multiplex"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={987}
        loading="eager"
        src={multiplexImage}
        width={1418}
      />

      <button
        aria-label="Continue to project review"
        className="bp-orb"
        onClick={onStart}
        type="button"
      >
        <ArrowRight strokeWidth={1.8} />
      </button>

      <div className="bp-cta-stack">
        <button className="bp-primary-cta" onClick={onStart} type="button">
          <span>Start project review</span>
          <ArrowRight aria-hidden="true" strokeWidth={1.8} />
        </button>
        <button className="bp-secondary-cta" type="button">
          I&apos;m just exploring
        </button>
        <p className="bp-secure-note">
          <LockKeyhole aria-hidden="true" strokeWidth={1.9} />
          <span>Your information is secure and never shared.</span>
        </p>
      </div>
    </>
  );
}

function BuildPathPropertyStep({
  answers,
  onBack,
  onContinue,
  updateAnswer,
}: {
  answers: IntakeAnswers;
  onBack: () => void;
  onContinue: () => void;
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void;
}): ReactElement {
  return (
    <div className="bp-form-stage">
      <div className="bp-site-plan-panel">
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-field"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanBlueprintFieldImage}
          width={1536}
        />
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-foreground"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanForegroundImage}
          width={1536}
        />

        <div className="bp-site-plan-notes bp-site-plan-notes-top">
          <p>Property site plan</p>
          <span>Lot area</span>
          <strong>14,200 sq ft</strong>
          <span>Zoning</span>
          <strong>R-3</strong>
          <span>Topography</span>
          <strong>Level</strong>
        </div>

        <div className="bp-buildable-note">
          <span>Buildable area</span>
          <strong>8,560 sq ft</strong>
        </div>

        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-depth"
        >
          142&apos;-0&quot;
        </div>
        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-width"
        >
          100&apos;-0&quot;
        </div>
        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-front"
        >
          <span>Front setback</span>
          <strong>20&apos;-0&quot;</strong>
        </div>

        <div className="bp-site-legend">
          <p>Legend</p>
          <span>
            <i />
            Property line
          </span>
          <span>
            <i />
            Setback line
          </span>
          <span>
            <i />
            Building footprint
          </span>
        </div>

        <div className="bp-site-summary">
          <p>Site summary</p>
          <span>
            <i />
            14,200 sq ft
          </span>
          <span>
            <i />
            0.33 acres
          </span>
          <span>
            <i />
            Level topography
          </span>
        </div>
      </div>

      <Card className="bp-form-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <div className="bp-form-content">
          <p className="bp-form-kicker">Property / site details</p>
          <h1 id="bp-form-title">Where is the build?</h1>
          <p className="bp-form-subtitle">
            Tell us about the property you plan to build on so we can match you
            with the right financing options.
          </p>

          <GoogleAddressAutocomplete
            className="bp-address-field bp-address-autocomplete"
            id="intake-property-address"
            inputRender={
              <input
                aria-label="Project property address"
                data-testid="intake-property-address-input"
              />
            }
            label="Project property address"
            onChange={(nextAddress) => updateAnswer("address", nextAddress)}
            onPlaceSelect={(_suggestion, details) => {
              if (details?.formattedAddress) {
                updateAnswer("address", details.formattedAddress);
              }
            }}
            placeholder="Start typing the project address"
            value={answers.address}
          />

          <fieldset className="bp-status-fieldset">
            <legend>Current property status</legend>
            <div className="bp-status-grid">
              {propertyStatusOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Card
                    className={
                      answers.siteControl === option.value
                        ? "bp-status-option is-selected"
                        : "bp-status-option"
                    }
                    key={option.label}
                    render={
                      <button
                        aria-pressed={answers.siteControl === option.value}
                        onClick={() =>
                          updateAnswer("siteControl", option.value)
                        }
                        type="button"
                      />
                    }
                  >
                    <OptionCardIcon icon={Icon} />
                    <span>{option.label}</span>
                    {answers.siteControl === option.value ? (
                      <Check
                        aria-hidden="true"
                        className="bp-status-check"
                        strokeWidth={2}
                      />
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </fieldset>

          <BuildPermitDisclosure
            fileName={answers.buildPermitFileName}
            onClear={() => updateAnswer("buildPermitFileName", "")}
            onFileSelected={(fileName) =>
              updateAnswer("buildPermitFileName", fileName)
            }
          />

          <button
            className="bp-form-continue"
            onClick={onContinue}
            type="button"
          >
            <span>Continue</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>

          <button className="bp-form-back" onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
            Back
          </button>
        </div>
      </Card>
    </div>
  );
}

function BuildPathWizardStep({
  answers,
  onBack,
  onContinue,
  step,
  summaryItems,
  updateAnswer,
}: {
  answers: IntakeAnswers;
  onBack: () => void;
  onContinue: () => void;
  step: WizardStep;
  summaryItems: string[];
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void;
}): ReactElement {
  const content = getWizardStepContent(step, answers, updateAnswer);

  return (
    <div className="bp-form-stage bp-wizard-stage">
      <BuildPathVisualPanel
        answers={answers}
        step={step}
        summaryItems={summaryItems}
      />

      <Card className="bp-form-panel bp-wizard-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <div className="bp-form-content" key={step}>
          <p className="bp-form-kicker">{content.kicker}</p>
          <h1 id="bp-form-title">{content.title}</h1>
          <p className="bp-form-subtitle">{content.subtitle}</p>

          <div className="bp-wizard-fields">{content.fields}</div>

          <div className="bp-wizard-actions">
            <button
              className="bp-form-continue"
              onClick={onContinue}
              type="button"
            >
              <span>{step === 7 ? "Submit project" : "Continue"}</span>
              <ArrowRight aria-hidden="true" strokeWidth={1.8} />
            </button>

            <button className="bp-form-back" onClick={onBack} type="button">
              <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
              Back
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function getWizardStepContent(
  step: WizardStep,
  answers: IntakeAnswers,
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void
): {
  fields: ReactElement;
  kicker: string;
  subtitle: string;
  title: string;
} {
  switch (step) {
    case 3:
      return {
        kicker: "Build profile",
        title: "What are you building?",
        subtitle:
          "Shape the project profile so we can separate construction, bridge, and take-out paths early.",
        fields: (
          <>
            <FieldGroup label="Project type">
              <div className="bp-option-grid bp-option-grid-three">
                {buildTypeOptions.map((option) => (
                  <SelectableCard
                    active={answers.buildType === option.label}
                    icon={option.icon}
                    key={option.label}
                    onClick={() => updateAnswer("buildType", option.label)}
                  >
                    {option.label}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Units after completion">
              <div className="bp-chip-grid">
                {unitCountOptions.map((option) => (
                  <SelectableChip
                    active={answers.unitCount === option}
                    key={option}
                    onClick={() => updateAnswer("unitCount", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Current project stage">
              <div className="bp-stage-timeline">
                {projectStageOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectStage === option}
                    key={option}
                    onClick={() => updateAnswer("projectStage", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 4:
      return {
        kicker: "Financing path",
        title: "What do you need financed?",
        subtitle:
          "Select every need that applies. DrawFlow can route a mixed capital stack without forcing one answer too early.",
        fields: (
          <>
            <FieldGroup label="Financing needs">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {financingNeedOptions.map((option) => (
                  <SelectableChip
                    active={answers.financingNeeds.includes(option)}
                    key={option}
                    onClick={() =>
                      updateAnswer(
                        "financingNeeds",
                        toggleMultiValue(answers.financingNeeds, option)
                      )
                    }
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="When do you need funding or guidance?">
              <div className="bp-option-grid">
                {financingTimelineOptions.map((option) => (
                  <SelectableCard
                    active={answers.financingTimeline === option}
                    icon={CalendarClock}
                    key={option}
                    onClick={() => updateAnswer("financingTimeline", option)}
                  >
                    {option}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 5:
      return {
        kicker: "Capital snapshot",
        title: "What size is the capital stack?",
        subtitle:
          "Ranges are enough for the first review. This keeps the conversation practical without forcing a polished budget.",
        fields: (
          <>
            <FieldGroup label="Estimated loan request">
              <div className="bp-chip-grid">
                {loanRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.requestedLoan === option}
                    key={option}
                    onClick={() => updateAnswer("requestedLoan", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Estimated total project cost">
              <div className="bp-chip-grid">
                {loanRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectCost === option}
                    key={option}
                    onClick={() => updateAnswer("projectCost", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Borrower equity or cash available">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {equityRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.borrowerEquity === option}
                    key={option}
                    onClick={() => updateAnswer("borrowerEquity", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 6:
      return {
        kicker: "Execution readiness",
        title: "Who is already on the project?",
        subtitle:
          "The team picture helps a lender understand how quickly the build can move from plan to verifiable progress.",
        fields: (
          <>
            <FieldGroup label="Project team">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {teamOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectTeam.includes(option)}
                    key={option}
                    onClick={() =>
                      updateAnswer(
                        "projectTeam",
                        toggleMultiValue(answers.projectTeam, option)
                      )
                    }
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Borrower or project experience">
              <div className="bp-option-grid bp-option-grid-experience">
                {experienceOptions.map((option) => (
                  <SelectableCard
                    active={answers.borrowerExperience === option}
                    icon={Users}
                    key={option}
                    onClick={() => updateAnswer("borrowerExperience", option)}
                  >
                    {option}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 7:
      return {
        kicker: "Review contact",
        title: "Where should we send the next step?",
        subtitle:
          "A DrawFlow reviewer can use this profile to point you toward suitable construction, bridge, or take-out financing options.",
        fields: (
          <>
            <FieldGroup label="Your role">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {contactRoleOptions.map((option) => (
                  <SelectableChip
                    active={answers.contactRole === option}
                    key={option}
                    onClick={() => updateAnswer("contactRole", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <div className="bp-contact-grid">
              <TextField
                icon={User}
                label="Name"
                onChange={(value) => updateAnswer("name", value)}
                placeholder="Your full name"
                value={answers.name}
              />
              <TextField
                icon={Mail}
                label="Email"
                onChange={(value) => updateAnswer("email", value)}
                placeholder="you@example.com"
                type="email"
                value={answers.email}
              />
              <TextField
                icon={Phone}
                label="Phone"
                onChange={(value) => updateAnswer("phone", value)}
                placeholder="Best phone number"
                type="tel"
                value={answers.phone}
              />
              <label className="bp-text-field bp-notes-field">
                <span>Anything else we should know?</span>
                <textarea
                  onChange={(event) =>
                    updateAnswer("notes", event.target.value)
                  }
                  placeholder="Optional notes about timing, lender conversations, or project constraints"
                  value={answers.notes}
                />
              </label>
            </div>

            <p className="bp-final-note">
              <LockKeyhole aria-hidden="true" strokeWidth={1.8} />
              No credit check, no obligation, and no documents required to
              start.
            </p>
          </>
        ),
      };
    default:
      return {
        kicker: "DrawFlow intake",
        title: "Review your project",
        subtitle: "Continue through the remaining project details.",
        fields: <></>,
      };
  }
}

function BuildPathVisualPanel({
  answers,
  step,
  summaryItems,
}: {
  answers: IntakeAnswers;
  step: WizardStep;
  summaryItems: string[];
}): ReactElement {
  const visual = stepVisuals[(step > 1 ? step : 2) as keyof typeof stepVisuals];
  const splitSummary = step >= 4 && step <= 7;
  const bottomSummaryItems = summaryItems.slice(0, 5);
  const topSummaryItems = getVisualTopSummaryItems(step, summaryItems);

  return (
    <div className="bp-wizard-visual">
      <img
        alt=""
        aria-hidden="true"
        className="bp-wizard-art"
        decoding="async"
        draggable={false}
        height={1024}
        key={visual.image}
        loading="eager"
        src={visual.image}
        width={1536}
      />

      <div
        aria-hidden="true"
        className="bp-visual-annotation bp-visual-annotation-top"
      >
        {visual.label}
        <span>{visual.title}</span>
      </div>

      <div className="bp-visual-card">
        <p>{answers.buildType}</p>
        <strong>{answers.unitCount} units</strong>
        <span>{answers.projectStage}</span>
      </div>

      {topSummaryItems.length > 0 ? (
        <div className="bp-visual-summary bp-visual-summary-top">
          {topSummaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}

      <div
        className={
          splitSummary
            ? "bp-visual-summary bp-visual-summary-bottom"
            : "bp-visual-summary"
        }
      >
        {bottomSummaryItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function getVisualTopSummaryItems(
  step: WizardStep,
  summaryItems: string[]
): string[] {
  switch (step) {
    case 4:
      return summaryItems.slice(5, 8);
    case 5:
      return summaryItems.slice(5, 11);
    case 6:
      return summaryItems.slice(8, 13);
    case 7:
      return summaryItems.slice(9, 14);
    default:
      return [];
  }
}

function BuildPathSuccessStep({
  answers,
  onAddAnother,
  onBack,
  summaryItems,
}: {
  answers: IntakeAnswers;
  onAddAnother: () => void;
  onBack: () => void;
  summaryItems: string[];
}): ReactElement {
  return (
    <div className="bp-form-stage bp-wizard-stage">
      <BuildPathVisualPanel
        answers={answers}
        step={8}
        summaryItems={summaryItems}
      />

      <Card className="bp-form-panel bp-wizard-panel bp-success-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <p className="bp-form-kicker">Project received</p>
        <h1 id="bp-form-title">Your build profile is ready.</h1>
        <p className="bp-form-subtitle">
          We have enough to route the project for an initial construction
          financing review and identify the likely next documents.
        </p>

        <div className="bp-success-seal">
          <Check aria-hidden="true" strokeWidth={2} />
          Intake complete
        </div>

        <div className="bp-success-summary">
          {summaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <div className="bp-success-actions">
          <button className="bp-form-continue" type="button">
            <span>Book review call</span>
            <CalendarDays aria-hidden="true" strokeWidth={1.8} />
          </button>
          <button className="bp-upload-button" type="button">
            <Upload aria-hidden="true" strokeWidth={1.8} />
            Upload documents
          </button>
        </div>

        <button className="bp-add-another" onClick={onAddAnother} type="button">
          <Plus aria-hidden="true" strokeWidth={1.8} />
          Start another project
        </button>

        <button className="bp-form-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
          Back
        </button>
      </Card>
    </div>
  );
}

function FieldGroup({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}): ReactElement {
  return (
    <section className="bp-field-group">
      <h2>{label}</h2>
      {children}
    </section>
  );
}

function BuildPermitDisclosure({
  fileName,
  onClear,
  onFileSelected,
}: {
  fileName: string;
  onClear: () => void;
  onFileSelected: (fileName: string) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <details className="bp-permit-disclosure">
      <summary className="bp-permit-trigger">
        <span className="bp-permit-trigger-icon">
          <Upload aria-hidden="true" strokeWidth={1.8} />
        </span>
        <span className="bp-permit-trigger-copy">
          <strong>Already have a build permit?</strong>
          <small>
            Upload it now and we&apos;ll skip straight to final contact.
          </small>
        </span>
        <em>{fileName ? "Permit attached" : "Optional fast track"}</em>
        <ChevronDown aria-hidden="true" strokeWidth={1.9} />
      </summary>
      <div className="bp-permit-panel" id="bp-permit-upload-panel">
        <div className="bp-permit-panel-inner">
          <label className="bp-permit-upload">
            <input
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFileSelected(file.name);
                }
              }}
              ref={inputRef}
              type="file"
            />
            <Upload aria-hidden="true" strokeWidth={1.8} />
            <span>Upload build permit</span>
            <small>PDF or image file</small>
          </label>

          {fileName ? (
            <div className="bp-permit-file">
              <FileText aria-hidden="true" strokeWidth={1.8} />
              <span>{fileName}</span>
              <button
                onClick={() => {
                  onClear();
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
                type="button"
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function SelectableCard({
  active,
  children,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  children: string;
  icon: LucideIcon;
  onClick: () => void;
}): ReactElement {
  return (
    <Card
      className={
        active
          ? "bp-status-option bp-select-card is-selected"
          : "bp-status-option bp-select-card"
      }
      render={<button aria-pressed={active} onClick={onClick} type="button" />}
    >
      <OptionCardIcon icon={Icon} />
      <span>{children}</span>
      {active ? (
        <Check aria-hidden="true" className="bp-status-check" strokeWidth={2} />
      ) : null}
    </Card>
  );
}

function OptionCardIcon({ icon: Icon }: { icon: LucideIcon }): ReactElement {
  return (
    <span aria-hidden="true" className="bp-option-icon">
      <Icon strokeWidth={1.7} />
    </span>
  );
}

function SelectableChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={active ? "bp-chip-option is-selected" : "bp-chip-option"}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function TextField({
  icon: Icon,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  icon: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "email" | "tel" | "text";
  value: string;
}): ReactElement {
  return (
    <label className="bp-text-field">
      <span>{label}</span>
      <div className="bp-address-input">
        <Icon aria-hidden="true" strokeWidth={1.8} />
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
    </label>
  );
}

function toggleMultiValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  if (value === "None yet" || value === "Not sure") {
    return [value];
  }
  return [
    ...values.filter((item) => item !== "None yet" && item !== "Not sure"),
    value,
  ];
}

function buildProjectSummary(answers: IntakeAnswers): string[] {
  const primaryNeed = answers.financingNeeds[0] ?? "Financing path";
  const secondaryNeed = answers.financingNeeds[1];
  const teamSummary =
    answers.projectTeam.length > 0
      ? `${answers.projectTeam[0]}${
          answers.projectTeam.length > 1
            ? ` + ${answers.projectTeam.length - 1} more`
            : ""
        }`
      : "Team pending";
  return [
    answers.address || "Property details pending",
    answers.siteControl,
    answers.buildType,
    `${answers.unitCount} units`,
    answers.projectStage,
    primaryNeed,
    secondaryNeed,
    answers.financingTimeline,
    `${answers.requestedLoan} request`,
    `${answers.projectCost} total cost`,
    `${answers.borrowerEquity} equity`,
    teamSummary,
    answers.borrowerExperience,
    answers.contactRole,
  ].filter(Boolean);
}

function BuildPathLandingSections({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <div className="bp-landing" id="features">
      <BuilderSqueezeSection />
      <PlanBeforeBorrowSection />
      <FairLendOperatingSystemSection />
      <StartWithPropertySection onStart={onStart} />
    </div>
  );
}

function CapitalFeatureSection(): ReactElement {
  const milestoneUnlocks = [
    {
      amount: "$2,150,000",
      bar: "100%",
      dateTime: "2026-08-20",
      id: "completion",
      percent: "100%",
      title: "Completion",
    },
    {
      amount: "$1,620,000",
      bar: "75%",
      dateTime: "2026-07-18",
      id: "interior",
      percent: "75%",
      title: "Interior",
    },
    {
      amount: "$1,050,000",
      bar: "50%",
      dateTime: "2026-06-12",
      id: "roof",
      percent: "50%",
      title: "Roof",
    },
    {
      amount: "$520,000",
      bar: "25%",
      dateTime: "2026-05-10",
      id: "framing",
      percent: "25%",
      title: "Framing",
    },
    {
      amount: "$0",
      bar: "0%",
      dateTime: "2026-04-15",
      id: "foundation",
      percent: "0%",
      title: "Foundation",
    },
  ] as const;

  return (
    <section aria-labelledby="bp-workflow-title" className="bp-capital-feature">
      <div className="bp-capital-feature-copy">
        <span>Milestone-backed draw room</span>
        <h2 id="bp-workflow-title">
          Available capital rises with approved work.
        </h2>
        <p>
          DrawFlow turns your construction roadmap into release-ready capital.
          Each approved milestone expands the amount you can draw, without
          forcing interest on idle funds.
        </p>
        <div className="bp-capital-feature-actions">
          <button className="bp-primary-cta" type="button">
            <span>Check financeability</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>
          <a className="bp-secondary-cta" href="#resources">
            <span>View milestone flow</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </a>
        </div>
      </div>

      <Timeline
        activeIndex={4}
        aria-label="Milestone draw flow"
        className="bp-capital-milestone-timeline"
      >
        {milestoneUnlocks.map((milestone) => (
          <TimelineItem
            className="bp-capital-milestone-item"
            key={milestone.id}
          >
            <TimelineDot className="bp-capital-milestone-dot">
              {milestone.id === "foundation" ? null : (
                <Check aria-hidden="true" strokeWidth={2} />
              )}
            </TimelineDot>
            <TimelineConnector className="bp-capital-milestone-connector" />
            <TimelineContent className="bp-capital-milestone-content">
              <TimelineHeader className="bp-capital-milestone-header">
                <TimelineTime dateTime={milestone.dateTime}>
                  {milestone.percent}
                </TimelineTime>
                <TimelineTitle>{milestone.title}</TimelineTitle>
              </TimelineHeader>
              <TimelineDescription asChild>
                <Card className="bp-capital-milestone-card">
                  <strong>{milestone.amount}</strong>
                  <span>Available</span>
                  <i aria-hidden="true" className="bp-capital-unlock-bar">
                    <em style={{ width: milestone.bar }} />
                  </i>
                </Card>
              </TimelineDescription>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>

      <div aria-hidden="true" className="bp-capital-feature-art">
        <img
          alt=""
          aria-hidden="true"
          className="bp-capital-feature-stack"
          decoding="async"
          height={1456}
          loading="lazy"
          src={milestoneBlueprintStackImage}
          width={641}
        />
        <span className="bp-capital-dimension bp-capital-dimension-height">
          64&apos;-0&quot;
        </span>
        <span className="bp-capital-dimension bp-capital-dimension-width">
          120&apos;-0&quot;
        </span>
      </div>

      <div aria-label="Draw plan benefits" className="bp-capital-feature-stats">
        {[
          ["0", "forced draw schedule"],
          ["3-day", "draw SLA target"],
          ["1", "advisor-built plan"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuilderSqueezeSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-squeeze-title"
      className="bp-landing-section bp-squeeze"
      id="financing-options"
    >
      <div className="bp-squeeze-stage">
        <BlueprintDraftingGrid />

        <div aria-label="DrawFlow by FairLend" className="bp-squeeze-brand">
          <img
            alt=""
            aria-hidden="true"
            height={57}
            src={`${extractedSqueezeAssetBase}/drawflow-logo-lockup.webp`}
            width={193}
          />
        </div>

        <img
          alt=""
          aria-hidden="true"
          className="bp-squeeze-stamp"
          height={138}
          src={`${extractedSqueezeAssetBase}/build-smarter-stamp.webp`}
          width={272}
        />

        <div className="bp-squeeze-hero-copy">
          <p className="bp-squeeze-kicker">The Problem</p>
          <h2 id="bp-squeeze-title">Why builders get squeezed</h2>
          <p>
            Capital should follow the work,
            <span>not a rigid draw calendar.</span>
          </p>
        </div>

        <div aria-label="Rigid three draw schedule" className="bp-rigid-plan">
          <div className="bp-rigid-heading">
            <h3>Rigid 3-Draw Schedule</h3>
            <p>Capital doesn&apos;t match the real build.</p>
          </div>
          <div aria-hidden="true" className="bp-cash-stress-legend">
            <span />
            <p>
              Cash stress
              <small>(too early or too late)</small>
            </p>
          </div>
          <img
            alt=""
            aria-hidden="true"
            className="bp-rigid-axis"
            height={62}
            src={`${extractedSqueezeAssetBase}/rigid-schedule-axis.svg`}
            width={700}
          />
          <img
            alt=""
            aria-hidden="true"
            className="bp-cash-stress-curve"
            height={105}
            src={`${extractedSqueezeAssetBase}/cash-stress-dashed-curve.svg`}
            width={735}
          />
          {rigidDrawNotes.map((note) => (
            <img
              alt={note.alt}
              className={`bp-rigid-note ${note.className}`}
              decoding="async"
              height={
                note.className === "is-draw-2"
                  ? 170
                  : note.className === "is-draw-1"
                    ? 176
                    : 174
              }
              key={note.alt}
              src={note.src}
              width={note.className === "is-draw-1" ? 134 : 132}
            />
          ))}
          <div className="bp-rigid-callouts">
            <p>
              <img
                alt=""
                aria-hidden="true"
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
              />
              <span>Cash leaves early before costs hit.</span>
            </p>
            <p>
              <img
                alt=""
                aria-hidden="true"
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
              />
              <span>Money sits idle while work continues.</span>
            </p>
            <p>
              <img
                alt=""
                aria-hidden="true"
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
              />
              <span>Gaps appear before the next draw.</span>
            </p>
          </div>
        </div>

        <svg
          aria-hidden="true"
          className="bp-capital-continuum"
          focusable="false"
          viewBox="0 0 1672 941"
        >
          <path
            className="bp-capital-continuum-line"
            d="M831 590 C852 590 862 587 875 576 C894 560 898 529 921 510 C939 496 956 487 962 481 C987 477 1007 474 1028 471 C1074 466 1103 455 1151 449 C1198 444 1248 444 1275 446 C1338 449 1379 448 1390 449 C1441 451 1483 454 1511 457 C1534 459 1556 461 1582 461"
          />
          <g className="bp-capital-continuum-checks">
            <circle cx="962" cy="481" r="15" />
            <circle cx="1028" cy="471" r="15" />
            <circle cx="1151" cy="449" r="15" />
            <circle cx="1275" cy="446" r="15" />
            <circle cx="1390" cy="449" r="15" />
            <circle cx="1511" cy="457" r="15" />
          </g>
          <g className="bp-capital-continuum-ticks">
            <path d="m955 480 7 7 14-15" />
            <path d="m1021 470 7 7 14-15" />
            <path d="m1144 448 7 7 14-15" />
            <path d="m1268 445 7 7 14-15" />
            <path d="m1383 448 7 7 14-15" />
            <path d="m1504 456 7 7 14-15" />
          </g>
        </svg>

        <div
          aria-label="Milestone draw plan with capital unlocked by approved progress"
          className="bp-milestone-plan"
        >
          <div className="bp-milestone-heading">
            <h3>Milestone Draw Plan</h3>
            <p>Capital follows approved progress.</p>
          </div>
          <div aria-hidden="true" className="bp-aligned-legend">
            <span />
            <p>
              Aligned capital
              <small>(when work needs it)</small>
            </p>
          </div>
          <img
            alt=""
            aria-hidden="true"
            className="bp-milestone-blueprint"
            height={184}
            src={`${extractedSqueezeAssetBase}/modern-home-blueprint.webp`}
            width={654}
          />
          {milestoneUnlocksForSqueeze.map((milestone) => (
            <div
              className={`bp-milestone-node ${milestone.className}`}
              key={milestone.label}
            >
              <img
                alt={`${milestone.label} unlock tag ${milestone.amount}`}
                height={70}
                src={milestone.src}
                width={100}
              />
              <span>{milestone.label}</span>
            </div>
          ))}
        </div>

        <img
          alt=""
          aria-hidden="true"
          className="bp-left-blueprint"
          height={194}
          src={`${extractedSqueezeAssetBase}/left-building-blueprint.webp`}
          width={170}
        />

        <div className="bp-squeeze-bottom">
          <div className="bp-squeeze-panel bp-squeeze-panel-risk">
            <div className="bp-squeeze-panel-title">
              <img
                alt=""
                aria-hidden="true"
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
              />
              <h3>Cash Gap Risk</h3>
            </div>
            <div className="bp-squeeze-panel-items">
              {cashGapRisks.map((item) => (
                <article className="bp-squeeze-panel-item" key={item.title}>
                  <img
                    alt=""
                    aria-hidden="true"
                    src={`${extractedSqueezeAssetBase}/${item.icon}`}
                  />
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <img
            alt=""
            aria-hidden="true"
            className="bp-squeeze-handoff"
            height={64}
            src={`${extractedSqueezeAssetBase}/handoff-arrow-circle.svg`}
            width={64}
          />

          <div className="bp-squeeze-panel bp-squeeze-panel-approved">
            <div className="bp-squeeze-panel-title">
              <img
                alt=""
                aria-hidden="true"
                src={`${extractedSqueezeAssetBase}/approved-check-circle.svg`}
              />
              <h3>Capital Unlocks With Approved Work</h3>
            </div>
            <div className="bp-squeeze-panel-items">
              {approvedWorkBenefits.map((item) => (
                <article className="bp-squeeze-panel-item" key={item.title}>
                  <img
                    alt=""
                    aria-hidden="true"
                    src={`${extractedSqueezeAssetBase}/${item.icon}`}
                  />
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BlueprintDraftingGrid(): ReactElement {
  const minorVerticalLines = Array.from(
    { length: 21 },
    (_, index) => index * 5
  );
  const minorHorizontalLines = Array.from(
    { length: 12 },
    (_, index) => index * 9
  );

  return (
    <svg
      aria-hidden="true"
      className="bp-squeeze-drafting-grid"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 1672 941"
    >
      <defs>
        <filter id="bp-squeeze-rough-line">
          <feTurbulence
            baseFrequency="0.018 0.09"
            numOctaves="2"
            result="noise"
            seed="19"
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="1.35"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <g className="bp-squeeze-minor-grid">
        {minorVerticalLines.map((percent) => (
          <path d={`M ${percent * 16.72} 24 V 918`} key={`v-${percent}`} />
        ))}
        {minorHorizontalLines.map((percent) => (
          <path d={`M 22 ${percent * 9.41} H 1650`} key={`h-${percent}`} />
        ))}
      </g>

      <g className="bp-squeeze-major-guides">
        <path d="M 28 24 H 1644" />
        <path d="M 28 920 H 1644" />
        <path d="M 28 24 V 920" />
        <path d="M 1644 24 V 920" />
        <path className="bp-squeeze-timeline-divider" d="M 836 326 V 707" />
        <path d="M 130 411 V 699" />
        <path d="M 1612 457 V 714" />
        <path d="M 130 424 H 0" />
        <path d="M 1612 457 H 1672" />
        <path d="M 835 707 H 1612" />
      </g>

      <g className="bp-squeeze-crop-marks">
        <path d="M 14 24 H 42 M 28 10 V 52" />
        <path d="M 1630 24 H 1658 M 1644 10 V 52" />
        <path d="M 14 920 H 42 M 28 890 V 934" />
        <path d="M 1630 920 H 1658 M 1644 890 V 934" />
        <path d="M 116 424 H 140 M 130 410 V 438" />
        <path d="M 1598 714 H 1626 M 1612 690 V 728" />
        <path d="M 1598 457 H 1626 M 1612 440 V 474" />
      </g>

      <text className="bp-squeeze-dimension is-left" x="38" y="420">
        24&apos;-0&quot;
      </text>
      <text
        className="bp-squeeze-dimension is-right"
        transform="rotate(-90 1619 628)"
        x="1619"
        y="628"
      >
        26&apos;-0&quot;
      </text>
    </svg>
  );
}

function PlanBeforeBorrowSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-plan-title"
      className="bp-landing-section bp-plan bp-persona bp-handoff"
      id="resources"
    >
      <BlueprintSectionHeading
        id="bp-plan-title"
        subtitle="FairLend pairs multiplex build financing with senior build advisors, CMHC readiness work, contractor access, and field support that stays with the project."
        title="Financing is stronger when the build plan is stronger"
      />

      <KokonutBentoGridShell animate={false} className="bp-handoff-bento">
        <div className="bp-handoff-cell bp-handoff-cell-map">
          <KokonutBentoCard
            item={{
              description:
                "You get advisors with 30+ years of build and financing experience from planning through closing. The builder, broker, architect, and consultant stop carrying disconnected fragments.",
              eyebrow: "Handoff map",
              id: "handoff-map",
              title: "Senior build advisors align the plan before it hardens.",
              className: "bp-handoff-card is-map",
            }}
          >
            <HandoffMapGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-checklist">
          <KokonutBentoCard
            item={{
              description:
                "We run the CMHC requirement list with underwriting context, then help fill the gaps through direct consulting and a vetted professional network.",
              eyebrow: "Readiness",
              id: "cmhc-readiness",
              title:
                "Checklist gaps get surfaced while they are still fixable.",
              className: "bp-handoff-card is-checklist",
            }}
          >
            <CmhcChecklistGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-draws">
          <KokonutBentoCard
            item={{
              description:
                "Completed milestones unlock availability. Draw only what you need, when you need it, with a 3 day SLA on draw requests and no interest on capital still sitting unused.",
              eyebrow: "Draw control",
              id: "draw-availability",
              title: "On-demand draws keep capital available, not expensive.",
              className: "bp-handoff-card is-draws",
            }}
          >
            <DrawAvailabilityMockup />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-network">
          <KokonutBentoCard
            item={{
              description:
                "Dedicated site visits, progress checks, reliable contractors, supplier access, and investor relationships are available when the build needs to be unf*cked.",
              eyebrow: "Unf*ck guarantee",
              id: "field-support",
              title: "When the site drifts, a real team helps get it unstuck.",
              className: "bp-handoff-card is-field",
            }}
          >
            <FieldSupportGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-field">
          <KokonutBentoCard
            item={{
              description:
                "FairLend gives builders access to build advisors, financing advisors, energy simulation and certification pros, project managers, architects, designers, lawyers, contractors, suppliers, investors, and consultants.",
              eyebrow: "Network plan",
              id: "professional-network",
              title:
                "Unlock a growing network of professionals who keep multiplex builds moving.",
              className: "bp-handoff-card is-network",
            }}
          >
            <ProfessionalNetworkBeamGraphic />
          </KokonutBentoCard>
        </div>
      </KokonutBentoGridShell>
    </section>
  );
}

function HandoffMapGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-handoff-map">
      <svg role="img" viewBox="0 0 720 330">
        <defs>
          <filter id="bp-handoff-rough">
            <feTurbulence
              baseFrequency="0.9"
              numOctaves="2"
              seed="8"
              type="fractalNoise"
            />
            <feDisplacementMap in="SourceGraphic" scale="1.4" />
          </filter>
        </defs>
        <path
          className="bp-handoff-map-grid"
          d="M40 44 H682 M40 104 H682 M40 164 H682 M40 224 H682 M40 284 H682 M88 26 V300 M208 26 V300 M328 26 V300 M448 26 V300 M568 26 V300"
        />
        <path
          className="bp-handoff-map-stall"
          d="M104 82 C176 90 174 166 244 158 C320 150 302 238 384 224 C470 210 464 108 548 116"
        />
        <path
          className="bp-handoff-map-flow"
          d="M112 248 C178 232 224 210 274 190 C326 170 358 150 414 126 C472 98 528 82 614 76"
        />
        <g className="bp-handoff-map-nodes">
          <circle cx="112" cy="248" r="16" />
          <circle cx="274" cy="190" r="16" />
          <circle cx="414" cy="126" r="16" />
          <circle cx="614" cy="76" r="16" />
        </g>
        <g className="bp-handoff-map-ticks">
          <path d="m104 248 9 9 19-24" />
          <path d="m266 190 9 9 19-24" />
          <path d="m406 126 9 9 19-24" />
          <path d="m606 76 9 9 19-24" />
        </g>
        <g className="bp-handoff-map-labels">
          <text x="82" y="292">
            Builder
          </text>
          <text x="238" y="222">
            Broker
          </text>
          <text x="372" y="92">
            Architect
          </text>
          <text x="564" y="118">
            Consultant
          </text>
        </g>
        <g className="bp-handoff-map-center">
          <rect height="70" rx="14" width="172" x="344" y="174" />
          <text x="370" y="207">
            FairLend
          </text>
          <text x="370" y="228">
            30+ yr build desk
          </text>
        </g>
      </svg>
      <div className="bp-handoff-map-legend">
        <span>Build order</span>
        <span>Budget logic</span>
        <span>Draw plan</span>
      </div>
    </div>
  );
}

function CmhcChecklistGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-cmhc-checklist">
      {[
        "CMHC evidence",
        "Underwriting story",
        "Advisor fix",
        "Network handoff",
      ].map((item, index) => (
        <div
          className="bp-cmhc-row"
          key={item}
          style={{ "--row-index": index } as CSSProperties}
        >
          <span>
            <Check aria-hidden="true" strokeWidth={2.3} />
          </span>
          <strong>{item}</strong>
          <i />
        </div>
      ))}
    </div>
  );
}

function DrawAvailabilityMockup(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-draw-mockup">
      <div className="bp-draw-phone">
        <div className="bp-draw-phone-top">
          <span>Available now</span>
          <strong>$250k</strong>
        </div>
        <div className="bp-draw-progress">
          <span />
          <span />
          <span />
        </div>
        <span>3 day SLA</span>
      </div>
      <svg className="bp-draw-orbit" viewBox="0 0 320 150">
        <path d="M22 112 C76 74 116 96 158 58 C198 22 246 42 298 18" />
        <circle cx="158" cy="58" r="9" />
        <circle cx="298" cy="18" r="9" />
      </svg>
    </div>
  );
}

function ProfessionalNetworkBeamGraphic(): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const buildersRef = useRef<HTMLDivElement | null>(null);
  const financingRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef<HTMLDivElement | null>(null);
  const designRef = useRef<HTMLDivElement | null>(null);
  const pmRef = useRef<HTMLDivElement | null>(null);
  const legalRef = useRef<HTMLDivElement | null>(null);
  const tradesRef = useRef<HTMLDivElement | null>(null);
  const suppliersRef = useRef<HTMLDivElement | null>(null);

  const nodes = [
    {
      className: "is-builders",
      Icon: HardHat,
      label: "Builders",
      ref: buildersRef,
      tag: "Sponsor",
    },
    {
      className: "is-financing",
      Icon: Landmark,
      label: "Financing advisors",
      ref: financingRef,
      tag: "Capital",
    },
    {
      className: "is-energy",
      Icon: ShieldCheck,
      label: "Energy + CMHC",
      ref: energyRef,
      tag: "Proof",
    },
    {
      className: "is-design",
      Icon: Building2,
      label: "Architects + designers",
      ref: designRef,
      tag: "Plan",
    },
    {
      className: "is-pm",
      Icon: CalendarDays,
      label: "Project managers",
      ref: pmRef,
      tag: "Schedule",
    },
    {
      className: "is-legal",
      Icon: FileText,
      label: "Lawyers",
      ref: legalRef,
      tag: "Close",
    },
    {
      className: "is-trades",
      Icon: Wrench,
      label: "Contractors",
      ref: tradesRef,
      tag: "Work",
    },
    {
      className: "is-suppliers",
      Icon: Layers3,
      label: "Suppliers",
      ref: suppliersRef,
      tag: "Materials",
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="bp-handoff-graphic bp-professional-network"
      ref={containerRef}
    >
      <div className="bp-network-drafting-note">
        <span>Network plan</span>
        <strong>60&apos; x 100&apos;</strong>
      </div>
      <svg
        className="bp-network-static-beams is-desktop"
        preserveAspectRatio="none"
        viewBox="0 0 596 430"
      >
        <path d="M298 190 Q320 112 327 77" />
        <path d="M298 190 Q232 126 121 129" />
        <path d="M298 190 Q370 126 475 129" />
        <path d="M298 190 Q214 184 119 184" />
        <path d="M298 190 Q380 184 477 184" />
        <path d="M298 190 Q232 275 149 311" />
        <path d="M298 190 Q372 275 411 311" />
        <path d="M298 190 Q302 292 298 344" />
      </svg>
      <svg
        className="bp-network-static-beams is-mobile"
        preserveAspectRatio="none"
        viewBox="0 0 320 806"
      >
        <path d="M160 350 Q158 220 160 103" />
        <path d="M160 350 Q124 256 145 179" />
        <path d="M160 350 Q206 288 175 255" />
        <path d="M160 350 Q118 392 145 455" />
        <path d="M160 350 Q212 418 175 529" />
        <path d="M160 350 Q118 500 145 603" />
        <path d="M160 350 Q216 554 175 677" />
        <path d="M160 350 Q160 640 160 751" />
      </svg>
      <div className="bp-network-center" ref={centerRef}>
        <span>FairLend</span>
        <strong>Build desk</strong>
        <small>planning to closing</small>
      </div>
      {nodes.map(({ className, Icon, label, ref, tag }) => (
        <div className={`bp-network-node ${className}`} key={label} ref={ref}>
          <span>
            <Icon aria-hidden="true" strokeWidth={1.65} />
          </span>
          <div>
            <small>{tag}</small>
            <strong>{label}</strong>
          </div>
        </div>
      ))}
      {nodes.map(({ className, ref }, index) => (
        <AnimatedBeam
          basePathClassName="bp-network-beam-base"
          beamClassName="bp-network-beam-active"
          className={`bp-network-beam ${className}`}
          containerRef={containerRef}
          curvature={index % 2 === 0 ? 38 : -34}
          delay={index * 0.18}
          duration={3.2}
          fromRef={centerRef}
          gradientStartColor="oklch(0.45 0.2 145)"
          gradientStopColor="oklch(0.58 0.16 178)"
          key={className}
          pathColor="oklch(0.4 0.12 240 / 0.34)"
          pathDasharray="7 8"
          pathOpacity={0.62}
          pathWidth={2}
          repeatDelay={0.7}
          toRef={ref}
          variant="blueprint"
        />
      ))}
      <div className="bp-network-spec-table">
        <span>Advisors</span>
        <strong>30+ yr field desk</strong>
        <span>Trades</span>
        <strong>priced below market</strong>
        <span>Draws</span>
        <strong>3 day SLA</strong>
      </div>
    </div>
  );
}

function FieldSupportGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-field-support">
      <svg viewBox="0 0 360 260">
        <path
          className="bp-field-lot"
          d="M42 198 L182 128 L318 188 L178 236 Z"
        />
        <path
          className="bp-field-house"
          d="M132 132 L190 96 L258 132 L258 196 L132 196 Z"
        />
        <path className="bp-field-roof" d="M118 134 L190 88 L272 134" />
        <path
          className="bp-field-route"
          d="M58 210 C82 178 118 184 144 162 C170 140 188 122 224 118"
        />
        <circle className="bp-field-pin" cx="224" cy="118" r="15" />
        <path className="bp-field-check" d="m217 117 6 7 13-16" />
      </svg>
      <div className="bp-field-tags">
        <span>Site visit</span>
        <span>Supplier price</span>
        <span>Trade fix</span>
        <span>Investor help</span>
      </div>
    </div>
  );
}

function FairLendOperatingSystemSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-system-title"
      className="bp-landing-section bp-operating-system"
    >
      <div className="bp-system-copy">
        <span>FairLend operating model</span>
        <h2 id="bp-system-title">
          Multiplex financing, planning, and field verification in one motion.
        </h2>
        <p>
          The offer is not just a loan and not just software. FairLend combines
          financing, CMHC readiness, experienced build planning, milestone draw
          controls, site visits, and practical help when the project gets stuck.
        </p>
      </div>

      <div className="bp-system-board">
        <div aria-hidden="true" className="bp-system-rail">
          <span />
          <span />
          <span />
        </div>
        <div className="bp-system-steps">
          {fairlendSystemSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Card className="bp-system-step" key={step.title}>
                <small>{step.label}</small>
                <span className="bp-system-step-icon">
                  <Icon aria-hidden="true" strokeWidth={1.7} />
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StartWithPropertySection({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <section
      aria-labelledby="bp-start-title"
      className="bp-landing-section bp-start bp-referral"
    >
      <div aria-hidden="true" className="bp-start-drawing" />
      <div className="bp-start-copy">
        <span>Bring us in early</span>
        <h2 id="bp-start-title">
          Send the build before it gets expensive to fix.
        </h2>
        <p>
          FairLend sits down with the builder and their advisors, runs the CMHC
          and underwriting checks, pressure-tests the plan, and turns approved
          work into on-demand draw availability.
        </p>
        <ul>
          {[
            "Multiplex build financing for CMHC-insured projects",
            "Consultant-led schedule, budget, and draw planning",
            "Site visits, evidence, and practical unstuck support",
          ].map((item) => (
            <li key={item}>
              <Check aria-hidden="true" strokeWidth={2} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Card className="bp-start-form bp-referral-panel">
        <div className="bp-referral-panel-heading">
          <p>Best referral moments</p>
          <strong>When the project is still flexible enough to save.</strong>
        </div>
        <ul className="bp-referral-moments">
          {referralMoments.map((moment) => (
            <li key={moment}>
              <ArrowRight aria-hidden="true" strokeWidth={1.8} />
              <span>{moment}</span>
            </li>
          ))}
        </ul>
        <div className="bp-start-actions">
          <button className="bp-primary-cta" onClick={onStart} type="button">
            <span>Start a build review</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>
          <button className="bp-start-call" onClick={onStart} type="button">
            Refer a builder
            <ArrowRight aria-hidden="true" strokeWidth={1.7} />
          </button>
        </div>
        <p className="bp-referral-note">
          Referral-friendly: you stay the smart early advisor. We handle
          financeability, draw planning, site verification, and capital
          execution.
        </p>
      </Card>

      <div aria-hidden="true" className="bp-real-projects-stamp">
        <span>CMHC</span>
        <strong>Multiplex</strong>
      </div>
    </section>
  );
}

function BlueprintSectionHeading({
  id,
  subtitle,
  title,
}: {
  id: string;
  subtitle: string;
  title: string;
}): ReactElement {
  return (
    <div className="bp-section-heading">
      <h2 id={id}>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function BuildPathTestimonials(): ReactElement {
  return (
    <section
      aria-labelledby="bp-testimonials-title"
      className="bp-testimonials"
    >
      <div aria-hidden="true" className="bp-proof-rail">
        <span className="bp-rail-clamp bp-rail-clamp-a" />
        <span className="bp-rail-clamp bp-rail-clamp-b" />
        <span className="bp-rail-clamp bp-rail-clamp-c" />
      </div>

      <div className="bp-proof-copy">
        <p>Built on trust</p>
        <h2 id="bp-testimonials-title">Proof from the field</h2>
        <span>
          Real builders and lenders. Real outcomes. Shared to help your project
          move forward with confidence.
        </span>
      </div>

      <div className="bp-marquee">
        <div className="bp-marquee-track">
          <TestimonialCards />
          <TestimonialCards ariaHidden />
        </div>
      </div>

      <button
        aria-label="Previous testimonials"
        className="bp-marquee-control bp-marquee-control-prev"
        type="button"
      >
        <ArrowRight aria-hidden="true" strokeWidth={1.8} />
      </button>
      <button
        aria-label="Next testimonials"
        className="bp-marquee-control bp-marquee-control-next"
        type="button"
      >
        <ArrowRight aria-hidden="true" strokeWidth={1.8} />
      </button>
    </section>
  );
}

function TestimonialCards({
  ariaHidden = false,
}: {
  ariaHidden?: boolean;
}): ReactElement {
  return (
    <div aria-hidden={ariaHidden || undefined} className="bp-testimonial-set">
      {testimonials.map((testimonial) => {
        const Icon = testimonial.icon;
        return (
          <Card className="bp-testimonial-card" key={testimonial.name}>
            <span aria-hidden="true" className="bp-card-pin" />
            <span aria-hidden="true" className="bp-card-tape" />
            <div className="bp-card-head">
              <Icon aria-hidden="true" strokeWidth={1.55} />
              <div className="bp-reviewer">
                <strong>{testimonial.name}</strong>
                <span>{testimonial.role}</span>
              </div>
              <span className="bp-card-label">{testimonial.label}</span>
            </div>
            <blockquote>{testimonial.quote}</blockquote>
            <div aria-hidden="true" className="bp-approved-stamp">
              <Check strokeWidth={1.6} />
              <span>Approved</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function BuildPathHeader({
  onNavigateToSection,
  step,
}: {
  onNavigateToSection: (sectionId: string) => void;
  step?: number;
}): ReactElement {
  return (
    <header className="bp-header">
      <a
        aria-label="DrawFlow by FairLend home"
        className="bp-brand"
        href="/intake"
      >
        <BuildPathMark />
        <span className="bp-brand-wordmark">
          <strong>DrawFlow</strong>
          <em>by FairLend</em>
        </span>
      </a>
      {step ? (
        <div className="bp-header-step">
          <BuildPathStepProgress step={step} />
        </div>
      ) : null}
      <nav aria-label="DrawFlow navigation" className="bp-nav">
        <button
          onClick={() => {
            onNavigateToSection("features");
          }}
          type="button"
        >
          How it works
        </button>
        <a href="#financing-options">Financing options</a>
        <a href="#resources">Resources</a>
        <a className="bp-sign-in" href="#sign-in">
          Sign in
        </a>
      </nav>
    </header>
  );
}

function BuildPathMark(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="bp-mark"
      fill="none"
      viewBox="0 0 38 38"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 18.1 19 7.8l11.5 10.3v13.1h-8.1V20.9H15.6v10.3H7.5V18.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M19 7.8v23.4M19 20.9l11.5 10.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
