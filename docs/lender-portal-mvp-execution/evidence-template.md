# Lender Portal MVP work-package evidence

## Identity

- Work package:
- Phase handoff:
- Requirement selectors:
- Upstream certification SHAs:
- Provisional Phase 1 candidate:
- Accepted Phase 1 SHA:
- Provisional-to-accepted baseline reconciliation:
- Base SHA:
- Accepted SHA:
- Branch:
- Implementer:
- Independent verifier:
- Verified at:
- Evidence status: `implementation-complete` or `verified`
- Human acceptance override: `accepted` or `approved` when applicable

## Canonical ownership

- Existing owners extended:
- New owners introduced and why:
- Parallel models checked:

## Change proof

- Changed files:
- State transitions affected:
- Participant surfaces affected:
- Projection and consumer effects:
- Audit effects:
- Notification effects:
- Attachment or document-access effects:
- Prototype contract, if applicable:
- Rollback and escalation effects:

## Automated verification

| Command | Result | Requirement IDs |
|---|---|---|
|  |  |  |

## Multi-actor and browser verification

| Journey or scenario | Actors | Result | Evidence location |
|---|---|---|---|
|  |  |  |  |

- Production acceptance contract SHA-256:
- Signed production attestation durable URL:
- Clean immutable checkout HEAD and Git tree:
- Deployed commit and release-artifact SHA-256:
- Trusted production URL and deployment ID:
- Source-owned trust-root release-key ID/fingerprint, repository/workflow,
  signer-digest, and Ed25519 signature verification:
- Source-owned independent reviewer identity/key fingerprint, disjoint-key, and
  canonical reviewer-statement verification:
- Initial URL, every redirect hop, and final effective GitHub Release artifact
  URL, commit/tree/release bindings, and verified SHA-256 values:
- Typed `LP-E2E-01..LP-E2E-10` registered command, exact assertion,
  production-consumer, observable-result, raw runner-report digest, and unique artifact mappings complete:
- Typed `LP-VSG-01..LP-VSG-10` registered command, exact assertion,
  production-consumer, observable-result, raw runner-report digest, and unique artifact mappings complete:
- Runner executable fingerprint/version, exact invocation, test identifier,
  pass status, execution timestamps, commit/tree, and deployment binding complete:
- Fresh GitHub Actions artifact-attestation bundle verified for every machine
  report, browser manifest/trace, provider/inbox receipt, operational raw
  result, and release-bundle manifest against the pinned repository, exact
  workflow, signer digest, OIDC issuer, candidate source digest, and release ID:
- Per-mapping authenticated production-browser observation and durable trace
  complete, with unique run/session IDs, actor identity/role, deployed origin,
  ordered observed steps/results, pinned and attested Playwright runner, parsed
  trace events/network stream, ZIP central-directory/local-record/CRC checks,
  unique ordered trace call IDs with matching before/after operation identity,
  DOM-read observable result, successful route
  document request with run/mapping/session headers, one active production-host
  `wos-session` cookie, matching request-cookie/session digest, source-owned
  subject/organization/role response correlation, and trace-byte attestation
  (local jsdom/mock tests are not production E2E evidence):
- Dashboard, Build Detail, Milestone queue, and Draw queue production-route mappings complete:
- Gate-specific authenticated browser, focus/status, responsive/zoom/screen-reader,
  provider/webhook, inbox/link, and exact-release raw result artifacts complete,
  including mapping-specific authenticated WorkOS/Resend readback, provider
  account/tenant, status/identifier/recipient/route/deployment semantics,
  timestamp bounds, raw-response digest, uniqueness checks, and direct
  source-owned tenant/organization/role/subject/recipient plus
  notification-assignment identity correlation in each receipt and readback;
  WorkOS and Resend readback URLs address the exact webhook-event and message
  record IDs:
- Parsed CI-attested release-bundle provenance, pinned Bun identity, exact build
  command, build-finished-before-deployment ordering, safe relative artifact
  paths, and shipped output digests:
- Clean Git HEAD/tree recheck after remote evidence resolution, stable no-follow
  repository reads, and immutable protected CI checkout/artifact identity:

## Negative proof

- Forbidden tenant and organization cases:
- Stale, duplicate, terminal, and out-of-order cases:
- Privacy checks:
- Idempotency checks:

## Independent acceptance

- Source requirements inspected:
- Diff inspected at accepted SHA:
- Automated evidence rerun or independently checked:
- Distinct durable independent-review artifact URI/ID/SHA-256, pinned reviewer
  identity/key, and canonical-statement signature:
- Prototype parity accepted:
- Unplanned dependencies:
- Decision: `implementation-complete`, `accepted`, or `rejected`
- Rejection reasons, if any:
