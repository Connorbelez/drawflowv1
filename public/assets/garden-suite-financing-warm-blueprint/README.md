# Garden Suite Financing Warm Blueprint Assets

Generated from `public/designConcepts/garden-suite-financing-warm-blueprint/*.png` by `scripts/extract-garden-suite-financing-assets.py`.

This directory contains `161` extracted lossless WebP assets, `23` generated transparent WebP material overlays, and `3` SVG drafting primitives for rebuilding the Garden Suite / Laneway Suite Financing landing page from the warm-blueprint mockups.

## Extraction Rules

- Crops are saved as lossless WebP with alpha support.
- Photos, file stacks, cards, comparison columns, form panels, and document boards keep their internal paper/photo composition while the surrounding page paper is keyed away where practical.
- Logos, botanical marks, stamps, sketch fragments, blueprint lines, white site-plan overlays, footer marks, and connector lines are alpha-processed for layering.
- Generated overlays cover repeatable materials visible throughout the concepts: transparent paper grain, linen fibers, blueprint grids, process connectors, and copper action rules.
- Large section headings, paragraph copy, navigation text, buttons, form labels, and FAQ text should generally be rendered as live HTML typography. Some text-bearing card composites are exported because their layout, shadows, icons, and paper treatment are part of the graphic asset.

## Verification

- `manifest.json` maps every source section to the generated assets and records crop boxes.
- `webp-contact-sheet.png` is the visual QA sheet for all WebP outputs.
- `184` WebP files contain transparent pixels.
