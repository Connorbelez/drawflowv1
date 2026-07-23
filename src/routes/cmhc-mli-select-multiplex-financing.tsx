import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  ClipboardCheck,
  FileSearch,
  Gauge,
  Landmark,
  Leaf,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const assetBase = "/assets/fairlend-redesign";
const heroAsset = `${assetBase}/cmhc-mli-hero.webp`;
const underwritingAsset = `${assetBase}/cmhc-mli-underwriting-board.webp`;
const builderGridAsset = `${assetBase}/cmhc-mli-builder-grid.webp`;
const blueprintAsset = `${assetBase}/cmhc-mli-blueprint-system.webp`;

const homeLink = linkOptions({ to: "/" });
const startMultiplexLink = linkOptions({ to: "/start/multiplex" });
const multiplexLink = linkOptions({ to: "/multiplex-financing-gta" });
const contactLink = linkOptions({ to: "/contact" });

const fitSignals = [
  {
    title: "Affordability lane",
    copy: "Rental mix, intended rents, and affordability term need to be legible before the file reaches deeper underwriting.",
    icon: Landmark,
  },
  {
    title: "Energy lane",
    copy: "The package should separate known design decisions from assumptions still waiting on consultants or permits.",
    icon: Leaf,
  },
  {
    title: "Accessibility lane",
    copy: "Universal-design commitments, unit mix, and physical scope must be tracked as project requirements, not marketing notes.",
    icon: ShieldCheck,
  },
];

const reviewColumns = [
  {
    label: "01",
    title: "Project file",
    items: [
      "Address and ownership",
      "Existing debt and equity",
      "Unit plan and rental intent",
      "Permit and consultant stage",
    ],
  },
  {
    label: "02",
    title: "Select readiness",
    items: [
      "Affordability assumptions",
      "Energy-performance path",
      "Accessibility commitments",
      "CMHC documentation gaps",
    ],
  },
  {
    label: "03",
    title: "Capital structure",
    items: [
      "Construction budget",
      "Working-capital pressure",
      "Draw release cadence",
      "Takeout and refinance path",
    ],
  },
];

const drawPrinciples = [
  "Reimbursement remains the operating model: completed work, evidence, review, approval, then release.",
  "Interest exposure starts after funds are released, so timing discipline matters as much as headline rate.",
  "A Select-ready file still needs a construction draw plan that respects site reality and lender policy.",
];

const dossierItems = [
  "Architectural drawings",
  "Budget and contingency",
  "Rent assumptions",
  "Energy pathway",
  "Accessibility notes",
  "Existing mortgage",
  "Permit status",
  "Draw schedule",
];

const pageSections = [
  ["Readiness", "#readiness"],
  ["Select lanes", "#select-lanes"],
  ["Draw plan", "#draw-plan"],
  ["Dossier", "#dossier"],
];

