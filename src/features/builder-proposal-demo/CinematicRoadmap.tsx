import { useEffect, useMemo, useRef, useState } from "react";
import type { BuilderProposalMilestone } from "./types";

interface CinematicRoadmapProps {
  milestones: BuilderProposalMilestone[];
  animated?: boolean;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  milestone: BuilderProposalMilestone | null;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function CinematicRoadmap({
  milestones,
  animated = true,
}: CinematicRoadmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    milestone: null,
  });
  const [animationPhase, setAnimationPhase] = useState<"idle" | "grid" | "bars" | "groups" | "done">("idle");

  const included = useMemo(
    () => milestones.filter((m) => m.included),
    [milestones]
  );

  const maxDay = useMemo(() => {
    if (included.length === 0) return 100;
    return Math.max(...included.map((m) => m.dayEnd));
  }, [included]);

  // Compute draw groups: group consecutive milestones
  const drawGroups = useMemo(() => {
    if (included.length === 0) return [];
    const groups: {
      index: number;
      startDay: number;
      endDay: number;
      startRow: number;
      endRow: number;
      milestones: BuilderProposalMilestone[];
    }[] = [];
    const targetGroups = Math.min(3, Math.ceil(included.length / 2));
    const groupSize = Math.max(2, Math.ceil(included.length / targetGroups));

    for (let i = 0; i < included.length; i += groupSize) {
      const groupMilestones = included.slice(i, i + groupSize);
      groups.push({
        index: groups.length,
        startDay: Math.min(...groupMilestones.map((m) => m.dayStart)),
        endDay: Math.max(...groupMilestones.map((m) => m.dayEnd)),
        startRow: i,
        endRow: i + groupMilestones.length - 1,
        milestones: groupMilestones,
      });
    }
    return groups;
  }, [included]);

  // Cinematic animation sequence
  useEffect(() => {
    if (!animated || milestones.length === 0) {
      setAnimationPhase("done");
      return;
    }
    setAnimationPhase("idle");
    const t1 = setTimeout(() => setAnimationPhase("grid"), 100);
    const t2 = setTimeout(() => setAnimationPhase("bars"), 400);
    const t3 = setTimeout(() => setAnimationPhase("groups"), 1200);
    const t4 = setTimeout(() => setAnimationPhase("done"), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [animated, milestones.length]);

  const dayMarkers = useMemo(() => {
    const markers: number[] = [];
    const step = maxDay <= 100 ? 30 : maxDay <= 300 ? 60 : 90;
    for (let d = 0; d <= maxDay; d += step) markers.push(d);
    if (markers[markers.length - 1] !== maxDay) markers.push(maxDay);
    return markers;
  }, [maxDay]);

  const handleBarEnter = (
    milestone: BuilderProposalMilestone,
    e: React.MouseEvent
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      visible: true,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 8,
      milestone,
    });
  };

  const handleBarMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip((prev) => ({
      ...prev,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 8,
    }));
  };

  const handleBarLeave = () =>
    setTooltip((prev) => ({ ...prev, visible: false }));

  const railWidth = 160;
  const headerHeight = 36;
  const rowHeight = 40;
  const timelineLeft = railWidth + 16;

  // Empty state
  if (milestones.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          minHeight: 320,
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "48px 32px",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 16,
            color: "#666",
            padding: 32,
            textAlign: "center",
          }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.25 }}>
            <rect x="4" y="12" width="56" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="4" y="28" width="40" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="4" y="44" width="48" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#888" }}>
              Select a template to see your construction roadmap
            </p>
            <p style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
              Your milestone schedule and draw groups will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        minHeight: 320,
        background: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        position: "relative",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 40px",
          opacity: animationPhase === "idle" ? 0 : 1,
          transition: "opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Header row */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: headerHeight,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#0a0a0a",
          flexShrink: 0,
        }}
      >
        {/* Rail header */}
        <div
          style={{
            width: railWidth,
            flexShrink: 0,
            paddingLeft: 12,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#555",
          }}
        >
          Milestones
        </div>
        {/* Timeline header */}
        <div style={{ position: "relative", flex: 1, height: "100%" }}>
          {dayMarkers.map((day) => (
            <div
              key={day}
              style={{
                position: "absolute",
                left:
                  timelineLeft +
                  (day / maxDay) *
                    (containerRef.current?.clientWidth
                      ? containerRef.current.clientWidth - timelineLeft - 24
                      : 400),
                top: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 10,
                fontWeight: 500,
                color: "#444",
                letterSpacing: "0.04em",
              }}
            >
              Day {day}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {/* Draw group overlays */}
        {drawGroups.map((group) => {
          const top = headerHeight + group.startRow * rowHeight;
          const height = (group.endRow - group.startRow + 1) * rowHeight;
          const phaseDelay = group.index * 0.2;
          const isVisible = animationPhase === "groups" || animationPhase === "done";

          return (
            <div
              key={`group-${group.index}`}
              style={{
                position: "absolute",
                top: top - 2,
                left: timelineLeft - 4,
                right: 12,
                height: height + 4,
                border: "1px dashed rgba(34, 197, 94, 0.4)",
                borderRadius: 6,
                background: "rgba(34, 197, 94, 0.03)",
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "scale(1)" : "scale(0.96)",
                transition: `all 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${phaseDelay}s`,
                pointerEvents: "none",
                zIndex: 5,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -9,
                  left: 8,
                  background: "#0a0a0a",
                  padding: "0 6px",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(34, 197, 94, 0.7)",
                }}
              >
                Draw {group.index + 1}
              </span>
            </div>
          );
        })}

        {/* Milestone rows */}
        {included.map((milestone, index) => {
          const top = headerHeight + index * rowHeight;
          const barDelay = 0.4 + index * 0.08;
          const barVisible = animationPhase === "bars" || animationPhase === "groups" || animationPhase === "done";

          return (
            <div
              key={milestone._id}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                height: rowHeight,
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              {/* Rail: milestone name */}
              <div
                style={{
                  width: railWidth,
                  flexShrink: 0,
                  paddingLeft: 12,
                  paddingRight: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#aaa",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  opacity: barVisible ? 1 : 0,
                  transform: barVisible ? "translateX(0)" : "translateX(-8px)",
                  transition: `all 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${barDelay}s`,
                }}
                title={milestone.name}
              >
                {milestone.name}
              </div>

              {/* Timeline track */}
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: 20,
                  marginRight: 16,
                }}
              >
                {/* Milestone bar */}
                <div
                  onMouseEnter={(e) => handleBarEnter(milestone, e)}
                  onMouseMove={handleBarMove}
                  onMouseLeave={handleBarLeave}
                  style={{
                    position: "absolute",
                    left: `${(milestone.dayStart / maxDay) * 100}%`,
                    width: `${Math.max(
                      2,
                      ((milestone.dayEnd - milestone.dayStart) / maxDay) * 100
                    )}%`,
                    top: 2,
                    height: 16,
                    background:
                      "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)",
                    borderRadius: 4,
                    boxShadow: "0 0 12px rgba(34, 197, 94, 0.25), 0 0 4px rgba(34, 197, 94, 0.4)",
                    cursor: "pointer",
                    opacity: barVisible ? 1 : 0,
                    transform: barVisible ? "scaleX(1)" : "scaleX(0)",
                    transformOrigin: "left center",
                    transition: `all 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${barDelay}s`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.milestone && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            zIndex: 100,
            background: "#111615",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 12,
            color: "#e5e5e5",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            pointerEvents: "none",
            minWidth: 200,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
            {tooltip.milestone.name}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px 16px",
              color: "#888",
              fontSize: 11,
            }}
          >
            <span>Start</span>
            <span style={{ color: "#aaa" }}>Day {tooltip.milestone.dayStart}</span>
            <span>End</span>
            <span style={{ color: "#aaa" }}>Day {tooltip.milestone.dayEnd}</span>
            <span>Budget</span>
            <span style={{ color: "#aaa" }}>
              {formatMoney(tooltip.milestone.budgetCents)}
            </span>
            <span>Duration</span>
            <span style={{ color: "#aaa" }}>
              {tooltip.milestone.durationDays} days
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
