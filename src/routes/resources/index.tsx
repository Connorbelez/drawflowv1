import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  FileSearch,
  Home,
  Landmark,
  Leaf,
  MapPinned,
  Ruler,
  ShieldCheck,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const assetBase = "/assets/fairlend-redesign";
const brandKitAsset = `${assetBase}/resources-index-brandkit.webp`;
const pageCanvasAsset = `${assetBase}/resources-index-page-canvas.webp`;
const materialStripAsset = `${assetBase}/resources-index-material-strip.webp`;

const homeLink = linkOptions({ to: "/" });
const startLink = linkOptions({ to: "/start" });
const multiplexLink = linkOptions({ to: "/start/multiplex" });
const gardenSuiteLink = linkOptions({ to: "/start/garden-suite" });
const builderLink = linkOptions({ to: "/start/builder" });
const investorLink = linkOptions({ to: "/start/investor" });

const articles = [
  {
    index: "01",
    topic: "Multiplex capital",
    title: "The financing gap in GTA multiplex builds",
    summary:
      "Why missing-middle projects can look viable on paper, then fail when budget, debt, equity, valuation, and draw timing are reviewed together.",
    route: linkOptions({ to: "/resources/financing-gap-gta-multiplex-builds" }),
    audience: "Owners, builders, brokers",
    format: "Capital stack explainer",
    accent: "blue",
    icon: Building2,
  },
  {
    index: "02",
    topic: "Backyard supply",
    title: "Garden suites and family-suitable rental supply",
    summary:
      "How smaller rental homes can serve real households when lot fit, permits, budget, equity, and rental intent are honest from the start.",
    route: linkOptions({
      to: "/resources/garden-suites-family-suitable-rental-supply",
    }),
    audience: "Homeowners, investors",
    format: "Housing thesis",
    accent: "lime",
    icon: Home,
  },
  {
    index: "03",
    topic: "MLI Select",
    title: "CMHC MLI Select guide for multiplex builds",
    summary:
      "Readiness questions for affordability, accessibility, energy efficiency, documentation, and timing before the financing plan depends on program fit.",
    route: linkOptions({
      to: "/resources/cmhc-mli-select-guide-for-multiplex-builds",
    }),
    audience: "Multiplex builders",
    format: "Readiness checklist",
    accent: "orange",
    icon: ShieldCheck,
  },
  {
    index: "04",
    topic: "Draw financing",
    title: "Construction draws for small builders",
    summary:
      "How reimbursement draw timing changes working-capital pressure, review lag, evidence requirements, fees, and interest exposure after funds release.",
    route: linkOptions({ to: "/resources/construction-draws-small-builders" }),
    audience: "Builders, developers",
    format: "Operating guide",
    accent: "ink",
    icon: ClipboardCheck,
  },
  {
    index: "05",
    topic: "Private credit",
    title: "Private capital and affordable housing",
    summary:
      "Where aligned private lending can help create housing, where it cannot replace policy, and why underwriting discipline still has to lead.",
    route: linkOptions({ to: "/resources/private-capital-affordable-housing" }),
    audience: "Investors, partners",
    format: "Position paper",
    accent: "blue",
    icon: Landmark,
  },
  {
    index: "06",
    topic: "Investor discipline",
    title: "Sustainable rental housing and investor returns",
    summary:
      "A clear view of housing-backed private credit, measurable impact, borrower fit, risk controls, and the limits of yield-first storytelling.",
    route: linkOptions({
      to: "/resources/sustainable-rental-housing-investor-returns",
    }),
    audience: "Capital partners",
    format: "Investor note",
    accent: "lime",
    icon: Leaf,
  },
  {
    index: "07",
    topic: "Project type",
    title: "Multiplex vs. garden suite vs. laneway suite",
    summary:
      "A comparison of financing considerations across three GTA rental housing paths, including scale, permits, budget, rental story, and draw needs.",
    route: linkOptions({
      to: "/resources/multiplex-vs-garden-suite-vs-laneway-suite",
    }),
    audience: "Owners, advisors",
    format: "Comparison guide",
    accent: "orange",
    icon: Ruler,
  },
] as const;

