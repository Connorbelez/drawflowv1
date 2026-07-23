import { useGSAP } from "@gsap/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Award,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Eye,
  FileSignature,
  Gauge,
  Gavel,
  Home,
  Landmark,
  Leaf,
  Mail,
  MapPin,
  PenTool,
  Percent,
  Phone,
  Search,
  Shield,
  ShieldCheck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import "./-marketing.css";

export const Route = createFileRoute("/marketing")({
  // Static marketing surface: no loaders, no server data, client-rendered for GSAP.
  ssr: false,
  component: MarketingPage,
  head: getMarketingPageHead,
});

const renderAsset = "/assets/CleanShot Jun 8 Hero Section Blueprint.png";
const blueprintAsset = "/assets/Blueprint Style Rendering Jun 8 2026 (1).png";
const buildFinancingAsset =
  "/assets/fairlend-path-build-financing-multiplex-construction.webp";
const multiplexAsset = "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
const privateMortgagesAsset = "/assets/fairlend-path-private-mortgages.webp";
const neighborhoodSketchAsset =
  "/assets/fairlend-investor-overview/paths-neighborhood-sketch.webp";
const leadershipDeskAsset =
  "/assets/fairlend-leadership-elie/images/hero-housing-blueprint-canvas.webp";
const fairlendLicences = [
  "FairLend Management Inc",
  "Legal business name: FairLend Management Inc",
  "Brokerage Licence #13827",
  "Administrator Licence #13828",
] as const;

const leadershipCapabilities = [
  {
    copy: "FSRA-licensed mortgage brokerage insight across complex borrowing and investing needs.",
    icon: ShieldCheck,
    title: "Brokerage expertise",
  },
  {
    copy: "End-to-end financing for land, construction, renovation, and long-term stabilization.",
    icon: Landmark,
    title: "Construction finance",
  },
  {
    copy: "Strategic access to insured rental-housing programs, leverage, and flexibility.",
    icon: FileSignature,
    title: "MLI Select planning",
  },
  {
    copy: "Compliant structures that align risk, cash flow, lender appetite, and exit strategy.",
    icon: Gavel,
    title: "Deal structuring",
  },
] as const;

const leadershipMetrics = [
  {
    copy: "Across mortgage brokerage, private lending, and investment finance.",
    countTo: 25,
    icon: ShieldCheck,
    label: "Years experience",
    prefix: "",
    suffix: "+",
    value: "25+",
  },
  {
    copy: "Residential, commercial, construction, and stabilization capital.",
    countTo: 2,
    icon: Landmark,
    label: "Total financed",
    prefix: "$",
    suffix: "B+",
    value: "$2B+",
  },
  {
    copy: "Relationships across borrowers, lenders, brokers, and investors.",
    countTo: 160,
    icon: Users,
    label: "Lenders & borrowers",
    prefix: "",
    suffix: "+",
    value: "160+",
  },
  {
    copy: "GTA market knowledge with national capital relationships.",
    icon: MapPin,
    label: "Toronto-based",
    value: "GTA",
  },
] as const;

const leadershipTrustSignals = [
  {
    icon: ShieldCheck,
    label: "Regulated. Trusted. Accountable.",
  },
  {
    icon: Users,
    label: "Client-first approach",
  },
  {
    icon: Award,
    label: "Transparent communication",
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    label: "Results that speak for themselves",
  },
] as const;

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

const gridColumnIds = [
  "col-01",
  "col-02",
  "col-03",
  "col-04",
  "col-05",
  "col-06",
  "col-07",
  "col-08",
  "col-09",
  "col-10",
  "col-11",
  "col-12",
];

const baselineRows = Array.from(
  { length: 80 },
  (_, index) => `base-${index + 1}`
);

