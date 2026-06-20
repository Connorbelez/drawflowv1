# Assessment A — FairLend Marketing Landing Page Design Review

Files reviewed in isolation:

- `src/routes/marketing.tsx`
- `src/routes/-marketing.css`
- `marketing/home.md`
- `marketing/DESIGN.md`
- `marketing/PRODUCT.md`

---

## 1. AI Slop Verdict

**Verdict:** Yes — heavily AI-assisted / template-like, with a bespoke GSAP garnish.

**Specific tells**

- Generic six-card icon grids in `WhyFairlendSection` (marketing.tsx:887) and `OperatingModelSection` (marketing.tsx:813) — exactly the "identical card grids" banned in DESIGN.md/PRODUCT.md.
- Repetitive proof metrics: "2B+" and "25+ Years" appear in `AuthorityPanel` (marketing.tsx:636), the stats strip (marketing.tsx:1016), and founder stats (marketing.tsx:1256).
- Placeholder authority visuals: founder photo reuses the hero render asset with a `UserRound` icon (marketing.tsx:1256–1268); team avatars are initials on gradients (marketing.tsx:1325–1330).
- Exhaustive, magic-number CSS: 4,475 lines, many duplicated breakpoints, e.g. `.mkt-trust-rail` styles exist at lines 946–1119 but the component is not rendered.
- Over-engineered micro-optimizations: canvas-based optical alignment (`useOpticalAlignment`, marketing.tsx:280) and a public "Grid" toggle (`GridToggle`, marketing.tsx:218) feel like craft-for-craft's-sake.
- Generic fintech SaaS phrasing: "human-led, technology-enabled," "end-to-end workflow," "integrated model."
- Three equally-weighted hero CTAs and four equal final CTAs — no primary decision path.

**Absences**

- No real founder / team photography.
- No specific deal, program, or case-study proof.
- No visible contact/help channel above the fold.
- No reconciliation between the app "instrument panel" system and the marketing "Soft Brutalist Blueprint" system.

---

## 2. Nielsen's 10 Heuristics

| # | Heuristic | Score (0–4) | Key Issue |
|---|-----------|-------------|-----------|
| 1 | Visibility of system status | 2 | Scroll scene hijacks viewport with no progress indicator; only clear state is the grid toggle. |
| 2 | Match between system and real world | 3 | Domain vocabulary is mostly correct, but "structural gap" and "operating model" are abstract. |
| 3 | User control and freedom | 2 | Pinned hero (`+=145%` desktop, `+=92%` mobile); no skip/escape; reduced motion only disables the mask. |
| 4 | Consistency and standards | 2 | Type/palette drift from DESIGN.md; `Card` primitive used only twice; mix of `<Link>` and `<a>` for internal routes. |
| 5 | Error prevention | 3 | Compliance disclaimers reduce false expectations; no interactive forms to evaluate. |
| 6 | Recognition rather than recall | 3 | Section numbers, persistent nav, and footer anchors support wayfinding. |
| 7 | Flexibility and efficiency of use | 2 | 3 hero CTAs + 4 final CTAs; no audience-specific primary or return-user path. |
| 8 | Aesthetic and minimalist design | 2 | 12+ sections, repeated stats, dense compliance copy, generic card grids. |
| 9 | Help users recognize/diagnose/recover from errors | 3 | Static marketing surface; errors would surface in contact/forms, not here. |
| 10 | Help and documentation | 2 | Footer compliance is thorough but not navigational help; contact is buried. |

**Total: 24 / 40**

---

## 3. Cognitive Load

### 8-item checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Single clear primary action above the fold | ❌ Fail — 3 same-weight hero CTAs. |
| 2 | No redundant proof blocks | ❌ Fail — 2B+ / 25Y repeated 3×. |
| 3 | Decision points offer ≤3 clear choices | ❌ Fail — hero 3 CTAs, final 4 CTAs, 4 path cards. |
| 4 | Visual hierarchy supports scanning | ✅ Pass — eyebrows, display type, section numbers. |
| 5 | Related content grouped into scannable sections | ✅ Pass — sections are labelled and bounded. |
| 6 | Visuals are specific, not placeholders | ❌ Fail — founder/team images are generic or reused. |
| 7 | Motion does not dominate reading | ❌ Fail — pinned hero + public grid toggle compete for attention. |
| 8 | Compliance text is secondary, not front-loaded | ✅ Pass — disclaimers are small but present in hero/final. |

**Failure count: 5 / 8**

**Visible options count**

- Above the fold: ~9 (nav + 3 hero CTAs + grid toggle).
- Full page: ~30 interactive targets.
- Distinct CTA buttons competing for primary attention: 7 (3 hero + 4 final).

---

## 4. Emotional Journey

**Evoked emotion:** Cautious authority, initial intrigue, then fatigue and skepticism.

**Peak:**

- Hero blueprint-to-render radial-mask reveal (marketing.tsx:363–560; -marketing.css:151–176) — creates a "this is different" moment.
- Regulatory licence card in the hero (-marketing.css:1197–1248) — strong, specific trust signal for a regulated lender.

**End:**

- Dark footer compliance ends on risk disclaimers and legal caveats. Responsible, but heavy. The last feeling is caution, not invitation.

**Valleys**

