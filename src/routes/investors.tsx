import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Landmark,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType, ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const assetBase = "/assets/fairlend-redesign";
const heroPlateAsset = `${assetBase}/investors-hero-plate.webp`;
const capitalCardsAsset = `${assetBase}/investors-capital-cards.webp`;
const typeSystemAsset = `${assetBase}/investors-type-system.webp`;
const blueprintStripAsset = `${assetBase}/investors-blueprint-strip.webp`;
const communityStripAsset = `${assetBase}/investors-community-strip.webp`;

export const Route = createFileRoute("/investors")({
  component: InvestorsPage,
  head: () => ({
    meta: [
      {
        title: "Investors | Fairlend Capital",
      },
      {
        name: "description",
        content:
          "Fairlend Capital works with eligible investors seeking disciplined private-credit exposure tied to Canadian housing finance, underwriting controls, and verified construction progress.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: heroPlateAsset,
      },
      {
        rel: "preload",
        as: "image",
        href: capitalCardsAsset,
      },
    ],
  }),
});

const operatingPrinciples = [
  {
    icon: FileSearch,
    title: "Underwriting before allocation",
    body: "Borrower profile, loan structure, location, budget, and exit path are reviewed before capital is considered for a file.",
  },
  {
    icon: ClipboardCheck,
    title: "Construction evidence matters",
    body: "Draw releases follow completed work, evidence review, lender approval, and documented controls.",
  },
  {
    icon: ShieldCheck,
    title: "Risk is discussed plainly",
    body: "Private credit carries risk. Fairlend presents file context, limitations, and process without promising outcomes.",
  },
] satisfies Array<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}>;

const mandateRows = [
  [
    "01",
    "Capital purpose",
    "Housing finance, construction lending, and mortgage opportunities reviewed through Fairlend's credit process.",
  ],
  [
    "02",
    "Release discipline",
    "Reimbursement-oriented draw governance where funds move after evidence and approval, not before completed work.",
  ],
  [
    "03",
    "Investor fit",
    "Eligible investors who understand private lending risk, liquidity constraints, and file-level review.",
  ],
  [
    "04",
    "Reporting posture",
    "Clear documents, approval records, servicing updates, and direct communication around material changes.",
  ],
] as const;

const processSteps = [
  "Investor eligibility and suitability review",
  "Mandate discussion and capital preferences",
  "Opportunity review with file-level materials",
  "Subscription, servicing, reporting, and ongoing updates",
] as const;

const fitItems = [
  {
    label: "May fit",
    body: "Investors looking for secured private-credit exposure with tangible collateral, document review, and construction finance context.",
  },
  {
    label: "May not fit",
    body: "Investors requiring guaranteed returns, daily liquidity, public-market pricing, or no-risk principal protection.",
  },
  {
    label: "Always disclosed",
    body: "Terms, risks, borrower context, security, fees, and servicing process belong in the conversation before commitment.",
  },
] as const;

function InvestorsPage(): ReactElement {
  return (
    <main className="min-h-screen bg-[oklch(0.982_0.016_92)] text-[oklch(0.15_0.038_168)]">
      <HeroSection />
      <InvestorProofBand />
      <MandateSection />
      <ControlsSection />
      <FitSection />
      <ProcessSection />
      <ClosingSection />
    </main>
  );
}

