
According to CMHC’s current MLI Select page and the uploaded CMHC forms/documentation, below is a comprehensive technical PRD for a webapp that evaluates MLI Select eligibility, produces a gap analysis, and generates an application-ready documentation package. This PRD treats CMHC’s public rules as a versioned ruleset and the uploaded PDFs/spreadsheet as the initial document-template and data corpus.

# Technical PRD: CMHC MLI Select Qualification & Application Package Generator

## 1. Product summary

### 1.1 Product name

**MLI Select Builder Qualification & Application Package Generator**

### 1.2 Product objective

Build a webapp that allows multi-unit housing builders, developers, borrowers, consultants, and lender-side users to determine whether a planned or existing multi-unit project appears to qualify for **CMHC MLI Select** under the published affordability, energy-efficiency, and accessibility criteria, and then generate an application package with required MLI Select documentation populated from verified project data.

CMHC describes MLI Select as a multi-unit mortgage loan insurance product that uses a point system based on affordability, accessibility, and climate compatibility/energy efficiency, with incentives for both new construction and existing properties. The public page states that projects receive points across the three social outcome categories, with product flexibilities linked to point thresholds. ([Canada Mortgage and Housing Corporation][1])

### 1.3 Product must do two things

**Capability 1 — Qualification check and gap analysis**

The system must determine whether a project:

1. passes base MLI Select eligibility gates;
2. earns at least the minimum required MLI Select points;
3. satisfies claimed affordability, energy-efficiency, and accessibility criteria;
4. satisfies lender/CMHC documentation readiness for the criteria being claimed;
5. has underwriting/flexibility risks such as DCR, LTV/LTC, net worth, property-management experience, non-residential limits, or missing evidence.

When the project does not qualify or is not application-ready, the system must generate a **gap analysis** with:

* hard disqualifiers;
* missing or invalid inputs;
* criterion-specific gaps;
* minimum additional actions to reach 50, 70, or 100 points;
* checklist of documents, signatures, calculations, and attestations still required.

**Capability 2 — Requirements package generation**

For projects that meet on-paper requirements, the system must generate an application package containing:

* completed MLI Select scoring summary;
* completed or pre-filled CMHC forms where technically fillable;
* generated rent-roll and affordability exhibits;
* generated energy-efficiency and accessibility attestation packages;
* required supporting-document checklist;
* calculation appendices;
* post-advance and annual-compliance obligation schedule.

The product must be explicit that it does **not** grant CMHC approval. It provides a structured, auditable, rules-based prequalification and document-assembly workflow. Final approval remains with the Approved Lender and CMHC.

---

## 2. Product scope

### 2.1 In scope for MVP

The MVP must include:

1. **Project intake**

   * new construction and existing-property workflows;
   * standard rental, SRO, supportive housing, retirement housing, student housing, and mixed-use/non-residential inputs;
   * property, borrower, lender, loan, rent-roll, energy, accessibility, and documentation inputs.

2. **Rules engine**

   * base eligibility evaluation;
   * affordability scoring;
   * energy-efficiency scoring;
   * accessibility scoring;
   * total points;
   * product-flexibility tier estimation;
   * gap analysis;
   * document-readiness evaluation.

3. **Data ingestion**

   * CMHC median renter income table from the uploaded spreadsheet;
   * CMHC rule/version metadata;
   * CPI/rent-increase constraint table as a versioned dataset;
   * third-party energy-certification mapping;
   * official document-template registry.

4. **Document package generation**

   * package cover letter;
   * MLI Select score summary;
   * affordability rent-roll/pro forma/current rent-roll exhibit;
   * affordability covenant/schedule data export;
   * energy-efficiency attestation package;
   * accessibility attestation package;
   * achievement-of-social-outcomes package for post-completion use;
   * annual affordability compliance package for future monitoring;
   * missing-document and post-advance obligation checklist;
   * machine-readable data export for lender review.

5. **Reviewer workflow**

   * builder/developer self-serve flow;
   * consultant/professional sign-off workflow;
   * lender-review workflow;
   * versioned audit trail.

### 2.2 Out of scope for MVP

The MVP should not claim to:

* submit directly to CMHC unless an official lender/CMHC API or permitted electronic submission channel is available;
* replace legal drafting of mortgage covenants;
* certify engineering, architecture, accessibility, or energy modelling;
* independently validate uploaded engineering models beyond consistency checks;
* determine final appraised value, final insurable loan amount, or final underwriting approval;
* guarantee acceptance of third-party certifications or alternative compliance pathways.

---

## 3. Source-of-truth model

### 3.1 Rules must be versioned

CMHC’s own materials state that information is subject to change and should be verified before loan processing. Therefore, the product must implement MLI Select as a **versioned rules engine**, not as hard-coded logic scattered through application code. The uploaded Required Documentation Guide and Fees/Premiums guide are 2025 CMHC documents and should seed the initial rules/document registry.  

Every qualification result must record:

```text
ruleset_id
ruleset_effective_date
source_documents_used
source_urls_used
median_income_dataset_version
cpi_dataset_version
generated_at
generated_by_user_id
```

### 3.2 Rule-source hierarchy

When rules conflict, the system should resolve them using this hierarchy:

1. active CMHC web page / current official PDF;
2. official CMHC form/template with current revision date;
3. uploaded/internal ruleset configured by an admin;
4. user-entered override with mandatory reviewer note.

The app should never silently use stale MLI Select criteria.

### 3.3 Regulatory disclaimer requirement

Every qualification report and generated package must include a disclaimer similar to:

> This package is a rules-based prequalification and document-preparation aid. It is not an approval, commitment, or legal opinion. Final eligibility, underwriting, documentation acceptability, and insurance approval are determined by the Approved Lender and CMHC.

---

## 4. Core concepts and definitions

### 4.1 Project status taxonomy

The system must distinguish these statuses:

| Status                                      | Meaning                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Draft intake**                            | Insufficient data to evaluate.                                                                |
| **Base ineligible**                         | Fails a hard MLI Select/product gate.                                                         |
| **Potentially eligible, scoring shortfall** | Base eligible, but below 50 MLI Select points.                                                |
| **On-paper qualifies**                      | Base eligible and ≥50 points based on user-entered planned values.                            |
| **Evidence incomplete**                     | On-paper qualifies, but required reports, signatures, attestations, or documents are missing. |
| **Package ready for review**                | Qualification passes and all required package inputs are complete.                            |
| **Submitted / lender review**               | Package exported or shared with lender.                                                       |
| **Post-advance obligations pending**        | Project requires post-final-advance achievement evidence.                                     |
| **Annual affordability monitoring pending** | Affordability annual certificate/rent roll due.                                               |

### 4.2 Qualification vs package readiness

The system must treat these as separate booleans:

```text
program_eligible:       passes base eligibility gates
score_qualified:        total_points >= 50
on_paper_qualified:     program_eligible && score_qualified
package_ready:          on_paper_qualified && required_documents_complete && required_signatures_ready
```

A project can be “on-paper qualified” but **not** application-ready if, for example, the energy modelling report has not been prepared by a qualified professional or the accessibility attestation is unsigned.

---

## 5. User personas

### 5.1 Builder / developer

Primary persona. Wants to know if a planned project qualifies and what design/rent/energy/accessibility changes are needed.

Needs:

* fast preliminary answer;
* exact missing requirements;
* ability to model trade-offs;
* application package export.

### 5.2 Borrower / sponsor

Owns the legal application data and affordability commitments.

Needs:

* borrower/guarantor data capture;
* net-worth and management-experience readiness;
* annual affordability compliance reminders.

### 5.3 Energy professional

Provides energy modelling and signs energy-efficiency attestation.

Needs:

* input model results;
* upload reports and input/output model files;
* confirm software and qualifications;
* sign or approve attestation content.

### 5.4 Architect / accessibility consultant

Provides accessibility analysis and signs accessibility attestation.

Needs:

* enter accessible/universal/visitable data;
* upload sample accessible/universal unit plan;
* confirm CSA B651:23/Rick Hansen pathway;
* sign or approve attestation content.

### 5.5 Approved Lender user

Reviews package before submission to CMHC.

Needs:

* audit trail;
* calculation traceability;
* document checklist;
* lender-specific fields;
* ability to request changes.

### 5.6 Admin / compliance operator

Maintains rules, datasets, templates, and source-document versions.

Needs:

* ruleset editor;
* document-template registry;
* source citation metadata;
* rule-effective-date controls;
* regression tests for rule changes.

---

## 6. Core MLI Select business rules

## 6.1 Base eligibility gates

The product must evaluate base eligibility before scoring.

CMHC’s current public criteria include these high-level eligibility constraints:

| Gate                          | Rule                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eligible project types        | Standard rental, single-room occupancy, supportive housing, retirement housing. Student housing is eligible only for energy-efficiency and accessibility flexibilities, not affordability. |
| Minimum project size          | Generally 5 units; retirement housing requires 50 units or beds.                                                                                                                           |
| Non-residential component     | Non-residential space must not exceed 30% of total gross floor area and must not exceed 30% of total lending value.                                                                        |
| Non-residential lending value | Non-residential component loan amount must be ≤75% of non-residential lending value.                                                                                                       |
| Minimum MLI Select score      | Minimum 50 points.                                                                                                                                                                         |
| DCR                           | Minimum DCR is 1.10 for standard rental, 1.20 for other shelter models, and 1.40 for non-residential space.                                                                                |
| Prohibited-property check     | Project must not be subject to a prohibition under the Prohibition on the Purchase of Residential Property by Non-Canadians Act.                                                           |

These gates are stated across CMHC’s MLI Select page and MLI Select fact sheet. ([Canada Mortgage and Housing Corporation][1])

### 6.1.1 Base eligibility pseudocode

```pseudo
function evaluateBaseEligibility(project, rules):
    result = GateResult()

    if project.type == "retirement":
        require project.total_units_or_beds >= 50
            else result.fail("MIN_SIZE_RETIREMENT", required=50, actual=project.total_units_or_beds)
    else:
        require project.total_units >= 5
            else result.fail("MIN_SIZE_STANDARD", required=5, actual=project.total_units)

    if project.type == "student_housing":
        result.addConstraint("AFFORDABILITY_NOT_AVAILABLE_FOR_STUDENT_HOUSING")

    if project.non_residential.exists:
        if project.non_residential.gfa_pct > 30:
            result.fail("NON_RES_GFA_EXCEEDS_30_PERCENT")
        if project.non_residential.lending_value_pct > 30:
            result.fail("NON_RES_LENDING_VALUE_EXCEEDS_30_PERCENT")
        if project.non_residential.loan_to_value_pct > 75:
            result.fail("NON_RES_LTV_EXCEEDS_75_PERCENT")

    dcr_required = rules.dcr.minimumFor(project.shelter_model)
    if project.dcr < dcr_required:
        result.warnOrFail("DCR_BELOW_MINIMUM", required=dcr_required, actual=project.dcr)

    if project.non_residential.exists and project.non_residential.dcr < 1.40:
        result.warnOrFail("NON_RES_DCR_BELOW_1_40")

    if project.subject_to_non_canadian_purchase_prohibition == true:
        result.fail("PROPERTY_PURCHASE_PROHIBITION")

    return result
```

