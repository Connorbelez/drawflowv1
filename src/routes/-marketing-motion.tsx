import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type * as React from "react";
import { useEffect, useState } from "react";

export const gridColumnIds = [
  "col-01",
  "col-02",
  "col-03",
  "col-04",
  "col-05",
  "col-06",
  "col-07",
  "col-08",
  "col-09",
  "col-10",
  "col-11",
  "col-12",
];

const baselineRows = Array.from(
  { length: 80 },
  (_, index) => `base-${index + 1}`
);

export function GridOverlay(): React.ReactElement {
  return (
    <div aria-hidden className="mkt-grid-overlay">
      <div className="mkt-grid-wrap">
        <div className="mkt-grid-guides">
          {gridColumnIds.map((id, index) => (
            <div className="mkt-grid-col" key={id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        <div className="mkt-grid-baseline">
          {baselineRows.map((id) => (
            <div key={id} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function useGridOverlay(
  rootRef: React.RefObject<HTMLElement | null>
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [gridOn, setGridOn] = useState(false);

  useEffect(() => {
    rootRef.current?.classList.toggle("mkt-grid-on", gridOn);
  }, [gridOn, rootRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "g" || event.key === "G") {
        setGridOn((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useOpticalAlignment(rootRef);

  return [gridOn, setGridOn];
}

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function useOpticalAlignment(
  rootRef: React.RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof document === "undefined") {
      return;
    }

    const alignInk = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) {
        return;
      }

      const displayHeadlines = root.querySelectorAll(
        ".mkt-headline, .mkt-gap-copy h2, .mkt-answer-copy h2, .mkt-model-header h2, .mkt-why-header h2, .mkt-final-copy h2, .mkt-authority-panel h2"
      );
      for (const el of displayHeadlines) {
        const htmlEl = el as HTMLElement;
        htmlEl.style.marginLeft = "0px";
        const ch = (htmlEl.textContent || "").trim()[0];
        if (!ch) {
          continue;
        }
        const style = getComputedStyle(htmlEl);
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.textAlign = "left";
        const metrics = ctx.measureText(ch);
        const abl = (metrics as unknown as { actualBoundingBoxLeft?: number })
          .actualBoundingBoxLeft;
        if (abl && Number.isFinite(abl)) {
          htmlEl.style.marginLeft = `${abl.toFixed(2)}px`;
        }
      }
    };

    const fontReady = document.fonts?.ready;
    if (fontReady) {
      fontReady.then(alignInk);
    } else {
      alignInk();
    }
    const debouncedAlignInk = debounce(alignInk, 150);
    window.addEventListener("resize", debouncedAlignInk);
    return () => window.removeEventListener("resize", debouncedAlignInk);
  }, [rootRef]);
}

export function useMarketingScrollScene({
  contentRef,
  heroScrollRef,
  pinRef,
  proofOverlapRef,
  renderRef,
  rootRef,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  heroScrollRef: React.RefObject<HTMLElement | null>;
  pinRef: React.RefObject<HTMLDivElement | null>;
  proofOverlapRef: React.RefObject<HTMLDivElement | null>;
  renderRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  useGSAP(
    () => {
      const section = heroScrollRef.current;
      const pinEl = pinRef.current;
      const proofOverlapEl = proofOverlapRef.current;
      const renderEl = renderRef.current;
      const contentEl = contentRef.current;
      const leftStack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-stack");
      const leftTrack =
        contentEl?.querySelector<HTMLElement>(".mkt-left-track");

      if (
        !(
          section &&
          pinEl &&
          proofOverlapEl &&
          renderEl &&
          contentEl &&
          leftStack &&
          leftTrack
        )
      ) {
        return;
      }

      const progressEl = pinEl.querySelector<HTMLElement>(".mkt-hero-progress");
      if (!progressEl) {
        return;
      }

      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const desktopMedia = window.matchMedia("(min-width: 1024px)");

      if (media.matches) {
        renderEl.classList.add("mkt-render-reduced");
        leftStack.classList.add("mkt-left-stack-reduced");
        proofOverlapEl.classList.add("mkt-stick-overlap-reduced");
        return () => {
          renderEl.classList.remove("mkt-render-reduced");
          leftStack.classList.remove("mkt-left-stack-reduced");
          proofOverlapEl.classList.remove("mkt-stick-overlap-reduced");
        };
      }

      gsap.registerPlugin(CustomEase, ScrollTrigger);
      const panelGateEase = CustomEase.create(
        "fairlendPanelGate",
        "M0,0 C0.74,0 0.18,1 1,1"
      );

      if (!desktopMedia.matches) {
        const blueprintEl = section.querySelector<HTMLElement>(
          ".mkt-hero-blueprint"
        );

        gsap.set([pinEl, blueprintEl, renderEl, proofOverlapEl, leftTrack], {
          force3D: true,
          transformOrigin: "50% 50%",
        });

        const timeline = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            end: "+=92%",
            invalidateOnRefresh: true,
            scrub: true,
            start: "top top",
            trigger: section,
          },
        });

        const heroScrollTrigger = timeline.scrollTrigger;

        timeline
          .fromTo(
            blueprintEl,
            { scale: 1.03, yPercent: 2 },
            { duration: 1, scale: 1.1, yPercent: -4 },
            0
          )
          .fromTo(
            renderEl,
            {
              "--mask-x": "82%",
              "--mask-y": "52%",
              "--r1": "29vmax",
              "--r2": "45.5vmax",
              "--r3": "19.5vmax",
              "--r4": "35vmax",
              "--r5": "21.5vmax",
              "--r6": "38vmax",
              "--r7": "19.5vmax",
              "--r8": "34vmax",
              scale: 1,
              yPercent: 0,
            },
            {
              "--mask-x": "112%",
              "--mask-y": "-8%",
              "--r1": "0vmax",
              "--r2": "4vmax",
              "--r3": "0vmax",
              "--r4": "3vmax",
              "--r5": "0vmax",
              "--r6": "2.5vmax",
              "--r7": "0vmax",
              "--r8": "2vmax",
              duration: 1,
              scale: 1.06,
              yPercent: -4,
            },
            0
          )
          .to(
            leftTrack,
            {
              duration: 0.5,
              ease: panelGateEase,
              y: () => -leftStack.clientHeight,
            },
            0.28
          )
          .to(
            contentEl,
            {
              duration: 0.72,
              opacity: 0.9,
              yPercent: -3.5,
            },
            0
          )
          .to(
            pinEl,
            {
              duration: 0.28,
              opacity: 0.88,
              rotate: -1.8,
              scale: 0.9,
              yPercent: -2,
            },
            0.72
          )
          .fromTo(
            proofOverlapEl,
            {
              scale: 0.98,
              y: () => window.innerHeight * 0.12,
            },
            {
              duration: 0.28,
              scale: 1,
              y: 0,
            },
            0.72
          )
          .fromTo(
            progressEl,
            { scaleX: 0, transformOrigin: "0% 50%" },
            { duration: 1, scaleX: 1 },
            0
          );

        const refreshFrame = requestAnimationFrame(() => {
          ScrollTrigger.refresh();
          heroScrollTrigger?.update();
        });

        return () => {
          cancelAnimationFrame(refreshFrame);
        };
      }

      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          anticipatePin: 1,
          end: "+=145%",
          invalidateOnRefresh: true,
          pin: pinEl,
          scrub: true,
          start: "top top",
          trigger: section,
        },
      });

      const heroScrollTrigger = timeline.scrollTrigger;

      gsap.set([pinEl, proofOverlapEl], {
        force3D: true,
        transformOrigin: "50% 50%",
      });

      timeline
        .to(
          renderEl,
          {
            duration: 0.62,
            "--mask-x": "112%",
            "--mask-y": "-8%",
            "--r1": "0vmax",
            "--r2": "4vmax",
            "--r3": "0vmax",
            "--r4": "3vmax",
            "--r5": "0vmax",
            "--r6": "2.5vmax",
            "--r7": "0vmax",
            "--r8": "2vmax",
          },
          0
        )
        .to(
          leftTrack,
          {
            duration: 0.36,
            ease: panelGateEase,
            y: () => -leftStack.clientHeight,
          },
          0.04
        )
        .to(
          contentEl,
          {
            duration: 0.34,
            opacity: 0.78,
            yPercent: -3,
          },
          0.62
        )
        .to(
          pinEl,
          {
            duration: 0.38,
            opacity: 0.86,
            rotate: -2.8,
            scale: 0.88,
            yPercent: -3,
          },
          0.62
        )
        .fromTo(
          proofOverlapEl,
          {
            scale: 0.97,
            y: () => window.innerHeight * 0.16,
          },
          {
            duration: 0.38,
            scale: 1,
            y: 0,
          },
          0.62
        )
        .fromTo(
          progressEl,
          { scaleX: 0, transformOrigin: "0% 50%" },
          { duration: 1, scaleX: 1 },
          0
        );

      let active = true;
      const refreshScene = () => {
        if (!active) {
          return;
        }

        ScrollTrigger.refresh();
        heroScrollTrigger?.update();
      };

      const refreshFrame = requestAnimationFrame(refreshScene);

      Promise.all([
        ...Array.from(section.querySelectorAll("img"), (image) =>
          image.complete
            ? Promise.resolve()
            : image.decode?.().catch(() => undefined)
        ),
        document.fonts?.ready ?? Promise.resolve(),
      ]).then(refreshScene);

      return () => {
        active = false;
        cancelAnimationFrame(refreshFrame);
      };
    },
    { dependencies: [], scope: rootRef }
  );
}

export function useLeadershipDealDeskScene(
  rootRef: React.RefObject<HTMLElement | null>
) {
  useGSAP(
    () => {
      const root = rootRef.current;
      const section = root?.querySelector<HTMLElement>(
        "[data-leadership-desk]"
      );

      if (!(root && section)) {
        return;
      }

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      );
      if (reducedMotion.matches) {
        section.classList.add("mkt-leadership-motion-complete");
        return () => {
          section.classList.remove("mkt-leadership-motion-complete");
        };
      }

      gsap.registerPlugin(CustomEase, ScrollTrigger);

      const dealDeskEase = CustomEase.create(
        "fairlendDealDesk",
        "M0,0 C0.16,0.88 0.22,1 1,1"
      );
      const frameRules = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-rule")
      );
      const headerItems = Array.from(
        section.querySelectorAll<HTMLElement>(
          ".mkt-leadership-head [data-leadership-reveal]"
        )
      );
      const titleLines = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-title-line")
      );
      const capabilityCards = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-capability")
      );
      const statRows = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-stat")
      );
      const trustItems = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-trust-item")
      );
      const artImage = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-image"
      );
      const artPlate = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-plate"
      );
      const artGrid = section.querySelector<HTMLElement>(
        ".mkt-leadership-art-grid"
      );
      const routeLine = section.querySelector<SVGPathElement>(
        ".mkt-leadership-route-line"
      );
      const routeNodes = Array.from(
        section.querySelectorAll<HTMLElement>(".mkt-leadership-route-node")
      );
      const approvalChip = section.querySelector<HTMLElement>(
        ".mkt-leadership-approval-chip"
      );
      const mapPin = section.querySelector<HTMLElement>(
        ".mkt-leadership-map-pin"
      );
      const quote = section.querySelector<HTMLElement>(".mkt-leadership-quote");
      const quoteMark = section.querySelector<HTMLElement>(
        ".mkt-leadership-quote-mark"
      );
      const action = section.querySelector<HTMLElement>(
        ".mkt-leadership-action"
      );
      const countNodes = Array.from(
        section.querySelectorAll<HTMLElement>(
          ".mkt-leadership-count[data-count-to]"
        )
      );

      for (const count of countNodes) {
        const prefix = count.dataset.countPrefix ?? "";
        const suffix = count.dataset.countSuffix ?? "";
        count.textContent = `${prefix}0${suffix}`;
      }

      gsap.set(
        [
          section,
          artPlate,
          artImage,
          artGrid,
          approvalChip,
          mapPin,
          quote,
          action,
          ...capabilityCards,
          ...statRows,
          ...trustItems,
        ].filter(Boolean),
        {
          force3D: true,
          transformOrigin: "50% 50%",
        }
      );

      const entranceTimeline = gsap.timeline({
        defaults: { ease: dealDeskEase },
        scrollTrigger: {
          end: "bottom 38%",
          once: false,
          start: "top 72%",
          toggleActions: "play none none reverse",
          trigger: section,
        },
      });

      entranceTimeline
        .fromTo(
          section,
          { "--leadership-paper-wash": 0.2 },
          { "--leadership-paper-wash": 1, duration: 0.7 },
          0
        )
        .fromTo(
          frameRules,
          { scaleX: 0, scaleY: 0 },
          {
            duration: 0.52,
            scaleX: 1,
            scaleY: 1,
            stagger: 0.035,
          },
          0
        )
        .fromTo(
          headerItems,
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            duration: 0.42,
            stagger: 0.055,
            y: 0,
          },
          0.09
        )
        .fromTo(
          titleLines,
          { autoAlpha: 0, clipPath: "inset(0 0 100% 0)", yPercent: 74 },
          {
            autoAlpha: 1,
            clipPath: "inset(0 0% 0% 0)",
            duration: 0.64,
            stagger: 0.08,
            yPercent: 0,
          },
          0.22
        )
        .fromTo(
          artPlate,
          {
            autoAlpha: 0,
            clipPath: "inset(14% 18% 18% 10%)",
            rotateX: 7,
            scale: 0.94,
            y: 34,
          },
          {
            autoAlpha: 1,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.72,
            rotateX: 0,
            scale: 1,
            y: 0,
          },
          0.26
        )
        .fromTo(
          artImage,
          { filter: "saturate(0.55) contrast(1.05)", scale: 1.08 },
          {
            duration: 0.8,
            filter: "saturate(0.98) contrast(1.03)",
            scale: 1,
          },
          0.34
        )
        .fromTo(
          artGrid,
          { autoAlpha: 0, xPercent: -10 },
          {
            autoAlpha: 1,
            duration: 0.54,
            xPercent: 0,
          },
          0.42
        )
        .fromTo(
          routeLine ? [routeLine] : [],
          { strokeDashoffset: 680 },
          {
            duration: 0.76,
            ease: "power2.inOut",
            strokeDashoffset: 0,
          },
          0.58
        )
        .fromTo(
          routeNodes,
          { autoAlpha: 0, scale: 0.35 },
          {
            autoAlpha: 1,
            duration: 0.28,
            scale: 1,
            stagger: 0.07,
          },
          0.72
        )
        .fromTo(
          [approvalChip, mapPin].filter(Boolean),
          { autoAlpha: 0, rotate: -8, scale: 0.74, y: 28 },
          {
            autoAlpha: 1,
            duration: 0.42,
            rotate: 0,
            scale: 1,
            stagger: 0.1,
            y: 0,
          },
          0.86
        )
        .fromTo(
          capabilityCards,
          { autoAlpha: 0, scale: 0.96, y: 22 },
          {
            autoAlpha: 1,
            duration: 0.42,
            scale: 1,
            stagger: 0.06,
            y: 0,
          },
          0.68
        )
        .fromTo(
          statRows,
          { autoAlpha: 0, x: 42 },
          {
            autoAlpha: 1,
            duration: 0.48,
            stagger: 0.08,
            x: 0,
          },
          0.78
        );

      countNodes.forEach((count, index) => {
        const target = Number(count.dataset.countTo);
        if (!Number.isFinite(target)) {
          return;
        }

        const state = { value: 0 };
        const prefix = count.dataset.countPrefix ?? "";
        const suffix = count.dataset.countSuffix ?? "";
        const finalValue =
          count.dataset.countFinal ?? `${prefix}${target}${suffix}`;

        entranceTimeline.to(
          state,
          {
            duration: 0.54,
            ease: "power2.out",
            onComplete: () => {
              count.textContent = finalValue;
            },
            onUpdate: () => {
              count.textContent = `${prefix}${Math.round(state.value)}${suffix}`;
            },
            snap: { value: 1 },
            value: target,
          },
          0.9 + index * 0.08
        );
      });

      entranceTimeline
        .fromTo(
          quoteMark,
          { autoAlpha: 0, scale: 0.5, x: -12 },
          { autoAlpha: 1, duration: 0.28, scale: 1, x: 0 },
          1.08
        )
        .fromTo(
          quote,
          { autoAlpha: 0, clipPath: "inset(0 100% 0 0)" },
          {
            autoAlpha: 1,
            clipPath: "inset(0 0% 0 0)",
            duration: 0.54,
          },
          1.14
        )
        .fromTo(
          trustItems,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            duration: 0.34,
            stagger: 0.06,
            y: 0,
          },
          1.22
        )
        .fromTo(
          action,
          { autoAlpha: 0, scale: 0.92, x: -12 },
          { autoAlpha: 1, duration: 0.34, scale: 1, x: 0 },
          1.25
        );

      const parallaxTimeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          end: "bottom top",
          scrub: true,
          start: "top bottom",
          trigger: section,
        },
      });

      parallaxTimeline
        .to(artImage, { duration: 1, scale: 1.035, yPercent: -3.2 }, 0)
        .to(artGrid, { duration: 1, xPercent: 6 }, 0)
        .to(statRows, { duration: 1, yPercent: -4 }, 0)
        .to(capabilityCards, { duration: 1, yPercent: 2 }, 0);

      return () => {
        section.classList.remove("mkt-leadership-motion-complete");
        for (const count of countNodes) {
          count.textContent = count.dataset.countFinal ?? count.textContent;
        }
      };
    },
    { dependencies: [], scope: rootRef }
  );
}
