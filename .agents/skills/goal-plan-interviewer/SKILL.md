---
name: goal-plan-interviewer
description: Interview-driven feature and PRD planning workflow that creates a repo-grounded HTML planning artifact with static UI mockups, visible user-flow sections, traceable HTML IDs/data attributes, and a final /goal-optimized implementation plan. Use when Codex needs to turn a feature idea, vague product request, or full PRD into an iterated visual plan with interaction patterns, outcomes, constraints, requirements, success criteria, explicit validation, and a completion contract mapped to mocked UI elements and flow steps.
---

# Goal Plan Interviewer

Create a living HTML planning artifact for a feature or PRD. Generate the first rough artifact immediately from the user's prompt, then ground it in the codebase, improve the static mockups, interview the user section by section through chat or browser annotations, regenerate after each round, and finish with a `/goal`-optimized implementation plan whose completion contract traces to real HTML nodes and flow steps.

## Non-Negotiables

- Treat the user's words as intent, not a locked literal spec. Preserve useful ambiguity until the interview resolves it.
- Generate the first HTML artifact immediately from the user's initial description or PRD. Do not wait for a full codebase scan before creating the first visible draft.
- Explore the codebase before asking questions that local files can answer, then regenerate the artifact with grounded styling and implementation context.
- Write artifacts to `~/.agent/plans/<project-slug>/<feature-slug>/index.html`.
- Treat the artifact as the primary deliverable and review surface. The user may review it through chat comments or through the Codex in-browser annotation tool.
- Open the artifact in a browser after each regeneration when browser tooling is available.
- Regenerate the full HTML file after each interview round; do not leave the artifact stale.
- Validate DOM traceability after every regeneration with `scripts/validate-ixc-artifact.mjs`.
- Keep asking focused interview batches until the artifact is decision-complete.
- Optimize for both visual fidelity and traceability. Do not sacrifice either: the mockup must look like a credible repo-native product surface and every referenced node must be contract-addressable.
- Always use `/impeccable` guidance whenever creating or revising mockups. If the runtime exposes the `impeccable-impeccable-ui` skill, read it before mockup work; if not, explicitly apply the same standard: distinctive, production-grade, repo-grounded UI design.
- Make each mocked app screen a full viewport frame (`100vw` by `100vh` or equivalent) so it reads like the real screen, not a thumbnail/card preview.
- Make the planning document itself beautiful and worth reviewing. The mockup frames must follow repo styling and CSS variables; the surrounding plan document may use a more delightful editorial presentation as long as it does not obscure traceability.
- When a flow spans multiple screens, wrap those full-screen mockups in a clearly labeled flow group with visible start/end headings.
- Treat `/gloal` as `/goal`.
- Make the final `/goal` plan the last visible section in the HTML artifact.
- The recommended `/goal` command must instruct the implementation agent to use the HTML artifact as the authoritative PRD, plan, traceability map, execution guide, and progress tracker. It must include the artifact path or file URL and must not collapse the artifact into a lossy feature summary.

## Workflow

### 1. Create the First Artifact Immediately

Accept a feature idea, brainstorm, PRD, pasted spec, issue text, or rough implementation request. Extract a first-pass model:

- project and feature names,
- actors and target users,
- desired outcomes,
- use cases,
- screens or surfaces implied,
- interactions and flow steps,
- constraints and requirements,
- success criteria and validation signals,
- unresolved decisions.

If the input is incoherent, infer the likely intent and continue. Immediately create a rough HTML artifact at `~/.agent/plans/<project-slug>/<feature-slug>/index.html` using best-effort sections, mockups, traceability, open questions, and a provisional `/goal` plan. Mark status as `Draft`.

Open the draft in the browser when possible. This first artifact is expected to be incomplete; it exists to make ambiguity visible.

### 2. Ground and Regenerate

After the first draft exists, inspect local truth before asking questions:

- repo instructions: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, README files,
- package/build/test configs,
- CSS/theme files,
- relevant routes, components, views, schemas, API contracts, and tests,
- product docs or PRDs already in the repo.

Use `rg --files` and targeted `rg` searches first. Read only files that constrain the plan.

For styling, find CSS/theme files such as `src/styles.css`, `app/globals.css`, `tailwind.config.*`, and design-system components. Extract `:root`, dark theme, semantic variables, typeface, radius, spacing, and component vocabulary. Inline the relevant tokens into the artifact CSS. If variables are absent, infer from component classes and document the fallback in the artifact.

