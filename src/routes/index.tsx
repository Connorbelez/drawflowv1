import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import Header from "#/components/Header";
import { Button } from "../components/ui/button";
import "./-landing-blueprint.css";

export const Route = createFileRoute("/")({ component: App });

/* ----------------------------------------------------------------------------
 * Landing page rebuilt as a blueprint sheet.
 *
 * The page is, by design, a construction document:
 *   - sheet title bar at the top (sheet ref, project, date, rev)
 *   - corner registration marks on the canvas
 *   - dimension lines + leader callouts in the hero plan view
 *   - drafting schedule tables for the plan comparison and the stack
 *   - drafting spec list for the governance invariants
 *   - title block + scale bar fixed at the bottom
 *
 * Every section is referenced by a sheet tag (A-01 PLAN VIEW, A-02 ELEVATION,
 * A-03 DETAIL, A-04 SPECS, A-05 SCHEDULE).
 * -------------------------------------------------------------------------- */

function App() {
  useReveal();
  return (
    <main className="lbp-shell text-foreground">
      <SheetBar />
      <BlueprintCorners />

      <div className="lbp-frame mx-auto max-w-6xl px-6 pt-4 pb-28 sm:px-10">
        <Header />

        <Hero />
        <SectionRule />

        <PlanSchedule />
        <SectionRule />

        <WorkspaceDetail />
        <SectionRule />

        <GovernanceSpecs />
        <SectionRule />

        <StackSchedule />
        <SectionRule />

        <CloseStamp />
      </div>

      <ScaleBar />
      <TitleBlock />
    </main>
  );
}

/* ----------------------------------------------------------------------------
 * Reveal driver — one IntersectionObserver toggles `.in` on any element
 * carrying [data-rv] or [data-wipe]. CSS owns the actual motion so the
 * hook is allocation-free past mount and stays trivially cheap.
 * -------------------------------------------------------------------------- */
function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targets = document.querySelectorAll<HTMLElement>(
      ".lbp-shell [data-rv], .lbp-shell [data-wipe]",
    );
    if (prefersReduced) {
      targets.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    const vh = window.innerHeight;
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      // Anything already inside the viewport at mount: trigger now so the
      // CSS transitions start on first paint instead of waiting for IO.
      if (r.top < vh * 0.95 && r.bottom > 0) {
        el.classList.add("in");
      } else {
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, []);
}

/* ----------------------------------------------------------------------------
 * Draft — splits a string into per-word, per-character spans for the
 * blueprint draft-in animation. The wrapping element keeps the original
 * accessible label; spans inherit color and don't change semantics.
 * `start` lets a single headline split into multiple Draft segments while
 * keeping a continuous index across them.
 * -------------------------------------------------------------------------- */
