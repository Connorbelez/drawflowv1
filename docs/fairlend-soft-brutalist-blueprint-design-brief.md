# Fairlend Soft Brutalist Blueprint Design Brief

Source images:

- `/Users/connor/Dev/concepts /ChatGPT Image Jun 9 2026 from SEO (10).png`
- `/Users/connor/Dev/concepts /ChatGPT Image Jun 9 2026 from SEO (8).png`

This brief translates the supplied Fairlend brand kits into a durable design direction for Fairlend public surfaces and DrawFlow product surfaces. It complements `PRODUCT.md` and `DESIGN.md`; it does not replace the product rules in `docs/draw_flow_prd.md`.

## Executive Direction

Fairlend should feel like civic housing infrastructure made legible: bold structure, human housing, backed by data. The visual language is soft brutalist blueprint, with the confidence of compressed industrial type, the warmth of paper and natural material textures, and the evidence layer of architectural drawings, maps, underwriting marks, stamps, and measured grid systems.

The brand is not generic fintech and not generic real estate. It is community-scale housing capital with an operator's brain: rigorous enough for lenders and investors, plainspoken enough for builders and residents, and material enough to remind users that the product funds real homes.

Core phrase:

> Bold structure. Human housing. Lasting impact.

## Brand Register

Primary register for public Fairlend pages: `brand`.

Primary register for DrawFlow authenticated product: `product`.

The public brand can be expressive, editorial, and image-led. The product UI must inherit the same DNA but serve precision workflows: draw planning, evidence review, site visits, admin approval, and capital release.

## Strategic Principles

1. **Built, not decorated.** Every section should feel assembled from structural parts: grid lines, frames, panels, blueprint plates, stamps, and material strips.
2. **Human scale beside capital scale.** Use people, homes, streets, and neighbourhood photography next to underwriting, metrics, and plan drawings. Never let capital language erase residents or builders.
3. **Data has a physical referent.** Metrics should attach to homes financed, affordability, emissions avoided, draw status, site verification, or timeline impact. Avoid abstract dashboard vanity.
4. **Editorial confidence over SaaS persuasion.** Use short declarations, hard line breaks, and concrete nouns. Avoid generic value propositions and vague "unlock growth" language.
5. **Product surfaces stay operational.** DrawFlow screens borrow palette, typography, blueprints, and framing, but never at the expense of scan speed, accessibility, auditability, or state clarity.

## Visual Positioning

The kit blends five visual systems:

- **Swiss/editorial grid:** visible rules, numbered sections, disciplined columns, clear alignment.
- **Soft brutalism:** hard edges, strong type, blocky panels, but warmed by paper, texture, and community imagery.
- **Architectural blueprint:** line drawings, plans, stamps, callouts, plot maps, technical overlays.
- **Civic institutional:** black-green authority, paper documentation, compliance energy, restrained seriousness.
- **Human housing editorial:** real homes, residents, builders, meetings, materials, wood, concrete, brick, and street life.

The result should feel like an architecture office, a lender's investment memo, and a community housing field report in one system.

## Palette

Use the kit palette as the canonical Fairlend brand palette. Values are shown as original hex plus OKLCH for Tailwind/CSS implementation.

| Token | Hex | OKLCH | Role |
|---|---:|---:|---|
| Paper White | `#FEFAF2` | `oklch(0.986 0.011 84.6)` | Page base, editorial panels, content fields |
| Black Green | `#081D18` | `oklch(0.212 0.029 175.7)` | Primary ink, dark sections, footer, high-authority CTAs |
| Civic Blue | `#245E88` | `oklch(0.464 0.091 243.7)` | Blueprint fields, investor/data sections, secondary CTA |
| Soft Lime | `#CDEB78` | `oklch(0.894 0.146 121.5)` | Brand signal, active tags, important highlights, "go" state |
| Burnt Orange | `#D85D34` | `oklch(0.627 0.165 38.4)` | Impact bands, warnings, community/action moments |
| Warm Gray | `#D8D3C9` | `oklch(0.868 0.015 84.6)` | Rules, trays, secondary panels, inactive controls |

### Palette Ratio

For public brand pages:

