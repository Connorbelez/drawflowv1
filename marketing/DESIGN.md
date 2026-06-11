---
name: Fairlend Marketing
description: Public Fairlend brand and marketing design system for the /marketing route
colors:
  paper: "oklch(0.986 0.011 84.6)"
  ink: "oklch(0.212 0.029 175.7)"
  blueprint: "oklch(0.464 0.091 243.7)"
  lime: "oklch(0.894 0.146 121.5)"
  orange: "oklch(0.627 0.165 38.4)"
  warm-gray: "oklch(0.868 0.015 84.6)"
  line: "oklch(0.212 0.029 175.7 / 18%)"
typography:
  display:
    fontFamily: "GT America Compressed, 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "clamp(4rem, 10vw, 10rem)"
    fontWeight: 900
    lineHeight: 0.88
    letterSpacing: "0"
  headline:
    fontFamily: "GT America Compressed, 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 6.5rem)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "0"
  body:
    fontFamily: "Sohne, 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Sohne Kraftig, Sohne, 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
rounded:
  control: "0.125rem"
  panel: "0.25rem"
  image: "0"
spacing:
  grid: "clamp(1rem, 2vw, 2rem)"
  section-y: "clamp(4rem, 9vw, 9rem)"
  rule: "1px"
components:
  primary-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
  secondary-button:
    backgroundColor: "{colors.blueprint}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
  brand-plate:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
  impact-band:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.paper}"
---

# Design System: Fairlend Marketing

## 1. Overview

**Creative North Star: "Soft Brutalist Blueprint"**

Fairlend marketing is a public-facing housing capital brand. It should feel assembled from architectural drawings, investment memos, material samples, civic notices, and real neighbourhood photography. The page is not an app dashboard. It is the argument for why Fairlend deserves trust.

The system is louder than authenticated DrawFlow UI. It uses compressed display type, ruled editorial grids, blueprint overlays, stamps, full palette section bands, and real housing imagery. It still shares DrawFlow's discipline: concrete language, auditable implications, and serious interaction patterns.

Physical scene: a builder, investor, or civic partner is scanning Fairlend on a laptop during a financing decision, with printed plans and numbers nearby. The page must look like the team understands both the construction site and the capital stack.

Color strategy: **Full palette.** Paper White and Black Green carry the brand base, Civic Blue owns blueprint/data proof, Soft Lime marks brand signal and active opportunity, Burnt Orange carries impact and urgency.

Key characteristics:

- Paper-based public surfaces with visible construction grids.
- Black Green authority instead of fintech navy.
- Civic Blue blueprint and data sections.
- Soft Lime as the charged Fairlend mark.
- Burnt Orange for impact bands and important friction.
- Large compressed type with humanist body copy.
- Real homes, materials, people, and technical documents.

## 2. Colors

### Core Tokens

| Token | Hex Source | OKLCH | Role |
|---|---:|---:|---|
| Paper White | `#FEFAF2` | `oklch(0.986 0.011 84.6)` | Page base, editorial panels, fields |
| Black Green | `#081D18` | `oklch(0.212 0.029 175.7)` | Ink, dark sections, primary CTAs |
| Civic Blue | `#245E88` | `oklch(0.464 0.091 243.7)` | Blueprint sections, data proof, secondary action |
| Soft Lime | `#CDEB78` | `oklch(0.894 0.146 121.5)` | Fairlend mark, active state, tags, proof highlight |
| Burnt Orange | `#D85D34` | `oklch(0.627 0.165 38.4)` | Impact bands, warnings, community energy |
| Warm Gray | `#D8D3C9` | `oklch(0.868 0.015 84.6)` | Rules, trays, inactive surfaces, material base |

### Usage Ratios

Public marketing pages should usually land near:

- 50 to 60 percent Paper White and Warm Gray.
- 20 to 30 percent Black Green.
- 10 to 20 percent Civic Blue.
- 5 to 10 percent Soft Lime.
- 5 to 10 percent Burnt Orange.

These ratios can flex by page. Investor pages may lean harder into Black Green and Civic Blue. Housing-program pages may use more Paper White, material texture, and field photography. Impact sections may drench in Burnt Orange for one fold.

