import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Landmark,
  MapPinned,
  Ruler,
  ShieldCheck,
} from "lucide-react";

import {
  FairLendLegalFooter,
  FairLendLegalFooterStyles,
} from "#/components/marketing/fairlend-legal-footer.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const startMultiplexLink = linkOptions({ to: "/start/multiplex" });
const mliSelectLink = linkOptions({
  to: "/cmhc-mli-select-multiplex-financing",
});
const financingGapLink = linkOptions({
  to: "/resources/financing-gap-gta-multiplex-builds",
});
const resourcesLink = linkOptions({ to: "/resources" });
const homeLink = linkOptions({ to: "/" });

const assetBase = "/assets/fairlend-redesign";

const eligibilityChecks = [
  "3-unit conversions, fourplexes and sixplexes and mixed suite projects",
  "Permit-stage or pre-permit files with credible budgets",
  "Owner, builder, broker, or small developer submissions",
];

const capitalPlates = [
  {
    title: "Acquisition and refinance context",
    copy: "Map existing debt, equity, appraised value, and the construction gap before the project gets priced in isolation.",
    icon: Landmark,
  },
  {
    title: "Construction draw structure",
    copy: "Plan capital release around completed work, inspection cadence, evidence, and borrower cash pressure.",
    icon: ClipboardCheck,
  },
  {
    title: "MLI SELECT READINESS",
    copy: "Assemble the affordability, accessibility, and energy detail a strong MLI Select file needs. That gets your file CMHC submission-ready.",
    icon: ShieldCheck,
  },
];

const reviewSteps = [
  {
    label: "01",
    title: "Site and scope",
    copy: "Address, unit plan, zoning path, permit stage, budget, and intended rental outcome.",
  },
  {
    label: "02",
    title: "Capital stack",
    copy: "Existing mortgage, equity available, expected construction cost, contingency, and timing pressure.",
  },
  {
    label: "03",
    title: "Draw plan",
    copy: "Milestones, evidence expectations, review lag, fees, and interest exposure after funds release.",
  },
  {
    label: "04",
    title: "Terms",
    copy: "Rate and fee ranges, term length, conditions to clear, takeout expectations, and which files route to deeper underwriting.",
  },
];

const dossierItems = [
  "Current mortgage statement",
  "Purchase or ownership details",
  "Construction budget",
  "Draw schedule or milestone plan",
  "Architectural drawings or permit material",
  "Projected Rents",
];

const cityBands = [
  "Toronto",
  "Mississauga",
  "Brampton",
  "Vaughan",
  "Markham",
  "Richmond Hill",
  "Oakville",
  "Hamilton",
];

export const Route = createFileRoute("/multiplex-financing-gta")({
  component: MultiplexPage,
  head: () => ({
    meta: [
      { title: "GTA Multiplex Financing | FairLend Mortgage" },
      {
        name: "description",
        content:
          "FairLend helps GTA owners, builders, brokers, and small developers assess multiplex financing, construction draw structure, and MLI Select readiness.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: `${assetBase}/multiplex-brandkit.webp`,
      },
      {
        rel: "preload",
        as: "image",
        href: `${assetBase}/multiplex-warm-blueprint.webp`,
      },
    ],
  }),
});

