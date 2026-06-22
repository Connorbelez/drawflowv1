import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Hammer,
  Home,
  Landmark,
  MapPinned,
  Ruler,
  ShieldCheck,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const brandKitAsset = "/designConcepts/buildersField.png";
const pageMockAsset = "/assets/fairlend-redesign/garden-suite-page-mock.jpg";
const fieldCollageAsset =
  "/assets/fairlend-redesign/garden-suite-field-collage.jpg";
const materialsAsset = "/assets/fairlend-redesign/garden-suite-materials.jpg";
const blueprintAsset =
  "/assets/fairlend-redesign/garden-suite-blueprint-strip.jpg";

export const Route = createFileRoute("/garden-suite-financing-gta")({
  component: GardenSuitePage,
  head: () => ({
    meta: [
      { title: "Garden Suite Financing GTA | Fairlend Capital" },
      {
        name: "description",
        content:
          "Fairlend helps GTA owners, builders, and investors assess financing for garden suites, laneway suites, budgets, permits, and construction draws.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: pageMockAsset },
      { rel: "preload", as: "image", href: fieldCollageAsset },
      { rel: "preload", as: "image", href: brandKitAsset },
    ],
  }),
});

const fitChecks: Array<{
  icon: LucideIcon;
  title: string;
  copy: string;
}> = [
  {
    icon: Home,
    title: "Property fit",
    copy: "Lot access, existing structure, servicing, and local zoning shape the financing path before pricing matters.",
  },
  {
    icon: Landmark,
    title: "Equity position",
    copy: "Existing mortgage debt, available equity, borrower liquidity, and rental intent are reviewed as one capital story.",
  },
  {
    icon: Ruler,
    title: "Design maturity",
    copy: "Concept sketches, permits, consultant status, and budget confidence affect how quickly a lender can underwrite.",
  },
  {
    icon: ClipboardCheck,
    title: "Draw readiness",
    copy: "Construction funding works best when completed work, evidence, site review, and release timing are planned early.",
  },
];

const reviewSteps = [
  "Address and ownership",
  "Mortgage and equity",
  "Plans and permit stage",
  "Budget and contingency",
  "Rental and exit assumptions",
];

const blockers = [
  "Thin contingency",
  "Unclear permit status",
  "Budget not tied to scope",
  "Rental assumptions without evidence",
  "Liquidity below working-capital need",
];

const projectTypes = [
  "Toronto garden suites",
  "GTA laneway suites",
  "Investor-owned backyard rentals",
  "Owner-occupied properties",
  "Mixed multiplex and suite work",
];

function GardenSuitePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[oklch(0.965_0.023_85)] font-[Oxanium_Variable,sans-serif] text-[oklch(0.22_0.049_171)]">
      <GardenSuiteNav />
      <HeroSection />
      <ProofBand />
      <FinanceabilitySection />
      <DrawPlanningSection />
      <LocalReviewSection />
      <FinalCtaSection />
    </main>
  );
}

