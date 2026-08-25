import {
  Building2,
  CalendarDays,
  Check,
  FileText,
  HardHat,
  Landmark,
  Layers3,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { CSSProperties, ReactElement, RefObject } from "react";
import { useRef } from "react";

import { AnimatedBeam } from "#/components/ui/animated-beam.tsx";

export function HandoffMapGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-handoff-map">
      <svg role="img" viewBox="0 0 720 330">
        <title>Build handoff map</title>
        <defs>
          <filter id="bp-handoff-rough">
            <feTurbulence
              baseFrequency="0.9"
              numOctaves="2"
              seed="8"
              type="fractalNoise"
            />
            <feDisplacementMap in="SourceGraphic" scale="1.4" />
          </filter>
        </defs>
        <path
          className="bp-handoff-map-grid"
          d="M40 44 H682 M40 104 H682 M40 164 H682 M40 224 H682 M40 284 H682 M88 26 V300 M208 26 V300 M328 26 V300 M448 26 V300 M568 26 V300"
        />
        <path
          className="bp-handoff-map-stall"
          d="M104 82 C176 90 174 166 244 158 C320 150 302 238 384 224 C470 210 464 108 548 116"
        />
        <path
          className="bp-handoff-map-flow"
          d="M112 248 C178 232 224 210 274 190 C326 170 358 150 414 126 C472 98 528 82 614 76"
        />
        <g className="bp-handoff-map-nodes">
          <circle cx="112" cy="248" r="16" />
          <circle cx="274" cy="190" r="16" />
          <circle cx="414" cy="126" r="16" />
          <circle cx="614" cy="76" r="16" />
        </g>
        <g className="bp-handoff-map-ticks">
          <path d="m104 248 9 9 19-24" />
          <path d="m266 190 9 9 19-24" />
          <path d="m406 126 9 9 19-24" />
          <path d="m606 76 9 9 19-24" />
        </g>
        <g className="bp-handoff-map-labels">
          <text x="82" y="292">
            Builder
          </text>
          <text x="238" y="222">
            Broker
          </text>
          <text x="372" y="92">
            Architect
          </text>
          <text x="564" y="118">
            Consultant
          </text>
        </g>
        <g className="bp-handoff-map-center">
          <rect height="70" rx="14" width="172" x="344" y="174" />
          <text x="370" y="207">
            FairLend
          </text>
          <text x="370" y="228">
            30+ yr build desk
          </text>
        </g>
      </svg>
      <div className="bp-handoff-map-legend">
        <span>Build order</span>
        <span>Budget logic</span>
        <span>Draw plan</span>
      </div>
    </div>
  );
}

export function CmhcChecklistGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-cmhc-checklist">
      {["CMHC evidence", "Underwriting story", "Advisor fix", "Network handoff"].map(
        (item, index) => (
          <div
            className="bp-cmhc-row"
            key={item}
            style={{ "--row-index": index } as CSSProperties}
          >
            <span>
              <Check aria-hidden="true" strokeWidth={2.3} />
            </span>
            <strong>{item}</strong>
            <i />
          </div>
        )
      )}
    </div>
  );
}

export function DrawAvailabilityMockup(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-draw-mockup">
      <div className="bp-draw-phone">
        <div className="bp-draw-phone-top">
          <span>Available now</span>
          <strong>$250k</strong>
        </div>
        <div className="bp-draw-progress">
          <span />
          <span />
          <span />
        </div>
        <span>3 day SLA</span>
      </div>
      <svg className="bp-draw-orbit" viewBox="0 0 320 150">
        <title>Draw availability path</title>
        <path d="M22 112 C76 74 116 96 158 58 C198 22 246 42 298 18" />
        <circle cx="158" cy="58" r="9" />
        <circle cx="298" cy="18" r="9" />
      </svg>
    </div>
  );
}

interface NetworkNode {
  className: string;
  Icon: typeof HardHat;
  label: string;
  ref: RefObject<HTMLDivElement | null>;
  tag: string;
}

