// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
  Link: ({
    children,
    hash,
    to,
    ...props
  }: {
    children: ReactNode;
    hash?: string;
    to?: string;
  }) => (
    <a href={`${to ?? ""}${hash ? `#${hash}` : ""}`} {...props}>
      {children}
    </a>
  ),
}));

import { Route } from "./press.tsx";

const PressPage = Route.options.component as ComponentType;

describe("PressPage", () => {
  test("renders the media kit sections with extracted press assets", () => {
    const markup = renderToStaticMarkup(<PressPage />);

    expect(markup).toContain("Media resources, approved.");
    expect(markup).toContain("Company boilerplate");
    expect(markup).toContain("Elie Soberano");
    expect(markup).toContain("Approved files,");
    expect(markup).toContain("Approved company descriptions");
    expect(markup).toContain("Available for commentary on");
    expect(markup).toContain("Press releases");
    expect(markup).toContain("Need Fairlend for a story?");
    expect(markup).toContain("/assets/fairlend-path-gta-sixplex-lane-suite.webp");
    expect(markup).toContain("/assets/fairlend-redesign/press-founder-portrait.webp");
    expect(markup).toContain("/assets/fairlend-redesign/press-kit-collage.webp");
    expect(markup).toContain('href="/press#assets"');
    expect(markup).toContain("press@fairlend.com");
  });

  test("declares press search metadata and preloads above-fold assets", () => {
    const head = Route.options.head();

    expect(head.meta).toEqual(
      expect.arrayContaining([
        {
          title: "Press and Media Kit | Fairlend",
        },
        {
          name: "description",
          content:
            "Official Fairlend media resources including company background, founder bio, approved descriptions, commentary topics, brand assets, and media contact.",
        },
      ]),
    );
    expect(head.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "image",
          href: "/assets/fairlend-path-gta-sixplex-lane-suite.webp",
          rel: "preload",
        }),
        expect.objectContaining({
          as: "image",
          href: "/designConcepts/WarmBlueprintBrutalistModern.png",
          rel: "preload",
        }),
      ]),
    );
  });
});