### Rules

- Use OKLCH in new CSS.
- Use Paper White and Black Green instead of pure black or pure white.
- Soft Lime is the Fairlend voltage. Use it for the logo plate, active opportunities, proof tags, and one or two key moments per viewport.
- Civic Blue should feel structural: plans, data, underwriting, maps, and proof.
- Burnt Orange should feel consequential: impact, warning, community need, or urgent action.
- Warm Gray is substrate: concrete, paper aging, dividers, borders, and inactive states.

## 3. Typography

### Public Brand Type Stack

Display should be compressed, tall, and architectural.

Preferred:

- **Display:** GT America Compressed Black.
- **Body/UI:** Sohne Buch and Sohne Kraftig.

Fallbacks when licensed fonts are unavailable:

- **Display fallback:** `'Arial Narrow'`, `'Roboto Condensed'`, `Impact`, sans-serif. Use carefully and test rendering.
- **Body fallback:** `'Avenir Next'`, `'Segoe UI'`, system-ui, sans-serif.

### Scale

- **Display:** `clamp(4rem, 10vw, 10rem)`, weight 900, line-height 0.88.
- **Headline:** `clamp(2.75rem, 6vw, 6.5rem)`, weight 900, line-height 0.9.
- **Section title:** `clamp(1.8rem, 3.5vw, 3.75rem)`, weight 900, line-height 0.95.
- **Body:** 1rem to 1.125rem, line-height 1.55.
- **Small label:** 0.7rem to 0.8rem, uppercase, weight 700.

### Rules

- Use display type for short, declarative phrases.
- Body copy must stay readable and sentence-case.
- Do not set long paragraphs in uppercase.
- Do not use negative letter spacing.
- Use hard line breaks in heroes and major editorial blocks.
- Keep body copy to 65 to 75 characters per line.

## 4. Layout

Marketing layout is a visible grid, not a centered SaaS stack.

### Grid System

- Desktop: 12 columns with visible hairline rules where appropriate.
- Tablet: 6 columns.
- Mobile: 4 columns or single-column editorial stacking.
- Use section numbers, stamps, and rule lines to create a designed document feel.
- Let hero, impact, blueprint, and footer bands span full width.
- Use `max-width` only where reading comfort demands it.

### Section Rhythm

Rotate through strong section types:

- **Hero construction:** paper copy zone, real housing image, lime brand plate, blueprint overlay.
- **Metric belt:** horizontal proof strip with icons and numbers.
- **Featured opportunity:** image-led investment or community card with actual deal details.
- **Blueprint band:** Civic Blue section with line drawings and concise proof.
- **Lime strategy band:** source, underwrite, build, manage.
- **Orange impact band:** bold social outcome plus measured proof.
- **Black Green footer:** institutional authority and navigation.

Avoid repeating equal icon-card grids. If cards are necessary, vary scale, density, and image treatment.

## 5. Components

Marketing components may be more expressive than app components, but reuse existing primitives where practical.

### Buttons

Primary:

- Black Green fill.
- Paper White text.
- Square or lightly rounded corners.
- Arrow icon on the right.
- Hover: slight ink shift and arrow translation.

Secondary:

- Civic Blue fill on paper or Paper White outline on dark fields.
- Same geometry as primary.

Tertiary:

- Text link with arrow.
- No pill background.

### Navigation

Navigation should feel like a brand masthead and investment memo header:

- Fairlend wordmark left.
- Compact links.
- Contact or portal action on the right.
- Hairline bottom rule.
- Mobile menu should preserve the same editorial tone.

### Cards

Use cards for real content: investments, communities, resources, team, press assets.

Rules:

- No nested cards.
- No side-stripe accent borders.
- Include real imagery whenever the card is about a place, person, build, or program.
- Use hard data where available: location, unit type, target return, term, affordability, or program fit.
- Use `Card` when composing in React, but override radius and palette to the marketing system.

### Badges

Badges should look like stamped labels:

