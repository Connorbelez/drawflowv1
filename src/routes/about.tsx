import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight01Icon,
  BankIcon,
  Location01Icon,
  Tag01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import "./-marketing.css";
import "./-about.css";

const extractedAssetPath = "/assets/fairlend-about-extracted";

export const Route = createFileRoute("/about")({
  component: AboutFairlendPage,
  head: () => ({
    meta: [
      {
        title: "About Fairlend | Private lending for better housing outcomes",
      },
      {
        name: "description",
        content:
          "Fairlend combines private capital, practical underwriting, technology-assisted review, and human judgment for GTA housing finance.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: `${extractedAssetPath}/hero-construction-plate.png`,
      },
      {
        rel: "preload",
        as: "image",
        href: `${extractedAssetPath}/logo-lockup.png`,
      },
      {
        rel: "preload",
        as: "image",
        href: `${extractedAssetPath}/hero-permit-card.png`,
      },
      {
        rel: "preload",
        as: "image",
        href: `${extractedAssetPath}/hero-headline.png`,
      },
    ],
  }),
});

const principles = [
  {
    title: "Fairness",
    body: "Lending should be direct, understandable, and commercially reasonable for the risk being taken.",
  },
  {
    title: "Transparency",
    body: "Borrowers and investors should understand structure, cost, risk, requirements, and process before moving forward.",
  },
  {
    title: "Speed",
    body: "Housing projects lose momentum when review takes too long. We move quickly without weakening underwriting discipline.",
  },
  {
    title: "Sustainability",
    body: "Better rental supply should consider energy efficiency, long-term livability, and responsible use of existing land.",
  },
  {
    title: "Responsible underwriting",
    body: "A project should be financed because the fundamentals support it, not because the story sounds attractive.",
  },
  {
    title: "Investor-borrower alignment",
    body: "Private capital works best when borrower needs and investor risk expectations are clear from the beginning.",
  },
] as const;