export const Route = createFileRoute("/cmhc-mli-select-multiplex-financing")({
  component: MliSelectPage,
  head: () => ({
    meta: [
      { title: "CMHC MLI Select Multiplex Financing | Fairlend Capital" },
      {
        name: "description",
        content:
          "Fairlend helps GTA multiplex owners, builders, brokers, and small developers organize CMHC MLI Select readiness, construction budgets, and reimbursement draw planning.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: heroAsset },
      { rel: "preload", as: "image", href: underwritingAsset },
    ],
  }),
});

function MliSelectPage() {
  return (
    <main className="mli-page">
      <MliStyles />
      <MliNav />
      <HeroSection />
      <ReadinessSection />
      <SelectLanesSection />
      <DrawPlanSection />
      <DossierSection />
      <FinalCtaSection />
    </main>
  );
}

function MliNav() {
  return (
    <header className="mli-nav-shell">
      <nav aria-label="CMHC MLI Select navigation" className="mli-nav">
        <Link
          {...homeLink}
          aria-label="Fairlend Capital home"
          className="mli-brand"
          preload="intent"
          viewTransition
        >
          <span className="mli-brand-mark">F</span>
          <span>
            <strong>Fairlend</strong>
            <small>Capital</small>
          </span>
        </Link>
        <div className="mli-nav-links">
          {pageSections.map(([label, href]) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </div>
        <Button
          className="mli-nav-cta"
          render={
            <Link {...startMultiplexLink} preload="intent" viewTransition />
          }
          size="sm"
        >
          Start file review
          <ArrowUpRight aria-hidden />
        </Button>
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <section aria-labelledby="mli-hero-title" className="mli-hero">
      <div className="mli-hero-visual">
        <img
          alt="Fairlend institutional brand board with multiplex architecture, blueprint systems, and capital planning references."
          height={1086}
          src={heroAsset}
          width={1448}
        />
        <aside aria-label="Review scope" className="mli-hero-stamp">
          <span>MLI Select dossier</span>
          <strong>Affordability, energy, accessibility, draws.</strong>
        </aside>
      </div>
      <div className="mli-hero-copy">
        <p className="mli-kicker">CMHC MLI Select, multiplex financing</p>
        <h1 id="mli-hero-title">Package the Select file.</h1>
        <p>
          Fairlend helps GTA owners, builders, brokers, and small developers
          organize MLI Select readiness beside the construction budget, capital
          stack, and reimbursement draw plan.
        </p>
        <div className="mli-actions">
          <Button
            className="mli-primary-button"
            render={
              <Link {...startMultiplexLink} preload="intent" viewTransition />
            }
            size="lg"
          >
            Package a Select file
            <ArrowUpRight aria-hidden />
          </Button>
          <Button
            className="mli-outline-button"
            render={<Link {...multiplexLink} preload="intent" viewTransition />}
            size="lg"
            variant="outline"
          >
            View multiplex financing
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReadinessSection() {
  return (
    <section
      aria-labelledby="readiness-title"
      className="mli-section mli-readiness"
      id="readiness"
    >
      <div className="mli-section-copy">
        <p className="mli-kicker">Readiness is a file condition</p>
        <h2 id="readiness-title">
          CMHC alignment cannot sit outside the capital plan.
        </h2>
      </div>
      <Frame className="mli-frame">
        <FramePanel className="mli-readiness-panel">
          <div className="mli-readiness-image">
            <img
              alt="Blueprint-style underwriting board for multiplex financing review."
              height={560}
              src={underwritingAsset}
              width={760}
            />
          </div>
          <div className="mli-readiness-copy">
            <Gauge aria-hidden />
            <h3>The first review should expose constraints early.</h3>
            <p>
              Select potential is useful only when the project can also carry
              construction timing, budget confidence, borrower liquidity, and a
              draw sequence that does not break the site.
            </p>
          </div>
        </FramePanel>
      </Frame>
    </section>
  );
}

function SelectLanesSection() {
  return (
    <section
      aria-labelledby="select-lanes-title"
      className="mli-section mli-lanes"
      id="select-lanes"
    >
      <div className="mli-lanes-head">
        <p className="mli-kicker">Select lanes</p>
        <h2 id="select-lanes-title">Three commitments need evidence.</h2>
        <p>
          Fairlend does not treat MLI Select as a label. The file needs clear
          assumptions, missing items, and owner decisions in each lane.
        </p>
      </div>
      <div className="mli-lane-grid">
        {fitSignals.map((signal) => {
          const Icon = signal.icon;
          return (
            <Card className="mli-lane-card" key={signal.title}>
              <Icon aria-hidden />
              <h3>{signal.title}</h3>
              <p>{signal.copy}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function DrawPlanSection() {
  return (
    <section
      aria-labelledby="draw-plan-title"
      className="mli-section mli-draw"
      id="draw-plan"
    >
      <div className="mli-draw-copy">
        <p className="mli-kicker">Construction draw discipline</p>
        <h2 id="draw-plan-title">
          The insured path still needs working capital.
        </h2>
        <p>
          MLI Select readiness does not remove the construction cash problem.
          The project still needs a reimbursement plan built around completed
          work, evidence, review lag, and release timing.
        </p>
      </div>
      <div className="mli-draw-board">
        {drawPrinciples.map((principle, index) => (
          <article className="mli-draw-row" key={principle}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{principle}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DossierSection() {
  return (
    <section
      aria-labelledby="dossier-title"
      className="mli-section mli-dossier"
      id="dossier"
    >
      <div className="mli-dossier-copy">
        <p className="mli-kicker">Submission dossier</p>
        <h2 id="dossier-title">Bring the material that changes the answer.</h2>
        <p>
          A useful first review separates known facts from open questions. That
          lets Fairlend identify whether the file needs private capital,
          documentation cleanup, or a different construction sequence.
        </p>
      </div>
      <ul aria-label="Useful file material" className="mli-dossier-grid">
        {dossierItems.map((item) => (
          <li className="mli-dossier-item" key={item}>
            <FileSearch aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mli-dossier-image">
        <img
          alt="Fairlend builder and development reference grid for housing finance."
          height={700}
          src={builderGridAsset}
          width={900}
        />
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section aria-labelledby="final-title" className="mli-final">
      <div aria-hidden className="mli-final-art">
        <img alt="" height={680} src={blueprintAsset} width={900} />
      </div>
      <div className="mli-final-copy">
        <p className="mli-kicker">Start with the file</p>
        <h2 id="final-title">
          If the project is trying to qualify, package it before pricing.
        </h2>
        <p>
          Send the address, ownership context, intended unit mix, budget,
          existing debt, and known Select assumptions. Fairlend will route the
          review to the right capital conversation.
        </p>
      </div>
      <ul aria-label="Review sequence" className="mli-review-columns">
        {reviewColumns.map((column) => (
          <li className="mli-review-column" key={column.title}>
            <span>{column.label}</span>
            <h3>{column.title}</h3>
            <ul>
              {column.items.map((item) => (
                <li key={item}>
                  <BadgeCheck aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mli-final-actions">
        <Button
          className="mli-primary-button"
          render={
            <Link {...startMultiplexLink} preload="intent" viewTransition />
          }
          size="lg"
        >
          Open file intake
          <ClipboardCheck aria-hidden />
        </Button>
        <Button
          className="mli-outline-button"
          render={<Link {...contactLink} preload="intent" viewTransition />}
          size="lg"
          variant="outline"
        >
          Talk to Fairlend
          <TimerReset aria-hidden />
        </Button>
      </div>
      <p className="mli-disclosure">
        Fairlend pages are informational and do not guarantee financing, CMHC
        qualification, mortgage insurance, approval, pricing, or timing.
      </p>
    </section>
  );
}

function MliStyles() {
  return (
    <style>{`
      .mli-page {
        --mli-limestone: oklch(0.962 0.022 84);
        --mli-limestone-deep: oklch(0.904 0.033 81);
        --mli-midnight: oklch(0.236 0.071 174);
        --mli-midnight-2: oklch(0.302 0.079 171);
        --mli-blue: oklch(0.452 0.079 238);
        --mli-blue-dark: oklch(0.354 0.077 238);
        --mli-copper: oklch(0.58 0.155 45);
        --mli-mint: oklch(0.87 0.047 145);
        --mli-slate: oklch(0.42 0.018 235);
        --mli-ink: oklch(0.19 0.043 174);
        --mli-line: oklch(0.67 0.031 192 / 46%);
        --mli-soft-line: oklch(0.67 0.031 192 / 20%);
        --mli-shadow: 0 26px 80px oklch(0.19 0.043 174 / 18%);
        background:
          linear-gradient(var(--mli-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mli-soft-line) 1px, transparent 1px),
          radial-gradient(circle at 86% 6%, oklch(0.87 0.047 145 / 40%), transparent 28rem),
          var(--mli-limestone);
        background-size: 30px 30px, 30px 30px, auto, auto;
        color: var(--mli-ink);
        font-family: "Oxanium Variable", Oxanium, sans-serif;
        min-height: 100vh;
        overflow: hidden;
      }

      .mli-page * {
        box-sizing: border-box;
      }

      .mli-nav,
      .mli-hero,
      .mli-section,
      .mli-final {
        width: min(1210px, calc(100vw - 32px));
        margin-inline: auto;
      }

      .mli-nav-shell {
        border-bottom: 1px solid var(--mli-line);
        background: oklch(0.962 0.022 84 / 88%);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .mli-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: clamp(16px, 3vw, 40px);
        padding: 15px 0;
      }

      .mli-brand,
      .mli-nav a {
        color: inherit;
        text-decoration: none;
      }

      .mli-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }

      .mli-brand-mark {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 3px solid var(--mli-midnight);
        color: var(--mli-midnight);
        font-size: 1.35rem;
        font-weight: 800;
        line-height: 1;
      }

      .mli-brand strong,
      .mli-brand small {
        display: block;
        line-height: 1;
        text-transform: uppercase;
      }

      .mli-brand strong {
        color: var(--mli-midnight);
        font-size: 0.95rem;
        font-weight: 800;
        letter-spacing: 0.16em;
      }

      .mli-brand small {
        color: var(--mli-blue);
        font-size: 0.61rem;
        font-weight: 700;
        letter-spacing: 0.36em;
        margin-top: 5px;
      }

      .mli-nav-links {
        display: flex;
        justify-content: center;
        gap: clamp(12px, 2.2vw, 30px);
      }

      .mli-nav-links a {
        border-bottom: 1px solid transparent;
        color: var(--mli-slate);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding-block: 7px 5px;
        text-transform: uppercase;
      }

      .mli-nav-links a:hover {
        border-color: var(--mli-copper);
        color: var(--mli-copper);
      }

      .mli-page [data-slot="button"] {
        border-radius: 6px;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      .mli-nav-cta,
      .mli-primary-button {
        border-color: var(--mli-copper);
        background: var(--mli-copper);
        color: var(--mli-limestone);
      }

      .mli-nav-cta:hover,
      .mli-primary-button:hover {
        background: oklch(0.52 0.145 45);
      }

      .mli-outline-button {
        border-color: oklch(0.236 0.071 174 / 46%);
        background: oklch(0.977 0.018 84);
        color: var(--mli-midnight);
      }

      .mli-outline-button:hover {
        background: oklch(0.93 0.026 84);
      }

      .mli-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.06fr) minmax(360px, 0.94fr);
        gap: clamp(28px, 5.6vw, 82px);
        align-items: center;
        min-height: calc(100vh - 74px);
        padding-block: clamp(44px, 7vw, 96px);
        position: relative;
      }

      .mli-hero::after {
        position: absolute;
        right: -13vw;
        bottom: 8%;
        width: min(34vw, 390px);
        height: 56%;
        border: 1px solid oklch(0.452 0.079 238 / 38%);
        background:
          linear-gradient(var(--mli-soft-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--mli-soft-line) 1px, transparent 1px),
          var(--mli-blue-dark);
        background-size: 22px 22px;
        content: "";
        opacity: 0.26;
      }

      .mli-hero-visual {
        position: relative;
        z-index: 1;
      }

      .mli-hero-visual img,
      .mli-readiness-image img,
      .mli-dossier-image img,
      .mli-final-art img {
        display: block;
        height: auto;
        object-fit: cover;
        width: 100%;
      }

      .mli-hero-visual img {
        aspect-ratio: 1.08;
        border: 1px solid var(--mli-line);
        box-shadow: var(--mli-shadow);
        filter: saturate(0.94) contrast(1.04);
      }

      .mli-hero-stamp {
        position: absolute;
        right: clamp(14px, 3vw, 30px);
        bottom: clamp(14px, 3vw, 30px);
        max-width: 270px;
        border: 1px solid oklch(0.904 0.033 81 / 82%);
        background: var(--mli-midnight);
        color: var(--mli-limestone);
        padding: 18px;
      }

      .mli-hero-stamp span,
      .mli-kicker {
        color: var(--mli-copper);
        font-size: 0.73rem;
        font-weight: 800;
        letter-spacing: 0.15em;
        line-height: 1.25;
        text-transform: uppercase;
      }

      .mli-hero-stamp span,
      .mli-hero-stamp strong {
        display: block;
      }

      .mli-hero-stamp strong {
        color: var(--mli-limestone);
        font-size: 0.95rem;
        line-height: 1.35;
        margin-top: 8px;
      }

      .mli-hero-copy {
        position: relative;
        z-index: 1;
      }

      .mli-kicker {
        margin: 0 0 16px;
      }

      .mli-hero h1,
      .mli-section h2,
      .mli-final h2 {
        color: var(--mli-midnight);
        font-size: clamp(3rem, 6.8vw, 7.3rem);
        font-weight: 800;
        letter-spacing: 0;
        line-height: 0.88;
        margin: 0;
        max-width: 8.5em;
        text-transform: uppercase;
      }

      .mli-hero-copy > p:not(.mli-kicker),
      .mli-lanes-head > p,
      .mli-draw-copy > p,
      .mli-dossier-copy > p,
      .mli-final-copy > p,
      .mli-readiness-copy > p {
        color: oklch(0.32 0.031 183);
        font-size: clamp(1rem, 1.2vw, 1.13rem);
        line-height: 1.62;
        max-width: 65ch;
      }

      .mli-hero-copy > p:not(.mli-kicker) {
        margin: 26px 0 0;
        max-width: 58ch;
      }

      .mli-actions,
      .mli-final-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 32px;
      }

      .mli-section {
        margin-bottom: clamp(84px, 12vw, 154px);
      }

      .mli-section-copy {
        margin-bottom: 26px;
        max-width: 850px;
      }

      .mli-section h2,
      .mli-final h2 {
        font-size: clamp(2.35rem, 5.1vw, 5.9rem);
        max-width: 9.8em;
      }

      .mli-frame {
        border-radius: 8px;
        background: oklch(0.67 0.031 192 / 26%);
        padding: 6px;
      }

      .mli-readiness-panel {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
        gap: clamp(24px, 4vw, 58px);
        align-items: stretch;
        border-color: var(--mli-line);
        border-radius: 6px;
        background: oklch(0.977 0.018 84);
        padding: clamp(18px, 3vw, 34px);
      }

      .mli-readiness-image img {
        aspect-ratio: 1.45;
        min-height: 100%;
        border: 1px solid var(--mli-soft-line);
      }

      .mli-readiness-copy {
        align-self: center;
        padding: clamp(8px, 2vw, 18px);
      }

      .mli-readiness-copy svg {
        color: var(--mli-blue);
        width: 54px;
        height: 54px;
        margin-bottom: 24px;
      }

      .mli-readiness-copy h3,
      .mli-lane-card h3,
      .mli-review-column h3 {
        color: var(--mli-midnight);
        font-size: clamp(1.35rem, 2.1vw, 2rem);
        line-height: 1.05;
        margin: 0;
        text-transform: uppercase;
      }

      .mli-readiness-copy p {
        margin: 18px 0 0;
      }

      .mli-lanes {
        display: grid;
        grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr);
        gap: clamp(28px, 5vw, 72px);
        align-items: start;
      }

      .mli-lanes-head {
        position: sticky;
        top: 112px;
      }

      .mli-lanes-head p {
        margin: 22px 0 0;
      }

      .mli-lane-grid {
        display: grid;
        gap: 14px;
      }

      .mli-lane-card {
        display: grid;
        grid-template-columns: auto minmax(0, 0.72fr) minmax(240px, 1fr);
        gap: clamp(16px, 3vw, 34px);
        align-items: center;
        border-color: var(--mli-line);
        border-radius: 8px;
        background: oklch(0.977 0.018 84);
        padding: clamp(18px, 3vw, 30px);
      }

      .mli-lane-card svg {
        color: var(--mli-copper);
        width: 38px;
        height: 38px;
      }

      .mli-lane-card p {
        color: oklch(0.36 0.028 186);
        line-height: 1.55;
        margin: 0;
      }

      .mli-draw {
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(340px, 1.05fr);
        gap: clamp(30px, 5vw, 76px);
        align-items: end;
      }

      .mli-draw-copy p {
        margin: 24px 0 0;
      }

      .mli-draw-board {
        border-block: 1px solid var(--mli-line);
      }

      .mli-draw-row {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        gap: clamp(18px, 3vw, 38px);
        align-items: start;
        padding: clamp(22px, 3vw, 34px) 0;
      }

      .mli-draw-row + .mli-draw-row {
        border-top: 1px solid var(--mli-soft-line);
      }

      .mli-draw-row span {
        color: var(--mli-copper);
        font-size: clamp(1.6rem, 3vw, 3rem);
        font-weight: 800;
        line-height: 1;
      }

      .mli-draw-row p {
        color: var(--mli-midnight);
        font-size: clamp(1.04rem, 1.55vw, 1.34rem);
        line-height: 1.45;
        margin: 0;
      }

      .mli-dossier {
        display: grid;
        grid-template-columns: minmax(280px, 0.72fr) minmax(280px, 0.72fr) minmax(260px, 0.56fr);
        gap: clamp(18px, 3vw, 34px);
        align-items: stretch;
      }

      .mli-dossier-copy {
        align-self: center;
      }

      .mli-dossier-copy p {
        margin: 22px 0 0;
      }

      .mli-dossier-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        border: 1px solid var(--mli-line);
        background: oklch(0.977 0.018 84);
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .mli-dossier-item {
        display: grid;
        gap: 12px;
        min-height: 118px;
        align-content: center;
        border-bottom: 1px solid var(--mli-soft-line);
        color: var(--mli-midnight);
        padding: 18px;
      }

      .mli-dossier-item:nth-child(odd) {
        border-right: 1px solid var(--mli-soft-line);
      }

      .mli-dossier-item:nth-last-child(-n + 2) {
        border-bottom: 0;
      }

      .mli-dossier-item svg {
        color: var(--mli-blue);
        width: 24px;
        height: 24px;
      }

      .mli-dossier-item span {
        font-size: 0.9rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .mli-dossier-image {
        min-height: 100%;
        overflow: hidden;
      }

      .mli-dossier-image img {
        height: 100%;
        min-height: 430px;
        border: 1px solid var(--mli-line);
        filter: saturate(0.9) contrast(1.05);
      }

      .mli-final {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 0.78fr) minmax(360px, 1.22fr);
        gap: clamp(28px, 5vw, 72px);
        align-items: end;
        padding-block: clamp(76px, 11vw, 140px) 54px;
      }

      .mli-final-art {
        position: absolute;
        inset: 0 auto auto 42%;
        z-index: 0;
        width: min(58vw, 680px);
        opacity: 0.16;
        pointer-events: none;
      }

      .mli-final-copy,
      .mli-review-columns,
      .mli-final-actions,
      .mli-disclosure {
        position: relative;
        z-index: 1;
      }

      .mli-final-copy p {
        margin: 24px 0 0;
      }

      .mli-review-columns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1px;
        border: 1px solid var(--mli-line);
        background: var(--mli-line);
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .mli-review-column {
        background: oklch(0.977 0.018 84 / 94%);
        padding: clamp(18px, 2.3vw, 28px);
      }

      .mli-review-column > span {
        display: block;
        color: var(--mli-copper);
        font-size: 1.6rem;
        font-weight: 800;
        margin-bottom: 16px;
      }

      .mli-review-column ul {
        display: grid;
        gap: 12px;
        list-style: none;
        margin: 22px 0 0;
        padding: 0;
      }

      .mli-review-column li {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 9px;
        align-items: center;
        color: oklch(0.34 0.033 184);
        font-size: 0.86rem;
        line-height: 1.35;
      }

      .mli-review-column li svg {
        color: var(--mli-blue);
        width: 16px;
        height: 16px;
      }

      .mli-final-actions {
        grid-column: 1 / -1;
        margin-top: 12px;
      }

      .mli-disclosure {
        grid-column: 1 / -1;
        border-top: 1px solid var(--mli-line);
        color: var(--mli-slate);
        font-size: 0.76rem;
        line-height: 1.55;
        margin: 32px 0 0;
        padding-top: 18px;
      }

      @media (max-width: 980px) {
        .mli-nav {
          grid-template-columns: 1fr auto;
        }

        .mli-nav-links {
          display: none;
        }

        .mli-hero,
        .mli-readiness-panel,
        .mli-lanes,
        .mli-draw,
        .mli-dossier,
        .mli-final {
          grid-template-columns: 1fr;
        }

        .mli-hero {
          min-height: auto;
        }

        .mli-hero-visual {
          order: 2;
        }

        .mli-lanes-head {
          position: static;
        }

        .mli-lane-card {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .mli-lane-card p {
          grid-column: 2;
        }

        .mli-review-columns {
          grid-template-columns: 1fr;
        }

        .mli-final-art {
          left: 4%;
          width: 96%;
        }
      }

      @media (max-width: 640px) {
        .mli-nav,
        .mli-hero,
        .mli-section,
        .mli-final {
          width: min(100% - 24px, 1210px);
        }

        .mli-brand small {
          letter-spacing: 0.24em;
        }

        .mli-nav-cta {
          padding-inline: 10px;
        }

        .mli-hero {
          padding-block: 34px 64px;
        }

        .mli-hero h1 {
          font-size: clamp(2.72rem, 16vw, 4.6rem);
        }

        .mli-section h2,
        .mli-final h2 {
          font-size: clamp(2.18rem, 13vw, 4rem);
        }

        .mli-hero-stamp {
          left: 12px;
          right: 12px;
          max-width: none;
        }

        .mli-actions,
        .mli-final-actions {
          flex-direction: column;
        }

        .mli-actions [data-slot="button"],
        .mli-final-actions [data-slot="button"] {
          width: 100%;
        }

        .mli-readiness-panel {
          padding: 14px;
        }

        .mli-lane-card {
          grid-template-columns: 1fr;
        }

        .mli-lane-card p {
          grid-column: auto;
        }

        .mli-dossier-grid {
          grid-template-columns: 1fr;
        }

        .mli-dossier-item,
        .mli-dossier-item:nth-child(odd),
        .mli-dossier-item:nth-last-child(-n + 2) {
          border-right: 0;
          border-bottom: 1px solid var(--mli-soft-line);
        }

        .mli-dossier-item:last-child {
          border-bottom: 0;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        .mli-hero-copy,
        .mli-hero-visual,
        .mli-section,
        .mli-final-copy,
        .mli-review-columns {
          animation: mli-rise 780ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .mli-hero-visual {
          animation-delay: 90ms;
        }

        .mli-section {
          animation-delay: 120ms;
        }
      }

      @keyframes mli-rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `}</style>
  );
}
