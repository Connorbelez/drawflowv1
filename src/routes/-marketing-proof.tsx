import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  ChartNoAxesColumnIncreasing,
  DollarSign,
  Gauge,
  Home,
  Leaf,
  Mail,
  MapPin,
  ShieldCheck,
  UsersRound,
  Phone,
} from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import {
  buildFinancingAsset,
  leadershipCapabilities,
  leadershipDeskAsset,
  leadershipMetrics,
  leadershipTrustSignals,
  multiplexAsset,
  privateMortgagesAsset,
} from "./-marketing-contracts";
import {
  FairlendAnswerSection,
  FinalConversionSection,
  LicenceList,
  OperatingModelSection,
  StructuralGapSection,
  WhyFairlendSection,
} from "./-marketing-sections";

export function MarketingProof(): ReactElement {
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
                <div className="mkt-leadership-approval-chip">
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
