import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Landmark,
  MapPinned,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { ComponentType, ReactElement } from "react";

import {
  FairLendLegalFooter,
  FairLendLegalFooterStyles,
} from "#/components/marketing/fairlend-legal-footer.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const assetBase = "/assets/fairlend-redesign";
const heroImage = `${assetBase}/draw-financing-hero.webp`;
const workspaceImage = `${assetBase}/draw-financing-workspace.webp`;
const blueprintStripImage = `${assetBase}/draw-financing-blueprint-strip.webp`;
const brandKitImage = `${assetBase}/draw-financing-brandkit.webp`;

const builderStartLink = linkOptions({ to: "/start/builder" });
const brokerStartLink = linkOptions({ to: "/start/broker" });
const drawGuideLink = linkOptions({
  to: "/resources/construction-draws-small-builders",
});
const contactLink = linkOptions({ to: "/contact" });
const aboutLink = linkOptions({ to: "/about" });

const reimbursementSequence = [
  {
    label: "01",
    title: "Work completed",
    copy: "Milestone scope is completed before a draw is requested.",
    icon: Building2,
  },
  {
    label: "02",
    title: "Evidence captured",
    copy: "Photos, invoices, notes, and location data stay attached to the request.",
    icon: FileCheck2,
  },
  {
    label: "03",
    title: "Staff review",
    copy: "Lender staff verify package quality, request missing context, and schedule site visits when needed.",
    icon: ClipboardCheck,
  },
  {
    label: "04",
    title: "Admin release",
    copy: "Final approval rests with the lender. Interest begins accruing on the draw only once the funds are released.",
    icon: ShieldCheck,
  },
] satisfies Array<{
  label: string;
  title: string;
  copy: string;
  icon: ComponentType<{ className?: string }>;
}>;

const comparisonPlans = [
  {
    title: "Cheapest feasible",
    detail:
      "Minimizes draw fees and interest exposure while respecting milestone dependencies and review lag.",
  },
  {
    title: "Fastest",
    detail:
      "Groups completed work to keep the construction roadmap moving when time pressure matters most.",
  },
  {
    title: "Capital-constrained",
    detail:
      "Keeps borrower working-capital exposure visible and separate from lender draw policy limits.",
  },
] as const;

const workspaceRows = [
  [
    "Milestone Rail",
    "See every milestone's status at a glance — done, blocked, evidenced, or approved.",
  ],
  [
    "Draw Groups",
    "Shows which completed milestones get funded together in a single draw.",
  ],
  [
    "Budget Revisions",
    "Every budget revision is saved. The last approved version is never overwritten.",
  ],
  [
    "Audit Events",
    "Every override and release is logged — who did it, their role, the time, what changed, and why. Nothing moves without a record.",
  ],
] as const;

const evidenceRules = [
  "A failed location check never deletes your proof",
  "Unverified locations get escalated to a lender or admin, not auto-rejected.",
  "Site visits can be requested without breaking the draw record.",
  "Connected systems update automatically. No one re-keys the same status twice.",
] as const;

