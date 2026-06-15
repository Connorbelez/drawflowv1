import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { ReactElement } from "react";
import { Card } from "#/components/ui/card.tsx";

import "./-about.css";

export const Route = createFileRoute("/about")({
  component: AboutFairlendPage,
  head: () => ({
    meta: [
      {
        title: "About Fairlend",
      },
      {
        name: "description",
        content:
          "Fairlend is a Canadian brokerage and investment company providing private mortgages, investor opportunities, and construction financing.",
      },
    ],
    links: aboutHeroPreloads.map((href) => ({
      rel: "preload",
      as: "image",
      href,
    })),
  }),
});

const aboutAssetBase = "/assets/about-webp/webp";

const aboutAssets = {
  blueprint: `${aboutAssetBase}/front-elevation-blueprint.webp`,
  goodHomesNote: `${aboutAssetBase}/good-homes-note.webp`,
  heroHouse: `${aboutAssetBase}/hero-house-photo.webp`,
  mortgageCommitment: `${aboutAssetBase}/mortgage-commitment-document-transparent.webp`,
  pipelineSnapshot: `${aboutAssetBase}/pipeline-snapshot-note-transparent.webp`,
  residentialFile: `${aboutAssetBase}/residential-mortgage-file-card-transparent.webp`,
  rightBlueprintStrip: `${aboutAssetBase}/right-blueprint-draft-visible-strip.webp`,
  sideHouse: `${aboutAssetBase}/side-house-photo.webp`,
  torontoSkyline: `${aboutAssetBase}/toronto-skyline-sketch.webp`,
} as const;

const aboutHeroPreloads = [
  aboutAssets.heroHouse,
  aboutAssets.blueprint,
  aboutAssets.goodHomesNote,
  aboutAssets.mortgageCommitment,
  aboutAssets.residentialFile,
  aboutAssets.pipelineSnapshot,
  aboutAssets.sideHouse,
] as const;

const navItems = [
  {
    label: "Financing Solutions",
    hasMenu: true,
    href: "/construction-draw-financing",
  },
  { label: "Investor Opportunities", hasMenu: true, href: "/investors" },
  { label: "Who We Are", active: true, href: "/about" },
  { label: "Resources", hasMenu: true, href: "/resources" },
  { label: "Contact", href: "/contact" },
] as const;

function AboutFairlendPage(): ReactElement {
  return (
    <main aria-label="About Fairlend" className="about-page">
      <section aria-labelledby="about-hero-title" className="about-hero">
        <FairlendHeader />

        <div className="about-hero-grid">
          <div className="about-copy">
            <div className="about-section-kicker">
              <span>01</span>
              <i aria-hidden />
              <p>About Fairlend</p>
            </div>

            <h1 className="about-title" id="about-hero-title">
              <span>About</span>
              <span>Fairlend</span>
            </h1>

            <div className="about-copy-rule" aria-hidden />

            <p className="about-intro">
              Fairlend is a Canadian brokerage and investment company providing
              private mortgages, investor opportunities, and construction
              financing for housing that strengthens communities and delivers
              better outcomes for all.
            </p>

            <a className="about-cta" href="/construction-draw-financing">
              <span>Explore our solutions</span>
              <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <div
            aria-label="Fairlend housing finance document collage"
            className="about-collage"
          >
            <img
              alt=""
              className="about-photo-main about-paper-shadow"
              decoding="async"
              fetchPriority="high"
              src={aboutAssets.heroHouse}
            />
            <img
              alt=""
              className="about-blueprint about-paper-shadow"
              decoding="async"
              fetchPriority="high"
              src={aboutAssets.blueprint}
            />
            <img
              alt=""
              className="about-blueprint-strip"
              decoding="async"
              src={aboutAssets.rightBlueprintStrip}
            />
            <img
              alt=""
              className="about-commitment about-paper-shadow"
              decoding="async"
              src={aboutAssets.mortgageCommitment}
            />
            <img
              alt=""
              className="about-note about-paper-shadow"
              decoding="async"
              src={aboutAssets.goodHomesNote}
            />
            <img
              alt=""
              className="about-photo-side about-paper-shadow"
              decoding="async"
              src={aboutAssets.sideHouse}
            />
            <img
              alt=""
              className="about-file-card about-paper-shadow"
              decoding="async"
              src={aboutAssets.residentialFile}
            />
            <img
              alt=""
              className="about-pipeline about-paper-shadow"
              decoding="async"
              src={aboutAssets.pipelineSnapshot}
            />

            <InvestorOpportunityCard />
            <FairlendStamp />
          </div>
        </div>
      </section>
    </main>
  );
}

function FairlendHeader(): ReactElement {
  return (
    <header className="about-header">
      <a aria-label="Fairlend home" className="about-brand" href="/">
        <span>Fairlend</span>
        <b aria-hidden />
        <small>
          Brokerage &<br />
          Investment
          <br />
          Company
        </small>
      </a>

      <nav aria-label="Primary navigation" className="about-nav">
        {navItems.map((item) => (
          <a
            className={item.active ? "is-active" : undefined}
            href={item.href}
            key={item.label}
          >
            <span>{item.label}</span>
            {item.hasMenu ? <ChevronDown aria-hidden="true" /> : null}
          </a>
        ))}
      </nav>

      <div className="about-header-actions">
        <a className="about-touch" href="/contact">
          Get in touch
        </a>
        <i aria-hidden />
        <a className="about-language" href="/about?lang=fr" lang="fr">
          FR
        </a>
      </div>
    </header>
  );
}

function InvestorOpportunityCard(): ReactElement {
  return (
    <Card
      aria-label="Investor Opportunity"
      className="about-investor-card about-paper-shadow"
      render={<article />}
    >
      <p>Investor Opportunity</p>
      <div aria-hidden />
      <span>12-Month First Mortgage</span>
      <strong>7.85%</strong>
      <small>Target Return</small>
      <em>
        Secured by
        <br />
        Canadian
        <br />
        Residential
        <br />
        Real Estate
      </em>
      <a href="/investors">
        <span>View Investment Opportunities</span>
        <ArrowRight aria-hidden="true" />
      </a>
    </Card>
  );
}

function FairlendStamp(): ReactElement {
  return (
    <div aria-label="Better capital better outcomes" className="about-stamp">
      <span>Better Capital</span>
      <strong>Fairlend</strong>
      <small>Better Outcomes</small>
    </div>
  );
}
