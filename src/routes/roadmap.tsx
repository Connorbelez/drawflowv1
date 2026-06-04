import { useGSAP } from "@gsap/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  GitCommitHorizontalIcon,
  HammerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ReactElement } from "react";

import Header from "#/components/Header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Frame, FramePanel } from "#/components/ui/frame";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/roadmap")({
  component: DrawFlowRoadmap,
  head: () => ({
    meta: [
      {
        title: "DrawFlow Roadmap",
      },
      {
        name: "description",
        content:
          "A public, read-only timeline of major DrawFlow features, improvements, and bug fixes added during productionization.",
      },
    ],
  }),
});

type ChangeCategory = "Feature" | "Improvement" | "Bug Fix";

interface RoadmapChange {
  category: ChangeCategory;
  title: string;
  body: string;
  commits: string[];
}

interface RoadmapRelease {
  id: string;
  title: string;
  date: string;
  summary: string;
  commits: string[];
  image?: {
    alt: string;
    src: string;
  };
  changes: RoadmapChange[];
}

const categoryConfig: Record<
  ChangeCategory,
  {
    icon: typeof SparklesIcon;
    variant: "default" | "info" | "warning";
  }
> = {
  Feature: {
    icon: SparklesIcon,
    variant: "default",
  },
  Improvement: {
    icon: HammerIcon,
    variant: "info",
  },
  "Bug Fix": {
    icon: WrenchIcon,
    variant: "warning",
  },
};

