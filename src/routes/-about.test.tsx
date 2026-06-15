// @vitest-environment jsdom

import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from "./about.tsx";

const AboutPage = Route.options.component as ComponentType;

const requiredAboutAssets = [
  "/assets/about-webp/webp/hero-house-photo.webp",
  "/assets/about-webp/webp/front-elevation-blueprint.webp",
  "/assets/about-webp/webp/good-homes-note.webp",
  "/assets/about-webp/webp/mortgage-commitment-document-transparent.webp",
  "/assets/about-webp/webp/residential-mortgage-file-card-transparent.webp",
  "/assets/about-webp/webp/pipeline-snapshot-note-transparent.webp",
  "/assets/about-webp/webp/side-house-photo.webp",
] as const;

describe("AboutFairlendPage", () => {
  test("renders the Fairlend about hero structure", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    expect(markup).toContain('aria-label="About Fairlend"');
    expect(markup).toContain('class="about-hero"');
    expect(markup).toContain("Fairlend");
    expect(markup).toContain("Brokerage &amp;<br/>Investment<br/>Company");
    expect(markup).toContain("About Fairlend");
    expect(markup).toContain("<span>About</span><span>Fairlend</span>");
    expect(markup).toContain("Explore our solutions");
    expect(markup).toContain("Investor Opportunity");
    expect(markup).toContain("7.85%");
    expect(markup).toContain("Better Capital");
    expect(markup).toContain("Better Outcomes");
  });

  test("uses supplied about-webp assets for the visible collage", () => {
    const markup = renderToStaticMarkup(<AboutPage />);

    for (const asset of requiredAboutAssets) {
      expect(markup).toContain(asset);
    }

    expect(markup).toContain(
      "/assets/about-webp/webp/right-blueprint-draft-visible-strip.webp",
    );
    expect(markup).not.toContain(
      "/assets/about-webp/webp/mortgage-commitment-document.webp",
    );
    expect(markup).not.toContain(
      "/assets/about-webp/webp/residential-mortgage-file-card.webp",
    );
    expect(markup).not.toContain(
      "/assets/about-webp/webp/pipeline-snapshot-note.webp",
    );
    expect(markup).not.toContain("/assets/fairlend-about-extracted/");
    expect(markup).not.toContain("/assets/fairlend-about-concepts/");
  });

  test("declares metadata and above-the-fold asset preloads", () => {
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
      requiredAboutAssets.map((href) => ({
        rel: "preload",
        as: "image",
        href,
      })),
    );
  });
});
