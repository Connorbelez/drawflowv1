# Investor Production Assets

This is the production asset pack for the investor landing page concepts.

The section mockups in `public/designConcepts/investors` are visual references only. This directory does **not** contain cropped section mockup fragments. Bitmap assets are standalone generated source images processed through alpha cleanup, trimming, and optimized transparent WebP output. Anything that can be authored as semantic UI is intentionally left for code.

## Contents

- `11` bitmap WebP assets in `bitmap/`
- `10` verified transparent WebP assets
- `7` SVG primitives in `vector/`
- `manifest.json` with source, pipeline, section coverage, and code-native exclusions
- `bitmap-contact-sheet.png` for visual QA

## Code-Native Boundary

Do not rasterize live copy, forms, tables, disclosure panels, checklist grids, borders, icons, stamps, or simple blueprints. Build those with React, CSS, SVG, lucide/Hugeicons, and the repo's `Frame`/`Card` primitives.
