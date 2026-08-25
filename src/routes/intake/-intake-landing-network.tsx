import { ArrowRight, Check } from "lucide-react";
import type { ReactElement } from "react";

import {
  KokonutBentoCard,
  KokonutBentoGridShell,
} from "#/components/kokonutui/bento-grid.tsx";
import { Card } from "#/components/ui/card.tsx";

import {
  fairlendSystemSteps,
  referralMoments,
} from "./-intake-contracts.ts";
import {
  CmhcChecklistGraphic,
  DrawAvailabilityMockup,
  FieldSupportGraphic,
  HandoffMapGraphic,
  ProfessionalNetworkBeamGraphic,
} from "./-intake-landing-graphics.tsx";

export function PlanBeforeBorrowSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-plan-title"
      className="bp-landing-section bp-plan bp-persona bp-handoff"
      id="resources"
    >
      <BlueprintSectionHeading
        id="bp-plan-title"
        subtitle="FairLend pairs multiplex build financing with senior build advisors, CMHC readiness work, contractor access, and field support that stays with the project."
        title="Financing is stronger when the build plan is stronger"
      />

      <KokonutBentoGridShell animate={false} className="bp-handoff-bento">
        <div className="bp-handoff-cell bp-handoff-cell-map">
          <KokonutBentoCard
            item={{
              description:
                "You get advisors with 30+ years of build and financing experience from planning through closing. The builder, broker, architect, and consultant stop carrying disconnected fragments.",
              eyebrow: "Handoff map",
              id: "handoff-map",
              title: "Senior build advisors align the plan before it hardens.",
              className: "bp-handoff-card is-map",
            }}
          >
            <HandoffMapGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-checklist">
          <KokonutBentoCard
            item={{
              description:
                "We run the CMHC requirement list with underwriting context, then help fill the gaps through direct consulting and a vetted professional network.",
              eyebrow: "Readiness",
              id: "cmhc-readiness",
              title:
                "Checklist gaps get surfaced while they are still fixable.",
              className: "bp-handoff-card is-checklist",
            }}
          >
            <CmhcChecklistGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-draws">
          <KokonutBentoCard
            item={{
              description:
                "Completed milestones unlock availability. Draw only what you need, when you need it, with a 3 day SLA on draw requests and no interest on capital still sitting unused.",
              eyebrow: "Draw control",
              id: "draw-availability",
              title: "On-demand draws keep capital available, not expensive.",
              className: "bp-handoff-card is-draws",
            }}
          >
            <DrawAvailabilityMockup />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-network">
          <KokonutBentoCard
            item={{
              description:
                "Dedicated site visits, progress checks, reliable contractors, supplier access, and investor relationships are available when the build needs to be unf*cked.",
              eyebrow: "Unf*ck guarantee",
              id: "field-support",
              title: "When the site drifts, a real team helps get it unstuck.",
              className: "bp-handoff-card is-field",
            }}
          >
            <FieldSupportGraphic />
          </KokonutBentoCard>
        </div>

        <div className="bp-handoff-cell bp-handoff-cell-field">
          <KokonutBentoCard
            item={{
              description:
                "FairLend gives builders access to build advisors, financing advisors, energy simulation and certification pros, project managers, architects, designers, lawyers, contractors, suppliers, investors, and consultants.",
              eyebrow: "Network plan",
              id: "professional-network",
              title:
                "Unlock a growing network of professionals who keep multiplex builds moving.",
              className: "bp-handoff-card is-network",
            }}
          >
            <ProfessionalNetworkBeamGraphic />
          </KokonutBentoCard>
        </div>
      </KokonutBentoGridShell>
    </section>
  );
}

export function FairLendOperatingSystemSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-system-title"
      className="bp-landing-section bp-operating-system"
    >
      <div className="bp-system-copy">
        <span>FairLend operating model</span>
        <h2 id="bp-system-title">
          Multiplex financing, planning, and field verification in one motion.
        </h2>
        <p>
          The offer is not just a loan and not just software. FairLend combines
          financing, CMHC readiness, experienced build planning, milestone draw
          controls, site visits, and practical help when the project gets stuck.
        </p>
      </div>

      <div className="bp-system-board">
        <div aria-hidden="true" className="bp-system-rail">
          <span />
          <span />
          <span />
        </div>
        <div className="bp-system-steps">
          {fairlendSystemSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Card className="bp-system-step" key={step.title}>
                <small>{step.label}</small>
                <span className="bp-system-step-icon">
                  <Icon aria-hidden="true" strokeWidth={1.7} />
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function StartWithPropertySection({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <section
      aria-labelledby="bp-start-title"
      className="bp-landing-section bp-start bp-referral"
    >
      <div aria-hidden="true" className="bp-start-drawing" />
      <div className="bp-start-copy">
        <span>Bring us in early</span>
        <h2 id="bp-start-title">
          Send the build before it gets expensive to fix.
        </h2>
        <p>
          FairLend sits down with the builder and their advisors, runs the CMHC
          and underwriting checks, pressure-tests the plan, and turns approved
          work into on-demand draw availability.
        </p>
        <ul>
          {[
            "Multiplex build financing for CMHC-insured projects",
            "Consultant-led schedule, budget, and draw planning",
            "Site visits, evidence, and practical unstuck support",
          ].map((item) => (
            <li key={item}>
              <Check aria-hidden="true" strokeWidth={2} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Card className="bp-start-form bp-referral-panel">
        <div className="bp-referral-panel-heading">
          <p>Best referral moments</p>
          <strong>When the project is still flexible enough to save.</strong>
        </div>
        <ul className="bp-referral-moments">
          {referralMoments.map((moment) => (
            <li key={moment}>
              <ArrowRight aria-hidden="true" strokeWidth={1.8} />
              <span>{moment}</span>
            </li>
          ))}
        </ul>
        <div className="bp-start-actions">
          <button className="bp-primary-cta" onClick={onStart} type="button">
            <span>Start a build review</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>
          <button className="bp-start-call" onClick={onStart} type="button">
            Refer a builder
            <ArrowRight aria-hidden="true" strokeWidth={1.7} />
          </button>
        </div>
        <p className="bp-referral-note">
          Referral-friendly: you stay the smart early advisor. We handle
          financeability, draw planning, site verification, and capital
          execution.
        </p>
      </Card>

      <div aria-hidden="true" className="bp-real-projects-stamp">
        <span>CMHC</span>
        <strong>Multiplex</strong>
      </div>
    </section>
  );
}

export function BlueprintSectionHeading({
  id,
  subtitle,
  title,
}: {
  id: string;
  subtitle: string;
  title: string;
}): ReactElement {
  return (
    <div className="bp-section-heading">
      <h2 id={id}>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}
