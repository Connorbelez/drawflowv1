# Will It Pencil Feature Spec

**Product:** DrawFlow / FairLend Construction Draw Management  
**Feature:** Pre-milestone "Will It Pencil?" feasibility step  
**Date:** 2026-06-20  
**Status:** Exploratory spec for product and engineering review  
**Primary research artifact:** `docs/research/will-it-pencil-research.md`

## 1. Executive Summary

"Will It Pencil?" is a new Build Proposal step that runs before the milestone worksheet. It helps the borrower, broker, and lender understand whether a proposed site/build intent is likely viable from zoning and rental-market perspectives before the user edits milestone budgets, dependencies, and draw plans.

The step should:

- geocode and confirm the build site,
- show the parcel/neighborhood on a map,
- overlay municipal zoning and zoning-derived constraints,
- overlay rental-market information at the highest trustworthy spatial resolution available,
- evaluate the user's build intent against a versioned zoning rule pack,
- estimate rental revenue scenarios from trusted market data,
- return a source-stamped feasibility assessment,
- preserve the assessment in the Build Proposal snapshot and audit trail.

The feature must not claim municipal approval, legal compliance, permit readiness, or final underwriting approval. It should produce a confidence-scored feasibility result and make source limitations explicit.

## 2. Recommendation

Build v1 as a Toronto-first, connector-registry-backed feature.

Reasons:

- Toronto has the strongest verified public data stack: zoning, overlays, property boundaries, and address points.
- Toronto's Open Government Licence is compatible with commercial reuse, transformation, storage, and product display with attribution.
- The feature is still architected for GTA-wide expansion through municipal connectors, but it should not promise full GTA automated coverage until each jurisdiction's licence and rule-pack coverage are verified.

V1 should support:

- Toronto address/parcel resolution.
- Toronto zoning lookup and key overlay lookup.
- Toronto low-rise/multiplex/ARU-oriented rule checks with confidence labels.
- CMHC/StatsCan rental baseline and asking-rent sensitivity.
- Manual review state when data is missing, stale, legally uncertain, or source-limited.

Phase 2 should add Oakville, Burlington, and possibly Markham after licence/rule review. Mississauga should not be bulk-ingested until FairLend has legal approval or written municipal permission because its ArcGIS item text restricts copying/modifying GIS data without written consent.

## 3. Product Placement

### 3.1 Current proposal flow

Current Build Proposal creation includes:

1. Build identity and site.
2. Permits/documents.
3. Budget, borrower working capital, and co-pay assumptions.
4. Construction template.
5. Milestones, durations, dependencies, and costs.
6. Contractors.
7. Draw plan comparison.
8. Preferred plan.
9. Proposal submission.

### 3.2 New flow

Insert "Will It Pencil?" after site/build-intent intake and before the milestone worksheet.

Recommended flow:

1. Build identity and site.
2. Build intent and preliminary assumptions.
3. **Will It Pencil?**
4. Permits/documents, or permit status confirmation.
5. Budget, borrower working capital, and co-pay assumptions.
6. Construction template.
7. Milestone worksheet.
8. Draw plan comparison.
9. Proposal submission.

If the existing UX keeps permits and budget before the step, "Will It Pencil?" should still run before milestone editing and use whatever budget/capital values are available.

## 4. Goals

1. Reduce wasted milestone-planning work on sites/build intents that clearly do not fit zoning or market assumptions.
2. Give lenders a consistent, source-backed site-feasibility package during proposal review.
3. Preserve source provenance, data freshness, and user overrides in audit history.
4. Make rental assumptions explicit before draw plans are optimized.
5. Support expansion beyond Toronto through a municipal connector model instead of hard-coded one-off integrations.

## 5. Non-Goals

- Do not issue legal zoning opinions.
- Do not replace municipal planning review, building permits, site plan approval, conservation permits, or lender underwriting.
- Do not scrape public reports or map apps in violation of terms.
- Do not claim complete GTA coverage until connector licences and rule packs are verified.
- Do not store municipal GIS data where source terms prohibit copying or modification.
- Do not mutate budgets or proposal assumptions without creating a versioned record.

## 6. Personas

### Builder / Developer Borrower

Wants to know if the site and intended unit count/build type are plausible before investing time in milestone planning.

Needs:

- map confirmation,
- obvious zoning/rent warnings,
- source-backed explanation,
- ability to proceed with warning if lender allows.

### Broker

Wants to triage deal quality and avoid submitting weak proposals to lenders.

Needs:

- summarized zoning/rent feasibility,
- downloadable/source-stamped evidence,
- override/request-more-info workflow.

### Lender Staff

Reviews submitted proposals and routes ambiguous cases.

Needs:

- source confidence,
- warnings,
- audit history,
- reviewer notes,
- escalation to lender admin.

### Lender Admin

Has final proposal/milestone/draw authority.

Needs:

- final override authority,
- explicit reasons,
- audit trail,
- source details for compliance review.

## 7. User Stories

