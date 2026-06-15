import { useGSAP } from "@gsap/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  ChartNoAxesColumnIncreasing,
  DollarSign,
  ExternalLink,
  FileCheck2,
  Gauge,
  Home,
  Landmark,
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
  head: () => ({
    meta: [
      {
        title: "FairLend Capital | Construction draw financing",
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
  }),
});

const renderAsset = "/assets/CleanShot Jun 8 Hero Section Blueprint.png";
const blueprintAsset = "/assets/Blueprint Style Rendering Jun 8 2026 (1).png";
const buildFinancingAsset =
  "/assets/fairlend-path-build-financing-multiplex-construction.webp";
const multiplexAsset = "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
const micInvestingAsset = "/assets/fairlend-path-mic-investing.webp";
const privateMortgagesAsset = "/assets/fairlend-path-private-mortgages.webp";

function MarketingPage(): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const heroScrollRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useMarketingScrollScene({
    contentRef,
    heroScrollRef,
    pinRef,
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
                    <p className="mkt-eyebrow">Fairlend Capital</p>
                    <div className="mkt-headline-stack">
                      <h1 className="mkt-headline" id="marketing-hero-title">
                        Building a fair
                        <br />
                        future for lending
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
            {/* <UnderwritingCard /> */}
          </div>
        </div>
      </section>

      <MarketingProof />
    </main>
  );
}

