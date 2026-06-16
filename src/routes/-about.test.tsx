// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from "./about.tsx";

const AboutPage = Route.options.component as ComponentType;

const requiredHeroAssets = [
  "/assets/about-webp/webp/hero-house-photo.webp",
  "/assets/about-webp/webp/front-elevation-blueprint.webp",
  "/assets/about-webp/webp/good-homes-note.webp",
  "/assets/about-webp/webp/mortgage-commitment-document-transparent.webp",
  "/assets/about-webp/webp/right-blueprint-draft-visible-strip.webp",
  "/assets/about-webp/webp/side-house-photo.webp",
  "/assets/about-webp/webp/residential-mortgage-file-card-transparent.webp",
  "/assets/about-webp/webp/pipeline-snapshot-note-transparent.webp",
  "/assets/fairlend-investors/generated/investment-opportunity-card.webp",
] as const;

const requiredFinanceAssets = [
  "/assets/about-webp/webp/finance-icon-residential-private-mortgages.webp",
  "/assets/about-webp/webp/finance-icon-mortgage-investments.webp",
  "/assets/about-webp/webp/finance-icon-multiplex-financing.webp",
  "/assets/about-webp/webp/finance-icon-garden-suites.webp",
  "/assets/about-webp/webp/finance-icon-bridge-loans.webp",
  "/assets/about-webp/webp/finance-icon-purpose-built-rentals.webp",
] as const;

const requiredFinanceLinks = [
  "/contact",
  "/construction-draw-financing",
  "/construction-draw-financing",
  "/multiplex-financing-gta",
  "/garden-suite-financing-gta",
  "/affordable-sustainable-rental-housing",
] as const;

const aboutCssPath = fileURLToPath(new URL("./-about.css", import.meta.url));

