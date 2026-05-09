# DrawFlow Workspace UI Interaction Postmortem

Date: 2026-05-09  
Scope: DrawFlow Build Workspace remediation interaction  
Primary failure: repeated misunderstanding of the intended three-pane workspace layout:

`| Rich collapsible milestone column | Original Kibo GanttSidebar | Gantt board |`

## Incident Summary

The assistant implemented a broad DrawFlow workspace remediation but failed a core visual/layout requirement: preserving the existing rich milestone column while also restoring the original Kibo `GanttSidebar` as a separate middle pane beside the Gantt board.

The assistant repeatedly conflated three distinct UI concepts:

- the custom rich milestone-card column,
- the original Kibo `GanttSidebar`,
- the right-side Gantt timeline board.

The assistant then used TypeScript/build/test success as a proxy for correctness instead of visually validating the layout against the screenshots. The result was several rounds of user correction, frustration, and wasted implementation time.

## Timeline

1. Initial request: user asked for a large remediation plan covering warning UX, milestone reordering, proposal compilation, Gantt density, collapsible milestone column, draw eligibility, traceability, tests, docs, and verification.

2. Initial implementation: assistant changed many frontend, Convex, test, and documentation files and claimed completion after codegen, typecheck, tests, build, and e2e.

3. First correction: user clarified that the previous rich milestone column should have been preserved and only made collapsible. The original Kibo Gantt sidebar should be used for Gantt row sizing. Assistant treated this mostly as a styling/row-height issue.

4. Second correction: user explicitly stated the intended layout:

   `| Milestone column | Gantt sidebar | Gantt board |`

   Assistant split the layout into three columns but still reused sidebar identity and sizing concepts incorrectly.

5. Third correction: user pointed out that the middle sidebar still contained content and controls from the rich milestone column. Assistant finally identified that both panes were sharing the same sidebar role/width model and added separate leading-sidebar and Kibo-sidebar concepts.

6. Fourth correction: user clarified that the left rich milestone column must be independently scrollable and must not control Gantt row/card height. Assistant adjusted row height and scroll behavior.

7. Postmortem request: user asked for this failure analysis, including assistant failures and user prompting factors.

## What Failed

The assistant failed to maintain a correct component ownership model before editing.

The intended ownership was:

- Rich milestone column: custom DrawFlow milestone cards, left pane, collapsible, independently scrollable.
- Kibo `GanttSidebar`: original compact Gantt row sidebar, middle pane, controls row height for the Gantt board.
- Gantt board: right pane, compact bars/timeline aligned to Kibo sidebar rows.

Instead, the assistant initially treated "milestone column," "milestone rail," "Gantt sidebar," and "Gantt cards" as interchangeable layout concepts.

The assistant also failed to preserve a known-good UI element. The instruction was not to redesign the rich milestone column, but to keep it and add collapse behavior. The assistant modified or replaced too much surface area before confirming the visual structure.

The assistant over-relied on non-visual verification. Build success, tests, and e2e passing did not prove that the UI matched the screenshots or layout intent.

The assistant did not pause after the first visual correction to restate the target layout and get confirmation before coding again.

## Root Causes

1. No visual contract before implementation

   The assistant did not convert the user's intent into a concrete layout contract before coding. A contract should have named panes, ownership, widths, scroll behavior, row-height source, and forbidden changes.

2. Ambiguous vocabulary was not normalized

   Terms like "milestone rail," "milestone column," "Gantt sidebar," "Gantt card," "timeline bar," and "rail height" were overloaded. The assistant should have created a glossary from the codebase and user screenshots before editing.

3. Excessive scope masked the critical UI requirement

   The initial remediation plan combined backend state, Convex mutations, audit events, warning UX, drag-and-drop, traceability, tests, docs, and visual changes. The assistant completed many tasks but missed the layout requirement that mattered most to the user.

4. Component identity was inferred from implementation instead of product intent

   The assistant looked at layout mechanics but did not first answer: "Which visible region is this component supposed to own?" This led to shared identifiers, shared width variables, and pane behavior crossing boundaries.

5. Verification was incomplete

   The assistant ran build and tests, but did not capture screenshots, compare against the supplied reference, or inspect whether the three visual panes appeared correctly.

6. Corrections triggered more coding instead of reconfirmation

   After the first correction, the assistant should have stopped and restated the exact three-pane target. It instead kept patching the current interpretation.

7. Goal completion was premature

   The assistant marked the broad goal complete even though the highest-risk visual requirement had not been visually verified.

## User Prompting Factors

The user's frustration was justified, but some prompt structure contributed to the failure risk.

The initial request was very large. It asked for backend behavior, UI behavior, docs, tests, and visual redesign in one pass. That encouraged the assistant to optimize for breadth and checklist completion instead of isolating the visual dependency.

The initial wording included overlapping terms. "Milestone column," "milestone rail," "Gantt sidebar," "Gantt cards," and "timeline bars" had distinct meanings in the user's mind but were easy to confuse without a layout diagram.

The desired three-pane layout was not written explicitly until after the first incorrect implementation. The later ASCII layout was decisive and should have appeared before coding:

`| Collapsible rich milestone column | Original Kibo GanttSidebar | Gantt board |`