const releases: RoadmapRelease[] = [
  {
    id: "ops-control-room",
    title: "Backoffice operations control room",
    date: "June 3, 2026",
    summary:
      "Proposal review, build conversion, evidence intake, draw review, and site-visit operations moved into production-grade lender workflows.",
    commits: ["1b7067c", "ef9d226", "91d7bca", "684d14d", "da59769"],
    image: {
      src: "/roadmap-screenshots/proposal-review-workspace.png",
      alt: "Backoffice proposal review workspace with roadmap and approval panels",
    },
    changes: [
      {
        category: "Feature",
        title: "Proposal-to-build workflow expansion",
        body: "Backoffice users gained production build rosters, draw review, site-visit queues, evidence previews, address normalization, HEIC handling, and build detail surfaces.",
        commits: ["1b7067c"],
      },
      {
        category: "Feature",
        title: "Rich site-visit field reports",
        body: "Site visits now support structured rich reports and normalized evidence handling while preserving review paths for lender staff.",
        commits: ["ef9d226"],
      },
      {
        category: "Improvement",
        title: "Editable Gantt and worksheet refinement",
        body: "Milestone duration editing, draw schedule editing, workbook parsing, and worksheet layout were tightened across proposal and timeline surfaces.",
        commits: ["5637117", "684d14d", "da59769"],
      },
      {
        category: "Bug Fix",
        title: "Claim onboarding and geocoding fixes",
        body: "Builder claim returns, auth redirects, Google address behavior, and user-management edge states were corrected before release workflows.",
        commits: ["6d8ae28", "91d7bca"],
      },
    ],
  },
  {
    id: "calendar-timeline",
    title: "Calendar, templates, and timeline planning",
    date: "June 2, 2026",
    summary:
      "Build schedules became calendar-aware while the timeline gained clearer milestone costing, construction templates, and bug fixes around event projection.",
    commits: ["8be675a", "6754f8f", "0f9ddf3", "47a3715", "2e4dfb6"],
    image: {
      src: "/roadmap-screenshots/draw-review.png",
      alt: "Lender draw review workspace with draw details and evidence states",
    },
    changes: [
      {
        category: "Feature",
        title: "Reusable build calendar workspace",
        body: "Calendar agenda, context menu, event detail, and proposal or active-build adapters were added for construction schedule operations.",
        commits: ["8be675a"],
      },
      {
        category: "Feature",
        title: "Template-driven roadmap setup",
        body: "Construction templates and blueprint thumbnails made the roadmap setup flow faster for repeatable build types.",
        commits: ["6754f8f"],
      },
      {
        category: "Improvement",
        title: "Milestone tabs and submilestone cost breakdown",
        body: "Timeline workspaces gained milestone-level tabs, editable chips, denser cost breakdowns, and clearer worksheet behavior.",
        commits: ["0f9ddf3", "9cab9db"],
      },
      {
        category: "Bug Fix",
        title: "Calendar and site guidance cleanup",
        body: "Working-capital exposure events were suppressed from the calendar, desktop site guidance HTML rendered correctly, and overlapping milestone cards were fixed.",
        commits: ["47a3715", "2e4dfb6", "eaa3580"],
      },
    ],
  },
  {
    id: "contractors-materials",
    title: "Contractors and material planning",
    date: "May 31, 2026",
    summary:
      "Contractor assignment and material procurement moved from loose context into first-class build and proposal planning surfaces.",
    commits: ["d9db90f", "87b0e1d", "a422727", "16101c8"],
    image: {
      src: "/roadmap-screenshots/material-planning.jpg",
      alt: "Backoffice build material planning tab with procurement details",
    },
    changes: [
      {
        category: "Feature",
        title: "Contractor management and assignment",
        body: "Backoffice contractor rosters, contractor detail routes, quick add, WorkOS user autocomplete, and build assignment panels became available.",
        commits: ["d9db90f", "87b0e1d"],
      },
      {
        category: "Feature",
        title: "Build material planning tabs",
        body: "Builder and backoffice proposal/build views gained material planning tabs with fixtures and domain tests.",
        commits: ["a422727"],
      },
      {
        category: "Improvement",
        title: "Mobile material planning polish",
        body: "Material workflows were tightened on mobile and the planning UI was simplified to fit the product motion budget.",
        commits: ["16101c8"],
      },
    ],
  },
  {
    id: "production-foundation",
    title: "Production foundation",
    date: "May 28, 2026",
    summary:
      "The productionization push established the authenticated FairLend module foundation, production timeline workspace, staging deployment, and visual parity artifacts.",
    commits: ["a202cb8", "2539c34", "2547349", "ba71a52", "297c221"],
    image: {
      src: "/roadmap-screenshots/builder-workspace.png",
      alt: "Builder workspace timeline with draw plan and milestone rail",
    },
    changes: [
      {
        category: "Feature",
        title: "Production timeline workspace",
        body: "The roadmap, draw request, evidence upload, cashflow, and lender review surfaces were migrated from demo behavior toward production proposal flows.",
        commits: ["a202cb8", "ba71a52"],
      },
      {
        category: "Feature",
        title: "WorkOS-backed user management",
        body: "Backoffice user management, builder provisioning, role display, and organization-aware roster surfaces landed with visual parity evidence.",
        commits: ["2539c34", "2547349"],
      },
      {
        category: "Feature",
        title: "Live collaboration on proposal timelines",
        body: "Proposal collaboration state, realtime model tests, and shared timeline workspace behavior were added for production proposal planning.",
        commits: ["297c221"],
      },
      {
        category: "Improvement",
        title: "Builder onboarding and landing alignment",
        body: "The public landing, build detail entry points, and onboarding CTAs were repositioned around on-demand reimbursement draws.",
        commits: ["91f2495", "10f7baf"],
      },
      {
        category: "Bug Fix",
        title: "Vercel deployment hardening",
        body: "TanStack Start server output and generated Convex bindings were tracked so staging deployment could build reliably.",
        commits: ["16b45b7", "dd9450a"],
      },
    ],
  },
];

const screenshotGallery = [
  ...releases
    .filter((release) => release.image)
    .map((release) => ({
      alt: release.image?.alt ?? "",
      src: release.image?.src ?? "",
      title: release.title,
    })),
  {
    alt: "Backoffice user management detail surface",
    src: "/roadmap-screenshots/user-management.png",
    title: "User management",
  },
  {
    alt: "Mobile builder workspace with timeline controls",
    src: "/roadmap-screenshots/mobile-workspace.png",
    title: "Mobile builder workspace",
  },
];
const visibleScreenshots = screenshotGallery.length;
const totalChanges = releases.reduce(
  (total, release) => total + release.changes.length,
  0
);
const categoryTotals = releases.reduce<Record<ChangeCategory, number>>(
  (totals, release) => {
    for (const change of release.changes) {
      totals[change.category] += 1;
    }
    return totals;
  },
  { Feature: 0, Improvement: 0, "Bug Fix": 0 }
);

