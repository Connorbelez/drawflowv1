import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Landmark,
  MapPinned,
  Paperclip,
  PenTool,
  Ruler,
  ShieldCheck,
  Trees,
  UploadCloud,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

const brandKitAsset =
  "/assets/fairlend-redesign/start-garden-suite-brandkit.webp";
const pageMockAsset =
  "/assets/fairlend-redesign/start-garden-suite-page-mock.webp";
const fieldCollageAsset =
  "/assets/fairlend-redesign/start-garden-suite-field-collage.webp";
const blueprintAsset =
  "/assets/fairlend-redesign/start-garden-suite-blueprint-strip.webp";

export const Route = createFileRoute("/start/garden-suite")({
  component: StartGardenSuitePage,
  head: () => ({
    meta: [
      { title: "Garden Suite Financing Intake | Fairlend Capital" },
      {
        name: "description",
        content:
          "Start a Fairlend review for garden-suite or laneway-suite construction financing, including property, equity, permit, budget, rental, and working-capital inputs.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: fieldCollageAsset },
      { rel: "preload", as: "image", href: blueprintAsset },
      { rel: "preload", as: "image", href: pageMockAsset },
    ],
  }),
});

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const projectTypes = [
  "Detached garden suite",
  "Laneway suite",
  "Garage conversion",
  "Multiplex plus suite",
  "Not sure yet",
];

const permitStages = [
  "Idea stage",
  "Designer engaged",
  "Permit submitted",
  "Permit issued",
];

const readinessChecks = [
  {
    label: "Lot fit",
    note: "Access, setbacks, services, and existing home constraints.",
    icon: Ruler,
  },
  {
    label: "Equity room",
    note: "Current debt, estimated value, and capital stack fit.",
    icon: Landmark,
  },
  {
    label: "Permit path",
    note: "Design stage, municipal timing, and near-term blockers.",
    icon: ClipboardCheck,
  },
  {
    label: "Draw capacity",
    note: "Borrower cash available between reimbursement releases.",
    icon: Banknote,
  },
] satisfies Array<{ label: string; note: string; icon: Icon }>;

const intakePath = [
  ["01", "Property read", "Address, lot condition, access, services."],
  ["02", "Capital read", "Mortgage balance, equity, liquidity."],
  ["03", "Build read", "Budget, permit stage, rental intent."],
  ["04", "Lender route", "Fit, gaps, timing, next documents."],
];

const documentHints = [
  "Survey or site plan",
  "Designer drawings",
  "Budget or quote",
  "Mortgage statement",
  "Rental estimate",
];

const reviewSequence = [
  {
    title: "Initial file screen",
    copy: "Fairlend checks the property, borrower position, project stage, and missing inputs before a terms conversation.",
    icon: FileSearch,
  },
  {
    title: "Working-capital check",
    copy: "The review separates loan size from cash needed to carry work between reimbursement draws.",
    icon: CalendarClock,
  },
  {
    title: "Draw conversation",
    copy: "A viable file moves toward budget, evidence, site-review, and release requirements. No advance-funding language is implied.",
    icon: ShieldCheck,
  },
] satisfies Array<{ title: string; copy: string; icon: Icon }>;

function StartGardenSuitePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[oklch(0.965_0.023_85)] font-[Oxanium_Variable,sans-serif] text-[oklch(0.245_0.08_170)]">
      <GardenSuiteNav />
      <HeroSection />
      <ReadinessSection />
      <ReviewSection />
      <FinalIntakeSection />
    </main>
  );
}

