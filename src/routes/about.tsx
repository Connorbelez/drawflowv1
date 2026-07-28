import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  type LucideIcon,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import { PageRail } from "#/components/marketing/fairlend-rail.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Separator } from "#/components/ui/separator.tsx";

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
    links: aboutPreloads.map((href) => ({
      rel: "preload",
      as: "image",
      href,
    })),
  }),
});

const aboutAssetBase = "/assets/about-webp/webp";

const aboutAssets = {
  blueprint: `${aboutAssetBase}/front-elevation-blueprint.webp`,
  bridgeLoansIcon: `${aboutAssetBase}/finance-icon-bridge-loans.webp`,
  gardenSuitesIcon: `${aboutAssetBase}/finance-icon-garden-suites.webp`,
  goodHomesNote: `${aboutAssetBase}/good-homes-note.webp`,
  heroHouse: `${aboutAssetBase}/hero-house-photo.webp`,
  investorOpportunityCard:
    "/assets/fairlend-investors/generated/investment-opportunity-card.webp",
  mortgageCommitment: `${aboutAssetBase}/mortgage-commitment-document-transparent.webp`,
  mortgageInvestmentsIcon: `${aboutAssetBase}/finance-icon-mortgage-investments.webp`,
  multiplexFinancingIcon: `${aboutAssetBase}/finance-icon-multiplex-financing.webp`,
  pipelineSnapshot: `${aboutAssetBase}/pipeline-snapshot-note-transparent.webp`,
  purposeBuiltRentalsIcon: `${aboutAssetBase}/finance-icon-purpose-built-rentals.webp`,
  residentialFile: `${aboutAssetBase}/residential-mortgage-file-card-transparent.webp`,
  residentialMortgagesIcon: `${aboutAssetBase}/finance-icon-residential-private-mortgages.webp`,
  rightBlueprintStrip: `${aboutAssetBase}/right-blueprint-draft-visible-strip.webp`,
  sideHouse: `${aboutAssetBase}/side-house-photo.webp`,
  torontoSkyline: `${aboutAssetBase}/toronto-skyline-sketch.webp`,
} as const;

const aboutPreloads = [
  aboutAssets.heroHouse,
  aboutAssets.blueprint,
  aboutAssets.goodHomesNote,
  aboutAssets.mortgageCommitment,
  aboutAssets.investorOpportunityCard,
] as const;
const aboutSectionRailItems = [
  {
    id: "about-hero",
    label: "About Fairlend",
    number: "01",
    tone: "dark",
  },
  {
    id: "about-who",
    label: "Who We Are",
    number: "02",
    tone: "paper",
  },
  {
    id: "about-finance",
    label: "What We Finance",
    number: "03",
    tone: "paper",
  },
] as const;

const expertiseItems = [
  {
    copy: "Grounded in communities across Canada.",
    Icon: Users,
    title: "Local Expertise",
  },
  {
    copy: "Rigorous underwriting aligned with outcomes.",
    Icon: ShieldCheck,
    title: "Disciplined Approach",
  },
  {
    copy: "We invest alongside our lending and investor partners.",
    Icon: TrendingUp,
    title: "Aligned Interests",
  },
] satisfies ReadonlyArray<{
  copy: string;
  Icon: LucideIcon;
  title: string;
}>;

const financeItems = [
  {
    copy: (
      <>
        1st, 2nds, 3rd+. Fully
        <br />
        automated digital servicing.
      </>
    ),
    href: "/contact",
    icon: aboutAssets.residentialMortgagesIcon,
    label: "Residential Private Mortgages",
    tag: "Private lending",
    title: (
      <>
        Residential Private
        <br />
        Mortgages
      </>
    ),
  },
  {
    copy: (
      <>
        Short-term capital to bridge
        <br />
        gaps and close fast with our
        <br />
        72-hour commitment SLA.
      </>
    ),
    href: "/construction-draw-financing",
    icon: aboutAssets.bridgeLoansIcon,
    label: "Bridge Loans",
    tag: "Time-sensitive capital",
    title: (
      <>
        Bridge
        <br />
        Loans
      </>
    ),
  },
  {
    copy: (
      <>
        Permit-smart capital backed
        <br />
        by GTA contractors and
        <br />
        suppliers to finish on budget.
      </>
    ),
    href: "/construction-draw-financing",
    icon: aboutAssets.mortgageInvestmentsIcon,
    label: "Renovation Financing",
    tag: "Construction capital",
    title: (
      <>
        Renovation
        <br />
        Financing
      </>
    ),
  },
  {
    copy: (
      <>
        Local GTA expertise for 3-20
        <br />
        unit properties, from permits
        <br />
        to digital deal-room funding.
      </>
    ),
    href: "/multiplex-financing-gta",
    icon: aboutAssets.multiplexFinancingIcon,
    label: "Multi-plex Financing",
    tag: "Housing supply",
    title: (
      <>
        Multi-plex
        <br />
        Financing
      </>
    ),
  },
  {
    copy: (
      <>
        Backyard and laneway homes
        <br />
        financed by a team that knows
        <br />
        permits, budgets and timelines.
      </>
    ),
    href: "/garden-suite-financing-gta",
    icon: aboutAssets.gardenSuitesIcon,
    label: "Garden & Laneway Suites",
    tag: "Infill housing",
    title: (
      <>
        Garden & Laneway
        <br />
        Suites
      </>
    ),
  },
  {
    copy: (
      <>
        Insured rental-housing capital
        <br />
        with streamlined underwriting
        <br />
        and phone-ready closing.
      </>
    ),
    href: "/affordable-sustainable-rental-housing",
    icon: aboutAssets.purposeBuiltRentalsIcon,
    label: "MLI-Select Insured Housing",
    tag: "Insured rental",
    title: (
      <>
        MLI-Select Insured
        <br />
        Housing
      </>
    ),
  },
] as const;