function DrawFlowRoadmap(): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const [activeCategory, setActiveCategory] = useState<ChangeCategory | "All">(
    "All"
  );

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        gsap.from("[data-roadmap-hero]", {
          autoAlpha: 0,
          duration: 0.9,
          ease: "power4.out",
          y: 32,
        });

        gsap.from("[data-roadmap-word]", {
          opacity: 0.62,
          ease: "none",
          stagger: 0.08,
          scrollTrigger: {
            end: "bottom 45%",
            scrub: true,
            start: "top 78%",
            trigger: "[data-roadmap-scrub]",
          },
        });

        gsap.utils
          .toArray<HTMLElement>("[data-roadmap-release]")
          .forEach((card, index) => {
            gsap.fromTo(
              card,
              {
                autoAlpha: 0,
                scale: 0.94,
                y: 72,
              },
              {
                autoAlpha: 1,
                duration: 0.7,
                ease: "power4.out",
                scale: 1,
                scrollTrigger: {
                  end: "top 42%",
                  scrub: 0.35,
                  start: "top 86%",
                  trigger: card,
                },
                y: index % 2 === 0 ? 0 : -10,
              }
            );
          });

        gsap.to("[data-roadmap-marquee]", {
          ease: "none",
          repeat: -1,
          xPercent: -50,
          duration: 24,
        });
      }, rootRef);

      return () => ctx.revert();
    },
    { scope: rootRef }
  );

  const filteredReleases = releases.map((release) => ({
    ...release,
    changes:
      activeCategory === "All"
        ? release.changes
        : release.changes.filter(
            (change) => change.category === activeCategory
          ),
  }));

  return (
    <main
      className="w-full max-w-full overflow-x-hidden bg-[oklch(0.985_0.003_125)] text-foreground"
      ref={rootRef}
    >
      <Header enableLandingMobileMenu />
      <Hero />
      <Summary activeCategory={activeCategory} onCategory={setActiveCategory} />
      <ReleaseTimeline releases={filteredReleases} />
      <ScreenshotBand />
      <RoadmapFooter />
    </main>
  );
}