function useMarketingScrollScene({
  contentRef,
  heroScrollRef,
  pinRef,
  renderRef,
  rootRef,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  heroScrollRef: React.RefObject<HTMLElement | null>;
  pinRef: React.RefObject<HTMLDivElement | null>;
  renderRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  useGSAP(
    () => {
      const section = heroScrollRef.current;
      const pinEl = pinRef.current;
      const renderEl = renderRef.current;
      const contentEl = contentRef.current;
      const leftStack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-stack");
      const leftTrack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-track");

      if (
        !(section && pinEl && renderEl && contentEl && leftStack && leftTrack)
      ) {
        return;
      }

      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const desktopMedia = window.matchMedia("(min-width: 1024px)");
      if (!desktopMedia.matches) {
        return;
      }

      if (media.matches) {
        renderEl.classList.add("mkt-render-reduced");
        leftStack.classList.add("mkt-left-stack-reduced");
        return () => {
          renderEl.classList.remove("mkt-render-reduced");
          leftStack.classList.remove("mkt-left-stack-reduced");
        };
      }

      gsap.registerPlugin(CustomEase, ScrollTrigger);
      const panelGateEase = CustomEase.create(
        "fairlendPanelGate",
        "M0,0 C0.74,0 0.18,1 1,1"
      );

      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          anticipatePin: 1,
          end: "+=115%",
          invalidateOnRefresh: true,
          pin: pinEl,
          scrub: true,
          start: "top top",
          trigger: section,
        },
      });

      const heroScrollTrigger = timeline.scrollTrigger;

      timeline
        .to(
          renderEl,
          {
            duration: 0.72,
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
    { value: "$2B+", label: "funded deal experience" },
    { value: "Top 1%", label: "broker leadership" },
    { value: "FSRA", label: "Ontario lending discipline" },
  ];

  return (
    <section
      aria-label="Fairlend authority and social proof"
      className="mkt-authority-panel"
    >
      <p>End to End Ecosystem</p>
      <h2>Borrow <br /> Build <br /> Lend <br /> In one place</h2>
      {/* <h2>Build</h2>
      <h2>Lend</h2>
      <h2>All in one place</h2> */}
      <span>
      Private mortgages without junk fees. Construction financing with on-demand draws. Real estate-backed investing with the administration handled.
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
    { icon: ShieldCheck, label: "Licensed" },
    { icon: FileCheck2, label: "Transparent terms" },
    { icon: ChartNoAxesColumnIncreasing, label: "Technology-led underwriting" },
  ];

  return (
    <div aria-label="Fairlend trust signals" className="mkt-trust-rail">
      {items.map(({ icon: Icon, label }) => (
        <div className="mkt-trust-item" key={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function UnderwritingCard(): ReactElement {
  return (
    <Card
      aria-label="Underwriting and credential overview"
      className="mkt-underwriting-card"
    >
      <div className="mkt-card-state mkt-underwriting-state">
        <p>Underwriting overview</p>
        <MetricBar
          icon={<Home aria-hidden="true" />}
          label="LTV"
          value="68%"
          width="68%"
        />
        <MetricBar
          icon={<ChartNoAxesColumnIncreasing aria-hidden="true" />}
          label="DSCR"
          value="1.42x"
          width="62%"
        />
        <div className="mkt-underwriting-row">
          <FileCheck2 aria-hidden="true" />
          <span>Project type</span>
          <strong>6-Unit Multiplex</strong>
        </div>
        <div className="mkt-underwriting-row">
          <MapPin aria-hidden="true" />
          <span>Location</span>
          <strong>Ontario</strong>
        </div>
        <div className="mkt-approval">
          <BadgeCheck aria-hidden="true" />
          <span>Approved</span>
        </div>
      </div>

      <div className="mkt-card-state mkt-credential-state">
        <p>Credential stack</p>
        <div className="mkt-credential-primary">
          <Award aria-hidden="true" />
          <div>
            <span>FSRA Certified</span>
            <strong>Ontario private lending</strong>
          </div>
        </div>
        <div
          aria-label="Registered account eligibility"
          className="mkt-credential-grid"
        >
          <div>
            <Landmark aria-hidden="true" />
            <span>TFSA</span>
            <strong>Qualified</strong>
          </div>
          <div>
            <ShieldCheck aria-hidden="true" />
            <span>RRSP</span>
            <strong>Qualified</strong>
          </div>
          <div>
            <FileCheck2 aria-hidden="true" />
            <span>RESP</span>
            <strong>Qualified</strong>
          </div>
        </div>
        <div className="mkt-approval mkt-credential-approval">
          <BadgeCheck aria-hidden="true" />
          <span>Investor-ready</span>
        </div>
      </div>
    </Card>
  );
}

function MetricBar({
  icon,
  label,
  value,
  width,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  width: string;
}): ReactElement {
  return (
    <div className="mkt-metric">
      {icon}
      <div>
        <span>{label}</span>
        <div>
          <i style={{ width }} />
        </div>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function MarketingProof(): ReactElement {
  const stats = [
    {
      icon: DollarSign,
      title: "2B+",
      copy: "in deals",
    },
    {
      icon: Award,
      title: "Top 1%",
      copy: "broker leadership",
    },
    {
      icon: Home,
      title: "Private 1st and",
      copy: "2nd mortgages",
    },
    {
      icon: ChartNoAxesColumnIncreasing,
      title: "MIC",
      copy: "investor platform",
    },
  ];

  const paths = [
    {
      dark: true,
      eyebrow: "Builders",
      title: "Build financing",
      copy: "Construction draw and bridge financing for builders looking to borrow against real projects.",
      image: buildFinancingAsset,
      imageAlt: "Fairlend build financing illustration for construction borrowers",
      href: "/construction-draw-financing",
      id: "build-financing",
      linkLabel: "Explore builder financing",
    },
    {
      eyebrow: "Construction investors",
      title: "Multiplex lending & investing",
      copy: "Lend into Canadian multiplex builds with disciplined underwriting, draw controls, and project visibility.",
      image: multiplexAsset,
      imageAlt: "Multiplex construction project illustration for private lenders",
      href: "/investors",
      id: "multiplex-lending-investing",
      linkLabel: "Explore multiplex lending",
    },
    {
      eyebrow: "Investors",
      title: "Invest with our MIC",
      copy: "Put capital to work through a diversified mortgage investment corporation backed by real assets.",
      image: micInvestingAsset,
      imageAlt:
        "Fairlend investor platform and private mortgage investment path illustration",
      href: "/investors",
      id: "mic-investing",
      linkLabel: "Explore the MIC",
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
      links: ["Our MIC", "Investment approach", "Performance", "Documents"],
    },
    {
      title: "Company",
      links: ["About", "Leadership", "Careers", "Contact"],
    },
  ];

  return (
    <>
      <section
        aria-label="Fairlend performance highlights"
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
          <h2 id="marketing-pathways-title">Builders &amp; investors.</h2>
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
          <p>Founder & broker of record</p>
          <h2 id="marketing-founder-title">Elie Soberano</h2>
          <span>
            Elie leads with experience, discipline, and a commitment to building
            a better lending industry in Canada.
          </span>
          <div className="mkt-founder-stats">
            <div>
              <Award aria-hidden="true" />
              <strong>Top 1%</strong>
              <span>broker</span>
            </div>
            <div>
              <DollarSign aria-hidden="true" />
              <strong>$2B+</strong>
              <span>in funded deals</span>
            </div>
            <div>
              <UserRound aria-hidden="true" />
              <strong>Mortgage</strong>
              <span>product consultant</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="marketing-team-title" className="mkt-team">
        <div className="mkt-team-copy">
          <h2 id="marketing-team-title">The Fairlend team</h2>
          <i aria-hidden="true" />
          <p>
            A team of lenders, builders, analysts, and operators who bring
            experience and care to every deal.
          </p>
        </div>
        <div aria-label="Fairlend team preview" className="mkt-team-roster">
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
          render={
            <Link
              hash="about"
              preload="intent"
              to="/marketing"
              viewTransition
            />
          }
          variant="outline"
        >
          Meet the team
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <section
        aria-label="Fairlend careers"
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
            <Link
              hash="careers"
              preload="intent"
              to="/marketing"
              viewTransition
            />
          }
        >
          View open roles
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <footer className="mkt-footer" id="resources">
        <div className="mkt-footer-brand">
          <Link
            aria-label="Fairlend Capital marketing home"
            className="mkt-brand"
            to="/marketing"
          >
            <span>Fairlend</span>
            <small>Capital</small>
          </Link>
          <p>Fair lending. Strong communities. Sustainable returns.</p>
          <div>
            <Leaf aria-hidden="true" />
            <span>Proudly Canadian</span>
          </div>
        </div>
        <nav aria-label="Fairlend footer navigation" className="mkt-footer-nav">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => {
                const hrefByLabel: Record<string, string> = {
                  "Build financing": "/construction-draw-financing",
                  "Private mortgages": "/multiplex-financing-gta",
                  "How it works": "/about",
                  Resources: "/resources",
                  "Our MIC": "/investors",
                  "Investment approach": "/investors",
                  Performance: "/investors",
                  Documents: "/resources",
                  About: "/about",
                  Leadership: "/leadership/elie-soberano",
                  Careers: "/marketing#careers",
                  Contact: "/contact",
                };

                return (
                  <a href={hrefByLabel[link] ?? "/marketing"} key={link}>
                    {link}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mkt-footer-contact">
          <h3>Get in touch</h3>
          <a href="tel:+14165550199">
            <Phone aria-hidden="true" />
            416-555-0199
          </a>
          <a href="mailto:hello@fairlendcapital.ca">
            <Mail aria-hidden="true" />
            hello@fairlendcapital.ca
          </a>
          <span>
            <MapPin aria-hidden="true" />
            Toronto, Ontario
          </span>
          <div>
            <ExternalLink aria-hidden="true" />
            <Share2 aria-hidden="true" />
          </div>
        </div>
        <div className="mkt-footer-bottom">
          <span>© 2025 Fairlend Capital Inc.</span>
          <div>
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Use</a>
          </div>
        </div>
      </footer>
    </>
  );
}
