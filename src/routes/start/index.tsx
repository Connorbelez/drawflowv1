import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpenText,
  Building2,
  Camera,
  DraftingCompass,
  Handshake,
  Home,
  Landmark,
  Leaf,
  MapPinned,
  Newspaper,
  Pickaxe,
  ShieldCheck,
  Sprout,
  UsersRound,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const homeLink = linkOptions({ to: "/" });
const multiplexLink = linkOptions({ to: "/start/multiplex" });
const gardenSuiteLink = linkOptions({ to: "/start/garden-suite" });
const builderLink = linkOptions({ to: "/start/builder" });
const investorLink = linkOptions({ to: "/start/investor" });
const brokerLink = linkOptions({ to: "/start/broker" });
const mediaLink = linkOptions({ to: "/start/media" });

export const Route = createFileRoute("/start/")({
  component: StartIndexPage,
  head: () => ({
    meta: [
      {
        title: "Start With Fairlend | Intake Router",
      },
      {
        name: "description",
        content:
          "Choose the right Fairlend intake path for borrowers, builders, garden suites, multiplex financing, investors, brokers, and media requests.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: "/assets/fairlend-redesign/start-index-brandkit.webp",
      },
      {
        rel: "preload",
        as: "image",
        href: "/assets/fairlend-redesign/start-index-field-collage.webp",
      },
    ],
  }),
});

interface StartPath {
  accent: "blueprint" | "clay" | "forest" | "sage" | "charcoal";
  code: string;
  detail: string;
  eyebrow: string;
  icon: ComponentType<{ className?: string }>;
  link:
    | typeof multiplexLink
    | typeof gardenSuiteLink
    | typeof builderLink
    | typeof investorLink
    | typeof brokerLink
    | typeof mediaLink;
  title: string;
}

const startPaths = [
  {
    accent: "forest",
    code: "01",
    detail:
      "Map a reimbursement-based draw plan for a new build, rental suite, or infill project.",
    eyebrow: "Borrower path",
    icon: Home,
    link: builderLink,
    title: "I need build financing",
  },
  {
    accent: "blueprint",
    code: "02",
    detail:
      "Start a proposal as the builder or development lead coordinating budget, milestones, and evidence.",
    eyebrow: "Builder path",
    icon: Pickaxe,
    link: builderLink,
    title: "I manage the build",
  },
  {
    accent: "sage",
    code: "03",
    detail:
      "Plan financing for a backyard home, laneway suite, or family-suitable rental unit.",
    eyebrow: "Garden suite path",
    icon: Sprout,
    link: gardenSuiteLink,
    title: "I am building a garden suite",
  },
  {
    accent: "clay",
    code: "04",
    detail:
      "Prepare capital for a duplex, triplex, fourplex, or small multi-unit construction project.",
    eyebrow: "Multiplex path",
    icon: Building2,
    link: multiplexLink,
    title: "I am financing a multiplex",
  },
  {
    accent: "blueprint",
    code: "05",
    detail:
      "Review private capital access for housing supply, borrower demand, and disciplined underwriting.",
    eyebrow: "Investor path",
    icon: BadgeDollarSign,
    link: investorLink,
    title: "I want to invest",
  },
  {
    accent: "forest",
    code: "06",
    detail:
      "Route a client, borrower, or builder file to the right Fairlend lending desk.",
    eyebrow: "Broker path",
    icon: Handshake,
    link: brokerLink,
    title: "I am a broker",
  },
  {
    accent: "charcoal",
    code: "07",
    detail:
      "Request company background, commentary, photography, or source material for a housing story.",
    eyebrow: "Media path",
    icon: Newspaper,
    link: mediaLink,
    title: "I am working on a story",
  },
] as const satisfies readonly StartPath[];

const signalItems = [
  {
    icon: DraftingCompass,
    label: "Draw planning",
  },
  {
    icon: ShieldCheck,
    label: "Underwriting",
  },
  {
    icon: Camera,
    label: "Evidence review",
  },
  {
    icon: Landmark,
    label: "Capital release",
  },
] as const;

