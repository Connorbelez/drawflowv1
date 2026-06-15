import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";

import "./fairlend-investor-overview.css";

const assetBase = "/assets/fairlend-investor-page-jun14";

const investorPageAssets = {
  building: `${assetBase}/hero-multifamily-building-photo.webp`,
  blueprint: `${assetBase}/hero-blueprint-board.webp`,
  neighborhoodSketch: `${assetBase}/paths-neighborhood-sketch.webp`,
  privateMortgageLinework: `${assetBase}/private-mortgage-house-linework.webp`,
  buildFundingLinework: `${assetBase}/build-funding-blueprint-linework.webp`,
} as const;

const sectionRailItems = [
  {
    id: "investor-overview",
    label: "Investor Overview",
    number: "01",
    tone: "dark",
  },
  {
    id: "investor-paths",
    label: "Investor Paths",
    number: "02",
    tone: "paper",
  },
] as const;

type SectionRailItem = (typeof sectionRailItems)[number];

const navItems = [
  { label: "Financing Solutions", to: "/start", hasMenu: true },
  {
    label: "Investor Opportunities",
    to: "/investors",
    hasMenu: true,
    active: true,
  },
  { label: "Who We Are", to: "/about", hasMenu: true },
  { label: "Resources", to: "/resources", hasMenu: true },
  { label: "Contact", to: "/contact" },
] as const;

const pathCards = [
  {
    number: "01",
    title: "Private Mortgage Opportunities",
    body: "Review whole-mortgage and syndicated private mortgage opportunities through the Fairlend Marketplace.",
    cta: "Explore Private Mortgage Opportunities",
    to: "/start/investor",
    image: investorPageAssets.privateMortgageLinework,
    imageAlt: "Architectural line drawing of a detached residential house.",
    variant: "green",
  },
  {
    number: "02",
    title: "Build Funding Opportunities",
    body: "Review construction-backed housing opportunities with higher capital requirements, construction-specific risk, and target-return profiles that vary by opportunity.",
    cta: "Explore Build Funding Opportunities",
    to: "/start/investor",
    image: investorPageAssets.buildFundingLinework,
    imageAlt:
      "Blueprint line drawing of a mid-rise residential build under construction.",
    variant: "blue",
  },
] as const;

export function FairlendInvestorOverview(): ReactElement {
  const [activeSectionId, setActiveSectionId] =
    useState<SectionRailItem["id"]>("investor-overview");
  const activeRailSection = useMemo(
    () =>
      sectionRailItems.find((section) => section.id === activeSectionId) ??
      sectionRailItems[0],
    [activeSectionId]
  );

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      return;
    }

    const sections = sectionRailItems
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              second.intersectionRatio - first.intersectionRatio
          )[0];

        if (activeEntry?.target instanceof HTMLElement) {
          const sectionId = activeEntry.target.dataset.investorSection;
          if (
            sectionId === "investor-overview" ||
            sectionId === "investor-paths"
          ) {
            setActiveSectionId(sectionId);
          }
        }
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0.2, 0.45, 0.7],
      }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <main className="fairlend-investor-overview">
      <FairlendInvestorNav />
      <div className="fairlend-investor-overview__shell">
        <FairlendInvestorRail section={activeRailSection} />
        <section
          aria-labelledby="fairlend-investor-hero-title"
          className="fairlend-investor-section fairlend-investor-overview__hero"
          data-investor-section="investor-overview"
          id="investor-overview"
        >
          <div className="fairlend-investor-hero-copy">
            <SectionMarker label="Investor Overview" number="01" tone="dark" />
            <h1
              aria-label="Real estate-backed investing, managed by Fairlend"
              id="fairlend-investor-hero-title"
            >
              <span>Real estate-backed</span>
              <span>investing, managed</span>
              <span>by Fairlend</span>
            </h1>
            <p>
              Two paths - private mortgage opportunities and construction-backed
              build funding - with underwriting, administration, and execution
              support behind both.
            </p>
            <div className="fairlend-investor-hero-copy__actions">
              <Button
                className="fairlend-investor-button fairlend-investor-button--primary"
                render={<Link preload="intent" to="/contact" viewTransition />}
                size="xl"
              >
                Request Investor Information
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                className="fairlend-investor-button fairlend-investor-button--outline"
                render={
                  <Link preload="intent" to="/start/investor" viewTransition />
                }
                size="xl"
                variant="outline"
              >
                Explore Marketplace Opportunities
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
          <InvestorHeroCollage />
        </section>
        <section
          aria-labelledby="fairlend-investor-path-title"
          className="fairlend-investor-section fairlend-investor-paths"
          data-investor-section="investor-paths"
          id="investor-paths"
        >
          <div className="fairlend-investor-paths__intro">
            <SectionMarker label="Investor Paths" number="02" tone="paper" />
            <h2 id="fairlend-investor-path-title">
              Choose your investor path.
            </h2>
            <div className="fairlend-investor-short-rule" />
            <p>
              Two distinct ways to invest in real estate-backed opportunities.
              One experienced team behind every investment.
            </p>
            <img
              alt=""
              aria-hidden="true"
              className="fairlend-investor-paths__sketch"
              decoding="async"
              height={242}
              loading="lazy"
              src={investorPageAssets.neighborhoodSketch}
              width={620}
            />
          </div>
          <div className="fairlend-investor-paths__cards">
            {pathCards.map((card) => (
              <InvestorPathCard key={card.number} {...card} />
            ))}
          </div>
        </section>
        <FairlendInvestorFooter />
      </div>
    </main>
  );
}