1. As a builder, I enter a site address and see the parcel/neighborhood map so I can confirm DrawFlow is evaluating the right site.
2. As a builder, I choose a build intent such as duplex, triplex, fourplex, sixplex, garden suite, laneway suite, or purpose-built rental so DrawFlow can evaluate the correct zoning rules.
3. As a builder, I see the zoning category, zone code, overlays, height/coverage constraints, and warnings so I know whether to continue.
4. As a builder, I see rental-market assumptions for the area and unit mix so I can sanity-check revenue before milestone budgeting.
5. As a broker, I can see why a site passed, failed, or needs review, with source links and data-as-of dates.
6. As lender staff, I can require more information or route ambiguous zoning warnings to lender admin.
7. As lender admin, I can allow a proposal to continue despite warnings by entering a reason that becomes an audit event.
8. As an auditor, I can reconstruct which source data, rule pack, user inputs, and overrides produced the assessment.

## 8. Core UX

### 8.1 Step header

Title: `Will it pencil?`

Subtext should be concise and product-specific:

> Zoning, rental market, and site-risk check before milestone planning.

Avoid language like "approved", "permit ready", or "guaranteed compliant".

### 8.2 Inputs

Required:

- build address,
- municipality,
- build intent,
- proposed unit count,
- unit mix by bedroom count,
- whether the project is new construction, conversion, addition, garden suite, laneway suite, or other,
- preliminary total project cost if already known,
- preliminary borrower working capital if already known.

Conditional:

- lot survey or site plan upload,
- existing dwelling retained/demolished,
- parking count,
- proposed gross floor area,
- proposed building height/storeys,
- proposed lot coverage,
- basement units,
- servicing confirmation,
- heritage/conservation context confirmation.

### 8.3 Map panel

Map layers:

- base map,
- selected parcel,
- address point,
- zoning area,
- height overlay,
- lot coverage overlay,
- policy/exception overlays,
- major transit station area,
- conservation/hazard overlays where licensed,
- rental market choropleth or heatmap,
- comparable listing pins only when licensed.

Map requirements:

- Show source and `dataAsOf` per visible layer.
- Let user toggle layers.
- Let user click zoning polygons for source attributes.
- Keep parcel confirmation separate from zoning result.
- Show coarse rental data as coarse geography, not parcel-level false precision.

### 8.4 Result cards

Use four result groups:

1. `Site`
   - address match,
   - parcel confidence,
   - municipality,
   - source confidence.

2. `Zoning`
   - zone code,
   - zone category,
   - overlays,
   - allowed/conditional/not allowed build-type result,
   - missing-rule warnings,
   - legal source links.

3. `Rental Market`
   - baseline monthly rent by unit type,
   - asking-rent sensitivity where available,
   - vacancy/turnover where available,
   - gross monthly rent range,
   - confidence and data granularity.

4. `DrawFlow Feasibility`
   - high-level status,
   - budget/capital stress flags when budget/capital data is present,
   - required follow-up,
   - allowed next action.

### 8.5 Status model

Use these user-facing states:

- `Likely pencils`
- `Pencils with warnings`
- `Does not pencil`
- `Needs review`
- `Insufficient data`

Internal machine states:

- `draft`
- `running`
- `complete_pass`
- `complete_warn`
- `complete_fail`
- `needs_review`
- `blocked_by_missing_input`
- `blocked_by_source_terms`
- `stale`
- `superseded`

### 8.6 Proceed behavior

| Assessment state | Default action | Override |
| --- | --- | --- |
| Likely pencils | Continue to milestone worksheet | None needed |
| Pencils with warnings | Continue allowed with warning acknowledgment | Broker/lender policy can require review |
| Does not pencil | Continue blocked | Lender admin override only |
| Needs review | Continue blocked or allowed by policy | Broker/lender staff review |
| Insufficient data | Continue allowed only if policy allows | Reason required |
| Source terms block automated data | Continue with manual zoning upload or paid source | Admin/legal config |

Proceeding despite warning creates an audit event with actor, role, timestamp, assessment version, prior/new status, warnings, and reason.

## 9. Feasibility Logic

### 9.1 Assessment dimensions

The final assessment is composed from:

- address confidence,
- parcel confidence,
- zoning map match,
- zoning rule result,
- overlay hazards,
- rental-market confidence,
- rental revenue scenario,
- budget/capital stress,
- source freshness,
- source licence/use mode.

### 9.2 Zoning result scale

Each rule check returns:

- `pass`
- `warning`
- `fail`
- `unknown`
- `not_applicable`

Rule checks should include:

- zone use category,
- proposed build type allowed/conditional/prohibited,
- max units,
- height/storeys,
- lot coverage,
- FSI/density,
- minimum frontage/lot area,
- setbacks where source/rule supports,
- parking,
- holding symbol,
- site-specific exception,
- not-part-of-bylaw,
- heritage/conservation/Greenbelt/regulated-area warnings,
- major transit station area context,
- ARU override applicability.

### 9.3 Rental result scale

Rental checks return:

- `strong_market_support`
- `moderate_market_support`
- `weak_market_support`
- `insufficient_market_data`

