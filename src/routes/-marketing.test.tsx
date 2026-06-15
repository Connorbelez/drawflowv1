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
    CustomEase: {
      create: vi.fn((_name: string, path: string) => `custom:${path}`),
    },
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
    matches: query === "(min-width: 1024px)",
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

vi.mock("gsap/CustomEase", () => ({
  CustomEase: gsapMocks.CustomEase,
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

import { Route } from "./marketing.tsx";

const MarketingPage = Route.options.component as ComponentType;

describe("MarketingPage", () => {
  test("renders the Fairlend hero with both reveal assets and primary CTAs", () => {
    const markup = renderToStaticMarkup(<MarketingPage />);

    expect(markup).toContain("Fairlend");
    expect(markup).toContain("Building a fair");
    expect(markup).toContain("future for lending");
    expect(markup).toContain("End to End Ecosystem");
    expect(markup).toContain("Borrow <br/> Build <br/> Lend <br/> In one place");
    expect(markup).toContain("funded deal experience");
    expect(markup).toContain("Ontario lending discipline");
    expect(markup).not.toContain("mkt-headline-secondary");
    expect(markup).not.toContain("scroll-reveal-text");
    expect(markup).not.toContain("A lending file that stays legible");
    expect(markup).toContain("Explore build financing");
    expect(markup).toContain("See investor platform");
    expect(markup).toContain("/assets/CleanShot Jun 8 Hero Section Blueprint.png");
    expect(markup).toContain(
      "/assets/Blueprint Style Rendering Jun 8 2026 (1).png",
    );
    expect(markup).toContain("Builders &amp; investors.");
    expect(markup).toContain("One fair approach to construction capital");
    expect(markup).toContain("Build financing");
    expect(markup).toContain("Construction draw and bridge financing");
    expect(markup).toContain("Multiplex lending &amp; investing");
    expect(markup).toContain("Lend into Canadian multiplex builds");
    expect(markup).toContain("Invest with our MIC");
    expect(markup).toContain("Private 1st and 2nds");
    expect(markup).toContain("Fund private first and second mortgages");
    expect(markup).toContain(
      "/assets/fairlend-path-build-financing-multiplex-construction.webp",
    );
    expect(markup).toContain("/assets/fairlend-path-gta-sixplex-lane-suite.webp");
    expect(markup).toContain("/assets/fairlend-path-mic-investing.webp");
    expect(markup).toContain("/assets/fairlend-path-private-mortgages.webp");
    expect(markup).not.toContain("Three paths. One fair approach.");
    expect(markup).not.toContain("Four paths. One fair approach.");
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
    expect(gsapMocks.CustomEase.create).toHaveBeenCalledWith(
      "fairlendPanelGate",
      "M0,0 C0.74,0 0.18,1 1,1",
    );
    expect(gsapMocks.timeline.to).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        ease: "custom:M0,0 C0.74,0 0.18,1 1,1",
        y: expect.any(Function),
      }),
      0.04,
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
