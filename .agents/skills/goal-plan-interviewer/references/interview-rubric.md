# Interview Rubric

Use this rubric to decide what to ask, how to apply chat or browser annotation feedback, when to regenerate the artifact, and when the plan is complete.

## Artifact-First Loop

Create the first artifact immediately from the user's prompt. Do not wait for a full interview or codebase scan. The first draft should make uncertainty visible with provisional mockups, open questions, assumptions, and a provisional `/goal` plan.

After the first artifact exists:

1. Ground it in the codebase and regenerate.
2. Open it in the browser when possible.
3. Collect feedback through chat or browser annotations.
4. Regenerate the full artifact after each feedback batch.
5. Validate structure after every regeneration.

## Ask Only High-Impact Questions

Ask 1-3 questions per round. A question must do at least one of these:

- choose between meaningful product or implementation tradeoffs,
- confirm a risky assumption,
- define success or failure behavior,
- choose a target actor, surface, or flow,
- resolve a conflict between the PRD and codebase reality,
- make validation concrete.

Do not ask questions the repository can answer. Inspect files first, then ask only about intent, product tradeoffs, or validation choices that remain ambiguous.

## Recommended Interview Order

1. **Intent and outcomes**: user, problem, desired result, non-goals.
2. **Use cases**: actors, preconditions, triggers, happy path, failure path.
3. **Mocked screens**: visible surfaces, full-viewport layout, states, user-facing labels, visual fidelity, repo styling alignment, `/impeccable` quality.
4. **Flow steps**: step order, target elements, system responses, failures.
5. **Constraints**: product, domain, technical, accessibility, data, permissions, performance.
6. **Requirements**: testable functional and non-functional requirements.
7. **Validation**: commands, tests, screenshots, audit checks, DOM checks, manual verification.
8. **Completion contract**: checkbox traceability and evidence.

Regenerate the artifact after every round or browser annotation batch that changes any section.

## Decision-Complete Criteria

The artifact is decision-complete only when:

- each use case has actor, trigger, path, failure behavior, and outcome,
- each mocked screen has all referenced UI nodes with `id` and `data-ixc-ref`,
- each mocked app screen is full viewport size rather than a thumbnail/card,
- multi-screen flows have visible start/end headings and clear grouping,
- mocked screens are visually credible enough to remove UI ambiguity and satisfy `/impeccable` quality expectations,
- the surrounding plan document is beautiful, readable, and pleasant to review,
- each flow step links to its target element,
- each requirement is testable,
- each constraint has implementation impact,
- validation has exact commands, tests, screenshots, DOM checks, or manual evidence,
- the completion contract maps every checkbox to constraints, interactions, UI refs or flow steps, requirements, success criteria, validation, and evidence.

## Default Assumptions

If the user does not answer a non-blocking preference, choose the option that is:

- most consistent with existing repo patterns,
- easiest to validate explicitly,
- least risky for domain rules,
- least surprising to the target user.

Record the default in the artifact's assumptions section.