Inputs:

- unit mix,
- source geography,
- baseline rent,
- market asking rent if available,
- vacancy,
- rent suppression/reliability code,
- data age,
- sample size if listing feed exists.

Calculations:

```text
grossMonthlyRent = sum(unitCountByType * underwrittenRentByType)
grossAnnualRent = grossMonthlyRent * 12
vacancyLoss = grossAnnualRent * vacancyAssumption
effectiveGrossIncome = grossAnnualRent - vacancyLoss
operatingExpenseEstimate = effectiveGrossIncome * opexRatioAssumption
noiEstimate = effectiveGrossIncome - operatingExpenseEstimate
rentConfidence = sourceConfidence * geographyConfidence * freshnessConfidence
```

The output should label assumptions clearly. Example:

```text
Underwritten rent uses the lower of CMHC/StatsCan baseline and 90% of current asking-rent signal when both are available.
```

### 9.4 DrawFlow feasibility result

If preliminary project cost and borrower working capital are available:

```text
workingCapitalStress = estimatedFrontFundedCostBeforeFirstDraw / borrowerWorkingCapitalLimit
rentToCostRatio = annualUnderwrittenRent / totalProjectCost
warning if workingCapitalStress > lenderPolicy.maxPreDrawCapitalRatio
warning if rentConfidence < lenderPolicy.minRentConfidence
warning if zoningConfidence < lenderPolicy.minZoningConfidence
```

This should not replace Draw Plan Comparison. It is an early signal that affects whether milestone planning is worth starting.

## 10. Data Sources and Integration

### 10.1 Source registry

Add a source registry owned by the geospatial service and mirrored into Convex for proposal snapshots.

Fields:

```ts
type SourceRegistryEntry = {
  sourceId: string;
  jurisdiction: string;
  sourceName: string;
  sourceType:
    | "zoning"
    | "zoning_overlay"
    | "parcel"
    | "address"
    | "rental_market"
    | "rental_listing"
    | "hazard"
    | "heritage"
    | "official_plan";
  sourceUrl: string;
  apiUrl?: string;
  licenceUrl?: string;
  sourceUseMode:
    | "ingestable"
    | "live_query_only"
    | "manual_reference_only"
    | "commercial_license_required";
  allowedOperations: Array<"query" | "copy" | "transform" | "tile" | "display" | "export_report">;
  refreshCadenceDays: number;
  sourceVersionLabel?: string;
  sourceAsOf?: string;
  lastFetchedAt?: string;
  lastSuccessfulTransformAt?: string;
  sourceHash?: string;
  requiresAttribution: boolean;
  attributionText?: string;
  confidence: "high" | "medium" | "low";
  knownLimitations: string[];
};
```

### 10.2 MVP source configuration

#### Toronto zoning

- CKAN API: `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=zoning-by-law`
- ArcGIS service: `https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer`
- Use mode: `ingestable`
- Refresh: weekly package metadata check; monthly geometry refresh; immediate manual refresh when amendment watchlist changes.
- Attribution: City of Toronto Open Data.

#### Toronto property boundaries

- CKAN API: `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=property-boundaries`
- Use mode: `ingestable`
- Refresh: monthly.
- Warning: not survey-grade.

#### Toronto address points

- CKAN API: `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=address-points-municipal-toronto-one-address-repository`
- Use mode: `ingestable`
- Refresh: monthly.

#### Rental baseline

- StatsCan 46-10-0092 CSV ZIP: `https://www150.statcan.gc.ca/n1/en/tbl/csv/46100092-eng.zip`
- StatsCan 34-10-0133 CSV ZIP: `https://www150.statcan.gc.ca/n1/en/tbl/csv/34100133-eng.zip`
- CMHC Rental Market Survey tables: manual/semi-automated ingest after terms review.
- Use mode: `ingestable` for StatsCan table exports, subject to attribution/licence review.
- Refresh: monthly check for StatsCan; annual CMHC.

#### Optional paid/commercial

- Zoneomics API for zoning/property fallback.
- LightBox for parcel/zoning/property data.
- Teranet/GeoWarehouse/MPAC for authoritative parcels/property info.
- Rentals.ca/Urbanation/Rentsync/Zumper feed for live asking-rent comparable overlay.

### 10.3 Phase-2 source configuration

Add only after legal and connector QA:

- Oakville zoning 2014-014/2009-189.
- Burlington zoning.
- Markham zoning/open data.
- Mississauga only if legal approves live-query-only or FairLend obtains written permission/commercial agreement.

## 11. Architecture

### 11.1 Components

```text
React / TanStack Start UI
  |
  | Convex queries/mutations/actions
  v
Convex product backend
  - Build Proposal
  - Will It Pencil assessment records
  - audit events
  - source snapshots
  - organization scoping
  |
  | service-to-service call from Convex action
  v
Geospatial service
  - address/parcel/zoning/rental lookup APIs
  - rule engine
  - source registry
  - vector tile metadata
  |
  v
PostGIS
  - municipal zoning polygons
  - parcel/address layers
  - rental geographies
  - source snapshots
  |
  v
Object storage
  - raw source files
  - transformed GeoJSON/GPKG
  - PMTiles/vector-tile artifacts
```

