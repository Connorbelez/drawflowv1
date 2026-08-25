import { ArrowRight, Check } from "lucide-react";
import type { ReactElement } from "react";

import { Card } from "#/components/ui/card.tsx";

import { testimonials } from "./-intake-contracts.ts";
import { BuildPathStepProgress } from "./-intake-wizard-steps.tsx";

export function BuildPathTestimonials(): ReactElement {
  return (
    <section
      aria-labelledby="bp-testimonials-title"
      className="bp-testimonials"
    >
      <div aria-hidden="true" className="bp-proof-rail">
        <span className="bp-rail-clamp bp-rail-clamp-a" />
        <span className="bp-rail-clamp bp-rail-clamp-b" />
        <span className="bp-rail-clamp bp-rail-clamp-c" />
      </div>

      <div className="bp-proof-copy">
        <p>Built on trust</p>
        <h2 id="bp-testimonials-title">Proof from the field</h2>
        <span>
          Real builders and lenders. Real outcomes. Shared to help your project
          move forward with confidence.
        </span>
      </div>

      <div className="bp-marquee">
        <div className="bp-marquee-track">
          <TestimonialCards />
          <TestimonialCards ariaHidden />
        </div>
      </div>

      <button
        aria-label="Previous testimonials"
        className="bp-marquee-control bp-marquee-control-prev"
        type="button"
      >
        <ArrowRight aria-hidden="true" strokeWidth={1.8} />
      </button>
      <button
        aria-label="Next testimonials"
        className="bp-marquee-control bp-marquee-control-next"
        type="button"
      >
        <ArrowRight aria-hidden="true" strokeWidth={1.8} />
      </button>
    </section>
  );
}

function TestimonialCards({
  ariaHidden = false,
}: {
  ariaHidden?: boolean;
}): ReactElement {
  return (
    <div aria-hidden={ariaHidden || undefined} className="bp-testimonial-set">
      {testimonials.map((testimonial) => {
        const Icon = testimonial.icon;
        return (
          <Card className="bp-testimonial-card" key={testimonial.name}>
            <span aria-hidden="true" className="bp-card-pin" />
            <span aria-hidden="true" className="bp-card-tape" />
            <div className="bp-card-head">
              <Icon aria-hidden="true" strokeWidth={1.55} />
              <div className="bp-reviewer">
                <strong>{testimonial.name}</strong>
                <span>{testimonial.role}</span>
              </div>
              <span className="bp-card-label">{testimonial.label}</span>
            </div>
            <blockquote>{testimonial.quote}</blockquote>
            <div aria-hidden="true" className="bp-approved-stamp">
              <Check strokeWidth={1.6} />
              <span>Approved</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function BuildPathHeader({
  onNavigateToSection,
  step,
}: {
  onNavigateToSection: (sectionId: string) => void;
  step?: number;
}): ReactElement {
  return (
    <header className="bp-header">
      <a
        aria-label="DrawFlow by FairLend home"
        className="bp-brand"
        href="/intake"
      >
        <BuildPathMark />
        <span className="bp-brand-wordmark">
          <strong>DrawFlow</strong>
          <em>by FairLend</em>
        </span>
      </a>
      {step ? (
        <div className="bp-header-step">
          <BuildPathStepProgress step={step} />
        </div>
      ) : null}
      <nav aria-label="DrawFlow navigation" className="bp-nav">
        <button
          onClick={() => {
            onNavigateToSection("features");
          }}
          type="button"
        >
          How it works
        </button>
        <a href="#financing-options">Financing options</a>
        <a href="#resources">Resources</a>
        <a className="bp-sign-in" href="#sign-in">
          Sign in
        </a>
      </nav>
    </header>
  );
}

function BuildPathMark(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="bp-mark"
      fill="none"
      viewBox="0 0 38 38"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 18.1 19 7.8l11.5 10.3v13.1h-8.1V20.9H15.6v10.3H7.5V18.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M19 7.8v23.4M19 20.9l11.5 10.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