function GridOverlay(): ReactElement {
  return (
    <div aria-hidden className="mkt-grid-overlay">
      <div className="mkt-grid-wrap">
        <div className="mkt-grid-guides">
          {gridColumnIds.map((id, index) => (
            <div className="mkt-grid-col" key={id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        <div className="mkt-grid-baseline">
          {baselineRows.map((id) => (
            <div key={id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function useGridOverlay(
  rootRef: React.RefObject<HTMLElement | null>
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [gridOn, setGridOn] = useState(false);

  useEffect(() => {
    rootRef.current?.classList.toggle("mkt-grid-on", gridOn);
  }, [gridOn, rootRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "g" || event.key === "G") {
        setGridOn((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useOpticalAlignment(rootRef);

  return [gridOn, setGridOn];
}

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function useOpticalAlignment(
  rootRef: React.RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof document === "undefined") {
      return;
    }

    const alignInk = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) {
        return;
      }

      const displayHeadlines = root.querySelectorAll(
        ".mkt-headline, .mkt-gap-copy h2, .mkt-answer-copy h2, .mkt-model-header h2, .mkt-why-header h2, .mkt-final-copy h2, .mkt-authority-panel h2"
      );
      for (const el of displayHeadlines) {
        const htmlEl = el as HTMLElement;
        htmlEl.style.marginLeft = "0px";
        const ch = (htmlEl.textContent || "").trim()[0];
        if (!ch) {
          continue;
        }
        const style = getComputedStyle(htmlEl);
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.textAlign = "left";
        const metrics = ctx.measureText(ch);
        const abl = (metrics as unknown as { actualBoundingBoxLeft?: number })
          .actualBoundingBoxLeft;
        if (abl && Number.isFinite(abl)) {
          htmlEl.style.marginLeft = `${abl.toFixed(2)}px`;
        }
      }
    };

    const fontReady = document.fonts?.ready;
    if (fontReady) {
      fontReady.then(alignInk);
    } else {
      alignInk();
    }
    const debouncedAlignInk = debounce(alignInk, 150);
    window.addEventListener("resize", debouncedAlignInk);
    return () => window.removeEventListener("resize", debouncedAlignInk);
  }, [rootRef]);
}

function useMarketingScrollScene({
  contentRef,
  heroScrollRef,
  pinRef,
  proofOverlapRef,
  renderRef,
  rootRef,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  heroScrollRef: React.RefObject<HTMLElement | null>;
  pinRef: React.RefObject<HTMLDivElement | null>;
  proofOverlapRef: React.RefObject<HTMLDivElement | null>;
  renderRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  useGSAP(
    () => {
      const section = heroScrollRef.current;
      const pinEl = pinRef.current;
      const proofOverlapEl = proofOverlapRef.current;
      const renderEl = renderRef.current;
      const contentEl = contentRef.current;
      const leftStack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-stack");
      const leftTrack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-track");

      if (
        !(
          section &&
          pinEl &&
          proofOverlapEl &&
          renderEl &&
          contentEl &&
          leftStack &&
          leftTrack
        )
      ) {
        return;
      }

      const progressEl = pinEl.querySelector<HTMLElement>(".mkt-hero-progress");
      if (!progressEl) {
        return;
      }

      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const desktopMedia = window.matchMedia("(min-width: 1024px)");

      if (media.matches) {
        renderEl.classList.add("mkt-render-reduced");
        leftStack.classList.add("mkt-left-stack-reduced");
        proofOverlapEl.classList.add("mkt-stick-overlap-reduced");
        return () => {
          renderEl.classList.remove("mkt-render-reduced");
          leftStack.classList.remove("mkt-left-stack-reduced");
          proofOverlapEl.classList.remove("mkt-stick-overlap-reduced");
        };
      }

      gsap.registerPlugin(CustomEase, ScrollTrigger);
      const panelGateEase = CustomEase.create(
        "fairlendPanelGate",
        "M0,0 C0.74,0 0.18,1 1,1"
      );

      if (!desktopMedia.matches) {
        const blueprintEl = section.querySelector<HTMLElement>(
          ".mkt-hero-blueprint"
        );

        gsap.set([pinEl, blueprintEl, renderEl, proofOverlapEl, leftTrack], {
          force3D: true,
          transformOrigin: "50% 50%",
        });

        const timeline = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            end: "+=92%",
            invalidateOnRefresh: true,
            scrub: true,
            start: "top top",
            trigger: section,
          },
        });

        const heroScrollTrigger = timeline.scrollTrigger;

        timeline
          .fromTo(
            blueprintEl,
            { scale: 1.03, yPercent: 2 },
            { duration: 1, scale: 1.1, yPercent: -4 },
            0
          )
          .fromTo(
            renderEl,
            {
              "--mask-x": "82%",
              "--mask-y": "52%",
              "--r1": "29vmax",
              "--r2": "45.5vmax",
              "--r3": "19.5vmax",
              "--r4": "35vmax",
              "--r5": "21.5vmax",
              "--r6": "38vmax",
              "--r7": "19.5vmax",
              "--r8": "34vmax",
              scale: 1,
              yPercent: 0,
            },
            {
              "--mask-x": "112%",
              "--mask-y": "-8%",
              "--r1": "0vmax",
              "--r2": "4vmax",
              "--r3": "0vmax",
              "--r4": "3vmax",
              "--r5": "0vmax",
              "--r6": "2.5vmax",
              "--r7": "0vmax",
              "--r8": "2vmax",
              duration: 1,
              scale: 1.06,
              yPercent: -4,
            },
            0
          )
          .to(
            leftTrack,
            {
              duration: 0.5,
              ease: panelGateEase,
              y: () => -leftStack.clientHeight,
            },
            0.28
          )
          .to(
            contentEl,
            {
              duration: 0.72,
              opacity: 0.9,
              yPercent: -3.5,
            },
            0
          )
          .to(
            pinEl,
            {
              duration: 0.28,
              opacity: 0.88,
              rotate: -1.8,
              scale: 0.9,
              yPercent: -2,
            },
            0.72
          )
          .fromTo(
            proofOverlapEl,
            {
              scale: 0.98,
              y: () => window.innerHeight * 0.12,
            },
            {
              duration: 0.28,
              scale: 1,
              y: 0,
            },
            0.72
          )
          .fromTo(
            progressEl,
            { scaleX: 0, transformOrigin: "0% 50%" },
            { duration: 1, scaleX: 1 },
            0
          );

        const refreshFrame = requestAnimationFrame(() => {
          ScrollTrigger.refresh();
          heroScrollTrigger?.update();
        });

        return () => {
          cancelAnimationFrame(refreshFrame);
        };
      }

      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          anticipatePin: 1,
          end: "+=145%",
          invalidateOnRefresh: true,
          pin: pinEl,
          scrub: true,
          start: "top top",
          trigger: section,
        },
      });

      const heroScrollTrigger = timeline.scrollTrigger;

      gsap.set([pinEl, proofOverlapEl], {
        force3D: true,
        transformOrigin: "50% 50%",
      });

      timeline
        .to(
          renderEl,
          {
            duration: 0.62,
            "--mask-x": "112%",
            "--mask-y": "-8%",
            "--r1": "0vmax",
            "--r2": "4vmax",
            "--r3": "0vmax",
            "--r4": "3vmax",
            "--r5": "0vmax",
            "--r6": "2.5vmax",
            "--r7": "0vmax",
            "--r8": "2vmax",
          },
          0
        )
        .to(
          leftTrack,
          {
            duration: 0.36,
            ease: panelGateEase,
            y: () => -leftStack.clientHeight,
          },
          0.04
        )
        .to(
          contentEl,
          {
            duration: 0.34,
            opacity: 0.78,
            yPercent: -3,
          },
          0.62
        )
        .to(
          pinEl,
          {
            duration: 0.38,
            opacity: 0.86,
            rotate: -2.8,
            scale: 0.88,
            yPercent: -3,
          },
          0.62
        )
        .fromTo(
          proofOverlapEl,
          {
            scale: 0.97,
            y: () => window.innerHeight * 0.16,
          },
          {
            duration: 0.38,
            scale: 1,
            y: 0,
          },
          0.62
        )
        .fromTo(
          progressEl,
          { scaleX: 0, transformOrigin: "0% 50%" },
          { duration: 1, scaleX: 1 },
          0
        );

      let active = true;
      const refreshScene = () => {
        if (!active) {
          return;
        }

        ScrollTrigger.refresh();
        heroScrollTrigger?.update();
      };

      const refreshFrame = requestAnimationFrame(refreshScene);

      Promise.all([
        ...Array.from(section.querySelectorAll("img"), (image) =>
          image.complete
            ? Promise.resolve()
            : image.decode?.().catch(() => undefined)
        ),
        document.fonts?.ready ?? Promise.resolve(),
      ]).then(refreshScene);

      return () => {
        active = false;
        cancelAnimationFrame(refreshFrame);
      };
    },
    { dependencies: [], scope: rootRef }
  );
}

function useLeadershipDealDeskScene(
  rootRef: React.RefObject<HTMLElement | null>
) {
  useGSAP(
    () => {
      const root = rootRef.current;
      const section = root?.querySelector<HTMLElement>(
        "[data-leadership-desk]"
      );

      if (!(root && section)) {
        return;
      }

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      );
      if (reducedMotion.matches) {
        section.classList.add("mkt-leadership-motion-complete");
        return () => {
          section.classList.remove("mkt-leadership-motion-complete");
        };
      }

      gsap.registerPlugin(CustomEase, ScrollTrigger);

      const dealDeskEase = CustomEase.create(
        "fairlendDealDesk",
        "M0,0 C0.16,0.88 0.22,1 1,1"
      );
      const frameRules = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-rule")
      );
      const headerItems = Array.from(
        section.querySelectorAll<HTMLElement>(
          ".mkt-leadership-head [data-leadership-reveal]"
        )
      );
      const titleLines = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-title-line")
      );
      const capabilityCards = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-capability")
      );
      const statRows = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-stat")
      );
      const trustItems = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-trust-item")
      );
      const artImage = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-image"
      );
      const artPlate = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-plate"
      );
      const artGrid = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-grid"
      );
      const routeLine = section.querySelector<SVGPathElement>(
        ".mkt-leadership-route-line"
      );
      const routeNodes = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-route-node")
      );
      const approvalChip = section.querySelector<HTMLElement>(
        ".mkt-leadership-approval-chip"
      );
      const mapPin = section.querySelector<HTMLElement>(
        ".mkt-leadership-map-pin"
      );
      const quote = section.querySelector<HTMLElement>(".mkt-leadership-quote");
      const quoteMark = section.querySelector<HTMLElement>(
        ".mkt-leadership-quote-mark"
      );
      const action = section.querySelector<HTMLElement>(
        ".mkt-leadership-action"
      );
      const countNodes = Array.from(
        section.querySelectorAll<HTMLElement>(
          ".mkt-leadership-count[data-count-to]"
        )
      );

      for (const count of countNodes) {
        const prefix = count.dataset.countPrefix ?? "";
        const suffix = count.dataset.countSuffix ?? "";
        count.textContent = `${prefix}0${suffix}`;
      }

      gsap.set(
        [
          section,
          artPlate,
          artImage,
          artGrid,
          approvalChip,
          mapPin,
          quote,
          action,
          ...capabilityCards,
          ...statRows,
          ...trustItems,
        ].filter(Boolean),
        {
          force3D: true,
          transformOrigin: "50% 50%",
        }
      );

      const entranceTimeline = gsap.timeline({
        defaults: { ease: dealDeskEase },
        scrollTrigger: {
          end: "bottom 38%",
          once: false,
          start: "top 72%",
          toggleActions: "play none none reverse",
          trigger: section,
        },
      });

      entranceTimeline
        .fromTo(
          section,
          { "--leadership-paper-wash": 0.2 },
          { "--leadership-paper-wash": 1, duration: 0.7 },
          0
        )
        .fromTo(
          frameRules,
          { scaleX: 0, scaleY: 0 },
          {
            duration: 0.52,
            scaleX: 1,
            scaleY: 1,
            stagger: 0.035,
          },
          0
        )
        .fromTo(
          headerItems,
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            duration: 0.42,
            stagger: 0.055,
            y: 0,
          },
          0.09
        )
        .fromTo(
          titleLines,
          { autoAlpha: 0, clipPath: "inset(0 0 100% 0)", yPercent: 74 },
          {
            autoAlpha: 1,
            clipPath: "inset(0 0 0% 0)",
            duration: 0.64,
            stagger: 0.08,
            yPercent: 0,
          },
          0.22
        )
        .fromTo(
          artPlate,
          {
            autoAlpha: 0,
            clipPath: "inset(14% 18% 18% 10%)",
            rotateX: 7,
            scale: 0.94,
            y: 34,
          },
          {
            autoAlpha: 1,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.72,
            rotateX: 0,
            scale: 1,
            y: 0,
          },
          0.26
        )
        .fromTo(
          artImage,
          { filter: "saturate(0.55) contrast(1.05)", scale: 1.08 },
          {
            duration: 0.8,
            filter: "saturate(0.98) contrast(1.03)",
            scale: 1,
          },
          0.34
        )
        .fromTo(
          artGrid,
          { autoAlpha: 0, xPercent: -10 },
          {
            autoAlpha: 1,
            duration: 0.54,
            xPercent: 0,
          },
          0.42
        )
        .fromTo(
          routeLine ? [routeLine] : [],
          { strokeDashoffset: 680 },
          {
            duration: 0.76,
            ease: "power2.inOut",
            strokeDashoffset: 0,
          },
          0.58
        )
        .fromTo(
          routeNodes,
          { autoAlpha: 0, scale: 0.35 },
          {
            autoAlpha: 1,
            duration: 0.28,
            scale: 1,
            stagger: 0.07,
          },
          0.72
        )
        .fromTo(
          [approvalChip, mapPin].filter(Boolean),
          { autoAlpha: 0, rotate: -8, scale: 0.74, y: 28 },
          {
            autoAlpha: 1,
            duration: 0.42,
            rotate: 0,
            scale: 1,
            stagger: 0.1,
            y: 0,
          },
          0.86
        )
        .fromTo(
          capabilityCards,
          { autoAlpha: 0, scale: 0.96, y: 22 },
          {
            autoAlpha: 1,
            duration: 0.42,
            scale: 1,
            stagger: 0.06,
            y: 0,
          },
          0.68
        )
        .fromTo(
          statRows,
          { autoAlpha: 0, x: 42 },
          {
            autoAlpha: 1,
            duration: 0.48,
            stagger: 0.08,
            x: 0,
          },
          0.78
        );

      countNodes.forEach((count, index) => {
        const target = Number(count.dataset.countTo);
        if (!Number.isFinite(target)) {
          return;
        }

        const state = { value: 0 };
        const prefix = count.dataset.countPrefix ?? "";
        const suffix = count.dataset.countSuffix ?? "";
        const finalValue =
          count.dataset.countFinal ?? `${prefix}${target}${suffix}`;

        entranceTimeline.to(
          state,
          {
            duration: 0.54,
            ease: "power2.out",
            onComplete: () => {
              count.textContent = finalValue;
            },
            onUpdate: () => {
              count.textContent = `${prefix}${Math.round(state.value)}${suffix}`;
            },
            snap: { value: 1 },
            value: target,
          },
          0.9 + index * 0.08
        );
      });

      entranceTimeline
        .fromTo(
          quoteMark,
          { autoAlpha: 0, scale: 0.5, x: -12 },
          { autoAlpha: 1, duration: 0.28, scale: 1, x: 0 },
          1.08
        )
        .fromTo(
          quote,
          { autoAlpha: 0, clipPath: "inset(0 100% 0 0)" },
          {
            autoAlpha: 1,
            clipPath: "inset(0 0% 0 0)",
            duration: 0.54,
          },
          1.14
        )
        .fromTo(
          trustItems,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            duration: 0.34,
            stagger: 0.06,
            y: 0,
          },
          1.22
        )
        .fromTo(
          action,
          { autoAlpha: 0, scale: 0.92, x: -12 },
          { autoAlpha: 1, duration: 0.34, scale: 1, x: 0 },
          1.25
        );

      const parallaxTimeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          end: "bottom top",
          scrub: true,
          start: "top bottom",
          trigger: section,
        },
      });

      parallaxTimeline
        .to(artImage, { duration: 1, scale: 1.035, yPercent: -3.2 }, 0)
        .to(artGrid, { duration: 1, xPercent: 6 }, 0)
        .to(statRows, { duration: 1, yPercent: -4 }, 0)
        .to(capabilityCards, { duration: 1, yPercent: 2 }, 0);

      return () => {
        section.classList.remove("mkt-leadership-motion-complete");
        for (const count of countNodes) {
          count.textContent = count.dataset.countFinal ?? count.textContent;
        }
      };
    },
    { dependencies: [], scope: rootRef }
  );
}

