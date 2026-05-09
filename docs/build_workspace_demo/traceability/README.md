# Build Workspace Traceability Dossier

This dossier chunks the large Build Workspace specs into compact work packets for later implementation agents. It does not implement the demo.

## Authoritative Sources

- `docs/build_workspace_demo/Drawflow Demo Interaction Spec.md`
- `docs/build_workspace_demo/Drawflow Demo Implementation Companion.md`
- `docs/build_workspace_demo/build_workspace_mockup.png`
- `docs/draw_flow_prd.md`

The generated artifacts are navigational aids. If generated text conflicts with the source specs, use the source specs and update this dossier.

## How To Use

1. Read `PREFLIGHT_FINDINGS.md`.
2. Read `CHUNK_MANIFEST.md`.
3. Pick one chunk from `chunks/`.
4. Read only the source ranges listed by that chunk before implementing.
5. Use `CONTRACT_TRACEABILITY_MATRIX.md` and `COVERAGE_SEED.md` to keep tests and coverage aligned.
6. Use JSON under `manifests/` for scripted checks.

## Verifier Counts

Expected counts captured by this dossier:

- 44 interaction contracts total.
- 26 active interaction contracts.
- 18 proposal interaction contracts.
- 14 final Round 6 demo tables.
- 31 component manifest entries.
- 3 route files.
- 11 Convex module files.
- 7 test files.

## Files

- `SOURCE_INDEX.md` and `manifests/source-index.json`: source files, hashes, line counts, heading ranges.
- `CHUNK_MANIFEST.md` and `manifests/chunk-manifest.json`: grouped execution packets.
- `CONTRACT_TRACEABILITY_MATRIX.md` and `manifests/contract-traceability.json`: every IC mapped to source lines, chunk, tests, Convex, audit, and outbox expectations.
- `COVERAGE_SEED.md` and `manifests/coverage-seed.json`: planned coverage matrix seed.
- `manifests/companion-map.json`: named companion component/route/Convex/test references.
- `chunks/*.md`: implementation packet handoffs.
