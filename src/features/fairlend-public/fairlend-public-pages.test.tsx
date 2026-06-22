// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  articlePages,
  corePages,
  FairlendArticlePage,
  FairlendIntakePage,
  FairlendPublicPage,
  intakePages,
} from "./fairlend-public-pages.tsx";

describe("Fairlend public pages", () => {
  test("assigns one unique brand kit to each core public sitemap page", () => {
    const pages = Object.values(corePages);
    const uniqueBrandKits = new Set(pages.map((page) => page.brandKit));

    expect(pages).toHaveLength(12);
    expect(uniqueBrandKits.size).toBe(12);
  });

  test("renders the Fairlend homepage with authority CTAs and generated editorial asset", () => {
    const markup = renderToStaticMarkup(<FairlendPublicPage pageId="home" />);

    expect(markup).toContain("Financing the GTA");
    expect(markup).toContain("Start a Project Review");
    expect(markup).toContain("Request Investor Information");
    expect(markup).toContain("/assets/fairlend-public/editorial-authority-plate.png");
    expect(markup).toContain("/designConcepts/warmBlueprint.png");
  });

  test("keeps CMHC and investor pages careful about guarantees and compliance", () => {
    const mliMarkup = renderToStaticMarkup(<FairlendPublicPage pageId="mliSelect" />);
    const investorMarkup = renderToStaticMarkup(<FairlendPublicPage pageId="investors" />);

    expect(mliMarkup).toContain("does not guarantee CMHC qualification");
    expect(mliMarkup).toContain("readiness-focused");
    expect(investorMarkup).toContain("not an offer to sell securities");
    expect(investorMarkup).toContain("legal and compliance review");
  });

  test("ships all intake screens and initial resource articles from the manifest", () => {
    expect(Object.values(intakePages)).toHaveLength(7);
    expect(Object.values(articlePages)).toHaveLength(7);

    const intakeMarkup = renderToStaticMarkup(<FairlendIntakePage pageId="startMultiplex" />);
    const articleMarkup = renderToStaticMarkup(<FairlendArticlePage pageId="constructionDraws" />);

    expect(intakeMarkup).toContain("Property address");
    expect(intakeMarkup).toContain("Upload drawings, pro forma, or budget");
    expect(articleMarkup).toContain("Small builders feel draw timing");
    expect(articleMarkup).toContain("Plan My Draw Schedule");
  });
});