### 11.2 Why not only Convex?

Convex remains correct for product state, tenancy, auth, audit, and workflow. It is not the right place for large polygon datasets, spatial indexes, vector tiles, or point-in-polygon joins. Keep geospatial work in PostGIS and persist only compact, source-stamped results into Convex.

### 11.3 Geospatial service options

Recommended stack:

- Bun or Node service for API orchestration, consistent with project runtime.
- PostGIS on Neon, Crunchy, Supabase, RDS, or another managed Postgres.
- GDAL/ogr2ogr pipeline for GeoJSON/GPKG/SHP ingestion.
- Tippecanoe + PMTiles for static tile artifacts or Martin/pg_tileserv for dynamic tiles.
- MapLibre GL JS in frontend.
- Turf.js only for light client calculations, not authoritative compliance.

### 11.4 Data pipeline

1. Fetch source metadata.
2. Download raw source into object storage.
3. Hash raw source.
4. Validate licence/use mode.
5. Transform geometry to canonical CRS.
6. Load to staging PostGIS tables.
7. Validate row counts, geometry validity, expected fields, and bounding boxes.
8. Promote staging to active source version.
9. Generate tiles.
10. Update source registry.
11. Emit operational alerts for failure, source schema drift, or stale data.

### 11.5 Coordinate systems

Store:

- canonical geometry in WGS84/EPSG:4326 for web rendering,
- original source geometry where useful,
- projected geometry or geography calculations for area/distance.

For Toronto, EPSG:2952 source variants are useful for local metric geometry. For cross-GTA calculations, use PostGIS geography or a consistent projected CRS and document metric precision.

## 12. Backend Data Model

### 12.1 Convex product tables

These should be organization-scoped.

#### `siteFeasibilityAssessments`

```ts
type SiteFeasibilityAssessment = {
  _id: Id<"siteFeasibilityAssessments">;
  organizationId: Id<"organizations">;
  buildProposalId: Id<"buildProposals">;
  version: number;
  status:
    | "draft"
    | "running"
    | "complete_pass"
    | "complete_warn"
    | "complete_fail"
    | "needs_review"
    | "blocked_by_missing_input"
    | "blocked_by_source_terms"
    | "stale"
    | "superseded";
  userFacingStatus:
    | "likely_pencils"
    | "pencils_with_warnings"
    | "does_not_pencil"
    | "needs_review"
    | "insufficient_data";
  addressInput: string;
  normalizedAddress?: string;
  municipality?: string;
  buildIntent: BuildIntent;
  unitMix: UnitMix;
  preliminaryBudgetCents?: number;
  borrowerWorkingCapitalLimitCents?: number;
  siteResult?: SiteResultSnapshot;
  zoningResult?: ZoningResultSnapshot;
  rentalResult?: RentalResultSnapshot;
  drawflowFeasibilityResult?: DrawflowFeasibilitySnapshot;
  sourceSnapshotIds: Id<"siteFeasibilitySourceSnapshots">[];
  warnings: FeasibilityWarning[];
  blockers: FeasibilityBlocker[];
  createdByUserId: Id<"users">;
  createdAt: number;
  updatedAt: number;
  supersededByAssessmentId?: Id<"siteFeasibilityAssessments">;
};
```

#### `siteFeasibilitySourceSnapshots`

```ts
type SiteFeasibilitySourceSnapshot = {
  _id: Id<"siteFeasibilitySourceSnapshots">;
  organizationId: Id<"organizations">;
  assessmentId: Id<"siteFeasibilityAssessments">;
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  sourceType: string;
  sourceUrl: string;
  apiUrl?: string;
  licenceUrl?: string;
  sourceUseMode: string;
  sourceVersionLabel?: string;
  sourceAsOf?: string;
  fetchedAt?: number;
  sourceHash?: string;
  attributionText?: string;
  knownLimitations: string[];
};
```

#### `siteFeasibilityOverrides`

```ts
type SiteFeasibilityOverride = {
  _id: Id<"siteFeasibilityOverrides">;
  organizationId: Id<"organizations">;
  assessmentId: Id<"siteFeasibilityAssessments">;
  buildProposalId: Id<"buildProposals">;
  priorStatus: string;
  newStatus: string;
  reason: string;
  actorUserId: Id<"users">;
  actorRole: "builder" | "broker" | "lenderStaff" | "lenderAdmin" | "platformAdmin";
  createdAt: number;
};
```

#### Existing proposal linkage

Add to the Build Proposal record:

```ts
willItPencilAssessmentId?: Id<"siteFeasibilityAssessments">;
willItPencilStatus?: "likely_pencils" | "pencils_with_warnings" | "does_not_pencil" | "needs_review" | "insufficient_data";
```

Submitted proposals must freeze the assessment snapshot.

### 12.2 Geospatial service tables

#### `geo_sources`

Stores the source registry.