DCR should be treated as a hard product-flexibility gate for full application readiness, but the system should allow early planning flows to proceed with a “financing risk” status if DCR is not yet final.

---

## 6.2 MLI Select points model

The system must compute points independently for:

1. affordability;
2. energy efficiency;
3. accessibility;
4. additional affordability commitment duration.

A project qualifies for MLI Select only if base eligibility passes and total points are at least 50. Product-flexibility tiers are tied to 50, 70, and 100-point thresholds. CMHC’s fact sheet also links those thresholds to maximum LTV/LTC, amortization, and recourse terms. ([CMHC][2])

### 6.2.1 New construction point table

| Criterion         |                                                            Level 1 |                      Level 2 |                      Level 3 |
| ----------------- | -----------------------------------------------------------------: | ---------------------------: | ---------------------------: |
| Affordability     |                                   10% of units affordable = 50 pts |                 15% = 70 pts |                25% = 100 pts |
| Energy efficiency | 25% better than NECB Tier 1 or 20% better than NBC Tier 1 = 20 pts | 50% NECB or 40% NBC = 35 pts | 60% NECB or 70% NBC = 50 pts |
| Accessibility     |                                                   Level 1 = 20 pts |             Level 2 = 30 pts |                          n/a |

### 6.2.2 Existing property point table

| Criterion         |                          Level 1 |                Level 2 |                Level 3 |
| ----------------- | -------------------------------: | ---------------------: | ---------------------: |
| Affordability     | 40% of units affordable = 50 pts |           60% = 70 pts |          80% = 100 pts |
| Energy efficiency |           15% reduction = 20 pts | 25% reduction = 35 pts | 40% reduction = 50 pts |
| Accessibility     |                 Level 1 = 20 pts |       Level 2 = 30 pts |                    n/a |

### 6.2.3 Affordability commitment duration

Affordability must be maintained for at least 10 years. A 20-year commitment earns an additional 30 points. CMHC’s public page also states that base affordable rents cannot increase above the applicable permitted rent-increase rule, using provincial/territorial CPI where no specific legislation/regulation applies. ([Canada Mortgage and Housing Corporation][1])

```pseudo
function evaluateCommitmentBonus(affordability):
    if affordability.claimed == false:
        return 0

    if affordability.commitment_years < 10:
        return Gap("AFFORDABILITY_COMMITMENT_BELOW_10_YEARS")

    if affordability.commitment_years >= 20:
        return 30

    return 0
```

---

# 7. Required inputs

The intake system must be progressive. Users should be able to run an early “rough precheck” with minimal information, but the system must mark unknown values as unverified and must not generate an application-ready package until all required data and evidence are present.

## 7.1 Project identity inputs

| Field                              | Required for precheck |   Required for package | Notes                                                      |
| ---------------------------------- | --------------------: | ---------------------: | ---------------------------------------------------------- |
| Project name                       |                   Yes |                    Yes | Used in package and reports.                               |
| Municipal address                  |                   Yes |                    Yes | Required on CMHC attestations.                             |
| Legal description                  |                    No |                    Yes | Needed for certificate/application package.                |
| Province/territory                 |                   Yes |                    Yes | Drives income fallback, CPI, legal/rent rules.             |
| Municipality / market area         |                   Yes |                    Yes | Used for median renter income lookup.                      |
| Rural/urban classification         |           Conditional | Yes if no exact market | Used for affordability fallback.                           |
| New construction vs existing       |                   Yes |                    Yes | Determines thresholds.                                     |
| Project status                     |                   Yes |                    Yes | Planned, under construction, completed, retrofit, renewal. |
| Expected application date          |                   Yes |                    Yes | Determines applicable rules/form versions.                 |
| Expected first/final advance dates |                    No |                    Yes | Drives post-advance obligations.                           |

## 7.2 Property type and physical inputs

| Field                         |        Required | Notes                                                                        |
| ----------------------------- | --------------: | ---------------------------------------------------------------------------- |
| Shelter model                 |             Yes | Standard rental, SRO, supportive, retirement, student.                       |
| Total units                   |             Yes | Used for affordability/accessibility denominators.                           |
| Total beds                    |     Conditional | Required for bed-based models and retirement.                                |
| Unit mix                      |             Yes | Bedroom type, unit type, floor area, rent.                                   |
| Number of buildings           | Yes for package | Certificate/application form.                                                |
| Number of storeys             |  Yes for energy | Helps determine Part 3 vs Part 9 and energy-professional requirements.       |
| Construction code pathway     |  Yes for energy | 2020 NECB Tier 1 or 2020 NBC Tier 1; legacy 2015/2017 pathway only if valid. |
| Gross floor area              |             Yes | Needed for non-residential component.                                        |
| Non-residential GFA           |     Conditional | Required if mixed-use.                                                       |
| Non-residential lending value |     Conditional | Required if mixed-use.                                                       |
| Total lending value           |     Conditional | Required if mixed-use/LTV analysis.                                          |

## 7.3 Borrower and sponsor inputs

| Field                                  | Required for package | Notes                                                                                                                                           |
| -------------------------------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Borrower legal name                    |                  Yes | Used on certificate request and attestations.                                                                                                   |
| Borrower type                          |                  Yes | Individual, corporation, non-profit, etc.                                                                                                       |
| Borrower role                          |                  Yes | Primary borrower, co-borrower, guarantor/covenantor.                                                                                            |
| Applicant address/contact              |                  Yes | Certificate/application fields.                                                                                                                 |
| Guarantor/covenantor details           |          Conditional | Based on recourse/loan structure.                                                                                                               |
| Net worth                              |                  Yes | CMHC fact sheet includes net worth expectations.                                                                                                |
| Liquidity                              |          Recommended | Useful for lender review.                                                                                                                       |
| Similar property-management experience |                  Yes | Borrower/affiliate needs ≥5 years similar experience or professional third-party property management contract, per CMHC fact sheet. ([CMHC][2]) |
| Third-party property manager contract  |          Conditional | Required if sponsor lacks experience.                                                                                                           |

## 7.4 Lender inputs

| Field                     |        Required for package | Notes                        |
| ------------------------- | --------------------------: | ---------------------------- |
| Approved Lender name      |                         Yes | Required on attestations.    |
| CMHC account number       | Yes for certificate request | Present in certificate form. |
| Lender contact            |                         Yes | Name/email/phone.            |
| Correspondent/underwriter |                 Conditional | If applicable.               |
| Language preference       |                         Yes | Certificate form.            |

## 7.5 Loan and underwriting inputs

| Field                           |               Required | Notes                                                 |
| ------------------------------- | ---------------------: | ----------------------------------------------------- |
| Application purpose             |                    Yes | Construction, purchase, refinance, improvements, etc. |
| Requested insured loan amount   |                    Yes | Used for net worth, fees, LTV/LTC.                    |
| Estimated lending value         |                    Yes | LTV.                                                  |
| Estimated cost to complete      |       New construction | LTC.                                                  |
| Current outstanding debt        |     Existing/refinance | Required for financing summary.                       |
| Loan security                   |                    Yes | First mortgage, second mortgage, pari passu, other.   |
| Interest type                   |                    Yes | Fixed/floating.                                       |
| Amortization requested          |                    Yes | Compare against point-flexibility tier.               |
| Number of advances              |                    Yes | Fee calculation.                                      |
| Effective gross income          |                    Yes | DCR.                                                  |
| Operating expenses              |                    Yes | DCR/NOI.                                              |
| NOI                             |                Derived | DCR.                                                  |
| DCR                             | Derived/user-confirmed | Must compare against CMHC minimums.                   |
| Non-residential loan allocation |            Conditional | Needed for non-residential limits, fees, premiums.    |

## 7.6 Affordability inputs

| Field                       | Required if affordability claimed | Notes                                                                      |
| --------------------------- | --------------------------------: | -------------------------------------------------------------------------- |
| Affordability pathway       |                               Yes | New construction or existing property thresholds.                          |
| Commitment term             |                               Yes | Minimum 10 years; 20 years gives extra 30 points.                          |
| Median renter income market |                               Yes | Exact or fallback.                                                         |
| Median renter income value  |                           Derived | From CMHC spreadsheet.                                                     |
| Monthly affordable rent cap |                           Derived | `median_renter_income * 0.30 / 12`.                                        |
| Rent roll type              |                               Yes | Pro forma for new construction, current rent roll for existing properties. |
| Unit ID                     |                               Yes | Required for exhibit.                                                      |
| Unit type/bedrooms          |                               Yes | Required for rent roll.                                                    |
| Proposed/current rent       |                               Yes | Compare to cap.                                                            |
| Mandatory tenant charges    |                               Yes | Needed to avoid understating rent.                                         |
| Utility assumptions         |           Recommended/conditional | If rent cap should include utility-inclusive treatment.                    |
| Affordable designation      |                               Yes | Which units are committed.                                                 |
| Unit replacement table      |                       Conditional | Needed for annual replacement tracking.                                    |

CMHC’s Required Documentation Guide states that, at application, the lender must submit affordability documentation supporting the borrower’s commitment, evidenced by a pro forma rent roll for new construction or current rent roll for existing properties, in a form acceptable to CMHC. It also states that annual affordability compliance requires a certificate of compliance supported by a rent roll. 

## 7.7 Energy-efficiency inputs

