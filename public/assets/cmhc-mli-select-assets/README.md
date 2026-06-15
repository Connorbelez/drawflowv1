# CMHC MLI Select Multiplex Financing Assets

Production asset package for `/cmhc-mli-select-multiplex-financing`.

Brand kit selected: `public/designConcepts/CapitalAndClimate.png`.

## What Is In This Package

- `images/`: 12 optimized transparent WebP section subject assets, plus one derived optimized hero scene panel.
- `patterns/`: two reusable transparent WebP texture/pattern assets.
- `contact-sheet.png`: checkerboard visual review sheet for alpha edges and section mapping.
- `qa-multi-background-sheet.png`: visual QA sheet compositing every asset over warm paper, deep green, and climate blue backgrounds.
- `manifest.json`: implementation contract and asset map.
- `asset-validation.json`: machine-readable validation output from the processing pipeline.

## Non-Negotiable Implementation Rule

Do not rasterize UI or content. These assets are decorative/editorial visual subjects only.

Render these in code:

- tables
- checklists
- FAQ accordions
- CTA buttons
- badges
- icons
- warning rows
- disclaimer/legal copy
- rent, income, affordability, approval, eligibility, or funding data

## Pipeline Used

1. Generated each usable asset as a standalone subject on a flat `#ff00ff` chroma-key background.
2. Rejected sources that were page screenshots, clipped crops, table/UI concepts, or white-background outputs.
3. Removed chroma key with the ImageGen helper using auto-key border sampling, soft matte, and despill.
4. Trimmed transparent bounds with padding.
5. Converted final assets to transparent WebP at quality 90, method 6.
6. Validated alpha channel, transparent corners, non-empty subject bounds, and plausible subject coverage.
7. Scanned final WebPs for magenta and near-magenta key residue. Result: zero opaque pixels across all 12 section assets.
8. Generated `contact-sheet.png` over a checkerboard background for alpha QA.
9. Generated `qa-multi-background-sheet.png` over warm paper, deep green, and climate blue backgrounds for edge QA.
10. Kept only deployable optimized assets in `public/`; chroma-key sources and PNG intermediates are intentionally excluded from the public static package.

## Section Map

| Section | Asset |
|---|---|
| `mli.hero` | `images/hero-multiplex-building.webp` |
| `mli.hero.support` | `images/hero-multiplex-street-panel.webp` |
| `mli.what-it-is` | `images/mli-framework-document-stack.webp` |
| `mli.why-matters` | `images/rental-construction-capital-planning.webp` |
| `mli.pillars` | `images/affordability-accessibility-energy-pillars.webp` |
| `mli.project-fit` | `images/multiplex-rental-project-cluster.webp` |
| `mli.how-fairlend-helps` | `images/advisor-review-desk.webp` |
| `mli.no-guarantee` | `images/compliance-caution-folder.webp` |
| `mli.qualification-gaps` | `images/readiness-gap-dossier.webp` |
| `mli.documents-needed` | `images/project-file-folder.webp` |
| `mli.readiness-tool` | `images/readiness-review-kit.webp` |
| `mli.faq` | `images/faq-next-steps-cards.webp` |
| `mli.final-cta` | `images/final-cta-planning-desk.webp` |
