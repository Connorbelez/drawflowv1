---
name: DrawFlow
description: Construction draw-management control plane for FairLend
colors:
  primary: "oklch(0.841 0.238 128.85)"
  primary-foreground: "oklch(0.405 0.101 131.063)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  muted: "oklch(0.967 0.001 286.375)"
  muted-foreground: "oklch(0.552 0.016 285.938)"
  border: "oklch(0.92 0.004 286.32)"
  success: "oklch(0.58 0.16 145)"
  warning: "oklch(0.62 0.14 85)"
  info: "oklch(0.54 0.14 240)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Oxanium Variable, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Oxanium Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Oxanium Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Oxanium Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.02em"
rounded:
  sm: "calc(0.625rem - 4px)"
  md: "calc(0.625rem - 2px)"
  lg: "0.625rem"
  xl: "calc(0.625rem + 4px)"
  "2xl": "calc(0.625rem * 1.8)"
spacing:
  panel: "20px"
  frame-gap: "4px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 11px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
  frame-panel:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.xl}"
    padding: "{spacing.panel}"
---

# Design System: DrawFlow

## 1. Overview

**Creative North Star: "The Instrument Panel"**

DrawFlow reads like calibrated instrumentation, not a consumer app. It is a control plane where builders plan capital against physical work and brokers release money against verified evidence. The surface is light, near-neutral, and quiet so that the one thing that carries voltage, a high-chroma chartreuse primary, means something every time it appears. Geometry comes from Oxanium, a technical, slightly engineered sans that signals measurement and precision over warmth.

Depth is tonal, not theatrical. Surfaces nest through a `Frame` shell (a soft `muted/72` tray) holding `FramePanel` plates (true-background, hairline border, 1px inset highlight). The result feels machined: panels seated in a chassis, not cards floating on a gradient. Density is operator-grade: tight controls, real numbers, audit trails, and state that is always legible.

This system explicitly rejects consumer fintech gloss, generic project-management neutrality, and dark-mode-by-reflex. It does not celebrate with confetti or patronize with tours. It respects that the user knows construction or knows lending.

**Key Characteristics:**
- Chartreuse primary used sparingly as the single charged signal.
- Tinted near-neutrals; never pure `#000`/`#fff`.
- Oxanium everywhere; hierarchy from weight and scale, not font swaps.
- Frame-in-chassis tonal layering, not drop-shadowed floating cards.
- Light theme by default: glanced at in daylight, on site and at a desk.

## 2. Colors

A restrained-to-committed palette: tinted neutrals carry the surface, one chartreuse accent carries action and "go," semantic hues carry state.

### Primary
- **Charged Chartreuse** (`oklch(0.841 0.238 128.85)`): primary actions, the active draw-plan/"go" signal, focus emphasis, progress fill. High chroma on purpose; its rarity is its meaning. Foreground text on it is the deep olive `oklch(0.405 0.101 131.063)` for contrast, never white.

### Neutral
- **Paper** (`oklch(1 0 0)` / `--background`): panel and page base.
- **Ink** (`oklch(0.141 0.005 285.823)` / `--foreground`): primary text, tinted toward the cool neutral hue.
- **Muted Tray** (`oklch(0.967 0.001 286.375)`): the `Frame` chassis fill and secondary surfaces.
- **Muted Ink** (`oklch(0.552 0.016 285.938)`): secondary/supporting text and labels.
- **Hairline** (`oklch(0.92 0.004 286.32)`): borders and dividers.

### Semantic
- **Success** (`oklch(0.58 0.16 145)`): completed milestones, approved/verified evidence, released draws.
- **Warning** (`oklch(0.62 0.14 85)`): missing info, location-unverified evidence, attention-needed.
- **Info** (`oklch(0.54 0.14 240)`): neutral status, in-review, informational steps.
- **Destructive** (`oklch(0.577 0.245 27.325)`): reject, delete, irreversible release-side actions.

### Named Rules
**The One Voltage Rule.** Chartreuse is the only high-chroma color and appears on a small fraction of any screen: the primary CTA, the active state, the progress signal. If two chartreuse elements compete on one view, one is wrong. Semantic hues are reserved for status, never decoration.

## 3. Typography

**Display / Body / Label Font:** Oxanium Variable (with `sans-serif` fallback).

