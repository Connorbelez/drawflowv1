# CH-01: Domain Seed Schema

## Purpose

Domain Seed Schema is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 16-254: Runtime, mode, role, evidence, audit, and forbidden-shortcut decisions.
- interactionSpec 255-543: Canonical milestone catalog, active/proposal seed state, draw grouping, and happy path.
- interactionSpec 3567-4796: Final Convex schema, function, seed, and guardrail contract.
- implementationCompanion 1110-1188: Companion Convex file split.

## Companion References

- None

## Interaction Contracts

No primary interaction contracts in this chunk.

## Target Files Or Areas

**Convex files**
- convex/schema.ts
- convex/demo_drawflow/domain.ts
- convex/demo_drawflow/seedData.ts
- convex/demo_drawflow/seed.ts
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

- All final Round 6 demo tables are represented; do not include superseded demo_buildScenarios as a required table.
- All public demo Convex functions use demo_ prefix.
- Seed/reset is idempotent and deterministic with DEMO_TODAY = 2026-05-08.
- All monetary persistence uses integer cents.
## Known Risks

- Schema drift is likely if early section 6 is treated as newer than Round 6.
- Seed data is large; later implementation should keep it deterministic and explicit.
