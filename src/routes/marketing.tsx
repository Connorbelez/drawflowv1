import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import type { ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import ScrollReveal from "#/components/ScrollReveal.jsx";
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
const buildFinancingAsset = "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
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
        className="mkt-hero-scroll"
        aria-labelledby="marketing-hero-title"
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
            <div className="mkt-blueprint-grid" />
            <div className="mkt-copy-scrim" />
            <div className="mkt-bottom-fade" />
          </div>

          <DirectionalHoverHeader />

          <div className="mkt-hero-content" ref={contentRef}>
            <div className="mkt-hero-copy">
              <p className="mkt-eyebrow">Fairlend Capital</p>
              <div className="mkt-headline-stack">
                <h1
                  className="mkt-headline mkt-headline-state mkt-headline-primary"
                  id="marketing-hero-title"
                >
                  Building a fair
                  <br />
                  future for lending
                </h1>
                <ScrollReveal
                  aria-hidden="true"
                  as="div"
                  baseOpacity={0}
                  baseRotation={-1.5}
                  blurStrength={1.4}
                  containerClassName="mkt-headline-state mkt-headline-secondary"
                  rotationEnd="+=45%"
                  rotationStart="top top"
                  textAs="span"
                  textClassName="mkt-headline-secondary-text"
                  triggerRef={heroScrollRef}
                  wordAnimationEnd="+=50%"
                  wordAnimationStart="top top"
                >
                  And a team thats with you from the start
                </ScrollReveal>
              </div>
              <p className="mkt-hero-subcopy">
                Build financing, private mortgages, and investor access for real
                Canadian housing, underwritten with transparency and discipline.
              </p>
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
            </div>

            <TrustRail />
            <UnderwritingCard />
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

      if (!section || !pinEl || !renderEl || !contentEl) {
        return;
      }

      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (media.matches) {
        renderEl.classList.add("mkt-render-reduced");
        return () => {
          renderEl.classList.remove("mkt-render-reduced");
        };
      }

      gsap.registerPlugin(ScrollTrigger);

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
          0,
        )
        .to(
          ".mkt-headline-primary",
          {
            duration: 0.24,
            filter: "blur(2px)",
            opacity: 0,
            scale: 0.985,
            y: -34,
          },
          0.035,
        )
        .to(
          ".mkt-headline-secondary",
          {
            duration: 0.16,
            opacity: 1,
          },
          0.075,
        )
        .to(
          contentEl,
          {
            duration: 0.32,
            y: -10,
          },
          0.16,
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
          image.complete ? Promise.resolve() : image.decode?.().catch(() => undefined),
        ),
        document.fonts?.ready ?? Promise.resolve(),
      ]).then(refreshScene);

      return () => {
        active = false;
        cancelAnimationFrame(refreshFrame);
      };
    },
    { dependencies: [], scope: rootRef },
  );
}

function TrustRail(): ReactElement {
  const items = [
    { icon: ShieldCheck, label: "Licensed" },
    { icon: FileCheck2, label: "Transparent terms" },
    { icon: ChartNoAxesColumnIncreasing, label: "Technology-led underwriting" },
  ];

  return (
    <div className="mkt-trust-rail" aria-label="Fairlend trust signals">
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
    <Card className="mkt-underwriting-card" aria-label="Underwriting and credential overview">
      <div className="mkt-card-state mkt-underwriting-state">
        <p>Underwriting overview</p>
        <MetricBar icon={<Home aria-hidden="true" />} label="LTV" value="68%" width="68%" />
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
        <div className="mkt-credential-grid" aria-label="Registered account eligibility">
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
      copy: "Construction loans and bridge financing for builders who move projects forward.",
      image: buildFinancingAsset,
    },
    {
      eyebrow: "Investors",
      title: "Invest with our MIC",
      copy: "Access a diversified portfolio of private mortgages backed by real Canadian assets.",
      image: micInvestingAsset,
    },
    {
      eyebrow: "Borrowers",
      title: "Private 1st & 2nd mortgages",
      copy: "Flexible mortgage solutions for real estate investors and homeowners.",
      image: privateMortgagesAsset,
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
      links: ["Build financing", "Private mortgages", "How it works", "Resources"],
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
      <section className="mkt-stats-strip" aria-label="Fairlend performance highlights">
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

      <section className="mkt-pathways" aria-labelledby="marketing-pathways-title">
        <h2 id="marketing-pathways-title">Three paths. One fair approach.</h2>
        <div className="mkt-path-grid">
          {paths.map((path) => (
            <Card
              className={path.dark ? "mkt-path-card mkt-path-card-dark" : "mkt-path-card"}
              id={path.eyebrow.toLowerCase()}
              key={path.title}
            >
              <div className="mkt-path-visual">
                <img alt="" src={path.image} />
              </div>
              <div className="mkt-path-copy">
                <span>{path.eyebrow}</span>
                <h3>{path.title}</h3>
                <i aria-hidden="true" />
                <p>{path.copy}</p>
              </div>
              <a className="mkt-path-link" href={`#${path.eyebrow.toLowerCase()}`}>
                <span>Explore {path.eyebrow.toLowerCase()}</span>
                <ArrowRight aria-hidden="true" />
              </a>
            </Card>
          ))}
        </div>
      </section>

      <section className="mkt-principles" aria-labelledby="marketing-principles-title">
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

      <section className="mkt-leadership" id="about" aria-labelledby="marketing-founder-title">
        <div className="mkt-founder-photo" aria-hidden="true">
          <img alt="" src={renderAsset} />
          <div>
            <UserRound aria-hidden="true" />
          </div>
        </div>
        <div className="mkt-founder-copy">
          <p>Founder & broker of record</p>
          <h2 id="marketing-founder-title">Elie Soberano</h2>
          <span>
            Elie leads with experience, discipline, and a commitment to building a
            better lending industry in Canada.
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

      <section className="mkt-team" aria-labelledby="marketing-team-title">
        <div className="mkt-team-copy">
          <h2 id="marketing-team-title">The Fairlend team</h2>
          <i aria-hidden="true" />
          <p>
            A team of lenders, builders, analysts, and operators who bring experience
            and care to every deal.
          </p>
        </div>
        <div className="mkt-team-roster" aria-label="Fairlend team preview">
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
          render={<Link hash="about" preload="intent" to="/marketing" viewTransition />}
          variant="outline"
        >
          Meet the team
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <section className="mkt-careers" id="careers" aria-label="Fairlend careers">
        <div>
          <UsersRound aria-hidden="true" />
          <div>
            <h2>Build your future with us</h2>
            <p>We are growing and always looking for driven, curious, and kind people.</p>
          </div>
        </div>
        <Button
          className="mkt-careers-action"
          render={<Link hash="careers" preload="intent" to="/marketing" viewTransition />}
        >
          View open roles
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <footer className="mkt-footer" id="resources">
        <div className="mkt-footer-brand">
          <Link aria-label="Fairlend Capital marketing home" className="mkt-brand" to="/marketing">
            <span>Fairlend</span>
            <small>Capital</small>
          </Link>
          <p>Fair lending. Strong communities. Sustainable returns.</p>
          <div>
            <Leaf aria-hidden="true" />
            <span>Proudly Canadian</span>
          </div>
        </div>
        <nav className="mkt-footer-nav" aria-label="Fairlend footer navigation">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => (
                <a href={`#${group.title.toLowerCase()}`} key={link}>
                  {link}
                </a>
              ))}
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
