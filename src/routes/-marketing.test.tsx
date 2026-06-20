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
    fromTo: vi.fn(),
    scrollTrigger,
    to: vi.fn(),
  };
  timeline.to.mockImplementation(() => timeline);
  timeline.fromTo.mockImplementation(() => timeline);

  return {
    CustomEase: {
      create: vi.fn((_name: string, path: string) => `custom:${path}`),
    },
    ScrollTrigger: {
      refresh: vi.fn(),
    },
    gsap: {
      registerPlugin: vi.fn(),
      set: vi.fn(),
      timeline: vi.fn(() => timeline),
    },
    scrollTrigger,
    timeline,
  };
});

let matchMediaMatches: (query: string) => boolean;

beforeAll(() => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: matchMediaMatches(query),
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
  matchMediaMatches = (query: string) => query === "(min-width: 1024px)";
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

import { Route as HomeRoute } from "./index.tsx";
import { Route } from "./marketing.tsx";

const MarketingPage = Route.options.component as ComponentType;
const HomePage = HomeRoute.options.component as ComponentType;
matchMediaMatches = (query: string) => query === "(min-width: 1024px)";

describe("MarketingPage", () => {
  test("renders the FairLend hero with both reveal assets and primary CTAs", () => {
    const markup = renderToStaticMarkup(<MarketingPage />);

    expect(markup).toContain("FairLend");
    expect(markup).toContain("Private Lending");
    expect(markup).toContain("and Construction");
    expect(markup).toContain("Financing That Works");
    expect(markup).toContain("An Integrated Model");
    expect(markup).toContain("Borrow <br/> Build <br/> Lend <br/> In one place");
    expect(markup).toContain("in lifetime deals by Principal Broker");
    expect(markup).not.toContain("Ontario lending discipline");
    expect(markup).not.toContain(">FSRA</strong>");
    expect(markup).toContain(">Licensed</span>");
    expect(markup.match(/Brokerage Licence #13827/g)).toHaveLength(2);
    expect(markup.match(/Administrator Licence #13828/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="FairLend regulatory licences"');
    expect(markup).toContain(
      'aria-label="FairLend footer regulatory licences"',
    );
    expect(markup).not.toContain("mkt-headline-secondary");
    expect(markup).not.toContain("scroll-reveal-text");
    expect(markup).not.toContain("A lending file that stays legible");
    expect(markup).toContain("Get a private mortgage");
    expect(markup).toContain("Finance a construction project");
    expect(markup).toContain("Explore investor opportunities");
    expect(markup).toContain("mkt-stick-overlap");
    expect(markup).toContain("/assets/CleanShot Jun 8 Hero Section Blueprint.png");
    expect(markup).toContain(
      "/assets/Blueprint Style Rendering Jun 8 2026 (1).png",
    );
    expect(markup).toContain(
      "All financing subject to underwriting, borrower qualification",
    );
    expect(markup).toContain("The Private Lending Market Has a Structural Problem");
    expect(markup).toContain("The result: deals that should work, don&#x27;t");
    expect(markup).toContain("An Integrated Model, Not a Single Product");
    expect(markup).toContain("Technology handles the workflow");
    expect(markup).toContain("From Intake to Administration, an End-to-End Workflow");
    expect(markup).toContain("Intake &amp; Financeability Review");
    expect(markup).toContain("Recovery &amp; Resolution");
    expect(markup).toContain("Built for Borrowers, Builders, and Investors Who Expect More");
    expect(markup).toContain("GTA-specific expertise, not generic national lending");
    expect(markup).toContain("Better Financing Can Make Better Housing Economically Possible");
    expect(markup).toContain("Start a construction financing review");
    expect(markup).toContain("Request investor portal access");
    expect(markup).toContain("Refer a project as a partner");
    expect(markup).toContain("CMHC MLI Select qualification is not guaranteed");
    expect(markup).toContain("Our services");
    expect(markup).not.toContain("Builders &amp; investors.");
    expect(markup).toContain("One fair approach to construction capital");
    expect(markup).toContain("Build financing");
    expect(markup).toContain("Construction draw and bridge financing");
    expect(markup).toContain("The FairLend MIC");
    expect(markup).toContain(
      "Opening to qualified investors soon — learn how it will work.",
    );
    expect(markup).toContain("Start private mortgage request");
    expect(markup).toContain("MIC");
    expect(markup).toContain("Coming Soon");
    expect(markup).toContain("Investor opportunities");
    expect(markup).toContain("Private 1st and 2nds");
    expect(markup).toContain("Fund private first and second mortgages");
    expect(markup).toContain(
      "/assets/fairlend-path-build-financing-multiplex-construction.webp",
    );
    expect(markup).toContain("/assets/fairlend-path-gta-sixplex-lane-suite.webp");
    expect(markup).toContain("/assets/fairlend-path-private-mortgages.webp");
    expect(markup).not.toContain("Three paths. One fair approach.");
    expect(markup).not.toContain("Four paths. One fair approach.");
    expect(markup).toContain("Returns without shortcuts");
    expect(markup).toContain("Elie Soberano");
    expect(markup).toContain("The FairLend team");
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
          end: "+=145%",
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
    expect(gsapMocks.timeline.to).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        opacity: 0.86,
        rotate: -2.8,
        scale: 0.88,
        yPercent: -3,
      }),
      0.62,
    );
    expect(gsapMocks.timeline.fromTo).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        scale: 0.97,
        y: expect.any(Function),
      }),
      expect.objectContaining({
        scale: 1,
        y: 0,
      }),
      0.62,
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("initializes a mobile parallax scene below the desktop breakpoint", () => {
    matchMediaMatches = (query: string) =>
      query === "(prefers-reduced-motion: reduce)" ? false : false;

    render(<MarketingPage />);

    expect(gsapMocks.gsap.timeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollTrigger: expect.objectContaining({
          end: "+=92%",
          scrub: true,
          start: "top top",
        }),
      })
    );
    expect(gsapMocks.timeline.fromTo).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        "--mask-x": "82%",
        "--r1": "29vmax",
        "--r2": "45.5vmax",
      }),
      expect.objectContaining({
        "--mask-x": "112%",
        "--r1": "0vmax",
        "--r2": "4vmax",
        scale: 1.06,
      }),
      0
    );
    expect(gsapMocks.timeline.to).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        ease: "custom:M0,0 C0.74,0 0.18,1 1,1",
        y: expect.any(Function),
      }),
      0.28
    );
    expect(gsapMocks.timeline.to).not.toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        ease: "custom:M0,0 C0.74,0 0.18,1 1,1",
      }),
      0.04
    );
  });
  test("mounts the marketing surface at the root route", () => {
    const markup = renderToStaticMarkup(<HomePage />);

    expect(HomeRoute.options.ssr).toBe(false);
    expect(markup).toContain("Private Lending");
    expect(markup).toContain("Financing That Works");
    const homeHead = HomeRoute.options.head?.({} as never);
    const marketingHead = Route.options.head?.({} as never);
    expect(homeHead).toEqual(marketingHead);
  });

});