**Character:** Oxanium is a geometric, lightly technical sans with squared terminals; it reads as instrumentation and engineering. One family across the whole hierarchy keeps the surface coherent and machined. Hierarchy is built from weight and scale, never from introducing a second typeface.

### Hierarchy
- **Display** (600, `clamp(1.5rem, 3vw, 2rem)`, 1.1): page and flow titles (onboarding welcome, workspace headers).
- **Title** (600, 1.125rem, 1.3): panel and section titles.
- **Body** (400, 0.875rem, 1.5): default operator text; cap measure at 65–75ch in prose-heavy panels.
- **Label** (500, 0.75rem, +0.02em): field labels, badges, step indicators, metadata.

### Named Rules
**The Single Family Rule.** Never add a second typeface. Contrast comes from weight (400 / 500 / 600) and scale steps of at least 1.25.

## 4. Elevation

Depth is tonal and structural, not shadow-heavy. The signature is the `Frame` system: a soft `muted/72` tray (`rounded-2xl`, 1px padding) holding `FramePanel` plates that are true-background, hairline-bordered, with a single 1px inset highlight (`shadow-[0_1px_black/4%]`, inverted in dark). Surfaces are flat at rest; the only ambient shadow is `shadow-xs`. Lift is a response to state, not a default decoration.

### Shadow Vocabulary
- **Seat highlight** (`box-shadow: 0 1px oklch(0 0 0 / 4%)` inset-style via `::before`): the hairline that seats a panel in its tray.
- **Resting xs** (`shadow-xs` / `shadow-xs/5`): the only ambient elevation on panels and buttons.

### Named Rules
**The Chassis Rule.** Wrapping/structural containers use `Frame` + `FramePanel`. Content/interactive surfaces use `Card`. Never hand-roll `rounded-* border bg-* p-* shadow-*` wrapper markup, and never nest cards inside cards.

## 5. Components

### Buttons
- **Shape:** `rounded-lg` (0.625rem) with a 1px inset before-ring for tactility.
- **Primary:** chartreuse fill, deep-olive text, `h-9` (sm `h-8`), subtle top inset highlight; hover drops to `primary/90`.
- **Outline / Ghost / Secondary:** outline is paper with hairline border and `shadow-xs/5`; ghost is transparent with `accent` hover; secondary is the muted fill. Use outline for "Back/Skip," primary for the single forward action.
- **Focus:** `ring-2 ring-ring ring-offset-1`.

### Cards / Containers
- **Frame (chassis):** `rounded-2xl bg-muted/72 p-1`, stacks panels with a 1px gap.
- **FramePanel (plate):** `rounded-xl border bg-background p-5` with seat highlight. Primary structural surface.
- **Card:** for content and clickable surfaces; render as the correct interactive element via its API, never a styled div.

### Inputs / Fields
- **Style:** hairline border, paper background, `rounded-lg`; pair with `Field`/`Label` primitives.
- **Focus:** ring shift to `--ring`, no glow.

### Step / Progress (signature for onboarding)
- Use the existing `Progress`/`Meter` primitives and `Badge` for step state. Active step carries the chartreuse signal; completed steps carry success; upcoming steps are muted. Never invent a custom stepper div when these primitives compose.

## 6. Do's and Don'ts

### Do:
- **Do** wrap structure in `Frame`/`FramePanel` and content in `Card`; compose existing primitives.
- **Do** keep chartreuse to the single forward action / active signal per view (The One Voltage Rule).
- **Do** use Oxanium at varied weights for hierarchy; cap body measure at 65–75ch.
- **Do** tint every neutral toward the cool neutral hue; use OKLCH.
- **Do** ease motion with `cubic-bezier(0.22, 1, 0.36, 1)` (the project's view-transition curve); respect `prefers-reduced-motion`.
- **Do** let experienced builders skip first-run guidance without blocking the product.

### Don't:
- **Don't** use `#000` or `#fff`, gradient text, or `background-clip: text`.
- **Don't** add side-stripe accent borders (`border-left`/`border-right` >1px) on panels, list items, or alerts.
- **Don't** use decorative glassmorphism, the hero-metric template, or identical icon+heading+text card grids.
- **Don't** reach for a modal as the first thought; exhaust inline/progressive disclosure (use `Drawer`/`IntroDisclosure` where a panel won't do).
- **Don't** introduce a second typeface or a second high-chroma color.
- **Don't** patronize: no forced tours, no obvious tooltips on standard patterns, no infantilizing celebration. No em dashes in copy.