export const Route = createFileRoute("/construction-draw-financing")({
  component: ConstructionDrawPage,
  head: () => ({
    meta: [
      { title: "Construction Draw Financing | FairLend Mortgage" },
      {
        name: "description",
        content:
          "FairLend helps builders and lenders plan reimbursement-only construction draws around completed work, evidence, working capital, lender policy, review lag, and audited release decisions.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: heroImage },
      { rel: "preload", as: "image", href: workspaceImage },
      { rel: "preload", as: "image", href: blueprintStripImage },
    ],
  }),
});

function ConstructionDrawPage(): ReactElement {
  return (
    <main className="df-page">
      <DrawFinancingStyles />
      <FairLendLegalFooterStyles />
      <PublicNav />
      <HeroSection />
      <ReimbursementSection />
      <WorkspaceSection />
      <ComparisonSection />
      <EvidenceSection />
      <ClosingSection />
      <FairLendLegalFooter />
    </main>
  );
}

function PublicNav(): ReactElement {
  return (
    <header className="df-nav-shell">
      <nav aria-label="FairLend full-site navigation" className="df-nav df-nav-primary">
      <Link
        {...aboutLink}
        aria-label="FairLend Mortgage about"
        className="df-brand"
        preload="intent"
        viewTransition
      >
        <span className="df-brand-mark">F</span>
        <span>
          <strong>FairLend</strong>
          <small>Mortgage</small>
        </span>
      </Link>
      <div className="df-nav-links">
        <Link to="/construction-draw-financing">Construction draws</Link>
        <Link to="/garden-suite-financing-gta">Garden suites</Link>
        <Link to="/multiplex-financing-gta">Multiplex</Link>
        <Link to="/contact">Contact</Link>
      </div>
      <Button
        className="df-nav-button"
        render={<Link {...builderStartLink} preload="intent" viewTransition />}
      >
        Start builder review
        <ArrowUpRight aria-hidden />
      </Button>
      </nav>
      <nav aria-label="Construction draw page sections" className="df-nav df-nav-secondary">
        <a href="#sequence">Sequence</a>
        <a href="#workspace">Workspace</a>
        <a href="#draw-plans">Draw plans</a>
        <a href="#evidence">Evidence</a>
      </nav>
    </header>
  );
}

function HeroSection(): ReactElement {
  return (
    <section aria-labelledby="draw-hero-title" className="df-hero">
      <div aria-hidden="true" className="df-side-rail">
        <span>Draw control dossier</span>
        <strong>Reimbursement only</strong>
      </div>

      <div className="df-hero-copy">
        <p className="df-kicker">Construction draw financing</p>
        <h1 id="draw-hero-title">Fund completed work with discipline.</h1>
        <p className="df-hero-deck">
          FairLend helps builders and lender teams plan reimbursement-only
          construction draws around milestone dependencies, borrower working
          capital, lender policy, evidence, site visits, and admin approval.
        </p>
        <div className="df-hero-actions">
          <Button
            className="df-primary-button"
            render={
              <Link {...builderStartLink} preload="intent" viewTransition />
            }
            size="xl"
          >
            Submit draw needs
            <ArrowUpRight aria-hidden />
          </Button>
          <Button
            className="df-outline-button"
            render={<Link {...drawGuideLink} preload="intent" viewTransition />}
            size="xl"
            variant="outline"
          >
            Read the draw guide
          </Button>
        </div>
      </div>

      <Frame className="df-hero-frame">
        <FramePanel className="df-hero-panel">
          <img
            alt="FairLend construction draw financing mockup with a building and blueprint overlay."
            className="df-hero-image"
            decoding="async"
            fetchPriority="high"
            height={560}
            src={heroImage}
            width={980}
          />
          <div className="df-hero-note">
            <span>v1 rule</span>
            <strong>
              No proactive advance funding before work completion.
            </strong>
          </div>
        </FramePanel>
      </Frame>
    </section>
  );
}

function ReimbursementSection(): ReactElement {
  return (
    <section
      aria-labelledby="sequence-title"
      className="df-section df-sequence"
      id="sequence"
    >
      <div className="df-section-head">
        <p className="df-kicker">Reimbursement sequence</p>
        <h2 id="sequence-title">The release path is explicit.</h2>
        <p>
          DrawFlow keeps the promise narrow on purpose: work first, evidence
          next, review after that, and fund release only once approved.
        </p>
      </div>
      <div className="df-sequence-grid">
        {reimbursementSequence.map((step) => {
          const Icon = step.icon;

          return (
            <Card className="df-step-card" key={step.label}>
              <div className="df-card-index">{step.label}</div>
              <Icon aria-hidden className="df-step-icon" />
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </Card>
          );
        })}
      </div>
      <div className="df-blueprint-strip">
        <img
          alt="FairLend blueprint strip with construction elevations and section drawings."
          height={199}
          loading="lazy"
          src={blueprintStripImage}
          width={1400}
        />
      </div>
    </section>
  );
}

function WorkspaceSection(): ReactElement {
  return (
    <section
      aria-labelledby="workspace-title"
      className="df-section df-workspace"
      id="workspace"
    >
      <div className="df-workspace-copy">
        <p className="df-kicker">Build Workspace</p>
        <h2 id="workspace-title">
          One place for roadmaps, draws and proof
        </h2>
        <p>
          Capital decisions get harder to trust when the file is scattered. One
          view of the roadmap, draws, evidence, and site status keeps the
          decision whole.
        </p>
        <div className="df-workspace-table">
          {workspaceRows.map(([title, detail]) => (
            <div className="df-workspace-row" key={title}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </div>
      <Frame className="df-workspace-frame">
        <FramePanel className="df-workspace-panel">
          <img
            alt="FairLend website mockup crop showing construction financing controls, building imagery, and blueprint styling."
            height={774}
            loading="lazy"
            src={workspaceImage}
            width={900}
          />
        </FramePanel>
      </Frame>
    </section>
  );
}

function ComparisonSection(): ReactElement {
  return (
    <section
      aria-labelledby="plans-title"
      className="df-section df-plans"
      id="draw-plans"
    >
      <div className="df-plans-header">
        <p className="df-kicker">Draw plan comparison</p>
        <h2 id="plans-title">
          Choose the plan by constraint, not by guesswork.
        </h2>
      </div>
      <Frame className="df-plans-frame">
        {comparisonPlans.map((plan, index) => (
          <FramePanel className="df-plan-panel" key={plan.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{plan.title}</h3>
            <p>{plan.detail}</p>
          </FramePanel>
        ))}
      </Frame>
      <div className="df-limit-board">
        <WalletCards aria-hidden />
        <div>
          <strong>Working capital is not lender policy.</strong>
          <p>
            Borrower Working Capital Limit and Lender Draw Policy Limit are
            separate controls. The interface should keep both visible before a
            builder selects a draw plan.
          </p>
        </div>
      </div>
    </section>
  );
}

function EvidenceSection(): ReactElement {
  return (
    <section
      aria-labelledby="evidence-title"
      className="df-section df-evidence"
      id="evidence"
    >
      <div className="df-evidence-plate">
        <div>
          <p className="df-kicker">Evidence and site visits</p>
          <h2 id="evidence-title">
            PROOF STAYS ATTACHED — EVEN WHEN GPS DOESN&apos;T
          </h2>
          <p>
            Field reality is messy. GPS drops, signals fail, sites are dead
            zones. DrawFlow keeps the evidence package intact regardless, flags
            it clearly when location can&apos;t be verified, and moves it to staff
            review, a site visit, or admin sign-off. Bad coordinates never cost
            you the proof.
          </p>
        </div>
        <ul className="df-evidence-list">
          {evidenceRules.map((rule) => (
            <li key={rule}>
              <CheckCircle2 aria-hidden />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="df-field-stack">
        <Card className="df-field-card">
          <MapPinned aria-hidden />
          <span>Location attempt</span>
          <strong>Unverified, retained</strong>
        </Card>
        <Card className="df-field-card">
          <Radio aria-hidden />
          <span>Site visit</span>
          <strong>Offline draft ready</strong>
        </Card>
        <Card className="df-field-card">
          <Landmark aria-hidden />
          <span>Admin authority</span>
          <strong>Final release decision</strong>
        </Card>
      </div>
    </section>
  );
}

function ClosingSection(): ReactElement {
  return (
    <section aria-labelledby="close-title" className="df-close">
      <div aria-hidden="true" className="df-close-art">
        <img
          alt=""
          height={900}
          loading="lazy"
          src={brandKitImage}
          width={1200}
        />
      </div>
      <div className="df-close-copy">
        <p className="df-kicker">FairLend Mortgage</p>
        <h2 id="close-title">Put the next draw on rails.</h2>
        <p>
          Bring the build location, milestone roadmap, budget, working-capital
          limit, lender policy, and evidence expectations into one review path.
        </p>
        <div className="df-close-actions">
          <Button
            className="df-primary-button"
            render={
              <Link {...builderStartLink} preload="intent" viewTransition />
            }
            size="xl"
          >
            Start as builder
            <ArrowUpRight aria-hidden />
          </Button>
          <Button
            className="df-dark-button"
            render={
              <Link {...brokerStartLink} preload="intent" viewTransition />
            }
            size="xl"
          >
            Start as broker
            <RouteIcon aria-hidden />
          </Button>
          <Button
            className="df-outline-button"
            render={<Link {...contactLink} preload="intent" viewTransition />}
            size="xl"
            variant="outline"
          >
            Contact FairLend
          </Button>
        </div>
      </div>
    </section>
  );
}

function DrawFinancingStyles(): ReactElement {
  return (
    <style>{`
      .df-page {
        --df-paper: #faf5ec;
        --df-ink: #073c33;
        --df-blueprint: #4d8386;
        --df-eucalyptus: #d9e7d6;
        --df-terracotta: #c9643e;
        --df-graphite: #262c2a;
        --df-line: color-mix(in oklch, var(--df-ink) 34%, transparent);
        --df-muted-line: color-mix(in oklch, var(--df-ink) 15%, transparent);
        min-height: 100vh;
        overflow: hidden;
        background:
          linear-gradient(var(--df-muted-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--df-muted-line) 1px, transparent 1px),
          var(--df-paper);
        background-size: 4.75rem 4.75rem;
        color: var(--df-ink);
        font-family: "Oxanium Variable", Oxanium, ui-sans-serif, system-ui, sans-serif;
      }

      .df-page *,
      .df-page *::before,
      .df-page *::after {
        box-sizing: border-box;
      }

      .df-nav-shell {
        position: sticky;
        top: 0;
        z-index: 40;
        border-bottom: 1px solid var(--df-line);
        background: color-mix(in oklch, var(--df-paper) 94%, transparent);
        backdrop-filter: blur(12px);
      }

      .df-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: clamp(1rem, 3vw, 2.5rem);
        padding: 0.75rem clamp(1rem, 4vw, 3.5rem);
      }

      .df-nav-secondary {
        display: flex;
        justify-content: center;
        gap: clamp(0.75rem, 2vw, 1.6rem);
        border-top: 1px solid var(--df-muted-line);
        padding-block: 0.55rem;
      }

      .df-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        color: inherit;
        text-decoration: none;
      }

      .df-brand-mark {
        display: grid;
        width: 2.75rem;
        height: 2.75rem;
        place-items: center;
        background: var(--df-ink);
        color: var(--df-paper);
        font-size: 1.55rem;
        font-weight: 800;
        line-height: 1;
      }

      .df-brand strong,
      .df-brand small {
        display: block;
        line-height: 1;
      }

      .df-brand strong {
        font-size: 0.95rem;
        letter-spacing: 0.1em;
      }

      .df-brand small {
        margin-top: 0.18rem;
        color: var(--df-blueprint);
        font-size: 0.62rem;
        letter-spacing: 0.48em;
      }

      .df-nav-links {
        display: flex;
        justify-content: center;
        gap: clamp(0.75rem, 2vw, 1.6rem);
      }

      .df-nav-links a {
        color: var(--df-graphite);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-decoration: none;
        text-transform: uppercase;
      }

      .df-nav-secondary a {
        color: var(--df-blueprint);
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-decoration: none;
        text-transform: uppercase;
      }

      .df-nav-links a:hover {
        color: var(--df-terracotta);
      }

      .df-nav-button,
      .df-primary-button {
        border-color: var(--df-ink);
        background: var(--df-ink);
        color: var(--df-paper);
      }

      .df-nav-button:hover,
      .df-primary-button:hover {
        background: color-mix(in oklch, var(--df-ink) 90%, var(--df-terracotta));
      }

      .df-outline-button {
        border-color: var(--df-line);
        background: color-mix(in oklch, var(--df-paper) 84%, transparent);
        color: var(--df-ink);
      }

      .df-dark-button {
        border-color: var(--df-graphite);
        background: var(--df-graphite);
        color: var(--df-paper);
      }

      .df-hero {
        position: relative;
        display: grid;
        min-height: calc(100svh - 4.3rem);
        grid-template-columns: clamp(4rem, 7vw, 7rem) minmax(0, 0.92fr) minmax(21rem, 0.78fr);
        border-bottom: 1px solid var(--df-line);
      }

      .df-side-rail {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-right: 1px solid var(--df-line);
        background: var(--df-ink);
        color: var(--df-paper);
        padding: 2rem 0;
        text-transform: uppercase;
        writing-mode: vertical-rl;
      }

      .df-side-rail span,
      .df-side-rail strong {
        transform: rotate(180deg);
      }

      .df-side-rail span {
        color: var(--df-eucalyptus);
        font-size: 0.72rem;
        letter-spacing: 0.18em;
      }

      .df-side-rail strong {
        color: var(--df-terracotta);
        max-width: 100%;
        font-size: clamp(1.4rem, 2.8vw, 2.4rem);
        letter-spacing: 0;
        line-height: 0.86;
      }

      .df-hero-copy {
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        border-right: 1px solid var(--df-line);
        padding: clamp(3rem, 8vw, 7rem) clamp(1.25rem, 5vw, 5.5rem);
      }

      .df-kicker {
        margin: 0 0 1.1rem;
        color: var(--df-terracotta);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .df-hero h1 {
        max-width: 13ch;
        margin: 0;
        font-size: clamp(4.2rem, 8.6vw, 8.5rem);
        font-weight: 900;
        letter-spacing: -0.055em;
        line-height: 0.78;
        text-transform: uppercase;
      }

      .df-hero-deck {
        max-width: 41rem;
        margin: 2rem 0 0;
        color: var(--df-graphite);
        font-size: clamp(1.1rem, 2.2vw, 1.55rem);
        line-height: 1.24;
      }

      .df-hero-actions,
      .df-close-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 2.25rem;
      }

      .df-hero-frame {
        align-self: center;
        margin: clamp(1rem, 4vw, 3rem);
        background: color-mix(in oklch, var(--df-blueprint) 28%, var(--df-paper));
      }

      .df-hero-panel {
        overflow: hidden;
        border-color: var(--df-line);
        background: var(--df-paper);
        padding: 0;
      }

      .df-hero-image {
        display: block;
        width: 100%;
        height: auto;
        min-height: 28rem;
        object-fit: cover;
      }

      .df-hero-note {
        display: grid;
        gap: 0.35rem;
        border-top: 1px solid var(--df-line);
        background: var(--df-ink);
        color: var(--df-paper);
        padding: 1rem;
      }

      .df-hero-note span {
        color: var(--df-eucalyptus);
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .df-hero-note strong {
        max-width: 30rem;
        font-size: clamp(1.15rem, 2vw, 1.65rem);
        line-height: 1;
      }

      .df-section {
        padding: clamp(4.5rem, 9vw, 8rem) clamp(1rem, 4vw, 3.5rem);
      }

      .df-section-head {
        display: grid;
        grid-template-columns: minmax(0, 0.82fr) minmax(18rem, 0.48fr);
        gap: clamp(1.5rem, 5vw, 5rem);
        align-items: end;
        margin-bottom: clamp(2rem, 5vw, 4rem);
      }

      .df-section h2,
      .df-close h2 {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(3rem, 7vw, 7.4rem);
        font-weight: 900;
        letter-spacing: -0.045em;
        line-height: 0.86;
        text-transform: uppercase;
      }

      .df-section-head p:not(.df-kicker),
      .df-workspace-copy > p,
      .df-evidence-plate p,
      .df-close-copy > p {
        max-width: 39rem;
        margin: 0;
        color: var(--df-graphite);
        font-size: clamp(1rem, 1.55vw, 1.24rem);
        line-height: 1.38;
      }

      .df-sequence {
        background: color-mix(in oklch, var(--df-paper) 86%, var(--df-eucalyptus));
      }

      .df-sequence-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border: 1px solid var(--df-line);
      }

      .df-step-card {
        min-height: 24rem;
        justify-content: space-between;
        border: 0;
        border-radius: 0;
        background: color-mix(in oklch, var(--df-paper) 88%, transparent);
        padding: clamp(1.1rem, 2vw, 1.8rem);
        box-shadow: none;
      }

      .df-step-card:not(:last-child) {
        border-right: 1px solid var(--df-line);
      }

      .df-card-index {
        color: var(--df-blueprint);
        font-size: clamp(2rem, 5vw, 5rem);
        font-weight: 900;
        letter-spacing: -0.08em;
        line-height: 0.8;
      }

      .df-step-icon {
        width: 2rem;
        height: 2rem;
        color: var(--df-terracotta);
      }

      .df-step-card h3,
      .df-plan-panel h3 {
        margin: 0;
        font-size: clamp(1.35rem, 2.6vw, 2.25rem);
        font-weight: 900;
        letter-spacing: -0.04em;
        line-height: 0.95;
        text-transform: uppercase;
      }

      .df-step-card p,
      .df-plan-panel p,
      .df-limit-board p,
      .df-field-card span {
        margin: 0;
        color: color-mix(in oklch, var(--df-graphite) 88%, transparent);
        font-size: 0.96rem;
        line-height: 1.45;
      }

      .df-blueprint-strip {
        overflow: hidden;
        border: 1px solid var(--df-line);
        border-top: 0;
        background: var(--df-blueprint);
      }

      .df-blueprint-strip img {
        display: block;
        width: 100%;
        min-height: 7rem;
        object-fit: cover;
      }

      .df-workspace {
        display: grid;
        grid-template-columns: minmax(0, 0.78fr) minmax(20rem, 0.6fr);
        gap: clamp(2rem, 6vw, 6rem);
        align-items: center;
        background: var(--df-paper);
      }

      .df-workspace-copy h2 {
        margin-bottom: 1.35rem;
      }

      .df-workspace-table {
        margin-top: 2.2rem;
        border-top: 1px solid var(--df-line);
      }

      .df-workspace-row {
        display: grid;
        grid-template-columns: minmax(10rem, 0.34fr) minmax(0, 1fr);
        gap: 1rem;
        border-bottom: 1px solid var(--df-line);
        padding: 1rem 0;
      }

      .df-workspace-row strong {
        color: var(--df-ink);
        font-size: 0.9rem;
        text-transform: uppercase;
      }

      .df-workspace-row span {
        color: var(--df-graphite);
      }

      .df-workspace-frame {
        background: color-mix(in oklch, var(--df-ink) 20%, var(--df-paper));
      }

      .df-workspace-panel {
        overflow: hidden;
        padding: 0;
      }

      .df-workspace-panel img {
        display: block;
        width: 100%;
        height: auto;
      }

      .df-plans {
        display: grid;
        grid-template-columns: minmax(18rem, 0.44fr) minmax(0, 0.72fr);
        gap: clamp(1.5rem, 5vw, 5rem);
        align-items: start;
        background: var(--df-ink);
        color: var(--df-paper);
      }

      .df-plans .df-kicker {
        color: var(--df-eucalyptus);
      }

      .df-plans-header {
        position: sticky;
        top: 6rem;
      }

      .df-plans-frame {
        background: color-mix(in oklch, var(--df-paper) 18%, var(--df-ink));
      }

      .df-plan-panel {
        display: grid;
        grid-template-columns: 4rem minmax(0, 0.62fr) minmax(16rem, 0.78fr);
        gap: clamp(1rem, 3vw, 2rem);
        align-items: center;
        border-color: color-mix(in oklch, var(--df-paper) 32%, transparent);
        background: color-mix(in oklch, var(--df-ink) 90%, var(--df-blueprint));
        color: var(--df-paper);
      }

      .df-plan-panel span {
        color: var(--df-terracotta);
        font-size: 2rem;
        font-weight: 900;
        letter-spacing: -0.08em;
      }

      .df-plan-panel p {
        color: color-mix(in oklch, var(--df-paper) 82%, transparent);
      }

      .df-limit-board {
        grid-column: 2;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 1rem;
        align-items: start;
        border: 1px solid color-mix(in oklch, var(--df-paper) 34%, transparent);
        background: var(--df-paper);
        color: var(--df-ink);
        padding: clamp(1rem, 2.4vw, 1.5rem);
      }

      .df-limit-board svg {
        width: 2rem;
        height: 2rem;
        color: var(--df-terracotta);
      }

      .df-limit-board strong {
        display: block;
        margin-bottom: 0.35rem;
        font-size: 1.25rem;
        line-height: 1;
        text-transform: uppercase;
      }

      .df-evidence {
        display: grid;
        grid-template-columns: minmax(0, 0.68fr) minmax(18rem, 0.42fr);
        gap: clamp(1.5rem, 5vw, 5rem);
        align-items: stretch;
        background: color-mix(in oklch, var(--df-eucalyptus) 72%, var(--df-paper));
      }

      .df-evidence-plate {
        display: grid;
        align-content: space-between;
        gap: 2rem;
        border: 1px solid var(--df-line);
        background:
          linear-gradient(90deg, transparent 0 calc(100% - 1px), var(--df-muted-line) calc(100% - 1px)),
          var(--df-paper);
        background-size: 25% 100%;
        padding: clamp(1.25rem, 4vw, 3rem);
      }

      .df-evidence-plate h2 {
        margin-bottom: 1.2rem;
      }

      .df-evidence-list {
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .df-evidence-list li {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        border: 1px solid var(--df-muted-line);
        background: color-mix(in oklch, var(--df-paper) 84%, transparent);
        padding: 0.85rem;
      }

      .df-evidence-list svg {
        width: 1.05rem;
        height: 1.05rem;
        color: var(--df-terracotta);
      }

      .df-field-stack {
        display: grid;
        gap: 1rem;
        align-content: center;
      }

      .df-field-card {
        gap: 1rem;
        border-color: var(--df-line);
        background: var(--df-ink);
        color: var(--df-paper);
        padding: 1.25rem;
      }

      .df-field-card svg {
        width: 2rem;
        height: 2rem;
        color: var(--df-terracotta);
      }

      .df-field-card span {
        color: var(--df-eucalyptus);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }

      .df-field-card strong {
        font-size: clamp(1.5rem, 3.8vw, 3rem);
        letter-spacing: -0.05em;
        line-height: 0.9;
        text-transform: uppercase;
      }

      .df-close {
        position: relative;
        display: grid;
        min-height: 92svh;
        grid-template-columns: minmax(18rem, 0.52fr) minmax(0, 0.72fr);
        border-top: 1px solid var(--df-line);
        background: var(--df-paper);
      }

      .df-close-art {
        overflow: hidden;
        border-right: 1px solid var(--df-line);
        background: var(--df-ink);
      }

      .df-close-art img {
        width: 100%;
        height: 100%;
        min-height: 34rem;
        object-fit: cover;
        opacity: 0.92;
      }

      .df-close-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: clamp(2rem, 7vw, 6rem);
      }

      .df-close h2 {
        max-width: 10ch;
        margin-bottom: 1.25rem;
      }

      @media (max-width: 1100px) {
        .df-nav {
          grid-template-columns: 1fr auto;
        }

        .df-nav-links {
          display: none;
        }

        .df-hero,
        .df-workspace,
        .df-plans,
        .df-evidence,
        .df-close {
          grid-template-columns: 1fr;
        }

        .df-side-rail {
          display: none;
        }

        .df-hero-copy {
          border-right: 0;
          border-bottom: 1px solid var(--df-line);
        }

        .df-plans-header {
          position: static;
        }

        .df-limit-board {
          grid-column: auto;
        }

        .df-close-art {
          border-right: 0;
          border-bottom: 1px solid var(--df-line);
        }
      }

      @media (max-width: 840px) {
        .df-nav {
          position: relative;
          grid-template-columns: 1fr;
        }

        .df-nav-button {
          width: 100%;
        }

        .df-section-head,
        .df-sequence-grid,
        .df-plan-panel,
        .df-workspace-row {
          grid-template-columns: 1fr;
        }

        .df-step-card:not(:last-child) {
          border-right: 0;
          border-bottom: 1px solid var(--df-line);
        }

        .df-step-card {
          min-height: 18rem;
        }

        .df-hero h1 {
          font-size: clamp(3.7rem, 17vw, 6rem);
        }

        .df-section h2,
        .df-close h2 {
          font-size: clamp(2.7rem, 14vw, 4.6rem);
        }
      }
    `}</style>
  );
}
