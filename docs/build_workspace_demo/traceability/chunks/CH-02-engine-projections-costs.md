# CH-02: Engine Projections Costs

## Purpose

Engine Projections Costs is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 544-650: Dependency, blocker, and recompute semantics.
- interactionSpec 651-741: Interest, fee, payoff, and bottom summary formulas.
- interactionSpec 742-804: Active-only rollover and capital shock guardrail.
- interactionSpec 4481-4533: Required query projection shape and derived fields.
- implementationCompanion 1573-1600: Projection coverage expectations.

## Companion References

- None

## Interaction Contracts

No primary interaction contracts in this chunk.

## Target Files Or Areas

**Convex files**
- convex/demo_drawflow/engine.ts
- convex/demo_drawflow/projections.ts
- convex/demo_drawflow/money.ts
- convex/demo_drawflow/dateMath.ts
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

- Engine helpers are deterministic and do not use the real current date.
- Projection contains derived blockers/capabilities; UI does not reconstruct raw domain rules.
- Cost formula uses daily compounding and rounded cents at persistence/display boundary.
- Rollover buffer cannot overfund project or violate max-cash-on-hand guardrail.
## Known Risks

- Duplicating domain rules in React would fracture source of truth.
- Using real dates will make tests unstable.