function MultiplexPage() {
  return (
    <main className="mx-page">
      <MultiplexStyles />
      <FairLendLegalFooterStyles />
      <header className="mx-nav-shell">
        <nav
          aria-label="FairLend full-site navigation"
          className="mx-nav mx-nav-primary"
        >
          <Link
            {...homeLink}
            aria-label="FairLend Mortgage home"
            className="mx-brand"
            preload="intent"
            viewTransition
          >
            <span className="mx-brand-mark">FL</span>
            <span>
              <strong>FairLend</strong>
              <small>Mortgage</small>
            </span>
          </Link>
          <div aria-label="Site pages" className="mx-nav-links">
            <Link to="/construction-draw-financing">Construction draws</Link>
            <Link to="/garden-suite-financing-gta">Garden suites</Link>
            <Link to="/multiplex-financing-gta">Multiplex</Link>
            <Link {...resourcesLink} preload="intent" viewTransition>
              Resources
            </Link>
          </div>
          <Button
            className="mx-nav-cta"
            render={
              <Link {...startMultiplexLink} preload="intent" viewTransition />
            }
          >
            Start review
            <ArrowUpRight aria-hidden />
          </Button>
        </nav>
        <nav
          aria-label="Multiplex page sections"
          className="mx-nav mx-nav-secondary"
        >
          <a href="#fit">Fit</a>
          <a href="#structure">Structure</a>
          <a href="#review">Review</a>
        </nav>
      </header>

      <section aria-labelledby="multiplex-hero-title" className="mx-hero">
        <div className="mx-hero-copy">
          <p className="mx-kicker">GTA multiplex financing dossier</p>
          <h1 id="multiplex-hero-title">
            Capital architecture for serious multiplex builds.
          </h1>
          <p>
            FairLend helps owners, builders, brokers, and small developers
            pressure-test construction budgets and draw timing, size their
            private-capital needs, and confirm MLI Select readiness. Before a
            promising site stalls.
          </p>
          <div className="mx-hero-actions">
            <Button
              className="mx-primary-button"
              render={
                <Link {...startMultiplexLink} preload="intent" viewTransition />
              }
              size="lg"
            >
              Submit a multiplex file
              <ArrowUpRight aria-hidden />
            </Button>
            <Button
              className="mx-outline-button"
              render={
                <Link {...financingGapLink} preload="intent" viewTransition />
              }
              size="lg"
              variant="outline"
            >
              Read financing gap guide
            </Button>
          </div>
        </div>

        <div
          aria-label="Multiplex financing blueprint"
          className="mx-hero-visual"
        >
          <div className="mx-blueprint-board">
            <img
              alt="Warm blueprint study of a multiplex financing website and construction plates"
              src={`${assetBase}/multiplex-warm-blueprint.webp`}
            />
            <div className="mx-board-note">
              <span>Review</span>
              <strong>Budget, draws, permits, debt, rent assumptions</strong>
            </div>
          </div>
          <div aria-label="FairLend review focus" className="mx-hero-ticket">
            <span>Planning meets capital</span>
            <strong>Private capital for well-planned housing projects.</strong>
          </div>
        </div>
      </section>

      <section aria-label="GTA service areas" className="mx-city-strip">
        {cityBands.map((city) => (
          <span key={city}>{city}</span>
        ))}
      </section>

      <section
        aria-labelledby="fit-title"
        className="mx-fit mx-section"
        id="fit"
      >
        <div className="mx-section-head">
          <p className="mx-kicker">Project fit</p>
          <h2 id="fit-title">
            Built for files that need structure, not slogans.
          </h2>
        </div>
        <Frame className="mx-frame">
          <FramePanel className="mx-fit-panel">
            <div>
              <Building2 aria-hidden className="mx-large-icon" />
              <h3>Multiplex paths FairLend can review</h3>
              <p>
                A useful review starts with unit count, municipal path, permit
                status, borrower equity, budget quality, and the draw sequence.
              </p>
            </div>
            <ul className="mx-check-list">
              {eligibilityChecks.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>
      </section>

      <section
        aria-labelledby="structure-title"
        className="mx-section mx-structure"
        id="structure"
      >
        <div className="mx-structure-visual">
          <img
            alt="FairLend blueprint reference with construction financing card system"
            src={`${assetBase}/multiplex-blueprint-plate.webp`}
          />
        </div>
        <div className="mx-structure-copy">
          <p className="mx-kicker">Capital architecture</p>
          <h2 id="structure-title">
            The construction loan is only one part of the file.
          </h2>
          <p>
            Multiplex projects can break when acquisition debt, borrower equity,
            construction budget, contingency, permit timing, and takeout options
            are reviewed separately. FairLend treats the file as one capital
            architecture.
          </p>
          <div className="mx-plate-grid">
            {capitalPlates.map((plate) => {
              const Icon = plate.icon;
              return (
                <Card className="mx-plate-card" key={plate.title}>
                  <Icon aria-hidden />
                  <h3>{plate.title}</h3>
                  <p>{plate.copy}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="review-title" className="mx-review" id="review">
        <div className="mx-review-copy">
          <p className="mx-kicker">Review sequence</p>
          <h2 id="review-title">A practical path from site to terms</h2>
          <p>
            The first conversation should expose the financing constraints fast:
            what is buildable, what is fundable, what needs evidence, and where
            the project is still guessing.
          </p>
        </div>
        <div className="mx-review-steps">
          {reviewSteps.map((step) => (
            <article className="mx-step" key={step.label}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="dossier-title"
        className="mx-dossier mx-section"
      >
        <div className="mx-dossier-card">
          <p className="mx-kicker">Submission docket</p>
          <h2 id="dossier-title">Bring enough context for a real answer.</h2>
          <p>
            FairLend does not need a perfect package to begin review. It does
            need enough signal to distinguish a financeable build from a hopeful
            sketch.
          </p>
          <Button
            className="mx-primary-button"
            render={
              <Link {...startMultiplexLink} preload="intent" viewTransition />
            }
          >
            Open multiplex intake
            <ArrowUpRight aria-hidden />
          </Button>
        </div>
        <div aria-label="Useful documents" className="mx-dossier-grid">
          {dossierItems.map((item) => (
            <div className="mx-dossier-item" key={item}>
              <FileSearch aria-hidden />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="proof-title" className="mx-proof mx-section">
        <div className="mx-proof-image">
          <img
            alt="Construction and planning reference grid from the FairLend brand system"
            src={`${assetBase}/multiplex-builder-grid.webp`}
          />
        </div>
        <div className="mx-proof-copy">
          <p className="mx-kicker">Why early review matters</p>
          <h2 id="proof-title">
            The gap usually appears before the build starts.
          </h2>
          <div className="mx-proof-list">
            <article>
              <Calculator aria-hidden />
              <h3>Budget realism</h3>
              <p>
                Hard costs, soft costs, contingency, and carrying costs need one
                model.
              </p>
            </article>
            <article>
              <Ruler aria-hidden />
              <h3>Draw timing</h3>
              <p>
                Interest discipline depends on when funds are actually released.
              </p>
            </article>
            <article>
              <MapPinned aria-hidden />
              <h3>Local execution</h3>
              <p>
                GTA municipality, site access, scope, and rental thesis all
                matter.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="final-title" className="mx-final">
        <div>
          <p className="mx-kicker">Start with the file</p>
          <h2 id="final-title">
            If the site can become housing, the capital should be planned early.
          </h2>
        </div>
        <div className="mx-final-actions">
          <Button
            className="mx-final-button"
            render={
              <Link {...startMultiplexLink} preload="intent" viewTransition />
            }
            size="lg"
          >
            Start project review
            <ArrowUpRight aria-hidden />
          </Button>
          <Button
            className="mx-final-outline"
            render={<Link {...mliSelectLink} preload="intent" viewTransition />}
            size="lg"
            variant="outline"
          >
            Check MLI Select readiness
          </Button>
        </div>
        <p className="mx-disclosure">
          FairLend pages are informational and do not guarantee financing, CMHC
          qualification, insurance, approval, pricing, or timing.
        </p>
      </section>
      <FairLendLegalFooter />
    </main>
  );
}

function MultiplexStyles() {
  return (
    <style>{`
      .mx-page {
        --mx-paper: #faf5ec;
        --mx-paper-deep: #efe5d5;
        --mx-ink: #073c33;
        --mx-blue: #4d8386;
        --mx-blue-deep: #255f8c;
        --mx-terra: #c9643e;
        --mx-eucalyptus: #d9e7d6;
        --mx-graphite: #262c2a;
        --mx-line: color-mix(in oklch, var(--mx-blue) 42%, transparent);
        --mx-soft-line: color-mix(in oklch, var(--mx-blue) 18%, transparent);
        --mx-shadow: 0 28px 90px color-mix(in oklch, var(--mx-ink) 18%, transparent);
        background:
          linear-gradient(var(--mx-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mx-soft-line) 1px, transparent 1px),
          radial-gradient(circle at 20% 8%, color-mix(in oklch, var(--mx-eucalyptus) 42%, transparent), transparent 28rem),
          var(--mx-paper);
        background-size: 34px 34px, 34px 34px, auto, auto;
        color: var(--mx-ink);
        font-family: Georgia, "Times New Roman", serif;
        min-height: 100vh;
        overflow: hidden;
      }

      .mx-page * {
        box-sizing: border-box;
      }

      .mx-page [data-slot="button"] {
        font-family: Oxanium, sans-serif;
        font-size: 0.86rem;
        letter-spacing: 0.01em;
      }

      .mx-nav,
      .mx-hero,
      .mx-city-strip,
      .mx-section,
      .mx-review,
      .mx-final {
        width: min(1180px, calc(100vw - 32px));
        margin-inline: auto;
      }

      .mx-nav-shell {
        position: sticky;
        top: 0;
        z-index: 50;
        border-bottom: 1px solid var(--mx-line);
        background: color-mix(in oklch, var(--mx-paper) 94%, transparent);
        backdrop-filter: blur(14px);
      }

      .mx-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 28px;
        padding: 18px 0;
      }

      .mx-nav-secondary {
        display: flex;
        justify-content: center;
        gap: clamp(14px, 2.4vw, 34px);
        border-top: 1px solid var(--mx-soft-line);
        padding-block: 10px;
      }

      .mx-brand,
      .mx-nav-links,
      .mx-nav-links a {
        color: inherit;
        text-decoration: none;
      }

      .mx-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: max-content;
      }

      .mx-brand-mark {
        display: grid;
        width: 44px;
        height: 44px;
        place-items: center;
        border: 2px solid var(--mx-ink);
        font-size: 1.2rem;
        font-weight: 700;
        line-height: 1;
      }

      .mx-brand strong,
      .mx-brand small {
        display: block;
        letter-spacing: 0.16em;
      }

      .mx-brand strong {
        font-size: 0.98rem;
      }

      .mx-brand small {
        color: var(--mx-blue-deep);
        font-family: Oxanium, sans-serif;
        font-size: 0.62rem;
      }

      .mx-nav-links {
        display: flex;
        justify-content: center;
        gap: clamp(14px, 2.4vw, 34px);
        font-family: Oxanium, sans-serif;
        font-size: 0.76rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .mx-nav-links a {
        border-bottom: 1px solid transparent;
        padding-bottom: 4px;
      }

      .mx-nav-links a:hover {
        border-color: var(--mx-terra);
        color: var(--mx-terra);
      }

      .mx-nav-secondary a {
        color: var(--mx-blue-deep);
        font-family: Oxanium, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-decoration: none;
        text-transform: uppercase;
      }

      .mx-nav-cta,
      .mx-primary-button,
      .mx-final-button {
        border-color: var(--mx-ink);
        background: var(--mx-ink);
        color: var(--mx-paper);
      }

      .mx-nav-cta:hover,
      .mx-primary-button:hover,
      .mx-final-button:hover {
        background: #0a4d41;
      }

      .mx-outline-button,
      .mx-final-outline {
        border-color: color-mix(in oklch, var(--mx-ink) 48%, transparent);
        background: color-mix(in oklch, var(--mx-paper) 86%, white);
        color: var(--mx-ink);
      }

      .mx-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.04fr) minmax(410px, 0.96fr);
        gap: clamp(28px, 5vw, 72px);
        align-items: center;
        min-height: calc(100vh - 88px);
        padding: clamp(36px, 6vw, 86px) 0 clamp(48px, 7vw, 90px);
        position: relative;
      }

      .mx-hero::before {
        position: absolute;
        top: 8%;
        right: -12vw;
        width: min(30vw, 320px);
        height: 78%;
        border: 1px solid color-mix(in oklch, var(--mx-blue-deep) 42%, transparent);
        background:
          linear-gradient(var(--mx-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mx-soft-line) 1px, transparent 1px),
          color-mix(in oklch, var(--mx-blue-deep) 92%, black);
        background-size: 24px 24px;
        content: "";
        opacity: 0.24;
      }

      .mx-kicker {
        color: var(--mx-terra);
        font-family: Oxanium, sans-serif;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        margin: 0 0 16px;
        text-transform: uppercase;
      }

      .mx-hero h1,
      .mx-section h2,
      .mx-review h2,
      .mx-final h2 {
        color: var(--mx-ink);
        font-weight: 600;
        letter-spacing: 0;
        line-height: 0.98;
        margin: 0;
      }

      .mx-hero h1 {
        font-size: clamp(3.3rem, 6.2vw, 6.8rem);
        max-width: 9em;
        overflow-wrap: normal;
        word-break: normal;
      }

      .mx-hero-copy > p:not(.mx-kicker),
      .mx-structure-copy > p,
      .mx-review-copy > p,
      .mx-dossier-card > p,
      .mx-proof-copy > p {
        color: color-mix(in oklch, var(--mx-graphite) 82%, var(--mx-blue));
        font-family: Oxanium, sans-serif;
        font-size: clamp(1rem, 1.4vw, 1.17rem);
        line-height: 1.65;
        margin: 24px 0 0;
        max-width: 64ch;
      }

      .mx-hero-actions,
      .mx-final-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 32px;
      }

      .mx-hero-visual {
        position: relative;
        z-index: 1;
      }

      .mx-blueprint-board {
        background: var(--mx-ink);
        border: 1px solid color-mix(in oklch, var(--mx-ink) 48%, transparent);
        box-shadow: var(--mx-shadow);
        padding: clamp(10px, 1.8vw, 18px);
        transform: rotate(1deg);
      }

      .mx-blueprint-board img,
      .mx-structure-visual img,
      .mx-proof-image img {
        display: block;
        height: auto;
        object-fit: cover;
        width: 100%;
      }

      .mx-blueprint-board img {
        aspect-ratio: 1.12;
        filter: saturate(0.96) contrast(1.03);
      }

      .mx-board-note {
        align-items: start;
        background: var(--mx-paper);
        bottom: clamp(18px, 3vw, 34px);
        color: var(--mx-ink);
        display: grid;
        gap: 4px;
        max-width: 260px;
        padding: 14px 16px;
        position: absolute;
        right: clamp(18px, 3vw, 34px);
      }

      .mx-board-note span,
      .mx-hero-ticket span {
        color: var(--mx-terra);
        font-family: Oxanium, sans-serif;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .mx-board-note strong,
      .mx-hero-ticket strong {
        font-family: Oxanium, sans-serif;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      .mx-hero-ticket {
        background: var(--mx-terra);
        bottom: -24px;
        box-shadow: 0 20px 50px color-mix(in oklch, var(--mx-terra) 28%, transparent);
        color: var(--mx-paper);
        display: grid;
        gap: 8px;
        left: -20px;
        max-width: 290px;
        padding: 22px;
        position: absolute;
      }

      .mx-hero-ticket span {
        color: color-mix(in oklch, var(--mx-paper) 86%, white);
      }

      .mx-city-strip {
        border-block: 1px solid var(--mx-line);
        display: grid;
        grid-template-columns: repeat(8, minmax(max-content, 1fr));
        margin-bottom: clamp(70px, 10vw, 132px);
      }

      .mx-city-strip span {
        color: color-mix(in oklch, var(--mx-blue-deep) 76%, var(--mx-ink));
        font-family: Oxanium, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 18px 12px;
        text-align: center;
        text-transform: uppercase;
      }

      .mx-city-strip span + span {
        border-inline-start: 1px solid var(--mx-soft-line);
      }

      .mx-section,
      .mx-review {
        margin-bottom: clamp(80px, 12vw, 150px);
      }

      .mx-section-head {
        display: grid;
        gap: 10px;
        margin-bottom: 28px;
        max-width: 720px;
      }

      .mx-section h2,
      .mx-review h2,
      .mx-final h2 {
        font-size: clamp(2.25rem, 5vw, 5.7rem);
        max-width: 10em;
      }

      .mx-frame {
        background: color-mix(in oklch, var(--mx-blue) 14%, var(--mx-paper));
        border-radius: 8px;
        padding: 6px;
      }

      .mx-fit-panel {
        background:
          linear-gradient(var(--mx-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mx-soft-line) 1px, transparent 1px),
          color-mix(in oklch, var(--mx-paper) 92%, white);
        background-size: 28px 28px;
        border-color: var(--mx-line);
        border-radius: 6px;
        display: grid;
        grid-template-columns: 0.92fr 1.08fr;
        gap: clamp(24px, 5vw, 68px);
        padding: clamp(24px, 5vw, 58px);
      }

      .mx-large-icon {
        color: var(--mx-blue-deep);
        height: 54px;
        margin-bottom: 26px;
        width: 54px;
      }

      .mx-fit-panel h3,
      .mx-plate-card h3,
      .mx-step h3,
      .mx-proof-list h3 {
        color: var(--mx-ink);
        font-family: Oxanium, sans-serif;
        font-size: 1rem;
        letter-spacing: 0.02em;
        margin: 0;
        text-transform: uppercase;
      }

      .mx-fit-panel p,
      .mx-plate-card p,
      .mx-step p,
      .mx-proof-list p,
      .mx-disclosure {
        color: color-mix(in oklch, var(--mx-graphite) 74%, var(--mx-blue));
        font-family: Oxanium, sans-serif;
        line-height: 1.6;
        margin: 12px 0 0;
      }

      .mx-check-list {
        display: grid;
        gap: 14px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .mx-check-list li {
        align-items: center;
        background: color-mix(in oklch, var(--mx-eucalyptus) 48%, var(--mx-paper));
        border: 1px solid var(--mx-soft-line);
        display: flex;
        gap: 12px;
        min-height: 58px;
        padding: 14px;
      }

      .mx-check-list svg {
        color: var(--mx-ink);
        flex: 0 0 auto;
      }

      .mx-check-list span {
        font-family: Oxanium, sans-serif;
        font-size: 0.93rem;
      }

      .mx-structure,
      .mx-proof {
        align-items: center;
        display: grid;
        gap: clamp(28px, 6vw, 74px);
        grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
      }

      .mx-structure-visual,
      .mx-proof-image {
        border: 1px solid var(--mx-line);
        background: var(--mx-blue-deep);
        box-shadow: var(--mx-shadow);
        padding: 10px;
      }

      .mx-structure-visual img,
      .mx-proof-image img {
        aspect-ratio: 1.1;
      }

      .mx-plate-grid {
        display: grid;
        gap: 12px;
        margin-top: 28px;
      }

      .mx-plate-card {
        background: color-mix(in oklch, var(--mx-paper) 88%, white);
        border-color: var(--mx-line);
        border-radius: 8px;
        display: grid;
        gap: 10px;
        padding: 20px;
      }

      .mx-plate-card svg {
        color: var(--mx-terra);
        height: 28px;
        width: 28px;
      }

      .mx-review {
        background: var(--mx-ink);
        color: var(--mx-paper);
        display: grid;
        gap: clamp(32px, 6vw, 78px);
        grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr);
        padding: clamp(30px, 5vw, 64px);
      }

      .mx-review h2,
      .mx-review .mx-kicker {
        color: var(--mx-paper);
      }

      .mx-review-copy > p {
        color: color-mix(in oklch, var(--mx-paper) 78%, var(--mx-eucalyptus));
      }

      .mx-review-steps {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        background: color-mix(in oklch, var(--mx-paper) 32%, transparent);
        border: 1px solid color-mix(in oklch, var(--mx-paper) 32%, transparent);
      }

      .mx-step {
        background:
          linear-gradient(color-mix(in oklch, var(--mx-paper) 10%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in oklch, var(--mx-paper) 10%, transparent) 1px, transparent 1px),
          var(--mx-ink);
        background-size: 22px 22px;
        min-height: 230px;
        padding: clamp(18px, 3vw, 32px);
      }

      .mx-step span {
        color: var(--mx-terra);
        display: block;
        font-family: Oxanium, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        margin-bottom: 58px;
      }

      .mx-step h3 {
        color: var(--mx-paper);
      }

      .mx-step p {
        color: color-mix(in oklch, var(--mx-paper) 76%, var(--mx-eucalyptus));
      }

      .mx-dossier {
        display: grid;
        grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.18fr);
        gap: clamp(28px, 6vw, 74px);
      }

      .mx-dossier-card {
        align-self: start;
        background: var(--mx-terra);
        color: var(--mx-paper);
        padding: clamp(26px, 5vw, 54px);
      }

      .mx-dossier-card .mx-kicker,
      .mx-dossier-card h2,
      .mx-dossier-card p {
        color: inherit;
      }

      .mx-dossier-card h2 {
        font-size: clamp(2rem, 4vw, 4.8rem);
      }

      .mx-dossier-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .mx-dossier-item {
        align-items: end;
        background: color-mix(in oklch, var(--mx-paper) 90%, white);
        border: 1px solid var(--mx-line);
        display: grid;
        min-height: 170px;
        padding: 20px;
      }

      .mx-dossier-item svg {
        color: var(--mx-blue-deep);
      }

      .mx-dossier-item span {
        font-family: Oxanium, sans-serif;
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .mx-proof {
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      }

      .mx-proof-list {
        display: grid;
        gap: 12px;
        margin-top: 30px;
      }

      .mx-proof-list article {
        border: 1px solid var(--mx-line);
        display: grid;
        gap: 8px;
        padding: 18px;
      }

      .mx-proof-list svg {
        color: var(--mx-terra);
      }

      .mx-final {
        background:
          linear-gradient(var(--mx-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mx-soft-line) 1px, transparent 1px),
          var(--mx-graphite);
        background-size: 28px 28px;
        color: var(--mx-paper);
        margin-bottom: 24px;
        padding: clamp(30px, 6vw, 76px);
      }

      .mx-final .mx-kicker,
      .mx-final h2,
      .mx-final .mx-disclosure {
        color: var(--mx-paper);
      }

      .mx-final h2 {
        max-width: 11em;
      }

      .mx-final-outline {
        border-color: color-mix(in oklch, var(--mx-paper) 48%, transparent);
        background: transparent;
        color: var(--mx-paper);
      }

      .mx-disclosure {
        border-top: 1px solid color-mix(in oklch, var(--mx-paper) 22%, transparent);
        margin-top: clamp(30px, 5vw, 62px);
        max-width: 76ch;
        padding-top: 18px;
      }

      @media (max-width: 940px) {
        .mx-nav-primary {
          grid-template-columns: 1fr auto;
        }

        .mx-nav-primary .mx-nav-links {
          display: none;
        }

        .mx-hero,
        .mx-fit-panel,
        .mx-structure,
        .mx-review,
        .mx-dossier,
        .mx-proof {
          grid-template-columns: 1fr;
        }

        .mx-hero {
          min-height: auto;
        }

        .mx-hero h1 {
          font-size: clamp(3rem, 11.5vw, 5.6rem);
        }

        .mx-city-strip {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .mx-review-steps,
        .mx-dossier-grid {
          grid-template-columns: 1fr;
        }

        .mx-structure-visual {
          order: 2;
        }
      }

      @media (max-width: 620px) {
        .mx-nav,
        .mx-hero,
        .mx-city-strip,
        .mx-section,
        .mx-review,
        .mx-final {
          width: min(100vw - 20px, 1180px);
        }

        .mx-nav {
          gap: 12px;
        }

        .mx-brand-mark {
          height: 38px;
          width: 38px;
        }

        .mx-brand strong {
          font-size: 0.82rem;
        }

        .mx-nav-cta {
          min-width: 44px;
          padding-inline: 10px;
        }

        .mx-hero-actions,
        .mx-final-actions {
          align-items: stretch;
          flex-direction: column;
        }

        .mx-hero-actions a,
        .mx-final-actions a {
          width: 100%;
        }

        .mx-hero-ticket {
          bottom: -18px;
          left: 10px;
          max-width: calc(100% - 20px);
        }

        .mx-board-note {
          display: none;
        }

        .mx-city-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mx-fit-panel,
        .mx-review,
        .mx-dossier-card,
        .mx-final {
          padding: 24px;
        }

        .mx-dossier-item {
          min-height: 132px;
        }
      }
    `}</style>
  );
}
