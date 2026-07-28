# Isometric City Independent Assets

Source: `/Users/connor/.codex/attachments/4b718be8-b364-4a66-92a5-7e72d0ddc652/image-1.webp`

This corrected run uses the source image for inventory, proportions, and style direction only. The final production assets are independent transparent sprites, not source-image screenshot crops.

## Final Deliverables

- `generated/webp/*.webp` - production-ready transparent WebP assets.
- `generated/raw/*.png` - raw transparent PNG sources for the WebPs.
- `production-assets.json` - machine-readable map of every final asset.
- `asset-manifest.json` - traceability manifest with source reference crops.
- `verification/production-contact-sheet.png` - visual contact sheet for all final assets.
- `verification/verification-report.json` - automated verification result.

## Counts

- Buildings and landmarks: 40
- Surfaces: 14
- Final WebP files: 54
- Raw PNG files: 54

## Verification

Run from the repository root:

```bash
python3 /Users/connor/.codex/skills/visual-asset-pipeline/scripts/validate_asset_manifest.py \
  artifacts/visual-assets/isometric-city-buildings/asset-manifest.json

python3 /Users/connor/.codex/skills/visual-asset-pipeline/scripts/validate_generated_assets.py \
  artifacts/visual-assets/isometric-city-buildings/asset-manifest.json \
  --production artifacts/visual-assets/isometric-city-buildings/production-assets.json

python3 artifacts/visual-assets/isometric-city-buildings/render_independent_city_assets.py \
  --source artifacts/visual-assets/isometric-city-buildings/source.webp \
  --out artifacts/visual-assets/isometric-city-buildings \
  --verify
```

Latest verification:

- 54 production assets.
- 40 building assets.
- 14 surface assets.
- 54 readable WebPs.
- 54 readable raw PNGs.
- Every final WebP has transparent background pixels.
- No final WebP path reuses a reference crop path.
- Verification errors: none.