#### `geo_source_versions`

Stores fetches, hashes, transformation results, schema snapshots, and active/inactive status.

#### `geo_zoning_polygons`

Canonical zoning polygons:

- `source_version_id`
- `jurisdiction`
- `zone_code`
- `zone_category`
- `zone_label`
- `bylaw`
- `raw_attributes`
- `geom`
- `geom_web`

#### `geo_zoning_overlays`

Height, lot coverage, policy area, parking, rooming/multi-tenant house, setback, not-part-of-bylaw, holding, exception, heritage, transit, conservation, and environmental overlays.

#### `geo_parcels`

Parcel/property boundaries where allowed.

#### `geo_address_points`

Municipal address points and geocoder cache where terms allow.

#### `rental_market_observations`

Normalized CMHC/StatsCan/commercial rent data:

- `source_version_id`
- `geography_type`
- `geography_id`
- `period`
- `metric`
- `unit_type`
- `bedroom_count`
- `value`
- `uom`
- `status_code`
- `reliability_code`
- `sample_size`
- `raw_attributes`

#### `rental_market_geographies`

Geometry for CMA, CSD, CT, neighborhood, CMHC zones, or commercial listing-derived tiles where allowed.

## 13. API Contracts

### 13.1 Create assessment

```http
POST /api/will-it-pencil/assessments
```

Request:

```json
{
  "organizationId": "org_...",
  "buildProposalId": "proposal_...",
  "address": "123 Example Street, Toronto, ON",
  "buildIntent": {
    "type": "fourplex",
    "constructionMode": "conversion",
    "existingDwellingRetained": true,
    "proposedStoreys": 3,
    "proposedHeightMetres": 10.5,
    "proposedGrossFloorAreaSqm": 380,
    "proposedParkingSpaces": 2
  },
  "unitMix": [
    { "bedrooms": 1, "count": 2 },
    { "bedrooms": 2, "count": 2 }
  ],
  "preliminaryBudgetCents": 120000000,
  "borrowerWorkingCapitalLimitCents": 25000000
}
```

Response:

```json
{
  "assessmentId": "assessment_...",
  "status": "running"
}
```

### 13.2 Get assessment

```http
GET /api/will-it-pencil/assessments/{assessmentId}
```

Response:

```json
{
  "assessmentId": "assessment_...",
  "version": 3,
  "status": "complete_warn",
  "userFacingStatus": "pencils_with_warnings",
  "site": {
    "normalizedAddress": "123 Example St, Toronto, ON",
    "municipality": "Toronto",
    "parcelConfidence": "medium",
    "warnings": ["Parcel boundary is planning-grade and not a survey."]
  },
  "zoning": {
    "zoneCode": "R",
    "zoneCategory": "Residential",
    "buildIntentResult": "warning",
    "ruleChecks": [
      {
        "ruleId": "toronto-569-2013-r-zone-houseplex-units",
        "label": "Residential houseplex unit permission",
        "status": "pass",
        "confidence": "medium",
        "sourceUrl": "https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/multiplex-housing/"
      }
    ],
    "overlays": [
      {
        "type": "height",
        "value": "10m",
        "sourceLayer": "Zoning Height Overlay"
      }
    ],
    "warnings": [
      "Rule pack does not replace municipal planning review.",
      "Current consolidation and later amendments must be reviewed."
    ]
  },
  "rentalMarket": {
    "baselineSource": "StatsCan 46-10-0092-01",
    "period": "2026-01",
    "geography": "Toronto CMA",
    "grossMonthlyRentRangeCents": {
      "low": 760000,
      "base": 820000,
      "high": 900000
    },
    "confidence": "medium",
    "warnings": ["Rental data is CMA-level and should not be read as parcel-specific."]
  },
  "drawflowFeasibility": {
    "workingCapitalStress": "moderate",
    "warnings": []
  },
  "sourceSnapshots": [
    {
      "sourceName": "City of Toronto Zoning By-law",
      "sourceAsOf": "2023-06-18",
      "sourceUrl": "https://open.toronto.ca/dataset/zoning-by-law/"
    }
  ],
  "allowedActions": ["continue_with_warning_acknowledgement", "request_review"]
}
```

### 13.3 Get map configuration

```http
GET /api/will-it-pencil/assessments/{assessmentId}/map
```

Response:

```json
{
  "center": [-79.3832, 43.6532],
  "zoom": 16,
  "layers": [
    {
      "id": "toronto-zoning-area",
      "type": "vector",
      "tileUrl": "{tileBaseUrl}/toronto/zoning/{z}/{x}/{y}.pbf",
      "sourceName": "City of Toronto Zoning By-law",
      "sourceAsOf": "2023-06-18",
      "attribution": "Contains information licensed under the Open Government Licence - Toronto."
    }
  ]
}
```

### 13.4 Override assessment

```http
POST /api/will-it-pencil/assessments/{assessmentId}/override
```

Request:

```json
{
  "newStatus": "pencils_with_warnings",
  "reason": "Borrower supplied planner memo confirming fourplex interpretation; lender admin permits milestone planning."
}
```