The screenshots were necessary and helpful, but they arrived after the assistant had already made a wrong structural assumption.

The user could have listed forbidden changes upfront:

- Do not replace the existing rich milestone list.
- Do not merge the rich milestone column with the Kibo sidebar.
- Do not let rich milestone-card height determine Gantt row height.
- Do not claim completion without screenshot verification.

High-emotion corrections were understandable after repeated misses, but they increased the need for the assistant to slow down and confirm, not continue patching reactively.

## Preventive Engineering And Process Changes

1. Require a layout contract for screenshot-driven UI work before editing.

   For this task, the contract should have been:

   `| Rich milestone column | Kibo GanttSidebar | Gantt board |`

   With explicit notes:

   - Rich milestone column is DrawFlow-specific and collapsible.
   - Kibo `GanttSidebar` remains original and compact.
   - Gantt board aligns to Kibo rows.
   - Left rich column scrolls independently.
   - Left rich column does not determine timeline row height.

2. Create a component ownership map before touching code.

   Required questions:

   - Which component renders the rich milestone column?
   - Which component renders the original Kibo sidebar?
   - Which component owns row height?
   - Which component owns timeline bars?
   - Which CSS variables or data attributes identify each pane?

3. Separate visual remediation from backend remediation.

   For broad tasks, implement in phases:

   - Phase 1: lock visual layout and screenshot verification.
   - Phase 2: behavior and data wiring.
   - Phase 3: tests/docs/traceability.

4. Treat screenshots as acceptance tests.

   A build passing is insufficient. The assistant must open the local app, capture screenshots at relevant viewports, and compare against the reference before claiming completion.

5. Add negative requirements to the implementation checklist.

   The checklist should include what must not change, especially when preserving an existing UI region.

6. Do not mark broad UI goals complete without visual evidence.

   Completion should require at least one screenshot or explicit visual inspection statement tied to the requested layout.

7. Use distinct naming for distinct panes.

   Avoid generic names like `sidebar` when multiple sidebars exist. Prefer:

   - `leadingMilestoneRail`
   - `kiboGanttSidebar`
   - `timelineBoard`

## Prompting Improvements For Future UI Work

For visual/layout requests, the user should provide these upfront when possible:

- A one-line pane diagram.
- The source of truth screenshot.
- The current broken screenshot, if applicable.
- A list of preserved elements.
- A list of forbidden changes.
- The component names or file paths if known.
- The required verification method.

Example prompt improvement:

> Target layout:
>
> `| Collapsible rich DrawFlow milestone column | Original Kibo GanttSidebar | Gantt board |`
>
> Preserve the existing rich milestone cards exactly except for collapse behavior. Pull the middle sidebar directly from `src/components/kibo-ui/gantt`. The Kibo sidebar, not the rich milestone cards, controls Gantt row height. The left rich column must scroll independently. Do not claim completion until you show a screenshot of the local app matching this structure.

## Future-Agent Checklist For Screenshot-Driven Layout Tasks

Before coding:

- Identify every visible pane in the screenshot.
- Name the component responsible for each pane.
- Identify which pane owns sizing, row height, scroll, and alignment.
- Write down preserved UI elements.
- Write down forbidden changes.
- Confirm ambiguous vocabulary with the user.
- State the expected final layout in ASCII.
- If the user supplied a screenshot, treat it as an acceptance target.

During coding:

- Keep pane identifiers distinct.
- Avoid sharing CSS variables between visually distinct panes unless intentional.
- Do not reuse `data-*` roles across different panes.
- Preserve existing components when the request says "only make it collapsible" or equivalent.
- Keep layout changes separate from data/model changes when possible.

Before completion:

- Run required build/test commands.
- Open the app locally.
- Capture screenshot verification at the requested viewport.
- Check that each pane appears in the correct order.
- Check that scroll behavior matches the request.
- Check that row height is controlled by the intended component.
- Report visual verification separately from build/test verification.

## Before-Coding Confirmation Template

Use this when a visual/layout request has ambiguous pane names or screenshot references.

## Proposed Visual Contract

I understand the target layout as:

`| [Pane 1 name] | [Pane 2 name] | [Pane 3 name] |`

Pane ownership:

- Pane 1: `[component/file]`
  - Purpose:
  - Width/collapse behavior:
  - Scroll behavior:
  - Must preserve:

- Pane 2: `[component/file]`
  - Purpose:
  - Width/row-height behavior:
  - Scroll behavior:
  - Must preserve:

- Pane 3: `[component/file]`
  - Purpose:
  - Alignment source:
  - Must preserve:

Forbidden changes:

- Do not:
- Do not:
- Do not:

Verification I will perform before claiming completion:

- Build/typecheck/tests:
- Local screenshot viewport(s):
- Specific visual checks:

Please confirm this is correct before I edit.

## Final Recommendation

For this repo, adopt a mandatory "visual contract before coding" rule for Build Workspace layout work. DrawFlow's workspace has product-specific panes whose names overlap with generic Gantt component names. Future agents should not touch this surface until they have mapped rich DrawFlow milestone rail, Kibo Gantt sidebar, and Gantt board ownership separately and committed to screenshot-based verification.
