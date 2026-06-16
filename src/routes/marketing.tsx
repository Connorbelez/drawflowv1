import { useGSAP } from "@gsap/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Award,
  ChartNoAxesColumnIncreasing,
  DollarSign,
  ExternalLink,
  FileCheck2,
  Gauge,
  Home,
  Leaf,
  Mail,
  MapPin,
  Phone,
  Share2,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactElement } from "react";
import { useRef } from "react";
import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
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
const fairlendLicences = [
  "FairLend Management Inc",
  "Legal business name: FairLend Management Inc",
  "Brokerage Licence #13827",
  "Administrator Licence #13828",
] as const;

function MarketingPage(): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const heroScrollRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const proofOverlapRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
      <section
        aria-labelledby="marketing-hero-title"
        className="mkt-hero-scroll"
        ref={heroScrollRef}
      >
        <div className="mkt-hero-pinned" ref={pinRef}>
          <div aria-hidden className="mkt-media-stage">
            <img
              alt=""
              className="mkt-hero-blueprint"
              decoding="async"
              fetchPriority="high"
              src={blueprintAsset}
            />
            <div className="mkt-render-layer" ref={renderRef}>
              <img
                alt=""
                className="mkt-hero-render"
                decoding="async"
                fetchPriority="high"
                src={renderAsset}
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
                        Building the
                        <br />
                        future of Fair Lending
                      </h1>
                    </div>
                    <p className="mkt-hero-subcopy">
                      Build financing, private mortgages, and investor access
                      for real Canadian housing, underwritten with transparency
                      and discipline.
                    </p>
                  </div>

                  <TrustRail />

                  <div className="mkt-hero-actions">
                    <Button
                      className="mkt-primary-action"
                      render={<Link to="/builder/proposals/new" />}
                      size="xl"
                    >
                      Explore build financing
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    <Button
                      className="mkt-secondary-action"
                      render={<Link to="/backoffice" />}
                      size="xl"
                      variant="outline"
                    >
                      See investor platform
                      <ArrowRight aria-hidden="true" />
                    </Button>
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

      <div className="mkt-stick-overlap" ref={proofOverlapRef}>
        <MarketingProof />
      </div>
    </main>
  );
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
      <p>End to End Ecosystem</p>
      <h2>
        Borrow <br /> Build <br /> Lend <br /> In one place
      </h2>
      {/* <h2>Build</h2>
      <h2>Lend</h2>
      <h2>All in one place</h2> */}
      <span>
        Private mortgages without junk fees. Construction financing with
        on-demand draws. Private-mortgage investing with the administration
        handled.
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

function TrustRail(): ReactElement {
  const items = [
    { icon: FileCheck2, label: "Transparent terms" },
    { icon: ChartNoAxesColumnIncreasing, label: "Technology-led underwriting" },
  ];

  return (
    <div aria-label="FairLend trust signals" className="mkt-trust-rail">
      {items.map(({ icon: Icon, label }) => (
        <div className="mkt-trust-item" key={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
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

      <section
        aria-labelledby="marketing-pathways-title"
        className="mkt-pathways"
      >
        <div className="mkt-pathways-heading">
          <h2 id="marketing-pathways-title">Our services</h2>
          <p>
            One fair approach to construction capital, private lending, and
            investor access.
          </p>
        </div>
        <div className="mkt-path-grid">
          {paths.map((path) => (
            <Card
              className={
                path.dark ? "mkt-path-card mkt-path-card-dark" : "mkt-path-card"
              }
              id={path.id}
              key={path.title}
            >
              <div className="mkt-path-visual">
                <img alt={path.imageAlt} loading="lazy" src={path.image} />
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
      </section>

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

      <section
        aria-labelledby="marketing-founder-title"
        className="mkt-leadership"
        id="about"
      >
        <div aria-hidden="true" className="mkt-founder-photo">
          <img alt="" loading="lazy" src={renderAsset} />
          <div>
            <UserRound aria-hidden="true" />
          </div>
        </div>
        <div className="mkt-founder-copy">
          <p>Founder & Principal Broker</p>
          <h2 id="marketing-founder-title">Elie Soberano</h2>
          <span>
            Elie leads with experience, discipline, and a commitment to building
            a better lending industry in Canada.
          </span>
          <div className="mkt-founder-stats">
            <div>
              <Award aria-hidden="true" />
              <strong>25+ Years</strong>
              <span>Broker Experience</span>
            </div>
            <div>
              <DollarSign aria-hidden="true" />
              <strong>2B+</strong>
              <span>in lifetime Funded Deals</span>
            </div>
            <div>
              <Home aria-hidden="true" />
              <strong>Builder</strong>
              <span>20+ homes built</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="marketing-team-title" className="mkt-team">
        <div className="mkt-team-copy">
          <h2 id="marketing-team-title">The FairLend team</h2>
          <i aria-hidden="true" />
          <p>
            A team of lenders, builders, analysts, and operators who bring
            experience and care to every deal.
          </p>
        </div>
        <div aria-label="FairLend team preview" className="mkt-team-roster">
          {team.map((person, index) => (
            <div className="mkt-team-card" key={person.name}>
              <div className={`mkt-team-avatar mkt-team-avatar-${index + 1}`}>
                <span>{person.name.charAt(0)}</span>
              </div>
              <strong>{person.name}</strong>
              <span>{person.role}</span>
            </div>
          ))}
        </div>
        <Button
          className="mkt-team-action"
          render={<Link hash="about" preload="intent" to="/" viewTransition />}
          variant="outline"
        >
          Meet the team
          <ArrowRight aria-hidden="true" />
        </Button>
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
          render={
            <Link hash="careers" preload="intent" to="/" viewTransition />
          }
        >
          View open roles
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <footer className="mkt-footer" id="resources">
        <div className="mkt-footer-brand">
          <Link aria-label="FairLend Mortgage home" className="mkt-brand" to="/">
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
          <div>
            <ExternalLink aria-hidden="true" />
            <Share2 aria-hidden="true" />
          </div>
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