Response:

```json
{
  "overrideId": "override_...",
  "auditEventId": "audit_...",
  "assessmentStatus": "complete_warn"
}
```

## 14. Zoning Rule Engine

### 14.1 Rule pack format

Use versioned YAML or JSON rule packs stored in source control and loaded into the geospatial service.

Example:

```yaml
jurisdiction: toronto
bylaw: "569-2013"
rulePackVersion: "2026-06-20-toronto-low-rise-v1"
consolidatedThrough: "2024-07-31"
sourceLinks:
  - "https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/zoning-by-law-569-2013-2/"
  - "https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/multiplex-housing/"
rules:
  - id: toronto-residential-houseplex-base
    appliesWhen:
      zoneCategory: Residential
      buildIntentType:
        - duplex
        - triplex
        - fourplex
    checks:
      - type: maxUnits
        source: curated
        confidence: medium
      - type: height
        source: zoning_height_overlay
        confidence: high
      - type: lotCoverage
        source: zoning_lot_coverage_overlay
        confidence: high
    reviewTriggers:
      - siteSpecificExceptionPresent
      - holdingSymbolPresent
      - notPartOfBylaw
      - conservationRegulatedArea
```

### 14.2 Rule quality levels

Every rule pack has coverage level:

- `lookup_only`: zone/overlay display, no compliance interpretation.
- `basic_use`: allowed/prohibited/conditional by build intent.
- `dimensional_basic`: height/coverage/frontage/area where data exists.
- `dimensional_full`: setbacks, parking, FSI, exceptions, and overlays.
- `planner_reviewed`: reviewed by planning counsel/consultant.

The UI should show rule-pack coverage.

### 14.3 Test fixtures

Each rule pack must ship with fixtures:

- known pass address,
- known warning address,
- known fail address,
- site-specific exception address,
- not-part-of-bylaw example,
- missing-source example,
- amendment-watchlist example.

Tests should assert both result and source citations.

## 15. Rental Model

### 15.1 Source precedence

Default source order:

1. CMHC RMS / StatsCan average rents for conservative underwriting.
2. StatsCan QRS asking-rent table for current-market sensitivity.
3. Licensed commercial listing feed for neighborhood/current comps.
4. User-entered pro forma rent only as a scenario, not trusted baseline.

### 15.2 Underwritten rent

Use conservative defaults:

```text
if baselineRent and marketAskRent exist:
  underwrittenRent = min(baselineRent * lenderPolicy.baselineMultiplier, marketAskRent * lenderPolicy.askingRentHaircut)
else if baselineRent exists:
  underwrittenRent = baselineRent * lenderPolicy.baselineMultiplier
else if marketAskRent exists:
  underwrittenRent = marketAskRent * lenderPolicy.askingRentHaircut
else:
  insufficient rental data
```

Default assumptions to configure per lender:

- `baselineMultiplier`: 1.0
- `askingRentHaircut`: 0.9
- `vacancyRateFallback`: 0.05
- `operatingExpenseRatioFallback`: 0.35
- `minimumRentConfidence`: medium

### 15.3 Rental map overlay

Render based on available spatial precision:

- CMA/CMA part: boundary-fill band with clear "regional estimate" label.
- CMHC zone/neighborhood: choropleth.
- Census tract: choropleth.
- Licensed listing feed: heatmap or hex bins with minimum sample threshold.
- Comparable listings: pins only if licence allows display and refresh.

Never interpolate coarse data into parcel-level precision.

## 16. Authorization and Governance

### 16.1 Organization scoping

Every assessment, source snapshot, override, and audit event must include organization scope. The geospatial source datasets may be global/shared, but derived assessment output is organization-scoped and proposal-scoped.

### 16.2 Role actions

| Role | Can run assessment | Can edit assumptions | Can proceed with warning | Can override fail | Can view source details |
| --- | --- | --- | --- | --- | --- |
| Builder | Yes | Yes while draft | If policy allows | No | Yes |
| Broker | Yes | Yes if assigned | Yes if policy allows | No | Yes |
| Lender staff | Yes | Review annotations only | Route/recommend | No | Yes |
| Lender admin | Yes | Review annotations only | Yes | Yes | Yes |
| Platform admin | Diagnostics only | No proposal edits | No | No | Yes |

### 16.3 Audit events

Emit audit events for:

- assessment created,
- assessment completed,
- source changed/stale assessment detected,
- warning acknowledged,
- review requested,
- review completed,
- override created,
- assessment superseded,
- proposal submitted with assessment snapshot.

Audit event payload must include:

- actor,
- role,
- organization,
- proposal,
- assessment version,
- prior/new state,
- warnings/blockers,
- reason when applicable,
- source snapshot IDs.

## 17. Frontend Implementation Notes

This spec does not implement UI, but when implemented:

- Use existing primitives under `src/components/`.
- Use `src/components/ui/frame.tsx` for wrapping/structural frames.
- Use `src/components/ui/card.tsx` for content cards.
- Do not self-roll card-like containers.
- Keep the map as the primary surface, not a decorative card.
- Use icons for layer toggles and result states.
- Show source dates and confidence in compact badges.
- Use role-aware actions consistent with the Build Proposal workspace.