function GardenSuiteNav() {
  return (
    <header className="relative z-20 border-[oklch(0.78_0.018_82)] border-b bg-[oklch(0.965_0.023_85_/_0.92)] backdrop-blur-sm">
      <nav
        aria-label="Garden suite financing"
        className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8"
      >
        <Link
          aria-label="Fairlend Capital home"
          className="group flex items-center gap-3"
          preload="intent"
          to="/"
          viewTransition
        >
          <span className="grid size-10 place-items-center border border-[oklch(0.25_0.08_166)] bg-[oklch(0.25_0.08_166)] font-semibold text-[1.35rem] text-[oklch(0.965_0.023_85)] leading-none">
            F
          </span>
          <span className="leading-none">
            <span className="block font-semibold text-[0.92rem] tracking-[0.18em]">
              FAIRLEND
            </span>
            <span className="block text-[0.62rem] text-[oklch(0.48_0.054_246)] tracking-[0.33em]">
              CAPITAL
            </span>
          </span>
        </Link>
        <div className="hidden items-center gap-6 text-[0.72rem] text-[oklch(0.34_0.041_170)] tracking-[0.06em] md:flex">
          <a href="#fit">Financeability</a>
          <a href="#draw-plan">Draw plan</a>
          <a href="#local-review">GTA review</a>
        </div>
        <Button
          className="bg-[oklch(0.25_0.08_166)] text-[oklch(0.965_0.023_85)] hover:bg-[oklch(0.30_0.083_166)]"
          render={
            <Link preload="intent" to="/start/garden-suite" viewTransition />
          }
          size="sm"
        >
          Start review
          <ArrowRight aria-hidden="true" />
        </Button>
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <section
      aria-labelledby="garden-suite-title"
      className="relative isolate px-4 pt-8 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pt-10"
    >
      <BlueprintGround />
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-stretch">
        <div className="relative z-10 flex min-h-[34rem] flex-col justify-between py-6 lg:py-10">
          <div>
            <p className="mb-8 w-fit border border-[oklch(0.78_0.018_82)] bg-[oklch(0.95_0.024_86)] px-3 py-2 text-[0.7rem] text-[oklch(0.48_0.054_246)] tracking-[0.16em]">
              GARDEN SUITE FINANCING, TORONTO AND GTA
            </p>
            <h1
              className="max-w-3xl text-balance font-semibold text-[clamp(3.2rem,7vw,6.6rem)] text-[oklch(0.22_0.079_166)] leading-[0.88] tracking-[0.015em]"
              id="garden-suite-title"
            >
              Backyard rental capital, properly framed.
            </h1>
          </div>
          <div className="mt-9 max-w-2xl">
            <p className="text-pretty text-[1rem] text-[oklch(0.29_0.037_174)] leading-7 sm:text-lg">
              Fairlend reviews the property, mortgage position, permits,
              construction budget, rental story, and draw timing before your
              garden suite becomes a cash-flow problem.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                className="h-11 bg-[oklch(0.25_0.08_166)] px-5 text-[oklch(0.965_0.023_85)] hover:bg-[oklch(0.30_0.083_166)]"
                render={
                  <Link
                    preload="intent"
                    to="/start/garden-suite"
                    viewTransition
                  />
                }
                size="xl"
              >
                Check property financeability
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                className="h-11 border-[oklch(0.78_0.018_82)] bg-[oklch(0.965_0.023_85)] px-5 text-[oklch(0.22_0.049_171)]"
                render={
                  <Link
                    preload="intent"
                    to="/resources/garden-suites-family-suitable-rental-supply"
                    viewTransition
                  />
                }
                size="xl"
                variant="outline"
              >
                Read the checklist
              </Button>
            </div>
          </div>
        </div>
        <Frame className="relative z-10 rotate-0 bg-[oklch(0.85_0.021_81)] p-1 lg:-rotate-1">
          <FramePanel className="overflow-hidden border-[oklch(0.74_0.019_80)] bg-[oklch(0.973_0.022_86)] p-0">
            <div className="grid min-h-[34rem] grid-rows-[1fr_auto]">
              <div className="relative overflow-hidden">
                <img
                  alt="Fairlend garden suite financing page concept with residential construction photography"
                  className="h-full min-h-[27rem] w-full object-cover"
                  decoding="async"
                  fetchPriority="high"
                  height={1242}
                  src={pageMockAsset}
                  width={1100}
                />
                <div className="absolute inset-x-5 top-5 flex flex-wrap items-center justify-between gap-3 border border-[oklch(0.93_0.018_85_/_0.82)] bg-[oklch(0.965_0.023_85_/_0.88)] px-4 py-3 backdrop-blur-sm">
                  <span className="text-[0.68rem] text-[oklch(0.48_0.054_246)] tracking-[0.16em]">
                    FIELD NOTE 01
                  </span>
                  <span className="font-semibold text-[0.72rem]">
                    Equity plus permit status plus budget
                  </span>
                </div>
              </div>
              <div className="grid gap-px bg-[oklch(0.78_0.018_82)] text-[0.75rem] sm:grid-cols-3">
                {["Property", "Capital", "Draws"].map((label) => (
                  <div
                    className="bg-[oklch(0.25_0.08_166)] px-4 py-4 text-[oklch(0.965_0.023_85)]"
                    key={label}
                  >
                    <span className="block text-[0.62rem] opacity-70">
                      REVIEW LANE
                    </span>
                    <strong className="mt-1 block text-base">{label}</strong>
                  </div>
                ))}
              </div>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function ProofBand() {
  return (
    <section className="relative border-[oklch(0.78_0.018_82)] border-y bg-[oklch(0.25_0.08_166)] px-4 py-5 text-[oklch(0.965_0.023_85)] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          "Local GTA property review",
          "Budget and contingency pressure tested",
          "Completed-work draw planning",
          "Broker-led financing path",
        ].map((item) => (
          <div className="flex items-center gap-3" key={item}>
            <CheckCircle2 aria-hidden="true" className="size-5 opacity-80" />
            <span className="text-sm">{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinanceabilitySection() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8" id="fit">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <p className="mb-4 text-[0.7rem] text-[oklch(0.58_0.127_44)] tracking-[0.16em]">
            FINANCEABILITY, NOT HYPE
          </p>
          <h2 className="max-w-xl text-balance font-semibold text-[clamp(2.6rem,6vw,5.7rem)] text-[oklch(0.22_0.079_166)] leading-[0.9]">
            The lender has to believe the whole backyard file.
          </h2>
          <p className="mt-6 max-w-lg text-[oklch(0.34_0.041_170)] leading-7">
            A garden suite is small in footprint, not in underwriting. The
            address, main-house debt, permit path, builder budget, and rental
            assumption all have to survive the same review.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {fitChecks.map(({ icon: Icon, title, copy }) => (
            <Card
              className="border-[oklch(0.78_0.018_82)] bg-[oklch(0.973_0.022_86)]"
              key={title}
            >
              <CardContent className="p-5">
                <div className="mb-10 flex items-center justify-between">
                  <span className="grid size-11 place-items-center border border-[oklch(0.78_0.018_82)] bg-[oklch(0.94_0.024_86)] text-[oklch(0.25_0.08_166)]">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-[0.66rem] text-[oklch(0.48_0.054_246)] tracking-[0.14em]">
                    REVIEW
                  </span>
                </div>
                <h3 className="font-semibold text-2xl text-[oklch(0.22_0.079_166)]">
                  {title}
                </h3>
                <p className="mt-3 text-[oklch(0.36_0.035_170)] text-sm leading-6">
                  {copy}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function DrawPlanningSection() {
  return (
    <section
      className="relative isolate overflow-hidden bg-[oklch(0.91_0.035_86)] px-4 py-20 sm:px-6 lg:px-8"
      id="draw-plan"
    >
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-44 w-full object-cover opacity-30 mix-blend-multiply"
        decoding="async"
        height={627}
        loading="lazy"
        src={blueprintAsset}
        width={1200}
      />
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center">
        <Frame className="bg-[oklch(0.79_0.019_82)]">
          <FramePanel className="overflow-hidden border-[oklch(0.73_0.02_82)] bg-[oklch(0.966_0.023_85)] p-0">
            <div className="grid lg:grid-cols-[0.78fr_1fr]">
              <img
                alt="Material and blueprint references for construction financing"
                className="h-full min-h-80 w-full object-cover"
                decoding="async"
                height={1099}
                loading="lazy"
                src={materialsAsset}
                width={900}
              />
              <div className="p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4 border-[oklch(0.80_0.018_82)] border-b pb-4">
                  <span className="text-[0.68rem] text-[oklch(0.48_0.054_246)] tracking-[0.16em]">
                    DRAW PLAN BOARD
                  </span>
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-5 text-[oklch(0.25_0.08_166)]"
                  />
                </div>
                <ol className="mt-5 grid gap-3">
                  {reviewSteps.map((step, index) => (
                    <li
                      className="grid grid-cols-[2.5rem_1fr] items-center gap-3 border border-[oklch(0.82_0.018_82)] bg-[oklch(0.98_0.019_86)] p-3"
                      key={step}
                    >
                      <span className="grid size-9 place-items-center bg-[oklch(0.25_0.08_166)] font-semibold text-[oklch(0.965_0.023_85)]">
                        {index + 1}
                      </span>
                      <span className="font-medium text-sm">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </FramePanel>
        </Frame>
        <div>
          <p className="mb-4 text-[0.7rem] text-[oklch(0.58_0.127_44)] tracking-[0.16em]">
            CONSTRUCTION DRAWS
          </p>
          <h2 className="text-balance font-semibold text-[clamp(2.4rem,5vw,5rem)] text-[oklch(0.22_0.079_166)] leading-[0.92]">
            Release timing should match completed work.
          </h2>
          <p className="mt-6 max-w-xl text-[oklch(0.34_0.041_170)] leading-7">
            Garden suite construction can strain cash if the draw schedule is
            treated as an afterthought. Fairlend looks at how work will be
            evidenced, reviewed, approved, and funded before crews are waiting.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              "Evidence stays attached to the build file.",
              "Site-review lag is considered before release timing.",
              "Borrower working-capital need is kept separate from lender policy limit.",
            ].map((item) => (
              <div className="flex items-start gap-3" key={item}>
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 text-[oklch(0.25_0.08_166)]"
                />
                <p className="text-[oklch(0.34_0.041_170)] text-sm leading-6">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LocalReviewSection() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8" id="local-review">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="mb-4 text-[0.7rem] text-[oklch(0.58_0.127_44)] tracking-[0.16em]">
            GTA REVIEW LANES
          </p>
          <h2 className="max-w-2xl text-balance font-semibold text-[clamp(2.5rem,6vw,5.9rem)] text-[oklch(0.22_0.079_166)] leading-[0.88]">
            Local friction belongs in the financing conversation.
          </h2>
          <p className="mt-6 max-w-xl text-[oklch(0.34_0.041_170)] leading-7">
            The review is built for owners, builders, designers, realtors, and
            investors who need a practical read on whether the project can carry
            its capital stack.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {projectTypes.map((type) => (
              <span
                className="border border-[oklch(0.78_0.018_82)] bg-[oklch(0.973_0.022_86)] px-3 py-2 text-[0.76rem]"
                key={type}
              >
                {type}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <Frame className="bg-[oklch(0.79_0.019_82)]">
            <FramePanel className="overflow-hidden border-[oklch(0.73_0.02_82)] bg-[oklch(0.966_0.023_85)] p-0">
              <img
                alt="Construction teams reviewing plans and building references"
                className="h-80 w-full object-cover"
                decoding="async"
                height={843}
                loading="lazy"
                src={fieldCollageAsset}
                width={1200}
              />
            </FramePanel>
          </Frame>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-[oklch(0.78_0.018_82)] bg-[oklch(0.973_0.022_86)]">
              <CardContent className="p-5">
                <FileSearch
                  aria-hidden="true"
                  className="mb-8 size-6 text-[oklch(0.48_0.054_246)]"
                />
                <h3 className="font-semibold text-[oklch(0.22_0.079_166)] text-xl">
                  Documents that matter
                </h3>
                <p className="mt-3 text-[oklch(0.36_0.035_170)] text-sm leading-6">
                  Address, mortgage details, ownership, design status, permits,
                  budget, rent assumptions, and builder context.
                </p>
              </CardContent>
            </Card>
            <Card className="border-[oklch(0.78_0.018_82)] bg-[oklch(0.973_0.022_86)]">
              <CardContent className="p-5">
                <MapPinned
                  aria-hidden="true"
                  className="mb-8 size-6 text-[oklch(0.58_0.127_44)]"
                />
                <h3 className="font-semibold text-[oklch(0.22_0.079_166)] text-xl">
                  Common blockers
                </h3>
                <ul className="mt-3 grid gap-2 text-[oklch(0.36_0.035_170)] text-sm">
                  {blockers.map((blocker) => (
                    <li className="flex items-center gap-2" key={blocker}>
                      <span className="size-1.5 bg-[oklch(0.58_0.127_44)]" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden border border-[oklch(0.74_0.019_80)] bg-[oklch(0.25_0.08_166)] text-[oklch(0.965_0.023_85)]">
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end lg:p-12">
          <div>
            <div className="mb-10 flex items-center gap-3 text-[0.7rem] tracking-[0.16em] opacity-75">
              <Hammer aria-hidden="true" className="size-4" />
              START WITH THE FILE, NOT THE FANTASY
            </div>
            <h2 className="max-w-4xl text-balance font-semibold text-[clamp(2.8rem,7vw,6.6rem)] leading-[0.88]">
              Know whether the garden suite can carry the loan.
            </h2>
            <p className="mt-6 max-w-2xl text-[oklch(0.89_0.025_86)] leading-7">
              Send the core property details and Fairlend will route the file
              through a financing review built for small residential rental
              construction.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button
              className="h-11 border-[oklch(0.965_0.023_85)] bg-[oklch(0.965_0.023_85)] px-5 text-[oklch(0.25_0.08_166)] hover:bg-[oklch(0.91_0.028_86)]"
              render={
                <Link
                  preload="intent"
                  to="/start/garden-suite"
                  viewTransition
                />
              }
              size="xl"
            >
              Start garden suite review
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              className="h-11 border-[oklch(0.79_0.036_87_/_0.5)] bg-transparent px-5 text-[oklch(0.965_0.023_85)] hover:bg-[oklch(0.965_0.023_85_/_0.08)]"
              render={<Link preload="intent" to="/contact" viewTransition />}
              size="xl"
              variant="outline"
            >
              Talk to Fairlend
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function BlueprintGround() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.72_0.019_82_/_0.28)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.72_0.019_82_/_0.24)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-x-0 top-0 h-60 bg-[radial-gradient(circle_at_18%_12%,oklch(0.88_0.055_45_/_0.28),transparent_34%),radial-gradient(circle_at_76%_18%,oklch(0.59_0.07_242_/_0.18),transparent_36%)]" />
    </div>
  );
}
