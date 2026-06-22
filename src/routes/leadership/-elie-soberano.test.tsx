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
    children?: ReactNode;
    preload?: string;
    to?: string;
    viewTransition?: boolean;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { Route } from "./elie-soberano.tsx";

const LeadershipPage = Route.options.component as ComponentType;

describe("LeadershipElieSoberanoPage", () => {
  test("renders all eight generated section references with semantic founder copy", () => {
    const markup = renderToStaticMarkup(<LeadershipPage />);

    expect(markup).toContain("Elie Soberano, Founder of Fairlend");
    expect(markup).toContain("Founder, Fairlend");
    expect(markup).toContain("Short bio");
    expect(markup).toContain("Long bio");
    expect(markup).toContain("Founder thesis");
    expect(markup).toContain("Areas of expertise");
    expect(markup).toContain("Approved credentials and claims");
    expect(markup).toContain("Founder quotes");
    expect(markup).toContain("Request an interview");

    for (const section of [
      "section-01-hero-profile-header.png",
      "section-02-short-bio.png",
      "section-03-long-bio.png",
      "section-04-founder-thesis.png",
      "section-05-areas-of-expertise.png",
      "section-06-approved-credentials.png",
      "section-07-founder-quotes.png",
      "section-08-media-contact-cta.png",
    ]) {
      expect(markup).toContain(
        `/assets/fairlend-leadership-elie/concept-sections/${section}`,
      );
    }

    expect(markup).toContain('aria-label="Request an interview with Fairlend"');
    expect(markup).toContain('aria-label="Contact Fairlend media team"');
    expect(markup).toContain('href="/contact"');
  });

  test("declares metadata and preloads key above-fold artboards", () => {
    const head = Route.options.head();

    expect(head.meta).toEqual(
      expect.arrayContaining([
        {
          title: "Elie Soberano | Founder, Fairlend",
        },
        {
          name: "description",
          content:
            "Media-ready founder profile for Elie Soberano, Founder of Fairlend, including approved biography, housing-finance thesis, expertise areas, quotes, and interview contact path.",
        },
      ]),
    );
    expect(head.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-leadership-elie/concept-sections/section-01-hero-profile-header.png",
          rel: "preload",
        }),
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-leadership-elie/concept-sections/section-02-short-bio.png",
          rel: "preload",
        }),
      ]),
    );
  });
});