| Field                                  | Required if energy claimed | Notes                                                                 |
| -------------------------------------- | -------------------------: | --------------------------------------------------------------------- |
| Project pathway                        |                        Yes | Modelled performance or recognized third-party certification.         |
| New/existing                           |                        Yes | Determines thresholds.                                                |
| Code basis                             |           New construction | 2020 NECB Tier 1 or 2020 NBC Tier 1.                                  |
| Legacy basis                           |                Conditional | 2017 NECB / 2015 NBC only under valid transition rules.               |
| Building-code part                     |                        Yes | Part 3 vs Part 9 affects professional/software expectations.          |
| Reference building total annual energy |            Yes if modelled | GJ/year.                                                              |
| Assessed building total annual energy  |            Yes if modelled | GJ/year.                                                              |
| Reference building GHG                 | Existing and if applicable | tCO₂e/year.                                                           |
| Assessed building GHG                  | Existing and if applicable | tCO₂e/year.                                                           |
| Energy end-use breakdown               |            Yes for package | Space heating/cooling, DHW, lighting, equipment, appliances, systems. |
| Modelling software                     |                        Yes | Must be appropriate; CMHC references ASHRAE 140 compliance.           |
| Software output files                  |            Yes for package | Required by documentation guide.                                      |
| Supplemental calculations              |                Conditional | Renewables, special systems, non-modelled measures.                   |
| PV contribution                        |                Conditional | Must apply CMHC constraints.                                          |
| Fuel-switching assumptions             |                Conditional | Must comply with CMHC modelling expectations.                         |
| Qualified professional identity        |                        Yes | Name, designation, contact.                                           |
| Professional qualification             |                        Yes | P.Eng, architect, CET, CEM, NRCan Residential Energy Advisor, etc.    |
| Report date                            |                        Yes | Required on attestation.                                              |
| Signed attestation                     |       Required for package | Energy Efficiency Criteria Attestation.                               |

CMHC’s Required Documentation Guide requires energy supporting documentation to be completed by a qualified professional using appropriate energy simulation software; it requires an executive comparison table, energy/GHG modelling summaries, end-use breakdowns, physical/operational feature overview, input/output files, supplemental calculations, and GHG methodology/assumptions. It also says invoices/bills alone are not acceptable evidence.  

## 7.8 Accessibility inputs

| Field                                                         | Required if accessibility claimed | Notes                                             |
| ------------------------------------------------------------- | --------------------------------: | ------------------------------------------------- |
| All units 100% visitable                                      |                               Yes | Prerequisite for both accessibility levels.       |
| Common areas barrier-free under CSA B651:23                   |                               Yes | Prerequisite for both levels.                     |
| Accessible units count                                        |                       Conditional | Used for Level 1/2 alternatives.                  |
| Universal design units count                                  |                       Conditional | Used for Level 1/2 alternatives.                  |
| Rick Hansen Foundation Accessibility Certification v4.0 score |                       Conditional | Alternative pathway.                              |
| Rick Hansen Gold status                                       |                       Conditional | Level 2 alternative.                              |
| Sample accessible/universal unit design                       |                   Yes for package | Required documentation guide.                     |
| Summary of accessibility/universal design features            |                   Yes for package | Required documentation guide.                     |
| Accessibility professional identity                           |                               Yes | Architect or designated accessibility consultant. |
| Professional designation/contact                              |                               Yes | Required on attestation.                          |
| Signed accessibility attestation                              |              Required for package | Accessibility Criteria Attestation.               |

CMHC’s accessibility attestation requires all units to be 100% visitable and all common areas barrier-free under CSA B651:23 as a prerequisite for both levels; Level 1 and Level 2 then depend on accessible-unit counts, universal-design counts, or Rick Hansen Foundation Accessibility Certification v4.0 results. 

---

# 8. Qualification engine specification

## 8.1 Engine design principle

The qualification engine must be deterministic, explainable, and auditable.

Every rule evaluation must produce:

```text
rule_id
criterion
input_values
threshold_values
pass/fail/unknown
points_awarded
gap_if_failed
source_reference
severity
```

The engine must not merely return “qualified” or “not qualified.” It must return a structured explanation that can be rendered into UI, PDF reports, and document-package checklists.

## 8.2 Evaluation pipeline

```pseudo
function evaluateProject(project_id, ruleset_id):
    project = loadProject(project_id)
    rules = loadRuleset(ruleset_id)
    datasets = loadDatasets(project.application_date)

    facts = normalizeAndValidate(project, datasets)

    base = evaluateBaseEligibility(facts, rules)

    affordability = evaluateAffordability(facts, rules, datasets)
    energy = evaluateEnergyEfficiency(facts, rules)
    accessibility = evaluateAccessibility(facts, rules)

    total_points =
        affordability.points +
        affordability.commitment_bonus_points +
        energy.points +
        accessibility.points

    flexibilities = determineProductFlexibilities(
        project=facts,
        points=total_points,
        rules=rules
    )

    underwriting = evaluateUnderwritingReadiness(facts, rules, flexibilities)

    documents = evaluateDocumentReadiness(
        facts=facts,
        claimedCriteria=[affordability, energy, accessibility],
        rules=rules
    )

    gaps = generateGapAnalysis(
        base=base,
        affordability=affordability,
        energy=energy,
        accessibility=accessibility,
        underwriting=underwriting,
        documents=documents,
        targetPointThresholds=[50, 70, 100]
    )

    return EvaluationResult(
        base_eligible=base.passed,
        total_points=total_points,
        score_qualified=(total_points >= 50),
        on_paper_qualified=(base.passed && total_points >= 50),
        package_ready=(base.passed && total_points >= 50 && documents.complete),
        component_results=[base, affordability, energy, accessibility, underwriting, documents],
        flexibilities=flexibilities,
        gaps=gaps,
        assumptions=facts.assumptions,
        rule_version=rules.version
    )
```

## 8.3 Normalization layer

The normalization layer must convert user-entered project data into canonical facts.

Examples:

```pseudo
facts.total_denominator =
    if project.shelter_model in ["retirement", "SRO"] and project.uses_bed_based_scoring:
        project.total_beds
    else:
        project.total_units

facts.affordability_market =
    resolveMedianIncomeMarket(project.address, project.user_selected_market, datasets.median_income)

facts.affordable_monthly_rent_cap =
    facts.affordability_market.annual_median_renter_income * 0.30 / 12

facts.non_residential.gfa_pct =
    project.non_residential_gfa / project.total_gfa * 100

facts.non_residential.lending_value_pct =
    project.non_residential_lending_value / project.total_lending_value * 100

facts.non_residential.loan_to_value_pct =
    project.non_residential_loan_amount / project.non_residential_lending_value * 100
```

The system must preserve assumptions. If the user chooses a fallback market because exact median renter income data is unavailable, the evaluation result must show that fallback and require reviewer confirmation.

CMHC states that if renter income data is unavailable, it may accept comparable centres, provincial data, or rural centres, depending on context. ([Canada Mortgage and Housing Corporation][1])

---

# 9. Affordability engine

## 9.1 Affordability rule

A unit is affordability-eligible only if:

```pseudo
unit.designated_affordable == true
AND unit.monthly_affordability_rent <= monthly_affordable_rent_cap
```

Where:

```pseudo
monthly_affordable_rent_cap = annual_median_renter_income_before_tax * 0.30 / 12
```

The uploaded CMHC spreadsheet is titled “Real Median Total Household Income (Before Taxes), Renter Households, Canada, Provinces and Selected Metropolitan Areas, 2019.” The system must store that dataset with a version, source year, and last-updated metadata, because affordability calculations are only as reliable as the income table being used.

## 9.2 Affordability scoring thresholds

```pseudo
AFFORDABILITY_THRESHOLDS = {
  new_construction: [
    {level: 1, required_pct: 10, points: 50},
    {level: 2, required_pct: 15, points: 70},
    {level: 3, required_pct: 25, points: 100}
  ],
  existing_property: [
    {level: 1, required_pct: 40, points: 50},
    {level: 2, required_pct: 60, points: 70},
    {level: 3, required_pct: 80, points: 100}
  ]
}
```

## 9.3 Affordability pseudocode

```pseudo
function evaluateAffordability(facts, rules, datasets):
    result = CriterionResult("AFFORDABILITY")

    if facts.project.type == "student_housing":
        return result.notAvailable("AFFORDABILITY_NOT_AVAILABLE_FOR_STUDENT_HOUSING")

    if facts.affordability.claimed == false:
        return result.noPoints()

    if facts.affordability.commitment_years < 10:
        result.fail("COMMITMENT_TERM_TOO_SHORT", required_years=10)
        return result

    market_income = datasets.median_income.resolve(facts.project.location)
    if market_income.status == "missing":
        result.unknown("MEDIAN_RENTER_INCOME_NOT_RESOLVED")
        return result

    rent_cap = market_income.annual_income * 0.30 / 12
    denominator = facts.total_denominator

    eligible_units = []
    ineligible_designated_units = []

    for unit in facts.units:
        unit_rent = computeAffordabilityRent(unit)

        if unit.designated_affordable:
            if unit_rent <= rent_cap:
                eligible_units.append(unit)
            else:
                ineligible_designated_units.append({
                    unit_id: unit.id,
                    rent: unit_rent,
                    cap: rent_cap,
                    excess: unit_rent - rent_cap
                })

    eligible_count = count(eligible_units)
    eligible_pct = eligible_count / denominator * 100

    thresholds = rules.affordability.thresholdsFor(facts.project.new_or_existing)

    best_level = null
    for threshold in thresholds:
        required_count = ceil(denominator * threshold.required_pct / 100)
        if eligible_count >= required_count:
            best_level = threshold

    if best_level == null:
        result.points = 0
        result.fail("AFFORDABLE_UNIT_COUNT_BELOW_LEVEL_1")
    else:
        result.level = best_level.level
        result.points = best_level.points

    if facts.affordability.commitment_years >= 20:
        result.commitment_bonus_points = 30
    else:
        result.commitment_bonus_points = 0

    result.metrics = {
        market: market_income.name,
        market_income: market_income.annual_income,
        monthly_rent_cap: rent_cap,
        denominator: denominator,
        eligible_count: eligible_count,
        eligible_pct: eligible_pct,
        ineligible_designated_units: ineligible_designated_units
    }

    return result
```

## 9.4 Affordability gap generation

For each affordability level, the engine must compute:

```pseudo
required_count = ceil(total_denominator * level.required_pct / 100)
eligible_count = count(eligible_units)
count_gap = max(0, required_count - eligible_count)
```

For rent cap gaps:

```pseudo
for designated_unit in designated_units:
    excess = max(0, affordability_rent - rent_cap)
    if excess > 0:
        addGap(
            code="DESIGNATED_UNIT_RENT_ABOVE_CAP",
            unit_id=unit.id,
            monthly_excess=excess,
            annual_excess=excess * 12
        )
```

For optimization:

```pseudo
candidate_units = units not currently eligible
for unit in candidate_units:
    unit.concession_required = max(0, computeAffordabilityRent(unit) - rent_cap)
sort candidate_units by concession_required ascending

minimum_units_to_add = first count_gap candidate_units
```

The UI must show:

