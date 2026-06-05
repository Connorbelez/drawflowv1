import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  Clock3,
  FileClock,
  FilePenLine,
  HardHat,
  House,
  Landmark,
  LockKeyhole,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import { Card } from "#/components/ui/card.tsx";
import { Frame } from "#/components/ui/frame.tsx";

import backgroundImage from "./assets/Landing Page Hero Background.png";
import blueprintImage from "./assets/Landing Page Blueprint.png";
import multiplexImage from "./assets/Multiplex Transparent Asset.png";
import sitePlanBlueprintFieldImage from "./assets/Property Site Plan Blueprint Field.webp";
import sitePlanForegroundImage from "./assets/Property Site Plan Foreground.webp";
import "./-buildpath.css";

export const Route = createFileRoute("/intake/")({
  component: IntakeLandingPage,
});

const trustItems = [
  {
    icon: ShieldCheck,
    label: "No credit check",
  },
  {
    icon: ClipboardList,
    label: "No documents required",
  },
  {
    icon: Clock3,
    label: "Takes about 2 minutes",
  },
] as const;

const testimonials: Array<{
  icon: LucideIcon;
  label: string;
  name: string;
  quote: string;
  role: string;
}> = [
  {
    icon: Building2,
    label: "Developer",
    name: "Rachel Torres,",
    role: "Development Manager",
    quote:
      "The draw plan finally matched the reality of our construction schedule. BuildPath helped our lender see the sequence, the evidence, and the funding need in one place.",
  },
  {
    icon: Landmark,
    label: "Lender",
    name: "Marcus Lee,",
    role: "Lending Officer",
    quote:
      "I did not have to reconstruct the project from email threads. The milestone context was clear enough for our team to review faster and ask better questions.",
  },
  {
    icon: HardHat,
    label: "Builder",
    name: "Nina Patel,",
    role: "Builder",
    quote:
      "We knew which work unlocked the next draw before crews started. That clarity kept our cash planning honest and reduced the last-minute scramble.",
  },
  {
    icon: Building2,
    label: "Owner-builder",
    name: "Olivia Grant,",
    role: "Owner-Builder",
    quote:
      "We stopped guessing between draws and started planning around real milestones. BuildPath made the money side feel connected to the jobsite.",
  },
] as const;

const propertyStatusOptions: Array<{
  icon: LucideIcon;
  label: string;
  selected?: boolean;
}> = [
  {
    icon: House,
    label: "I/we own the property",
    selected: true,
  },
  {
    icon: FilePenLine,
    label: "Firm purchase agreement signed",
  },
  {
    icon: FileClock,
    label: "Conditional purchase agreement signed",
  },
  {
    icon: Search,
    label: "Property identified, no control yet",
  },
] as const;

function IntakeLandingPage(): ReactElement {
  const [step, setStep] = useState<1 | 2>(1);
  const isFormStep = step === 2;

  return (
    <main className="bp-page">
      <Frame className="bp-shell">
        <BuildPathHeader step={isFormStep ? 2 : undefined} />
        <section
          aria-labelledby={isFormStep ? "bp-form-title" : "bp-hero-title"}
          className={isFormStep ? "bp-canvas bp-canvas-form" : "bp-canvas"}
        >
          <img
            alt=""
            aria-hidden="true"
            className="bp-background"
            decoding="async"
            draggable={false}
            fetchPriority="high"
            height={936}
            loading="eager"
            src={backgroundImage}
            width={1681}
          />

          {isFormStep ? (
            <BuildPathPropertyStep onBack={() => setStep(1)} />
          ) : (
            <BuildPathHeroStart onStart={() => setStep(2)} />
          )}
        </section>
        {!isFormStep && <BuildPathTestimonials />}
      </Frame>
    </main>
  );
}

function BuildPathStepProgress({ step }: { step: 1 | 2 }): ReactElement {
  return (
    <div aria-label={`Step ${step} of 6`} className="bp-step">
      <span>Step {step} of 6</span>
      <span aria-hidden="true" className="bp-step-dots">
        {Array.from({ length: 6 }, (_, index) => (
          <i className={index === step - 1 ? "is-active" : undefined} key={index} />
        ))}
      </span>
    </div>
  );
}

