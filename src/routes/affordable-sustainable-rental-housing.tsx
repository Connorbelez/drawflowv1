import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileCheck2,
  Handshake,
  Home,
  Landmark,
  Leaf,
  MapPinned,
  ShieldCheck,
  Trees,
} from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

const assetRoot = "/assets/fairlend-redesign";
const heroAsset = `${assetRoot}/affordable-housing-hero.webp`;
const blueprintAsset = `${assetRoot}/affordable-housing-blueprint.webp`;
const cardsAsset = `${assetRoot}/affordable-housing-cards.webp`;
const materialsAsset = `${assetRoot}/affordable-housing-materials.webp`;
const communityAsset = `${assetRoot}/affordable-housing-community.webp`;
const brandPlateAsset = `${assetRoot}/affordable-housing-brandplate.webp`;

const principles = [
  {
    icon: Home,
    title: "Homes people can actually rent",
    copy: "We look for projects where the capital plan supports attainable monthly rents, not just a sharper pro forma.",
  },
  {
    icon: Leaf,
    title: "Lower operating drag",
    copy: "Envelope, systems, durability, and utility assumptions are part of the financing conversation because they shape long-run affordability.",
  },
  {
    icon: Building2,
    title: "Builders with a field plan",
    copy: "Budget, scope, permit stage, construction schedule, and borrower liquidity need to line up before the deal is ready.",
  },
  {
    icon: Landmark,
    title: "Capital that respects risk",
    copy: "Private lending can move quickly, but it still needs disciplined underwriting, clear terms, and release controls.",
  },
];

const underwritingChecks = [
  "Site, zoning, permit, and servicing status",
  "Construction budget with contingency and scope evidence",
  "Borrower working capital during reimbursement timing",
  "Rental assumptions tied to the local market",
  "Exit, refinance, or stabilization plan",
  "Evidence path for completed work and draw release",
];

const audience = [
  {
    label: "Builders",
    copy: "Need construction capital for rental supply, with draw timing mapped before crews are waiting on reimbursement.",
  },
  {
    label: "Developers",
    copy: "Need a lending review that can read site constraints, soft costs, schedule risk, and affordability intent together.",
  },
  {
    label: "Investors",
    copy: "Need exposure to housing creation with underwriting discipline, project visibility, and capital governance.",
  },
];

const routeNotes = [
  "Rental purpose is explicit.",
  "Construction scope is legible.",
  "Affordability is modeled, not asserted.",
  "Sustainability choices reduce operating pressure.",
  "Funds release only after eligible work is complete.",
];

