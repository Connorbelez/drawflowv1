import { ArrowRight, Check } from "lucide-react";
import type { ReactElement } from "react";

import { Card } from "#/components/ui/card.tsx";
import milestoneBlueprintStackImage from "./assets/Milestone Blueprint Stack Trimmed.png";
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "#/components/ui/timeline.tsx";

import {
  approvedWorkBenefits,
  cashGapRisks,
  extractedSqueezeAssetBase,
  milestoneUnlocksForSqueeze,
  rigidDrawNotes,
} from "./-intake-contracts.ts";
import {
  FairLendOperatingSystemSection,
  PlanBeforeBorrowSection,
  StartWithPropertySection,
} from "./-intake-landing-network.tsx";

export function BuildPathLandingSections({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <div className="bp-landing" id="features">
      <BuilderSqueezeSection />
      <PlanBeforeBorrowSection />
      <FairLendOperatingSystemSection />
      <StartWithPropertySection onStart={onStart} />
    </div>
  );
}

export function CapitalFeatureSection(): ReactElement {
  const milestoneUnlocks = [
    {
      amount: "$2,150,000",
      bar: "100%",
      dateTime: "2026-08-20",
      id: "completion",
      percent: "100%",
      title: "Completion",
    },
    {
      amount: "$1,620,000",
      bar: "75%",
      dateTime: "2026-07-18",
      id: "interior",
      percent: "75%",
      title: "Interior",
    },
    {
      amount: "$1,050,000",
      bar: "50%",
      dateTime: "2026-06-12",
      id: "roof",
      percent: "50%",
      title: "Roof",
    },
    {
      amount: "$520,000",
      bar: "25%",
      dateTime: "2026-05-10",
      id: "framing",
      percent: "25%",
      title: "Framing",
    },
    {
      amount: "$0",
      bar: "0%",
      dateTime: "2026-04-15",
      id: "foundation",
      percent: "0%",
      title: "Foundation",
    },
  ] as const;

  return (
    <section aria-labelledby="bp-workflow-title" className="bp-capital-feature">
      <div className="bp-capital-feature-copy">
        <span>Milestone-backed draw room</span>
        <h2 id="bp-workflow-title">
          Available capital rises with approved work.
        </h2>
        <p>
          DrawFlow turns your construction roadmap into release-ready capital.
          Each approved milestone expands the amount you can draw, without
          forcing interest on idle funds.
        </p>
        <div className="bp-capital-feature-actions">
          <button className="bp-primary-cta" type="button">
            <span>Check financeability</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>
          <a className="bp-secondary-cta" href="#resources">
            <span>View milestone flow</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </a>
        </div>
      </div>

      <Timeline
        activeIndex={4}
        aria-label="Milestone draw flow"
        className="bp-capital-milestone-timeline"
      >
        {milestoneUnlocks.map((milestone) => (
          <TimelineItem
            className="bp-capital-milestone-item"
            key={milestone.id}
          >
            <TimelineDot className="bp-capital-milestone-dot">
              {milestone.id === "foundation" ? null : (
                <Check aria-hidden="true" strokeWidth={2} />
              )}
            </TimelineDot>
            <TimelineConnector className="bp-capital-milestone-connector" />
            <TimelineContent className="bp-capital-milestone-content">
              <TimelineHeader className="bp-capital-milestone-header">
                <TimelineTime dateTime={milestone.dateTime}>
                  {milestone.percent}
                </TimelineTime>
                <TimelineTitle>{milestone.title}</TimelineTitle>
              </TimelineHeader>
              <TimelineDescription asChild>
                <Card className="bp-capital-milestone-card">
                  <strong>{milestone.amount}</strong>
                  <span>Available</span>
                  <i aria-hidden="true" className="bp-capital-unlock-bar">
                    <em style={{ width: milestone.bar }} />
                  </i>
                </Card>
              </TimelineDescription>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>

      <div aria-hidden="true" className="bp-capital-feature-art">
        <img
          alt=""
          aria-hidden="true"
          className="bp-capital-feature-stack"
          decoding="async"
          height={1456}
          loading="lazy"
          src={milestoneBlueprintStackImage}
          width={641}
        />
        <span className="bp-capital-dimension bp-capital-dimension-height">
          64&apos;-0&quot;
        </span>
        <span className="bp-capital-dimension bp-capital-dimension-width">
          120&apos;-0&quot;
        </span>
      </div>

      <section
        aria-label="Draw plan benefits"
        className="bp-capital-feature-stats"
      >
        {[
          ["0", "forced draw schedule"],
          ["3-day", "draw SLA target"],
          ["1", "advisor-built plan"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
    </section>
  );
}

export function BuilderSqueezeSection(): ReactElement {
  return (
    <section
      aria-labelledby="bp-squeeze-title"
      className="bp-landing-section bp-squeeze"
      id="financing-options"
    >
      <div className="bp-squeeze-stage">
        <BlueprintDraftingGrid />

        <div className="bp-squeeze-brand">
          <img
            alt=""
            aria-hidden="true"
            height={57}
            src={`${extractedSqueezeAssetBase}/drawflow-logo-lockup.webp`}
            width={193}
          />
        </div>

        <img
          alt=""
          aria-hidden="true"
          className="bp-squeeze-stamp"
          height={138}
          src={`${extractedSqueezeAssetBase}/build-smarter-stamp.webp`}
          width={272}
        />

        <div className="bp-squeeze-hero-copy">
          <p className="bp-squeeze-kicker">The Problem</p>
          <h2 id="bp-squeeze-title">Why builders get squeezed</h2>
          <p>
            Capital should follow the work,
            <span>not a rigid draw calendar.</span>
          </p>
        </div>

        <section aria-label="Rigid three draw schedule" className="bp-rigid-plan">
          <div className="bp-rigid-heading">
            <h3>Rigid 3-Draw Schedule</h3>
            <p>Capital doesn&apos;t match the real build.</p>
          </div>
          <div aria-hidden="true" className="bp-cash-stress-legend">
            <span />
            <p>
              Cash stress
              <small>(too early or too late)</small>
            </p>
          </div>
          <img
            alt=""
            aria-hidden="true"
            className="bp-rigid-axis"
            height={62}
            src={`${extractedSqueezeAssetBase}/rigid-schedule-axis.svg`}
            width={700}
          />
          <img
            alt=""
            aria-hidden="true"
            className="bp-cash-stress-curve"
            height={105}
            src={`${extractedSqueezeAssetBase}/cash-stress-dashed-curve.svg`}
            width={735}
          />
          {rigidDrawNotes.map((note) => (
            <img
              alt={note.alt}
              className={`bp-rigid-note ${note.className}`}
              decoding="async"
              height={
                note.className === "is-draw-2"
                  ? 170
                  : note.className === "is-draw-1"
                    ? 176
                    : 174
              }
              key={note.alt}
              src={note.src}
              width={note.className === "is-draw-1" ? 134 : 132}
            />
          ))}
          <div className="bp-rigid-callouts">
            <p>
              <img
                alt=""
                aria-hidden="true"
                height={48}
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
                width={48}
              />
              <span>Cash leaves early before costs hit.</span>
            </p>
            <p>
              <img
                alt=""
                aria-hidden="true"
                height={48}
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
                width={48}
              />
              <span>Money sits idle while work continues.</span>
            </p>
            <p>
              <img
                alt=""
                aria-hidden="true"
                height={48}
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
                width={48}
              />
              <span>Gaps appear before the next draw.</span>
            </p>
          </div>
        </section>

        <svg
          aria-hidden="true"
          className="bp-capital-continuum"
          focusable="false"
          viewBox="0 0 1672 941"
        >
          <path
            className="bp-capital-continuum-line"
            d="M831 590 C852 590 862 587 875 576 C894 560 898 529 921 510 C939 496 956 487 962 481 C987 477 1007 474 1028 471 C1074 466 1103 455 1151 449 C1198 444 1248 444 1275 446 C1338 449 1379 448 1390 449 C1441 451 1483 454 1511 457 C1534 459 1556 461 1582 461"
          />
          <g className="bp-capital-continuum-checks">
            <circle cx="962" cy="481" r="15" />
            <circle cx="1028" cy="471" r="15" />
            <circle cx="1151" cy="449" r="15" />
            <circle cx="1275" cy="446" r="15" />
            <circle cx="1390" cy="449" r="15" />
            <circle cx="1511" cy="457" r="15" />
          </g>
          <g className="bp-capital-continuum-ticks">
            <path d="m955 480 7 7 14-15" />
            <path d="m1021 470 7 7 14-15" />
            <path d="m1144 448 7 7 14-15" />
            <path d="m1268 445 7 7 14-15" />
            <path d="m1383 448 7 7 14-15" />
            <path d="m1504 456 7 7 14-15" />
          </g>
        </svg>

        <section
          aria-label="Milestone draw plan with capital unlocked by approved progress"
          className="bp-milestone-plan"
        >
          <div className="bp-milestone-heading">
            <h3>Milestone Draw Plan</h3>
            <p>Capital follows approved progress.</p>
          </div>
          <div aria-hidden="true" className="bp-aligned-legend">
            <span />
            <p>
              Aligned capital
              <small>(when work needs it)</small>
            </p>
          </div>
          <img
            alt=""
            aria-hidden="true"
            className="bp-milestone-blueprint"
            height={184}
            src={`${extractedSqueezeAssetBase}/modern-home-blueprint.webp`}
            width={654}
          />
          {milestoneUnlocksForSqueeze.map((milestone) => (
            <div
              className={`bp-milestone-node ${milestone.className}`}
              key={milestone.label}
            >
              <img
                alt={`${milestone.label} unlock tag ${milestone.amount}`}
                height={70}
                src={milestone.src}
                width={100}
              />
              <span>{milestone.label}</span>
            </div>
          ))}
        </section>

        <img
          alt=""
          aria-hidden="true"
          className="bp-left-blueprint"
          height={194}
          src={`${extractedSqueezeAssetBase}/left-building-blueprint.webp`}
          width={170}
        />

        <div className="bp-squeeze-bottom">
          <div className="bp-squeeze-panel bp-squeeze-panel-risk">
            <div className="bp-squeeze-panel-title">
              <img
                alt=""
                aria-hidden="true"
                height={48}
                src={`${extractedSqueezeAssetBase}/warning-triangle.svg`}
                width={48}
              />
              <h3>Cash Gap Risk</h3>
            </div>
            <div className="bp-squeeze-panel-items">
              {cashGapRisks.map((item) => (
                <article className="bp-squeeze-panel-item" key={item.title}>
                  <img
                    alt=""
                    aria-hidden="true"
                    height={72}
                    src={`${extractedSqueezeAssetBase}/${item.icon}`}
                    width={68}
                  />
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <img
            alt=""
            aria-hidden="true"
            className="bp-squeeze-handoff"
            height={64}
            src={`${extractedSqueezeAssetBase}/handoff-arrow-circle.svg`}
            width={64}
          />

          <div className="bp-squeeze-panel bp-squeeze-panel-approved">
            <div className="bp-squeeze-panel-title">
              <img
                alt=""
                aria-hidden="true"
                height={48}
                src={`${extractedSqueezeAssetBase}/approved-check-circle.svg`}
                width={48}
              />
              <h3>Capital Unlocks With Approved Work</h3>
            </div>
            <div className="bp-squeeze-panel-items">
              {approvedWorkBenefits.map((item) => (
                <article className="bp-squeeze-panel-item" key={item.title}>
                  <img
                    alt=""
                    aria-hidden="true"
                    height={74}
                    src={`${extractedSqueezeAssetBase}/${item.icon}`}
                    width={68}
                  />
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BlueprintDraftingGrid(): ReactElement {
  const minorVerticalLines = Array.from(
    { length: 21 },
    (_, index) => index * 5
  );
  const minorHorizontalLines = Array.from(
    { length: 12 },
    (_, index) => index * 9
  );

  return (
    <svg
      aria-hidden="true"
      className="bp-squeeze-drafting-grid"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 1672 941"
    >
      <defs>
        <filter id="bp-squeeze-rough-line">
          <feTurbulence
            baseFrequency="0.018 0.09"
            numOctaves="2"
            result="noise"
            seed="19"
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="1.35"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <g className="bp-squeeze-minor-grid">
        {minorVerticalLines.map((percent) => (
          <path d={`M ${percent * 16.72} 24 V 918`} key={`v-${percent}`} />
        ))}
        {minorHorizontalLines.map((percent) => (
          <path d={`M 22 ${percent * 9.41} H 1650`} key={`h-${percent}`} />
        ))}
      </g>

      <g className="bp-squeeze-major-guides">
        <path d="M 28 24 H 1644" />
        <path d="M 28 920 H 1644" />
        <path d="M 28 24 V 920" />
        <path d="M 1644 24 V 920" />
        <path className="bp-squeeze-timeline-divider" d="M 836 326 V 707" />
        <path d="M 130 411 V 699" />
        <path d="M 1612 457 V 714" />
        <path d="M 130 424 H 0" />
        <path d="M 1612 457 H 1672" />
        <path d="M 835 707 H 1612" />
      </g>

      <g className="bp-squeeze-crop-marks">
        <path d="M 14 24 H 42 M 28 10 V 52" />
        <path d="M 1630 24 H 1658 M 1644 10 V 52" />
        <path d="M 14 920 H 42 M 28 890 V 934" />
        <path d="M 1630 920 H 1658 M 1644 890 V 934" />
        <path d="M 116 424 H 140 M 130 410 V 438" />
        <path d="M 1598 714 H 1626 M 1612 690 V 728" />
        <path d="M 1598 457 H 1626 M 1612 440 V 474" />
      </g>

      <text className="bp-squeeze-dimension is-left" x="38" y="420">
        24&apos;-0&quot;
      </text>
      <text
        className="bp-squeeze-dimension is-right"
        transform="rotate(-90 1619 628)"
        x="1619"
        y="628"
      >
        26&apos;-0&quot;
      </text>
    </svg>
  );
}
