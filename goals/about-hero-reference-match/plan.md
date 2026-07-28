# About Hero Reference Match Plan

## Solution Approach

Rebuild the `/about` above-the-fold composition as a faithful coded version of the supplied 1520x864 reference screenshot. Use the supplied screenshot as the image-first source of truth, because generating a new design image would introduce drift from the required target. Implement the fold with existing `public/assets/about-webp/webp/*` assets plus CSS/HTML document surfaces where the reference contains text-heavy paper elements, and verify through automated tests plus repeated desktop browser screenshots.

## Ordered Steps

1. Capture the current `/about` baseline.
   - Touches: local dev server, browser screenshot artifacts under `artifacts/` or `tmp/`.
   - Work: run the app, open `/about` at the reference viewport ratio, capture the current above-fold screenshot, and compare against `/Users/connor/Library/Application Support/CleanShot/media/media_S0qOt0Owpi/CleanShot 2026-06-15 at 17.11.00@2x.png`.
   - Verification: screenshot exists and shows the current implementation before edits.

2. Replace the old extracted asset path with the requested about-webp asset system.
   - Touches: `src/routes/about.tsx`.
   - Work: change `extractedAssetPath` usage to `aboutWebpAssetPath = "/assets/about-webp/webp"` for the hero house photo, side house photo, front-elevation blueprint, good-homes note, mortgage commitment document, residential mortgage file card, pipeline snapshot note, right blueprint strip, Toronto skyline sketch, and finance icons.
   - Work: update route preloads to the actual above-fold `about-webp` and `paper-grain-overlay.webp` files.
   - Verification: `src/routes/-about.test.tsx` asserts the new asset URLs and no longer asserts the old `fairlend-about-extracted` URLs for the matched fold.

3. Recompose `AboutReferenceFold` to match the reference viewport.
   - Touches: `src/routes/about.tsx`.
   - Work: preserve the semantic section structure, but adjust markup so the left headline, body, orange CTA, stamp, hero image collage, document surfaces, lower Who We Are panel, and What We Finance card grid can be positioned like the screenshot.
   - Work: render text-heavy surfaces in HTML where necessary: mortgage commitment fields, residential mortgage file fields, pipeline snapshot note, investor opportunity card, and the three-item Who We Are capability box.
   - Verification: route render test confirms the semantic text, CTA links, section markers, and required asset URLs are present.

4. Rewrite the above-fold CSS for desktop parity.
   - Touches: `src/routes/-about.css`.
   - Work: tune the desktop artboard around the 1520x864 reference: cream paper background, thin teal-gray rules, small section markers, giant compressed dark-green headline, orange CTA, right-side layered collage, and lower grid start.
   - Work: apply `paper-grain-overlay.webp` to the hero text/paper surfaces and other existing paper/drafting overlays where useful.
   - Work: use fixed proportions and absolute collage coordinates for the desktop target so asset scale and overlap match the reference.
   - Verification: browser screenshot at the reference desktop viewport materially aligns with the supplied reference.

5. Build the What We Finance and Who We Are fold edge to match the screenshot.
   - Touches: `src/routes/about.tsx`, `src/routes/-about.css`.
   - Work: replace the old single finance-board image with a coded 2x3 finance card grid using the existing finance icon assets from `public/assets/about-webp/webp`.
   - Work: adjust the Who We Are block so the heading, copy, Toronto skyline sketch, and three bordered capability rows match the visible lower-left region.
   - Verification: desktop screenshot shows the lower row begins immediately below the hero divider and matches the reference’s visible density.

6. Preserve responsive behavior without weakening desktop fidelity.
   - Touches: `src/routes/-about.css`.
   - Work: add tablet/mobile rules that stack the composition, keep text readable, avoid horizontal overflow, and keep the collage coherent using the same assets.
   - Verification: Playwright or browser checks at mobile/tablet widths show no horizontal overflow, clipped text, or incoherent overlaps.

7. Add focused automated coverage.
   - Touches: `src/routes/-about.test.tsx`; optionally `tests/e2e/about-reference-fold.spec.ts` if a browser-level regression check is useful.
   - Work: update unit tests for the new asset paths, semantic document/card text, section markers, and CTA links. Add a browser-level layout check for desktop dimensions, above-fold section presence, and no horizontal overflow.
   - Verification: `bun run test src/routes/-about.test.tsx` and any new e2e check pass.

8. Run the image-to-code visual loop until aligned.
   - Touches: implementation files from prior steps plus screenshot artifacts.
   - Work: start `bun run dev`, capture `/about` at 1520x864, compare against the reference, adjust CSS/markup, and repeat. Prioritize large mismatches first: headline scale/position, fold divider height, collage asset placement, document scale, finance grid start, and paper texture.
   - Verification: final desktop screenshot is materially aligned with the reference under the accepted visual-fidelity standard.

9. Run final project verification.
   - Touches: no intended source edits beyond the implementation scope.
   - Commands: `bun run test src/routes/-about.test.tsx`; any new targeted e2e command; `bun run build`.
   - Verification: commands pass or any blocker is documented with the exact failing command and cause.

## Risks And Open Questions

- The worktree already has unrelated changes (`bun.lock`, `src/routes/marketing.tsx`, moved/deleted asset files, and generated artifacts). Do not revert them; edit only the `/about` route, about CSS/tests, and new goal files unless implementation requires otherwise.
- The accepted constraint requires `public/assets/about-webp`, but the current implementation uses `public/assets/fairlend-about-extracted`. This is a real cutover, not a small CSS tweak.
- The reference uses a very compressed display face. If the exact font is unavailable, use existing project fonts and CSS scaling to match visual mass as closely as possible.
- Some reference elements, such as the investor opportunity card and stamp, do not appear as standalone assets in `about-webp`; implement them as HTML/CSS paper cards rather than generating new images.
- Browser screenshot comparison is partly human-reviewed unless a dedicated pixel-diff script is added. Automated layout assertions should catch regressions, but final fidelity requires visual inspection.