function BuildPathHeroStart({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <>
      <div aria-hidden="true" className="bp-annotation bp-annotation-plan">
        Modern multiplex
        <span>6 units</span>
        <span>Lot size&nbsp;&nbsp;60&apos; x 100&apos;</span>
        <span>Zoning&nbsp;&nbsp;RM-2</span>
      </div>
      <div aria-hidden="true" className="bp-annotation bp-annotation-return">
        Smart design.
        <span>Strong returns.</span>
      </div>
      <div aria-hidden="true" className="bp-dashed-arc" />

      <div className="bp-copy">
        <BuildPathStepProgress step={1} />

        <h1 id="bp-hero-title">
          <span>From blueprint to</span>
          <span>built with confidence</span>
        </h1>

        <p className="bp-subtitle">
          Tell us about your property and project.
          <span>We&apos;ll guide you to the right financing path-fast.</span>
        </p>

        <div aria-label="Project review promises" className="bp-trust-row">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card className="bp-trust-chip" key={item.label}>
                <span aria-hidden="true" className="bp-trust-icon">
                  <Icon strokeWidth={1.9} />
                </span>
                <span>{item.label}</span>
              </Card>
            );
          })}
        </div>
      </div>

      <img
        alt=""
        aria-hidden="true"
        className="bp-blueprint"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={955}
        loading="eager"
        src={blueprintImage}
        width={1328}
      />
      <img
        alt=""
        aria-hidden="true"
        className="bp-multiplex"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={987}
        loading="eager"
        src={multiplexImage}
        width={1418}
      />

      <button
        aria-label="Continue to project review"
        className="bp-orb"
        onClick={onStart}
        type="button"
      >
        <ArrowRight strokeWidth={1.8} />
      </button>

      <div className="bp-cta-stack">
        <button className="bp-primary-cta" onClick={onStart} type="button">
          <span>Start project review</span>
          <ArrowRight aria-hidden="true" strokeWidth={1.8} />
        </button>
        <button className="bp-secondary-cta" type="button">
          I&apos;m just exploring
        </button>
        <p className="bp-secure-note">
          <LockKeyhole aria-hidden="true" strokeWidth={1.9} />
          <span>Your information is secure and never shared.</span>
        </p>
      </div>
    </>
  );
}

function BuildPathPropertyStep({
  onBack,
}: {
  onBack: () => void;
}): ReactElement {
  return (
    <div className="bp-form-stage">
      <div className="bp-site-plan-panel">
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-field"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanBlueprintFieldImage}
          width={1536}
        />
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-foreground"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanForegroundImage}
          width={1536}
        />

        <div className="bp-site-plan-notes bp-site-plan-notes-top">
          <p>Property site plan</p>
          <span>Lot area</span>
          <strong>14,200 sq ft</strong>
          <span>Zoning</span>
          <strong>R-3</strong>
          <span>Topography</span>
          <strong>Level</strong>
        </div>

        <div className="bp-buildable-note">
          <span>Buildable area</span>
          <strong>8,560 sq ft</strong>
        </div>

        <div aria-hidden="true" className="bp-site-dimension bp-site-dimension-depth">
          142&apos;-0&quot;
        </div>
        <div aria-hidden="true" className="bp-site-dimension bp-site-dimension-width">
          100&apos;-0&quot;
        </div>
        <div aria-hidden="true" className="bp-site-dimension bp-site-dimension-front">
          <span>Front setback</span>
          <strong>20&apos;-0&quot;</strong>
        </div>

        <div className="bp-site-legend">
          <p>Legend</p>
          <span><i />Property line</span>
          <span><i />Setback line</span>
          <span><i />Building footprint</span>
        </div>

        <div className="bp-site-summary">
          <p>Site summary</p>
          <span><i />14,200 sq ft</span>
          <span><i />0.33 acres</span>
          <span><i />Level topography</span>
        </div>
      </div>

      <Card className="bp-form-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <p className="bp-form-kicker">Property / site details</p>
        <h1 id="bp-form-title">Where is the build?</h1>
        <p className="bp-form-subtitle">
          Tell us about the property you plan to build on so we can match you
          with the right financing options.
        </p>

        <label className="bp-address-field">
          <span>Project property address</span>
          <div className="bp-address-input">
            <MapPin aria-hidden="true" strokeWidth={1.8} />
            <input placeholder="Start typing the project address" type="text" />
          </div>
        </label>

        <fieldset className="bp-status-fieldset">
          <legend>Current property status</legend>
          <div className="bp-status-grid">
            {propertyStatusOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Card
                  className={
                    option.selected
                      ? "bp-status-option is-selected"
                      : "bp-status-option"
                  }
                  key={option.label}
                  render={<button type="button" />}
                >
                  <Icon aria-hidden="true" strokeWidth={1.7} />
                  <span>{option.label}</span>
                  {option.selected ? (
                    <Check
                      aria-hidden="true"
                      className="bp-status-check"
                      strokeWidth={2}
                    />
                  ) : null}
                </Card>
              );
            })}
          </div>
        </fieldset>

        <button className="bp-property-link" type="button">
          I don&apos;t have a specific property yet
          <ArrowRight aria-hidden="true" strokeWidth={1.8} />
        </button>

        <button className="bp-form-continue" type="button">
          <span>Continue</span>
          <ArrowRight aria-hidden="true" strokeWidth={1.8} />
        </button>

        <button className="bp-form-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
          Back
        </button>
      </Card>
    </div>
  );
}

function BuildPathTestimonials(): ReactElement {
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

      <div aria-label="Builder and lender testimonials" className="bp-marquee">
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

function BuildPathHeader({ step }: { step?: 1 | 2 }): ReactElement {
  return (
    <header className="bp-header">
      <a aria-label="BuildPath home" className="bp-brand" href="/intake">
        <BuildPathMark />
        <span>BuildPath</span>
      </a>
      {step ? (
        <div className="bp-header-step">
          <BuildPathStepProgress step={step} />
        </div>
      ) : null}
      <nav aria-label="BuildPath navigation" className="bp-nav">
        <a href="#how-it-works">How it works</a>
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