function Hero(): ReactElement {
  return (
    <section
      className="relative isolate px-4 pt-20 pb-28 sm:px-6 md:pt-28 md:pb-36"
      data-roadmap-hero
    >
      <div
        aria-hidden="true"
        className="-z-10 absolute inset-0 bg-[radial-gradient(circle_at_75%_12%,oklch(0.841_0.238_128.85/0.28),transparent_28rem),radial-gradient(circle_at_10%_30%,oklch(0.54_0.14_240/0.1),transparent_22rem)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-end">
        <div>
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border bg-background/80 px-3 py-1.5 text-muted-foreground text-xs shadow-xs/5">
            <span className="size-2 rounded-full bg-primary" />
            Public read-only release record
          </div>
          <h1 className="max-w-6xl font-semibold text-[clamp(3rem,7vw,6.75rem)] leading-[0.9] tracking-normal">
            DrawFlow
            <span className="block">Roadmap</span>
          </h1>
          <p
            className="mt-8 max-w-3xl text-balance text-muted-foreground text-xl leading-8"
            data-roadmap-scrub
          >
            {"Major product changes since productionizing began: features, improvements, and fixes that moved DrawFlow from demo surfaces into an auditable construction draw-management control plane."
              .split(" ")
              .map((word, index) => (
                <span
                  className="mr-[0.35em] inline-block"
                  data-roadmap-word
                  key={`${word}-${index}`}
                >
                  {word}
                </span>
              ))}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button render={<Link to="/builder/proposals/new" />}>
              Start a build proposal
              <ArrowRightIcon aria-hidden="true" />
            </Button>
            <Button render={<Link to="/backoffice" />} variant="outline">
              Backoffice
            </Button>
          </div>
        </div>

        <Frame className="rotate-0 lg:-rotate-1">
          <FramePanel className="overflow-hidden p-0">
            <div className="border-b bg-muted/55 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">Productionizing range</p>
                <Badge variant="outline">a202cb8 to HEAD</Badge>
              </div>
            </div>
            <div className="grid gap-px bg-border">
              {[
                ["First production commit", "May 28, 2026"],
                ["Latest included commit", "June 3, 2026"],
                ["Major releases", releases.length.toString()],
                ["Curated changes", totalChanges.toString()],
                ["Screenshots attached", visibleScreenshots.toString()],
              ].map(([label, value]) => (
                <div
                  className="grid grid-cols-[1fr_auto] items-center gap-4 bg-background px-5 py-4"
                  key={label}
                >
                  <span className="text-muted-foreground text-sm">{label}</span>
                  <span className="font-semibold text-sm">{value}</span>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function Summary({
  activeCategory,
  onCategory,
}: {
  activeCategory: ChangeCategory | "All";
  onCategory: (category: ChangeCategory | "All") => void;
}): ReactElement {
  return (
    <section className="px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <h2 className="font-semibold text-3xl leading-tight sm:text-5xl">
              Production history, filtered down to what mattered.
            </h2>
            <p className="mt-4 text-muted-foreground leading-7">
              This page intentionally excludes churn, checkpoint commits, and
              tiny style passes unless they closed a product gap or fixed a
              user-visible problem.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["All", "Feature", "Improvement", "Bug Fix"] as const).map(
              (category) => (
                <Button
                  aria-pressed={activeCategory === category}
                  key={category}
                  onClick={() => onCategory(category)}
                  size="sm"
                  variant={activeCategory === category ? "default" : "outline"}
                >
                  {category}
                </Button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-flow-dense gap-4 lg:grid-cols-12">
          <Card className="overflow-hidden lg:col-span-7">
            <CardHeader>
              <CardTitle>Release digest</CardTitle>
              <CardDescription>
                Four major productionization chapters, backed by commit hashes
                and visual evidence where available.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {releases.map((release) => (
                <div
                  className="grid gap-3 rounded-xl border bg-muted/25 p-4 sm:grid-cols-[9rem_1fr]"
                  key={release.id}
                >
                  <div className="text-muted-foreground text-xs">
                    {release.date}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{release.title}</p>
                    <p className="mt-1 text-muted-foreground text-sm leading-6">
                      {release.summary}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Category matrix</CardTitle>
              <CardDescription>
                Every item is categorized as Feature, Improvement, or Bug Fix.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(Object.keys(categoryTotals) as ChangeCategory[]).map(
                (category) => {
                  const Icon = categoryConfig[category].icon;
                  return (
                    <div
                      className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4"
                      key={category}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-muted">
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <span className="font-medium text-sm">{category}</span>
                      </div>
                      <span className="font-semibold text-xl">
                        {categoryTotals[category]}
                      </span>
                    </div>
                  );
                }
              )}
            </CardContent>
          </Card>

          <SignalCard
            icon={<ShieldCheckIcon aria-hidden="true" />}
            label="Read-only"
            value="Static route"
          />
          <SignalCard
            icon={<GitCommitHorizontalIcon aria-hidden="true" />}
            label="Source"
            value="Git history"
          />
          <SignalCard
            icon={<CalendarDaysIcon aria-hidden="true" />}
            label="Window"
            value="May 28 to Jun 3"
          />
        </div>
      </div>
    </section>
  );
}

function SignalCard({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}): ReactElement {
  return (
    <Card className="group overflow-hidden lg:col-span-4">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-2 text-2xl">{value}</CardTitle>
        </div>
        <CardAction>
          <span className="grid size-10 place-items-center rounded-xl bg-primary/18 text-primary-foreground transition-transform duration-500 ease-out group-hover:scale-105 [&_svg]:size-5">
            {icon}
          </span>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

function ReleaseTimeline({
  releases: timelineReleases,
}: {
  releases: RoadmapRelease[];
}): ReactElement {
  return (
    <section className="px-4 py-24 sm:px-6 md:py-36">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <p className="font-medium text-muted-foreground text-xs uppercase">
            Productionizing
          </p>
          <h2 className="mt-3 font-semibold text-4xl leading-tight">
            Major changes only.
          </h2>
          <p className="mt-4 text-muted-foreground text-sm leading-6">
            Commit range reviewed from the first productionizing timeline
            checkpoint through the current branch head.
          </p>
        </aside>

        <div className="grid gap-9">
          {timelineReleases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReleaseCard({
  release,
}: {
  release: RoadmapRelease;
}): ReactElement | null {
  if (release.changes.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden" data-roadmap-release>
      <CardHeader className="gap-5 border-b bg-background p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{release.date}</Badge>
              <Badge variant="secondary">
                {release.changes.length} updates
              </Badge>
            </div>
            <CardTitle className="mt-4 text-2xl sm:text-3xl">
              {release.title}
            </CardTitle>
            <CardDescription className="mt-3 max-w-3xl text-base leading-7">
              {release.summary}
            </CardDescription>
          </div>
          <CommitList commits={release.commits} />
        </div>
      </CardHeader>

      {release.image ? (
        <div className="overflow-hidden border-b bg-muted/50">
          <img
            alt={release.image.alt}
            className="aspect-[16/7] w-full object-cover object-top grayscale-[0.08] transition-transform duration-700 ease-out hover:scale-[1.015]"
            loading="lazy"
            src={release.image.src}
          />
        </div>
      ) : null}

      <CardContent className="grid gap-3 p-4 sm:p-5">
        {release.changes.map((change) => (
          <ChangeRow change={change} key={`${release.id}-${change.title}`} />
        ))}
      </CardContent>
    </Card>
  );
}

function ChangeRow({ change }: { change: RoadmapChange }): ReactElement {
  const config = categoryConfig[change.category];
  const Icon = config.icon;

  return (
    <article className="group grid gap-4 rounded-xl border bg-background p-4 transition-colors hover:bg-muted/35 sm:grid-cols-[9.5rem_1fr_auto]">
      <div>
        <Badge variant={config.variant}>
          <Icon aria-hidden="true" />
          {change.category}
        </Badge>
      </div>
      <div>
        <h3 className="font-semibold text-base">{change.title}</h3>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
          {change.body}
        </p>
      </div>
      <CommitList commits={change.commits} compact />
    </article>
  );
}

function CommitList({
  commits,
  compact = false,
}: {
  commits: string[];
  compact?: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5",
        compact ? "sm:max-w-32 sm:justify-end" : "sm:max-w-44 sm:justify-end"
      )}
    >
      {commits.map((commit) => (
        <span
          className="inline-flex h-6 items-center rounded-md border bg-muted/35 px-1.5 font-medium text-[0.68rem] text-muted-foreground"
          key={commit}
        >
          {commit}
        </span>
      ))}
    </div>
  );
}

function ScreenshotBand(): ReactElement {
  const doubled = [...screenshotGallery, ...screenshotGallery];

  return (
    <section className="overflow-hidden py-20 md:py-28">
      <div className="mx-auto mb-8 max-w-7xl px-4 sm:px-6">
        <h2 className="font-semibold text-3xl sm:text-4xl">
          Screenshots are attached where the repository already had visual
          evidence.
        </h2>
      </div>
      <div
        className="flex w-max gap-4 will-change-transform"
        data-roadmap-marquee
      >
        {doubled.map((release, index) => (
          <figure
            className="w-[22rem] overflow-hidden rounded-2xl border bg-background shadow-xs/5 sm:w-[32rem]"
            key={`${release.title}-${index}`}
          >
            <img
              alt={release.alt}
              className="aspect-[16/9] w-full object-cover object-top"
              loading="lazy"
              src={release.src}
            />
            <figcaption className="border-t px-4 py-3 font-medium text-sm">
              {release.title}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function RoadmapFooter(): ReactElement {
  return (
    <footer className="px-4 pt-16 pb-12 sm:px-6">
      <div className="mx-auto max-w-7xl border-t pt-8">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-semibold text-2xl">DrawFlow Roadmap</p>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
              Static public changelog generated from repository history. Minor
              churn is intentionally omitted so the page stays useful.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/" />} variant="outline">
              Home
            </Button>
            <Button render={<Link to="/demo/timeline" />} variant="outline">
              Timeline demo
            </Button>
            <Button render={<Link to="/backoffice" />}>Backoffice</Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