Regenerate the artifact after grounding. Mark status as `Interviewing`. The regenerated mockups must use repo-derived styling and component vocabulary.
Use `/impeccable` for the mockup design pass before presenting the regenerated artifact.

### 3. Maintain the HTML Artifact

Read [references/html-artifact-template.md](references/html-artifact-template.md), then create `~/.agent/plans/<project-slug>/<feature-slug>/index.html`.

The artifact must be readable without devtools and must include:

- header and navigation,
- repo styling snapshot,
- intent summary,
- visible use case sections,
- static Figma-like screen mockups,
- visible flow cards,
- traceability mapping,
- open questions and interview log,
- final `/goal` plan section.

Every use case must be a visible section:

```html
<section data-ixc-contract="UC-01" id="use-case-uc-01">
```

Every mocked UI node referenced by any contract must have an `id` and `data-ixc-ref`. Interactive mocked nodes must have visible text or an accessible name:

```html
<button id="draw-release-approve-button" data-ixc-ref="UI-APPROVE-DRAW">
  Approve release
</button>
```

Every flow step must be a visible card with at least one local link to a target UI node:

```html
<article data-ixc-step="FLOW-01-STEP-03" id="flow-01-step-03">
  <a href="#draw-release-approve-button">Approve release button</a>
</article>
```

The final section must be:

```html
<section id="goal-plan" data-ixc-contract="GOAL-PLAN">
```

The recommended command inside that section must be a goal handoff prompt that points to this exact HTML artifact:

```html
<pre id="recommended-goal-command" data-ixc-goal-command>/goal Implement the feature described in file:///Users/.../index.html. Treat that HTML artifact as the authoritative PRD, implementation plan, traceability map, mockup spec, completion contract, and progress tracker. Read it first, implement each completion contract item by its IDs, keep traceability to mocked elements and flow steps, update native goal progress and the artifact's completion contract as work advances, and run the artifact validator plus project validations before completion.</pre>
```

### 4. Validate and Open

Run:

```bash
node /Users/connor/.agents/skills/goal-plan-interviewer/scripts/validate-ixc-artifact.mjs ~/.agent/plans/<project-slug>/<feature-slug>/index.html
```

Fix structural issues before asking the user to review the artifact. Open the file in a browser when possible and verify:

- the page is readable,
- mockups fit or scroll cleanly,
- use case and flow links jump to targets,
- the final `/goal` plan is last,
- the completion contract is visible and traceable.

### 5. Interview in Batches

Read [references/interview-rubric.md](references/interview-rubric.md). Ask 1-3 high-impact questions per round. Interview one coherent section at a time:

- intent and outcomes,
- use cases,
- mocked screens,
- flow steps,
- constraints,
- requirements,
- validation,
- completion contract.

Accept feedback either as text in chat or as browser annotations against the artifact. Translate annotations into concrete changes to the relevant use case, mockup node, flow card, requirement, constraint, validation item, or completion contract item.

Do not ask questions that codebase inspection can answer. After each answer or annotation batch, regenerate the full artifact and rerun validation.

### 6. Finish Decision-Complete

Continue until the user can approve the artifact as the primary planning deliverable and another implementation agent could build without guessing what UI element, flow step, requirement, or validation item is meant. The final artifact's last section must include:

- recommended `/goal` command,
- interaction patterns,
- outcomes,
- constraints,
- requirements,
- interfaces/contracts,
- implementation approach,
- edge cases,
- success criteria,
- explicit validation,
- completion contract,
- assumptions and defaults.

The completion contract must be a checklist. Every checkbox must map to constraint IDs, interaction IDs, mocked UI refs or flow steps, requirement IDs, success criteria IDs, validation IDs, and evidence required.
Place it inside a visible `id="completion-contract"` block within the final `#goal-plan` section.

## Resources

- [references/html-artifact-template.md](references/html-artifact-template.md): Required HTML structure and traceability conventions.
- [references/interview-rubric.md](references/interview-rubric.md): Question batching and decision-completeness checks.
- [scripts/validate-ixc-artifact.mjs](scripts/validate-ixc-artifact.mjs): Structural validator for generated artifacts.