function FairlendInvestorNav(): ReactElement {
  return (
    <header className="fairlend-investor-nav">
      <Link
        aria-label="Fairlend home"
        className="fairlend-investor-nav__brand"
        preload="intent"
        to="/"
        viewTransition
      >
        <strong>Fairlend</strong>
        <span aria-hidden="true" />
        <em>Brokerage &amp; Investment Company</em>
      </Link>
      <nav
        aria-label="Investor navigation"
        className="fairlend-investor-nav__links"
      >
        {navItems.map((item) => (
          <Link
            className="fairlend-investor-nav__link"
            data-active={"active" in item && item.active ? "" : undefined}
            key={item.label}
            preload="intent"
            to={item.to}
            viewTransition
          >
            {item.label}
            {"hasMenu" in item && item.hasMenu ? (
              <ChevronDown aria-hidden="true" />
            ) : null}
          </Link>
        ))}
      </nav>
      <Button
        className="fairlend-investor-nav__cta"
        render={<Link preload="intent" to="/contact" viewTransition />}
        size="xl"
      >
        Get in touch
      </Button>
      <span aria-hidden="true" className="fairlend-investor-nav__divider" />
      <Link
        className="fairlend-investor-nav__language"
        preload="intent"
        to="/investors"
        viewTransition
      >
        FR
      </Link>
    </header>
  );
}

function InvestorHeroCollage(): ReactElement {
  return (
    <div aria-hidden="true" className="fairlend-investor-collage">
      <div className="fairlend-investor-collage__dot-field" />
      <div className="fairlend-investor-collage__crosshair" />
      <img
        alt=""
        className="fairlend-investor-collage__blueprint"
        decoding="async"
        fetchPriority="high"
        height={781}
        src={investorPageAssets.blueprint}
        width={520}
      />
      <img
        alt=""
        className="fairlend-investor-collage__building"
        decoding="async"
        fetchPriority="high"
        height={1250}
        src={investorPageAssets.building}
        width={832}
      />
    </div>
  );
}

