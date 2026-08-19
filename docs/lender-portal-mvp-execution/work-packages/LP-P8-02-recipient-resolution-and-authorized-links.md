# LP-P8-02 — Recipient resolution and authorized links

Status: ready

Depends on: LP-P1-05, LP-P8-01

## Objective

Resolve recipients from current WorkOS membership, resource access, assignment,
cycle, and policy requirements, and generate private-data-safe links that are
re-authorized on open.

## Ownership

Reuse canonical WorkOS projections, resource authorization, assignment,
request-cycle, policy evaluator, route manifest, and notification owners. Do
not introduce per-record user assignment as a recipient source.

## Traceability selectors

- LP-NOTIF-01..LP-NOTIF-04
- LP-AC-PORTAL-04
- LP-US-079..LP-US-084
- LP-US-086
- LP-E2E-02..LP-E2E-06
- LP-E2E-08
- LP-QG-01..LP-QG-09

## Context pointers

Load feature brief Notification Triggers, recipient matrix, permissions, and
portal acceptance; spec User Stories 79–86; implementation plan Phase 8; Phase
1 membership effects; and canonical membership, assignment, policy, resource
authorization, route, projection, and notification owners.

## Steps and completion criteria

1. Define recipient resolvers per confirmed event. Completion criterion:
   current eligible users are derived from canonical organization membership
   and resource access with deterministic reasons.
2. Handle membership, withdrawal, and cycle changes. Completion criterion:
   inactive, withdrawn, foreign, stale-cycle, and no-longer-required recipients
   are excluded at send time.
3. Build privacy-safe payloads and route links. Completion criterion: content
   omits unauthorized reviewer identity/private rationale and links contain no
   authority-bearing secret beyond normal session navigation.
4. Re-authorize on link open. Completion criterion: possession of an email URL
   never bypasses current server authorization.

## Required verification

- Recipient eligibility and membership-change matrix tests
- Payload field-absence and link-open authorization tests
- Relevant multi-actor recipient journey evidence

## Completion gate

Complete only when every recipient is currently eligible, every payload is
permission-shaped, and every link fails closed when access changes.
