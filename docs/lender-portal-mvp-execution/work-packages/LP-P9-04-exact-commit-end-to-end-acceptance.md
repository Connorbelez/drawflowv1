# LP-P9-04 — Exact-commit end-to-end acceptance

Status: ready

Depends on: LP-P9-01, LP-P9-02, LP-P9-03

## Objective

Run every required multi-actor journey and selected-prototype acceptance against
the exact release commit and reconcile actual changed consumers with the
recorded blast-radius inventory.

## Ownership

Own test orchestration and acceptance evidence only. Use real participant
surfaces and canonical command/query boundaries. Failures reopen their owning
implementation packet.

## Traceability selectors

- LP-E2E-01..LP-E2E-10
- LP-TEST-01..LP-TEST-15
- LP-FINAL-01..LP-FINAL-07
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10
- LP-PROT-DASH
- LP-PROT-ORG
- LP-PROT-PROP
- LP-PROT-POLICY
- LP-PROT-ASSIGN
- LP-PROT-BUILD
- LP-PROT-MILESTONE-QUEUE
- LP-PROT-MILESTONE-SHEET
- LP-PROT-DRAW-QUEUE
- LP-PROT-DRAW-SHEET
- LP-PROT-BUILDER-MILESTONE

## Context pointers

Load all ten E2E definitions, testing decisions, final acceptance gate, selected
prototype contracts, all phase certifications, exact release diff, route and
process manifests, transition-consumer ledger, blast-radius inventory, and
candidate deployment provenance.

## Steps and completion criteria

1. Bind checkout, deployment, server, data fixture, user organizations/roles,
   and browser/runtime evidence to the exact candidate SHA.
2. Run E2E-01 through E2E-10 across real Back Office, Builder, lender, worker,
   and link-open boundaries. Completion criterion: every expected state,
   forbidden action, history effect, audit event, and notification result passes.
3. Run selected-prototype visual, interaction, responsive, and accessibility
   acceptance for every productionized contract.
4. Compare actual changed symbols, processes, routes, projections, events, and
   external consumers with the Phase 0 inventory. Completion criterion: every
   difference is investigated and accepted or rejects the release.
5. Attach immutable test output, screenshots where required, data provenance,
   and reviewer decisions to the candidate SHA.

## Required verification

- E2E-01 through E2E-10 on the exact release deployment
- Full relevant automated suite and production build
- All selected-prototype parity/accessibility evidence
- Blast-radius and transition-consumer reconciliation

## Completion gate

Complete only when all journeys and contracts pass on one exact commit, no
unplanned dependency remains, and evidence can be independently reproduced.
