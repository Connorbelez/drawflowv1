---
target: B4 builder draw funding workspace
total_score: 28
p0_count: 0
p1_count: 4
timestamp: 2026-07-16T15-55-00Z
slug: c-features-build-funding-buildfundingworkspace-tsx
---
Method: dual-agent (A: /root/b4_design_review · B: /root/b4_detector_review)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Strong request receipt; blocked and withdrawal states needed clearer feedback. |
| 2 | Match System / Real World | 3 | Money-in/money-out model works; some product jargon leaked through. |
| 3 | User Control and Freedom | 3 | Cancel, back, and withdrawal exist; withdrawal needed an explicit completion state. |
| 4 | Consistency and Standards | 3 | Cohesive primitives; money-out signs were inconsistent. |
| 5 | Error Prevention | 3 | Exact bounds and review are strong; stale state needed clearer recovery. |
| 6 | Recognition Rather Than Recall | 3 | Dates are visible; pending and behind totals required mental aggregation. |
| 7 | Flexibility and Efficiency | 2 | Amount presets help; density modes were not materially different. |
| 8 | Aesthetic and Minimalist Design | 3 | Flat, domain-specific hierarchy; some explanatory noise remained. |
| 9 | Error Recovery | 2 | Input persists, but raw exceptions and withdrawal completion were weak. |
| 10 | Help and Documentation | 3 | Contextual help exists; zero-balance guidance was incomplete. |
| **Total** | | **28/40** | **Good foundation; workflow hardening required.** |

## Anti-Patterns Verdict

Pass. B4 avoids card slop by using a flat statement, dividers, selective record cards only inside expanded groups, restrained semantic color, and construction-finance-specific content. The deterministic detector returned zero findings. The remaining AI residue was generic dashboard composition and over-explanatory copy, not synthetic visual styling.

## Overall Impression

The approved line-of-credit mental model is correct and the amount → review → receipt interaction is strong. The biggest opportunity was to make unavailable money and the primary action understandable without scrolling or mental arithmetic, especially for a low-fluency mobile builder.

## What's Working

- Approved milestones, submitted requests, and completed draws form a legible money-in/money-out statement.
- Exact cents, presets, a review step, projected remaining balance, and an authoritative receipt make the high-stakes request flow trustworthy.
- Planned draws are clearly separated from money currently available.

## Priority Issues

1. **[P1] Mobile task order** — The request rail followed the long milestone schedule in DOM order. Fix: separate grid children and order balance → request/status → schedule on mobile.
2. **[P1] Blocked-balance explanation** — Pending verification and behind-plan totals were not summarized and a disabled CTA gave no next action. Fix: explicit totals, a reason, and contextual contact help.
3. **[P1] Expired forecast rows** — Past planning rows could appear under “Future planned draws.” Fix: filter forecast projection against the current date.
4. **[P1] Withdrawal and error recovery** — Successful withdrawal lacked closure and raw backend errors could leak through. Fix: controlled close, success feedback, plain-language domain error mapping, preserved form state.
5. **[P2] Low-fluency friction** — Density modes differed by one sentence, some copy used product jargon, and small actions created motor-access risk. Fix: make density meaningful, simplify wording, and increase core touch targets.

## Persona Red Flags

- **Jordan (first-time builder):** A zero balance did not explain why money was unavailable; “lifecycle,” “reserve,” and “reimbursement” required translation; pending and behind money required row-by-row scanning.
- **Sam (assistive technology):** The feature introduced a nested main landmark, repeated milestone links lacked unique accessible names, and successful withdrawal was not announced.
- **Casey (distracted mobile builder):** The primary action came after the full schedule; small secondary actions were hard to hit one-handed; the blocked-state explanation required scrolling.

## Minor Observations

- The statement footer should retain an explicit equation/result purpose if the available balance is repeated.
- Submitted and approved/released draw groups should use the same money-out sign convention.
- Expanded cards are appropriate for current record counts but should collapse to a denser list if histories grow materially.
- The receipt’s exact currency, timestamp, and remaining-balance framing are notably strong.

## Questions to Consider

- Does compact mode earn its presence by materially reducing detail for repeat users?
- Can every zero-balance state answer “what unlocks next, how much, and when?” without scrolling?
- At what history length should expanded cards switch to a denser ledger list?
