# HTML Artifact Template

Use this structure for every generated planning artifact. The HTML file is the source of truth for the planning loop and the primary deliverable the user reviews.

## File and Page Rules

- Write to `~/.agent/plans/<project-slug>/<feature-slug>/index.html`.
- Use a complete standalone HTML document.
- Inline the relevant CSS variables copied from the target repo.
- Keep the page readable without devtools.
- Make the first artifact immediately from the user's prompt, even before codebase grounding. Clearly label it `Draft`, then regenerate after repo inspection with grounded styling and implementation context.
- Support review through chat or browser annotations. Use stable IDs so annotation targets survive regeneration whenever possible.
- Use semantic HTML: `header`, `nav`, `main`, `section`, `article`, `table`, `ol`, `ul`, `dl`.
- Use static mockups only. Do not fake app interactivity unless it helps explain state.
- Optimize simultaneously for high visual fidelity and traceability. The artifact should look like a credible product mockup and remain easy for an implementation agent to reference.
- Always apply `/impeccable` mockup standards. Mockups should be distinctive, production-grade, repo-grounded, and free of generic placeholder UI.
- Make the plan document itself beautiful, editorial, and pleasant to review. The surrounding document may use its own art direction; only the mocked app screens must strictly follow repo styling/CSS variables.
- The final visible content section must be `<section id="goal-plan" data-ixc-contract="GOAL-PLAN">`.

## Document Presentation

The user will spend significant time reviewing this artifact. Treat the planning document as a designed product:

- use a polished hero/header, readable rhythm, sticky or persistent navigation, and considered typography,
- make use cases, flow cards, traceability, and the completion contract scannable and visually calm,
- use subtle section dividers, anchors, and status labels so long documents remain navigable,
- avoid cramped grids of tiny screenshots,
- keep text readable at normal browser zoom.

The document shell does not need to mimic the application UI. It should be delightful for the reviewer. The mockup frames inside it must mimic the repo/product.

## Required Sections

### 1. Header

Include project name, feature name, source input summary, artifact status (`Draft`, `Interviewing`, or `Final`), last regenerated timestamp, and links to major sections.

### 2. Repo Styling Snapshot

Show:

- CSS/theme files inspected,
- extracted tokens,
- component patterns observed,
- styling basis explanation,
- fallback notes if variables were missing.

Prefer repo tokens:

```css
:root {
  --artifact-bg: var(--background, oklch(0.141 0.005 285.823));
  --artifact-text: var(--foreground, oklch(0.985 0 0));
  --artifact-card: var(--card, oklch(0.21 0.006 285.885));
  --artifact-border: var(--border, oklch(1 0 0 / 10%));
  --artifact-primary: var(--primary, oklch(0.768 0.233 130.85));
  --artifact-radius: var(--radius, 0.625rem);
}
```

### 3. Intent Summary

State what the user is trying to accomplish, who uses it, what problem it solves, what is out of scope, and what assumptions are currently in force.

### 4. Use Cases

Every use case must be a visible section:

```html
<section class="use-case" id="use-case-uc-01" data-ixc-contract="UC-01">
  <h2>UC-01: Builder reviews draw readiness</h2>
  <dl>
    <dt>Actor</dt><dd>Builder lead</dd>
    <dt>Preconditions</dt><dd>Build workspace exists.</dd>
    <dt>Trigger</dt><dd>User opens draw workspace.</dd>
    <dt>Happy Path</dt><dd>...</dd>
    <dt>Failure Path</dt><dd>...</dd>
    <dt>Outcome</dt><dd>...</dd>
  </dl>
</section>
```

### 5. Static Mockups

Represent screens like real app viewports, not cards or thumbnails. Each mocked screen must take the full viewport footprint:

```css
.mock-screen {
  width: 100vw;
  min-height: 100vh;
}
```

If the artifact content column is constrained, let mockups break out to full browser width with a full-bleed wrapper. The mockup may scroll internally only when the real screen would scroll.

Every referenced UI node needs `id` and `data-ixc-ref`.

Make mockups visually credible:

- use repo-derived typography, colors, border radius, density, and component vocabulary,
- show realistic labels, values, states, errors, and empty/disabled cases,
- show enough surrounding layout to understand the flow,
- avoid placeholder boxes when a concrete UI control can be mocked,
- preserve stable IDs across regeneration so annotations and contracts remain meaningful.

```html
<section id="mockups" data-ixc-contract="MOCKUPS">
  <div class="mock-flow" id="flow-draw-release-mockups" data-ixc-ref="FLOW-DRAW-RELEASE-MOCKUPS">
    <h1 id="flow-draw-release-start">Flow start: Admin release approval</h1>
    <article class="mock-screen" id="screen-workspace" data-ixc-ref="SCREEN-WORKSPACE">
      <h2>Build Workspace</h2>
      <button id="draw-release-approve-button" data-ixc-ref="UI-APPROVE-DRAW">
        Approve release
      </button>
    </article>
    <article class="mock-screen" id="screen-release-confirmation" data-ixc-ref="SCREEN-RELEASE-CONFIRMATION">
      <h2>Release confirmation</h2>
    </article>
    <h1 id="flow-draw-release-end">Flow end: Release recorded</h1>
  </div>
</section>
```