* current affordable units;
* required affordable units for Level 1/2/3;
* additional units needed;
* units above rent cap;
* required rent reduction per unit;
* annual revenue impact estimate;
* commitment-term bonus availability.

---

# 10. Energy-efficiency engine

## 10.1 Energy pathways

The engine must support two energy pathways:

1. **Modelled performance pathway**

   * New construction: improvement relative to 2020 NECB Tier 1 or 2020 NBC Tier 1.
   * Existing properties: reduction over pre-retrofit/pre-renewal baseline.

2. **Recognized third-party certification pathway**

   * Some certifications map to MLI Select energy levels.
   * The system must store recognized certifications as a ruleset table.

CMHC states that the supporting energy documentation must be prepared by a qualified professional and use appropriate energy simulation software. It also states that local building codes are not accepted as the modelling baseline for MLI Select; national code baselines and certain recognized certifications are used. ([Canada Mortgage and Housing Corporation][1])

## 10.2 Current new-construction thresholds

For the current 2020-code attestation:

| Code basis       |        Level 1 |        Level 2 |     Level 3 |
| ---------------- | -------------: | -------------: | ----------: |
| 2020 NECB Tier 1 | 25%–49% better | 50%–59% better | ≥60% better |
| 2020 NBC Tier 1  | 20%–39% better | 40%–69% better | ≥70% better |

The uploaded current Energy Efficiency Criteria Attestation uses those same thresholds. 

## 10.3 Existing-property thresholds

For existing properties, the current energy attestation evaluates the post-retrofit or post-renewal project against pre-retrofit/pre-renewal energy consumption and GHG emissions:

| Level   | Required decrease | Points |
| ------- | ----------------: | -----: |
| Level 1 |           15%–24% |     20 |
| Level 2 |           25%–39% |     35 |
| Level 3 |              ≥40% |     50 |

The uploaded current Energy Efficiency Criteria Attestation shows these existing-property thresholds. 

## 10.4 Legacy 2015/2017 energy-attestation support

CMHC’s current resource list states that the 2017 NECB / 2015 NBC energy attestation is available until September 30, 2026. The system should support this only as a separately versioned/dated pathway, not as the default scoring path. ([Canada Mortgage and Housing Corporation][1])

Product requirement:

```pseudo
if project.energy.code_version in ["2017_NECB", "2015_NBC"]:
    require project.application_date <= "2026-09-30"
    require ruleset.legacy_energy_pathway_enabled == true
    require reviewer_confirmation
else:
    use current_2020_thresholds
```

## 10.5 Energy pseudocode

```pseudo
function evaluateEnergyEfficiency(facts, rules):
    result = CriterionResult("ENERGY_EFFICIENCY")

    if facts.energy.claimed == false:
        return result.noPoints()

    professionalCheck = validateEnergyProfessional(facts.energy.professional, facts.project)
    softwareCheck = validateEnergySoftware(facts.energy.software, rules)

    result.documentation_checks.add(professionalCheck)
    result.documentation_checks.add(softwareCheck)

    if facts.energy.pathway == "third_party_certification":
        level = mapEnergyCertificationToLevel(facts.energy.certification, rules)
        if level == null:
            return result.fail("ENERGY_CERTIFICATION_NOT_RECOGNIZED")
        result.level = level
        result.points = rules.energy.pointsFor(level)
        return result

    if facts.project.new_or_existing == "new_construction":
        return evaluateNewConstructionEnergy(facts, rules, result)
    else:
        return evaluateExistingPropertyEnergy(facts, rules, result)
```

### 10.5.1 New construction

```pseudo
function evaluateNewConstructionEnergy(facts, rules, result):
    code_basis = facts.energy.code_basis

    if code_basis not in ["2020_NECB_TIER_1", "2020_NBC_TIER_1"]:
        return result.fail("INVALID_ENERGY_BASELINE_FOR_NEW_CONSTRUCTION")

    if facts.energy.assessed_energy_gj is null or facts.energy.reference_energy_gj is null:
        return result.unknown("ENERGY_MODEL_VALUES_MISSING")

    raw_savings_pct =
        (facts.energy.reference_energy_gj - facts.energy.assessed_energy_gj)
        / facts.energy.reference_energy_gj
        * 100

    adjusted_savings_pct = applyEnergyAdjustments(raw_savings_pct, facts.energy, rules)

    thresholds = rules.energy.newConstructionThresholds[code_basis]

    level = highestLevelWhere(adjusted_savings_pct >= thresholds[level].minimum_pct)

    if level == null:
        result.fail("ENERGY_SAVINGS_BELOW_LEVEL_1")
        result.points = 0
    else:
        result.level = level
        result.points = rules.energy.pointsFor(level)

    result.metrics = {
        code_basis,
        reference_energy_gj: facts.energy.reference_energy_gj,
        assessed_energy_gj: facts.energy.assessed_energy_gj,
        raw_savings_pct,
        adjusted_savings_pct
    }

    return result
```

### 10.5.2 Existing property

Existing-property evaluation must use the more conservative of energy-consumption reduction and GHG-emission reduction if both are required.

```pseudo
function evaluateExistingPropertyEnergy(facts, rules, result):
    required_values = [
        facts.energy.pre_retrofit_energy_gj,
        facts.energy.post_retrofit_energy_gj,
        facts.energy.pre_retrofit_ghg_tonnes,
        facts.energy.post_retrofit_ghg_tonnes
    ]

    if anyMissing(required_values):
        return result.unknown("EXISTING_PROPERTY_ENERGY_OR_GHG_VALUES_MISSING")

    energy_reduction_pct =
        (facts.energy.pre_retrofit_energy_gj - facts.energy.post_retrofit_energy_gj)
        / facts.energy.pre_retrofit_energy_gj
        * 100

    ghg_reduction_pct =
        (facts.energy.pre_retrofit_ghg_tonnes - facts.energy.post_retrofit_ghg_tonnes)
        / facts.energy.pre_retrofit_ghg_tonnes
        * 100

    effective_reduction_pct = min(energy_reduction_pct, ghg_reduction_pct)

    thresholds = rules.energy.existingPropertyThresholds

    level = highestLevelWhere(effective_reduction_pct >= thresholds[level].minimum_pct)

    if level == null:
        result.fail("ENERGY_OR_GHG_REDUCTION_BELOW_LEVEL_1")
        result.points = 0
    else:
        result.level = level
        result.points = rules.energy.pointsFor(level)

    result.metrics = {
        energy_reduction_pct,
        ghg_reduction_pct,
        effective_reduction_pct
    }

    return result
```

## 10.6 Energy adjustments and validation rules

The engine must implement these validation checks:

| Check                  | Requirement                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline               | New construction must use 2020 NECB Tier 1 or 2020 NBC Tier 1 unless a valid legacy pathway is explicitly configured.                                                         |
| Qualified professional | Part 3 construction must use appropriate professionals such as P.Eng, architect, CET, or CEM; low-rise Part 9 may use an NRCan Residential Energy Advisor or equivalent.      |
| Software               | Must support whole-building energy analysis, all major end uses, hourly analysis, and ASHRAE 140 compliance or CMHC-accepted equivalent.                                      |
| PV contribution        | PV cannot be sole source of energy reduction; must be behind-the-meter and owned by building operator; PV energy savings contribution must be capped according to CMHC rules. |
| Fuel switching         | Must be modelled against an acceptable baseline; renewable natural gas emissions-factor switching must not be used as a GHG reduction method.                                 |
| Bills/invoices         | Bills/invoices alone are not acceptable evidence.                                                                                                                             |

CMHC’s current FAQ discusses modelling requirements, qualified professionals, software requirements, PV limits, fuel switching, and renewable natural gas treatment. ([Canada Mortgage and Housing Corporation][1])

## 10.7 Energy gap generation

For each target level:

```pseudo
required_pct = threshold[level].minimum_pct
actual_pct = result.metrics.adjusted_savings_pct or result.metrics.effective_reduction_pct
gap_pct = max(0, required_pct - actual_pct)
```

The gap output must show:

* current effective savings/reduction;
* required savings/reduction for next level;
* percentage-point shortfall;
* invalid baseline or missing model values;
* missing professional qualification;
* missing modelling report sections;
* missing input/output files;
* missing GHG assumptions;
* PV cap violations;
* unsupported certification.

---

# 11. Accessibility engine

## 11.1 Accessibility prerequisites

Both Level 1 and Level 2 require:

```text
All units are 100% visitable under CSA B651:23
AND
All common areas are barrier-free under CSA B651:23
```

CMHC’s accessibility criteria use CSA B651:23 visitability/barrier-free requirements plus either accessible units, universal design units, or Rick Hansen Foundation Accessibility Certification v4.0 results. ([Canada Mortgage and Housing Corporation][1])

## 11.2 Level 1 rule

Accessibility Level 1 requires the prerequisite plus at least one of:

```text
accessible_units >= 15% of total units
OR
universal_design_units >= 15% of total units
OR
Rick Hansen Foundation Accessibility Certification v4.0 score between 60% and 79%
```

## 11.3 Level 2 rule

Accessibility Level 2 requires the prerequisite plus at least one of:

```text
accessible_units >= 15% of total units AND universal_design_units >= 85% of total units
OR
universal_design_units == 100% of units
OR
accessible_units == 100% of units
OR
Rick Hansen Foundation Accessibility Certification v4.0 Gold / score >= 80%
```

The uploaded Accessibility Criteria Attestation states these Level 1 and Level 2 alternatives. 

## 11.4 Accessibility pseudocode

```pseudo
function evaluateAccessibility(facts, rules):
    result = CriterionResult("ACCESSIBILITY")

    if facts.accessibility.claimed == false:
        return result.noPoints()

    total_units = facts.total_units

    if facts.accessibility.all_units_visitable != true:
        result.fail("ALL_UNITS_NOT_100_PERCENT_VISITABLE")
    if facts.accessibility.common_areas_barrier_free != true:
        result.fail("COMMON_AREAS_NOT_BARRIER_FREE")

    if result.hasFailedPrerequisite():
        result.points = 0
        return result

    accessible_pct = facts.accessibility.accessible_units / total_units * 100
    universal_pct = facts.accessibility.universal_design_units / total_units * 100
    rhfac_score = facts.accessibility.rick_hansen_score

    level2 =
        (accessible_pct >= 15 and universal_pct >= 85)
        or (universal_pct == 100)
        or (accessible_pct == 100)
        or (rhfac_score >= 80)

    level1 =
        (accessible_pct >= 15)
        or (universal_pct >= 15)
        or (rhfac_score >= 60 and rhfac_score <= 79)

    if level2:
        result.level = 2
        result.points = 30
    else if level1:
        result.level = 1
        result.points = 20
    else:
        result.fail("ACCESSIBILITY_BELOW_LEVEL_1")
        result.points = 0

    result.metrics = {
        total_units,
        accessible_units: facts.accessibility.accessible_units,
        accessible_pct,
        universal_design_units: facts.accessibility.universal_design_units,
        universal_pct,
        rhfac_score
    }

    return result
```