const libraryLanes = [
  {
    label: "Build type",
    copy: "Multiplexes, garden suites, laneway suites, and small rental projects reviewed by real financing constraints.",
    icon: MapPinned,
  },
  {
    label: "Capital structure",
    copy: "Debt, equity, budget, contingency, rental income, draw cadence, and working-capital pressure treated as one file.",
    icon: Landmark,
  },
  {
    label: "Evidence path",
    copy: "Guides explain what has to be known before a reimbursement draw or program-readiness assumption becomes useful.",
    icon: FileSearch,
  },
] satisfies Array<{ label: string; copy: string; icon: LucideIcon }>;

const quickFilters = [
  "Multiplex",
  "Garden suite",
  "MLI Select",
  "Construction draws",
  "Private capital",
  "Investor returns",
  "Project comparison",
];

export const Route = createFileRoute("/resources/")({
  component: ResourcesPage,
  head: () => ({
    meta: [
      { title: "Fairlend Resource Library | Housing Finance Guides" },
      {
        name: "description",
        content:
          "Fairlend resource library for GTA multiplex financing, garden suites, CMHC MLI Select, construction draws, private capital, and sustainable rental housing.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: brandKitAsset },
      { rel: "preload", as: "image", href: pageCanvasAsset },
      { rel: "preload", as: "image", href: materialStripAsset },
    ],
  }),
});

function ResourcesPage() {
  return (
    <main className="ri-page">
      <ResourcesStyles />
      <header className="ri-nav">
        <Link
          {...homeLink}
          aria-label="Fairlend Capital home"
          className="ri-brand"
          preload="intent"
          viewTransition
        >
          <span className="ri-brand-mark">F</span>
          <span>
            <strong>Fairlend</strong>
            <small>Resource library</small>
          </span>
        </Link>
        <nav aria-label="Resource library sections" className="ri-nav-links">
          <a href="#library">Library</a>
          <a href="#pathfinder">Pathfinder</a>
          <a href="#submit">Submit</a>
        </nav>
        <Button
          className="ri-nav-button !text-[#fefaf2]"
          render={<Link {...startLink} preload="intent" viewTransition />}
          size="sm"
        >
          Start review
          <ArrowRight aria-hidden />
        </Button>
      </header>

      <section aria-labelledby="resources-title" className="ri-hero">
        <div className="ri-hero-copy">
          <p className="ri-kicker">Fairlend field archive</p>
          <h1 id="resources-title">
            Housing finance guides, built for real files.
          </h1>
          <p>
            Read the guide that matches the project in front of you: multiplex
            capital gaps, garden suite feasibility, MLI Select readiness,
            reimbursement draws, private credit, and housing-backed investment
            discipline.
          </p>
          <div className="ri-hero-actions">
            <Button
              className="ri-primary-button !text-[#fefaf2]"
              render={
                <Link
                  hash="library"
                  preload="intent"
                  to="/resources"
                  viewTransition
                />
              }
              size="lg"
            >
              Browse the library
              <ArrowRight aria-hidden />
            </Button>
            <Button
              className="ri-secondary-button"
              render={<Link {...startLink} preload="intent" viewTransition />}
              size="lg"
              variant="outline"
            >
              Route a project
            </Button>
          </div>
        </div>

        <Frame className="ri-hero-frame">
          <FramePanel className="ri-hero-panel">
            <img
              alt="Fairlend soft brutalist resource page canvas with housing imagery, blueprint rules, and lime editorial panels"
              className="ri-hero-image"
              decoding="async"
              fetchPriority="high"
              height={1086}
              src={pageCanvasAsset}
              width={588}
            />
            <div className="ri-hero-note">
              <span>Archive code</span>
              <strong>7 guides, 3 project lanes, one housing thesis.</strong>
            </div>
          </FramePanel>
        </Frame>
      </section>

      <section aria-label="Resource topics" className="ri-filter-strip">
        {quickFilters.map((filter) => (
          <span key={filter}>{filter}</span>
        ))}
      </section>

      <section
        aria-labelledby="library-title"
        className="ri-library"
        id="library"
      >
        <div className="ri-section-head">
          <p className="ri-kicker">Resource docket</p>
          <h2 id="library-title">
            Seven useful reads, sorted by the decision they support.
          </h2>
          <p>
            No generic lending glossary. Each guide answers a constraint that
            changes whether a project, borrower, or capital story can hold up.
          </p>
        </div>

        <div className="ri-feature-row">
          <Frame className="ri-feature-frame">
            <FramePanel className="ri-feature-panel">
              <BookOpenCheck aria-hidden />
              <div>
                <span>Start here</span>
                <h3>
                  The resource page is a routing surface, not a blog shelf.
                </h3>
              </div>
              <p>
                If you already know the project type, choose the article that
                matches the next financing decision. If not, use the pathfinder
                below to route yourself to the right intake.
              </p>
            </FramePanel>
          </Frame>
          <img
            alt="Fairlend materials strip with housing photography, blueprint texture, and warm construction surfaces"
            className="ri-material-strip"
            decoding="async"
            height={140}
            src={materialStripAsset}
            width={860}
          />
        </div>

        <div className="ri-article-grid">
          {articles.map((article) => {
            const Icon = article.icon;
            return (
              <Card
                className="ri-article-card"
                data-accent={article.accent}
                key={article.route.to}
                render={
                  <Link {...article.route} preload="intent" viewTransition />
                }
              >
                <span className="ri-card-index">{article.index}</span>
                <div className="ri-card-topline">
                  <Icon aria-hidden />
                  <span>{article.topic}</span>
                </div>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <dl>
                  <div>
                    <dt>Reader</dt>
                    <dd>{article.audience}</dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>{article.format}</dd>
                  </div>
                </dl>
                <span className="ri-card-action">
                  Read guide
                  <ArrowRight aria-hidden />
                </span>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="pathfinder-title"
        className="ri-pathfinder"
        id="pathfinder"
      >
        <div className="ri-pathfinder-copy">
          <p className="ri-kicker">Pathfinder</p>
          <h2 id="pathfinder-title">
            Choose by constraint, not content category.
          </h2>
          <p>
            The fastest path is usually not the newest article. It is the one
            that names the thing currently blocking the file.
          </p>
        </div>
        <div className="ri-lane-grid">
          {libraryLanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <Frame className="ri-lane-frame" key={lane.label}>
                <FramePanel className="ri-lane-panel">
                  <Icon aria-hidden />
                  <h3>{lane.label}</h3>
                  <p>{lane.copy}</p>
                </FramePanel>
              </Frame>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="submit-title" className="ri-submit" id="submit">
        <div className="ri-submit-copy">
          <p className="ri-kicker">When reading is not enough</p>
          <h2 id="submit-title">
            Bring Fairlend the project before the gap gets expensive.
          </h2>
          <p>
            A useful first review needs the project type, address, permit stage,
            budget, mortgage context, borrower liquidity, rental plan, and draw
            timing. Pick the lane that matches the file.
          </p>
        </div>
        <div className="ri-submit-actions">
          <Button
            className="ri-primary-button !text-[#fefaf2]"
            render={<Link {...multiplexLink} preload="intent" viewTransition />}
            size="lg"
          >
            Multiplex review
            <ArrowRight aria-hidden />
          </Button>
          <Button
            className="ri-secondary-button"
            render={
              <Link {...gardenSuiteLink} preload="intent" viewTransition />
            }
            size="lg"
            variant="outline"
          >
            Garden suite review
          </Button>
          <Button
            className="ri-secondary-button"
            render={<Link {...builderLink} preload="intent" viewTransition />}
            size="lg"
            variant="outline"
          >
            Builder draw review
          </Button>
          <Button
            className="ri-secondary-button"
            render={<Link {...investorLink} preload="intent" viewTransition />}
            size="lg"
            variant="outline"
          >
            Investor information
          </Button>
        </div>
        <p className="ri-disclosure">
          Fairlend resources are informational. They do not guarantee financing,
          CMHC qualification, insurance, pricing, approval, or timing.
        </p>
      </section>
    </main>
  );
}

function ResourcesStyles() {
  return (
    <style>{`
      .ri-page {
        --ri-paper: oklch(0.974 0.017 83);
        --ri-paper-soft: oklch(0.944 0.015 78);
        --ri-ink: oklch(0.18 0.052 171);
        --ri-ink-deep: oklch(0.12 0.04 169);
        --ri-blue: oklch(0.44 0.105 238);
        --ri-lime: oklch(0.86 0.192 128);
        --ri-orange: oklch(0.61 0.162 43);
        --ri-gray: oklch(0.84 0.012 84);
        --ri-line: color-mix(in oklch, var(--ri-ink) 28%, transparent);
        --ri-soft-line: color-mix(in oklch, var(--ri-blue) 18%, transparent);
        min-height: 100vh;
        overflow: hidden;
        background:
          linear-gradient(var(--ri-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--ri-soft-line) 1px, transparent 1px),
          radial-gradient(circle at 82% 12%, color-mix(in oklch, var(--ri-lime) 22%, transparent), transparent 26rem),
          var(--ri-paper);
        background-size: 42px 42px, 42px 42px, auto, auto;
        color: var(--ri-ink);
        font-family: Oxanium, "Oxanium Variable", sans-serif;
      }

      .ri-page * {
        box-sizing: border-box;
      }

      .ri-page a {
        color: inherit;
        text-decoration: none;
      }

      .ri-nav,
      .ri-hero,
      .ri-filter-strip,
      .ri-library,
      .ri-pathfinder,
      .ri-submit {
        width: min(1220px, calc(100vw - 32px));
        margin-inline: auto;
      }

      .ri-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: clamp(16px, 3vw, 44px);
        padding: 18px 0;
      }

      .ri-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: max-content;
      }

      .ri-brand-mark {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 2px solid var(--ri-ink);
        background: var(--ri-lime);
        color: var(--ri-ink-deep);
        font-size: 1.45rem;
        font-weight: 800;
        line-height: 1;
      }

      .ri-brand strong,
      .ri-brand small {
        display: block;
        text-transform: uppercase;
      }

      .ri-brand strong {
        font-size: 1rem;
        font-weight: 800;
        letter-spacing: 0.12em;
      }

      .ri-brand small {
        color: var(--ri-blue);
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.18em;
      }

      .ri-nav-links {
        display: flex;
        justify-content: center;
        gap: clamp(14px, 3vw, 42px);
        color: color-mix(in oklch, var(--ri-ink) 82%, var(--ri-blue));
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .ri-nav-links a {
        border-bottom: 1px solid transparent;
        padding-bottom: 5px;
      }

      .ri-nav-links a:hover {
        border-color: var(--ri-orange);
        color: var(--ri-orange);
      }

      .ri-page [data-slot="button"].ri-nav-button,
      .ri-page [data-slot="button"].ri-primary-button {
        border-color: var(--ri-ink);
        background: var(--ri-ink);
        color: var(--ri-paper);
      }

      .ri-page [data-slot="button"].ri-nav-button:hover,
      .ri-page [data-slot="button"].ri-primary-button:hover {
        background: color-mix(in oklch, var(--ri-ink) 86%, var(--ri-blue));
        color: var(--ri-paper);
      }

      .ri-page [data-slot="button"].ri-secondary-button {
        border-color: color-mix(in oklch, var(--ri-ink) 42%, transparent);
        background: color-mix(in oklch, var(--ri-paper) 92%, var(--ri-gray));
        color: var(--ri-ink);
      }

      .ri-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.06fr) minmax(330px, 0.94fr);
        align-items: start;
        gap: clamp(28px, 6vw, 86px);
        min-height: calc(100vh - 88px);
        padding: clamp(54px, 6vw, 78px) 0 clamp(56px, 8vw, 108px);
      }

      .ri-kicker {
        margin: 0 0 16px;
        color: var(--ri-orange);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .ri-hero h1,
      .ri-section-head h2,
      .ri-pathfinder h2,
      .ri-submit h2 {
        margin: 0;
        color: var(--ri-ink-deep);
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .ri-hero h1 {
        max-width: 9.4em;
        font-size: clamp(3.4rem, 7.1vw, 7.2rem);
        line-height: 0.84;
      }

      .ri-hero-copy > p:not(.ri-kicker),
      .ri-section-head > p,
      .ri-pathfinder-copy > p,
      .ri-submit-copy > p {
        max-width: 66ch;
        margin: 24px 0 0;
        color: color-mix(in oklch, var(--ri-ink) 78%, var(--ri-blue));
        font-size: clamp(1rem, 1.3vw, 1.14rem);
        line-height: 1.65;
      }

      .ri-hero-actions,
      .ri-submit-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 32px;
      }

      .ri-hero-frame {
        position: relative;
        background: color-mix(in oklch, var(--ri-ink) 16%, transparent);
      }

      .ri-hero-frame::before {
        position: absolute;
        top: -24px;
        right: -18px;
        z-index: -1;
        width: 40%;
        height: 34%;
        border: 1px solid color-mix(in oklch, var(--ri-orange) 68%, transparent);
        background:
          linear-gradient(var(--ri-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--ri-soft-line) 1px, transparent 1px),
          var(--ri-paper-soft);
        background-size: 20px 20px;
        content: "";
      }

      .ri-hero-panel {
        overflow: hidden;
        border-color: var(--ri-line);
        background: var(--ri-paper-soft);
        padding: 0;
      }

      .ri-hero-image {
        display: block;
        width: 100%;
        min-height: 520px;
        object-fit: cover;
      }

      .ri-hero-note {
        display: grid;
        gap: 6px;
        border-top: 1px solid var(--ri-line);
        background: var(--ri-lime);
        padding: 18px;
      }

      .ri-hero-note span,
      .ri-feature-panel span,
      .ri-card-topline,
      .ri-card-index,
      .ri-card-action,
      .ri-disclosure {
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .ri-hero-note strong {
        max-width: 28ch;
        color: var(--ri-ink-deep);
        font-size: clamp(1.35rem, 2.4vw, 2.3rem);
        line-height: 0.98;
        text-transform: uppercase;
      }

      .ri-filter-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 1px;
        border: 1px solid var(--ri-line);
        background: var(--ri-line);
      }

      .ri-filter-strip span {
        flex: 1 1 150px;
        background: var(--ri-paper);
        padding: 14px 16px;
        color: color-mix(in oklch, var(--ri-ink) 78%, var(--ri-blue));
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.11em;
        text-align: center;
        text-transform: uppercase;
      }

      .ri-library,
      .ri-pathfinder,
      .ri-submit {
        padding: clamp(76px, 10vw, 132px) 0 0;
      }

      .ri-section-head {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(280px, 0.54fr);
        gap: clamp(26px, 5vw, 72px);
        align-items: end;
      }

      .ri-section-head h2,
      .ri-pathfinder h2,
      .ri-submit h2 {
        max-width: 11.5em;
        font-size: clamp(2.3rem, 5vw, 5.2rem);
        line-height: 0.88;
      }

      .ri-feature-row {
        display: grid;
        grid-template-columns: minmax(0, 0.8fr) minmax(260px, 0.6fr);
        gap: clamp(18px, 3vw, 36px);
        align-items: stretch;
        margin-top: clamp(34px, 5vw, 58px);
      }

      .ri-feature-frame {
        background: color-mix(in oklch, var(--ri-blue) 22%, transparent);
      }

      .ri-feature-panel {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 18px 20px;
        min-height: 100%;
        border-color: color-mix(in oklch, var(--ri-blue) 45%, transparent);
        background: color-mix(in oklch, var(--ri-blue) 12%, var(--ri-paper));
      }

      .ri-feature-panel svg {
        width: 34px;
        height: 34px;
        color: var(--ri-blue);
      }

      .ri-feature-panel h3 {
        max-width: 18ch;
        margin: 5px 0 0;
        color: var(--ri-ink-deep);
        font-size: clamp(1.4rem, 2vw, 2.15rem);
        font-weight: 900;
        line-height: 0.98;
        text-transform: uppercase;
      }

      .ri-feature-panel p {
        grid-column: 1 / -1;
        max-width: 62ch;
        margin: 0;
        color: color-mix(in oklch, var(--ri-ink) 78%, var(--ri-blue));
        line-height: 1.58;
      }

      .ri-material-strip {
        width: 100%;
        height: 100%;
        min-height: 178px;
        border: 1px solid var(--ri-line);
        object-fit: cover;
      }

      .ri-article-grid {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 1px;
        margin-top: clamp(22px, 4vw, 40px);
        border: 1px solid var(--ri-line);
        background: var(--ri-line);
      }

      .ri-article-card {
        grid-column: span 4;
        min-height: 388px;
        justify-content: space-between;
        border: 0;
        border-radius: 0;
        background: var(--ri-paper);
        color: var(--ri-ink);
        padding: clamp(20px, 2.3vw, 30px);
        transition:
          background-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
          color 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .ri-article-card:nth-child(1),
      .ri-article-card:nth-child(4) {
        grid-column: span 6;
      }

      .ri-article-card:nth-child(7) {
        grid-column: span 8;
      }

      .ri-article-card::before {
        border-radius: 0;
      }

      .ri-article-card:hover {
        background: var(--ri-ink);
        color: var(--ri-paper);
      }

      .ri-card-index {
        color: var(--ri-orange);
      }

      .ri-card-topline {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 26px;
        color: var(--ri-blue);
      }

      .ri-card-topline svg {
        width: 18px;
        height: 18px;
      }

      .ri-article-card[data-accent="lime"] .ri-card-topline {
        color: color-mix(in oklch, var(--ri-lime) 68%, var(--ri-ink));
      }

      .ri-article-card[data-accent="orange"] .ri-card-topline {
        color: var(--ri-orange);
      }

      .ri-article-card[data-accent="ink"] .ri-card-topline {
        color: var(--ri-ink);
      }

      .ri-article-card:hover .ri-card-topline,
      .ri-article-card:hover .ri-card-index,
      .ri-article-card:hover .ri-card-action {
        color: var(--ri-lime);
      }

      .ri-article-card h3 {
        max-width: 14ch;
        margin: 18px 0 0;
        font-size: clamp(1.65rem, 3vw, 3.35rem);
        font-weight: 900;
        line-height: 0.9;
        text-transform: uppercase;
      }

      .ri-article-card p {
        max-width: 54ch;
        margin: 22px 0 0;
        color: color-mix(in oklch, currentColor 74%, transparent);
        font-size: 0.94rem;
        line-height: 1.6;
      }

      .ri-article-card dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        margin: 28px 0 0;
        border: 1px solid color-mix(in oklch, currentColor 24%, transparent);
        background: color-mix(in oklch, currentColor 18%, transparent);
      }

      .ri-article-card dl div {
        background: color-mix(in oklch, var(--ri-paper) 92%, transparent);
        padding: 12px;
      }

      .ri-article-card:hover dl div {
        background: color-mix(in oklch, var(--ri-ink) 88%, var(--ri-blue));
      }

      .ri-article-card dt {
        color: color-mix(in oklch, currentColor 64%, transparent);
        font-size: 0.64rem;
        font-weight: 800;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }

      .ri-article-card dd {
        margin: 5px 0 0;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .ri-card-action {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-top: 28px;
        color: var(--ri-orange);
      }

      .ri-card-action svg {
        width: 16px;
        height: 16px;
      }

      .ri-pathfinder {
        display: grid;
        grid-template-columns: minmax(0, 0.58fr) minmax(0, 1fr);
        gap: clamp(28px, 5vw, 74px);
        align-items: start;
      }

      .ri-lane-grid {
        display: grid;
        gap: 10px;
      }

      .ri-lane-frame {
        background: color-mix(in oklch, var(--ri-ink) 12%, transparent);
      }

      .ri-lane-panel {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 14px 18px;
        border-color: var(--ri-line);
        background: var(--ri-paper);
      }

      .ri-lane-panel svg {
        width: 28px;
        height: 28px;
        color: var(--ri-orange);
      }

      .ri-lane-panel h3 {
        margin: 0;
        color: var(--ri-ink-deep);
        font-size: clamp(1.2rem, 1.8vw, 1.75rem);
        font-weight: 900;
        line-height: 0.95;
        text-transform: uppercase;
      }

      .ri-lane-panel p {
        grid-column: 1 / -1;
        margin: 0;
        color: color-mix(in oklch, var(--ri-ink) 76%, var(--ri-blue));
        line-height: 1.55;
      }

      .ri-submit {
        padding-bottom: clamp(60px, 8vw, 96px);
      }

      .ri-submit {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 0.8fr) minmax(280px, 0.52fr);
        gap: clamp(28px, 5vw, 74px);
        align-items: end;
      }

      .ri-submit::before {
        position: absolute;
        inset: clamp(48px, 8vw, 94px) -8vw auto auto;
        z-index: -1;
        width: min(52vw, 620px);
        height: 220px;
        border: 1px solid color-mix(in oklch, var(--ri-blue) 35%, transparent);
        background:
          linear-gradient(var(--ri-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--ri-soft-line) 1px, transparent 1px),
          color-mix(in oklch, var(--ri-blue) 18%, var(--ri-paper));
        background-size: 24px 24px;
        content: "";
      }

      .ri-submit-actions {
        justify-content: flex-start;
      }

      .ri-disclosure {
        grid-column: 1 / -1;
        margin: 12px 0 0;
        color: color-mix(in oklch, var(--ri-ink) 68%, var(--ri-blue));
        line-height: 1.5;
      }

      @media (max-width: 980px) {
        .ri-nav {
          grid-template-columns: 1fr auto;
        }

        .ri-nav-links {
          display: none;
        }

        .ri-hero,
        .ri-section-head,
        .ri-feature-row,
        .ri-pathfinder,
        .ri-submit {
          grid-template-columns: 1fr;
        }

        .ri-hero {
          min-height: auto;
          padding-top: 42px;
        }

        .ri-hero h1 {
          max-width: 8.7em;
        }

        .ri-hero-image {
          min-height: 420px;
        }

        .ri-article-card,
        .ri-article-card:nth-child(1),
        .ri-article-card:nth-child(4),
        .ri-article-card:nth-child(7) {
          grid-column: span 6;
        }
      }

      @media (max-width: 640px) {
        .ri-nav,
        .ri-hero,
        .ri-filter-strip,
        .ri-library,
        .ri-pathfinder,
        .ri-submit {
          width: min(100% - 24px, 1220px);
        }

        .ri-nav {
          gap: 12px;
        }

        .ri-brand small {
          display: none;
        }

        .ri-nav-button {
          padding-inline: 10px;
        }

        .ri-hero h1 {
          font-size: clamp(3rem, 18vw, 4.9rem);
        }

        .ri-section-head h2,
        .ri-pathfinder h2,
        .ri-submit h2 {
          font-size: clamp(2.35rem, 13vw, 3.9rem);
        }

        .ri-hero-actions,
        .ri-submit-actions {
          flex-direction: column;
        }

        .ri-hero-actions [data-slot="button"],
        .ri-submit-actions [data-slot="button"] {
          width: 100%;
        }

        .ri-hero-image {
          min-height: 340px;
        }

        .ri-feature-panel {
          grid-template-columns: 1fr;
        }

        .ri-article-card,
        .ri-article-card:nth-child(1),
        .ri-article-card:nth-child(4),
        .ri-article-card:nth-child(7) {
          grid-column: 1 / -1;
          min-height: auto;
        }

        .ri-article-card dl {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