Recommended component boundaries:

- `WillItPencilStep`
- `SiteConfirmationMap`
- `MapLayerControl`
- `ZoningResultPanel`
- `RentalMarketPanel`
- `FeasibilitySummaryPanel`
- `SourceConfidenceDrawer`
- `AssessmentOverrideDialog`

## 18. Error and Edge States

| State | UX copy direction | Action |
| --- | --- | --- |
| Address not found | "We could not match this address to a parcel." | Edit address, drop pin, upload survey |
| Multiple parcels | "Select the parcel for this build." | User chooses parcel |
| Unsupported municipality | "Automated zoning is not available here yet." | Manual upload or paid-source lookup |
| Source terms block ingest | "This municipality's public GIS terms do not allow automated storage." | Manual reference/live query/legal flow |
| Zoning data stale | "Source data may not include recent amendments." | Continue with warning/review |
| Rule pack incomplete | "We can show zoning facts, but cannot fully interpret this build type." | Route review |
| Rental data suppressed | "Rental data is suppressed or unreliable for this geography/unit type." | Use fallback or user scenario |
| Geospatial service unavailable | "Feasibility check is temporarily unavailable." | Retry/manual review |

## 19. Testing Strategy

### 19.1 Unit tests

- Source registry validation.
- Rule-pack parser.
- Rule checks per build type.
- Rental model calculations.
- Status aggregation.
- Warning/blocker mapping.

### 19.2 Integration tests

- Toronto source metadata fetch.
- Toronto zoning layer field contract.
- Toronto property/address source field contract.
- StatsCan CSV download and schema contract.
- Point-in-polygon lookup for known Toronto fixtures.
- Source hash and source snapshot persistence.

### 19.3 Geospatial tests

- Geometry validity after ingest.
- Projection conversion.
- Parcel/address join accuracy for fixtures.
- Overlay intersection.
- Tile generation smoke test.
- Bounding box sanity for every active source.

### 19.4 Convex tests

- Assessment create/run/supersede flow.
- Proposal linkage.
- Organization scoping.
- Submitted proposal freezes assessment snapshot.
- Override creates audit event.
- Source stale event marks assessment stale without deleting history.

Convex code must follow repo rules:

- Read `convex/_generated/ai/guidelines.md` before implementation.
- Use `fluent-convex` for Convex functions.
- Do not import Convex function builders from `convex/_generated/server` in application function files.
- Keep WorkOS projection tables webhook-owned.

### 19.5 Frontend tests

- User can enter address and build intent.
- Map loads with nonblank base and overlay layers.
- Layer toggle changes visible layers.
- Warnings fit on mobile and desktop.
- Proceed/override buttons follow status and role.
- Source drawer shows attribution and data dates.
- Unsupported municipality state is clear.

### 19.6 Acceptance test fixtures

At minimum:

- Toronto address in residential zone with likely pass.
- Toronto address with site-specific exception.
- Toronto address in not-part-of-bylaw layer.
- Toronto address with missing parcel.
- Unsupported municipality.
- Rental data available.
- Rental data suppressed/missing.
- Admin override flow.

## 20. Operations

### 20.1 Refresh cadence

- Toronto CKAN metadata: weekly.
- Toronto zoning geometry: monthly or on source hash change.
- Toronto property/address data: monthly.
- StatsCan QRS: monthly check, update when table changes.
- StatsCan CMHC annual table: monthly check, annual update.
- CMHC RMS: annual/manual release monitor.
- Rule packs: review every quarter and whenever amendment watchlist changes.

### 20.2 Monitoring

Track:

- source fetch failures,
- source schema drift,
- row count changes beyond threshold,
- invalid geometry counts,
- tile generation failures,
- stale source versions,
- geospatial lookup latency,
- assessment failure rate,
- unsupported municipality frequency,
- warning/override rate.

### 20.3 Data retention

- Keep raw source files according to licence and storage policy.
- Keep source hashes and metadata permanently.
- Keep assessment snapshots with Build Proposal audit history.
- Keep superseded assessments, do not overwrite.
- Do not retain geocoder outputs where provider terms disallow persistence.

## 21. Implementation Plan

### Phase 0: Legal and product hardening

Deliverables:

- Legal review of Toronto, StatsCan, CMHC, Mapbox/Google/Canada Post, and selected phase-2 municipal terms.
- Final supported-build-intent list for v1.
- Lender policy defaults for warning/override behavior.
- Decide whether v1 rental pro forma is advisory or policy-gating.

Exit criteria:

- Toronto source use approved.
- StatsCan/CMHC source use approved.
- Paid-source decision documented.
- v1 build types named.

### Phase 1: Data foundation

Deliverables:

- Source registry.
- PostGIS schema.
- Toronto source ingestion.
- StatsCan rent ingestion.
- Source snapshot and hash pipeline.
- Basic vector tile output.