function GardenSuiteNav() {
  return (
    <header className="relative z-40 border-[oklch(0.77_0.027_85)] border-b bg-[oklch(0.965_0.023_85_/_0.96)]">
      <nav
        aria-label="Garden suite intake"
        className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
      >
        <Link
          aria-label="Fairlend Capital home"
          className="group inline-flex items-center gap-3"
          preload="intent"
          to="/"
          viewTransition
        >
          <span className="grid size-10 place-items-center bg-[oklch(0.245_0.08_170)] text-[oklch(0.965_0.023_85)] shadow-xs">
            <span className="text-2xl leading-none">F</span>
          </span>
          <span className="leading-none">
            <span className="block font-semibold text-[0.9rem] tracking-[0.18em]">
              FAIRLEND
            </span>
            <span className="mt-1 block text-[0.64rem] text-[oklch(0.38_0.035_170)] tracking-[0.28em]">
              CAPITAL
            </span>
          </span>
        </Link>
        <div className="hidden items-center gap-5 text-[0.72rem] text-[oklch(0.32_0.04_170)] uppercase tracking-[0.13em] md:flex">
          <Link
            preload="intent"
            to="/garden-suite-financing-gta"
            viewTransition
          >
            Criteria
          </Link>
          <a href="#garden-suite-intake">Start file</a>
        </div>
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <section
      aria-labelledby="garden-suite-title"
      className="relative isolate min-h-[calc(100vh-4.25rem)]"
    >
      <BlueprintField />
      <div className="mx-auto grid max-w-[92rem] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.03fr)_minmax(390px,0.72fr)] lg:px-8 lg:py-8">
        <div className="flex min-h-[calc(100vh-7rem)] flex-col justify-between gap-7">
          <div className="max-w-5xl pt-5 lg:pt-9">
            <p className="mb-5 inline-flex items-center gap-2 bg-[oklch(0.245_0.08_170)] px-3 py-2 font-semibold text-[0.7rem] text-[oklch(0.965_0.023_85)] uppercase tracking-[0.15em]">
              <MapPinned aria-hidden="true" className="size-4" />
              GTA garden-suite financing intake
            </p>
            <h1
              className="max-w-[10ch] font-semibold text-[clamp(4rem,12vw,10rem)] text-[oklch(0.245_0.08_170)] leading-[0.8] tracking-normal"
              id="garden-suite-title"
            >
              Can the lot carry it?
            </h1>
            <p className="mt-7 max-w-2xl text-[1.03rem] text-[oklch(0.31_0.04_170)] leading-7 sm:text-lg">
              Send the property, permit, budget, rental, equity, and cash-flow
              details that decide whether a garden suite can move toward
              reimbursement construction financing.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                render={
                  <a
                    aria-label="Jump to garden-suite financing intake"
                    href="#garden-suite-intake"
                  >
                    Start the review
                  </a>
                }
                size="xl"
              >
                Start the review
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                render={
                  <Link
                    preload="intent"
                    to="/garden-suite-financing-gta"
                    viewTransition
                  />
                }
                size="xl"
                variant="outline"
              >
                Read criteria
              </Button>
            </div>
          </div>
          <HeroLedger />
        </div>
        <GardenSuiteIntakeForm />
      </div>
    </section>
  );
}

function BlueprintField() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.245 0.08 170 / 0.13) 1px, transparent 1px), linear-gradient(90deg, oklch(0.245 0.08 170 / 0.1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-20 h-[29rem] w-full object-cover opacity-18 mix-blend-multiply"
        height={1086}
        src={blueprintAsset}
        width={1448}
      />
      <div
        aria-hidden="true"
        className="absolute top-28 right-[-18rem] -z-10 h-[44rem] w-[44rem] rounded-full bg-[oklch(0.73_0.08_55_/_0.18)] blur-3xl"
      />
    </>
  );
}

