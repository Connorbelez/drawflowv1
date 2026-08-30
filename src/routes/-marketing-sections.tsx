import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileSignature,
  Gavel,
  Landmark,
  MapPin,
  PenTool,
  Percent,
  Search,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  fairlendLicences,
  neighborhoodSketchAsset,
} from "./-marketing-contracts";

export function AuthorityPanel(): ReactElement {
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

export function LicenceList({
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

export function RegulatoryCard(): ReactElement {
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

export function StructuralGapSection(): ReactElement {
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

export function FairlendAnswerSection(): ReactElement {
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

export function OperatingModelSection(): ReactElement {
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

export function WhyFairlendSection(): ReactElement {
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

export function FinalConversionSection(): ReactElement {
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
