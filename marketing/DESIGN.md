---
name: Fairlend Marketing
description: Public Fairlend brand and marketing design system for the /marketing route
colors:
  paper: "oklch(0.975 0.021 80)"
  paper-soft: "oklch(0.946 0.028 80)"
  surface: "oklch(0.986 0.014 82)"
  ink: "oklch(0.224 0.06 160)"
  ink-muted: "oklch(0.365 0.032 163)"
  forest: "oklch(0.35 0.09 145)"
  sage: "oklch(0.56 0.074 141)"
  success: "oklch(0.58 0.16 145)"
  chartreuse: "oklch(0.841 0.238 128.85)"
  chartreuse-ink: "oklch(0.405 0.101 131.063)"
  blueprint: "oklch(0.58 0.118 250)"
  blueprint-line: "rgb(88 137 207 / 30%)"
  copper: "oklch(0.66 0.095 58)"
  line: "oklch(0.224 0.06 160 / 14%)"
typography:
  display:
    fontFamily: '"Larken Bold", "Larken", Georgia, "Times New Roman", serif'
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0"
  body:
    fontFamily: '"Oxanium Variable", "Avenir Next", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Oxanium Variable", "Avenir Next", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
rounded:
  control: "0.125rem"
  panel: "0.25rem"
  image: "0"
spacing:
  grid: "clamp(16px, 2vw, 32px)"
  section-y: "clamp(4rem, 9vw, 9rem)"
  rule: "1px"
components:
  primary-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
  secondary-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: "44px"
  brand-plate:
    backgroundColor: "{colors.chartreuse}"
    textColor: "{colors.chartreuse-ink}"
    borderColor: "{colors.ink}"
---

# Design System: Fairlend Marketing

## 1. Overview

**Creative North Star: "Soft Brutalist Blueprint"**

Fairlend marketing is a public-facing housing capital brand. It should feel assembled from architectural drawings, investment memos, material samples, civic notices, and real neighbourhood photography. The page is not an app dashboard. It is the argument for why Fairlend deserves trust.

The system is louder than authenticated DrawFlow UI. It uses compressed display type, ruled editorial grids, blueprint overlays, stamps, full palette section bands, and real housing imagery. It still shares DrawFlow's discipline: concrete language, auditable implications, and serious interaction patterns.

Physical scene: a builder, investor, or civic partner is scanning Fairlend on a laptop during a financing decision, with printed plans and numbers nearby. The page must look like the team understands both the construction site and the capital stack.

Color strategy: **Full palette.** Paper and Ink carry the brand base, Blueprint owns data/proof, Chartreuse marks the Fairlend signal and active opportunity, Copper provides warm accent moments.

Key characteristics:

- Paper-based public surfaces with visible construction grids.
- Forest/ink authority instead of fintech navy.
- Blueprint sections for data and proof.
- Chartreuse as the charged Fairlend mark.
- Copper for warm accent moments.
- Display serif (Larken) for editorial headlines; Oxanium for body and UI.
- Real homes, materials, people, and technical documents.

## 2. Colors

### Core Tokens

| Token | OKLCH | Role |
|---|---:|---:|
| Paper | `oklch(0.975 0.021 80)` | Page base, editorial panels, fields |
| Paper Soft | `oklch(0.946 0.028 80)` | Subtle panel tints |
| Surface | `oklch(0.986 0.014 82)` | Lightest surfaces, badges |
| Ink | `oklch(0.224 0.06 160)` | Primary text, dark sections, primary CTAs |
| Ink Muted | `oklch(0.365 0.032 163)` | Secondary/supporting text |
| Forest | `oklch(0.35 0.09 145)` | Dark green accents, dark sections |
| Sage | `oklch(0.56 0.074 141)` | Subtle green labels, eyebrows |
| Success | `oklch(0.58 0.16 145)` | Completed/approved states |
| Chartreuse | `oklch(0.841 0.238 128.85)` | Fairlend mark, active state, tags, proof highlight |
| Chartreuse Ink | `oklch(0.405 0.101 131.063)` | Text on chartreuse |
| Blueprint | `oklch(0.58 0.118 250)` | Blueprint sections, data proof |
| Blueprint Line | `rgb(88 137 207 / 30%)` | Blueprint construction lines |
| Copper | `oklch(0.66 0.095 58)` | Warm accent moments |
| Line | `oklch(0.224 0.06 160 / 14%)` | Rules, dividers, borders |

### Rules

- Use OKLCH in new CSS.
- Use Paper and Ink instead of pure black or pure white.
- Chartreuse is the Fairlend voltage. Use it for the logo plate, active opportunities, proof tags, and one or two key moments per viewport.
- Blueprint should feel structural: plans, data, underwriting, maps, and proof.
- Copper is a warm, material accent. Use sparingly.
- Line is substrate: concrete, paper aging, dividers, borders, and inactive states.

## 3. Typography

### Public Brand Type Stack

Display should be compressed, tall, and architectural.

- **Display:** `"Larken Bold", "Larken", Georgia, "Times New Roman", serif` — weight 700, tight line-height.
- **Body/UI:** `"Oxanium Variable", "Avenir Next", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif` — weight 400, line-height 1.5.
- **Label:** Same as body, weight 700, uppercase, letter-spacing 0.08em.

### Scale

- **Display headline:** `clamp(2rem, 4vw, 4rem)`, line-height ~0.95.
- **Section title:** `clamp(1.8rem, 3.5vw, 3.75rem)`, weight 700.
- **Body:** 1rem to 1.125rem, line-height 1.5.
- **Small label:** 0.7rem to 0.8rem, uppercase, weight 700.

### Rules

- Use display type for short, declarative phrases.
- Body copy must stay readable and sentence-case.
- Do not set long paragraphs in uppercase.
- Do not use negative letter spacing.
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

- **Hero construction:** paper copy zone, real housing image, chartreuse brand plate, blueprint overlay.
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

- Ink fill.
- Paper text.
- Square or lightly rounded corners.
- Arrow icon on the right.
- Hover: slight ink shift and arrow translation.

Secondary:

- Transparent with ink outline.
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

- `ACTIVE`: Chartreuse.
- `AFFORDABLE HOUSING`: Chartreuse tint.
- `DEVELOPMENT`: Blueprint.
- `COMMUNITY SPACE`: Copper.
- `INVESTOR UPDATE`: Warm Gray.

### Forms

Forms should feel like better paperwork:

- Paper fields.
- Hairline ink borders.
- Compact labels.
- Clear inline validation.
- Primary submit uses Ink or Chartreuse depending on context.

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
  --mkt-paper: oklch(0.975 0.021 80);
  --mkt-ink: oklch(0.224 0.06 160);
  --mkt-chartreuse: oklch(0.841 0.238 128.85);
  --mkt-blueprint: oklch(0.58 0.118 250);
  --mkt-line: oklch(0.224 0.06 160 / 14%);
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
- The palette uses Paper, Ink, Chartreuse, Blueprint, and Copper deliberately.
- Chartreuse has one clear job per viewport.
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
