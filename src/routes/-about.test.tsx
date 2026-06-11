// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
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

import { Route } from "./about.tsx";

const AboutPage = Route.options.component as ComponentType;

describe("AboutFairlendPage", () => {
  test("renders the about narrative, financing scope, principles, and CTAs", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(markup).toContain("About Fairlend");
    expect(markup).toContain("Canadian Housing Capital");
    expect(markup).toContain("Financing Options");
    expect(markup).toContain("Who We Finance");
    expect(markup).toContain("Our mission is simple");
    expect(markup).toContain("Explore Financing Options");
    expect(markup).toContain('href="/start"');
    expect(markup).toContain("Who We Are");
    expect(markup).toContain("What We Finance");
    expect(markup).toContain("Est. 2023");
    expect(markup).toContain("Toronto, ON");
    expect(markup).toContain("Blueprint-style board listing multiplexes");
    expect(markup).not.toContain(
      "/assets/fairlend-about-extracted/about-reference-full.png",
    );
    expect(markup).toContain("/assets/fairlend-about-extracted/logo-lockup.png");
    expect(markup).toContain("/assets/fairlend-about-extracted/hero-headline.png");
    expect(markup).toContain(
      "/assets/fairlend-about-extracted/hero-construction-plate.png",
    );
    expect(markup).toContain("/assets/fairlend-about-extracted/hero-permit-card.png");
    expect(markup).toContain(
      "/assets/fairlend-about-extracted/hero-underwriting-memo.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-about-extracted/section-finance-blueprint-board.png",
    );
    expect(markup).toContain("The financing gap is where good housing stalls");
    expect(markup).toContain("Small housing projects need capital that behaves like the build");
    expect(markup).toContain("Capital has to arrive in the same rhythm as construction");
    expect(markup).toContain("Our principles");
    expect(markup).toContain("Fairness");
    expect(markup).toContain("Transparency");
    expect(markup).toContain("Responsible underwriting");
    expect(markup).toContain("Investor-borrower alignment");
    expect(markup).toContain("Where technology fits");
    expect(markup).toContain("Where human expertise still matters");
    expect(markup).toContain("Map the financing");
    expect(markup).toContain("path before");
    expect(markup).toContain("the work stalls");
    expect(markup).toContain("The right structure. The right timing. The right capital.");
    expect(markup).toContain("Ready to");
    expect(markup).toContain("talk through");
    expect(markup).toContain("the fit?");
    expect(markup).toContain(
      "Explore the financing path that matches what you are building",
    );
    expect(markup).toContain("Greater Toronto Area");
    expect(markup).toContain("Mortgage strategy");
    expect(markup).toContain("Private lending for");
    expect(markup).toContain("Meet the Founder");
    expect(markup).toContain('href="/leadership/elie-soberano"');
    expect(markup).toContain(
      "/assets/fairlend-about-concepts/capital-a-document-stack.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-about-concepts/capital-c-blueprint-board.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-about-concepts/capital-d-paper-strips.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-about-concepts/next-b-intake-layer.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-about-concepts/next-b-right-blueprint-layer.png",
    );
    expect(markup).toContain(
      "/assets/fairlend-public/editorial-authority-plate.png",
    );
  });

  test("declares search metadata and preloads the above-fold about assets", () => {
    const head = Route.options.head();

    expect(head.meta).toEqual(
      expect.arrayContaining([
        {
          title:
            "About Fairlend | Private lending for better housing outcomes",
        },
        {
          name: "description",
          content:
            "Fairlend combines private capital, practical underwriting, technology-assisted review, and human judgment for GTA housing finance.",
        },
      ]),
    );
    expect(head.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-about-extracted/hero-construction-plate.png",
          rel: "preload",
        }),
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-about-extracted/logo-lockup.png",
          rel: "preload",
        }),
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-about-extracted/hero-headline.png",
          rel: "preload",
        }),
      ]),
    );
  });
});