function AboutFairlendPage(): ReactElement {
  return (
    <main className="mkt-shell about-page">
      <AboutReferenceFold />

      <CapitalGapVariantA />
      <CapitalGapVariantC />
      <CapitalGapVariantD />

      <section className="about-principles about-editorial-section" aria-labelledby="about-principles-title">
        <VerticalSectionLabel number="05" label="Principles" />
        <div className="about-editorial-section__body about-principles__body">
          <div className="about-principles__heading">
            <p className="about-kicker">Our principles</p>
            <h2 id="about-principles-title">The lending decision has rules.</h2>
          </div>
          <div className="about-principles__grid">
            {principles.map((principle, index) => {
              return (
                <article className="about-principle-card" key={principle.title}>
                  <span className="about-principle-card__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="about-technology about-editorial-section" aria-labelledby="about-technology-title">
        <VerticalSectionLabel number="06" label="Assisted Review" />
        <div className="about-editorial-section__body about-technology__body">
          <div className="about-technology__header">
            <p className="about-kicker">Where technology fits</p>
            <h2 id="about-technology-title">Better files. Better judgment.</h2>
            <p>
              The goal is not to replace judgment. The goal is to remove
              unnecessary friction so serious projects can be evaluated with
              better information and less confusion.
            </p>
          </div>
          <div className="about-technology__compare" role="list">
            <article className="about-technology__panel" role="listitem">
              <span>Fragmented private lending</span>
              <p>
                Documents live across inboxes, repeated conversations, manual
                review, and unclear next steps.
              </p>
            </article>
            <article className="about-technology__panel about-technology__panel--active" role="listitem">
              <span>Fairlend assisted review</span>
              <p>
                Technology improves intake, organizes project information,
                supports faster review, and creates a clearer borrower experience.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="about-human about-editorial-section" aria-labelledby="about-human-title">
        <VerticalSectionLabel number="07" label="Human Judgment" />
        <div className="about-editorial-section__body about-human__body">
          <div className="about-human__image-wrap">
            <img
              alt="Borrowers and lending professionals reviewing plans together at a table."
              loading="lazy"
              src="/assets/fairlend-public/editorial-authority-plate.png"
            />
          </div>
          <div className="about-human__copy">
            <p className="about-kicker">Where human expertise still matters</p>
            <h2 id="about-human-title">Judgment still has to walk the site.</h2>
            <div className="about-prose">
              <p>
                No algorithm can fully understand a construction plan, a
                borrower&apos;s constraints, a zoning pathway, a draw schedule, a
                valuation question, or the real-world risk of a project.
              </p>
              <p>
                That is why Fairlend combines structured intake and
                technology-assisted review with experienced human judgment.
              </p>
              <p>
                We look at the property, the borrower, the budget, the timeline,
                the exit strategy, the capital stack, and the housing outcome
                together.
              </p>
            </div>
            <Button
              className="about-button about-button--blue"
              render={<Link to="/leadership/elie-soberano" />}
              size="xl"
            >
              Meet the Founder
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>

      <NextStepVariantB />
      <NextStepVariantC />
    </main>
  );
}

function CapitalGapVariantA(): ReactElement {
  return (
    <section className="about-concept-section about-capital-a" aria-labelledby="about-capital-a-title">
      <VerticalSectionLabel number="04A" label="Capital Gap" />
      <div className="about-concept-section__body about-capital-a__body">
        <div className="about-capital-a__heading">
          <p className="about-kicker">Why capital matters</p>
          <h2 id="about-capital-a-title">
            The financing gap is where good housing stalls.
          </h2>
        </div>
        <img
          alt=""
          aria-hidden="true"
          className="about-capital-a__documents"
          src="/assets/fairlend-about-concepts/capital-a-document-stack.png"
        />
        <div className="about-capital-a__table" role="list" aria-label="Where small housing projects hit capital friction">
          <article role="listitem">
            <span>01</span>
            <h3>Homeowner</h3>
            <p>You may have enough equity on paper to add a garden suite.</p>
            <p>But not enough liquid capital to carry the project cleanly.</p>
            <p>This creates draw pressure and limits financing options.</p>
          </article>
          <article role="listitem">
            <span>02</span>
            <h3>Builder</h3>
            <p>You may have a strong multiplex plan with clear returns.</p>
            <p>But a rigid draw structure can create cash-flow pressure.</p>
            <p>Documentation that misses construction risk slows funding.</p>
          </article>
          <article role="listitem">
            <span>03</span>
            <h3>Property owner</h3>
            <p>You may have a viable rental conversion or infill opportunity.</p>
            <p>But the project may not fit a traditional lending box.</p>
            <p>Asset type, zoning, and income profile can block financing.</p>
          </article>
        </div>
        <Link className="about-inline-cta" to="/start">
          Review the project fit
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function CapitalGapVariantC(): ReactElement {
  return (
    <section className="about-concept-section about-capital-c" aria-labelledby="about-capital-c-title">
      <VerticalSectionLabel number="04C" label="Capital Gap" />
      <div className="about-concept-section__body about-capital-c__body">
        <div className="about-capital-c__copy">
          <p className="about-kicker">Feasibility ledger</p>
          <h2 id="about-capital-c-title">
            Small housing projects need capital that behaves like the build.
          </h2>
          <p>
            Fairlend reviews the property, borrower, budget, timing, and draw
            pressure together so the structure reflects the work in front of it.
          </p>
        </div>
        <div className="about-capital-c__ledger" role="table" aria-label="Capital gap ledger">
          <div className="about-capital-c__ledger-head" role="row">
            <span role="columnheader">Feasibility pressure</span>
            <span role="columnheader">Impact</span>
            <span role="columnheader">What we align</span>
          </div>
          {[
            [
              "01",
              "Garden suite equity",
              "Homeowner has equity, but cash-out is insufficient.",
              "Insufficient liquidity to fund builds cleanly.",
              "Unlock equity with purpose-built lending and flexible draw structures.",
            ],
            [
              "02",
              "Multiplex draw pressure",
              "Construction costs front-loaded; draws lag behind.",
              "Cash flow stress creates delays and scope compromise.",
              "Align draw timing with build phases and cost realities.",
            ],
            [
              "03",
              "Rental conversion mismatch",
              "Rental income arrives after carrying costs peak.",
              "DSCR looks weak despite strong long-term fundamentals.",
              "Structure lending around stabilized outcomes, not current income.",
            ],
          ].map(([number, title, pressure, impact, alignment]) => (
            <article key={number} role="listitem">
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{pressure}</p>
              </div>
              <p>{impact}</p>
              <p>{alignment}</p>
            </article>
          ))}
          <Link className="about-ledger-cta" to="/start">
            <span>Better structure. Better timing. Better outcomes.</span>
            <strong>Explore financing options</strong>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <img
          alt=""
          aria-hidden="true"
          className="about-capital-c__blueprint"
          src="/assets/fairlend-about-concepts/capital-c-blueprint-board.png"
        />
      </div>
    </section>
  );
}

function CapitalGapVariantD(): ReactElement {
  return (
    <section className="about-concept-section about-capital-d" aria-labelledby="about-capital-d-title">
      <VerticalSectionLabel number="04D" label="Capital Gap" />
      <div className="about-concept-section__body about-capital-d__body">
        <div className="about-capital-d__strips" aria-label="Capital timing sequence">
          <img
            alt="Capital timing sequence: equity exists, cash is tied up, draws lag the work"
            src="/assets/fairlend-about-concepts/capital-d-paper-strips.png"
          />
        </div>
        <h2 id="about-capital-d-title">
          Capital has to arrive in the same rhythm as construction.
        </h2>
        <Link className="about-inline-cta about-inline-cta--center" to="/start">
          Structure the loan around the build
          <ArrowRight aria-hidden="true" />
        </Link>
        <img
          alt=""
          aria-hidden="true"
          className="about-capital-d__swatch"
          src="/assets/fairlend-about-concepts/capital-d-blueprint-card.png"
        />
      </div>
    </section>
  );
}

function NextStepVariantB(): ReactElement {
  return (
    <section className="about-concept-section about-next-b" aria-labelledby="about-next-b-title">
      <VerticalSectionLabel number="08B" label="Next Step" />
      <div className="about-concept-section__body about-next-b__body">
        <img
          alt="Project intake slip marked ready"
          className="about-next-b__slip"
          src="/assets/fairlend-about-concepts/next-b-intake-layer.png"
        />
        <img
          alt=""
          aria-hidden="true"
          className="about-next-b__blueprint"
          src="/assets/fairlend-about-concepts/next-b-right-blueprint-layer.png"
        />
        <div className="about-next-b__content">
          <p className="about-kicker">Next step</p>
          <h2 id="about-next-b-title">
            <span>Map the financing</span>
            <span>path before</span>
            <span>the work stalls.</span>
          </h2>
          <p>
            The right structure. The right timing. The right capital.
            Fairlend helps you align the pieces before costs rise and momentum slips.
          </p>
          <Link className="about-next-b__banner" to="/start">
            Explore financing options
            <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} strokeWidth={2} />
          </Link>
          <Link className="about-inline-cta about-next-b__founder" to="/leadership/elie-soberano">
            Founder story
            <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} strokeWidth={2} />
          </Link>
        </div>
        <div className="about-next-b__meta" aria-label="Fairlend blue section focus">
          <span>Greater Toronto Area</span>
          <span>Construction draws</span>
          <span>Private lending</span>
        </div>
      </div>
    </section>
  );
}

function NextStepVariantC(): ReactElement {
  return (
    <section className="about-concept-section about-next-c" aria-labelledby="about-next-c-title">
      <VerticalSectionLabel number="08C" label="Next Step" />
      <div className="about-concept-section__body about-next-c__body">
        <div className="about-next-c__panel">
          <p className="about-next-c__kicker">Next step</p>
          <h2 id="about-next-c-title">
            <span>Ready to</span>
            <span>talk through</span>
            <span>the fit?</span>
          </h2>
          <p>
            Explore the financing path that matches what you are building.
          </p>
          <div className="about-final__actions">
            <Button
              className="about-button about-button--lime"
              render={<Link to="/start" />}
              size="xl"
            >
              Explore Financing Options
              <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            <Button
              className="about-button about-button--paper"
              render={<Link to="/leadership/elie-soberano" />}
              size="xl"
              variant="outline"
            >
              Meet the Founder
              <HugeiconsIcon aria-hidden="true" icon={UserGroupIcon} strokeWidth={2} />
            </Button>
          </div>
        </div>
        <aside className="about-next-c__rail" aria-label="Fairlend focus areas">
          <article>
            <HugeiconsIcon aria-hidden="true" icon={Location01Icon} strokeWidth={1.7} />
            <p>
              Greater Toronto Area
              <br />
              housing finance
            </p>
          </article>
          <article>
            <HugeiconsIcon aria-hidden="true" icon={Tag01Icon} strokeWidth={1.7} />
            <p>
              Mortgage strategy,
              <br />
              construction draws,
              <br />
              private credit
            </p>
          </article>
          <article>
            <HugeiconsIcon aria-hidden="true" icon={BankIcon} strokeWidth={1.7} />
            <p>
              Private lending for
              <br />
              better housing
              <br />
              outcomes
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function AboutReferenceFold(): ReactElement {
  return (
    <div className="about-reference">
      <header className="about-reference__masthead" aria-label="Fairlend public navigation">
        <Link
          aria-label="Fairlend Canadian Housing Capital home"
          className="about-reference__logo"
          to="/marketing"
        >
          <img
            alt=""
            decoding="async"
            fetchPriority="high"
            src={`${extractedAssetPath}/logo-lockup.png`}
          />
        </Link>
        <nav className="about-reference__nav" aria-label="Primary">
          <Link to="/start">Financing Options</Link>
          <Link to="/construction-draw-financing">Who We Finance</Link>
          <Link to="/resources">Resources</Link>
          <Link aria-current="page" to="/about">
            About
          </Link>
        </nav>
        <Link className="about-reference__contact" to="/contact">
          Get in Touch
        </Link>
        <span className="about-reference__path">/About</span>
      </header>

      <section className="about-reference__hero" aria-labelledby="about-hero-title">
        <div className="about-reference__columns" aria-hidden="true">
          {["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(
            (column) => (
              <span key={column}>{column}</span>
            ),
          )}
        </div>
        <div className="about-reference__left">
          <SectionMarker number="01" label="About Fairlend" />
          <h1 id="about-hero-title" aria-label="About Fairlend">
            <img
              alt=""
              aria-hidden="true"
              decoding="async"
              fetchPriority="high"
              src={`${extractedAssetPath}/hero-headline.png`}
            />
          </h1>
          <div className="about-reference__headline-rule" />
          <p>
            Our mission is simple:
            <br />
            Make private lending more transparent,
            <br />
            more efficient, and better aligned
            <br />
            with outcomes that improve housing
            <br />
            in Canada.
          </p>
          <Link className="about-reference__cta" to="/start">
            Explore Financing Options
            <ArrowRight aria-hidden="true" />
          </Link>
          <img
            alt=""
            aria-hidden="true"
            className="about-reference__stamp"
            src={`${extractedAssetPath}/hero-stamp.png`}
          />
        </div>

        <div className="about-reference__collage" aria-label="Fairlend housing financing document collage">
          <img
            alt="A multiplex housing project under construction."
            className="about-reference__construction"
            decoding="async"
            fetchPriority="high"
            src={`${extractedAssetPath}/hero-construction-plate.png`}
          />
          <img
            alt=""
            aria-hidden="true"
            className="about-reference__blueprint"
            src={`${extractedAssetPath}/hero-blueprint-plate.png`}
          />
          <img
            alt="Toronto building permit marked permit issued."
            className="about-reference__permit"
            decoding="async"
            fetchPriority="high"
            src={`${extractedAssetPath}/hero-permit-card.png`}
          />
          <img
            alt="Fairlend underwriting memo recommending approval."
            className="about-reference__memo"
            decoding="async"
            fetchPriority="high"
            src={`${extractedAssetPath}/hero-underwriting-memo.png`}
          />
          <img
            alt="A completed modern garden suite."
            className="about-reference__garden"
            decoding="async"
            fetchPriority="high"
            src={`${extractedAssetPath}/hero-garden-suite-photo.png`}
          />
          <img
            alt=""
            aria-hidden="true"
            className="about-reference__note"
            src={`${extractedAssetPath}/hero-note-paper.png`}
          />
          <img
            alt=""
            aria-hidden="true"
            className="about-reference__invested"
            src={`${extractedAssetPath}/hero-invested-label.png`}
          />
          <img
            alt=""
            aria-hidden="true"
            className="about-reference__right-blueprint"
            src={`${extractedAssetPath}/hero-faint-blueprint-right.png`}
          />
        </div>
      </section>

      <div className="about-reference__lower">
        <section className="about-reference__who" aria-labelledby="about-who-title">
          <SectionMarker number="02" label="Who We Are" />
          <div className="about-reference__who-grid">
            <div>
              <h2 id="about-who-title">Who We Are</h2>
              <img
                alt=""
                aria-hidden="true"
                className="about-reference__who-sketch"
                loading="lazy"
                src={`${extractedAssetPath}/section-who-sketch.png`}
              />
            </div>
            <div className="about-reference__who-copy">
              <p>
                Fairlend is a Canadian private lending platform focused on real
                assets and real impact.
              </p>
              <p>
                We provide capital solutions for the full spectrum of housing
                projects, from gentle density and garden suites to purpose-built
                rentals, helping builders, investors, and homeowners unlock
                housing potential across the GTA and beyond.
              </p>
              <div className="about-reference__facts">
                <span>Est. 2023</span>
                <span>Toronto, ON</span>
              </div>
            </div>
          </div>
        </section>

        <section className="about-reference__finance" aria-labelledby="about-finance-title">
          <SectionMarker number="03" label="What We Finance" />
          <img
            alt="Blueprint-style board listing multiplexes, garden suites, purpose-built rentals, property conversions, construction financing, and bridge financing."
            className="about-reference__finance-board"
            loading="lazy"
            src={`${extractedAssetPath}/section-finance-blueprint-board.png`}
          />
        </section>
      </div>
    </div>
  );
}

function SectionMarker({
  label,
  number,
}: {
  label: string;
  number: string;
}): ReactElement {
  return (
    <p className="about-reference__marker">
      <span>{number}</span>
      <strong>{label}</strong>
    </p>
  );
}

function VerticalSectionLabel({
  label,
  number,
}: {
  label: string;
  number: string;
}): ReactElement {
  return (
    <p className="about-section-label">
      <span>{number}</span>
      <strong>{label}</strong>
    </p>
  );
}