- Generic six-card "Why FairLend" and "Operating Model" grids.
- Repeated 2B+ / 25Y stats that feel like padding.
- Placeholder founder photo and initial-only team avatars.
- Four equal final CTAs — decision paralysis at the conversion point.
- Mobile hero with stacked CTAs and dense microcopy.

---

## 5. What's Working

1. **Blueprint-to-render mask transition** (-marketing.css:151–176; marketing.tsx:363–560) is materially on-brand for construction capital and avoids the generic fintech hero template.
2. **Regulatory licence card** (-marketing.css:1197–1248; marketing.tsx:1137–1165) is a concrete, differentiating trust signal. This is the right kind of proof for a lender.
3. **Swiss grid overlay** (-marketing.css:4050–4263) demonstrates disciplined layout thinking — but it should be dev-only, not a public control.

---

## 6. Priority Issues

### P0 — Design-token schism

- **What:** The page uses Larken Bold / Oxanium Variable and a forest/sage/chartreuse/copper palette (-marketing.css:12, 47). `marketing/DESIGN.md` requires GT America Compressed / Sohne and Burnt Orange / Soft Lime. The app instrument-panel system expects Frame/Card primitives. The implementation satisfies none.
- **Why:** Creates an identity crisis before the visitor reads a word; anti-references are hard to enforce when the system itself is inconsistent.
- **Fix:** Pick one system, reconcile tokens, and update the other docs. Remove Larken if the chosen system is instrument panel; add Burnt Orange/Soft Lime if the chosen system is the marketing blueprint.
- **Command:** `$ grep -nE 'Larken|Oxanium|--mkt-(paper|ink|chartreuse|forest|sage|copper|blueprint)' src/routes/-marketing.css`

### P0 — Inescapable scroll scene

- **What:** `useMarketingScrollScene` pins the hero for `+=145%` on desktop and `+=92%` on mobile (marketing.tsx:348–560). No scroll progress indicator, pause control, or non-JS fallback.
- **Why:** Violates user control and accessibility; focus may travel behind pinned content; back/forward scroll position may break.
- **Fix:** Disable pin under `prefers-reduced-motion`, add a skip/scroll progress affordance, and ensure focus order stays within visible content.
- **Command:** `$ bunx @axe-core/cli http://localhost:3000/marketing --tags best-practice`

### P1 — CTA cacophony

- **What:** Hero has 3 equal-weight CTAs (marketing.tsx:141–168); final section has 4 outline CTAs (marketing.tsx:991–1005). No audience-specific primary.
- **Why:** Generic hero-metric pattern; visitors cannot tell which path is theirs.
- **Fix:** Designate one primary per audience and demote others to text links or an audience selector.
- **Command:** `$ grep -nE 'mkt-(primary|secondary|final)-action' src/routes/marketing.tsx`

### P1 — Banned generic card grids

- **What:** `OperatingModelSection` (marketing.tsx:813) and `WhyFairlendSection` (marketing.tsx:887) are six-item icon-card grids — explicitly banned in DESIGN.md section 5 and PRODUCT.md anti-references.
- **Why:** Looks identical to every SaaS landing page; undermines the "not a generic platform" positioning.
- **Fix:** Convert Operating Model to a horizontal timeline or editorial band. Convert Why FairLend to 2–3 proof blocks with real project/deal data.
- **Command:** `$ git diff -- src/routes/marketing.tsx`

### P1 — Placeholder authority imagery

- **What:** Founder photo reuses the hero render asset with a `UserRound` icon (marketing.tsx:1256–1268). Team avatars are initials on gradients (marketing.tsx:1325–1330).
- **Why:** A lender claiming "human-led" credibility cannot have generic silhouettes for its leadership.
- **Fix:** Use actual founder/team photography. If unavailable, remove the founder block until assets are ready rather than shipping a placeholder.
- **Command:** `$ ls public/assets | grep -iE 'elie|founder|team|portrait'`

---

## 7. Minor Observations

- `.mkt-trust-rail` CSS (-marketing.css:946–1119) is dead code; the component is not rendered in `marketing.tsx`.
- Public "Grid" toggle (`GridToggle`, marketing.tsx:218) bound to the `g` key globally is a dev artifact, not a public feature.
- Path cards use `<a href>` (marketing.tsx:1218) while other internal CTAs use TanStack `<Link>`, breaking SPA prefetch and transitions.
- Hero `.mkt-eyebrow` is `display:none` (-marketing.css:964) yet remains in the DOM.
- `getMarketingPageHead` preloads root-relative image paths; verify these resolve after the build/deployment pipeline.
- Final microcopy duplicates the hero disclaimer and introduces CMHC MLI Select without prior context.

---

## 8. Provocative Questions

1. Does a 2×-viewport pinned hero increase trust for a lender, or is it theatrical motion that delays the value proposition?
2. Why is a public marketing page shipping a visible "Grid" toggle? Who is the audience for that control?
3. If FairLend is "human-led, technology-enabled," why are the humans represented by initials and a generic silhouette?
4. Does repeating the same two stats three times build credibility, or signal that there is not much else to say?
5. Should the primary button promise a "3-day commitment target" while the surrounding copy repeatedly disclaims guarantees?
6. The service paths show 4 cards, but PRODUCT.md defines 3 audience groups. Is "Private 1st and 2nds" for lenders duplicative of investor/borrower paths?
7. When will the app instrument-panel system and the marketing Soft Brutalist Blueprint system be reconciled so the team can enforce anti-references?