## 11.5 Accessibility gap generation

The engine must compute:

```pseudo
required_15pct_units = ceil(total_units * 0.15)
required_85pct_units = ceil(total_units * 0.85)
required_100pct_units = total_units
```

Gap outputs:

* if not 100% visitable: list missing visitability confirmation;
* if common areas not barrier-free: list missing barrier-free confirmation;
* if below Level 1:

  * additional accessible units needed for 15%;
  * additional universal units needed for 15%;
  * RHFAC score gap to 60 if RHFAC route selected;
* if Level 1 but not Level 2:

  * additional universal units needed to reach 85% when accessible ≥15%;
  * additional universal units needed to reach 100%;
  * additional accessible units needed to reach 100%;
  * RHFAC score gap to 80 if RHFAC route selected;
* missing architect/accessibility consultant attestation;
* missing sample accessible/universal unit design;
* missing summary of key accessibility/universal-design features.

CMHC’s Required Documentation Guide states that application documentation for accessibility must include signed confirmation from an architect or designated accessibility consultant, unit-count confirmations, B651:23 visitability/common-area confirmation, applicable accessible/universal-design criteria, Rick Hansen results where applicable, a summary of key features, and a sample accessible/universal unit design. 

---

# 12. Total score, tiers, and product-flexibility engine

## 12.1 Total score calculation

```pseudo
total_points =
    affordability.points
    + affordability.commitment_bonus_points
    + energy.points
    + accessibility.points
```

```pseudo
if total_points >= 100:
    tier = "100_PLUS"
else if total_points >= 70:
    tier = "70_PLUS"
else if total_points >= 50:
    tier = "50_PLUS"
else:
    tier = "BELOW_MINIMUM"
```

## 12.2 Flexibility estimation

The system must estimate, not guarantee, MLI Select flexibilities.

CMHC’s fact sheet shows different flexibilities for new construction and existing properties at 50, 70, and 100-point tiers, including LTV/LTC, amortization, recourse, and replacement-reserve treatment. ([CMHC][2])

The flexibility engine must output:

```text
point_tier
max_ltv_or_ltc_estimate
max_amortization_estimate
recourse_expectation
replacement_reserve_expectation
premium_discount_estimate
warnings
```

## 12.3 Premium discount estimate

The uploaded fees/premiums guide states the MLI Select premium discount schedule as:

|      Points | Discount |
| ----------: | -------: |
|  Minimum 50 |      10% |
|  Minimum 70 |      20% |
| Minimum 100 |      30% |

The system may calculate a premium-discount estimate but must mark it as an estimate subject to current CMHC fees/premiums and lender/CMHC confirmation. 

```pseudo
function estimatePremiumDiscount(points):
    if points >= 100: return 0.30
    if points >= 70: return 0.20
    if points >= 50: return 0.10
    return 0
```

---

# 13. Gap-analysis engine

## 13.1 Gap severity model

Every gap must have severity:

| Severity              | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| **Hard fail**         | Project cannot qualify unless fixed.                              |
| **Scoring gap**       | Project is base eligible but below desired point threshold.       |
| **Evidence gap**      | On-paper rules pass, but document/proof/signature is missing.     |
| **Underwriting risk** | May block lender/CMHC approval or requested flexibility.          |
| **Timing obligation** | Not blocking now, but must be satisfied later.                    |
| **Warning**           | Ambiguous/assumption-based issue requiring reviewer confirmation. |

## 13.2 Gap object schema

```json
{
  "gap_id": "ENERGY_NEW_NECB_LEVEL_2_SHORTFALL",
  "severity": "SCORING_GAP",
  "criterion": "ENERGY_EFFICIENCY",
  "current_state": {
    "effective_savings_pct": 43.2,
    "current_level": 1,
    "current_points": 20
  },
  "target_state": {
    "target_level": 2,
    "required_savings_pct": 50,
    "target_points": 35
  },
  "delta": {
    "percentage_points_short": 6.8
  },
  "recommended_actions": [
    "Update design/model to achieve at least 50% better than 2020 NECB Tier 1.",
    "Upload revised model report and updated Energy Efficiency Criteria Attestation."
  ],
  "documents_required": [
    "Revised energy modelling report",
    "Updated input/output model files",
    "Updated signed energy attestation"
  ],
  "source_rule_ids": [
    "ENERGY_NEW_NECB_LEVEL_2_2020"
  ]
}
```

## 13.3 Minimum path-to-qualification algorithm

The system should compute feasible paths to:

* 50 points;
* 70 points;
* 100 points.

This is a constrained optimization problem over possible point improvements. MVP can implement deterministic heuristics; later versions can implement a more formal cost-minimization engine.

### 13.3.1 Candidate action model

Each candidate action should include:

```json
{
  "action_id": "AFFORDABILITY_ADD_UNITS_LEVEL_1",
  "criterion": "AFFORDABILITY",
  "points_delta": 50,
  "estimated_cost_or_revenue_impact": 120000,
  "time_impact": "medium",
  "requires_professional": false,
  "requires_design_change": false,
  "requires_legal_commitment": true,
  "blocking_dependencies": []
}
```

### 13.3.2 Minimum path pseudocode

```pseudo
function generateQualificationPaths(currentResult, project, targets=[50,70,100]):
    candidates = []

    candidates += affordabilityUpgradeCandidates(project, currentResult.affordability)
    candidates += energyUpgradeCandidates(project, currentResult.energy)
    candidates += accessibilityUpgradeCandidates(project, currentResult.accessibility)
    candidates += commitmentBonusCandidate(project, currentResult.affordability)

    paths = []

    for target in targets:
        point_shortfall = target - currentResult.total_points
        if point_shortfall <= 0:
            paths.append(Path(target, already_met=true))
            continue

        feasible_subsets = findCandidateCombinations(candidates, min_points=point_shortfall)

        ranked = sort(feasible_subsets, by=[
            hard_dependency_count,
            estimated_cost_or_revenue_impact,
            time_impact,
            professional_dependency,
            design_change_required
        ])

        paths.append(bestN(ranked, n=3))

    return paths
```

### 13.3.3 Affordability upgrade candidates

```pseudo
function affordabilityUpgradeCandidates(project, affResult):
    candidates = []

    for targetLevel in [1,2,3]:
        required_count = ceil(total_denominator * threshold[targetLevel].required_pct / 100)
        count_gap = required_count - affResult.eligible_count

        if count_gap > 0:
            cheapest_units = findCheapestUnitsToDesignate(project.units, affResult.rent_cap, count_gap)
            revenue_impact = sum(max(0, unit.rent - affResult.rent_cap) * 12 for unit in cheapest_units)

            candidates.add({
                action: "Designate additional affordable units",
                target_level: targetLevel,
                units_needed: count_gap,
                suggested_units: cheapest_units,
                annual_revenue_impact: revenue_impact,
                points_after: pointsForAffordabilityLevel(targetLevel)
            })

    if project.affordability.claimed and project.affordability.commitment_years < 20:
        candidates.add({
            action: "Extend affordability commitment to 20 years",
            points_delta: 30,
            legal_commitment_required: true
        })

    return candidates
```

### 13.3.4 Energy upgrade candidates

```pseudo
function energyUpgradeCandidates(project, energyResult):
    candidates = []

    for targetLevel in [1,2,3]:
        required_pct = energyThreshold(targetLevel, project.energy.code_basis)
        actual_pct = energyResult.effective_pct
        shortfall = required_pct - actual_pct

        if shortfall > 0:
            candidates.add({
                action: "Improve energy model performance",
                target_level: targetLevel,
                percentage_points_short: shortfall,
                points_after: energyPoints(targetLevel),
                requires_professional: true,
                requires_revised_model: true
            })

    return candidates
```

### 13.3.5 Accessibility upgrade candidates

```pseudo
function accessibilityUpgradeCandidates(project, accessResult):
    candidates = []

    if not accessResult.prerequisites_pass:
        candidates.add({
            action: "Satisfy universal visitability/common-area prerequisite",
            points_delta: "unlocks_accessibility_points",
            blocking: true
        })

    candidates.addIfNeeded({
        action: "Add accessible units to reach 15%",
        units_needed: ceil(total_units * 0.15) - accessible_units,
        points_after: 20
    })

    candidates.addIfNeeded({
        action: "Add universal design units to reach 15%",
        units_needed: ceil(total_units * 0.15) - universal_units,
        points_after: 20
    })

    candidates.addIfNeeded({
        action: "Reach Level 2 via 15% accessible + 85% universal",
        accessible_units_needed: max(0, ceil(total_units * 0.15) - accessible_units),
        universal_units_needed: max(0, ceil(total_units * 0.85) - universal_units),
        points_after: 30
    })

    candidates.addIfNeeded({
        action: "Reach Level 2 via 100% universal design",
        universal_units_needed: total_units - universal_units,
        points_after: 30
    })

    candidates.addIfNeeded({
        action: "Reach Level 2 via 100% accessible units",
        accessible_units_needed: total_units - accessible_units,
        points_after: 30
    })

    return candidates
```

---

# 14. Document-readiness engine

## 14.1 Document readiness states

Each required document must have a state:

| State             | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| Not required      | Criterion not claimed or not applicable.                 |
| Required, missing | Needed but not uploaded/generated.                       |
| Draft generated   | Generated but not reviewed/signed.                       |
| Uploaded          | Uploaded by user but not parsed/validated.               |
| Parsed            | Data extracted and mapped.                               |
| Validated         | Basic consistency checks passed.                         |
| Signed            | Required professional/borrower/lender signature present. |
| Final             | Included in package.                                     |

## 14.2 Document checklist by criterion

### 14.2.1 Affordability

At application:

* pro forma rent roll for new construction;
* current rent roll for existing property;
* affordability calculation exhibit;
* designated affordable unit schedule;
* borrower commitment term;
* evidence that affordable rents meet 30% of median renter income;
* covenant/schedule data for housing loan documentation.

Prior to first advance:

* housing loan documentation signed by borrower with prescribed schedule/covenants as required by CMHC certificate special conditions.

Annually:

* annual certificate of compliance;
* supporting rent roll;
* affordable-unit replacement table where applicable.