function FairlendInvestorFooter(): ReactElement {
  return (
    <footer className="fairlend-investor-footer">
      <Link
        aria-label="Fairlend home"
        className="fairlend-investor-footer__brand"
        preload="intent"
        to="/"
        viewTransition
      >
        <strong>Fairlend</strong>
        <span aria-hidden="true" />
        <em>
          Better capital.
          <br />
          Better outcomes.
        </em>
      </Link>
      <div className="fairlend-investor-footer__canada">
        <MapleLeafIcon />
        <span>Proudly Canadian</span>
      </div>
      <nav
        aria-label="Investor footer navigation"
        className="fairlend-investor-footer__links"
      >
        <a href="/careers">Careers</a>
        <Link preload="intent" to="/resources" viewTransition>
          News &amp; Insights
        </Link>
        <a href="/privacy">Privacy</a>
      </nav>
      <Button
        className="fairlend-investor-footer__cta"
        render={<Link preload="intent" to="/contact" viewTransition />}
        size="xl"
        variant="outline"
      >
        Get in touch
        <ArrowRight aria-hidden="true" />
      </Button>
    </footer>
  );
}

function MapleLeafIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="fairlend-investor-footer__maple"
      focusable="false"
      viewBox="540 400 3720 4332"
    >
      <path d="m2490 4430 l-45 -863 a95 95 0 0 1 111 -98 l859 151 l-116 -320 a65 65 0 0 1 20 -73 l941 -762 l-212 -99 a65 65 0 0 1 -34 -79 l186 -572 l-542 115 a65 65 0 0 1 -73 -38 l-105 -247 l-423 454 a65 65 0 0 1 -111 -57 l204 -1052 l-327 189 a65 65 0 0 1 -91 -27 l-332 -652 l-332 652 a65 65 0 0 1 -91 27 l-327 -189 204 1052 a65 65 0 0 1 -111 57 l-423 -454 l-105 247 a65 65 0 0 1 -73 38 l-542 -115 186 572 a65 65 0 0 1 -34 79 l-212 99 941 762 a65 65 0 0 1 20 73 l-116 320 859 151 a95 95 0 0 1 111 98 l-45 863 z" />
    </svg>
  );
}

function InvestorPathCard({
  body,
  cta,
  image,
  imageAlt,
  number,
  title,
  to,
  variant,
}: {
  body: string;
  cta: string;
  image: string;
  imageAlt: string;
  number: string;
  title: string;
  to: "/start/investor";
  variant: "blue" | "green";
}): ReactElement {
  return (
    <Card
      className="fairlend-investor-path-card"
      data-variant={variant}
      render={<article />}
    >
      <div className="fairlend-investor-path-card__number">{number}</div>
      <img
        alt={imageAlt}
        aria-hidden="true"
        className="fairlend-investor-path-card__art"
        decoding="async"
        height={variant === "blue" ? 600 : 520}
        loading="lazy"
        src={image}
        width={variant === "blue" ? 518 : 468}
      />
      <div className="fairlend-investor-path-card__content">
        <h3>{title}</h3>
        <span aria-hidden="true" />
        <p>{body}</p>
      </div>
      <Button
        className="fairlend-investor-path-card__cta"
        render={<Link preload="intent" to={to} viewTransition />}
        size="xl"
        variant="outline"
      >
        {cta}
        <ArrowRight aria-hidden="true" />
      </Button>
    </Card>
  );
}

function SectionMarker({
  label,
  number,
  tone,
}: {
  label: string;
  number: string;
  tone: "dark" | "paper";
}): ReactElement {
  return (
    <div className="fairlend-investor-section-marker" data-tone={tone}>
      <strong>{number}</strong>
      <span aria-hidden="true" />
      <p>{label}</p>
      <i aria-hidden="true" />
    </div>
  );
}

export function FairlendInvestorRail({
  ariaLabel = "Investor section",
  section,
}: {
  ariaLabel?: string;
  section: SectionRailItem;
}): ReactElement {
  return (
    <aside
      aria-label={ariaLabel}
      className="fairlend-investor-rail fairlend-investor-rail--sticky"
      data-tone={section.tone}
    >
      <span aria-hidden="true" />
      <p className="fairlend-investor-rail__animated" key={section.id}>
        {section.label}
      </p>
      <span aria-hidden="true" />
      <p>Built for communities.</p>
      <span aria-hidden="true" />
      <p>Made to last.</p>
      <strong
        className="fairlend-investor-rail__animated"
        key={`${section.id}-number`}
      >
        {section.number}
      </strong>
    </aside>
  );
}
