// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode;
    to?: string;
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
    expect(markup).toContain("Returns without shortcuts");
    expect(markup).toContain("Elie Soberano");
    expect(markup).toContain("The Fairlend team");
    expect(markup).toContain("Build your future with us");
    expect(markup).toContain("Proudly Canadian");
  });
});