const proofItems = [
  "Reimbursement only",
  "Interest after release",
  "Budget versions preserved",
  "Admin approval required",
] as const;

const accentClassByName = {
  blueprint:
    "bg-[oklch(0.48_0.088_246)] text-[oklch(0.98_0.012_92)] group-hover:bg-[oklch(0.41_0.1_246)]",
  charcoal:
    "bg-[oklch(0.2_0.01_92)] text-[oklch(0.96_0.018_92)] group-hover:bg-[oklch(0.16_0.012_92)]",
  clay: "bg-[oklch(0.63_0.154_43)] text-[oklch(0.98_0.016_92)] group-hover:bg-[oklch(0.56_0.16_43)]",
  forest:
    "bg-[oklch(0.26_0.058_160)] text-[oklch(0.98_0.018_92)] group-hover:bg-[oklch(0.21_0.064_160)]",
  sage: "bg-[oklch(0.72_0.063_126)] text-[oklch(0.22_0.04_150)] group-hover:bg-[oklch(0.66_0.075_126)]",
} satisfies Record<StartPath["accent"], string>;

function StartIndexPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[oklch(0.955_0.018_92)] text-[oklch(0.18_0.028_150)]">
      <section className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.42] [background-image:linear-gradient(oklch(0.68_0.04_92_/_0.24)_1px,transparent_1px),linear-gradient(90deg,oklch(0.68_0.04_92_/_0.2)_1px,transparent_1px)] [background-size:36px_36px]"
        />
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 -z-10 h-[46rem] w-[58vw] bg-[radial-gradient(circle_at_64%_28%,oklch(0.89_0.036_126_/_0.8),transparent_42%),radial-gradient(circle_at_70%_72%,oklch(0.72_0.09_246_/_0.28),transparent_52%)]"
        />

        <div className="mx-auto grid min-h-screen w-full max-w-[1540px] gap-8 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(620px,1.35fr)] lg:p-6">
          <aside className="relative hidden min-h-[calc(100vh-3rem)] overflow-hidden rounded-2xl bg-[oklch(0.19_0.056_158)] text-[oklch(0.965_0.018_92)] shadow-2xl shadow-[oklch(0.16_0.04_150_/_0.18)] lg:block">
            <img
              alt="Fairlend warm blueprint brand kit with color palette, housing imagery, and material textures"
              className="absolute inset-0 size-full object-cover opacity-20 mix-blend-luminosity"
              height={1086}
              src="/assets/fairlend-redesign/start-index-brandkit.webp"
              width={1448}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.18_0.056_158_/_0.92),oklch(0.18_0.056_158_/_0.72)_48%,oklch(0.14_0.04_150_/_0.94))]" />
            <div className="relative flex h-full flex-col justify-between p-8">
              <div>
                <Link
                  className="inline-flex items-center gap-3 text-[1.7rem] leading-none tracking-[-0.04em]"
                  {...homeLink}
                  preload="intent"
                  viewTransition
                >
                  <span className="grid size-11 place-items-center rounded-full border border-[oklch(0.94_0.02_92_/_0.28)] bg-[oklch(0.93_0.018_92)] font-semibold text-[oklch(0.18_0.056_158)]">
                    F
                  </span>
                  <span className="font-semibold">Fairlend</span>
                </Link>
                <p className="mt-8 max-w-[21rem] text-pretty font-semibold text-[clamp(2.25rem,4vw,4.8rem)] leading-[0.9] tracking-[-0.06em]">
                  Start where the build actually is.
                </p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {signalItems.map((item) => (
                    <div
                      className="rounded-xl border border-[oklch(0.94_0.02_92_/_0.18)] bg-[oklch(0.98_0.018_92_/_0.08)] p-4"
                      key={item.label}
                    >
                      <item.icon className="size-5 opacity-80" />
                      <p className="mt-4 text-[0.72rem] text-[oklch(0.86_0.026_92)] uppercase leading-4 tracking-[0.18em]">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="max-w-[25rem] text-pretty text-[oklch(0.86_0.026_92)] text-sm leading-6">
                  Fairlend routes each conversation by capital role, build type,
                  and review path before anyone wastes a meeting on the wrong
                  intake.
                </p>
              </div>
            </div>
          </aside>

          <div className="flex min-h-[calc(100vh-2rem)] flex-col">
            <header className="flex items-center justify-between gap-4 py-4 lg:py-2">
              <Link
                className="inline-flex items-center gap-3 font-semibold text-[1.35rem] tracking-[-0.04em] lg:hidden"
                {...homeLink}
                preload="intent"
                viewTransition
              >
                <span className="grid size-10 place-items-center rounded-full bg-[oklch(0.19_0.056_158)] text-[oklch(0.965_0.018_92)]">
                  F
                </span>
                Fairlend
              </Link>
              <nav
                aria-label="Start page support"
                className="ml-auto hidden items-center gap-6 text-[0.72rem] text-[oklch(0.32_0.045_150)] uppercase tracking-[0.18em] md:flex"
              >
                <Link {...brokerLink} preload="intent" viewTransition>
                  Broker desk
                </Link>
                <Link {...mediaLink} preload="intent" viewTransition>
                  Media
                </Link>
              </nav>
              <Button
                className="bg-[oklch(0.19_0.056_158)] text-[oklch(0.965_0.018_92)] hover:bg-[oklch(0.15_0.052_158)]"
                render={
                  <Link {...builderLink} preload="intent" viewTransition />
                }
                size="sm"
              >
                Start intake
                <ArrowRight />
              </Button>
            </header>

            <div className="grid flex-1 content-center gap-7 pt-6 pb-8 lg:grid-rows-[auto_1fr_auto] lg:pt-4 lg:pb-0">
              <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_21rem]">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-[oklch(0.78_0.035_92)] bg-[oklch(0.98_0.014_92_/_0.72)] px-3 py-1.5 text-[0.68rem] text-[oklch(0.4_0.085_244)] uppercase tracking-[0.2em]">
                    <MapPinned className="size-3.5" />
                    Intake routing desk
                  </p>
                  <h1 className="mt-5 max-w-[13ch] text-balance font-semibold text-[clamp(4rem,8.4vw,7.35rem)] text-[oklch(0.18_0.052_158)] leading-[0.84] tracking-[-0.065em]">
                    Choose the right first door.
                  </h1>
                </div>
                <Frame className="self-end bg-[oklch(0.85_0.028_92_/_0.72)]">
                  <FramePanel className="bg-[oklch(0.985_0.012_92)] p-5">
                    <p className="text-pretty font-semibold text-2xl text-[oklch(0.2_0.04_150)] leading-[1.05] tracking-[-0.04em]">
                      Housing finance has different starting lines.
                    </p>
                    <p className="mt-4 text-[oklch(0.38_0.036_150)] text-sm leading-6">
                      Pick the path that matches your role. The next screen
                      gathers the specific facts Fairlend needs to route the
                      conversation.
                    </p>
                  </FramePanel>
                </Frame>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {startPaths.map((path) => (
                  <Card
                    className="group min-h-[14.5rem] overflow-hidden bg-[oklch(0.985_0.012_92)] transition duration-300 ease-out hover:-translate-y-1 hover:border-[oklch(0.62_0.058_92)] hover:shadow-[oklch(0.24_0.04_150_/_0.1)] hover:shadow-xl"
                    key={path.eyebrow}
                    render={
                      <Link {...path.link} preload="intent" viewTransition />
                    }
                  >
                    <CardPanel className="flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-4">
                        <span
                          className={`grid size-12 place-items-center rounded-xl transition-colors ${accentClassByName[path.accent]}`}
                        >
                          <path.icon className="size-5" />
                        </span>
                        <span className="rounded-full border border-[oklch(0.8_0.035_92)] px-2.5 py-1 text-[0.62rem] text-[oklch(0.43_0.04_150)] uppercase tracking-[0.16em]">
                          {path.code}
                        </span>
                      </div>
                      <div className="mt-8 flex flex-1 flex-col justify-end">
                        <p className="text-[0.66rem] text-[oklch(0.44_0.08_244)] uppercase tracking-[0.18em]">
                          {path.eyebrow}
                        </p>
                        <h2 className="mt-3 text-pretty font-semibold text-2xl text-[oklch(0.18_0.04_150)] leading-[1.02] tracking-[-0.04em]">
                          {path.title}
                        </h2>
                        <p className="mt-3 text-[oklch(0.4_0.035_150)] text-sm leading-6">
                          {path.detail}
                        </p>
                        <span className="mt-5 inline-flex items-center gap-2 font-semibold text-[oklch(0.2_0.052_158)] text-sm">
                          Continue
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </CardPanel>
                  </Card>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Frame className="bg-[oklch(0.85_0.028_92_/_0.72)]">
                  <FramePanel className="grid gap-5 bg-[oklch(0.22_0.064_158)] p-5 text-[oklch(0.96_0.016_92)] md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="text-[0.68rem] text-[oklch(0.8_0.08_126)] uppercase tracking-[0.2em]">
                        What stays constant
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {proofItems.map((item) => (
                          <span
                            className="rounded-full border border-[oklch(0.94_0.02_92_/_0.2)] bg-[oklch(0.98_0.016_92_/_0.08)] px-3 py-1.5 text-sm"
                            key={item}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      className="w-full bg-[oklch(0.9_0.03_92)] text-[oklch(0.2_0.052_158)] hover:bg-[oklch(0.96_0.02_92)] md:w-auto"
                      render={
                        <Link
                          {...builderLink}
                          preload="intent"
                          viewTransition
                        />
                      }
                    >
                      Begin with a build
                      <ArrowRight />
                    </Button>
                  </FramePanel>
                </Frame>

                <Frame className="bg-[oklch(0.85_0.028_92_/_0.72)]">
                  <FramePanel className="relative min-h-52 overflow-hidden bg-[oklch(0.94_0.018_92)] p-0">
                    <img
                      alt="Warm Fairlend housing field collage"
                      className="absolute inset-0 size-full object-cover"
                      height={843}
                      src="/assets/fairlend-redesign/start-index-field-collage.webp"
                      width={1200}
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.18_0.045_150_/_0.64),transparent_70%)]" />
                    <div className="relative p-5 text-[oklch(0.98_0.014_92)]">
                      <UsersRound className="size-5" />
                      <p className="mt-16 max-w-[16rem] text-pretty font-semibold text-2xl leading-[1.04] tracking-[-0.04em]">
                        Built for community-scale housing conversations.
                      </p>
                    </div>
                  </FramePanel>
                </Frame>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-[oklch(0.78_0.035_92)] border-t bg-[oklch(0.91_0.032_92)] px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-[1540px] gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-[0.68rem] text-[oklch(0.42_0.088_244)] uppercase tracking-[0.2em]">
              Before the intake
            </p>
            <h2 className="mt-4 max-w-[12ch] text-balance font-semibold text-[clamp(2.6rem,6vw,5.9rem)] text-[oklch(0.18_0.052_158)] leading-[0.86] tracking-[-0.06em]">
              Bring the real build facts.
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                icon: BookOpenText,
                label: "Permits, plans, and construction address",
              },
              {
                icon: DraftingCompass,
                label: "Budget, milestones, dependencies, and timing",
              },
              {
                icon: Leaf,
                label: "Capital role, borrower limits, and lender policy",
              },
            ].map((item) => (
              <Frame
                className="bg-[oklch(0.84_0.028_92_/_0.8)]"
                key={item.label}
              >
                <FramePanel className="min-h-44 bg-[oklch(0.97_0.014_92)]">
                  <item.icon className="size-5 text-[oklch(0.45_0.096_244)]" />
                  <p className="mt-12 text-pretty font-semibold text-[oklch(0.2_0.045_150)] text-xl leading-[1.08] tracking-[-0.03em]">
                    {item.label}
                  </p>
                </FramePanel>
              </Frame>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