export const Route = createFileRoute("/affordable-sustainable-rental-housing")({
  component: AffordableSustainableRentalHousingPage,
  head: () => ({
    meta: [
      {
        title: "Affordable Sustainable Rental Housing | Fairlend Capital",
      },
      {
        name: "description",
        content:
          "Fairlend Capital helps builders, developers, and investors evaluate private lending for affordable, sustainable rental housing projects.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: heroAsset },
      { rel: "preload", as: "image", href: blueprintAsset },
      { rel: "preload", as: "image", href: communityAsset },
    ],
  }),
});

function AffordableSustainableRentalHousingPage(): ReactElement {
  return (
    <main className="fl-housing-page">
      <style>{housingStyles}</style>
      <SiteNav />
      <HeroSection />
      <ThesisSection />
      <CapitalFitSection />
      <EvidenceSection />
      <AudienceSection />
      <ClosingSection />
    </main>
  );
}

function SiteNav(): ReactElement {
  return (
    <header className="fl-nav">
      <Link
        aria-label="Fairlend Capital home"
        className="fl-brand"
        preload="intent"
        to="/"
        viewTransition
      >
        <span className="fl-brand-mark">F</span>
        <span>
          <strong>Fairlend</strong>
          <small>Capital</small>
        </span>
      </Link>
      <nav aria-label="Affordable housing page navigation">
        <a href="#thesis">Thesis</a>
        <a href="#capital-fit">Capital fit</a>
        <a href="#review-path">Review path</a>
      </nav>
      <Button
        className="fl-button-primary fl-nav-cta"
        render={<Link preload="intent" to="/contact" viewTransition />}
        size="sm"
      >
        Discuss a project
        <ArrowRight aria-hidden="true" />
      </Button>
    </header>
  );
}

function HeroSection(): ReactElement {
  return (
    <section aria-labelledby="housing-title" className="fl-hero">
      <div aria-hidden="true" className="fl-hero-rail">
        <span>Civic Garden</span>
        <span>Built on trust</span>
      </div>
      <div className="fl-hero-copy">
        <p className="fl-kicker">Affordable sustainable rental housing</p>
        <h1 id="housing-title">Capital for homes that stay useful.</h1>
        <p className="fl-hero-deck">
          Fairlend reviews private lending opportunities for rental housing
          projects where affordability, operating resilience, and construction
          feasibility need to work in the same plan.
        </p>
        <div className="fl-hero-actions">
          <Button
            className="fl-button-primary"
            render={<Link preload="intent" to="/contact" viewTransition />}
            size="xl"
          >
            Start a financing review
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            className="fl-button-secondary"
            render={
              <Link
                preload="intent"
                to="/resources/sustainable-rental-housing-investor-returns"
                viewTransition
              />
            }
            size="xl"
            variant="outline"
          >
            Read investor context
          </Button>
        </div>
      </div>
      <Frame className="fl-hero-frame">
        <FramePanel className="fl-hero-panel">
          <img
            alt="Fairlend affordable housing website mockup with rental building and blueprint overlay"
            height={354}
            src={heroAsset}
            width={620}
          />
          <div className="fl-hero-note">
            <ShieldCheck aria-hidden="true" />
            <span>Private lending review for rental housing supply.</span>
          </div>
        </FramePanel>
      </Frame>
      <img
        alt=""
        aria-hidden="true"
        className="fl-blueprint-strip"
        height={96}
        src={blueprintAsset}
        width={800}
      />
    </section>
  );
}

function ThesisSection(): ReactElement {
  return (
    <section aria-labelledby="thesis-title" className="fl-section" id="thesis">
      <div className="fl-section-grid">
        <div className="fl-section-copy">
          <p className="fl-kicker">The housing thesis</p>
          <h2 id="thesis-title">
            Affordable rent is not one line in a spreadsheet.
          </h2>
          <p>
            It depends on land, scope, operating cost, debt service, schedule,
            exit, and whether the borrower can survive reimbursement timing.
            Fairlend evaluates those pressures together before capital is framed
            as a fit.
          </p>
        </div>
        <Frame className="fl-brand-frame">
          <FramePanel className="fl-brand-panel">
            <img
              alt="Fairlend brand plate with civic green logo and smart capital message"
              height={260}
              src={brandPlateAsset}
              width={606}
            />
          </FramePanel>
        </Frame>
      </div>
      <div className="fl-principles">
        {principles.map((item) => {
          const Icon = item.icon;

          return (
            <Card className="fl-principle-card" key={item.title}>
              <CardContent>
                <Icon aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function CapitalFitSection(): ReactElement {
  return (
    <section
      aria-labelledby="capital-fit-title"
      className="fl-section fl-capital-section"
      id="capital-fit"
    >
      <div className="fl-capital-art">
        <img
          alt="Fairlend content cards showing capital with purpose, built for communities, and sustainable by design"
          height={180}
          src={cardsAsset}
          width={608}
        />
      </div>
      <div className="fl-capital-copy">
        <p className="fl-kicker">Capital fit</p>
        <h2 id="capital-fit-title">
          The right project gets a lender-ready story.
        </h2>
        <p>
          We organize the core facts into a financing path that a borrower,
          lender, investor, and advisor can inspect without translating
          marketing language back into project risk.
        </p>
        <div className="fl-check-list">
          {underwritingChecks.map((check) => (
            <div className="fl-check" key={check}>
              <CheckCircle2 aria-hidden="true" />
              <span>{check}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceSection(): ReactElement {
  return (
    <section
      aria-labelledby="review-path-title"
      className="fl-section fl-review-section"
      id="review-path"
    >
      <div className="fl-review-header">
        <p className="fl-kicker">Review path</p>
        <h2 id="review-path-title">
          From housing intent to release discipline.
        </h2>
      </div>
      <div className="fl-review-layout">
        <Frame className="fl-community-frame">
          <FramePanel className="fl-community-panel">
            <img
              alt="Community and multifamily building imagery from the Fairlend civic garden visual system"
              height={132}
              src={communityAsset}
              width={414}
            />
          </FramePanel>
        </Frame>
        <div className="fl-route-notes">
          {routeNotes.map((note, index) => (
            <div className="fl-route-note" key={note}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{note}</p>
            </div>
          ))}
        </div>
        <Frame className="fl-materials-frame">
          <FramePanel className="fl-materials-panel">
            <img
              alt="Concrete, civic green ribbing, plaster, clay tile, and wood material palette"
              height={128}
              src={materialsAsset}
              width={316}
            />
            <p>
              We prefer durable project economics over cosmetic sustainability
              claims.
            </p>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function AudienceSection(): ReactElement {
  return (
    <section aria-labelledby="audience-title" className="fl-section">
      <div className="fl-audience-heading">
        <p className="fl-kicker">Who this is for</p>
        <h2 id="audience-title">
          Builders, developers, and investors aligned on supply.
        </h2>
      </div>
      <div className="fl-audience-grid">
        {audience.map((item) => (
          <Card className="fl-audience-card" key={item.label}>
            <CardContent>
              <span>{item.label}</span>
              <p>{item.copy}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ClosingSection(): ReactElement {
  return (
    <section aria-labelledby="closing-title" className="fl-closing">
      <div className="fl-closing-copy">
        <p className="fl-kicker">Next step</p>
        <h2 id="closing-title">
          Bring the site, budget, rent logic, and timing constraints.
        </h2>
        <p>
          We will help determine whether the project has a responsible private
          lending path, what needs to be tightened, and how the capital should
          be governed from review to release.
        </p>
      </div>
      <div className="fl-closing-actions">
        <Button
          className="fl-button-primary"
          render={<Link preload="intent" to="/contact" viewTransition />}
          size="xl"
        >
          Discuss a rental project
          <Handshake aria-hidden="true" />
        </Button>
        <Button
          className="fl-button-secondary"
          render={<Link preload="intent" to="/resources" viewTransition />}
          size="xl"
          variant="outline"
        >
          Browse housing resources
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <div className="fl-footer-grid">
        <span>
          <MapPinned aria-hidden="true" />
          Site-aware review
        </span>
        <span>
          <FileCheck2 aria-hidden="true" />
          Evidence-led releases
        </span>
        <span>
          <Trees aria-hidden="true" />
          Sustainable operations lens
        </span>
      </div>
    </section>
  );
}

const housingStyles = `
.fl-housing-page {
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(6, 63, 53, 0.035) 1px, transparent 1px),
    linear-gradient(0deg, rgba(6, 63, 53, 0.03) 1px, transparent 1px),
    #f8f3ea;
  background-size: 72px 72px;
  color: #17221f;
  font-family: "Oxanium Variable", sans-serif;
}

.fl-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid rgba(23, 34, 31, 0.22);
  background: rgba(248, 243, 234, 0.94);
  padding: 0.85rem clamp(1rem, 3vw, 2.5rem);
  backdrop-filter: blur(12px);
}

.fl-brand {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.75rem;
  color: inherit;
  text-decoration: none;
  text-transform: uppercase;
}

.fl-brand-mark {
  display: grid;
  width: 2.45rem;
  height: 2.45rem;
  place-items: center;
  background: #063f35;
  color: #f8f3ea;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1;
}

.fl-brand strong,
.fl-brand small {
  display: block;
  line-height: 1;
}

.fl-brand strong {
  font-size: 0.9rem;
  letter-spacing: 0.16em;
}

.fl-brand small {
  margin-top: 0.28rem;
  color: #3e7cad;
  font-size: 0.62rem;
  letter-spacing: 0.35em;
}

.fl-nav nav {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 2vw, 2rem);
  justify-content: center;
}

.fl-nav nav a {
  color: rgba(23, 34, 31, 0.78);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
}

.fl-nav-cta {
  justify-self: end;
}

.fl-button-primary {
  border-color: #063f35;
  background: #063f35;
  color: #f8f3ea;
  letter-spacing: 0.02em;
}

.fl-button-primary:hover {
  background: #0b5245;
}

.fl-button-secondary {
  border-color: rgba(23, 34, 31, 0.24);
  background: #f8f3ea;
  color: #17221f;
  letter-spacing: 0.02em;
}

.fl-kicker {
  margin: 0;
  color: #d86b42;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1.4;
  text-transform: uppercase;
}

.fl-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(4.5rem, 0.18fr) minmax(0, 0.92fr) minmax(22rem, 0.9fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  max-width: 1440px;
  min-height: calc(100vh - 4.4rem);
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 3rem) 4.5rem;
}

.fl-hero-rail {
  display: flex;
  min-height: 34rem;
  flex-direction: column;
  justify-content: space-between;
  background: #063f35;
  padding: 1.25rem 0.9rem;
  color: #f8f3ea;
  text-transform: uppercase;
}

.fl-hero-rail span:first-child {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: clamp(2.6rem, 5vw, 5rem);
  font-weight: 700;
  letter-spacing: 0.09em;
  line-height: 0.85;
}

.fl-hero-rail span:last-child {
  max-width: 8rem;
  color: #d86b42;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1.45;
}

.fl-hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1rem 0 5.5rem;
}

.fl-hero h1,
.fl-section h2,
.fl-closing h2 {
  margin: 0;
  color: #063f35;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.fl-hero h1 {
  max-width: 12ch;
  margin-top: 1.2rem;
  font-size: clamp(4.3rem, 9vw, 9.5rem);
  line-height: 0.82;
}

.fl-hero-deck {
  max-width: 42rem;
  margin: 2rem 0 0;
  color: rgba(23, 34, 31, 0.82);
  font-size: clamp(1rem, 1.4vw, 1.18rem);
  line-height: 1.65;
}

.fl-hero-actions,
.fl-closing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 2rem;
}

.fl-hero-frame {
  align-self: center;
  background: rgba(23, 34, 31, 0.11);
  transform: rotate(1deg);
}

.fl-hero-panel {
  overflow: hidden;
  border-color: rgba(23, 34, 31, 0.2);
  background: #f8f3ea;
  padding: 0;
}

.fl-hero-panel img {
  display: block;
  width: 100%;
  height: auto;
}

.fl-hero-note {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-top: 1px solid rgba(23, 34, 31, 0.2);
  background: #063f35;
  padding: 1rem;
  color: #f8f3ea;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fl-hero-note svg {
  width: 1.2rem;
  height: 1.2rem;
  color: #d86b42;
}

.fl-blueprint-strip {
  position: absolute;
  right: clamp(1rem, 4vw, 3rem);
  bottom: 1.4rem;
  width: min(54rem, 72vw);
  height: auto;
  border: 1px solid rgba(23, 34, 31, 0.24);
  object-fit: cover;
}

.fl-section,
.fl-closing {
  max-width: 1440px;
  margin: 0 auto;
  padding: clamp(4.5rem, 8vw, 8rem) clamp(1rem, 4vw, 3rem);
}

.fl-section-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(20rem, 0.78fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: center;
}

.fl-section-copy h2,
.fl-capital-copy h2,
.fl-review-header h2,
.fl-audience-heading h2,
.fl-closing h2 {
  margin-top: 0.9rem;
  font-size: clamp(2.6rem, 5vw, 5.4rem);
  line-height: 0.92;
}

.fl-section-copy p:not(.fl-kicker),
.fl-capital-copy p,
.fl-closing p {
  max-width: 45rem;
  margin: 1.35rem 0 0;
  color: rgba(23, 34, 31, 0.78);
  font-size: 1rem;
  line-height: 1.72;
}

.fl-brand-frame,
.fl-community-frame,
.fl-materials-frame {
  background: rgba(23, 34, 31, 0.1);
}

.fl-brand-panel,
.fl-community-panel,
.fl-materials-panel {
  overflow: hidden;
  border-color: rgba(23, 34, 31, 0.2);
  background: #f8f3ea;
  padding: 0;
}

.fl-brand-panel img,
.fl-community-panel img,
.fl-materials-panel img,
.fl-capital-art img {
  display: block;
  width: 100%;
  height: auto;
}

.fl-principles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: clamp(2rem, 5vw, 4rem);
  border: 1px solid rgba(23, 34, 31, 0.22);
  background: rgba(23, 34, 31, 0.22);
}

.fl-principle-card {
  border: 0;
  border-radius: 0;
  background: #f8f3ea;
  color: #17221f;
  box-shadow: none;
}

.fl-principle-card::before,
.fl-audience-card::before {
  display: none;
}

.fl-principle-card [data-slot="card-panel"] {
  padding: clamp(1.25rem, 2.2vw, 2rem);
}

.fl-principle-card svg {
  width: 1.75rem;
  height: 1.75rem;
  color: #3e7cad;
}

.fl-principle-card h3 {
  max-width: 12rem;
  margin: 1.5rem 0 0;
  color: #063f35;
  font-size: clamp(1.25rem, 2vw, 1.85rem);
  line-height: 1.02;
  text-transform: uppercase;
}

.fl-principle-card p {
  margin: 1rem 0 0;
  color: rgba(23, 34, 31, 0.72);
  font-size: 0.92rem;
  line-height: 1.6;
}

.fl-capital-section {
  display: grid;
  grid-template-columns: minmax(19rem, 0.82fr) minmax(0, 1fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  background: #063f35;
  color: #f8f3ea;
}

.fl-capital-art {
  border: 1px solid rgba(248, 243, 234, 0.28);
  background: rgba(248, 243, 234, 0.06);
  padding: clamp(0.75rem, 1.5vw, 1rem);
  transform: rotate(-1deg);
}

.fl-capital-copy h2 {
  color: #f8f3ea;
}

.fl-capital-copy p {
  color: rgba(248, 243, 234, 0.78);
}

.fl-check-list {
  display: grid;
  gap: 0.7rem;
  margin-top: 2rem;
}

.fl-check {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid rgba(248, 243, 234, 0.18);
  background: rgba(248, 243, 234, 0.06);
  padding: 0.85rem 1rem;
  color: rgba(248, 243, 234, 0.9);
  font-size: 0.9rem;
}

.fl-check svg {
  width: 1rem;
  height: 1rem;
  color: #d86b42;
}

.fl-review-section {
  background:
    linear-gradient(90deg, rgba(62, 124, 173, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(62, 124, 173, 0.08) 1px, transparent 1px),
    #edf2e5;
  background-size: 56px 56px;
}

.fl-review-header {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(16rem, 0.46fr);
  gap: 2rem;
  align-items: end;
}

.fl-review-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 0.82fr) minmax(20rem, 1fr) minmax(14rem, 0.56fr);
  gap: clamp(1rem, 3vw, 2rem);
  margin-top: clamp(2rem, 5vw, 4rem);
  align-items: stretch;
}

.fl-community-frame {
  align-self: start;
  transform: rotate(-1deg);
}

.fl-materials-frame {
  align-self: end;
  transform: rotate(1deg);
}

.fl-materials-panel p {
  margin: 0;
  border-top: 1px solid rgba(23, 34, 31, 0.2);
  padding: 1rem;
  color: #063f35;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.45;
  text-transform: uppercase;
}

.fl-route-notes {
  border: 1px solid rgba(23, 34, 31, 0.24);
  background: #f8f3ea;
}

.fl-route-note {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  min-height: 5.1rem;
  border-bottom: 1px solid rgba(23, 34, 31, 0.18);
}

.fl-route-note:last-child {
  border-bottom: 0;
}

.fl-route-note span {
  display: grid;
  place-items: center;
  border-right: 1px solid rgba(23, 34, 31, 0.18);
  color: #d86b42;
  font-size: 1.25rem;
  font-weight: 700;
}

.fl-route-note p {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 1rem 1.2rem;
  color: rgba(23, 34, 31, 0.8);
  line-height: 1.45;
}

.fl-audience-heading {
  max-width: 58rem;
}

.fl-audience-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: clamp(2rem, 5vw, 4rem);
  border: 1px solid rgba(23, 34, 31, 0.22);
  background: rgba(23, 34, 31, 0.22);
}

.fl-audience-card {
  border: 0;
  border-radius: 0;
  background: #f8f3ea;
  box-shadow: none;
}

.fl-audience-card [data-slot="card-panel"] {
  min-height: 17rem;
  padding: clamp(1.5rem, 3vw, 2.5rem);
}

.fl-audience-card span {
  color: #3e7cad;
  font-size: clamp(2rem, 4vw, 4.25rem);
  font-weight: 700;
  line-height: 0.88;
  text-transform: uppercase;
}

.fl-audience-card p {
  max-width: 23rem;
  margin: clamp(2rem, 4vw, 4rem) 0 0;
  color: rgba(23, 34, 31, 0.74);
  line-height: 1.6;
}

.fl-closing {
  border-top: 1px solid rgba(23, 34, 31, 0.2);
}

.fl-closing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: clamp(2rem, 6vw, 6rem);
  align-items: end;
}

.fl-footer-grid {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: clamp(2rem, 4vw, 3.5rem);
  border: 1px solid rgba(23, 34, 31, 0.22);
  background: rgba(23, 34, 31, 0.22);
}

.fl-footer-grid span {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #f8f3ea;
  padding: 1.2rem;
  color: #063f35;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.fl-footer-grid svg {
  width: 1.1rem;
  height: 1.1rem;
  color: #d86b42;
}

@media (max-width: 1060px) {
  .fl-nav {
    grid-template-columns: 1fr auto;
  }

  .fl-nav nav {
    display: none;
  }

  .fl-hero {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .fl-hero-rail {
    min-height: 0;
    flex-direction: row;
    align-items: center;
    padding: 0.85rem 1rem;
  }

  .fl-hero-rail span:first-child {
    writing-mode: horizontal-tb;
    transform: none;
    font-size: clamp(1.7rem, 7vw, 3.5rem);
  }

  .fl-hero-copy {
    padding-bottom: 0;
  }

  .fl-hero h1 {
    max-width: 9ch;
  }

  .fl-hero-frame {
    transform: none;
  }

  .fl-blueprint-strip {
    position: static;
    width: 100%;
    margin-top: -2rem;
  }

  .fl-section-grid,
  .fl-capital-section,
  .fl-review-header,
  .fl-review-layout,
  .fl-closing {
    grid-template-columns: 1fr;
  }

  .fl-principles,
  .fl-audience-grid,
  .fl-footer-grid {
    grid-template-columns: 1fr 1fr;
  }

  .fl-closing-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .fl-nav {
    position: relative;
    grid-template-columns: 1fr;
  }

  .fl-nav-cta {
    justify-self: stretch;
  }

  .fl-brand {
    justify-self: start;
  }

  .fl-hero,
  .fl-section,
  .fl-closing {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .fl-hero h1 {
    font-size: clamp(3.25rem, 18vw, 5.2rem);
  }

  .fl-hero-actions,
  .fl-closing-actions {
    flex-direction: column;
  }

  .fl-hero-actions [data-slot="button"],
  .fl-closing-actions [data-slot="button"] {
    width: 100%;
  }

  .fl-principles,
  .fl-audience-grid,
  .fl-footer-grid {
    grid-template-columns: 1fr;
  }

  .fl-route-note {
    grid-template-columns: 3.4rem 1fr;
  }
}
`;