function Draft({
  text,
  start = 0,
  className,
}: {
  text: string;
  start?: number;
  className?: string;
}) {
  let idx = start - 1;
  const words = text.split(" ");
  return (
    <span
      aria-label={text}
      className={`lbp-draft${className ? ` ${className}` : ""}`}
    >
      <span aria-hidden="true">
        {words.flatMap((word, wi) => {
          const span = (
            <span className="lbp-word" key={`w-${wi}`}>
              {[...word].map((ch, ci) => {
                idx += 1;
                return (
                  <span
                    className="lbp-char"
                    key={ci}
                    style={{ "--i": idx } as CSSProperties}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          );
          return wi < words.length - 1 ? [span, " "] : [span];
        })}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Sheet bar — drafting strip across the top of the sheet.
 * Reads the way a real titleblock does at the edge of a drawing:
 *   SHEET A-001 · DRAWFLOW / DRAW MANAGEMENT SYSTEM · DATE / SCALE / REV.
 * -------------------------------------------------------------------------- */

function SheetBar() {
  return (
    <div aria-hidden className="lbp-sheet-bar">
      <span>
        <strong>Sheet A-001</strong>
        <span className="dot" />
        Construction draw management
      </span>
      <span>
        DrawFlow · Coupled control system · v0.4
      </span>
      <span>
        Scale 1:48
        <span className="dot" />
        Issued 2026-05-19
        <span className="dot" />
        <strong>Rev 03</strong>
      </span>
    </div>
  );
}

/* Four crosshair registration marks. */
function BlueprintCorners(): ReactElement {
  return (
    <>
      <BlueprintCorner position="tl" />
      <BlueprintCorner position="tr" />
      <BlueprintCorner position="bl" />
      <BlueprintCorner position="br" />
    </>
  );
}

function BlueprintCorner({
  position,
}: {
  position: "tl" | "tr" | "bl" | "br";
}): ReactElement {
  return (
    <span aria-hidden className={`lbp-corner ${position}`}>
      <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="9.5" fill="none" stroke="currentColor" strokeWidth="1" />
        <line x1="14" y1="0" x2="14" y2="28" stroke="currentColor" strokeWidth="1" />
        <line x1="0" y1="14" x2="28" y2="14" stroke="currentColor" strokeWidth="1" />
      </svg>
    </span>
  );
}

/* Title block — fixed bottom-right cartouche. */
function TitleBlock() {
  return (
    <aside aria-hidden className="lbp-title-block">
      <div>
        <dt>Project</dt>
        <dd>DrawFlow</dd>
      </div>
      <div>
        <dt>Drawn by</dt>
        <dd>FAIRLEND ENG.</dd>
      </div>
      <div>
        <dt>Sheet</dt>
        <dd>A-001 / 005</dd>
      </div>
      <div>
        <dt>Date</dt>
        <dd>2026-05-19</dd>
      </div>
      <div>
        <dt>Scale</dt>
        <dd>1 : 48</dd>
      </div>
      <div className="rev">
        <dt>Revision</dt>
        <dd>03 ▲</dd>
      </div>
    </aside>
  );
}

/* Decorative scale bar — bottom-left. */
function ScaleBar() {
  return (
    <div aria-hidden className="lbp-scale-bar">
      <span>0 · 60 · 120 · 180 · 240 days</span>
      <div>
        <span /><span /><span /><span />
      </div>
      <small>
        <span>0</span><span>120</span><span>240</span>
      </small>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Hero — A-01 PLAN VIEW.
 *
 * A full-bleed annotated drawing that reads as the central detail of the
 * sheet: two coupled lanes (construction + capital) with dimension lines,
 * leader callouts to numbered notes, compass rose, and a scale bar.
 * -------------------------------------------------------------------------- */

function Hero() {
  const HERO_PREFIX = "The construction plan and the capital release plan,";
  const HERO_ACCENT = "modeled as one drawing.";
  const ACCENT_START = HERO_PREFIX.replace(/ /g, "").length;
  return (
    <section className="mt-10 lg:mt-14">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-end lg:gap-14">
        <div className="space-y-7">
          <SectionTag refLabel="A-01" label="Plan view — coupled control" />
          <h1
            data-rv
            style={{ "--rv-d": 120 } as CSSProperties}
            className="text-balance font-heading font-medium text-5xl text-fg-primary leading-[0.95] tracking-tight sm:text-6xl lg:text-[68px]"
          >
            <Draft text={HERO_PREFIX} />{" "}
            <Draft
              className="lbp-accent"
              start={ACCENT_START}
              text={HERO_ACCENT}
            />
          </h1>
          <p
            data-rv
            style={{ "--rv-d": 900 } as CSSProperties}
            className="max-w-xl text-fg-secondary text-lg leading-relaxed"
          >
            DrawFlow turns a construction roadmap into reimbursement-based draw
            plans, then governs execution through evidence, site visits,
            approvals, and audit events. Builders and lender teams work the same
            sheet, never a thread of spreadsheets.
          </p>

          <div className="lbp-cta-row flex flex-wrap items-center gap-3 pt-2">
            <Button render={<Link to="/demo/workos" />} size="lg">
              Enter workspace
              <ArrowUpRight className="size-4" />
            </Button>
            <Button
              className="text-fg-secondary"
              render={<Link to="/demo/timeline" />}
              size="lg"
              variant="ghost"
            >
              Open detail sheet ↗
            </Button>
          </div>

          <dl
            data-rv
            style={{ "--rv-d": 1100 } as CSSProperties}
            className="mt-2 grid max-w-md grid-cols-3 gap-x-6 gap-y-2 border-border border-t pt-4 text-xs lbp-meta"
          >
            <KeyValue k="Reimburse" v="On complete" />
            <KeyValue k="Interest" v="On release" />
            <KeyValue k="Fees" v="Per draw" />
          </dl>
        </div>

        <div
          data-wipe
          style={{ "--rv-d": 600 } as CSSProperties}
        >
          <PlanViewDiagram />
        </div>
      </div>
    </section>
  );
}

/* The hero centerpiece — a real annotated plan drawing in SVG.
 *
 * Coordinate system: 1000 wide × 640 tall.
 *  - top dimension line: total duration 240 days
 *  - construction lane: 7 milestones M1..M7, solid filled boxes (the build)
 *  - capital lane: 4 draws D1..D4 with hatched fill (the release)
 *  - leader callouts 01..04 pointing to specific structures
 *  - compass rose top-right; scale ticks bottom-left
 *  - detail-ref bubble bottom-right.
 */
function PlanViewDiagram() {
  // Geometry, in viewBox units.
  const L = 80;
  const R = 720;
  const W = R - L; // 640
  const milestones = [
    { id: "M1", label: "Foundation", x: 0, w: 0.14 },
    { id: "M2", label: "Framing", x: 0.14, w: 0.16 },
    { id: "M3", label: "Rough-in", x: 0.30, w: 0.14 },
    { id: "M4", label: "Drywall", x: 0.44, w: 0.10 },
    { id: "M5", label: "Exterior", x: 0.54, w: 0.18 },
    { id: "M6", label: "Finishes", x: 0.72, w: 0.18 },
    { id: "M7", label: "Closeout", x: 0.90, w: 0.10 },
  ];
  const draws = [
    { id: "D1", x: 0.00, w: 0.30 },
    { id: "D2", x: 0.30, w: 0.24 },
    { id: "D3", x: 0.54, w: 0.36 },
    { id: "D4", x: 0.90, w: 0.10 },
  ];

  const consY = 200;
  const consH = 56;
  const capY = 360;
  const capH = 40;

  // x() in absolute units, given a 0..1 fraction.
  const fx = (f: number) => L + W * f;

  return (
    <figure className="lbp-plate p-5 sm:p-6">
      <div className="lbp-plate-header">
        <span>
          <span className="key">Detail A-01</span> · Coupled plan / capital release
        </span>
        <span>4 draws / 7 milestones · 240 days</span>
      </div>

      <svg
        className="lbp-diagram mt-3"
        viewBox="0 0 1000 640"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* North arrow / compass rose */}
        <g className="lbp-compass" transform="translate(900,60)">
          <circle r="22" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <path d="M0,-22 L5,0 L0,22 L-5,0 Z" fill="currentColor" opacity="0.85" />
          <text textAnchor="middle" y="-28" className="label">N</text>
        </g>

        {/* Top dimension line — total duration 240d, between two extension lines. */}
        <DimensionLine x1={L} x2={R} y={70} label="240 DAYS · TOTAL" />
        {/* Extension ticks down to construction lane */}
        <line x1={L} y1={70} x2={L} y2={consY - 6} stroke="currentColor" strokeWidth="0.6" className="stroke" opacity="0.6" />
        <line x1={R} y1={70} x2={R} y2={consY - 6} stroke="currentColor" strokeWidth="0.6" className="stroke" opacity="0.6" />

        {/* Lane labels */}
        <g>
          <text x={L} y={consY - 16} className="label">A · CONSTRUCTION PLAN</text>
          <text x={L} y={capY - 16} className="label">B · CAPITAL RELEASE PLAN</text>
        </g>

        {/* Lane left tags (vertical sheet refs) */}
        <g transform={`translate(${L - 40}, ${consY + consH / 2})`}>
          <rect x="-18" y="-12" width="36" height="24" fill="none" stroke="currentColor" className="stroke" strokeWidth="0.8" />
          <text textAnchor="middle" dy="4" className="label">A</text>
        </g>
        <g transform={`translate(${L - 40}, ${capY + capH / 2})`}>
          <rect x="-18" y="-12" width="36" height="24" fill="none" stroke="currentColor" className="stroke" strokeWidth="0.8" />
          <text textAnchor="middle" dy="4" className="label">B</text>
        </g>

        {/* Construction lane background hatch */}
        <rect
          x={L} y={consY} width={W} height={consH}
          fill="url(#hatch-cons)"
          stroke="currentColor" strokeWidth="0.6" className="stroke" opacity="0.95"
        />
        {/* Capital lane background hatch */}
        <rect
          x={L} y={capY} width={W} height={capH}
          fill="url(#hatch-cap)"
          stroke="currentColor" strokeWidth="0.6" className="stroke" opacity="0.95"
        />

        {/* Milestones */}
        {milestones.map((m) => {
          const x = fx(m.x);
          const w = W * m.w - 4;
          return (
            <g key={m.id}>
              <rect
                x={x + 2} y={consY + 6}
                width={Math.max(w, 4)}
                height={consH - 12}
                className="fill-ink"
                opacity="0.92"
                rx="1.5"
              />
              <text
                x={x + 8}
                y={consY + consH / 2 + 4}
                fill="var(--paper)"
                fontSize="11"
                fontWeight="700"
                letterSpacing="0.04em"
              >
                {m.label}
              </text>
              <text x={x + 4} y={consY - 4} className="label-mute" fontSize="8.5">
                {m.id}
              </text>
            </g>
          );
        })}

        {/* Draws — drafted as hatched bands above the capital lane fill. */}
        {draws.map((d) => {
          const x = fx(d.x);
          const w = W * d.w - 4;
          return (
            <g key={d.id}>
              <rect
                x={x + 2} y={capY + 6}
                width={Math.max(w, 4)}
                height={capH - 12}
                fill="url(#hatch-release)"
                stroke="currentColor"
                strokeWidth="1"
                className="stroke"
                rx="1"
              />
              <text x={x + 6} y={capY + capH / 2 + 4} className="label-ink" fontSize="11">
                {d.id}
              </text>
            </g>
          );
        })}

        {/* Vertical coupling lines connecting end of each draw to construction lane */}
        {draws.map((d) => {
          const xEnd = fx(d.x + d.w);
          return (
            <g key={`coup-${d.id}`} className="stroke" opacity="0.55">
              <line
                x1={xEnd - 2} y1={consY + consH}
                x2={xEnd - 2} y2={capY}
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="2 3"
              />
              {/* Release marker on capital lane bottom */}
              <g transform={`translate(${xEnd - 2}, ${capY + capH + 6})`}>
                <polygon points="0,0 -4,6 4,6" className="fill-release" />
                <text textAnchor="middle" y="18" fontSize="9" className="label" fill="var(--release)">
                  RELEASE
                </text>
              </g>
            </g>
          );
        })}

        {/* Bottom dimension line — phases per draw */}
        <g>
          <line x1={L} y1={capY + capH + 60} x2={R} y2={capY + capH + 60} stroke="currentColor" className="stroke" strokeWidth="0.8" />
          {[0, 0.30, 0.54, 0.90, 1].map((f) => (
            <line key={f} x1={fx(f)} y1={capY + capH + 56} x2={fx(f)} y2={capY + capH + 64} stroke="currentColor" className="stroke" strokeWidth="0.8" />
          ))}
          {[
            { x: 0.15, label: "72 D" },
            { x: 0.42, label: "57 D" },
            { x: 0.72, label: "86 D" },
            { x: 0.95, label: "25 D" },
          ].map((s) => (
            <text key={s.label} x={fx(s.x)} y={capY + capH + 78} textAnchor="middle" className="label">
              {s.label}
            </text>
          ))}
        </g>

        {/* Numbered leader callouts — labels rendered as a column on the right. */}
        <Callout
          number="01"
          from={{ x: fx(0.07), y: consY + consH / 2 }}
          to={{ x: 830, y: 200 }}
          title="Reimbursement"
          body="Only after milestone completion."
        />
        <Callout
          number="02"
          from={{ x: fx(0.42), y: capY + capH / 2 }}
          to={{ x: 830, y: 290 }}
          title="Interest"
          body="Begins at release, not commitment."
        />
        <Callout
          number="03"
          from={{ x: fx(0.62), y: consY + consH / 2 }}
          to={{ x: 830, y: 380 }}
          title="Evidence"
          body="Photo, document, geofence."
        />
        <Callout
          number="04"
          from={{ x: fx(0.95), y: capY + capH / 2 }}
          to={{ x: 830, y: 470 }}
          title="Approval"
          body="Lender admin alone releases."
        />

        {/* Detail ref bubble — bottom-right corner of drawing */}
        <g transform="translate(870, 580)">
          <circle r="22" fill="none" stroke="currentColor" className="stroke-strong" />
          <line x1="-22" y1="0" x2="22" y2="0" stroke="currentColor" className="stroke" />
          <text textAnchor="middle" dy="-6" className="label">A</text>
          <text textAnchor="middle" dy="14" className="label">02</text>
        </g>

        {/* Patterns / defs */}
        <defs>
          <pattern id="hatch-cons" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--blue)" strokeWidth="0.4" opacity="0.45" />
          </pattern>
          <pattern id="hatch-cap" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--release)" strokeWidth="0.4" opacity="0.45" />
          </pattern>
          <pattern id="hatch-release" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--release)" strokeWidth="0.6" opacity="0.7" />
          </pattern>
        </defs>
      </svg>
    </figure>
  );
}

/* ----------------------------------------------------------------------------
 * Dimension line — extension ticks + arrows + centered label.
 * -------------------------------------------------------------------------- */
function DimensionLine({
  x1,
  x2,
  y,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  const arrow = 5;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="currentColor" className="stroke" strokeWidth="0.8" />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="currentColor" className="stroke" strokeWidth="0.8" />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="currentColor" className="stroke" strokeWidth="0.8" />
      <polygon
        points={`${x1},${y} ${x1 + arrow},${y - 2.5} ${x1 + arrow},${y + 2.5}`}
        className="fill-blue"
      />
      <polygon
        points={`${x2},${y} ${x2 - arrow},${y - 2.5} ${x2 - arrow},${y + 2.5}`}
        className="fill-blue"
      />
      <rect
        x={(x1 + x2) / 2 - label.length * 3.8}
        y={y - 9}
        width={label.length * 7.6}
        height={18}
        className="fill-paper"
      />
      <text x={(x1 + x2) / 2} y={y + 4} textAnchor="middle" className="label">
        {label}
      </text>
    </g>
  );
}

/* Numbered leader callout: bubble at `to`, dot at `from`, kinked leader. */
function Callout({
  number,
  from,
  to,
  title,
  body,
}: {
  number: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  title: string;
  body: string;
}) {
  const elbowX = to.x - 80;
  return (
    <g>
      {/* Leader line — kinked */}
      <polyline
        points={`${from.x},${from.y} ${elbowX},${from.y} ${elbowX},${to.y} ${to.x - 18},${to.y}`}
        fill="none"
        stroke="currentColor"
        className="stroke"
        strokeWidth="0.8"
      />
      <circle cx={from.x} cy={from.y} r="2.5" className="fill-blue" />

      {/* Numbered bubble */}
      <g transform={`translate(${to.x}, ${to.y})`}>
        <circle r="13" fill="var(--paper)" stroke="currentColor" className="stroke-strong" />
        <text textAnchor="middle" dy="4" className="label" fontSize="10.5">
          {number}
        </text>
      </g>

      {/* Note */}
      <text x={to.x + 22} y={to.y - 4} className="label-ink" fontSize="11">
        {title}
      </text>
      <text x={to.x + 22} y={to.y + 10} className="label-mute" fontSize="9.5">
        {body}
      </text>
    </g>
  );
}

/* ----------------------------------------------------------------------------
 * Section divider rule with end ticks.
 * -------------------------------------------------------------------------- */
function SectionRule() {
  return (
    <div aria-hidden className="lbp-section-rule" data-rv>
      <span className="tick s" />
      <span className="tick e" />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * A-02 — Elevation: plan variants as a drafting schedule.
 * -------------------------------------------------------------------------- */

const PLAN_ROWS: {
  id: string;
  name: string;
  rationale: string;
  fees: number;
  cycle: number;
  wcl: number;
  recommended?: boolean;
}[] = [
  {
    id: "P-01",
    name: "Cheapest Feasible",
    rationale:
      "Minimizes total financing cost. Groups milestones to amortize draw fees, balanced against working-capital exposure.",
    fees: 2,
    cycle: 3,
    wcl: 3,
    recommended: true,
  },
  {
    id: "P-02",
    name: "Fastest",
    rationale:
      "Shortest path from break-ground to closeout. Tighter draws, more inspection events, higher fee load.",
    fees: 5,
    cycle: 5,
    wcl: 2,
  },
  {
    id: "P-03",
    name: "Capital-Constrained",
    rationale:
      "Respects a hard working-capital ceiling. Stretches some sequences, may defer non-critical milestones.",
    fees: 3,
    cycle: 1,
    wcl: 1,
  },
];

function PlanSchedule() {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-5">
          <SectionTag refLabel="A-02" label="Elevation — draw plan variants" />
          <h2
            data-rv
            className="max-w-2xl font-heading font-medium text-3xl text-fg-primary leading-tight tracking-tight sm:text-4xl"
          >
            <Draft text="Three plans, optimized across both axes. Pick one," />{" "}
            <Draft
              className="lbp-accent"
              start={
                "Three plans, optimized across both axes. Pick one,".replace(
                  / /g,
                  "",
                ).length
              }
              text="the rest are stamped as alternates."
            />
          </h2>
        </div>
        <span className="lbp-stamp">
          <span className="dotpair" />
          Issued for review
        </span>
      </div>

      <div className="lbp-plate mt-10 overflow-hidden">
        <div className="lbp-plate-header">
          <span>
            <span className="key">Schedule S-02</span> · Plan variants
          </span>
          <span>3 ROWS · OPTIMIZED 2026-05-19</span>
        </div>

        <div className="overflow-x-auto">
          <table className="lbp-schedule">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Ref</th>
                <th style={{ width: 200 }}>Variant</th>
                <th>Rationale</th>
                <th style={{ width: 110 }}>Fees</th>
                <th style={{ width: 110 }}>Cycle</th>
                <th style={{ width: 110 }}>WCL strain</th>
                <th style={{ width: 90 }}>Mark</th>
              </tr>
            </thead>
            <tbody data-rv>
              {PLAN_ROWS.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.id}</td>
                  <td>
                    <div className="plan">{r.name}</div>
                  </td>
                  <td className="text-fg-secondary" style={{ lineHeight: 1.55 }}>
                    {r.rationale}
                  </td>
                  <td>
                    <Meter level={r.fees} tone="r" />
                  </td>
                  <td>
                    <Meter level={r.cycle} />
                  </td>
                  <td>
                    <Meter level={r.wcl} tone="g" />
                  </td>
                  <td>
                    {r.recommended ? (
                      <span className="lbp-stamp" style={{ transform: "rotate(-4deg)" }}>
                        Default
                      </span>
                    ) : (
                      <span className="lbp-meta">Alternate</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Meter({ level, tone }: { level: number; tone?: "r" | "g" }) {
  const cls = tone === "r" ? "meter r" : tone === "g" ? "meter g" : "meter";
  return (
    <span className={cls}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? "on" : ""} />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * A-03 — Detail: build workspace, exploded view + side notes.
 * -------------------------------------------------------------------------- */

const WORKSPACE_LAYERS = [
  { k: "Milestone rail", v: "Card-by-card progress, dependencies, blocking state, role-aware actions." },
  { k: "Construction roadmap", v: "Gantt-style sequencing with draw-group bounding boxes overlaid on the timeline." },
  { k: "Evidence packages", v: "Photos, documents, geofence signals; failures route for review, never discard." },
  { k: "Site visits", v: "Mobile capture with offline drafts, structured reports, lender-staff recommendations." },
  { k: "Approvals", v: "Lender staff review and inspect. Lender admin holds final milestone and release authority." },
  { k: "Audit trail", v: "Actor, role, timestamp, prior and new state, warnings, reason. Versioned budgets." },
];

function WorkspaceDetail() {
  return (
    <section>
      <SectionTag refLabel="A-03" label="Detail — build workspace" />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-14">
        <div className="space-y-5">
          <h2
            data-rv
            className="font-heading font-medium text-3xl text-fg-primary leading-tight tracking-tight sm:text-4xl"
          >
            <Draft text="One control plane." />{" "}
            <Draft
              className="lbp-accent"
              start={"One control plane.".replace(/ /g, "").length}
              text="Builders, lenders, the same sheet."
            />
          </h2>
          <p
            data-rv
            style={{ "--rv-d": 300 } as CSSProperties}
            className="max-w-md text-fg-secondary text-[15px] leading-relaxed"
          >
            Other surfaces are subordinate: kanban queues for lender ops, focused
            evidence review, mobile site-visit flows, approval decisions. They
            all reconcile against this drawing.
          </p>

          <div className="lbp-plate mt-4 p-5">
            <ExplodedStack />
          </div>
        </div>

        <div className="lbp-plate overflow-hidden">
          <div className="lbp-plate-header">
            <span>
              <span className="key">Detail D-03</span> · Workspace layers
            </span>
            <span>06 layers · top → bottom</span>
          </div>
          <ul className="lbp-layers" data-rv>
            {WORKSPACE_LAYERS.map((l, i) => (
              <li
                className="grid grid-cols-[88px_1fr] items-baseline gap-4 border-border border-b px-5 py-4 last:border-0"
                key={l.k}
              >
                <span className="flex items-center gap-3">
                  <span className="lbp-num">{String(i + 1).padStart(2, "0")}</span>
                  <span aria-hidden className="h-px w-3 bg-border" />
                </span>
                <div>
                  <p className="font-heading font-medium text-base text-fg-primary">{l.k}</p>
                  <p className="mt-1 text-fg-secondary text-sm leading-relaxed">{l.v}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* Exploded-view diagram — stacked plates, slightly offset, with leaders. */
function ExplodedStack() {
  const layers = ["Audit", "Approvals", "Site visits", "Evidence", "Roadmap", "Milestones"];
  return (
    <svg
      viewBox="0 0 480 300"
      xmlns="http://www.w3.org/2000/svg"
      className="lbp-diagram"
      role="img"
      aria-label="Exploded view of workspace layers"
    >
      <defs>
        <pattern id="x-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--blue)" strokeWidth="0.4" opacity="0.4" />
        </pattern>
      </defs>

      {/* axis */}
      <line x1="60" y1="20" x2="60" y2="280" stroke="currentColor" className="stroke" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.6" />

      {layers.map((name, i) => {
        const y = 30 + i * 40;
        const skewX = 64 + i * 6;
        return (
          <g key={name} transform={`translate(${skewX}, ${y})`}>
            <rect width="280" height="26" fill="url(#x-hatch)" stroke="currentColor" className="stroke" strokeWidth="0.8" />
            <rect width="280" height="26" fill="var(--paper)" opacity="0.55" />
            <text x="12" y="17" className="label-ink" fontSize="11">{name}</text>
            <text x="262" y="17" textAnchor="end" className="label">L-{String(layers.length - i).padStart(2, "0")}</text>
            {/* Leader to axis */}
            <line x1="0" y1="13" x2={-skewX + 60} y2="13" stroke="currentColor" className="stroke" strokeWidth="0.6" opacity="0.55" />
            <circle cx={-skewX + 60} cy="13" r="1.6" className="fill-blue" />
          </g>
        );
      })}

      <text x="60" y="14" className="label">DEPTH ↓</text>
      <text x="380" y="14" className="label">SHEET A-03 · DETAIL</text>
    </svg>
  );
}

/* ----------------------------------------------------------------------------
 * A-04 — Specifications: governance invariants as drafting notes.
 * -------------------------------------------------------------------------- */

const SPECS = [
  "Reimbursement only. No proactive advance funding before work completion.",
  "Interest begins at release, not at commitment.",
  "Borrower working-capital limit is distinct from lender draw-policy limit.",
  "Lender staff inspect and recommend. Lender admin alone releases.",
  "Geofence failure never discards evidence. It routes for review.",
  "Budgets are versioned, not overwritten.",
  "Every override emits an audit event with reason, actor, and prior state.",
  "Every entity is organization-scoped from day one.",
];

function GovernanceSpecs() {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-5">
          <SectionTag refLabel="A-04" label="Specifications — invariants" />
          <h2
            data-rv
            className="max-w-3xl font-heading font-medium text-3xl text-fg-primary leading-tight tracking-tight sm:text-4xl"
          >
            <Draft text="Rules the product refuses to drift on." />{" "}
            <Draft
              className="lbp-accent"
              start={"Rules the product refuses to drift on.".replace(/ /g, "").length}
              text="Notes are part of the drawing."
            />
          </h2>
        </div>
        <span className="lbp-meta">General notes · GN-01 → GN-08</span>
      </div>

      <ol className="lbp-specs mt-10" data-rv>
        {SPECS.map((s, i) => (
          <li key={s}>
            <span className="marker">GN-{String(i + 1).padStart(2, "0")}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * A-05 — Stack schedule. Drafted as a materials schedule.
 * -------------------------------------------------------------------------- */

const STACK_ROWS = [
  { ref: "M-01", part: "Runtime", spec: "TanStack Start · React 19 · Bun · Vite 8" },
  { ref: "M-02", part: "Data", spec: "Convex · fluent-convex · Zod refinements" },
  { ref: "M-03", part: "Auth", spec: "WorkOS AuthKit · organization-scoped" },
  { ref: "M-04", part: "Surface", spec: "Tailwind 4 · shadcn primitives · Base UI · Motion" },
];

function StackSchedule() {
  return (
    <section>
      <SectionTag refLabel="A-05" label="Schedule — materials" />

      <div className="lbp-plate mt-8 overflow-hidden">
        <div className="lbp-plate-header">
          <span>
            <span className="key">Schedule S-05</span> · Stack
          </span>
          <span>04 items · api-first · tenant scoped</span>
        </div>

        <div className="overflow-x-auto">
          <table className="lbp-schedule">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Ref</th>
                <th style={{ width: 140 }}>Part</th>
                <th>Specification</th>
              </tr>
            </thead>
            <tbody data-rv>
              {STACK_ROWS.map((row) => (
                <tr key={row.ref}>
                  <td className="num">{row.ref}</td>
                  <td>
                    <span className="plan" style={{ fontSize: 16 }}>{row.part}</span>
                  </td>
                  <td className="text-fg-secondary">{row.spec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Close — CTA with revision stamp + detail reference.
 * -------------------------------------------------------------------------- */

function CloseStamp() {
  return (
    <section className="mt-16">
      <div className="lbp-plate p-8 sm:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
          <div className="space-y-5">
            <SectionTag refLabel="A-06" label="For construction" />
            <h2
              data-rv
              className="max-w-2xl font-heading font-medium text-3xl text-fg-primary leading-tight tracking-tight sm:text-4xl"
            >
              <Draft text="Walk through a draw," />{" "}
              <Draft
                className="lbp-accent"
                start={"Walk through a draw,".replace(/ /g, "").length}
                text="end to end."
              />
            </h2>
            <p
              data-rv
              style={{ "--rv-d": 240 } as CSSProperties}
              className="max-w-xl text-fg-secondary text-[15px] leading-relaxed"
            >
              The timeline detail sheet is the same drawing, instrumented. Open
              it to inspect coupled cashflow against the construction roadmap in
              real time.
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <span className="lbp-stamp">
              <span className="dotpair" />
              Approved 2026-05-19
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <Button render={<Link to="/demo/workos" />} size="lg">
                Sign in
                <ArrowUpRight className="size-4" />
              </Button>
              <Button render={<Link to="/demo/timeline" />} size="lg" variant="outline">
                Open detail A-02 ↗
              </Button>
            </div>
            <span className="lbp-detail-ref">
              <span>A</span>
              <span>02</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Shared bits.
 * -------------------------------------------------------------------------- */

function SectionTag({
  refLabel,
  label,
}: {
  refLabel: string;
  label: string;
}) {
  return (
    <div className="lbp-section-tag" data-rv>
      <span className="ref">{refLabel}</span>
      <span className="rule" />
      <span className="ink">{label}</span>
    </div>
  );
}

function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] text-fg-tertiary uppercase tracking-[0.16em]">{k}</dt>
      <dd className="text-fg-primary not-italic" style={{ fontSize: 12 }}>
        {v}
      </dd>
    </div>
  );
}