describe("AboutFairlendPage", () => {
  test("renders the Fairlend about page as DOM and separate assets", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(markup).toContain('aria-label="About Fairlend"');
    expect(markup).toContain('class="about-board"');
    expect(markup).toContain(
      '<span class="about-text-textured">About</span><span class="about-text-textured">Fairlend</span>',
    );
    expect(markup).toContain("Explore our solutions");
    expect(markup).toContain("View investment opportunities");
    expect(markup).toContain("Who We Are");
    expect(markup).toContain("What We Finance");
    expect(markup).toContain("Residential Private");
    expect(markup).not.toContain("fairlend-about-reference");
    expect(markup).not.toContain("hero-collage-reference");
    expect(markup).not.toContain("hero-collage-composite");
    expect(markup).not.toContain('class="about-reference-image"');
  });

  test("renders one sticky about section rail across all about sections", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(
      markup.match(/class="fairlend-investor-rail fairlend-investor-rail--sticky"/g) ??
        [],
    ).toHaveLength(1);
    expect(markup).toContain('data-about-section="about-hero"');
    expect(markup).toContain('data-about-section="about-who"');
    expect(markup).toContain('data-about-section="about-finance"');
  });

  test("uses the supplied about-webp asset set instead of a full-page screenshot", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    for (const asset of requiredHeroAssets) {
      expect(markup).toContain(asset);
    }

    for (const asset of requiredFinanceAssets) {
      expect(markup).toContain(asset);
    }

    expect(markup).toContain("/assets/about-webp/webp/toronto-skyline-sketch.webp");
    expect(markup).not.toContain("/assets/about-webp/extracted/fairlend-stamp.png");
    expect(markup).not.toContain("/assets/about-webp/extracted/finance-icon");
    expect(markup).not.toContain("/assets/about-webp/extracted/expertise-");
    expect(markup).not.toContain("/assets/fairlend-about-extracted/");
    expect(markup).not.toContain("/assets/fairlend-about-concepts/");
  });

  test("keeps the story content as selectable section DOM instead of an art board", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(markup).toContain('class="about-story"');
    expect(markup).toContain('class="about-who-section"');
    expect(markup).toContain('class="about-who-layout"');
    expect(markup).not.toContain('class="about-who"');

    expect(markup.indexOf('class="about-board"')).toBeLessThan(
      markup.indexOf('class="about-story"'),
    );

    const copyStart = markup.indexOf('class="about-who-copy"');
    const copyEnd = markup.indexOf("about-expertise-panel");
    expect(copyStart).toBeGreaterThan(-1);
    expect(copyEnd).toBeGreaterThan(copyStart);
    expect(markup.slice(copyStart, copyEnd)).not.toContain("<br");
  });

  test("keeps page links semantic and navigable", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(markup).toContain('href="/construction-draw-financing"');
    expect(markup).toContain('href="/investors"');

    for (const href of requiredFinanceLinks) {
      expect(markup).toContain(`href="${href}"`);
    }

    expect(markup).toContain("about-finance-card");
    expect(markup).toContain('aria-label="Residential Private Mortgages - learn more"');
  });

  test("declares metadata and preloads above-the-fold assets", () => {
    const head = Route.options.head();

    expect(head.meta).toEqual([
      { title: "About Fairlend" },
      {
        name: "description",
        content:
          "Fairlend is a Canadian brokerage and investment company providing private mortgages, investor opportunities, and construction financing.",
      },
    ]);
    expect(head.links).toEqual(
      requiredHeroAssets.slice(0, 4).concat(requiredHeroAssets.slice(-1)).map((href) => ({
        rel: "preload",
        as: "image",
        href,
      })),
    );
  });

  test("renders the investor opportunity card without cropping the asset", () => {
    const css = readFileSync(aboutCssPath, "utf8");
    const investorCardBlocks = Array.from(
      css.matchAll(/(?:^|\n)\s*\.about-investor-card\s*\{(?<body>[^}]*)\}/g),
      (match) => match.groups?.body ?? "",
    );
    const investorCardImageBlock = css.match(
      /(?:^|\n)\s*\.about-investor-card img\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(investorCardBlocks.length).toBeGreaterThan(0);
    for (const block of investorCardBlocks) {
      const heightValues = Array.from(
        block.matchAll(/\bheight\s*:\s*(?<value>[^;]+);/g),
        (match) => match.groups?.value.trim(),
      );

      expect(heightValues.every((value) => value === "auto")).toBe(true);
    }
    expect(investorCardImageBlock).toContain("height: auto");
    expect(investorCardImageBlock).toContain("object-fit: contain");
    expect(investorCardImageBlock).not.toContain("object-fit: cover");
  });

  test("sizes the operating principles panel as a wide shallow card", () => {
    const css = readFileSync(aboutCssPath, "utf8");
    const expertisePanelBlock = css.match(
      /(?:^|\n)\s*\.about-expertise-panel\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body;
    const expertiseItemBlock = Array.from(
      css.matchAll(/(?:^|\n)\s*\.about-expertise-item\s*\{(?<body>[^}]*)\}/g),
      (match) => match.groups?.body ?? "",
    ).find((block) => block.includes("z-index: 1"));
    const expertiseItemAfterBlock = css.match(
      /(?:^|\n)\s*\.about-expertise-item::after\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(expertisePanelBlock).toContain(
      "width: calc(100% + clamp(56px, 5vw, 88px))",
    );
    expect(expertisePanelBlock).toContain("min-height: clamp(178px, 12vw, 220px)");
    expect(expertisePanelBlock).toContain("justify-self: start");
    expect(expertisePanelBlock).toContain(
      "margin-left: calc(clamp(28px, 2.7vw, 44px) * -1)",
    );
    expect(expertiseItemBlock).toContain(
      "padding: clamp(34px, 2.55vw, 42px) clamp(26px, 2.05vw, 34px) clamp(22px, 1.8vw, 30px)",
    );
    expect(expertiseItemBlock).toContain("gap: clamp(12px, 0.9vw, 16px)");
    expect(expertiseItemAfterBlock).toContain("display: none");
  });

  test("pins the who-section skyline illustration near the viewport bottom", () => {
    const css = readFileSync(aboutCssPath, "utf8");
    const skylineBlock = css.match(
      /(?:^|\n)\s*\.about-skyline\s*\{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(skylineBlock).toContain("top: auto");
    expect(skylineBlock).toContain("bottom: clamp(18px, 2.8vh, 34px)");
    expect(skylineBlock).toContain("height: auto");
    expect(skylineBlock).not.toContain("top: 567px");
  });
});