function HeroSection(): ReactElement {
  return (
    <section
      aria-labelledby="investors-hero-title"
      className="relative isolate overflow-hidden border-[oklch(0.27_0.04_164)]/35 border-b"
    >
      <BlueprintField />
      <div className="mx-auto grid min-h-[94svh] w-full max-w-[1560px] grid-cols-1 lg:grid-cols-[5.5rem_minmax(0,1fr)]">
        <aside
          aria-hidden="true"
          className="hidden border-[oklch(0.27_0.04_164)]/35 border-r bg-[oklch(0.13_0.047_169)] text-[oklch(0.982_0.016_92)] lg:flex lg:flex-col lg:items-center lg:justify-between lg:py-7"
        >
          <div className="grid size-14 place-items-center bg-[oklch(0.84_0.18_125)] text-[oklch(0.18_0.044_168)]">
            <span className="font-semibold text-3xl leading-none">F</span>
          </div>
          <p className="rotate-180 text-sm uppercase tracking-[0.34em] [writing-mode:vertical-rl]">
            investor file
          </p>
          <p className="rotate-180 text-[0.65rem] text-[oklch(0.92_0.014_92)]/72 uppercase tracking-[0.28em] [writing-mode:vertical-rl]">
            fairlend
          </p>
        </aside>

        <div className="grid grid-rows-[auto_1fr]">
          <InvestorNav />

          <div className="grid items-stretch lg:grid-cols-[minmax(0,0.96fr)_minmax(430px,0.74fr)]">
            <div className="flex flex-col justify-between border-[oklch(0.27_0.04_164)]/35 border-b px-5 py-8 sm:px-8 md:px-12 lg:border-r lg:border-b-0 lg:py-12">
              <div>
                <p className="mb-7 inline-flex items-center gap-2 border border-[oklch(0.27_0.04_164)]/45 px-3 py-1 font-semibold text-[0.7rem] uppercase tracking-[0.22em]">
                  <Landmark className="size-3.5 text-[oklch(0.46_0.13_42)]" />
                  Investor capital
                </p>
                <h1
                  className="max-w-[11ch] text-balance font-semibold text-[clamp(4.2rem,12.6vw,12.5rem)] leading-[0.78] tracking-[-0.055em]"
                  id="investors-hero-title"
                >
                  Private credit with a job-site pulse.
                </h1>
              </div>

              <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_minmax(18rem,0.52fr)]">
                <p className="max-w-[42rem] text-pretty text-xl leading-[1.18] tracking-[-0.02em] sm:text-2xl md:text-3xl">
                  Fairlend works with eligible investors seeking exposure to
                  housing finance through disciplined underwriting, secured
                  lending structures, and construction progress controls.
                </p>
                <div className="flex flex-col gap-3 self-end">
                  <Button
                    className="h-12 justify-between bg-[oklch(0.14_0.048_169)] px-5 text-[oklch(0.982_0.016_92)] hover:bg-[oklch(0.19_0.052_169)]"
                    render={
                      <Link
                        hash="investor-fit"
                        preload="intent"
                        to="/investors"
                        viewTransition
                      />
                    }
                    size="xl"
                  >
                    Review investor fit
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button
                    className="h-12 justify-between border-[oklch(0.27_0.04_164)]/45 bg-[oklch(0.982_0.016_92)]/80 px-5"
                    render={
                      <Link preload="intent" to="/contact" viewTransition />
                    }
                    size="xl"
                    variant="outline"
                  >
                    Speak with Fairlend
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative min-h-[34rem] overflow-hidden bg-[oklch(0.13_0.047_169)]">
              <img
                alt="Fairlend Capital website mockup and blueprint-inspired investor brand plate."
                className="h-full min-h-[34rem] w-full object-cover opacity-95"
                decoding="async"
                fetchPriority="high"
                height={1040}
                src={heroPlateAsset}
                width={1248}
              />
              <div className="absolute inset-0 bg-[oklch(0.13_0.047_169)]/10" />
              <div className="absolute right-5 bottom-5 left-5 grid gap-4 border border-[oklch(0.982_0.016_92)]/70 bg-[oklch(0.982_0.016_92)]/94 p-4 text-[oklch(0.15_0.038_168)] shadow-xs/5 sm:right-8 sm:bottom-8 sm:left-auto sm:w-[25rem]">
                <p className="font-semibold text-[0.68rem] uppercase tracking-[0.22em]">
                  No guaranteed returns
                </p>
                <p className="text-lg leading-[1.12] tracking-[-0.02em]">
                  Investor materials should make risk visible before capital is
                  committed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InvestorNav(): ReactElement {
  const navItems = [
    ["Mandate", "mandate"],
    ["Controls", "controls"],
    ["Fit", "investor-fit"],
    ["Process", "process"],
  ] as const;

  return (
    <header className="relative z-10 flex min-h-20 items-center justify-between border-[oklch(0.27_0.04_164)]/35 border-b px-5 sm:px-8 md:px-12">
      <Link
        aria-label="Fairlend home"
        className="inline-flex items-center gap-3 font-semibold text-lg tracking-[-0.03em]"
        preload="intent"
        to="/"
        viewTransition
      >
        <span className="grid size-9 place-items-center bg-[oklch(0.14_0.048_169)] text-[oklch(0.84_0.18_125)]">
          F
        </span>
        <span>Fairlend Capital</span>
      </Link>
      <nav
        aria-label="Investors page sections"
        className="hidden gap-6 lg:flex"
      >
        {navItems.map(([label, hash]) => (
          <Link
            className="font-semibold text-[0.7rem] text-[oklch(0.22_0.036_168)]/74 uppercase tracking-[0.18em] transition-colors hover:text-[oklch(0.22_0.036_168)]"
            hash={hash}
            key={hash}
            preload="intent"
            to="/investors"
            viewTransition
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function MandateSection(): ReactElement {
  return (
    <section
      aria-labelledby="mandate-title"
      className="border-[oklch(0.27_0.04_164)]/30 border-b px-5 py-18 sm:px-8 md:px-12 lg:py-24"
      id="mandate"
    >
      <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[minmax(280px,0.58fr)_minmax(0,1fr)]">
        <div>
          <p className="font-semibold text-[0.72rem] text-[oklch(0.46_0.13_42)] uppercase tracking-[0.22em]">
            Investment mandate
          </p>
          <h2
            className="mt-5 max-w-[10ch] text-balance font-semibold text-[clamp(3.2rem,8vw,7.5rem)] leading-[0.84] tracking-[-0.05em]"
            id="mandate-title"
          >
            Capital has to know the work.
          </h2>
        </div>

        <Frame className="bg-[oklch(0.9_0.024_92)]/72">
          <FramePanel className="overflow-hidden border-[oklch(0.72_0.03_92)] bg-[oklch(0.965_0.018_92)] p-0">
            {mandateRows.map(([number, title, body]) => (
              <div
                className="grid gap-4 border-[oklch(0.27_0.04_164)]/25 border-b p-5 last:border-b-0 sm:grid-cols-[5rem_minmax(0,0.42fr)_minmax(0,1fr)] sm:items-start md:p-7"
                key={number}
              >
                <p className="font-semibold text-3xl text-[oklch(0.38_0.093_242)] leading-none tracking-[-0.04em]">
                  {number}
                </p>
                <h3 className="font-semibold text-xl leading-[1.05] tracking-[-0.02em]">
                  {title}
                </h3>
                <p className="max-w-[48rem] text-[oklch(0.29_0.032_168)] leading-7">
                  {body}
                </p>
              </div>
            ))}
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function ControlsSection(): ReactElement {
  return (
    <section
      aria-labelledby="controls-title"
      className="relative overflow-hidden bg-[oklch(0.14_0.048_169)] px-5 py-18 text-[oklch(0.982_0.016_92)] sm:px-8 md:px-12 lg:py-24"
      id="controls"
    >
      <div className="absolute inset-x-0 bottom-0 h-28 opacity-42">
        <img
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          decoding="sync"
          height={192}
          loading="eager"
          src={blueprintStripAsset}
          width={1520}
        />
      </div>

      <div className="relative mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(330px,0.48fr)]">
        <div>
          <p className="font-semibold text-[0.72rem] text-[oklch(0.84_0.18_125)] uppercase tracking-[0.22em]">
            Controls, not slogans
          </p>
          <h2
            className="mt-5 max-w-[12ch] text-balance font-semibold text-[clamp(3rem,7vw,6.8rem)] leading-[0.86] tracking-[-0.045em]"
            id="controls-title"
          >
            The file is the proof surface.
          </h2>
          <p className="mt-7 max-w-[52rem] text-[oklch(0.92_0.014_92)]/82 text-xl leading-8">
            Fairlend's investor conversation is built around source documents,
            credit review, construction status, draw governance, servicing, and
            borrower context. The point is not to make risk disappear. The point
            is to make it discussable.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {operatingPrinciples.map(({ icon: Icon, title, body }) => (
              <Card
                className="border-[oklch(0.72_0.03_92)]/24 bg-[oklch(0.18_0.052_169)] p-5 text-[oklch(0.982_0.016_92)]"
                key={title}
              >
                <Icon className="size-7 text-[oklch(0.84_0.18_125)]" />
                <h3 className="mt-8 font-semibold text-xl leading-[1.05] tracking-[-0.02em]">
                  {title}
                </h3>
                <p className="mt-4 text-[oklch(0.92_0.014_92)]/74 text-sm leading-6">
                  {body}
                </p>
              </Card>
            ))}
          </div>
        </div>

        <Frame className="self-start bg-[oklch(0.3_0.044_169)]/70">
          <FramePanel className="border-[oklch(0.72_0.03_92)]/30 bg-[oklch(0.19_0.052_169)] p-2">
            <img
              alt="Fairlend typography and identity system from the investor brand kit."
              className="aspect-[1.18] w-full object-cover"
              decoding="sync"
              height={630}
              loading="eager"
              src={typeSystemAsset}
              width={1240}
            />
          </FramePanel>
          <FramePanel className="border-[oklch(0.72_0.03_92)]/30 bg-[oklch(0.19_0.052_169)]">
            <p className="font-semibold text-[0.7rem] text-[oklch(0.84_0.18_125)] uppercase tracking-[0.2em]">
              Document posture
            </p>
            <p className="mt-3 text-[oklch(0.92_0.014_92)]/78 text-sm leading-6">
              Plain-language review beats pitch language. Materials should help
              an investor say yes, no, or not this file.
            </p>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function FitSection(): ReactElement {
  return (
    <section
      aria-labelledby="fit-title"
      className="border-[oklch(0.27_0.04_164)]/30 border-b px-5 py-18 sm:px-8 md:px-12 lg:py-24"
      id="investor-fit"
    >
      <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[minmax(420px,0.85fr)_minmax(0,1fr)]">
        <Frame className="self-start bg-[oklch(0.9_0.024_92)]/72 lg:order-first">
          <FramePanel className="overflow-hidden border-[oklch(0.72_0.03_92)] bg-[oklch(0.965_0.018_92)] p-2">
            <img
              alt="Fairlend capital cards with investor-oriented brand language."
              className="aspect-[1.85/1] w-full object-cover"
              decoding="sync"
              height={660}
              loading="eager"
              src={capitalCardsAsset}
              width={1224}
            />
          </FramePanel>
        </Frame>

        <div className="self-center">
          <p className="font-semibold text-[0.72rem] text-[oklch(0.46_0.13_42)] uppercase tracking-[0.22em]">
            Investor fit
          </p>
          <h2
            className="mt-5 max-w-[12ch] text-balance font-semibold text-[clamp(3rem,7vw,6.8rem)] leading-[0.86] tracking-[-0.045em]"
            id="fit-title"
          >
            This is not deposit capital.
          </h2>
          <div className="mt-8 grid gap-3">
            {fitItems.map((item) => (
              <Card
                className="border border-[oklch(0.27_0.04_164)]/28 bg-[oklch(0.965_0.018_92)] p-5"
                key={item.label}
              >
                <h3 className="font-semibold text-lg leading-none">
                  {item.label}
                </h3>
                <p className="mt-3 text-[oklch(0.29_0.032_168)] text-sm leading-6">
                  {item.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection(): ReactElement {
  return (
    <section
      aria-labelledby="process-title"
      className="px-5 py-18 sm:px-8 md:px-12 lg:py-24"
      id="process"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <p className="font-semibold text-[0.72rem] text-[oklch(0.46_0.13_42)] uppercase tracking-[0.22em]">
              How the conversation starts
            </p>
            <h2
              className="mt-5 max-w-[11ch] text-balance font-semibold text-[clamp(3rem,7vw,6.8rem)] leading-[0.86] tracking-[-0.045em]"
              id="process-title"
            >
              From interest to review.
            </h2>
          </div>
          <p className="max-w-[48rem] text-[oklch(0.29_0.032_168)] text-xl leading-8">
            Fairlend's investor process is designed to slow down where it
            matters: eligibility, mandate fit, file materials, risk discussion,
            and subscription documents.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {processSteps.map((step, index) => (
            <Card
              className="min-h-[15rem] justify-between border-[oklch(0.72_0.03_92)] bg-[oklch(0.965_0.018_92)] p-5"
              key={step}
            >
              <p className="font-semibold text-4xl text-[oklch(0.38_0.093_242)] leading-none tracking-[-0.04em]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-12 text-pretty font-semibold text-xl leading-[1.08] tracking-[-0.02em]">
                {step}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingSection(): ReactElement {
  return (
    <section className="relative isolate overflow-hidden bg-[oklch(0.13_0.047_169)] px-5 py-16 text-[oklch(0.982_0.016_92)] sm:px-8 md:px-12 lg:py-20">
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-y-0 right-0 hidden h-full w-[44%] object-cover opacity-30 mix-blend-luminosity lg:block"
        decoding="sync"
        height={320}
        loading="eager"
        src={communityStripAsset}
        width={860}
      />
      <div className="relative mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-semibold text-[0.72rem] text-[oklch(0.84_0.18_125)] uppercase tracking-[0.22em]">
            Start with suitability
          </p>
          <h2 className="mt-5 max-w-[13ch] text-balance font-semibold text-[clamp(3rem,7vw,7rem)] leading-[0.86] tracking-[-0.045em]">
            Ask for the investor file.
          </h2>
          <p className="mt-6 max-w-[45rem] text-[oklch(0.92_0.014_92)]/78 text-lg leading-7">
            Fairlend can share the appropriate next steps for eligible
            investors. Availability, terms, and risk profile vary by
            opportunity.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Button
            className="h-12 justify-between bg-[oklch(0.84_0.18_125)] px-5 text-[oklch(0.18_0.044_168)] hover:bg-[oklch(0.79_0.17_125)]"
            render={<Link preload="intent" to="/contact" viewTransition />}
            size="xl"
          >
            Contact Fairlend
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            className="h-12 justify-between border-[oklch(0.92_0.014_92)]/45 bg-transparent px-5 text-[oklch(0.982_0.016_92)] hover:bg-[oklch(0.982_0.016_92)]/8"
            render={<Link preload="intent" to="/about" viewTransition />}
            size="xl"
            variant="outline"
          >
            Read about Fairlend
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function BlueprintField(): ReactElement {
  const cells = Array.from({ length: 42 }, (_, index) => index);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.27_0.04_164)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.27_0.04_164)_1px,transparent_1px)] bg-[size:76px_76px]" />
      <div className="absolute inset-0 grid grid-cols-7 grid-rows-6">
        {cells.map((cell) => (
          <span
            className="border-[oklch(0.27_0.04_164)]/18 border-r border-b"
            key={cell}
          />
        ))}
      </div>
    </div>
  );
}

function ProofPill({
  children,
  icon: Icon,
}: {
  children: string;
  icon: ComponentType<{ className?: string }>;
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-2 border border-[oklch(0.27_0.04_164)]/30 bg-[oklch(0.965_0.018_92)] px-3 py-2 font-semibold text-[0.72rem] uppercase tracking-[0.15em]">
      <Icon className="size-3.5 text-[oklch(0.46_0.13_42)]" />
      {children}
    </span>
  );
}

function InvestorProofBand(): ReactElement {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-wrap gap-2 px-5 py-5 sm:px-8 md:px-12">
      <ProofPill icon={Building2}>Secured file review</ProofPill>
      <ProofPill icon={LockKeyhole}>Eligibility required</ProofPill>
      <ProofPill icon={MapPinned}>Housing-backed context</ProofPill>
      <ProofPill icon={CheckCircle2}>No outcome guarantees</ProofPill>
    </div>
  );
}