The uploaded affordability annual certificate is explicitly a “Mortgagor’s Annual Form Certificate of Compliance” and includes an affordable-unit replacement schedule.  

### 14.2.2 Energy efficiency

At application:

* signed energy-efficiency attestation or confirmation of achievement;
* professional energy/GHG report;
* executive summary comparison table;
* total annual energy consumption and, if applicable, GHG comparison;
* major end-use breakdown;
* physical/operational feature overview;
* input/output modelling files;
* supplemental calculations;
* GHG methodology and assumptions;
* third-party certification evidence if using certification pathway.

Prior to first advance:

* signed housing loan documentation with required schedules/covenants;
* all reports and documents required to confirm criteria.

Within 60 days of final advance, where criteria are achieved after insurance initiation:

* signed borrower attestation stating criteria satisfied;
* supporting documentation.

The Required Documentation Guide contains these energy documentation and timing requirements.  

### 14.2.3 Accessibility

At application:

* signed accessibility attestation;
* signed confirmation from architect/designated accessibility consultant;
* confirmation of 100% visitability;
* confirmation of barrier-free common areas;
* accessible/universal unit count evidence;
* Rick Hansen certification evidence, if claimed;
* summary of key accessibility/universal-design features;
* sample accessible/universal unit design.

Prior to first advance:

* signed housing loan documentation with required schedules/covenants;
* reports/documents confirming applicable criteria.

Within 60 days of final advance, where criteria are achieved after insurance initiation:

* signed attestation stating criteria satisfied;
* supporting documentation.

These requirements are stated in the uploaded Required Documentation Guide. 

## 14.3 Document-readiness pseudocode

```pseudo
function evaluateDocumentReadiness(facts, claimedCriteria, rules):
    checklist = []

    checklist += baseApplicationDocuments(facts)

    if claimedCriteria.affordability.claimed:
        checklist += affordabilityDocuments(facts)

    if claimedCriteria.energy.claimed:
        checklist += energyDocuments(facts)

    if claimedCriteria.accessibility.claimed:
        checklist += accessibilityDocuments(facts)

    for item in checklist:
        item.status = resolveDocumentStatus(item, facts.documents)
        item.blocking = item.required_for_package && item.status not in ["validated", "signed", "final"]

    complete = no item.blocking

    return DocumentReadinessResult(
        complete=complete,
        checklist=checklist,
        missing=filter(checklist, blocking=true)
    )
```

---

# 15. Application package generator

## 15.1 Package generation modes

The system must support three package modes:

| Mode               | Trigger                                                       | Output                                                           |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Draft package**  | Incomplete data or evidence                                   | Watermarked draft with missing fields checklist.                 |
| **Review package** | On-paper qualified, evidence present, some signatures pending | Complete generated docs, signature placeholders, reviewer notes. |
| **Final package**  | Package-ready, all required signatures/doc states satisfied   | Final export bundle.                                             |

## 15.2 Package manifest

Every generated package must include a machine-readable manifest:

```json
{
  "package_id": "pkg_123",
  "project_id": "proj_456",
  "ruleset_id": "mli_select_2025_11_10",
  "generated_at": "2026-06-06T18:00:00Z",
  "package_mode": "review",
  "total_points": 85,
  "criteria_claimed": {
    "affordability": { "claimed": true, "level": 1, "points": 50, "commitment_bonus": 30 },
    "energy": { "claimed": false, "points": 0 },
    "accessibility": { "claimed": true, "level": 1, "points": 20 }
  },
  "documents": [
    {
      "document_type": "cover_letter",
      "filename": "01_cover_letter.pdf",
      "status": "final"
    },
    {
      "document_type": "energy_attestation",
      "filename": "04_energy_efficiency_attestation.pdf",
      "status": "signed"
    }
  ],
  "open_gaps": []
}
```

## 15.3 Required package sections

### 15.3.1 Package cover letter / executive summary

Must include:

* project identity;
* borrower;
* lender;
* property type;
* new/existing;
* unit/bed count;
* non-residential summary;
* loan purpose and requested amount;
* MLI Select points by criterion;
* total points;
* requested product flexibilities;
* key assumptions;
* unresolved warnings;
* ruleset/version used;
* document checklist summary.

### 15.3.2 MLI Select qualification report

Must include:

* base eligibility evaluation;
* affordability calculation;
* energy calculation;
* accessibility calculation;
* total score;
* product tier;
* gap analysis if not final;
* source data used;
* timestamped audit trail.

### 15.3.3 CMHC Request — Certificate of Insurance Multi-Unit

The uploaded `request-certificate-of-insurance-multi-unit.pdf` is a dynamic XFA PDF. It cannot be treated like a normal AcroForm with simple field IDs. The document-generation subsystem must support XFA/XDP data injection or maintain an official form-compatible workflow. A browser-only PDF fill library is unlikely to be sufficient.

Requirements:

1. Maintain a canonical field map from product data to the XFA form structure.
2. Generate an XDP/XML data payload or use a PDF service capable of filling and flattening XFA forms.
3. Render the output for visual QA.
4. Detect missing required fields before export.
5. Store both:

   * the filled PDF, if generated successfully;
   * the machine-readable form-data payload.

Example logical mapping:

```yaml
certificate_request:
  product_selection:
    MLISelect: true
    Market: false
  lender:
    approved_lender_name: project.lender.name
    cmhc_account_number: project.lender.cmhc_account_number
    contact_name: project.lender.contact.name
    contact_email: project.lender.contact.email
  property:
    municipal_address: project.address.full
    legal_description: project.legal_description
    dwelling_type: project.shelter_model
    total_units: project.total_units
    total_beds: project.total_beds
    non_residential_gfa_pct: project.non_residential.gfa_pct
  loan:
    application_purpose: loan.purpose
    requested_amount: loan.amount
    amortization_years: loan.amortization_years
    advancing_type: loan.advancing_type
  mli_select:
    affordability_level: evaluation.affordability.level
    affordability_commitment: project.affordability.commitment_years
    energy_level: evaluation.energy.level
    accessibility_level: evaluation.accessibility.level
    subtotal_points: evaluation.total_points
```

### 15.3.4 Affordability exhibit

For new construction:

* generated pro forma rent roll;
* affordable unit designation schedule;
* rent cap calculation;
* market median renter income source;
* commitment term;
* annual rent-increase constraint note;
* legal/covenant data export for lender.

For existing properties:

* current rent roll;
* designated affordable unit schedule;
* rent cap calculation;
* current compliance status;
* replacement-unit logic if applicable.

The affordability exhibit must be generated even if no official initial affordability attestation form exists in the uploaded package, because CMHC’s Required Documentation Guide points to rent roll evidence and housing loan covenants rather than a standalone initial affordability attestation. 

### 15.3.5 Energy-efficiency package

Must include:

* Energy Efficiency Criteria Attestation, populated with:

  * lender name;
  * project address;
  * professional name/designation/contact;
  * report date;
  * project type;
  * applicable code basis;
  * applicable level;
  * percentage improvement/reduction;
  * date/signature block.

* Generated energy report appendix, including:

  * assessed building vs reference building table;
  * savings formula;
  * GJ/year values;
  * GHG values if applicable;
  * major end-use breakdown;
  * software;
  * professional qualification;
  * supplemental calculations;
  * source file checklist.

The current uploaded attestation form uses 2020 NECB/NBC Tier 1 thresholds for new construction and existing-property reduction thresholds for retrofits/renewals.  

### 15.3.6 Accessibility package

Must include:

* Accessibility Criteria Attestation, populated with:

  * lender name;
  * project address;
  * architect/accessibility consultant details;
  * Level 1 or Level 2 selection;
  * date/signature block.

* Accessibility evidence appendix:

  * visitability confirmation;
  * common-area barrier-free confirmation;
  * accessible unit count;
  * universal design unit count;
  * Rick Hansen score/certification if applicable;
  * summary of accessibility/universal-design features;
  * sample accessible/universal unit design.

### 15.3.7 Achievement-of-social-outcomes package

The uploaded Achievement of Social Outcome Criteria attestation supports post-completion confirmation for energy-efficiency and accessibility commitments, including whether the project meets/exceeds the selected commitment or does not meet it, with deviations described.  

The system must generate this as:

* **not required at initial application** if criteria are only committed to and post-advance confirmation is due later;
* **included as a future obligation** in the package;
* **generated later** when final advance/completion data is available.

### 15.3.8 Annual affordability compliance package

The uploaded annual certificate is for ongoing affordability compliance pursuant to the Social Outcome Covenant. The system must support a future annual compliance workflow that generates:

* annual certificate;
* rent-roll support;
* affordable-unit replacement schedule, if applicable.

This is not a substitute for initial affordability evidence at application.

---

# 16. User flows

## 16.1 Flow A — Create project and quick precheck

1. User creates account or starts anonymous quick check.
2. User enters:

   * location;
   * new/existing;
   * project type;
   * unit/bed count;
   * student/retirement/supportive/SRO status;
   * non-residential percentage;
   * intended affordability/energy/accessibility claims.
3. System runs base gates and rough scoring.
4. System returns:

   * probable eligibility;
   * obvious hard blockers;
   * likely point pathways;
   * minimum data required for full analysis.

Acceptance criteria:

```gherkin
Given a user enters a 4-unit standard rental project
When the precheck is run
Then the system returns Base Ineligible
And the hard fail says minimum 5 units are required
```

```gherkin
Given a user enters student housing and claims affordability
When the precheck is run
Then affordability is marked not available
And energy/accessibility remain evaluable
```

## 16.2 Flow B — Guided full intake

1. User selects “Full Qualification.”
2. System opens guided sections:

   * property;
   * borrower;
   * loan;
   * affordability;
   * energy;
   * accessibility;
   * documents.
3. Each section shows completeness percentage and blocking fields.
4. User can save draft at any time.
5. System reruns evaluation after material changes.

Acceptance criteria:

```gherkin
Given required fields are missing in the energy section
When the user runs full qualification
Then energy points are marked Unknown or Evidence Incomplete
And the missing fields are listed in the gap analysis
```

## 16.3 Flow C — Affordability modelling

1. User uploads or enters rent roll.
2. System resolves median renter income market.
3. System computes monthly affordability rent cap.
4. System identifies eligible affordable units.
5. User can designate units and adjust rents.
6. System recomputes affordability level and revenue impact.
7. System suggests the lowest-concession units to reach Level 1/2/3.

Acceptance criteria:

```gherkin
Given a new construction project with 100 units
And 8 units designated affordable below the rent cap
When affordability scoring is run
Then Level 1 is not achieved
And the gap says 2 additional eligible affordable units are required
```