export function ProfessionalNetworkBeamGraphic(): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const buildersRef = useRef<HTMLDivElement | null>(null);
  const financingRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef<HTMLDivElement | null>(null);
  const designRef = useRef<HTMLDivElement | null>(null);
  const pmRef = useRef<HTMLDivElement | null>(null);
  const legalRef = useRef<HTMLDivElement | null>(null);
  const tradesRef = useRef<HTMLDivElement | null>(null);
  const suppliersRef = useRef<HTMLDivElement | null>(null);

  const nodes: NetworkNode[] = [
    {
      className: "is-builders",
      Icon: HardHat,
      label: "Builders",
      ref: buildersRef,
      tag: "Sponsor",
    },
    {
      className: "is-financing",
      Icon: Landmark,
      label: "Financing advisors",
      ref: financingRef,
      tag: "Capital",
    },
    {
      className: "is-energy",
      Icon: ShieldCheck,
      label: "Energy + CMHC",
      ref: energyRef,
      tag: "Proof",
    },
    {
      className: "is-design",
      Icon: Building2,
      label: "Architects + designers",
      ref: designRef,
      tag: "Plan",
    },
    {
      className: "is-pm",
      Icon: CalendarDays,
      label: "Project managers",
      ref: pmRef,
      tag: "Schedule",
    },
    {
      className: "is-legal",
      Icon: FileText,
      label: "Lawyers",
      ref: legalRef,
      tag: "Close",
    },
    {
      className: "is-trades",
      Icon: Wrench,
      label: "Contractors",
      ref: tradesRef,
      tag: "Work",
    },
    {
      className: "is-suppliers",
      Icon: Layers3,
      label: "Suppliers",
      ref: suppliersRef,
      tag: "Materials",
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="bp-handoff-graphic bp-professional-network"
      ref={containerRef}
    >
      <div className="bp-network-drafting-note">
        <span>Network plan</span>
        <strong>60&apos; x 100&apos;</strong>
      </div>
      <svg
        className="bp-network-static-beams is-desktop"
        preserveAspectRatio="none"
        viewBox="0 0 596 430"
      >
        <title>Professional network desktop beams</title>
        <path d="M298 190 Q320 112 327 77" />
        <path d="M298 190 Q232 126 121 129" />
        <path d="M298 190 Q370 126 475 129" />
        <path d="M298 190 Q214 184 119 184" />
        <path d="M298 190 Q380 184 477 184" />
        <path d="M298 190 Q232 275 149 311" />
        <path d="M298 190 Q372 275 411 311" />
        <path d="M298 190 Q302 292 298 344" />
      </svg>
      <svg
        className="bp-network-static-beams is-mobile"
        preserveAspectRatio="none"
        viewBox="0 0 320 806"
      >
        <title>Professional network mobile beams</title>
        <path d="M160 350 Q158 220 160 103" />
        <path d="M160 350 Q124 256 145 179" />
        <path d="M160 350 Q206 288 175 255" />
        <path d="M160 350 Q118 392 145 455" />
        <path d="M160 350 Q212 418 175 529" />
        <path d="M160 350 Q118 500 145 603" />
        <path d="M160 350 Q216 554 175 677" />
        <path d="M160 350 Q160 640 160 751" />
      </svg>
      <div className="bp-network-center" ref={centerRef}>
        <span>FairLend</span>
        <strong>Build desk</strong>
        <small>planning to closing</small>
      </div>
      {nodes.map(({ className, Icon, label, ref, tag }) => (
        <div className={`bp-network-node ${className}`} key={label} ref={ref}>
          <span>
            <Icon aria-hidden="true" strokeWidth={1.65} />
          </span>
          <div>
            <small>{tag}</small>
            <strong>{label}</strong>
          </div>
        </div>
      ))}
      {nodes.map(({ className, ref }, index) => (
        <AnimatedBeam
          basePathClassName="bp-network-beam-base"
          beamClassName="bp-network-beam-active"
          className={`bp-network-beam ${className}`}
          containerRef={containerRef}
          curvature={index % 2 === 0 ? 38 : -34}
          delay={index * 0.18}
          duration={3.2}
          fromRef={centerRef}
          gradientStartColor="oklch(0.45 0.2 145)"
          gradientStopColor="oklch(0.58 0.16 178)"
          key={className}
          pathColor="oklch(0.4 0.12 240 / 0.34)"
          pathDasharray="7 8"
          pathOpacity={0.62}
          pathWidth={2}
          repeatDelay={0.7}
          toRef={ref}
          variant="blueprint"
        />
      ))}
      <div className="bp-network-spec-table">
        <span>Advisors</span>
        <strong>30+ yr field desk</strong>
        <span>Trades</span>
        <strong>priced below market</strong>
        <span>Draws</span>
        <strong>3 day SLA</strong>
      </div>
    </div>
  );
}

export function FieldSupportGraphic(): ReactElement {
  return (
    <div aria-hidden="true" className="bp-handoff-graphic bp-field-support">
      <svg viewBox="0 0 360 260">
        <title>Field support site plan</title>
        <path
          className="bp-field-lot"
          d="M42 198 L182 128 L318 188 L178 236 Z"
        />
        <path
          className="bp-field-house"
          d="M132 132 L190 96 L258 132 L258 196 L132 196 Z"
        />
        <path className="bp-field-roof" d="M118 134 L190 88 L272 134" />
        <path
          className="bp-field-route"
          d="M58 210 C82 178 118 184 144 162 C170 140 188 122 224 118"
        />
        <circle className="bp-field-pin" cx="224" cy="118" r="15" />
        <path className="bp-field-check" d="m217 117 6 7 13-16" />
      </svg>
      <div className="bp-field-tags">
        <span>Site visit</span>
        <span>Supplier price</span>
        <span>Trade fix</span>
        <span>Investor help</span>
      </div>
    </div>
  );
}
