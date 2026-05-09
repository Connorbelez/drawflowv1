# CH-00: Preflight Repo Context

## Purpose

Preflight Repo Context is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- prd 12-25: Product truth: DrawFlow is construction draw-management, not generic project management.
- implementationCompanion 19-91: Non-negotiable persistence, naming, selector, and no-fake-affordance rules.
- mockup n/a: Mockup metadata and visual target.
- repo n/a: Current starter-shell, Convex, generated-file, and test infrastructure facts.

## Companion References

- None

## Interaction Contracts

No primary interaction contracts in this chunk.

## Target Files Or Areas

**Convex files**
- None
**Route files**
- None
**Test files**
- None
**Components / UI areas**
- None

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- No direct IC tests; verify via downstream chunks and final coverage gates.

## Acceptance Gates

- Record Bun as package manager/runtime.
- Record missing convex/_generated/ai/guidelines.md as a later implementation preflight finding.
- Record absence of Playwright config and current starter shell routes.
- Record mockup dimensions 1995x1106.
## Known Risks

- Later agents may skip Convex guideline preflight if this is not highlighted.
- Playwright setup absence can be mistaken for a passing omission.
