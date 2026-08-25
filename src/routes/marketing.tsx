import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactElement } from "react";
import { useRef } from "react";

import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { blueprintAsset, renderAsset } from "./-marketing-contracts";
import {
  GridOverlay,
  useGridOverlay,
  useLeadershipDealDeskScene,
  useMarketingScrollScene,
} from "./-marketing-motion";
import { MarketingProof } from "./-marketing-proof";
import { AuthorityPanel, RegulatoryCard } from "./-marketing-sections";
import "./-marketing.css";

export const Route = createFileRoute("/marketing")({
  // Static marketing surface: no loaders, no server data, client-rendered for GSAP.
  ssr: false,
  component: MarketingPage,
  head: getMarketingPageHead,
});

function MarketingPage(): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const heroScrollRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const proofOverlapRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGridOverlay(rootRef);
  useLeadershipDealDeskScene(rootRef);

  useMarketingScrollScene({
    contentRef,
    heroScrollRef,
    pinRef,
    proofOverlapRef,
    renderRef,
    rootRef,
  });

  return (
    <main className="mkt-shell" ref={rootRef}>
      <a className="mkt-skip-link" href="#main-content">
        Skip to content
      </a>
      <section
        aria-labelledby="marketing-hero-title"
        className="mkt-hero-scroll"
        ref={heroScrollRef}
      >
        <div className="mkt-hero-pinned" ref={pinRef}>
          <div aria-hidden className="mkt-hero-progress" />
          <div aria-hidden className="mkt-media-stage">
            <img
              alt="Architectural blueprint of a multiplex development"
              className="mkt-hero-blueprint"
              decoding="async"
              fetchPriority="high"
              height={1333}
              src={blueprintAsset}
              width={1180}
            />
            <div className="mkt-render-layer" ref={renderRef}>
              <img
                alt="Finished multiplex rendering emerging from the blueprint"
                className="mkt-hero-render"
                decoding="async"
                fetchPriority="high"
                height={1562}
                src={renderAsset}
                width={1384}
              />
            </div>
            <div className="mkt-copy-scrim" />
            <div className="mkt-bottom-fade" />
          </div>

          <DirectionalHoverHeader />

          <div className="mkt-hero-content" ref={contentRef}>
            <div className="mkt-left-stack">
              <div className="mkt-left-track">
                <section className="mkt-left-panel mkt-hero-panel">
                  <div className="mkt-hero-copy">
                    <p className="mkt-eyebrow">FairLend Mortgage</p>
                    <div className="mkt-headline-stack">
                      <h1 className="mkt-headline" id="marketing-hero-title">
                        Private Lending and Construction Financing That Works
                        Before, During, and After the Loan Closes
                      </h1>
                    </div>
                    <p className="mkt-hero-subcopy">
                      FairLend is a Canadian private lending and construction
                      financing company built around integration. Whole-picture
                      underwriting, construction-aware draw planning, and
                      end-to-end mortgage administration—so borrowers get
                      responsible structures and investors get disciplined
                      visibility.
                    </p>
                  </div>

                  <div className="mkt-hero-actions">
                    <Button
                      className="mkt-primary-action"
                      render={<Link to="/contact" />}
                      size="xl"
                    >
                      Get a private mortgage
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    <div className="mkt-hero-alt-actions">
                      <Link
                        className="mkt-hero-alt-link"
                        to="/builder/proposals/new"
                      >
                        Finance a construction project
                      </Link>
                      <Link className="mkt-hero-alt-link" to="/investors">
                        Explore investor opportunities
                      </Link>
                    </div>
                  </div>
                </section>

                <section className="mkt-left-panel mkt-authority-section">
                  <AuthorityPanel />
                </section>
              </div>
            </div>
            <RegulatoryCard />
          </div>
        </div>
      </section>

      <div
        className="mkt-stick-overlap"
        id="main-content"
        ref={proofOverlapRef}
      >
        <MarketingProof />
      </div>
      <GridOverlay />
    </main>
  );
}

function getMarketingPageHead() {
  return {
    meta: [
      {
        title: "FairLend Mortgage | Construction draw financing",
      },
      {
        name: "description",
        content:
          "Build financing, private mortgages, and investor access for Canadian housing, underwritten with DrawFlow transparency.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: "/assets/CleanShot Jun 8 Hero Section Blueprint.png",
      },
      {
        rel: "preload",
        as: "image",
        href: "/assets/Blueprint Style Rendering Jun 8 2026 (1).png",
      },
    ],
  };
}