Interactive mocked nodes must have visible text or `aria-label`.

### Multi-Screen Flow Grouping

When a flow spans multiple components or screens, group the screens in a visible flow wrapper:

- start with an `h1` that names the flow and says it is the start,
- show each full-viewport screen in order,
- end with an `h1` that names the end state,
- keep a visible flow label or progress cue near each screen,
- make each screen independently addressable with `id` and `data-ixc-ref`.

Do not present multi-screen flows as three small cards in one row. That hides layout, density, hierarchy, and usability problems.

### 6. Flow Cards

Every flow step must be a visible card:

```html
<article class="flow-step" id="flow-01-step-03" data-ixc-step="FLOW-01-STEP-03">
  <h3>Step 3: Approve release</h3>
  <p>Target: <a href="#draw-release-approve-button">Approve release button</a></p>
  <dl>
    <dt>Trigger</dt><dd>Admin clicks approval.</dd>
    <dt>System Response</dt><dd>Release approval is recorded.</dd>
    <dt>Failure Behavior</dt><dd>Invalid amount is rejected.</dd>
    <dt>Validation Hook</dt><dd>VAL-03</dd>
  </dl>
</article>
```

Each `article[data-ixc-step]` must include at least one `href="#..."`, and every local target must resolve to an element ID.

### 7. Traceability

Show a visible mapping from use cases to UI refs, flow steps, requirements, constraints, success criteria, and validation. Use a real `<table>` when the mapping is dense.

### 8. Open Questions and Interview Log

Show unresolved questions, locked decisions, assumptions chosen by default, and annotation-derived revisions. Update this after each interview round or browser annotation batch.

### 9. Final `/goal` Plan

This must be the last section:

```html
<section id="goal-plan" data-ixc-contract="GOAL-PLAN">
```

Include:

- recommended `/goal` command,
- interaction patterns (`INT-*`),
- outcomes (`OUT-*`),
- constraints (`CON-*`),
- requirements (`REQ-*`),
- interfaces/contracts,
- implementation approach,
- edge cases and failure modes,
- success criteria (`SC-*`),
- explicit validation (`VAL-*`),
- completion contract (`CC-*`),
- assumptions and defaults.

The recommended command is not a feature summary. It is a handoff prompt for the implementation agent. It must preserve the utility of the HTML file by telling the agent how to process and use it.

Use this pattern:

```html
<pre id="recommended-goal-command" data-ixc-goal-command>/goal Implement the feature described in file:///Users/connor/.agent/plans/<project-slug>/<feature-slug>/index.html. Treat that HTML artifact as the authoritative PRD, implementation plan, traceability map, mockup spec, completion contract, and progress tracker. Read the artifact first. Implement every completion contract item by ID. Preserve links to constraints, interactions, mocked UI elements, flow steps, requirements, success criteria, and validation evidence. Track progress in the native goal system and update the HTML completion contract/progress notes as work advances. Run the artifact validator and all listed project validations before marking the goal complete.</pre>
```

The command should include the exact artifact path or file URL. Keep feature-specific scope in the HTML sections and completion contract; do not compress the whole plan into the `/goal` command.

## Completion Contract

Place the checklist inside the final `/goal` section:

```html
<div id="completion-contract">
```

Do not use another `<section>` inside `#goal-plan`; `#goal-plan` must remain the last section in the document.

## Completion Contract Item

Each checklist item must map all relevant categories:

```html
<li class="contract-item" id="cc-04" data-ixc-contract-item="CC-04">
  <label><input type="checkbox" disabled> CC-04: Implement draw release approval action.</label>
  <dl>
    <dt>Interactions</dt><dd><a href="#interaction-int-03">INT-03</a></dd>
    <dt>Mocked Elements</dt><dd><a href="#draw-release-approve-button">UI-APPROVE-DRAW</a></dd>
    <dt>Flow Steps</dt><dd><a href="#flow-02-step-04">FLOW-02-STEP-04</a></dd>
    <dt>Constraints</dt><dd>CON-01, CON-04</dd>
    <dt>Requirements</dt><dd>REQ-07</dd>
    <dt>Success Criteria</dt><dd>SC-03</dd>
    <dt>Validation</dt><dd>VAL-02, VAL-05</dd>
    <dt>Evidence Required</dt><dd>Passing e2e test, audit event assertion, screenshot of approval state.</dd>
  </dl>
</li>
```

## Final Checks

- Every `data-ixc-contract` section has an `id`.
- Every `data-ixc-ref` element has an `id`.
- Every interactive `data-ixc-ref` element has visible text or an `aria-label`.
- Every `data-ixc-step` article has an `id` and local target link.
- Every local `href="#..."` resolves.
- The `/goal` plan section is last.
- The completion contract block has `id="completion-contract"`.
- Every completion contract item includes interactions, constraints, requirements, success criteria, validation, evidence, and mocked UI or flow references.