function HeroLedger() {
  return (
    <Frame className="bg-[oklch(0.77_0.027_85_/_0.56)]">
      <FramePanel className="overflow-hidden bg-[oklch(0.985_0.016_86)] p-0">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] text-[oklch(0.48_0.04_170)] uppercase tracking-[0.16em]">
                  Lot ledger
                </p>
                <h2 className="mt-2 max-w-sm font-semibold text-2xl text-[oklch(0.245_0.08_170)] leading-tight">
                  A fast screen for the constraints that matter.
                </h2>
              </div>
              <BadgeCheck
                aria-hidden="true"
                className="size-8 text-[oklch(0.56_0.13_145)]"
              />
            </div>
            <div className="mt-6 divide-y divide-[oklch(0.78_0.023_85)]">
              {intakePath.map(([step, label, copy]) => (
                <div
                  className="grid grid-cols-[2.5rem_1fr] gap-4 py-3"
                  key={step}
                >
                  <span className="text-[0.72rem] text-[oklch(0.37_0.09_235)] tracking-[0.15em]">
                    {step}
                  </span>
                  <div>
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="mt-1 text-[oklch(0.43_0.035_170)] text-xs leading-5">
                      {copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-h-72 bg-[oklch(0.245_0.08_170)]">
            <img
              alt="Fairlend Builder's Field brand system with construction photography, technical icons, blueprint paper, and capital intake UI."
              className="absolute inset-0 h-full w-full object-cover opacity-82 mix-blend-screen"
              height={1086}
              loading="eager"
              src={brandKitAsset}
              width={1448}
            />
            <div className="absolute inset-x-0 bottom-0 bg-[oklch(0.245_0.08_170_/_0.9)] p-5 text-[oklch(0.965_0.023_85)]">
              <p className="text-[0.68rem] uppercase tracking-[0.16em]">
                Builder&apos;s Field
              </p>
              <p className="mt-2 max-w-md text-[oklch(0.91_0.018_86)] text-sm leading-6">
                Blueprint paper, framing green, permit blue, and safety clay set
                the intake tone: practical, lender-ready, site-aware.
              </p>
            </div>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function GardenSuiteIntakeForm() {
  return (
    <Frame
      className="self-start bg-[oklch(0.245_0.08_170_/_0.16)] lg:sticky lg:top-4"
      id="garden-suite-intake"
    >
      <FramePanel className="bg-[oklch(0.987_0.015_86)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] text-[oklch(0.48_0.04_170)] uppercase tracking-[0.16em]">
              Eligibility file
            </p>
            <h2 className="mt-2 max-w-sm font-semibold text-2xl text-[oklch(0.245_0.08_170)] leading-tight">
              Build the first lender read.
            </h2>
          </div>
          <span className="bg-[oklch(0.85_0.16_128)] px-2.5 py-1 font-semibold text-[0.68rem] text-[oklch(0.245_0.08_170)] uppercase tracking-[0.12em]">
            Preview
          </span>
        </div>
        <form
          aria-describedby="garden-suite-form-note"
          aria-label="Garden suite financing intake"
          className="mt-6 space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldText id="name" label="Name" required />
            <FieldText id="email" label="Email" required type="email" />
            <FieldText id="phone" label="Phone" type="tel" />
            <FieldText id="address" label="Property address" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              id="project-type"
              label="Suite type"
              options={projectTypes}
            />
            <FieldSelect
              id="permit-stage"
              label="Permit status"
              options={permitStages}
            />
            <FieldText id="mortgage" label="Mortgage balance" />
            <FieldText id="equity" label="Estimated equity" />
            <FieldText id="budget" label="Construction budget" />
            <FieldText id="cash" label="Cash between draws" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Known constraints</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Access, servicing, drawings, zoning, tenant use, rent assumptions, timing, and what is still unknown."
            />
          </div>
          <div className="grid gap-3 bg-[oklch(0.945_0.02_85)] p-4 sm:grid-cols-[auto_1fr]">
            <UploadCloud
              aria-hidden="true"
              className="mt-1 size-5 text-[oklch(0.37_0.09_235)]"
            />
            <div>
              <Label htmlFor="documents">Attach any useful file</Label>
              <Input
                className="mt-2 bg-[oklch(0.987_0.015_86)]"
                id="documents"
                name="documents"
                nativeInput
                type="file"
              />
              <p className="mt-2 text-[oklch(0.43_0.035_170)] text-xs leading-5">
                Optional at this stage. A partial file is better than waiting
                until drawings and estimates are already sunk cost.
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-[oklch(0.32_0.04_170)] text-sm leading-6">
            <Checkbox className="mt-1" id="review-consent" required />
            <Label
              className="items-start font-normal text-[oklch(0.32_0.04_170)] text-sm leading-6"
              htmlFor="review-consent"
            >
              I understand this is a financing review request, not a commitment
              to fund. Fairlend assesses fit before discussing terms.
            </Label>
          </div>
          <Button className="w-full" size="xl" type="button">
            Request lender review
            <ArrowRight aria-hidden="true" />
          </Button>
          <p
            className="text-center text-[oklch(0.43_0.035_170)] text-xs leading-5"
            id="garden-suite-form-note"
          >
            Submission wiring is intentionally not enabled in this preview.
          </p>
        </form>
      </FramePanel>
    </Frame>
  );
}

function FieldText({
  id,
  label,
  required,
  type = "text",
}: {
  id: string;
  label: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-[oklch(0.56_0.16_28)]">
            *
          </span>
        ) : null}
      </Label>
      <Input id={id} name={id} nativeInput required={required} type={type} />
    </div>
  );
}

function FieldSelect({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect className="w-full" id={id} name={id}>
        <NativeSelectOption value="">Select one</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function ReadinessSection() {
  return (
    <section className="relative bg-[oklch(0.245_0.08_170)] px-4 py-16 text-[oklch(0.965_0.023_85)] sm:px-6 lg:px-8 lg:py-20">
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-18"
        height={900}
        src={fieldCollageAsset}
        width={1400}
      />
      <div className="relative mx-auto grid max-w-[92rem] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
        <div>
          <p className="text-[0.68rem] text-[oklch(0.82_0.09_56)] uppercase tracking-[0.16em]">
            Financeability read
          </p>
          <h2 className="mt-3 max-w-xl font-semibold text-[clamp(2.3rem,4.7vw,5rem)] leading-[0.92] tracking-normal">
            The suite is only half the question.
          </h2>
          <p className="mt-5 max-w-lg text-[oklch(0.89_0.018_86)] leading-7">
            A good garden-suite idea still needs capital timing that survives
            permits, site work, inspection lag, and reimbursement releases.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {readinessChecks.map(({ icon: IconComponent, label, note }) => (
            <Card
              className="border-[oklch(0.89_0.018_86_/_0.22)] bg-[oklch(0.965_0.023_85_/_0.08)] text-[oklch(0.965_0.023_85)] shadow-none"
              key={label}
            >
              <CardHeader className="p-5 pb-3">
                <div className="mb-4 grid size-10 place-items-center rounded-lg bg-[oklch(0.965_0.023_85_/_0.12)]">
                  <IconComponent aria-hidden="true" className="size-5" />
                </div>
                <CardTitle className="text-xl">{label}</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <p className="text-[oklch(0.89_0.018_86)] text-sm leading-6">
                  {note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewSection() {
  return (
    <section className="bg-[oklch(0.965_0.023_85)] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-[92rem] gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Frame className="bg-[oklch(0.77_0.027_85_/_0.56)]">
          <FramePanel className="grid gap-6 overflow-hidden bg-[oklch(0.987_0.015_86)] p-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="p-5 sm:p-7">
              <p className="text-[0.68rem] text-[oklch(0.48_0.04_170)] uppercase tracking-[0.16em]">
                Review path
              </p>
              <h2 className="mt-3 max-w-lg font-semibold text-3xl text-[oklch(0.245_0.08_170)] leading-tight sm:text-4xl">
                No vague pre-approval theater.
              </h2>
              <div className="mt-7 space-y-5">
                {reviewSequence.map(({ icon: IconComponent, title, copy }) => (
                  <div className="grid grid-cols-[auto_1fr] gap-4" key={title}>
                    <div className="grid size-10 place-items-center bg-[oklch(0.245_0.08_170)] text-[oklch(0.965_0.023_85)]">
                      <IconComponent aria-hidden="true" className="size-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[oklch(0.245_0.08_170)]">
                        {title}
                      </h3>
                      <p className="mt-1 max-w-md text-[oklch(0.43_0.035_170)] text-sm leading-6">
                        {copy}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative min-h-80 bg-[oklch(0.235_0.075_170)]">
              <img
                alt="Fairlend construction financing page mockup with project details and lender review modules."
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                height={1242}
                loading="lazy"
                src={pageMockAsset}
                width={1100}
              />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="bg-[oklch(0.77_0.027_85_/_0.56)]">
          <FramePanel className="flex h-full flex-col justify-between bg-[oklch(0.987_0.015_86)]">
            <div>
              <div className="grid size-12 place-items-center bg-[oklch(0.37_0.09_235)] text-[oklch(0.965_0.023_85)]">
                <Trees aria-hidden="true" className="size-6" />
              </div>
              <h2 className="mt-5 max-w-md font-semibold text-3xl text-[oklch(0.245_0.08_170)] leading-tight">
                Better inputs make the answer sharper.
              </h2>
              <p className="mt-4 max-w-md text-[oklch(0.35_0.04_170)] leading-7">
                Fairlend can screen an early idea, but proof changes the quality
                of the conversation. Attach what exists and name the gaps
                clearly.
              </p>
            </div>
            <div className="mt-8 grid gap-2">
              {documentHints.map((item) => (
                <div
                  className="grid grid-cols-[auto_1fr] items-center gap-3 bg-[oklch(0.945_0.02_85)] px-3 py-3 text-[oklch(0.245_0.08_170)] text-sm"
                  key={item}
                >
                  <Paperclip
                    aria-hidden="true"
                    className="size-4 text-[oklch(0.37_0.09_235)]"
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function FinalIntakeSection() {
  return (
    <section className="bg-[oklch(0.245_0.08_170)] px-4 py-12 text-[oklch(0.965_0.023_85)] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[92rem] gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-[0.68rem] text-[oklch(0.82_0.09_56)] uppercase tracking-[0.16em]">
            Reimbursement construction lending
          </p>
          <h2 className="mt-3 max-w-3xl font-semibold text-[clamp(2rem,4vw,4.25rem)] leading-[0.95]">
            Work, evidence, review, release.
          </h2>
          <p className="mt-5 max-w-2xl text-[oklch(0.89_0.018_86)] leading-7">
            v1 funding is reimbursement-only. Interest begins after funds are
            released, and borrower working capital is reviewed separately from
            lender draw policy.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Button
            render={<a href="#garden-suite-intake">Complete intake fields</a>}
            size="xl"
            variant="default"
          >
            Complete intake fields
            <PenTool aria-hidden="true" />
          </Button>
          <Button
            className="border-[oklch(0.965_0.023_85_/_0.34)] bg-transparent text-[oklch(0.965_0.023_85)] hover:bg-[oklch(0.965_0.023_85_/_0.08)]"
            render={
              <Link
                preload="intent"
                to="/garden-suite-financing-gta"
                viewTransition
              />
            }
            size="xl"
            variant="outline"
          >
            Financing criteria
          </Button>
        </div>
      </div>
      <div className="mx-auto mt-9 grid max-w-[92rem] gap-3 sm:grid-cols-3">
        {[
          "No proactive advance funding before work completion.",
          "Geofence issues do not discard evidence, they route review.",
          "Material approvals and overrides require audit history.",
        ].map((item) => (
          <div
            className="grid grid-cols-[auto_1fr] gap-3 bg-[oklch(0.965_0.023_85_/_0.08)] p-4 text-sm leading-6"
            key={item}
          >
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-4 text-[oklch(0.85_0.16_128)]"
            />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