## 16.4 Flow D — Energy modelling intake

1. User selects modelled or certification pathway.
2. For modelled pathway:

   * user selects new/existing;
   * code basis;
   * reference and assessed values;
   * GHG values if applicable;
   * software;
   * professional;
   * report date.
3. System computes level and points.
4. User uploads report and model files.
5. Professional reviews and signs attestation.

Acceptance criteria:

```gherkin
Given a new construction Part 3 project using 2020 NECB Tier 1
And the project is 52% better than reference
When energy is evaluated
Then energy Level 2 is awarded
And 35 energy points are assigned
```

## 16.5 Flow E — Accessibility intake

1. User enters total units.
2. User confirms all units visitable.
3. User confirms common areas barrier-free.
4. User enters accessible/universal-design unit counts.
5. User optionally enters Rick Hansen score.
6. System computes accessibility level.
7. Accessibility consultant reviews and signs attestation.

Acceptance criteria:

```gherkin
Given a 100-unit project
And all units are visitable
And common areas are barrier-free
And 15 units are accessible
And 85 units are universal design
When accessibility is evaluated
Then Level 2 is awarded
And 30 points are assigned
```

## 16.6 Flow F — Gap analysis

1. User runs qualification.
2. System shows:

   * total points;
   * base gate status;
   * criterion status;
   * evidence status;
   * top recommended paths.
3. User selects target threshold: 50, 70, or 100 points.
4. System displays minimum path options.

Acceptance criteria:

```gherkin
Given a project has 40 points
When the user selects target 50
Then the system shows at least one feasible path if one exists
And each path includes required actions, point impact, and missing documents
```

## 16.7 Flow G — Package generation

1. User clicks “Generate package.”
2. System checks package readiness.
3. If missing data:

   * generate draft only;
   * watermark package;
   * include missing checklist.
4. If ready:

   * generate final package manifest;
   * fill forms;
   * generate exhibits;
   * assemble ZIP/PDF binder;
   * store immutable package snapshot.
5. User downloads or shares with lender.

Acceptance criteria:

```gherkin
Given a project is on-paper qualified
But the energy attestation is unsigned
When the user generates a package
Then the package mode is Review or Draft
And the missing signature appears as a blocking evidence gap
```

## 16.8 Flow H — Lender review

1. Lender receives package link.
2. Lender sees:

   * evaluation summary;
   * documents;
   * audit trail;
   * missing/assumption list.
3. Lender requests changes or approves for export.
4. System records lender review events.

## 16.9 Flow I — Post-final-advance achievement

1. System tracks final advance date.
2. If energy/accessibility criteria were committed but not achieved before insurance initiation, system schedules due date.
3. User enters actual completion data.
4. Professional signs achievement attestation.
5. System generates achievement package.

CMHC states that where energy-efficiency criteria are achieved after insurance initiation, signed attestation and supporting documentation are required within 60 days of final advance or as otherwise prescribed. Similar timing appears in the Required Documentation Guide for energy/accessibility. ([Canada Mortgage and Housing Corporation][1])  

## 16.10 Flow J — Annual affordability compliance

1. System tracks annual reference period.
2. User uploads current rent roll.
3. System compares affordable units to covenant schedule.
4. System identifies replacement units, if any.
5. System generates annual affordability certificate and replacement schedule.

---

# 17. Data model

## 17.1 Core entities

### Project

```yaml
Project:
  id
  owner_account_id
  name
  municipal_address
  legal_description
  province
  municipality
  market_area
  rural_or_urban
  project_status
  new_or_existing
  shelter_model
  total_units
  total_beds
  number_of_buildings
  number_of_storeys
  gross_floor_area
  non_residential:
    exists
    gross_floor_area
    gross_floor_area_pct
    lending_value
    lending_value_pct
    loan_amount
    loan_to_value_pct
  application_date
  expected_first_advance_date
  expected_final_advance_date
```

### Unit

```yaml
Unit:
  id
  project_id
  unit_number
  unit_type
  bedroom_count
  floor_area
  current_rent
  proposed_rent
  mandatory_charges
  utility_treatment
  affordability_rent
  designated_affordable
  accessible
  universal_design
  visitable
```

### Borrower

```yaml
Borrower:
  id
  project_id
  legal_name
  applicant_type
  role
  address
  contact
  net_worth
  liquidity
  management_experience_years
  similar_property_experience
  third_party_property_manager_contract_document_id
```

### Lender

```yaml
Lender:
  id
  name
  cmhc_account_number
  contact_name
  contact_email
  contact_phone
  fi_code
  language_preference
```

### Loan

```yaml
Loan:
  id
  project_id
  purpose
  requested_amount
  total_lending_value
  loan_to_value
  loan_to_cost
  construction_cost
  net_operating_income
  debt_service
  dcr
  amortization_years
  security_type
  interest_type
  number_of_advances
  non_residential_loan_amount
```

### AffordabilityAssessment

```yaml
AffordabilityAssessment:
  id
  project_id
  claimed
  commitment_years
  median_income_market
  median_income_value
  median_income_dataset_version
  monthly_rent_cap
  denominator
  eligible_unit_count
  eligible_unit_pct
  level
  points
  commitment_bonus_points
  rent_roll_document_id
```

### EnergyAssessment

```yaml
EnergyAssessment:
  id
  project_id
  claimed
  pathway # modelled | third_party_certification
  code_basis
  code_version
  building_code_part
  reference_energy_gj
  assessed_energy_gj
  pre_retrofit_energy_gj
  post_retrofit_energy_gj
  reference_ghg_tonnes
  assessed_ghg_tonnes
  pre_retrofit_ghg_tonnes
  post_retrofit_ghg_tonnes
  raw_savings_pct
  adjusted_savings_pct
  effective_reduction_pct
  level
  points
  software
  professional_id
  report_document_id
  model_input_files
  model_output_files
  attestation_document_id
  certification_type
  certification_document_id
```

### AccessibilityAssessment

```yaml
AccessibilityAssessment:
  id
  project_id
  claimed
  all_units_visitable
  common_areas_barrier_free
  accessible_units
  universal_design_units
  rick_hansen_score
  rick_hansen_gold
  level
  points
  professional_id
  attestation_document_id
  sample_design_document_id
  features_summary_document_id
```

### Document

```yaml
Document:
  id
  project_id
  type
  filename
  source # uploaded | generated | signed_external
  status # missing | uploaded | parsed | validated | draft_generated | signed | final
  template_id
  version
  required_for
  uploaded_by
  created_at
  checksum
  extracted_fields
  validation_errors
```

### EvaluationResult

```yaml
EvaluationResult:
  id
  project_id
  ruleset_id
  generated_at
  base_eligible
  score_qualified
  on_paper_qualified
  package_ready
  total_points
  point_tier
  component_results
  gaps
  assumptions
  document_readiness
  flexibilities
```

### RuleSet

```yaml
RuleSet:
  id
  name
  version
  effective_from
  effective_to
  source_references
  affordability_thresholds
  energy_thresholds
  accessibility_rules
  eligibility_gates
  dcr_rules
  flexibility_rules
  fee_rules
  premium_discount_rules
```

---

# 18. Document-template architecture

## 18.1 Template registry

The system must maintain a registry of official and generated templates:

```yaml
DocumentTemplate:
  id
  name
  source
  source_revision_date
  effective_from
  effective_to
  template_type # pdf_acroform | pdf_xfa | generated_pdf | docx | spreadsheet
  fill_strategy
  field_map
  validation_rules
  required_signatures
```

## 18.2 Fill strategies

| Template type        | Strategy                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| Static generated PDF | Render from internal HTML/PDF template.                                           |
| AcroForm PDF         | Fill fields directly, then flatten.                                               |
| XFA PDF              | Generate XDP/XML data or fill using XFA-capable service; visually QA and flatten. |
| Spreadsheet          | Generate workbook with locked formulas and source metadata.                       |
| DOCX                 | Generate from placeholders and convert/export if needed.                          |

The Request Certificate form is XFA and should be treated as a specialized fill target, not a normal PDF.

## 18.3 Field-map schema

```yaml
FieldMapEntry:
  logical_field: "project.municipal_address"
  template_field_path: "xfa.form...Property.Address.MunicipalAddress"
  required: true
  transform: "formatAddress"
  validation:
    - non_empty
  source_priority:
    - project.municipal_address
    - project.address.full
```

## 18.4 Generated document QA

Before a generated package can be marked final, the system must:

1. validate all required logical fields;
2. generate each document;
3. render each generated PDF to image previews;
4. run field-presence checks;
5. verify no placeholder tokens remain;
6. verify all required signatures are either present or explicitly marked pending;
7. compute and store document checksums;
8. freeze the package snapshot.

---

# 19. Reporting and UI requirements

## 19.1 Dashboard

Project dashboard must show:

```text
Project name
Status
Base eligibility
Total points
Point tier
Affordability points
Energy points
Accessibility points
Commitment bonus
Package readiness
Open hard fails
Open evidence gaps
Next recommended action
```

## 19.2 Qualification report UI

Must show:

* ruleset version;
* score waterfall;
* pass/fail gates;
* calculation detail;
* assumptions;
* source data;
* gap cards;
* path-to-qualification options;
* document readiness.

## 19.3 Gap card UI

Each gap card must include:

```text
Severity
Criterion
Current value
Required value
Delta
Why it matters
How to fix
Documents affected
Points impact
Estimated effort
```

## 19.4 Scenario modelling

The UI should allow users to duplicate scenarios:

* “Add 5 affordable units”
* “Extend affordability to 20 years”
* “Upgrade energy from Level 1 to Level 2”
* “Use accessibility Level 2 via 100% universal design”
* “Switch from affordability-heavy to energy/accessibility-heavy path”

Scenarios must be stored separately and must not overwrite the official package scenario unless promoted.

---

# 20. Admin requirements

## 20.1 Rules admin

Admins must be able to:

* create ruleset draft;
* edit thresholds;
* edit effective dates;
* attach source documents;
* run regression tests;
* publish ruleset;
* deprecate ruleset.

## 20.2 Dataset admin

Admins must be able to upload/version:

* median renter income dataset;
* CPI/rent-increase table;
* third-party certification mapping;
* fee/premium tables;
* lender-specific document requirements.

## 20.3 Template admin

Admins must be able to:

* upload official form templates;
* define template type;
* maintain field maps;
* preview generated outputs;
* run placeholder checks;
* publish template versions.

## 20.4 Regression test suite

Every ruleset/template change must run tests such as:

```text
New construction, 100 units, 10 affordable units, 10-year commitment → 50 affordability points.
New construction, 100 units, 9 affordable units → 0 affordability points and 1-unit gap.
Existing property, 100 units, 40 affordable units → 50 affordability points.
NECB new construction, 49.9% better → Level 1 energy.
NECB new construction, 50.0% better → Level 2 energy.
Existing energy, 30% energy reduction and 20% GHG reduction → Level 1 only if effective reduction uses min(30,20)=20.
Accessibility without 100% visitability → 0 accessibility points even if 15% units accessible.
Accessibility with 100% visitability, barrier-free common areas, 15% accessible → Level 1.
Accessibility with 100% visitability, barrier-free common areas, RHFAC 80 → Level 2.
Student housing claiming affordability → affordability not available.
Retirement project with 49 beds → base ineligible.
Non-residential GFA 31% → base ineligible.
```

---

# 21. Security, privacy, and compliance

## 21.1 Data sensitivity

The system will store sensitive commercial, financial, and personal information:

* borrower net worth;
* ownership details;
* rent rolls;
* lender contacts;
* project financing;
* professional signatures;
* property valuation and legal descriptions.

Requirements:

* encryption at rest;
* encryption in transit;
* role-based access control;
* tenant/account isolation;
* audit logs;
* immutable package snapshots;
* signed URL expiration for document sharing;
* configurable data-retention policy;
* PIPEDA-aligned privacy controls for Canadian users.

## 21.2 Access roles

| Role                       | Permissions                             |
| -------------------------- | --------------------------------------- |
| Project owner              | Full project edit, package generation.  |
| Contributor                | Edit assigned sections only.            |
| Energy professional        | Edit/sign energy section only.          |
| Accessibility professional | Edit/sign accessibility section only.   |
| Lender reviewer            | View package, comment, request changes. |
| Admin                      | Manage rules/templates/datasets.        |

## 21.3 Audit events

Audit log must record:

```text
user login
project created
input changed
rule evaluation run
document uploaded
document generated
document signed
package generated
package downloaded
lender viewed
ruleset changed
template changed
```

Each event must store timestamp, user ID, project ID, before/after values where appropriate, and IP/device metadata where legally acceptable.

---

# 22. Non-functional requirements

## 22.1 Correctness

* All scoring must be deterministic.
* All calculations must be reproducible from stored facts.
* All generated packages must include ruleset and dataset versions.
* No silent fallback for missing eligibility data.
* Unknown values must not be treated as passing.

## 22.2 Performance

MVP targets:

| Operation                |                         Target |
| ------------------------ | -----------------------------: |
| Run qualification engine | <2 seconds for typical project |
| Upload/parse rent roll   |    <10 seconds for 1,000 units |
| Generate draft package   |                    <30 seconds |
| Generate final package   |                    <60 seconds |
| Render PDF previews      |   <60 seconds for full package |

## 22.3 Reliability

* Package generation must be idempotent for the same package snapshot.
* Failed document generation must not corrupt existing package snapshots.
* Long-running generation jobs must be resumable/retriable.
* Generated package must have manifest and checksum.

## 22.4 Observability

Metrics:

```text
qualification_runs_total
qualification_failures_by_gate
average_points_by_project_type
package_generation_success_rate
template_generation_failure_rate
ruleset_version_usage
document_missing_rate_by_type
```

Logs:

* rule evaluation traces;
* document fill traces;
* validation errors;
* template rendering errors.

---

# 23. Acceptance criteria by major feature

## 23.1 Base eligibility

```gherkin
Given a standard rental project with 5 units
And non-residential space is 0%
When base eligibility is evaluated
Then minimum unit count passes
```

```gherkin
Given a mixed-use project
And non-residential GFA is 35%
When base eligibility is evaluated
Then the project fails the non-residential GFA gate
```

## 23.2 Affordability

```gherkin
Given a 100-unit new construction project
And the monthly rent cap is $1,250
And 10 designated units have affordability rent <= $1,250
And commitment term is 10 years
When affordability is evaluated
Then Level 1 affordability is awarded
And 50 points are assigned
```

```gherkin
Given a 100-unit existing property
And 59 designated units are below the rent cap
When affordability is evaluated
Then Level 2 affordability is not awarded
And the gap says 1 additional eligible affordable unit is needed for Level 2
```

## 23.3 Energy

```gherkin
Given a new construction project using 2020 NBC Tier 1
And energy improvement is 70%
When energy is evaluated
Then Level 3 energy is awarded
And 50 points are assigned
```

```gherkin
Given an existing property
And energy reduction is 40%
And GHG reduction is 20%
When energy is evaluated
Then the effective reduction is 20%
And Level 1 is awarded, not Level 3
```

## 23.4 Accessibility

```gherkin
Given all units are visitable
And all common areas are barrier-free
And Rick Hansen v4.0 score is 75
When accessibility is evaluated
Then Level 1 accessibility is awarded
And 20 points are assigned
```

```gherkin
Given 100% of units are universal design
But common areas are not confirmed barrier-free
When accessibility is evaluated
Then accessibility points are 0
And the prerequisite gap is shown
```

## 23.5 Package generation

```gherkin
Given a project is on-paper qualified with 80 points
And all required documents are validated
And all required signatures are present
When the user generates a final package
Then the system creates a package manifest
And generates all required documents
And marks the package as final
```

```gherkin
Given a project is on-paper qualified
But the accessibility sample design is missing
When the user generates a package
Then the package is generated in draft or review mode
And the missing sample design appears as a blocking evidence gap
```

---

# 24. Critical implementation notes for engineering

## 24.1 Do not hard-code rules in UI

Rules must be data-driven:

```text
UI displays rules from ruleset
Engine evaluates rules from same ruleset
Reports cite same ruleset
Generated package stores same ruleset ID
```

## 24.2 Treat missing data as unknown, not false

Example:

```pseudo
if energy.reference_energy_gj is null:
    energy.status = "UNKNOWN"
    energy.points = 0
    energy.gap = "Reference building energy missing"
```

The system must not infer qualification from missing evidence.

## 24.3 Separate planned design from achieved result

The system must model both:

```yaml
planned_commitment:
  affordability
  energy
  accessibility

achieved_result:
  affordability_annual
  energy_completion
  accessibility_completion
```

This matters because energy/accessibility may be committed at application but require achievement evidence after final advance. CMHC materials distinguish application-time commitment/confirmation from post-final-advance achievement documentation. ([Canada Mortgage and Housing Corporation][1])

## 24.4 Package should include obligations calendar

For every project, generate:

```text
Before application:
  - required initial docs

Prior to first advance:
  - loan documentation/covenants

Within 60 days of final advance:
  - energy/accessibility achievement docs if applicable

Annually:
  - affordability certificate and rent roll, if affordability claimed
```

## 24.5 XFA form handling is a project risk

The request-certificate form is dynamic XFA. Engineering must validate the chosen PDF generation approach early. A proof-of-concept should be a P0 milestone before committing to “fully automated official PDF completion.”

Fallback if official XFA generation is not reliable:

1. generate a complete machine-readable data packet;
2. generate a human-readable field-by-field application summary;
3. generate all non-XFA exhibits;
4. leave the official certificate request to lender/manual workflow until XFA support is validated.

---

# 25. MVP release plan

## Phase 1 — Rules engine and precheck

Deliver:

* project intake;
* base eligibility;
* affordability/energy/accessibility scoring;
* total points;
* preliminary gap analysis;
* ruleset versioning.

## Phase 2 — Full intake and document readiness

Deliver:

* rent-roll upload;
* median income lookup;
* energy report/evidence upload;
* accessibility evidence upload;
* document-readiness engine;
* reviewer workflows.

## Phase 3 — Package generation

Deliver:

* cover letter;
* qualification report;
* affordability exhibit;
* energy attestation generator;
* accessibility attestation generator;
* document manifest;
* draft/final package modes.

## Phase 4 — Official form automation

Deliver:

* XFA certificate request field map;
* XDP/XML data payload generation;
* XFA fill/flatten service;
* visual QA;
* regression suite for template updates.

## Phase 5 — Compliance lifecycle

Deliver:

* post-final-advance achievement workflow;
* annual affordability certificate workflow;
* reminders and obligation tracking.

---

# 26. Key product risks

| Risk                                   | Impact                                     | Mitigation                                                                        |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| CMHC rules change                      | Incorrect qualification                    | Versioned rulesets, admin workflow, source monitoring.                            |
| XFA PDF automation fails               | Cannot fully auto-fill certificate request | Early POC; XDP workflow; fallback data packet.                                    |
| Median income mapping ambiguity        | Wrong affordability cap                    | Require user/reviewer market confirmation and preserve fallback assumptions.      |
| Energy model garbage-in/garbage-out    | False qualification                        | Require professional attestation, report upload, consistency checks, disclaimers. |
| Accessibility interpretation ambiguity | False qualification                        | Require architect/accessibility consultant sign-off.                              |
| Legal covenant drafting                | Incomplete affordability commitment        | Generate covenant data schedule, not legal advice; lender/legal review required.  |
| User mistakes rent inclusions          | Wrong affordability result                 | Require mandatory charge/utility treatment inputs and reviewer confirmation.      |
| Stale fee/premium estimates            | Incorrect economics                        | Version fee table and mark as estimate.                                           |

---

# 27. Final system behavior summary

The system should behave as follows:

```pseudo
if base_eligibility_fails:
    show "Not eligible under current MLI Select base gates"
    show hard-fail checklist
    disable final package generation

else if total_points < 50:
    show "Base eligible but below minimum MLI Select score"
    show current points
    show minimum paths to 50/70/100
    enable draft report only

else if total_points >= 50 and evidence_incomplete:
    show "On-paper qualifies, but package is not application-ready"
    show evidence checklist
    enable draft/review package

else:
    show "Package ready for lender review"
    enable final package generation
    generate package manifest
    generate filled forms/exhibits
    freeze package snapshot
```

The core engineering challenge is not the arithmetic. It is the combination of **versioned regulatory rules**, **auditable gap explanations**, **professional-evidence workflows**, and **form-generation correctness**. The product should be designed as a compliance workflow engine first, with scoring and document generation as deterministic outputs of the same underlying project facts.

[1]: https://www.cmhc-schl.gc.ca/professionals/project-funding-and-mortgage-financing/mortgage-loan-insurance/multi-unit-insurance/mliselect "MLI Select | CMHC"
[2]: https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/project-funding-and-mortgage-financing/mortgage-loan-insurance/multi-unit-insurance/mliselect/mli-select.pdf "Multi-unit CMHC MLI Select"
