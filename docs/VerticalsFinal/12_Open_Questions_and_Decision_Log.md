# DrawFlow Open Questions and Decision Log

## Locked decisions

| Decision | Status |
|---|---|
| Offline sync | Included for site visit workflows; full offline editing of the Build Workspace remains out of scope. |
| Geofencing | Required for completion proof uploads.  Evidence assets must record geofence verification status and capture coordinates when available; unverified evidence is accepted but flagged. |
| Verification model | Evidence-first, site visit discretionary. |
| Completion proof | Required for milestone completion claim. |
| Completion approval vs draw release | Decoupled. |
| Reimbursement basis | Approved milestone value. |
| Cost evidence | Not required for v1. |
| Overruns | Not reimbursed in v1; outside DrawFlow workflow. |
| Under-budget/lower draw | Builder can request lower draw amount; in MVP. |
| Financial authority | DrawFlow is workflow/CRM, not ledger/payment source of truth. |
| Fees | Not capitalized; do not compound. |
| Interest | Planning estimate only; compounds. |
| Timeline | Approved baseline separated from active forecast/actual. |
| Proposal Gantt drag | Allowed for draft planned dates. |
| Active Gantt mutation | Updates forecast/actual, not approved baseline. |
| Site visits | Discretionary/evidence-first by default. |
| MIC portal API | Required; read-only workspace projection. |
| Webhooks | Required; outbox/event-driven. |
| Chat | Convenience only; not workflow state. |
| White-label | Deferred. |
| Contractor registry/analytics | Deferred/stretch only. |

---

## Remaining open questions

### Interest and fees

1. Should compound interest be daily or monthly?
2. Should day-count basis be Actual/365 or Actual/360?
3. Does interest accrue from release date or day after release?
4. Is configured takeout/payoff date required, or can expected completion date always be fallback?
5. How are draw fees operationally paid or charged if not capitalized?
6. Should builder-facing UI show draw fees, interest estimates, both, or role-dependent visibility?

Recommended default:

```text
Daily compounding, Actual/365, configured takeout date preferred, fallback expected completion date, release-date accrual, fees shown separately and not capitalized.
```

### Verification authority

7. Which roles may verify milestone completion?
8. Is lender admin always allowed to verify directly?
9. Can lender verifier make final approval, or only recommendation, for all tenants?
10. Which roles may request site visits?
11. Which roles may waive a requested/required site visit?

Recommended default:

```text
Lender admin can verify. Lender verifier can verify if granted completion_claim.verify. Site visit waiver requires permission and reason.
```

### Site visit policy

12. Are any milestone categories policy-required for site visit at launch?
13. Should first draw or final draw require site visit?
14. Should high-value milestones require site visit above threshold?
15. Should MIC portal see site visit reports?

Recommended default:

```text
No required site visits at launch unless stakeholder demands it. Evidence-first discretionary. Site visit reports hidden from MIC unless marked portal-visible.
```

### Reimbursement / lower draw

16. Does builder request lower draw during completion claim, draw release, or both?
17. Can admin reduce the approved release below builder requested amount?
18. If builder requests lower amount, does the unrequested approved balance remain available later or become waived?
19. Can a builder later request remaining approved amount for the same completed milestone?

Recommended default:

```text
Capture requested lower amount at completion claim. Admin may approve lower with reason. Remaining approved amount handling needs stakeholder decision; simplest MVP treats lower request as the eligible amount for that claim/draw group and does not automatically preserve later balance unless a manual revision/adjustment exists.
```

This is one of the highest-impact open questions because it affects accounting semantics, UI copy, and draw group eligibility.

### Revisions and corrections

20. How much material revision workflow is needed in v1?
21. Can dependencies change after activation?
22. Can draw group membership change after activation?
23. Can a completed milestone be reopened?
24. Can a recorded draw release be corrected by superseding record only?
25. Should forecast changes require reason/comment?

Recommended default:

```text
Forecast changes allowed. Approved baseline immutable. Money/dependency/draw-group changes require admin-only revision or are deferred. Corrections require reason and audit event.
```

### MIC portal visibility

26. Can MIC users see unapproved completion claims?
27. Can MIC users see rejected evidence?
28. Can MIC users see internal reviewer/admin notes?
29. Can MIC users see financial amounts, fees, and interest estimates?
30. Should asset access be proxied through DrawFlow or direct signed URLs?

Recommended default:

```text
MIC sees approved/status summary and portal-visible evidence only. No internal notes and no rejected/raw evidence by default. Use short-lived signed URLs through DrawFlow authorization endpoint.
```

### Policy admin

31. Is there any self-serve policy UI in MVP?
32. Who can edit policy versions?
33. How are policy changes approved?
34. Are tenant policy changes support-managed initially?

Recommended default:

```text
Support-managed or minimal internal admin only. Rich self-serve policy editor deferred.
```

### API and future CRUD

35. What authentication method will MIC portal use to call DrawFlow API?
36. Are API clients tied to WorkOS organizations, internal service accounts, or separate integration credentials?
37. Which object IDs must be stable across products?
38. Should read-only API responses include external IDs for mapping?
39. What is the future CRUD API boundary, and which commands must remain governed transitions?

Recommended default:

```text
Use service-to-service auth or integration credentials mapped to observer grants. Include stable DrawFlow IDs and optional external IDs. Future CRUD commands must still route through transition service.
```

---

## Product risks to watch

1. **Lower draw amount ambiguity** — decide whether remaining approved capacity is preserved, waived, or manually recoverable.
2. **Policy drift** — policy snapshots must attach to decisions.
3. **Workspace complexity** — avoid embedding every workflow in one god screen.
4. **Webhook overexposure** — do not include sensitive evidence URLs or internal notes in webhook payloads.
5. **Chat ambiguity** — chat must not become informal approval state.
6. **Revision underdesign** — active build reality will diverge from approved plan; baseline/forecast split is mandatory.
7. **Financial wording** — avoid “disbursed” unless an external authoritative system confirmed it. Use “release approved” and “manual release recorded.”
8. **XState misuse** — state machines should govern transitions, but durable side effects belong in command handlers/outbox.