Exit criteria:

- Known Toronto fixture returns parcel/zoning/rental lookup.
- Source registry records licence/use/freshness.
- Ingest can be rerun idempotently.

### Phase 2: Assessment engine

Deliverables:

- Geospatial lookup API.
- Toronto low-rise zoning rule pack v1.
- Rental model v1.
- Status aggregator.
- Convex assessment records and audit events.

Exit criteria:

- Fixtures pass for pass/warn/fail/unknown.
- Submitted proposal can freeze an assessment snapshot.
- Admin override creates audit event.

### Phase 3: Frontend step

Deliverables:

- Build Proposal step insertion.
- Map panel and layer controls.
- Result cards.
- Source confidence drawer.
- Proceed/review/override flows.

Exit criteria:

- Desktop and mobile flow work.
- Layer rendering verified.
- Role-aware actions verified.
- Unsupported municipality path works.

### Phase 4: Hardening and rollout

Deliverables:

- Monitoring.
- Operational runbook.
- QA fixtures.
- Documentation for source refresh and rule-pack updates.
- Feature flag by organization/municipality.

Exit criteria:

- Toronto beta organization enabled.
- All MVP acceptance criteria pass.
- Source attribution and disclaimers approved.

### Phase 5: GTA expansion

Candidate order:

1. Oakville.
2. Burlington.
3. Markham.
4. Mississauga only after legal/permission or commercial fallback.
5. Ajax/Whitby.
6. Brampton/Vaughan/Milton/Halton Hills/Richmond Hill via verified connectors or paid source.

Exit criteria per municipality:

- source use approved,
- connector contract tests pass,
- rule-pack coverage stated,
- map layer verified,
- fixtures created,
- coverage badge updated.

## 22. MVP Acceptance Criteria

1. User can run "Will It Pencil?" for a Toronto address before milestone worksheet.
2. User can confirm parcel/address on a map.
3. Map displays zoning, parcel, and rental-market geography with source attribution.
4. Assessment returns one of the five user-facing statuses.
5. Zoning result includes zone code, category, overlays, source links, confidence, and warnings.
6. Rental result includes baseline rent assumptions, period, geography, confidence, and warnings.
7. Proposal cannot silently proceed after fail/needs-review; policy and role decide.
8. Warning acknowledgment and admin override create audit events.
9. Submitted proposal freezes assessment snapshot.
10. Source snapshots include source URL, source date/version, licence/use mode, and hash where available.
11. Unsupported municipalities do not crash; they route to manual/paid-source path.
12. All fixture tests pass.

## 23. Product Copy Standards

Use:

- "Likely pencils"
- "Pencils with warnings"
- "Needs review"
- "Source data as of..."
- "Planning-grade parcel boundary"
- "Rental estimate is regional, not parcel-specific"
- "Municipal review still required"

Avoid:

- "Approved"
- "Compliant"
- "Permit-ready"
- "Guaranteed"
- "Zoning certified"
- "Lender approved"

## 24. Decision Log for This Spec

1. Treat Toronto as MVP because it has verified data, APIs, and compatible public licence.
2. Treat GTA expansion as connector-based, not a single dataset.
3. Use PostGIS for spatial processing and Convex for organization-scoped product state/audit.
4. Use CMHC/StatsCan for baseline rental assumptions; use commercial listing feeds only under licence.
5. Return confidence-scored feasibility, not legal compliance.
6. Store assessments as versioned snapshots and never overwrite source assumptions.

## 25. Source Appendix

The full source inventory, licensing notes, API endpoints, and research findings are maintained in:

```text
docs/research/will-it-pencil-research.md
```

Key primary sources:

- Toronto zoning CKAN: https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=zoning-by-law
- Toronto zoning ArcGIS: https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer
- Toronto Open Government Licence: https://open.toronto.ca/open-data-licence/
- Toronto property boundaries: https://open.toronto.ca/dataset/property-boundaries/
- Toronto address points: https://open.toronto.ca/dataset/address-points-municipal-toronto-one-address-repository/
- Ontario ARU decision: https://ero.ontario.ca/notice/019-9210
- CMHC RMS data tables: https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables
- StatsCan rent table 34-10-0133: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301
- StatsCan asking-rent table 46-10-0092: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201
- StatsCan QRS methodology: https://www150.statcan.gc.ca/n1/pub/46-28-0001/2025001/article/00004-eng.htm
- Mississauga zoning ArcGIS item: https://www.arcgis.com/home/item.html?id=ea40103d821f4a118b0d3c55dc4ca2fa
- Oakville zoning: https://portal-exploreoakville.opendata.arcgis.com/datasets/ExploreOakville::zoning-by-law-2014-014-1/about
- Burlington zoning: https://navburl-burlington.opendata.arcgis.com/datasets/Burlington::zoning-bylaw-1/about
- Markham open data: https://www.markham.ca/about-city-markham/open-data-markham
- Zoneomics API: https://www.zoneomics.com/product/api
- LightBox zoning data: https://developer.lightboxre.com/apis/zoning