- `ACTIVE`: Soft Lime.
- `AFFORDABLE HOUSING`: Soft Lime tint.
- `DEVELOPMENT`: Civic Blue.
- `COMMUNITY SPACE`: Burnt Orange.
- `INVESTOR UPDATE`: Warm Gray.

### Forms

Forms should feel like better paperwork:

- Paper White fields.
- Hairline Black Green or Warm Gray borders.
- Compact labels.
- Clear inline validation.
- Primary submit uses Black Green or Soft Lime depending on context.

## 6. Imagery

Imagery is required on marketing pages.

Preferred subjects:

- Multiplexes, infill, townhomes, garden suites, laneway suites, affordable rentals.
- Builders, residents, community partners, lenders, and investors in plausible real environments.
- Architectural drawings, permit-like documents, site plans, underwriting sheets.
- Material textures: concrete, brick, corten steel, natural wood, matte metal, linen, paper.

Treatment:

- Images must be inspectable. Avoid dark overlays and heavy blur.
- Pair photos with captions, stamps, rule lines, or blueprint overlays.
- Use material strips as section breaks when a page needs texture.
- Do not use generic city skylines as the main proof of housing impact.

## 7. Motion

Motion should feel like plan layers, documents, and evidence coming into alignment.

Allowed:

- Hero blueprint-to-render scroll reveal.
- Section reveals with small y movement and opacity.
- Blueprint line draw effects.
- Arrow translation on hover.
- Number counters only when tied to proof metrics and triggered once.

Rules:

- Respect `prefers-reduced-motion`.
- Do not animate layout properties.
- Use exponential ease-out curves.
- Avoid bounce and elastic motion.
- Keep motion purposeful. The page should feel engineered, not theatrical.

## 8. Copy

Tone:

- Confident.
- Civic.
- Grounded.
- Measured.
- Forward-looking.

Strong copy patterns:

- `Homes people can build a life in.`
- `Real estate investing. Real impact.`
- `Built for communities backed by data.`
- `We underwrite for impact and returns.`
- `Build stronger. Backed by discipline.`
- `Local insight. Strong assets. Better outcomes.`

Avoid:

- "Unlock."
- "Seamless."
- "Next generation."
- "All-in-one platform."
- "Revolutionizing real estate."
- Investor returns language without community proof.
- Community language without underwriting proof.

## 9. Implementation Guidance

Use a marketing-scoped token layer:

```css
.mkt-shell {
  --mkt-paper: oklch(0.986 0.011 84.6);
  --mkt-ink: oklch(0.212 0.029 175.7);
  --mkt-blueprint: oklch(0.464 0.091 243.7);
  --mkt-lime: oklch(0.894 0.146 121.5);
  --mkt-orange: oklch(0.627 0.165 38.4);
  --mkt-warm-gray: oklch(0.868 0.015 84.6);
}
```

This marketing token layer must not overwrite authenticated app tokens. Root `DESIGN.md` remains product-register for DrawFlow app UI.

Preferred existing primitives:

- `src/components/ui/button.tsx` for CTAs.
- `src/components/ui/card.tsx` for content cards.
- `src/components/ui/frame.tsx` only when a structural framed treatment is appropriate.
- `lucide-react` for recognizable action and object icons.
- Existing marketing CSS for route-level art direction.

Use route-level CSS for brand-specific composition and motion. Do not force public marketing pages into authenticated app spacing, radius, or palette defaults.

## 10. QA Checklist

Before shipping a marketing page:

- The first viewport shows real housing, people, plans, or an investment artifact.
- The page reads as Fairlend, not generic fintech, generic SaaS, or generic real estate.
- The palette uses Paper White, Black Green, Civic Blue, Soft Lime, Burnt Orange, and Warm Gray deliberately.
- Soft Lime has one clear job per viewport.
- Body copy is readable and not all caps.
- No gradient text.
- No decorative glassmorphism.
- No colored side-stripe card accents.
- No nested cards.
- No identical card grid as the primary composition.
- Images are not dark, blurred, or purely atmospheric.
- CTAs are concrete and serious.
- Mobile text does not overlap, clip, or shrink below usable size.
- Keyboard and reduced-motion paths work.