- 50 to 60 percent Paper White and warm neutrals.
- 20 to 30 percent Black Green.
- 10 to 20 percent Civic Blue.
- 5 to 10 percent Soft Lime.
- 5 to 10 percent Burnt Orange.

For DrawFlow product screens:

- 75 to 85 percent Paper White, Warm Gray, and quiet neutral surfaces.
- 5 to 8 percent Black Green for primary navigation and important text.
- 3 to 6 percent Civic Blue for maps, plans, links, and review/data state.
- 2 to 4 percent Soft Lime for active progress, selected plan, primary next step.
- Burnt Orange only for warning or exception states, never decoration.

### Color Rules

- Never use pure `#000` or `#fff`; use Paper White and Black Green.
- Soft Lime is the charged brand signal. It should not compete with another bright accent.
- Civic Blue is structural and analytical, not decorative.
- Burnt Orange is heat: impact, urgency, warning, or community energy.
- Warm Gray is the construction substrate: concrete, paper aging, dividers, inactive surfaces.

## Typography

The kits show two viable type modes. Use them deliberately.

### Public Brand Typography

- **Display:** GT America Compressed Black or a close compressed grotesk if licensing is unavailable.
- **Body/UI:** Sohne Buch/Kraftig or a close humanist grotesk if licensing is unavailable.
- **Fallback route:** use existing project type only when shipping constraints require it, but preserve the display/body contrast through weight, width, size, and line breaks.

Public display type should be tall, heavy, and architectural. It should support phrases like:

- `BUILD WHAT LASTS.`
- `REAL ESTATE INVESTING. REAL IMPACT.`
- `Homes people can build a life in.`
- `DATA DRIVES DECISIONS.`
- `WE ALIGN RETURNS WITH PURPOSE.`

### DrawFlow Product Typography

DrawFlow currently uses Oxanium. Keep Oxanium for authenticated product unless a planned type migration is approved. To align it with the kit:

- Use heavier weights and tighter, stacked headings for major workflow states.
- Use uppercase labels sparingly for metadata, section numbers, and audit labels.
- Keep body text practical and readable. Do not force compressed display styling into dense controls.

### Type Rules

- Public H1s can be brutal and oversized, but product headings must fit the workspace.
- Use hard line breaks as design material on public pages.
- Avoid negative letter spacing. The kit's strength comes from width and weight, not squeezed tracking.
- Body copy should cap at 65 to 75 characters.
- Label text can be small and uppercase, but must meet contrast and readability requirements.

## Layout System

The kit uses visible construction lines. Layouts should feel measured, not merely centered.

### Grid

- Use a 12-column desktop grid for public pages.
- Allow asymmetry: 5/7, 4/8, 8/4, and stacked editorial panels are stronger than repeated equal thirds.
- Use hairline borders and section numbers to show structure.
- Let some sections span full viewport width. Not every section needs a max-width wrapper.
- Use `Frame` and `FramePanel` for structural product containers.
- Use `Card` only for actual content cards or clickable content surfaces.

### Section Patterns

Public pages should rotate through these patterns:

- **Hero split with real housing media:** oversized type on paper, image block, lime or blueprint side plate.
- **Metric belt:** one horizontal rule-based strip with icons and numbers, not isolated metric cards.
- **Investment/community cards:** real photography plus terse underwriting details.
- **Blueprint proof band:** Civic Blue section with architectural linework and concise copy.
- **Lime operating system band:** process or strategy steps with icons and short labels.
- **Orange impact band:** bold impact statement with a small set of proof metrics.
- **Dark footer/investor band:** Black Green authority section with restrained calls to action.

Avoid endless equal card grids. When cards are required, vary width, image scale, and data density.

## Component Direction

### Buttons

Primary public button:

- Black Green background.
- Paper White text.
- Right arrow icon from `lucide-react` or the existing icon set.
- Squared or lightly rounded geometry, never pill-shaped by default.

Secondary public button:

- Civic Blue background or bordered Paper White.
- Paper White or Black Green text depending on surface.

Product button:

- Keep existing `Button` primitives.
- Use Soft Lime or current primary only for the single main action in a product flow.
- Use outline or ghost buttons for secondary routes.

### Badges And Pills

Kit badges are functional labels, not decoration:

