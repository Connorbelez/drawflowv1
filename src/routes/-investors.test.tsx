// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
  Link: ({
    children,
    preload: _preload,
    to,
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

import { Route } from "./investors.tsx";

const InvestorsPage = Route.options.component as ComponentType;

const expectedAssets = [
  "/assets/fairlend-investor-page-jun14/hero-multifamily-building-photo.webp",
  "/assets/fairlend-investor-page-jun14/hero-blueprint-board.webp",
  "/assets/fairlend-investor-page-jun14/paths-neighborhood-sketch.webp",
  "/assets/fairlend-investor-page-jun14/private-mortgage-house-linework.webp",
  "/assets/fairlend-investor-page-jun14/build-funding-blueprint-linework.webp",
] as const;

const removedNoisyAssets = [
  "/assets/fairlend-investor-page-jun14/hero-good-homes-note.webp",
  "/assets/fairlend-investor-page-jun14/hero-return-ledger-note.webp",
  "/assets/fairlend-investor-page-jun14/hero-monogram-stamp.webp",
] as const;

describe("Investors route", () => {
  test("renders the June 14 investor page composition with live copy", () => {
    const markup = renderToStaticMarkup(<InvestorsPage />);

    expect(markup).toContain(
      "Real estate-backed investing, managed by Fairlend",
    );
    expect(markup).toContain("Two paths - private mortgage opportunities");
    expect(markup).toContain("Choose your investor path.");
    expect(markup).toContain("Private Mortgage Opportunities");
    expect(markup).toContain("Build Funding Opportunities");
    expect(markup).toContain("Request Investor Information");
    expect(markup).toContain("Explore Marketplace Opportunities");
    expect(markup).toContain("Built for communities.");
    expect(markup).toContain("Made to last.");
    expect(markup).toContain("Better capital.");
    expect(markup).toContain("Better outcomes.");
    expect(markup).toContain("Proudly Canadian");
    expect(markup).toContain("News &amp; Insights");
  });

  test("uses only retained production webp assets for the investor page", () => {
    const markup = renderToStaticMarkup(<InvestorsPage />);

    for (const asset of expectedAssets) {
      expect(markup).toContain(asset);
    }

    for (const asset of removedNoisyAssets) {
      expect(markup).not.toContain(asset);
    }

    expect(markup).not.toContain("artifacts/visual-assets/");
    expect(markup).not.toContain("/crops/");
    expect(markup).not.toContain("/assets/fairlend-investor-overview/");
  });

  test("renders one sticky investor section rail for section state transitions", () => {
    const markup = renderToStaticMarkup(<InvestorsPage />);

    expect(
      markup.match(/class="fairlend-investor-rail fairlend-investor-rail--sticky"/g) ??
        [],
    ).toHaveLength(1);
    expect(markup).toContain('data-investor-section="investor-overview"');
    expect(markup).toContain('data-investor-section="investor-paths"');
  });

  test("renders the interactive DotField layer behind the investor hero", () => {
    const markup = renderToStaticMarkup(<InvestorsPage />);

    expect(markup).toContain("fairlend-investor-hero-dot-field");
    expect(markup).toContain("<canvas");
  });

  test("preloads the above-fold June 14 investor assets", () => {
    const head = Route.options.head();

    expect(head.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "image",
          href: expectedAssets[0],
          rel: "preload",
        }),
        expect.objectContaining({
          as: "image",
          href: expectedAssets[1],
          rel: "preload",
        }),
      ]),
    );
  });
});
