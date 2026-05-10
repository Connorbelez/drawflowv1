# Design System

## Theme

Dark-first. The interface is a control plane used by professionals in focused sessions, often at desks with controlled lighting. Dark reduces eye strain during long reviews of dense milestone data. Light mode supported for accessibility and projection contexts.

## Color Strategy

**Committed**: one saturated color carries 30-50% of surface. The surface IS the tool.

### Palette

| Token | OKLCH | Role |
|-------|-------|------|
| `--bg-base` | `oklch(0.08 0.01 260)` | Page background |
| `--bg-elevated` | `oklch(0.12 0.015 260)` | Cards, panels |
| `--bg-sunken` | `oklch(0.06 0.005 260)` | Inset areas, timelines |
| `--fg-primary` | `oklch(0.94 0.005 285)` | Primary text |
| `--fg-secondary` | `oklch(0.65 0.01 285)` | Secondary text, labels |
| `--fg-tertiary` | `oklch(0.45 0.008 285)` | Disabled, hints |
| `--accent` | `oklch(0.72 0.22 145)` | Primary action, active states |
| `--accent-hover` | `oklch(0.78 0.24 145)` | Accent hover |
| `--accent-subdued` | `oklch(0.72 0.22 145 / 0.15)` | Accent backgrounds, subtle highlights |
| `--success` | `oklch(0.72 0.18 145)` | Completed, approved |
| `--warning` | `oklch(0.78 0.16 85)` | Caution, pending review |
| `--danger` | `oklch(0.62 0.22 25)` | Error, rejected, blocked |
| `--info` | `oklch(0.72 0.15 240)` | Informational, neutral highlight |
| `--border` | `oklch(1 0 0 / 0.08)` | Subtle borders |
| `--border-strong` | `oklch(1 0 0 / 0.15)` | Focused borders, dividers |

Neutrals are tinted toward the blue-violet hue (260°) at low chroma to avoid cold gray. Accent is a sharp yellow-green (145°) for maximum contrast against dark backgrounds and energy/precision feel.

### Status Colors

- `completed`: `--success` with check icon
- `in-progress`: `--accent` with spinner/dash icon
- `pending`: `--fg-tertiary` with dot icon
- `blocked`: `--danger` with lock icon
- `review`: `--warning` with eye icon

## Typography

| Role | Font | Weight | Size | Line |
|------|------|--------|------|------|
| Display | Oxanium Variable | 700 | 48px / 3rem | 1.05 |
| H1 | Oxanium Variable | 600 | 32px / 2rem | 1.15 |
| H2 | Oxanium Variable | 600 | 24px / 1.5rem | 1.25 |
| H3 | Oxanium Variable | 500 | 18px / 1.125rem | 1.3 |
| Body | Oxanium Variable | 400 | 14px / 0.875rem | 1.6 |
| Body-sm | Oxanium Variable | 400 | 13px / 0.8125rem | 1.5 |
| Label | Oxanium Variable | 500 | 11px / 0.6875rem | 1.2 |
| Mono | JetBrains Mono Variable | 400 | 13px / 0.8125rem | 1.5 |

Scale ratio: ~1.33 between steps. All-caps labels for UI chrome (11px, 500, 0.06em letter-spacing, `--fg-tertiary`).

## Spacing

Base unit: 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.

- Tight packing for data-dense areas (4-8px gaps)
- Medium for form sections (16-24px)
- Generous for page-level rhythm (32-64px)

## Elevation

No shadows for elevation. Use border + background tier:

| Tier | Background | Border |
|------|-----------|--------|
| Base | `--bg-base` | none |
| Elevated | `--bg-elevated` | `--border` |
| Focused | `--bg-elevated` | `--border-strong` |
| Overlay | `--bg-elevated` | `--border-strong` + backdrop blur 8px |

## Components

### Buttons

- **Primary**: `--accent` bg, `--bg-base` text, no border. Hover: `--accent-hover`. Active: scale(0.98).
- **Secondary**: transparent bg, `--fg-secondary` text, `--border` border. Hover: `--accent-subdued` bg.
- **Ghost**: transparent bg, `--fg-secondary` text, no border. Hover: `--accent-subdued` bg.
- **Destructive**: `--danger` bg, white text.

All buttons: 8px 16px padding, 6px radius, 500 weight, 11px label size for icon-only.

### Inputs

- `--bg-sunken` background, `--border` border
- Focus: `--accent` border, `--accent-subdued` glow (box-shadow)
- 8px padding, 6px radius
- Labels: all-caps, 11px, `--fg-tertiary`

### Cards

Use sparingly. Only when content truly needs containment. No nested cards.
- `--bg-elevated` background
- `--border` border
- 8px radius
- 16px padding

### Tables / Data Grids

- No vertical borders. Horizontal dividers only: `--border`
- Header: all-caps labels
- Row hover: `--accent-subdued`
- Selected row: `--accent-subdued` + left 2px `--accent` indicator

### Timeline / Roadmap

- Horizontal lanes with `--bg-sunken` background
- Milestone bars: rounded 4px, color by status
- Dependency lines: 1px `--fg-tertiary` dashed
- Current time indicator: 1px `--accent` solid

## Motion

- Duration: 150ms for micro-interactions, 300ms for page transitions
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo)
- No layout-property animation (width, height, top, left)
- Transform and opacity only
- Respect `prefers-reduced-motion: reduce`

## Layout

- Max content width: 1440px
- Sidebar (if any): 240px fixed
- Page padding: 24px mobile, 32px tablet, 48px desktop
- Dense areas use full bleed with internal padding