- `Affordable Housing`: Soft Lime tint.
- `Development`: Civic Blue tint.
- `Community Space`: Burnt Orange tint.
- `Tenant Nearby`, `Investor Update`, `Active`: neutral or lime depending on state.

In product surfaces, badges must map to state machines. Do not use branded badges for arbitrary emphasis.

### Forms

Forms should feel like application paperwork made easier:

- Paper White fields on warm neutral surfaces.
- Hairline borders.
- Clear labels.
- Inline validation.
- No oversized empty fields unless the task benefits from physical breathing room.

For DrawFlow, field groups should preserve domain language:

- Build Location
- Borrower Working Capital Limit
- Lender Draw Policy Limit
- Budget Version
- Evidence Package
- Site Visit
- Draw Release

### Alerts And Feedback

- Success: Soft Lime field with Black Green text.
- Required/missing: Burnt Orange field with Black Green or Paper White text depending on contrast.
- Product warnings: use existing semantic warning patterns and route to review. Geofence failure must mark evidence location-unverified, not discard evidence.

## Imagery And Texture

Photography is not stock atmosphere. It must show the actual subject:

- Townhomes, multiplexes, infill, garden suites, laneway suites, build sites.
- Residents, builders, community partners, lenders, and investors in plausible environments.
- Materials: concrete, board-form concrete, brick masonry, corten steel, natural wood, matte black metal, linen/paper.
- Blueprint drawings and permit-like documentation.

Image treatments:

- Use clear, inspectable imagery.
- Avoid heavy blur, dark overlays, and generic hero mood shots.
- Pair photos with technical overlays, stamps, or measured captions.
- Material strips can act as section transitions.

## Iconography

Icons should be thin-line, construction-document clear, and concrete:

- Home
- Community
- Sustainability
- Investors
- Develop
- Fund
- Documents
- Reporting
- Compliance
- Security
- Support
- Partners
- Impact

Use existing icon libraries before custom drawing. Icons should sit in grid cells or beside labels; avoid repeated icon-card filler.

## Motion

Motion should feel like documents, drawers, and plan layers moving into place:

- Section reveals can slide a few pixels and fade.
- Blueprint lines can draw in slowly.
- Data belts can count once when visible, but avoid casino-style number animation.
- Cards can lift by 2 to 4px on hover.
- Buttons can move the arrow 2 to 4px on hover.

Use `cubic-bezier(0.22, 1, 0.36, 1)` or similar ease-out curves. Respect reduced motion.

## Copy System

Voice:

- Confident.
- Human.
- Grounded.
- Forward-thinking.
- Domain-specific.

Preferred sentence shape:

- Short declarative heading.
- One concrete support sentence.
- One action or proof point.

Examples:

- `Built for communities backed by data.`
- `We finance and build high-quality, affordable homes in thriving communities.`
- `We underwrite for impact and returns.`
- `From design to operations, we prioritize quality, transparency, and resident experience.`
- `Local insight. Strong assets. Better outcomes.`

Avoid:

- Generic SaaS abstractions.
- Real-estate hype.
- Investor-only language that ignores residents.
- Cute onboarding copy.
- Copy that implies v1 DrawFlow advances funds before work is complete.

## Public Surface Applications

### Homepage

The homepage should open with a first-viewport signal of Fairlend as a housing capital builder, not a generic investment firm. The hero needs:

- Large compressed type.
- Real housing photography.
- A lime or blueprint brand plate.
- A concise capital/community claim.
- A visible hint of the next content band.

Strong H1 directions:

- `Homes people can build a life in.`
- `Real estate investing. Real impact.`
- `Bold structure. Human housing.`

### Investment Pages

Investment pages should feel like a public-facing underwriting memo:

- Deal cards with photo, location, affordability, IRR/term where appropriate.
- Source, underwrite, build, manage strategy band.
- Risk and policy language presented plainly.
- Impact proof adjacent to return proof.

### Housing Program Pages

Garden suite, multiplex, affordable rental, and MLI pages should feel more builder/civic than investor:

- More material texture and field photography.
- Clear eligibility and process steps.
- Blueprint diagrams for typology and timeline.
- Direct CTAs to start, contact, or explore the applicable pathway.

### Resources And Press

Resources should read like a technical civic library:

