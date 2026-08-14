# LP-P1-04 visual and interaction verification

Verification date: 2026-08-14  
Implementation baseline: `810d39f9`  
Candidate: pending final Phase 1 review commit

## Locked target

- Accepted route: `/lender/organization-management-prototype?variant=E`
- Promoted route: `/lender/organization`
- Desktop viewport: 1440 × 1000 CSS pixels
- Narrow viewport: 390 × 844 CSS pixels

The accepted composition contains the lender shell, directory-first heading,
three-part organization summary, directory toolbar, status filters, canonical
Back Office table, member detail sheet, four member tabs, staged operation
dialogs, membership context, and policy boundary.

## Artifact ledger

All screenshots remain outside the repository:

| Artifact | Path | Result |
|---|---|---|
| Pre-extraction Variant E baseline | `/tmp/lender-org-variant-e-baseline-1440.png` | Captured from detached `810d39f9` baseline. |
| Extracted Variant E desktop | `/tmp/lender-org-variant-e-1440.png` | Exact match to baseline. |
| Extracted Variant E narrow | `/tmp/lender-org-variant-e-390.png` | Toolbar, filters, table overflow, and stacked summary remain usable. |
| Pixel diff | `/tmp/lender-org-variant-e-diff.png` | Empty diff. |
| Production fail-closed state | `/tmp/lender-org-production-forbidden-1440.png` | Signed-in user without a supported projected lender role receives the route-scoped restricted state; no organization rows are exposed. |

## Numeric comparison

`compare_reference.py` compared the 1778 × 1234 full-page baseline and
extracted-prototype images without resizing:

- MAE: `0.0`
- RMSE: `0.0`
- p95 channel delta: `0.0`
- SSIM global luma: `1.0`
- exact pixels: `100%`
- pixels over delta 15: `0%`

Result: strict pass.

## Mismatch ledger

No prototype composition, spacing, typography, color, table, summary, toolbar,
or policy-boundary mismatch remains after extraction. Production intentionally
replaces prototype-only evidence labels and no-write copy with canonical WorkOS
projection and command-state copy while preserving the locked hierarchy.

## Interaction evidence

- Search filters the canonical `UserManagementDirectoryTable` rows.
- All, Active, Pending, and Deactivated filters expose pressed state and counts.
- Invite member opens the staged Draft → Review command flow.
- Member selection uses the shared `UserDetailSheet`.
- Access, Administration, Review relationship, and History tabs remain present.
- Access change requires at least one canonical role.
- Deactivation requires a ten-character audit reason and explicit history
  acknowledgement.
- Principal Broker role removal or deactivation is blocked; the protected
  transfer flow requires an eligible active replacement and reason.
- Production command status is announced through an atomic polite live region.
- Route guards reject Broker, missing-organization, and unauthenticated direct
  URLs before the organization query, while the Convex read boundary repeats
  active-organization authorization server-side.

The user explicitly deferred the independent visual critique and acceptance
gate until the consolidated Phase 1 review. This file records implementation
evidence only and does not mark LP-P1-04 verified.
