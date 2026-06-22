import { createFileRoute, Link, linkOptions } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Landmark,
  MapPinned,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

const assetBase = "/assets/fairlend-redesign";
const brandKitAsset = `${assetBase}/start-multiplex-brandkit.webp`;
const blueprintAsset = `${assetBase}/start-multiplex-blueprint-system.webp`;
const builderGridAsset = `${assetBase}/start-multiplex-builder-grid.webp`;
const reviewPlateAsset = `${assetBase}/start-multiplex-review-plate.webp`;

const homeLink = linkOptions({ to: "/" });
const multiplexGuideLink = linkOptions({ to: "/multiplex-financing-gta" });
const financingGapLink = linkOptions({
  to: "/resources/financing-gap-gta-multiplex-builds",
});
const mliSelectLink = linkOptions({
  to: "/cmhc-mli-select-multiplex-financing",
});

export const Route = createFileRoute("/start/multiplex")({
  component: StartMultiplexPage,
  head: () => ({
    meta: [
      { title: "Multiplex Financing Intake | Fairlend Capital" },
      {
        name: "description",
        content:
          "Start a Fairlend multiplex financing review for a duplex, triplex, fourplex, or small multi-unit construction project.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: brandKitAsset },
      { rel: "preload", as: "image", href: blueprintAsset },
      { rel: "preload", as: "image", href: builderGridAsset },
    ],
  }),
});

type Icon = ComponentType<{ className?: string }>;

const intakeLanes = [
  {
    icon: Building2,
    label: "Owner or builder",
    note: "You control the site, budget, or construction path.",
  },
  {
    icon: Landmark,
    label: "Broker referral",
    note: "You are routing a borrower file for capital review.",
  },
  {
    icon: ShieldCheck,
    label: "MLI Select path",
    note: "You need affordability, accessibility, or energy readiness reviewed.",
  },
] satisfies Array<{ icon: Icon; label: string; note: string }>;

const projectTypes = [
  "Duplex conversion",
  "Triplex",
  "Fourplex",
  "Five to six unit multiplex",
  "Mixed garden-suite and multiplex file",
  "Still confirming unit plan",
];

const permitStages = [
  "Site identified",
  "Concept drawings",
  "Zoning or planning review",
  "Permit submitted",
  "Permit issued",
  "Construction underway",
];

const capitalBands = [
  "Under $500k",
  "$500k to $1M",
  "$1M to $2M",
  "$2M plus",
  "Not modelled yet",
];

const reviewSequence = [
  {
    icon: MapPinned,
    title: "Site and scope",
    copy: "Address, current use, proposed unit count, municipal path, permit stage, and construction access.",
  },
  {
    icon: Banknote,
    title: "Capital stack",
    copy: "Existing debt, borrower equity, private capital need, construction budget, contingency, and cash between draws.",
  },
  {
    icon: ClipboardCheck,
    title: "Draw structure",
    copy: "Milestones, evidence expectations, review lag, site visits, fees, and interest only after funds are released.",
  },
  {
    icon: FileSearch,
    title: "Terms lane",
    copy: "Fairlend separates files ready for underwriting from files that need documents, budget work, or policy review.",
  },
] satisfies Array<{ icon: Icon; title: string; copy: string }>;

const docketItems = [
  "Property address and ownership position",
  "Current mortgage or acquisition debt",
  "Construction budget and contingency",
  "Permit, drawings, or planning notes",
  "Expected rent and takeout assumptions",
  "Borrower working-capital limit",
];

const routeNotes = [
  "Reimbursement-only draw model",
  "Evidence preserved even when location needs review",
  "Budget revisions versioned, not overwritten",
  "Lender admin keeps final draw-release authority",
];

function StartMultiplexPage() {
  return (
    <main className="smx-page">
      <StartMultiplexStyles />
      <MultiplexHeader />

      <section aria-labelledby="multiplex-intake-title" className="smx-hero">
        <div className="smx-hero-copy">
          <p className="smx-kicker">Multiplex financing intake</p>
          <h1 id="multiplex-intake-title">
            Put the build file in lending shape.
          </h1>
          <p>
            Send enough site, permit, budget, debt, rent, and working-capital
            context for Fairlend to review the financing path before a promising
            multiplex project stalls between draws.
          </p>
          <div className="smx-actions">
            <Button
              className="smx-primary"
              render={
                <a
                  aria-label="Start the multiplex review packet"
                  href="#multiplex-intake-form"
                >
                  Start the multiplex review packet
                </a>
              }
              size="lg"
            >
              Start the packet
              <ArrowUpRight aria-hidden />
            </Button>
            <Button
              className="smx-outline"
              render={
                <Link {...multiplexGuideLink} preload="intent" viewTransition />
              }
              size="lg"
            >
              Read the financing guide
            </Button>
          </div>
        </div>

        <Frame className="smx-form-frame" id="multiplex-intake-form">
          <FramePanel className="smx-form-panel">
            <div className="smx-form-head">
              <div>
                <p>Review packet</p>
                <h2>Multiplex capital screen</h2>
              </div>
              <span>Draft</span>
            </div>

            <fieldset className="smx-lane-grid">
              <legend className="sr-only">Intake route</legend>
              {intakeLanes.map((lane, index) => {
                const LaneIcon = lane.icon;
                return (
                  <button
                    aria-pressed={index === 0}
                    className="smx-lane"
                    key={lane.label}
                    type="button"
                  >
                    <LaneIcon aria-hidden className="smx-lane-icon" />
                    <span>{lane.label}</span>
                    <small>{lane.note}</small>
                  </button>
                );
              })}
            </fieldset>

            <form
              aria-describedby="intake-prototype-note"
              className="smx-form"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="smx-field-grid">
                <FieldText id="name" label="Name" required />
                <FieldText id="email" label="Email" required type="email" />
                <FieldText id="phone" label="Phone" type="tel" />
                <FieldText id="site-address" label="Project address" required />
              </div>

              <div className="smx-field-grid">
                <FieldSelect
                  id="project-type"
                  label="Project type"
                  options={projectTypes}
                />
                <FieldSelect
                  id="permit-stage"
                  label="Permit or planning stage"
                  options={permitStages}
                />
                <FieldSelect
                  id="capital-need"
                  label="Estimated capital need"
                  options={capitalBands}
                />
                <FieldText
                  id="unit-count"
                  label="Planned units"
                  placeholder="Example: 4 units"
                />
              </div>

              <div className="smx-field-grid">
                <FieldText
                  id="existing-debt"
                  label="Existing mortgage or debt"
                  placeholder="Approximate amount"
                />
                <FieldText
                  id="working-capital"
                  label="Cash available between draws"
                  placeholder="Borrower working capital"
                />
              </div>

              <div className="smx-notes">
                <Label htmlFor="project-notes">
                  What should underwriting know?
                </Label>
                <Textarea
                  id="project-notes"
                  name="project-notes"
                  placeholder="Add budget confidence, rent assumptions, permit risks, timing pressure, current lender conversations, and any completed work."
                />
              </div>

              <div className="smx-upload">
                <Paperclip aria-hidden className="smx-upload-icon" />
                <div>
                  <Label htmlFor="supporting-files">
                    Budget, drawings, survey, or permit material
                  </Label>
                  <Input
                    id="supporting-files"
                    name="supporting-files"
                    nativeInput
                    type="file"
                  />
                  <p>
                    Optional for first pass. Useful files shorten the distance
                    between interest and an underwriting lane.
                  </p>
                </div>
              </div>

              <div className="smx-attestation">
                <Checkbox aria-describedby="multiplex-attestation-copy" />
                <span id="multiplex-attestation-copy">
                  I understand this is a review request for reimbursement-based
                  construction financing, not a commitment to fund.
                </span>
              </div>

              <Button
                className="smx-form-button smx-primary"
                size="lg"
                type="submit"
              >
                Request multiplex review
                <ArrowUpRight aria-hidden />
              </Button>
              <p className="smx-prototype-note" id="intake-prototype-note">
                Prototype packet only. No file is transmitted from this screen.
              </p>
            </form>
          </FramePanel>
        </Frame>
      </section>

      <section aria-labelledby="review-path-title" className="smx-review">
        <div className="smx-section-head">
          <p className="smx-kicker">Review path</p>
          <h2 id="review-path-title">
            The first pass should expose the constraint.
          </h2>
        </div>
        <div className="smx-review-grid">
          {reviewSequence.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <Card className="smx-step-card" key={step.title}>
                <CardPanel className="smx-step-panel">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <StepIcon aria-hidden className="smx-step-icon" />
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </CardPanel>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="docket-title" className="smx-dossier">
        <div className="smx-dossier-image">
          <img
            alt="Fairlend multiplex blueprint system with construction card studies and measured brand references."
            height={1086}
            loading="lazy"
            src={blueprintAsset}
            width={1448}
          />
        </div>
        <Frame className="smx-dossier-frame">
          <FramePanel className="smx-dossier-panel">
            <p className="smx-kicker">Submission docket</p>
            <h2 id="docket-title">
              Bring enough context for a serious answer.
            </h2>
            <p>
              The packet does not need to be perfect. It needs to identify the
              site, the proposed housing, the capital gap, the draw pressure,
              and the unknowns that could change terms.
            </p>
            <div className="smx-docket-list">
              {docketItems.map((item) => (
                <div className="smx-docket-item" key={item}>
                  <CheckCircle2 aria-hidden />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </section>

      <section aria-labelledby="proof-title" className="smx-proof">
        <div className="smx-proof-copy">
          <p className="smx-kicker">Why Fairlend asks early</p>
          <h2 id="proof-title">
            Multiplex files fail when capital timing is guessed.
          </h2>
          <p>
            A reimbursement draw plan has to respect completed work, evidence,
            lender policy, borrower working capital, review lag, and release
            authority. Those are planning inputs, not closing-week surprises.
          </p>
          <div className="smx-route-list">
            {routeNotes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
          <div className="smx-actions">
            <Button
              className="smx-outline"
              render={
                <Link {...financingGapLink} preload="intent" viewTransition />
              }
            >
              Read financing gap guide
            </Button>
            <Button
              className="smx-outline"
              render={
                <Link {...mliSelectLink} preload="intent" viewTransition />
              }
            >
              Check MLI Select readiness
            </Button>
          </div>
        </div>
        <div className="smx-proof-stack">
          <img
            alt="Warm construction and planning material grid from the Fairlend multiplex brand kit."
            height={1086}
            loading="lazy"
            src={builderGridAsset}
            width={1448}
          />
          <img
            alt="Blueprint plate showing Fairlend construction financing card studies."
            height={1086}
            loading="lazy"
            src={reviewPlateAsset}
            width={1448}
          />
        </div>
      </section>
    </main>
  );
}

function MultiplexHeader() {
  return (
    <header className="smx-header">
      <nav aria-label="Multiplex intake navigation" className="smx-nav">
        <Link
          {...homeLink}
          aria-label="Fairlend Capital home"
          className="smx-brand"
          preload="intent"
          viewTransition
        >
          <span>FL</span>
          <strong>
            Fairlend
            <small>Capital</small>
          </strong>
        </Link>
        <div className="smx-nav-links">
          <Link {...multiplexGuideLink} preload="intent" viewTransition>
            Multiplex guide
          </Link>
          <Link {...financingGapLink} preload="intent" viewTransition>
            Capital gap
          </Link>
        </div>
        <Button
          className="smx-primary"
          render={
            <a
              aria-label="Open the multiplex review packet"
              href="#multiplex-intake-form"
            >
              Open the multiplex review packet
            </a>
          }
          size="sm"
        >
          Open packet
        </Button>
      </nav>
    </header>
  );
}

function FieldText({
  id,
  label,
  placeholder,
  required,
  type = "text",
}: {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="smx-field">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      <Input
        id={id}
        name={id}
        nativeInput
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </div>
  );
}

function FieldSelect({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: string[];
}) {
  return (
    <div className="smx-field">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={id}>
        <NativeSelectOption value="">Select one</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function StartMultiplexStyles() {
  return (
    <style>{`
      .smx-page {
        --smx-paper: oklch(0.969 0.02 78.4);
        --smx-paper-deep: oklch(0.91 0.036 78.8);
        --smx-ink: oklch(0.304 0.076 172.2);
        --smx-blue: oklch(0.565 0.113 245.4);
        --smx-terra: oklch(0.58 0.14 43.2);
        --smx-eucalyptus: oklch(0.904 0.04 144.3);
        --smx-graphite: oklch(0.268 0.012 169.4);
        --smx-line: color-mix(in oklch, var(--smx-blue) 34%, transparent);
        --smx-faint-line: color-mix(in oklch, var(--smx-blue) 15%, transparent);
        min-height: 100vh;
        overflow: hidden;
        background:
          linear-gradient(var(--smx-faint-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--smx-faint-line) 1px, transparent 1px),
          radial-gradient(circle at 22% 10%, color-mix(in oklch, var(--smx-eucalyptus) 72%, transparent), transparent 32rem),
          var(--smx-paper);
        background-size: 42px 42px, 42px 42px, auto, auto;
        color: var(--smx-ink);
        font-family: Oxanium, sans-serif;
      }

      .smx-page * {
        box-sizing: border-box;
      }

      .smx-header {
        position: relative;
        z-index: 20;
        border-bottom: 1px solid color-mix(in oklch, var(--smx-blue) 32%, transparent);
        background: color-mix(in oklch, var(--smx-paper) 94%, var(--smx-eucalyptus));
      }

      .smx-nav,
      .smx-hero,
      .smx-review,
      .smx-dossier,
      .smx-proof {
        width: min(1220px, calc(100vw - 32px));
        margin-inline: auto;
      }

      .smx-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: clamp(16px, 3vw, 36px);
        padding: 14px 0;
      }

      .smx-brand,
      .smx-nav-links a {
        color: inherit;
        text-decoration: none;
      }

      .smx-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }

      .smx-brand > span {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 2px solid var(--smx-ink);
        color: var(--smx-ink);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1rem;
        font-weight: 700;
        line-height: 1;
      }

      .smx-brand strong,
      .smx-brand small {
        display: block;
        line-height: 1;
        text-transform: uppercase;
      }

      .smx-brand strong {
        font-size: 0.9rem;
        letter-spacing: 0.18em;
      }

      .smx-brand small {
        margin-top: 6px;
        color: var(--smx-blue);
        font-size: 0.58rem;
        letter-spacing: 0.32em;
      }

      .smx-nav-links {
        display: flex;
        justify-content: center;
        gap: clamp(16px, 3vw, 40px);
        color: color-mix(in oklch, var(--smx-graphite) 78%, var(--smx-blue));
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .smx-nav-links a {
        border-bottom: 1px solid transparent;
        padding-bottom: 4px;
      }

      .smx-nav-links a:hover {
        border-color: var(--smx-terra);
        color: var(--smx-terra);
      }

      .smx-page [data-slot="button"].smx-primary {
        border-color: var(--smx-ink);
        background: var(--smx-ink);
        color: var(--smx-paper);
      }

      .smx-page [data-slot="button"].smx-outline {
        border-color: color-mix(in oklch, var(--smx-ink) 42%, transparent);
        background: color-mix(in oklch, var(--smx-paper) 88%, var(--smx-eucalyptus));
        color: var(--smx-ink);
      }

      .smx-hero {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 0.86fr) minmax(420px, 0.92fr);
        gap: clamp(28px, 5vw, 74px);
        align-items: start;
        padding: clamp(44px, 7vw, 92px) 0 clamp(70px, 9vw, 120px);
      }

      .smx-hero::after {
        position: absolute;
        right: -15vw;
        top: 42px;
        z-index: 0;
        width: min(31vw, 360px);
        height: calc(100% - 84px);
        border: 1px solid color-mix(in oklch, var(--smx-blue) 62%, transparent);
        background:
          linear-gradient(color-mix(in oklch, var(--smx-paper) 18%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in oklch, var(--smx-paper) 18%, transparent) 1px, transparent 1px),
          var(--smx-blue);
        background-size: 24px 24px;
        content: "";
        opacity: 0.62;
      }

      .smx-hero-copy,
      .smx-form-frame {
        position: relative;
        z-index: 1;
      }

      .smx-kicker {
        margin: 0 0 16px;
        color: var(--smx-terra);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .smx-hero h1,
      .smx-section-head h2,
      .smx-dossier h2,
      .smx-proof h2 {
        margin: 0;
        color: var(--smx-ink);
        font-family: Georgia, "Times New Roman", serif;
        font-weight: 600;
        letter-spacing: 0;
        line-height: 0.96;
      }

      .smx-hero h1 {
        max-width: 9.4em;
        font-size: clamp(3.4rem, 7.4vw, 7.75rem);
      }

      .smx-hero-copy > p:not(.smx-kicker),
      .smx-dossier-panel > p:not(.smx-kicker),
      .smx-proof-copy > p {
        max-width: 65ch;
        margin: 26px 0 0;
        color: color-mix(in oklch, var(--smx-graphite) 86%, var(--smx-blue));
        font-size: clamp(1rem, 1.35vw, 1.16rem);
        line-height: 1.7;
      }

      .smx-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 32px;
      }

      .smx-form-frame {
        align-self: start;
        background: color-mix(in oklch, var(--smx-blue) 28%, transparent);
      }

      .smx-form-frame::before,
      .smx-form-frame::after {
        position: absolute;
        z-index: 2;
        width: 76px;
        height: 76px;
        border-color: var(--smx-blue);
        border-style: solid;
        content: "";
        opacity: 0.64;
        pointer-events: none;
      }

      .smx-form-frame::before {
        top: -16px;
        left: -16px;
        border-width: 1px 0 0 1px;
      }

      .smx-form-frame::after {
        right: -16px;
        bottom: -16px;
        border-width: 0 1px 1px 0;
      }

      .smx-form-panel {
        overflow: hidden;
        background:
          linear-gradient(var(--smx-faint-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--smx-faint-line) 1px, transparent 1px),
          color-mix(in oklch, var(--smx-paper) 96%, var(--smx-eucalyptus));
        background-size: 28px 28px;
        padding: clamp(18px, 2.7vw, 28px);
      }

      .smx-form-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 18px;
      }

      .smx-form-head p {
        margin: 0;
        color: color-mix(in oklch, var(--smx-graphite) 72%, var(--smx-blue));
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .smx-form-head h2 {
        margin: 7px 0 0;
        color: var(--smx-ink);
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.7rem, 3vw, 2.45rem);
        font-weight: 600;
        letter-spacing: 0;
        line-height: 1;
      }

      .smx-form-head > span {
        border: 1px solid color-mix(in oklch, var(--smx-terra) 54%, transparent);
        background: color-mix(in oklch, var(--smx-terra) 14%, var(--smx-paper));
        padding: 6px 9px;
        color: var(--smx-terra);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .smx-lane-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 22px;
      }

      .smx-lane {
        min-height: 118px;
        border: 1px solid color-mix(in oklch, var(--smx-blue) 34%, transparent);
        border-radius: 12px;
        background: color-mix(in oklch, var(--smx-paper) 84%, var(--smx-eucalyptus));
        color: var(--smx-ink);
        cursor: pointer;
        font: inherit;
        padding: 12px;
        text-align: left;
        transition: border-color 180ms ease, transform 180ms ease, background 180ms ease;
      }

      .smx-lane[aria-pressed="true"] {
        border-color: var(--smx-ink);
        background: var(--smx-ink);
        color: var(--smx-paper);
      }

      .smx-lane:hover {
        transform: translateY(-1px);
        border-color: var(--smx-terra);
      }

      .smx-lane-icon {
        width: 19px;
        height: 19px;
      }

      .smx-lane span,
      .smx-lane small {
        display: block;
      }

      .smx-lane span {
        margin-top: 18px;
        font-size: 0.78rem;
        font-weight: 800;
        line-height: 1.25;
      }

      .smx-lane small {
        margin-top: 6px;
        color: currentColor;
        font-size: 0.68rem;
        line-height: 1.45;
        opacity: 0.74;
      }

      .smx-form {
        display: grid;
        gap: 18px;
        margin-top: 22px;
      }

      .smx-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .smx-field,
      .smx-notes {
        display: grid;
        gap: 7px;
      }

      .smx-field [data-slot="label"],
      .smx-notes [data-slot="label"],
      .smx-upload [data-slot="label"] {
        color: var(--smx-ink);
        font-size: 0.73rem;
        font-weight: 800;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .smx-field [data-slot="label"] span {
        margin-left: 3px;
        color: var(--smx-terra);
      }

      .smx-field [data-slot="native-select-wrapper"] {
        width: 100%;
      }

      .smx-field [data-slot="native-select"] {
        height: 36px;
        border-radius: 10px;
        background: color-mix(in oklch, var(--smx-paper) 92%, var(--smx-eucalyptus));
        font-size: 0.78rem;
      }

      .smx-upload {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        border: 1px solid color-mix(in oklch, var(--smx-blue) 28%, transparent);
        border-radius: 16px;
        background: color-mix(in oklch, var(--smx-eucalyptus) 46%, var(--smx-paper));
        padding: 14px;
      }

      .smx-upload-icon {
        width: 21px;
        height: 21px;
        margin-top: 2px;
        color: var(--smx-blue);
      }

      .smx-upload [data-slot="input-control"] {
        margin-top: 8px;
        background: color-mix(in oklch, var(--smx-paper) 96%, var(--smx-eucalyptus));
      }

      .smx-upload p,
      .smx-prototype-note {
        margin: 8px 0 0;
        color: color-mix(in oklch, var(--smx-graphite) 72%, var(--smx-blue));
        font-size: 0.72rem;
        line-height: 1.55;
      }

      .smx-attestation {
        display: flex;
        gap: 10px;
        color: color-mix(in oklch, var(--smx-graphite) 84%, var(--smx-blue));
        font-size: 0.82rem;
        line-height: 1.55;
      }

      .smx-attestation [data-slot="checkbox"] {
        margin-top: 3px;
      }

      .smx-form-button {
        width: 100%;
      }

      .smx-prototype-note {
        margin-top: 0;
        text-align: center;
      }

      .smx-review {
        padding: clamp(58px, 8vw, 108px) 0;
      }

      .smx-section-head {
        display: grid;
        grid-template-columns: minmax(0, 0.62fr) minmax(0, 1fr);
        gap: clamp(24px, 5vw, 72px);
        align-items: end;
      }

      .smx-section-head h2,
      .smx-dossier h2,
      .smx-proof h2 {
        font-size: clamp(2.35rem, 5vw, 5.8rem);
      }

      .smx-review-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-top: clamp(30px, 5vw, 58px);
      }

      .smx-step-card {
        border-radius: 18px;
        background: color-mix(in oklch, var(--smx-paper) 88%, var(--smx-eucalyptus));
      }

      .smx-step-panel {
        min-height: 252px;
        padding: 20px;
      }

      .smx-step-panel > span {
        color: var(--smx-blue);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.16em;
      }

      .smx-step-icon {
        width: 28px;
        height: 28px;
        margin-top: 42px;
        color: var(--smx-terra);
      }

      .smx-step-panel h3 {
        margin: 18px 0 0;
        color: var(--smx-ink);
        font-size: 1.05rem;
        line-height: 1.2;
      }

      .smx-step-panel p {
        margin: 12px 0 0;
        color: color-mix(in oklch, var(--smx-graphite) 78%, var(--smx-blue));
        font-size: 0.82rem;
        line-height: 1.65;
      }

      .smx-dossier {
        display: grid;
        grid-template-columns: minmax(0, 0.88fr) minmax(390px, 0.92fr);
        gap: clamp(24px, 4.5vw, 64px);
        align-items: center;
        padding: clamp(46px, 7vw, 96px) 0;
      }

      .smx-dossier-image {
        position: relative;
        min-height: 520px;
        overflow: hidden;
        border: 1px solid color-mix(in oklch, var(--smx-blue) 44%, transparent);
        border-radius: 22px;
        background: var(--smx-blue);
      }

      .smx-dossier-image img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.9;
      }

      .smx-dossier-frame {
        background: color-mix(in oklch, var(--smx-terra) 20%, transparent);
      }

      .smx-dossier-panel {
        background: color-mix(in oklch, var(--smx-paper) 94%, var(--smx-eucalyptus));
        padding: clamp(24px, 4vw, 42px);
      }

      .smx-docket-list {
        display: grid;
        gap: 10px;
        margin-top: 28px;
      }

      .smx-docket-item {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: start;
        border: 1px solid color-mix(in oklch, var(--smx-blue) 24%, transparent);
        border-radius: 12px;
        background: color-mix(in oklch, var(--smx-paper) 84%, var(--smx-eucalyptus));
        padding: 12px;
        color: var(--smx-ink);
        font-size: 0.88rem;
        line-height: 1.45;
      }

      .smx-docket-item svg {
        width: 18px;
        height: 18px;
        color: var(--smx-blue);
      }

      .smx-proof {
        display: grid;
        grid-template-columns: minmax(0, 0.92fr) minmax(360px, 0.72fr);
        gap: clamp(30px, 5vw, 76px);
        align-items: center;
        padding: clamp(58px, 8vw, 118px) 0 clamp(76px, 10vw, 138px);
      }

      .smx-route-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 28px;
      }

      .smx-route-list span {
        border: 1px solid color-mix(in oklch, var(--smx-blue) 32%, transparent);
        border-radius: 999px;
        background: color-mix(in oklch, var(--smx-eucalyptus) 52%, var(--smx-paper));
        padding: 9px 12px;
        color: color-mix(in oklch, var(--smx-graphite) 86%, var(--smx-blue));
        font-size: 0.76rem;
        font-weight: 700;
        line-height: 1.2;
      }

      .smx-proof-stack {
        position: relative;
        min-height: 550px;
      }

      .smx-proof-stack img {
        position: absolute;
        width: min(88%, 430px);
        height: 360px;
        object-fit: cover;
        border: 1px solid color-mix(in oklch, var(--smx-blue) 34%, transparent);
        border-radius: 18px;
        box-shadow: 0 28px 80px color-mix(in oklch, var(--smx-ink) 18%, transparent);
      }

      .smx-proof-stack img:first-child {
        top: 0;
        right: 0;
      }

      .smx-proof-stack img:last-child {
        left: 0;
        bottom: 0;
        width: min(82%, 390px);
        height: 310px;
      }

      @media (max-width: 980px) {
        .smx-nav {
          grid-template-columns: 1fr auto;
        }

        .smx-nav-links {
          display: none;
        }

        .smx-hero,
        .smx-dossier,
        .smx-proof {
          grid-template-columns: 1fr;
        }

        .smx-hero::after {
          display: none;
        }

        .smx-review-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .smx-section-head {
          grid-template-columns: 1fr;
        }

        .smx-dossier-image {
          min-height: 360px;
        }

        .smx-proof-stack {
          min-height: 460px;
        }
      }

      @media (max-width: 640px) {
        .smx-nav,
        .smx-hero,
        .smx-review,
        .smx-dossier,
        .smx-proof {
          width: min(100% - 24px, 1220px);
        }

        .smx-brand strong {
          display: none;
        }

        .smx-hero {
          padding-top: 34px;
        }

        .smx-hero h1 {
          font-size: clamp(3rem, 17vw, 4.8rem);
        }

        .smx-lane-grid,
        .smx-field-grid,
        .smx-review-grid {
          grid-template-columns: 1fr;
        }

        .smx-lane {
          min-height: auto;
        }

        .smx-step-panel {
          min-height: auto;
        }

        .smx-step-icon {
          margin-top: 24px;
        }

        .smx-dossier-image {
          min-height: 280px;
        }

        .smx-proof-stack {
          min-height: 390px;
        }

        .smx-proof-stack img {
          height: 270px;
        }

        .smx-proof-stack img:last-child {
          height: 230px;
        }
      }
    `}</style>
  );
}