function AuthorityPanel(): ReactElement {
  const proof = [
    { value: "2B+", label: "in lifetime deals by Principal Broker" },
    { value: "25+ Years", label: "Broker Experience" },
  ];

  return (
    <section
      aria-label="FairLend authority and social proof"
      className="mkt-authority-panel"
    >
      <p>An Integrated Model</p>
      <h2>
        Borrow <br /> Build <br /> Lend <br /> In one place
      </h2>
      <span>
        Brokerage expertise, in-house underwriting, construction-aware draw
        management, and mortgage administration—together, not in silos.
      </span>
      <div className="mkt-authority-proof">
        {proof.map((item) => (
          <div key={item.value}>
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function LicenceList({
  ariaLabel,
  className,
}: {
  ariaLabel: string;
  className: string;
}): ReactElement {
  return (
    <ul aria-label={ariaLabel} className={className}>
      {fairlendLicences.map((licence) => (
        <li key={licence}>{licence}</li>
      ))}
    </ul>
  );
}

function RegulatoryCard(): ReactElement {
  return (
    <Card
      aria-label="FairLend regulatory licences"
      className="mkt-regulatory-card"
    >
      <div className="mkt-regulatory-header">
        <span>Licensed</span>
        <strong>FairLend Management Inc</strong>
      </div>
      <div className="mkt-regulatory-legal">
        <strong>Legal business name: FairLend Management Inc</strong>
      </div>
      <div className="mkt-regulatory-grid">
        <div>
          <strong>Brokerage Licence #13827</strong>
        </div>
        <div>
          <strong>Administrator Licence #13828</strong>
        </div>
      </div>
    </Card>
  );
}

function StructuralGapSection(): ReactElement {
  return (
    <section aria-labelledby="marketing-gap-title" className="mkt-gap-section">
      <div className="mkt-wrap">
        <div className="mkt-band mkt-gap-lead-band">
          <div className="mkt-gap-eyebrow mkt-start-1 mkt-end-13">
            <span className="mkt-section-number">01</span>
            <span>The structural gap</span>
          </div>
          <h2
            className="mkt-gap-headline mkt-start-1 mkt-end-8"
            id="marketing-gap-title"
          >
            The Private Lending Market Has a Structural Problem
          </h2>
          <div className="mkt-gap-lead mkt-start-8 mkt-end-13">
            <p>
              Borrowers often need capital faster or more flexibly than
              conventional lenders can provide. But private lending is
              frequently opaque, punitive, and abandoned the moment the deal
              closes.
            </p>
            <p>
              Builders and property owners have viable housing projects that
              stall because the financing package is incomplete, the draw
              structure is rigid, or the lender does not understand how
              construction actually unfolds.
            </p>
            <p>
              Investors want access to real estate-backed opportunities, but
              Ontario&apos;s mortgage regulator keeps finding the same problems:
              inaccurate cost-of-borrowing disclosures, undisclosed or
              miscalculated APRs, weak suitability assessments, conflicts of
              interest between brokers and administrators, and investor funds
              commingled with operational cash. In its latest supervision plan,
              FSRA found only 35.5% of reviewed files had correct APR
              calculations.
            </p>
            <strong>
              The result: deals that should work, don&apos;t. Projects that
              should finish, stall. Capital that should align with progress,
              fights against it.
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function FairlendAnswerSection(): ReactElement {
  const capabilities = [
    "Brokerage expertise paired with in-house underwriting and construction judgment.",
    "Private mortgage origination with fully managed administration after closing.",
    "Construction financing aligned with real build progress through our DrawFlow workflow.",
    "Investor visibility through the FairLend Investor Portal, not marketing promises.",
    "Recovery and legal resources that stay engaged when execution matters most.",
  ];

  return (
    <section
      aria-labelledby="marketing-answer-title"
      className="mkt-answer-section"
    >
      <div className="mkt-wrap">
        <div className="mkt-band mkt-answer-band">
          <div className="mkt-answer-eyebrow mkt-start-1 mkt-end-13">
            <span className="mkt-section-number">02</span>
            <span>The FairLend answer</span>
          </div>
          <div className="mkt-answer-copy mkt-start-1 mkt-end-7">
            <h2 id="marketing-answer-title">
              An Integrated Model, Not a Single Product
            </h2>
            <p className="mkt-answer-lead">
              FairLend brings together capabilities that are usually separated
              in the market:
            </p>
            <ul className="mkt-answer-list">
              {capabilities.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mkt-answer-positioning">
              Technology handles the workflow. Experienced people make the
              judgment calls.
            </p>
          </div>
          <div className="mkt-answer-visual mkt-start-8 mkt-end-13">
            <img
              alt="Neighborhood sketch showing integrated housing and capital planning"
              height={1240}
              loading="lazy"
              src={neighborhoodSketchAsset}
              width={1860}
            />
            <div className="mkt-answer-plate">
              <strong>DrawFlow</strong>
              <span>Construction-aware draw management</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OperatingModelSection(): ReactElement {
  const steps = [
    {
      number: "01",
      title: "Intake & Financeability Review",
      copy: "We review the full picture—borrower, property, project, capital stack, documentation, and execution risk—before we commit to a path forward.",
      icon: Search,
    },
    {
      number: "02",
      title: "Underwriting & Structuring",
      copy: "Human-led underwriting supported by AI-assisted analysis of approximately 7,000 data points. Appraisal review, legal review, and product expertise structure the file for durability.",
      icon: PenTool,
    },
    {
      number: "03",
      title: "Commitment",
      copy: "For private mortgages, our target is a 3-day path from application to commitment where the file is complete and suitable. Fast and disciplined, not automatic.",
      icon: ClipboardCheck,
    },
    {
      number: "04",
      title: "Digital Closing",
      copy: "Streamlined closing with dedicated platform lawyers and workflow infrastructure designed to reduce friction and administrative burden.",
      icon: FileSignature,
    },
    {
      number: "05",
      title: "Administration & Monitoring",
      copy: "PAD collection, automated investor disbursements, payment tracking, servicing, and ongoing milestone monitoring for construction files.",
      icon: Wallet,
    },
    {
      number: "06",
      title: "Recovery & Resolution",
      copy: "If a file becomes distressed, specialist legal resources and project recovery capabilities are already in place. Prevention first. Response second.",
      icon: Gavel,
    },
  ];

  return (
    <section
      aria-labelledby="marketing-model-title"
      className="mkt-model-section"
    >
      <div className="mkt-wrap">
        <div className="mkt-band mkt-model-band">
          <div className="mkt-model-eyebrow mkt-start-1 mkt-end-13">
            <span className="mkt-section-number">03</span>
            <span>How it works</span>
          </div>
          <div className="mkt-model-header mkt-start-1 mkt-end-5">
            <h2 id="marketing-model-title">
              From Intake to Administration, an End-to-End Workflow
            </h2>
          </div>
          <ol className="mkt-model-list mkt-start-6 mkt-end-13">
            {steps.map(({ icon: Icon, number, title, copy }) => (
              <li className="mkt-model-item" key={number}>
                <div className="mkt-model-item-header">
                  <span className="mkt-model-number">{number}</span>
                  <Icon aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function WhyFairlendSection(): ReactElement {
  const reasons = [
    {
      icon: Landmark,
      title: "One operating model, not a chain of hand-offs.",
      copy: "Origination, underwriting, administration, and draw management sit under one roof, with segregated trust accounting and clear governance. That reduces the conflicts, information loss, and reconciliations that regulators keep flagging between brokers and administrators.",
    },
    {
      icon: Percent,
      title: "Accurate cost of borrowing and real LTV discipline.",
      copy: "We calculate and disclose APRs properly, include all required charges, label estimates clearly, and document suitability. Collateral value is verified through expert appraisal review and double-appraisal processes where applicable, so LTV is grounded in reality, not optimism.",
    },
    {
      icon: MapPin,
      title: "GTA-specific expertise, not generic national lending.",
      copy: "Decades of local knowledge in Toronto real estate, construction, permitting, and appraisal dynamics. We understand this market because we operate in it.",
    },
    {
      icon: Eye,
      title: "Construction-aware, not construction-blind.",
      copy: "We walk every build after milestones. We verify progress against spec. We identify budget pressure and schedule drift before they become draw problems.",
    },
    {
      icon: Shield,
      title: "Investor safeguards built in, not bolted on.",
      copy: "Timely trust reconciliations, segregation of investor and operational funds, performance monitoring, and clear administration agreements. We treat investor capital with the custody discipline the sector demands.",
    },
    {
      icon: Users,
      title: "Human-led, technology-enabled.",
      copy: "AI supports our underwriting. Software supports our workflow. But the judgment calls come from experienced mortgage professionals, construction operators, and legal specialists.",
    },
  ];

  return (
    <section aria-labelledby="marketing-why-title" className="mkt-why-section">
      <div className="mkt-wrap">
        <div className="mkt-band mkt-why-band">
          <div className="mkt-why-eyebrow mkt-start-1 mkt-end-13">
            <span className="mkt-section-number">04</span>
            <span>Why FairLend</span>
          </div>
          <div className="mkt-why-header mkt-start-1 mkt-end-5">
            <h2 id="marketing-why-title">
              Built for Borrowers, Builders, and Investors Who Expect More
            </h2>
          </div>
          <ul className="mkt-why-list mkt-start-6 mkt-end-13">
            {reasons.map(({ icon: Icon, title, copy }) => (
              <li className="mkt-why-item" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FinalConversionSection(): ReactElement {
  return (
    <section
      aria-labelledby="marketing-final-title"
      className="mkt-final-section"
    >
      <div className="mkt-wrap">
        <div className="mkt-band mkt-final-band">
          <div className="mkt-final-eyebrow mkt-start-1 mkt-end-13">
            <span className="mkt-section-number">05</span>
            <span>Next step</span>
          </div>
          <div className="mkt-final-copy mkt-start-1 mkt-end-8">
            <h2 id="marketing-final-title">
              Better Financing Can Make Better Housing Economically Possible
            </h2>
            <p>
              If you are a borrower seeking responsible private capital, a
              builder planning a project, an investor looking for disciplined
              visibility, or a broker with a complex file—FairLend can help you
              assess what comes next.
            </p>
          </div>
          <div className="mkt-final-actions mkt-start-8 mkt-end-13">
            <Button
              className="mkt-final-action-primary"
              render={<Link to="/contact" />}
              size="xl"
            >
              Get a private mortgage
              <ArrowRight aria-hidden="true" />
            </Button>
            <div className="mkt-final-alt-actions">
              <Link className="mkt-final-alt-link" to="/builder/proposals/new">
                Start a construction financing review
              </Link>
              <Link className="mkt-final-alt-link" to="/investors">
                Request investor portal access
              </Link>
              <Link className="mkt-final-alt-link" to="/contact">
                Refer a project as a partner
              </Link>
            </div>
          </div>
          <p className="mkt-final-microcopy mkt-start-1 mkt-end-13">
            All opportunities subject to underwriting, qualification, and
            project review. FairLend does not guarantee approvals, returns, or
            project outcomes. CMHC MLI Select qualification is not guaranteed.
          </p>
        </div>
      </div>
    </section>
  );
}

function MarketingProof(): ReactElement {
  const stats = [
    {
      icon: DollarSign,
      title: "2B+",
      copy: "in lifetime deals by Principal Broker",
    },
    {
      icon: Award,
      title: "25+ Years",
      copy: "Broker Experience",
    },
    {
      icon: Home,
      title: "Private 1st",
      copy: "and 2nd mortgages",
    },
    {
      icon: ChartNoAxesColumnIncreasing,
      title: "MIC",
      copy: "Coming Soon",
    },
  ];

  const paths = [
    {
      dark: true,
      eyebrow: "Builders",
      title: "Build financing",
      copy: "Construction draw and bridge financing for builders looking to borrow against real projects.",
      image: buildFinancingAsset,
      imageAlt:
        "FairLend build financing illustration for construction borrowers",
      imageHeight: 898,
      imageWidth: 1402,
      href: "/construction-draw-financing",
      id: "build-financing",
      linkLabel: "Explore builder financing",
    },
    {
      eyebrow: "INVESTORS",
      title: "The FairLend MIC",
      copy: "A diversified mortgage investment corporation, managed in-house with conservative underwriting. Opening to qualified investors soon — learn how it will work.",
      image: multiplexAsset,
      imageAlt:
        "Multiplex construction project illustration for private lenders",
      imageHeight: 955,
      imageWidth: 1647,
      href: "/investors",
      id: "multiplex-lending-investing",
      linkLabel: "Explore multiplex lending",
    },
    {
      eyebrow: "Borrowers",
      title: "Get a private mortgage",
      copy: "Secure private first or second mortgage options with broker-led guidance, fast underwriting, and terms matched to your property.",
      image: privateMortgagesAsset,
      imageAlt:
        "FairLend private mortgage borrower path illustration for Canadian real estate financing",
      imageHeight: 1003,
      imageWidth: 1568,
      href: "/contact",
      id: "private-mortgage-borrower",
      linkLabel: "Start private mortgage request",
    },
    {
      eyebrow: "Private lenders",
      title: "Private 1st and 2nds",
      copy: "Fund private first and second mortgages with clear borrower files, collateral context, and broker-led execution.",
      image: privateMortgagesAsset,
      imageAlt:
        "Private mortgage financing path illustration for Canadian real estate borrowers",
      imageHeight: 1003,
      imageWidth: 1568,
      href: "/investors",
      id: "private-first-second-mortgages",
      linkLabel: "Explore private lending",
    },
  ];

  const principles = [
    {
      icon: ShieldCheck,
      title: "Transparency",
      copy: "Clear terms, honest communication, and reporting you can rely on.",
    },
    {
      icon: Gauge,
      title: "Digital efficiency",
      copy: "Technology that simplifies underwriting, speeds decisions, and improves outcomes.",
    },
    {
      icon: UsersRound,
      title: "Fair treatment",
      copy: "We align interests, treat people fairly, and build relationships that last.",
    },
  ];

  const team = [
    {
      name: "Connor Beleznay",
      role: "CTO",
    },
    {
      name: "Austin Krystek",
      role: "COO",
    },
    {
      name: "Bogdan Krystek",
      role: "CFO",
    },
  ];

  const footerGroups = [
    {
      title: "Borrowers",
      links: [
        "Build financing",
        "Private mortgages",
        "How it works",
        "Resources",
      ],
    },
    {
      title: "Investors",
      links: [
        "Investor opportunities",
        "Investment approach",
        "Performance",
        "Documents",
      ],
    },
    {
      title: "Company",
      links: ["About", "Leadership", "Careers", "Contact"],
    },
  ];

  return (
    <>
      <section
        aria-label="FairLend performance highlights"
        className="mkt-stats-strip"
      >
        {stats.map(({ icon: Icon, title, copy }) => (
          <div className="mkt-stat" key={`${title}-${copy}`}>
            <Icon aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <span>{copy}</span>
            </div>
          </div>
        ))}
      </section>

      <StructuralGapSection />
      <FairlendAnswerSection />

      <section
        aria-labelledby="marketing-pathways-title"
        className="mkt-pathways"
      >
        <div className="mkt-wrap">
          <div className="mkt-band mkt-pathways-band">
            <div className="mkt-pathways-eyebrow mkt-start-1 mkt-end-13">
              <span className="mkt-section-number">Services</span>
              <span>How capital moves</span>
            </div>
            <div className="mkt-pathways-header mkt-start-1 mkt-end-5">
              <h2 id="marketing-pathways-title">Our services</h2>
              <p>
                One fair approach to construction capital, private lending, and
                investor access.
              </p>
            </div>
            <div className="mkt-path-grid mkt-start-5 mkt-end-13">
              {paths.map((path, index) => (
                <Card
                  className={
                    path.dark
                      ? "mkt-path-card mkt-path-card-dark"
                      : "mkt-path-card"
                  }
                  data-path-index={index}
                  id={path.id}
                  key={path.title}
                >
                  <div className="mkt-path-visual">
                    <img
                      alt={path.imageAlt}
                      height={path.imageHeight}
                      loading="lazy"
                      src={path.image}
                      width={path.imageWidth}
                    />
                  </div>
                  <div className="mkt-path-copy">
                    <span>{path.eyebrow}</span>
                    <h3>{path.title}</h3>
                    <i aria-hidden="true" />
                    <p>{path.copy}</p>
                  </div>
                  <a className="mkt-path-link" href={path.href}>
                    <span>{path.linkLabel}</span>
                    <ArrowRight aria-hidden="true" />
                  </a>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <OperatingModelSection />

      <section
        aria-labelledby="marketing-principles-title"
        className="mkt-principles"
      >
        <h2 id="marketing-principles-title">Returns without shortcuts</h2>
        <div className="mkt-principle-grid">
          {principles.map(({ icon: Icon, title, copy }) => (
            <div className="mkt-principle" key={title}>
              <Icon aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <WhyFairlendSection />

      <section
        aria-labelledby="marketing-founder-title"
        className="mkt-leadership"
        data-leadership-desk
        id="about"
      >
        <Frame className="mkt-leadership-frame">
          <FramePanel className="mkt-leadership-board">
            <span
              aria-hidden="true"
              className="mkt-leadership-rule mkt-leadership-rule-top"
            />
            <span
              aria-hidden="true"
              className="mkt-leadership-rule mkt-leadership-rule-right"
            />
            <span
              aria-hidden="true"
              className="mkt-leadership-rule mkt-leadership-rule-bottom"
            />
            <span
              aria-hidden="true"
              className="mkt-leadership-rule mkt-leadership-rule-left"
            />

            <div className="mkt-leadership-head">
              <div
                className="mkt-leadership-index"
                data-leadership-reveal="index"
              >
                <span>05</span>
                <i aria-hidden="true" />
                <p>Leadership</p>
              </div>
              <p className="mkt-leadership-deck" data-leadership-reveal="deck">
                Deal-tested guidance for borrowers, builders, investors, and
                brokers who need disciplined capital advice before the structure
                gets expensive.
              </p>
              <div
                className="mkt-leadership-model"
                data-leadership-reveal="model"
              >
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <strong>The FairLend model</strong>
                <p>05 of 05 / Principal Broker / Capital Relationships</p>
              </div>
            </div>

            <div className="mkt-leadership-body">
              <div className="mkt-leadership-copy">
                <p className="mkt-leadership-eyebrow">Principal Broker</p>
                <h2 id="marketing-founder-title">
                  <span className="mkt-leadership-title-line">
                    Trusted guidance built
                  </span>
                  <span className="mkt-leadership-title-line">
                    on real deal experience.
                  </span>
                </h2>
                <p className="mkt-leadership-summary">
                  FairLend combines mortgage brokerage discipline, builder-side
                  insight, and practical structuring support to move financing
                  conversations from uncertainty to a workable capital plan.
                </p>
                <div className="mkt-leadership-capabilities">
                  {leadershipCapabilities.map(({ copy, icon: Icon, title }) => (
                    <Card className="mkt-leadership-capability" key={title}>
                      <Icon aria-hidden="true" />
                      <div>
                        <h3>{title}</h3>
                        <p>{copy}</p>
                      </div>
                    </Card>
                  ))}
                </div>
                <Button
                  className="mkt-leadership-action"
                  render={<Link to="/leadership/elie-soberano" />}
                  size="xl"
                >
                  Meet our leadership
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>

              <div className="mkt-leadership-art-plate">
                <img
                  alt="Blueprint canvas with Toronto housing, construction plans, and capital planning documents"
                  className="mkt-leadership-art-image"
                  height={914}
                  loading="lazy"
                  src={leadershipDeskAsset}
                  width={1640}
                />
                <div aria-hidden="true" className="mkt-leadership-art-grid" />
                <svg
                  aria-hidden="true"
                  className="mkt-leadership-route"
                  focusable="false"
                  viewBox="0 0 640 420"
                >
                  <path
                    className="mkt-leadership-route-line"
                    d="M96 322 C146 286 183 292 225 258 C278 216 302 221 352 180 C401 140 451 146 526 102"
                    pathLength="680"
                  />
                </svg>
                <span
                  aria-hidden="true"
                  className="mkt-leadership-route-node mkt-leadership-route-node-a"
                />
                <span
                  aria-hidden="true"
                  className="mkt-leadership-route-node mkt-leadership-route-node-b"
                />
                <span
                  aria-hidden="true"
                  className="mkt-leadership-route-node mkt-leadership-route-node-c"
                />
                <div aria-hidden="true" className="mkt-leadership-map-pin">
                  <MapPin />
                </div>
                <div
                  aria-label="Experience verified"
                  className="mkt-leadership-approval-chip"
                >
                  <ShieldCheck aria-hidden="true" />
                  <span>Verified</span>
                </div>
              </div>

              <aside
                aria-label="FairLend leadership proof points"
                className="mkt-leadership-stats"
              >
                {leadershipMetrics.map((metric, index) => {
                  const Icon = metric.icon;
                  const countProps =
                    "countTo" in metric
                      ? {
                          "data-count-final": metric.value,
                          "data-count-prefix": metric.prefix,
                          "data-count-suffix": metric.suffix,
                          "data-count-to": metric.countTo,
                        }
                      : {};

                  return (
                    <Card className="mkt-leadership-stat" key={metric.label}>
                      <span className="mkt-leadership-stat-number">
                        {String(index + 2).padStart(2, "0")}
                      </span>
                      <Icon aria-hidden="true" />
                      <div>
                        <strong
                          className={
                            "countTo" in metric
                              ? "mkt-leadership-count"
                              : undefined
                          }
                          {...countProps}
                        >
                          {metric.value}
                        </strong>
                        <span>{metric.label}</span>
                        <p>{metric.copy}</p>
                      </div>
                    </Card>
                  );
                })}
              </aside>
            </div>

            <div className="mkt-leadership-footer">
              <span aria-hidden="true" className="mkt-leadership-quote-mark">
                “
              </span>
              <p className="mkt-leadership-quote">
                Our commitment is simple: align with your goals, manage risk
                intelligently, and deliver financing that creates long-term
                value.
              </p>
              <div className="mkt-leadership-trust-strip">
                {leadershipTrustSignals.map(({ icon: Icon, label }) => (
                  <div className="mkt-leadership-trust-item" key={label}>
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </FramePanel>
        </Frame>
      </section>

      <section aria-labelledby="marketing-team-title" className="mkt-team">
        <div className="mkt-wrap">
          <div className="mkt-band mkt-team-band">
            <div className="mkt-team-eyebrow mkt-start-1 mkt-end-13">
              <span className="mkt-section-number">People</span>
              <span>Who builds this</span>
            </div>
            <div className="mkt-team-copy mkt-start-1 mkt-end-5">
              <h2 id="marketing-team-title">The FairLend team</h2>
              <p>
                A team of lenders, builders, analysts, and operators who bring
                experience and care to every deal.
              </p>
              <Button
                className="mkt-team-action"
                render={<Link hash="about" to="/marketing" />}
                variant="outline"
              >
                Meet the team
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
            <ul
              aria-label="FairLend team preview"
              className="mkt-team-roster mkt-start-6 mkt-end-13"
            >
              {team.map((person) => (
                <li className="mkt-team-row" key={person.name}>
                  <div className="mkt-team-avatar">
                    <span>{person.name.charAt(0)}</span>
                  </div>
                  <div className="mkt-team-meta">
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        aria-label="FairLend careers"
        className="mkt-careers"
        id="careers"
      >
        <div>
          <UsersRound aria-hidden="true" />
          <div>
            <h2>Build your future with us</h2>
            <p>
              We are growing and always looking for driven, curious, and kind
              people.
            </p>
          </div>
        </div>
        <Button
          className="mkt-careers-action"
          render={<Link hash="careers" to="/marketing" />}
        >
          View open roles
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <FinalConversionSection />

      <footer className="mkt-footer" id="resources">
        <div className="mkt-footer-brand">
          <Link
            aria-label="FairLend Mortgage home"
            className="mkt-brand"
            to="/"
          >
            <span>FairLend</span>
            <small>Mortgage</small>
          </Link>
          <p>Fair lending. Strong communities. Sustainable returns.</p>
          <div>
            <Leaf aria-hidden="true" />
            <span>Proudly Canadian</span>
          </div>
        </div>
        <nav aria-label="FairLend footer navigation" className="mkt-footer-nav">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => {
                const hrefByLabel: Record<string, string> = {
                  "Build financing": "/construction-draw-financing",
                  "Private mortgages": "/multiplex-financing-gta",
                  "How it works": "/about",
                  Resources: "/resources",
                  "Investor opportunities": "/investors",
                  "Investment approach": "/investors",
                  Performance: "/investors",
                  Documents: "/resources",
                  About: "/about",
                  Leadership: "/leadership/elie-soberano",
                  Careers: "/#careers",
                  Contact: "/contact",
                };

                return (
                  <a href={hrefByLabel[link] ?? "/"} key={link}>
                    {link}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mkt-footer-contact">
          <h3>Get in touch</h3>
          <a href="tel:+16478317605">
            <Phone aria-hidden="true" />
            647-831-7605
          </a>
          <a href="mailto:elie@fairlend.ca">
            <Mail aria-hidden="true" />
            elie@fairlend.ca
          </a>
          <span>
            <MapPin aria-hidden="true" />
            Toronto, Ontario
          </span>
          <LicenceList
            ariaLabel="FairLend footer regulatory licences"
            className="mkt-footer-licences"
          />
        </div>
        <div className="mkt-footer-bottom">
          <span>© 2026 FairLend Mortgage</span>
          <div>
            <a href="https://www.fairlend.ca/en/brokerage/privacy-policy">
              Privacy Policy
            </a>
            <a href="#terms">Terms of Use</a>
          </div>
        </div>
        <div className="mkt-footer-compliance">
          <p>
            FairLend is a Canadian private lending, construction financing,
            mortgage administration, and investor-access company. We are
            technology-enabled, not technology-theatre. Our goal is not to
            originate more loans. It is to structure better files, administer
            them properly, and help real estate-backed financing work better for
            everyone involved.
          </p>
          <p>
            All financing subject to underwriting, borrower qualification,
            property review, appraisal review, and legal review. Past
            performance does not guarantee future results. The FairLend Investor
            Portal is a workflow and visibility layer supporting human-led
            brokerage operations; it is not an autonomous investment marketplace
            or guaranteed-return platform.
          </p>
        </div>
      </footer>
    </>
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
