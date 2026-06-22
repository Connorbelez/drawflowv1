// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

const gsapMocks = vi.hoisted(() => {
  const scrollTrigger = {
    update: vi.fn(),
  };
  const timeline = {
    scrollTrigger,
    to: vi.fn(),
  };
  timeline.to.mockImplementation(() => timeline);

  return {
    ScrollTrigger: {
      refresh: vi.fn(),
    },
    gsap: {
      registerPlugin: vi.fn(),
      timeline: vi.fn(() => timeline),
    },
    scrollTrigger,
    timeline,
  };
});

beforeAll(() => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));

  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMedia,
    });
  }

  if (typeof window !== "undefined" && !window.requestAnimationFrame) {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    });
  }

  if (typeof window !== "undefined" && !window.cancelAnimationFrame) {
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (handle: number) => window.clearTimeout(handle),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@gsap/react", async () => {
  const React = await import("react");

  return {
    useGSAP: (callback: () => void | (() => void)) =>
      React.useLayoutEffect(() => callback(), [callback]),
  };
});

vi.mock("gsap", () => ({
  default: gsapMocks.gsap,
  gsap: gsapMocks.gsap,
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: gsapMocks.ScrollTrigger,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
  linkOptions: <TOptions,>(options: TOptions) => options,
  Link: ({
    children,
    to,
    preload: _preload,
    viewTransition: _viewTransition,
    ...props
  }: {
    children: ReactNode;
    preload?: string;
    to?: string;
    viewTransition?: boolean;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("#/components/ScrollReveal.jsx", () => ({
  default: ({
    children,
    containerClassName,
  }: {
    children: string;
    containerClassName?: string;
  }) => (
    <div className={containerClassName}>
      <span className="scroll-reveal-text">
        {children.split(" ").map((word) => (
          <span className="word" key={word}>
            {word}
          </span>
        ))}
      </span>
    </div>
  ),
}));

import { Route } from "./marketing.tsx";

const MarketingPage = Route.options.component as ComponentType;

describe("MarketingPage", () => {
  test("renders the Fairlend hero with both reveal assets and primary CTAs", () => {
    const markup = renderToStaticMarkup(<MarketingPage />);

    expect(markup).toContain("Fairlend");
    expect(markup).toContain("Building a fair");
    expect(markup).toContain("future for lending");
    expect(markup).toContain("mkt-headline-secondary");
    expect(markup).toContain("scroll-reveal-text");
    expect(markup).toContain(">And</span>");
    expect(markup).toContain(">thats</span>");
    expect(markup).toContain(">start</span>");
    expect(markup).not.toContain("mkt-headline-tertiary");
    expect(markup).not.toContain(">closing</span>");
    expect(markup).toContain("Explore build financing");
    expect(markup).toContain("See investor platform");
    expect(markup).toContain("/assets/CleanShot Jun 8 Hero Section Blueprint.png");
    expect(markup).toContain(
      "/assets/Blueprint Style Rendering Jun 8 2026 (1).png",
    );
    expect(markup).toContain("Underwriting overview");
    expect(markup).toContain("FSRA Certified");
    expect(markup).toContain("TFSA");
    expect(markup).toContain("RRSP");
    expect(markup).toContain("RESP");
    expect(markup).toContain("Three paths. One fair approach.");
    expect(markup).toContain("Build financing");
    expect(markup).toContain("Invest with our MIC");
    expect(markup).toContain("/assets/fairlend-path-gta-sixplex-lane-suite.webp");
    expect(markup).toContain("/assets/fairlend-path-mic-investing.webp");
    expect(markup).toContain("/assets/fairlend-path-private-mortgages.webp");
    expect(markup).toContain("Returns without shortcuts");
    expect(markup).toContain("Elie Soberano");
    expect(markup).toContain("The Fairlend team");
    expect(markup).toContain("Build your future with us");
    expect(markup).toContain("Proudly Canadian");
  });

  test("initializes the GSAP scene without resetting an in-progress scroll", () => {
    const scrollTo = vi.fn();

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    render(<MarketingPage />);

    expect(gsapMocks.gsap.timeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollTrigger: expect.objectContaining({
          pin: expect.any(HTMLDivElement),
          scrub: true,
          start: "top top",
        }),
      }),
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