- Indexed, gridded, and searchable.
- Article cards with concrete subjects, not generic blog thumbnails.
- Press kit pages can use the brand kit collage format directly: logos, colors, type, iconography, usage rules, and downloadable assets.

## DrawFlow Product Applications

DrawFlow should inherit the kit without becoming a marketing page.

### Build Proposal Flow

Use the paper/document metaphor:

- Framed steps.
- Clear field groups.
- Blueprint/map moments for location and roadmap.
- Lime only for the current step and final forward action.
- Burnt Orange only for blocking missing information.

### Build Workspace

Use the architectural plan metaphor:

- Milestone rail as a measured sequence.
- Gantt/roadmap as a blueprint field.
- Draw group bounding boxes as structural overlays.
- Evidence and site visit state as stamped verification marks.
- Bottom status region as an operations belt, not a card pile.

### Lender Operations

Use the underwriting desk metaphor:

- Dense kanban/work queues.
- Status stamps and audit trails.
- Civic Blue for review/in-analysis.
- Burnt Orange for blockers or exceptions.
- Soft Lime only when ready for admin action or release.

### Mobile Site Visit

Use the field report metaphor:

- Large touch targets.
- Camera/evidence first.
- Offline draft indicator.
- Geofence status visible but never destructive.
- Site visit report structured like an inspection sheet.

## Accessibility Requirements

- Target WCAG 2.1 AA minimum.
- Test color contrast for Soft Lime and Burnt Orange pairings; Black Green often works better than Paper White on lime.
- Do not communicate state by color alone. Pair color with labels, icons, and status text.
- Respect `prefers-reduced-motion`.
- Keep tap targets at least 44px on mobile.
- Preserve keyboard focus rings on all interactive controls.
- Avoid all-caps paragraphs. Reserve uppercase for labels and short display phrases.

## Implementation Notes

Preferred CSS token layer:

```css
:root {
  --fairlend-paper: oklch(0.986 0.011 84.6);
  --fairlend-ink: oklch(0.212 0.029 175.7);
  --fairlend-blueprint: oklch(0.464 0.091 243.7);
  --fairlend-lime: oklch(0.894 0.146 121.5);
  --fairlend-orange: oklch(0.627 0.165 38.4);
  --fairlend-warm-gray: oklch(0.868 0.015 84.6);
}
```

Route-level marketing CSS can alias these tokens. Authenticated DrawFlow product tokens should only adopt them after checking contrast, state semantics, and existing component impact.

Component reuse requirements:

- Structural wrappers: `src/components/ui/frame.tsx`.
- Interactive/content cards: `src/components/ui/card.tsx`.
- Buttons: `src/components/ui/button.tsx`.
- Badges: `src/components/ui/badge.tsx`.
- Forms: `src/components/ui/field.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx`, `switch.tsx`.
- Progress: `src/components/ui/progress.tsx` or `meter.tsx`.
- Dialogs/drawers only when workflow demands interruption or side-panel focus.

## Design QA Checklist

Before shipping a Fairlend or DrawFlow surface, verify:

- The page can be described as soft brutalist blueprint, not generic SaaS.
- The first viewport shows the actual product, place, person, or workflow.
- Public pages use real imagery or generated bitmap imagery with inspectable housing/community content.
- Product pages preserve workflow density and state clarity.
- Soft Lime is rare and meaningful.
- Burnt Orange is not decorative unless the section is explicitly an impact band.
- No gradient text.
- No glassmorphism as decoration.
- No colored side-stripe card accents.
- No nested cards.
- No repeated identical icon-card grid as the main content strategy.
- Copy uses Fairlend domain language and avoids generic growth/platform claims.
- Text fits at mobile and desktop viewports.
- Keyboard focus and reduced-motion paths work.

## Relationship To Current Context

`PRODUCT.md` already defines DrawFlow as product-register software with marketing surfaces as brand exceptions. This brief gives those brand exceptions a concrete visual language and gives DrawFlow authenticated screens a compatible product-grade translation.

`DESIGN.md` currently defines "The Instrument Panel" around Oxanium and a chartreuse primary. Keep that for authenticated DrawFlow until a deliberate type/token migration is planned. For public Fairlend pages, this brief should guide the stronger compressed display type, Sohne-style body voice, full palette, material imagery, and editorial grid system shown in the supplied kits.