function AboutFairlendPage(): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const [activeSectionId, setActiveSectionId] =
    useState<(typeof aboutSectionRailItems)[number]["id"]>("about-hero");
  const activeRailSection = useMemo(
    () =>
      aboutSectionRailItems.find((section) => section.id === activeSectionId) ??
      aboutSectionRailItems[0],
    [activeSectionId]
  );

  useEffect(() => {
    const sections = aboutSectionRailItems
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
      return;
    }

    let animationFrame = 0;

    const readSectionId = (section: HTMLElement) => {
      const sectionId = section.dataset.aboutSection;
      if (
        sectionId === "about-hero" ||
        sectionId === "about-who" ||
        sectionId === "about-finance"
      ) {
        return sectionId;
      }

      return null;
    };

    const updateActiveSection = () => {
      animationFrame = 0;

      const activeX = window.innerWidth / 2;
      const activeY = window.innerHeight / 2;
      const containingSection = sections.find((section) => {
        const rect = section.getBoundingClientRect();
        return (
          rect.top <= activeY &&
          rect.bottom >= activeY &&
          rect.left <= activeX &&
          rect.right >= activeX
        );
      });
      const closestSection =
        containingSection ??
        sections
          .map((section) => {
            const rect = section.getBoundingClientRect();
            const sectionCenterX = rect.left + rect.width / 2;
            const sectionCenterY = rect.top + rect.height / 2;
            return {
              distance:
                Math.abs(sectionCenterX - activeX) +
                Math.abs(sectionCenterY - activeY),
              section,
            };
          })
          .sort((first, second) => first.distance - second.distance)[0]
          ?.section;

      if (closestSection) {
        const sectionId = readSectionId(closestSection);
        if (sectionId) {
          setActiveSectionId(sectionId);
        }
      }
    };

    const scheduleActiveSectionUpdate = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(updateActiveSection);
      }
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleActiveSectionUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleActiveSectionUpdate);

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", scheduleActiveSectionUpdate);
      window.removeEventListener("resize", scheduleActiveSectionUpdate);
    };
  }, []);

  useAboutPageMotion(rootRef);

  return (
    <>
      <DirectionalHoverHeader />
      <main
        aria-label="About Fairlend"
        className="about-page about-page--with-public-header"
        ref={rootRef}
      >
        <PageRail ariaLabel="About section" section={activeRailSection} />
        <section
          aria-labelledby="about-hero-title"
          className="about-board"
          data-about-section="about-hero"
          id="about-hero"
        >
          <SectionKicker
            className="about-kicker-hero"
            data-about-hero="kicker"
            label="About Fairlend"
            number="01"
          />

          <h1
            className="about-title"
            data-about-hero="title"
            id="about-hero-title"
          >
            <span className="about-text-textured">About</span>
            <span className="about-text-textured">Fairlend</span>
          </h1>

          <Separator className="about-title-rule" data-about-hero="rule" />

          <p className="about-intro" data-about-hero="intro">
            Fairlend is a Canadian brokerage and investment <br />
            company providing private mortgages, investor <br />
            opportunities, and construction financing for <br />
            housing that strengthens communities and delivers <br />
            better outcomes for all.
          </p>

          <a
            className="about-cta"
            data-about-hero="cta"
            href="/construction-draw-financing"
          >
            <span>Explore our solutions</span>
            <i aria-hidden />
          </a>

          <div className="about-collage" data-about-hero="collage">
            <img
              alt=""
              className="about-photo-main about-paper-shadow"
              decoding="async"
              draggable={false}
              fetchPriority="high"
              height={1537}
              src={aboutAssets.heroHouse}
              width={1023}
            />
            <img
              alt=""
              className="about-blueprint about-paper-shadow"
              decoding="async"
              draggable={false}
              height={1139}
              src={aboutAssets.blueprint}
              width={1381}
            />
            <img
              alt=""
              className="about-blueprint-strip"
              decoding="async"
              draggable={false}
              height={430}
              src={aboutAssets.rightBlueprintStrip}
              width={100}
            />
            <img
              alt=""
              className="about-commitment about-paper-shadow"
              decoding="async"
              draggable={false}
              height={1452}
              src={aboutAssets.mortgageCommitment}
              width={951}
            />
            <img
              alt=""
              className="about-note about-paper-shadow"
              decoding="async"
              draggable={false}
              height={1279}
              src={aboutAssets.goodHomesNote}
              width={848}
            />
            <img
              alt=""
              className="about-photo-side about-paper-shadow"
              decoding="async"
              draggable={false}
              height={1254}
              src={aboutAssets.sideHouse}
              width={1254}
            />
            <img
              alt=""
              className="about-file-card about-paper-shadow"
              decoding="async"
              draggable={false}
              height={1363}
              src={aboutAssets.residentialFile}
              width={917}
            />
            <img
              alt=""
              className="about-pipeline about-paper-shadow"
              decoding="async"
              draggable={false}
              height={953}
              src={aboutAssets.pipelineSnapshot}
              width={1389}
            />
            <a
              aria-label="Investor Opportunity: 12-Month First Mortgage, 7.85% target return, secured by Canadian Residential Real Estate. View investment opportunities."
              className="about-investor-card about-paper-shadow"
              href="/investors"
            >
              <img
                alt="Investor Opportunity: 12-Month First Mortgage, 7.85% target return, secured by Canadian Residential Real Estate."
                decoding="async"
                draggable={false}
                height={762}
                src={aboutAssets.investorOpportunityCard}
                width={1004}
              />
            </a>
          </div>

          <StampMark
            aria-label="Better capital better outcomes"
            className="about-stamp"
            data-about-hero="stamp"
          />

          <Separator className="about-hero-rule" />
        </section>

        <div className="about-story">
          <section
            aria-labelledby="about-who-title"
            className="about-who-section"
            data-about-section="about-who"
            id="about-who"
          >
            <SectionKicker
              className="about-kicker-who"
              data-about-reveal
              label="Who We Are"
              labelId="about-who-title"
              number="02"
            />

            <div className="about-who-layout">
              <div className="about-who-main" data-about-reveal>
                <div className="about-who-copy">
                  <p>
                    We are a team of seasoned professionals with deep expertise
                    in private lending, real estate finance, and capital
                    markets.
                  </p>
                  <p>
                    As a brokerage and investment company, we connect borrowers
                    with flexible capital and investors with attractive,
                    risk-adjusted opportunities.
                  </p>
                  <p>
                    Our approach blends disciplined underwriting, innovative
                    structures, and local market knowledge to create lasting
                    value.
                  </p>
                </div>
              </div>

              <Card
                className="about-expertise-panel"
                data-about-reveal
                render={<aside aria-label="Fairlend operating principles" />}
              >
                <span
                  aria-hidden="true"
                  className="about-expertise-corner is-top-left"
                />
                <span
                  aria-hidden="true"
                  className="about-expertise-corner is-top-right"
                />
                <span
                  aria-hidden="true"
                  className="about-expertise-corner is-bottom-left"
                />
                <span
                  aria-hidden="true"
                  className="about-expertise-corner is-bottom-right"
                />
                {expertiseItems.map((item, index) => (
                  <div
                    className="about-expertise-item"
                    data-about-reveal="child"
                    data-feature-index={String(index + 1).padStart(2, "0")}
                    key={item.title}
                  >
                    <span aria-hidden="true" className="about-expertise-icon">
                      <item.Icon />
                    </span>
                    <div>
                      <h3 className="about-text-textured">{item.title}</h3>
                      <p>{item.copy}</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <img
              alt=""
              className="about-skyline"
              decoding="async"
              draggable={false}
              height={847}
              src={aboutAssets.torontoSkyline}
              width={1681}
            />
          </section>

          <section
            aria-labelledby="about-finance-title"
            className="about-finance-section"
            data-about-section="about-finance"
            id="about-finance"
          >
            <SectionKicker
              className="about-kicker-finance"
              data-about-reveal
              label="What We Finance"
              labelId="about-finance-title"
              number="03"
            />

            <div className="about-finance">
              {financeItems.map((item, index) => (
                <Card
                  className="about-finance-card"
                  data-about-reveal
                  data-finance-index={String(index + 1).padStart(2, "0")}
                  key={item.label}
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: Card injects the visible card children into this anchor through Base UI render.
                    <a
                      aria-label={`${item.label} - learn more`}
                      href={item.href}
                    />
                  }
                >
                  <img
                    alt=""
                    decoding="async"
                    draggable={false}
                    height={512}
                    src={item.icon}
                    width={512}
                  />
                  <div>
                    <span className="about-finance-tag">{item.tag}</span>
                    <h3 className="about-text-textured">{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                  <ArrowRight aria-hidden="true" />
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function SectionKicker({
  className,
  label,
  labelId,
  number,
  ...rest
}: {
  className: string;
  label: string;
  labelId?: string;
  number: string;
} & React.HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div className={`about-section-kicker ${className}`} {...rest}>
      <span className="about-text-textured">{number}</span>
      <span aria-hidden className="about-kicker-slash">
        /
      </span>
      <p className="about-text-textured" id={labelId}>
        {label}
      </p>
    </div>
  );
}

function StampMark({
  "aria-label": ariaLabel,
  className,
  ...rest
}: {
  "aria-label": string;
  className: string;
} & React.HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div aria-label={ariaLabel} className={className} role="img" {...rest}>
      <svg aria-hidden="true" viewBox="0 0 228 218">
        <defs>
          <path
            d="M 37 109 A 77 77 0 1 1 191 109 A 77 77 0 1 1 37 109"
            id="about-stamp-ring"
          />
        </defs>
        <circle className="about-stamp-ring" cx="114" cy="109" r="78" />
        <circle
          className="about-stamp-ring about-stamp-ring-soft"
          cx="114"
          cy="109"
          r="57"
        />
        <text className="about-stamp-path">
          <textPath href="#about-stamp-ring" startOffset="3%">
            Better Capital
          </textPath>
        </text>
        <text className="about-stamp-path about-stamp-path-bottom">
          <textPath href="#about-stamp-ring" startOffset="54%">
            Better Outcomes
          </textPath>
        </text>
        <text className="about-stamp-word" x="114" y="124">
          Fairlend
        </text>
        <line className="about-stamp-mark" x1="112" x2="116" y1="69" y2="83" />
      </svg>
    </div>
  );
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function useAboutPageMotion(rootRef: React.RefObject<HTMLElement | null>) {
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      return;
    }

    root.classList.add("about-motion-ready");

    let active = true;
    let cleanup = () => {
      return;
    };

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (!active) {
          return;
        }

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
          const heroTl = gsap.timeline({
            defaults: { ease: "expo.out" },
            scrollTrigger: {
              once: true,
              start: "top 90%",
              trigger: root.querySelector(".about-board"),
            },
          });

          heroTl
            .to('[data-about-hero="kicker"]', {
              autoAlpha: 1,
              duration: 0.64,
              y: 0,
            })
            .to(
              ".about-title span",
              {
                autoAlpha: 1,
                duration: 0.86,
                stagger: 0.12,
              },
              "-=0.36"
            )
            .to(
              '[data-about-hero="rule"]',
              {
                autoAlpha: 1,
                duration: 0.72,
                scaleX: 1,
              },
              "-=0.6"
            )
            .to(
              '[data-about-hero="intro"]',
              {
                autoAlpha: 1,
                duration: 0.68,
                y: 0,
              },
              "-=0.48"
            )
            .to(
              '[data-about-hero="cta"]',
              {
                autoAlpha: 1,
                duration: 0.58,
                y: 0,
              },
              "-=0.42"
            )
            .to(
              '[data-about-hero="collage"]',
              {
                autoAlpha: 1,
                duration: 0.86,
                scale: 1,
              },
              "-=0.64"
            )
            .to(
              '[data-about-hero="stamp"]',
              {
                autoAlpha: 1,
                duration: 0.78,
                rotation: -11,
                scale: 1,
              },
              "-=0.52"
            );

          for (const item of gsap.utils.toArray<HTMLElement>(
            "[data-about-reveal]"
          )) {
            const isChild = item.dataset.aboutReveal === "child";
            gsap.to(item, {
              autoAlpha: 1,
              duration: 0.68,
              ease: "power4.out",
              scrollTrigger: {
                once: true,
                start: isChild ? "top 88%" : "top 84%",
                trigger: item,
              },
              y: 0,
              delay: isChild
                ? 0.06 * Number.parseInt(item.dataset.featureIndex ?? "0", 10)
                : 0,
            });
          }
        }, root);

        cleanup = () => ctx.revert();
      }
    );

    return () => {
      active = false;
      cleanup();
    };
  }, [rootRef]);
}
