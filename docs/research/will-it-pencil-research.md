# Will It Pencil Research

**Product:** DrawFlow / FairLend Construction Draw Management  
**Feature:** Pre-milestone "Will It Pencil?" feasibility step  
**Date:** 2026-06-20  
**Status:** Exploratory research, source-backed proposal input  

## 1. Research Goal

Add a pre-milestone worksheet step that helps a builder/developer and lender understand whether a proposed GTA build is likely feasible before they invest time in milestone budgeting. The step should show a neighborhood map, overlay zoning and zoning-derived constraints, overlay rental-market information, and produce a versioned feasibility assessment that can feed the Build Proposal flow.

This is not a permit approval engine and should not present itself as legal planning advice. The strongest product shape is a confidence-scored feasibility screen: "likely pencils", "pencils with warnings", "does not pencil", or "insufficient authoritative data".

## 2. DrawFlow Product Fit

The current production PRD says builder proposal creation is limited to creating a proposal package and includes:

1. Enter build identity and site.
2. Upload permits/documents.
3. Enter budget, borrower working capital, and co-pay assumptions.
4. Select construction template.
5. Edit milestones, durations, dependencies, and costs.
6. Add contractors.
7. Generate Cheapest Feasible, Fastest, and Capital-Constrained plans.
8. Select a preferred plan.
9. Submit proposal.

The existing demo setup flow captures total budget, borrower working capital, co-pay, project address, and permit intake/skip state before the milestone budget table. The "Will It Pencil?" step belongs after address/build-intent intake and before the milestone worksheet.

Product fit:

- It improves the proposal before milestone work starts.
- It preserves DrawFlow's reimbursement-draw focus by flagging entitlement/rental-market risk before draw grouping.
- It should feed the Build Proposal review snapshot and audit history.
- It should remain tenant-scoped and organization-aware.
- It should not mutate budgets in place; assumptions and outputs must be versioned.

## 3. Summary Findings

### 3.1 GTA zoning is public, but not one public API

There is no single authoritative "GTA zoning API". Zoning is municipal. Toronto, Mississauga, Oakville, Burlington, Ajax, Whitby, Markham, Brampton, Vaughan, Milton, Richmond Hill, and other GTA municipalities publish zoning through different combinations of CKAN, ArcGIS Hub, ArcGIS Experience Builder, static PDFs, open data portals, and interactive maps.

Recommended product implication: build a municipal connector registry. Do not hard-code "GTA zoning". Treat every municipality as a source connector with its own license, refresh schedule, coordinate system, field mapping, by-law version, confidence level, and rule-pack coverage.

### 3.2 Public map data is not automatically reusable

Toronto's Open Government Licence is friendly for commercial reuse. Markham's open data licence also allows commercial use. Burlington and Oakville publish open-data terms. Mississauga's ArcGIS item text is materially more restrictive: it says the GIS data may not be modified or copied without written consent. That is a blocker for bulk ingesting Mississauga geometry until FairLend has legal review or written permission.

Recommended product implication: the system needs a `sourceUseMode`:

- `ingestable`: source may be copied, transformed, tiled, and stored.
- `live_query_only`: source may be queried/displayed but not copied into durable storage.
- `manual_reference_only`: source is public but not safely machine-ingestable.
- `commercial_license_required`: use a paid source or signed municipal agreement.

### 3.3 Zoning polygon lookup is only the first 30% of "valid zoning wise"

Most municipal zoning layers identify zone codes, overlays, exceptions, and sometimes linked by-law chapters. They do not reliably encode every permitted use, setback, height, floor-space-index, parking, angular plane, heritage, conservation authority, servicing, or site-specific exception rule in a machine-ready way.

Recommended product implication: v1 should produce "zoning feasibility findings" with rule-level confidence, not a final compliance certificate. The output should distinguish:

- source polygon facts,
- interpreted zoning rule checks,
- missing data,
- human-review warnings,
- legal/permit-review required items.

### 3.4 Rental data has two different jobs

Rental-market underwriting needs actual-market, conservative data; map exploration wants spatial and recent asking-rent data. The best product will use both:

- CMHC / Statistics Canada for authoritative, repeatable survey and statistical series.
- Commercial listing feeds for current asking-rent heatmaps and comparable listings, only if licensing permits.

Recommended product implication: the default pro forma should use CMHC/StatsCan as the trusted baseline and optionally layer commercial/current asking-rent data as a market signal.

### 3.5 Convex should not be the geospatial engine

Convex remains the product source of truth for organization-scoped assessments, proposal links, user actions, audit events, warnings, and snapshots. Geospatial point-in-polygon queries, polygon simplification, vector tiles, and spatial joins should live in a dedicated geospatial service backed by PostGIS.

Recommended product implication: use a small geospatial service with PostGIS and vector-tile serving. Convex actions call it and persist source-stamped outputs.

## 4. Primary Data Sources

### 4.1 Toronto zoning, parcels, and addresses

#### Zoning By-law open data

Source: City of Toronto Open Data, "Zoning By-law"  
URL: https://open.toronto.ca/dataset/zoning-by-law/  
CKAN package API:

```text
https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=zoning-by-law
```

Key resources discovered through CKAN:

- `Zoning Area` GeoJSON
- `Zoning Policy Area Overlay` GeoJSON
- `Zoning Policy Road Overlay` GeoJSON
- `Zoning Rooming House Overlay` GeoJSON
- `Zoning Height Overlay` GeoJSON
- `Zoning Lot Coverage Overlay` GeoJSON
- `Parking Zone Overlay` GeoJSON
- GeoPackage and GeoJSON file downloads in EPSG:4326 and EPSG:2952 for some layers

CKAN package notes state that Zoning By-law 569-2013 data includes amendments up to June 18, 2023 and contains static shapefiles that are part of Zoning By-law 569-2013 and amendments from 2019, with sections still under appeal.

#### Toronto ArcGIS zoning service

Source: City of Toronto ArcGIS REST service  
URL:

```text
https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer
```

Service facts:

- Service description: City Planning layers
- Supported query format: JSON
- Max record count: 2000
- Capabilities: Query

Relevant layers:

- `3` Zoning Area
- `9` Zoning Height Overlay
- `10` Zoning Lot Coverage Overlay
- `11` Zoning Map Tile
- `12` Zoning Not Part of This Bylaw
- `13` Zoning Policy Area Overlay
- `14-17` Zoning Policy Road overlays at scales
- `18` Zoning Property Summary
- `19` Zoning Rooming House Overlay
- `57` Zoning Priority Retail Street Overlay
- `59` Zoning Building Setback Overlay
- `61` Zoning Parking Zone Overlay
- `64` Zoning Multi Tenant House Overlay
- `65` Major Transit Station Area

Zoning Area fields include:

- `ZN_LU_CATEGORY`
- `ZN_ZONE`
- `ZN_HOLDING`
- `ZN_FRONTAGE`
- `ZN_AREA`
- `ZN_UNIT_COUNT`
- `ZN_FSI_DENSITY`
- `ZN_COVERAGE`
- `FSI_TOTAL`
- `ZN_EXCPTN`
- `ZN_EXCPTN_NO`
- `STANDARDS_SET`
- `ZN_STATUS`
- `ZN_STRING`
- `BYLAW_CHAPTERLINK`
- `BYLAW_SECTIONLINK`
- `BYLAW_EXCPTNLINK`
- `BYLAW_HOLDINGLINK`

#### Toronto property boundaries

Source: City of Toronto Open Data, "Property Boundaries"  
URL: https://open.toronto.ca/dataset/property-boundaries/  
CKAN package API:

```text
https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=property-boundaries
```

Resources:

- GeoJSON datastore dump
- `Property Boundaries (wgs84) - geojson` ZIP
- WGS84 shapefile ZIP
- EPSG:4326 CSV, ZIP, GeoPackage, GeoJSON
- EPSG:2952 variants

Important limitation from the package notes: boundaries are suitable for general planning purposes only and are not a substitute for a plan of survey. This means lot frontage/area/setback calculations should be flagged as planning-estimate only unless the borrower uploads a survey or a licensed parcel source confirms dimensions.

#### Toronto address points

Source: City of Toronto Open Data, "Address Points (Municipal) - Toronto One Address Repository"  
URL: https://open.toronto.ca/dataset/address-points-municipal-toronto-one-address-repository/  
CKAN package API:

```text
https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=address-points-municipal-toronto-one-address-repository
```

The One Address Repository has point representations for over 500,000 addresses. Package notes say points are positioned on the correct side of the street and relative to neighboring addresses, within the parcel or building footprint.

This is a strong address-to-parcel starting point inside Toronto.

#### Toronto open-data licence

Source: Open Government Licence - Toronto  
URL: https://open.toronto.ca/open-data-licence/

Key implications:

- Worldwide, royalty-free, perpetual, non-exclusive licence.
- Commercial use is allowed.
- Copying, modifying, publishing, translating, adapting, distributing, and otherwise using the information is allowed for lawful purposes.
- Attribution is required.
- No warranty.

Recommended use:

- Toronto is the best MVP municipality.
- Ingest Toronto zoning, parcel, and address data into PostGIS.
- Store source snapshot hashes and include attribution in the UI and generated reports.

### 4.2 Toronto current zoning-law complexity

Source: City of Toronto, Zoning By-law 569-2013  
URL: https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/zoning-by-law-569-2013-2/

The City's zoning page says Zoning By-law 569-2013 is a city-wide by-law regulating use, size, height, density, and location of buildings. It also warns that the interactive map and office consolidation are provided for convenience, and legal/planning use should refer to certified City Clerk documents.

Current Toronto housing-zoning facts discovered:

- The City page says the Office Consolidation web/PDF version is updated to July 31, 2024.
- It lists later amendments not yet consolidated, including low-rise residential lands, mid-rise buildings, parking/bicycle updates, and neighborhood retail/service amendments.
- The Multiplex Housing page says Council adopted Official Plan and Zoning By-law Amendments on June 25-26 to enable up to six units in Toronto & East York District and Ward 23, and that these amendments are now in force.
- City notice for Zoning By-law 648-2025 says Toronto adopted the by-law on June 26, 2025 for lands in the Residential Zone Category to update permissions and performance standards for detached and semi-detached houseplexes, including duplexes, triplexes, and fourplexes.
- EHON guidance says Ontario Regulation 462/24 should be read together with the Zoning By-law and that existing rules around frontage, setbacks, gross floor area, and other zoning regulations continue to apply where not overridden.

Recommended rule-engine implication:

- Toronto rule packs must include both base Zoning By-law 569-2013 source links and post-2024/2025 amendment status.
- The rule engine must preserve `legalSourceDate`, `consolidationDate`, and `knownUnconsolidatedAmendments`.
- Rule results must identify whether a finding is from a machine-parsed layer, a curated rule pack, or a human-entered/legal-reviewed rule.

### 4.3 Ontario province-wide additional residential unit rules

Source: Environmental Registry of Ontario, O. Reg. 299/19 ARU amendment decision  
URL: https://ero.ontario.ca/notice/019-9210

Source: Environmental Registry of Ontario, Bill 23 alignment decision  
URL: https://ero.ontario.ca/notice/019-6197

Key findings:

- Bill 23 changes allowed up to three units per lot in many existing residential areas.
- The updated ARU framework supersedes local official plans and zoning province-wide on parcels where residential uses are permitted in settlement areas with full municipal water and sewage services, with exceptions.
- O. Reg. 299/19 / 462/24 amendments remove or update barriers such as angular planes, maximum lot coverage, floor space index, minimum lot size, and building distance separation for urban residential land.
- The 2024 decision page says the performance standard changes apply to urban residential land permitting up to three units per lot, not rural areas or settlement areas without full municipal servicing.

Recommended rule-engine implication:

- ARU checks need a province-wide overlay pack plus municipal-specific interpretation.
- The UI must ask whether the parcel is fully municipally serviced if not inferable.
- For a fourth or higher unit, the app should fall back to municipal zoning requirements and flag any prior ARU-only permissions that become deficiencies.

### 4.4 Mississauga zoning

Source: Mississauga Open Data / ArcGIS Hub, "Zoning"  
URL: https://data.mississauga.ca/datasets/zoning/about  
ArcGIS item: https://www.arcgis.com/home/item.html?id=ea40103d821f4a118b0d3c55dc4ca2fa  
FeatureServer:

```text
https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/2022_Zoning/FeatureServer
```

Layer facts:

- Layer `0`: `Zoning`
- Geometry: polygon
- Capabilities: Query, Extract
- Fields:
  - `ZONE_CODE`
  - `ZONE_DESCRIPTION`
  - `ZONE_CATEGORY`
  - `GREENLANDS_OVERLAY`
  - `BYLAW`
  - `BASE_ZONE_DESIGNATION`

Source description:

- Mississauga citywide map of zoning data from current Zoning By-law 0225-2007.

Critical licence/reuse concern:

- The ArcGIS item license text says the City tries to keep information current but reliance is at the user's sole risk.
- It says information should be independently verified.
- It says the City owns the GIS data and the GIS data may not be modified or copied without written consent.
- It says it is not a plan of survey and is for informational use only.

Recommended use:

- Do not bulk ingest or transform Mississauga GIS data until legal approves use or FairLend obtains written consent.
- For exploratory MVP after Toronto, support Mississauga as `live_query_only` if legal approves live ArcGIS use without storing geometry.
- If no approval, use Zoneomics/LightBox/municipal written agreement for Mississauga.

### 4.5 Brampton zoning

Source: City of Brampton, Zoning Online  
URL: https://www.brampton.ca/EN/Business/planning-development/zoning

Source: Brampton zoning information page  
URL: https://www.brampton.ca/EN/residents/Building-Permits/Zoning

Source: Brampton proposed zoning/mapping page  
URL: https://www.brampton.ca/EN/City-Hall/Zoning-By-law-Review/Pages/Proposed-Zoning-Mapping.aspx

Key findings:

- Brampton's Zoning Online page says zoning affects permitted land uses and what can be built, including lot size and building type.
- The page provides search, schedules, interim control by-laws, and a property report.
- The disclaimer says the consolidated zoning version is for convenience only and is not an exact/current reproduction of official documents.
- It says official zoning boundaries extend to the centre line of roads, but only property zoning is shown.
- The current by-law is By-law 270-2004, as amended.
- Brampton is also running a comprehensive zoning by-law review; proposed mapping has its own disclaimer and is not in effect unless adopted.

Machine source discovered:

```text
https://mapsuat.brampton.ca/arcgis/rest/services/ADU_SEARCH/ADU_SEARCH/FeatureServer/1/iteminfo
```

The item info says the database shows geometry for zoning that has only one zoning designation and associated attributes, tagged `ZONING`, `ZONING BY-LAW`, and `ZONING MAP`. Because this is a UAT-looking host and appears tied to ADU search, it should not be assumed to be the official citywide zoning source.

Recommended use:

- Treat Brampton as `manual_reference_only` until an official production FeatureServer and reuse terms are verified.
- Support Brampton in v1 only via user-supplied zoning report or paid zoning API.

### 4.6 Markham zoning

Source: City of Markham Open Data  
URL: https://www.markham.ca/about-city-markham/open-data-markham  
Open data catalogue: https://data-markham.opendata.arcgis.com/

Source: Markham Comprehensive Zoning By-law project  
URL: https://yourvoicemarkham.ca/zoningbylaw

Source: Markham zoning and development by-law information  
URL: https://www.markham.ca/economic-development-business/planning-development-services/zoning-and-development-law-information

Key findings:

- Markham Open Data says data is freely available for public use, modification, and sharing.
- Its licence grants a worldwide, royalty-free, perpetual, non-exclusive licence and explicitly allows commercial use.
- The comprehensive zoning project page says Council enacted By-law 2024-19 on January 31, 2024.
- It says the Ontario Land Tribunal approved the by-law city-wide on September 19, 2024, save and except lands associated with remaining site-specific appeals.
- It says the by-law is deemed to have come into force on January 31, 2024.
- It warns greyed-out lands on the interactive map are not subject to By-law 2024-19; previous zoning by-laws remain in effect there.
- Markham has historically had many parent zoning by-laws; the city page says older by-laws may not be digitally available or online.

Recommended use:

- Markham is legally more promising than Mississauga because its open-data licence permits commercial use.
- However, rule-engine coverage is complex due to transition clauses, appealed lands, and legacy parent by-laws.
- MVP connector should start with map lookup and "affected by 2024-19?" status, not full compliance.

### 4.7 Vaughan zoning

Source: City of Vaughan Online Maps  
URL: https://www.vaughan.ca/business/online-maps

Key findings:

- Vaughan's page says City Viewer, PLANit Viewer, and Vaughan Zoning maps provide information about city services, businesses, boundaries, proposed developments, and zoning designations.
- The page links to Vaughan Zoning as a map that provides information about zoning designations.
- It also links to "Disclaimer & Teranet/MPAC Terms of Use".

Recommended use:

- Treat Vaughan as `manual_reference_only` until a stable public FeatureServer and reuse terms are confirmed.
- Watch for Teranet/MPAC restrictions because they may affect parcels, ownership boundaries, or property-related layers.

### 4.8 Oakville zoning

Source: Town of Oakville ArcGIS Hub, Zoning By-law 2014-014  
URL: https://portal-exploreoakville.opendata.arcgis.com/datasets/ExploreOakville::zoning-by-law-2014-014-1/about  
ArcGIS item: https://www.arcgis.com/home/item.html?id=54d77fc2abd34bc694b4ea1e57e2fa1c  
FeatureServer:

```text
https://maps.oakville.ca/oakgis/rest/services/SBS/Zoning_By_law_2014_014/FeatureServer/10?f=json
```

Source: Town of Oakville ArcGIS Hub, Zoning By-law 2009-189  
FeatureServer:

```text
https://maps.oakville.ca/oakgis/rest/services/SBS/Zoning_By_law_2009_189/FeatureServer/4?f=json
```

Key findings:

- 2014-014 applies south of Dundas Street and north of Highway 407.
- 2009-189 applies north of Dundas Street and south of Highway 407.
- Oakville item metadata links to the Town of Oakville Open Data License.
- Fields for 2009-189 include `ZONE_DESC`, `SUB_CLASS`, `HOLD`, `ZONE`, `ZONE_URL`, `SP_DESC`, and page-link fields.

Recommended use:

- Oakville is a good phase-2 connector after Toronto, subject to legal review of the open data licence.
- Rule engine needs two zoning by-law areas.

### 4.9 Burlington zoning

Source: Navigate Burlington ArcGIS Hub, "Zoning ByLaw"  
URL: https://navburl-burlington.opendata.arcgis.com/datasets/Burlington::zoning-bylaw-1/about  
ArcGIS item: https://www.arcgis.com/home/item.html?id=41ddbd93d8d14293b4608ac9a7fc1bd4  
MapServer layer:

```text
https://mapping.burlington.ca/arcgisweb/rest/services/COB/Zoning_ByLaw/MapServer/6?f=json
```

Fields:

- `FULL_ZONING`
- `NOTE`
- `HTML`
- `VIEWER_HTML`

Licence:

- The ArcGIS item points to City of Burlington Open Data Terms of Use.

Recommended use:

- Good phase-2 connector subject to legal review.
- HTML fields may contain useful by-law links, but parser needs sanitation and source handling.

### 4.10 Ajax and Durham municipalities

Source: Ajax Open Data, "Zoning"  
URL: https://opendata.ajax.ca/datasets/zoning/about

Source: Durham Region Open Data  
URL: https://opendata.durham.ca/

Search findings:

- Ajax publishes a zoning dataset.
- Durham Region publishes regional open data and interactive maps, but zoning rules are still local municipal by-laws for Pickering, Ajax, Whitby, Oshawa, Clarington, etc.
- Whitby has an ArcGIS zoning map and zoning application:
  - Web map item: `96aa696d08a54229a405b5876bbf8698`
  - App: `https://whitby.maps.arcgis.com/apps/instant/sidebar/index.html?appid=fe85cfc5d68a4661b4ececa3027e1541`

Recommended use:

- Model Durham as a region with local municipal zoning connectors.
- Do not assume Durham Region open data has authority for municipal zoning compliance.

### 4.11 Milton, Halton Hills, and Halton

Source: Town of Milton zoning by-laws and maps  
URL: https://www.milton.ca/en/business-and-development/zoning-by-laws.aspx

Source: Discover Milton ArcGIS apps  
URL: https://discover-milton.hub.arcgis.com/pages/applications

Source: Halton Hills maps  
URL: https://www.haltonhills.ca/en/residents/maps.aspx

Key findings:

- Milton publishes zoning by-laws and interactive map collections, but a clean official FeatureServer was not verified in this research pass.
- Halton Hills exposes MapLinks interactive mapping with addressing, streets, parcels, boundaries, parks, elevation, and aerial imagery; zoning API availability was not verified.

Recommended use:

- Treat as `manual_reference_only` until connector verification.

### 4.12 Conservation, hazard, Greenbelt, and environmental overlays

These are not "zoning", but they are major build-feasibility constraints.

Sources:

- TRCA Regulated Area Open Data: https://trca-camaps.opendata.arcgis.com/datasets/trca-regulated-area
- TRCA annual regulation mapping update: https://trca.ca/regulation-mapping-update/
- Ontario GeoHub Greenbelt outer boundary: https://geohub.lio.gov.on.ca/datasets/lio::greenbelt-outer-boundary/about
- Ontario GeoHub Greenbelt designation: https://geohub.lio.gov.on.ca/datasets/lio::greenbelt-designation/about
- Conservation Halton Open Data Hub: https://conservationhalton-camaps.opendata.arcgis.com/
- Conservation Halton mapping and studies: https://www.conservationhalton.ca/mapping-and-studies/
- CLOCA Open Data: https://open-data.cloca.com/

Key findings:

- TRCA says regulated areas include natural hazards and natural features such as rivers, streams, flood plains, wetlands, valleylands, and Lake Ontario shoreline.
- TRCA says a permit may be required for work within a regulated area.
- Toronto's ArcGIS `cot_geospatial28` service includes a TRCA Regulation Limit layer (`32`) and label layer (`33`), but source/use rights should be verified before ingest.

Recommended use:

- Include conservation/hazard overlays as "site risk warnings" in v1 if public licence permits.
- Do not block solely on these overlays unless the rule source is confirmed; route to review.

## 5. Rental Market Data Sources

### 5.1 CMHC Rental Market Survey data tables

Source: CMHC Rental Market Survey Data Tables  
URL: https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables

Key facts:

- CMHC publishes 2025 Rental Market Survey results in Excel tables.
- The page says the data includes vacancy rates, average rents, turnover rates, and universe counts.
- Results are available for Canada, provinces, and major centres, including Greater Toronto Area.
- For 17 Canadian centres, tables include Condominium Apartment Survey results for condominium apartments offered for rent in the secondary rental market.
- Source: Rental Market Survey.
- Geography options listed include Greater Toronto Area and Oshawa.
- Latest listed publication date on the page was December 11, 2025.

Use:

- Conservative underwriting baseline.
- Annual refresh.
- Good for purpose-built rental and separately for rental condos in supported centres.
- Use reliability codes and data suppression indicators.

Limitations:

- Not real-time.
- Primary rental market differs from secondary rental units like rented houses, duplexes, accessory suites, and basement apartments.
- The HMIP web interface is interactive and does not appear to expose a stable official public API. Programmatic access is possible through exported files or unofficial wrappers, but direct automation should be reviewed against CMHC terms.

### 5.2 CMHC Housing Market Information Portal

Source: CMHC Housing Market Information Portal  
URL: https://www.cmhc-schl.gc.ca/hmiportal

The portal provides free access to latest housing-market data for Canada. Community Data Program documentation says the HMIP allows viewing data at geographies down to census tract and CSV export, with years varying by geography and variable.

Use:

- Manual discovery and export source.
- Potential semi-automated source if terms allow.
- Cross-check against CMHC data tables.

### 5.3 Community Data Program CMHC Rental Market Survey package

Source: Community Data Program, CMHC Rental Market Survey 2025  
URL: https://communitydata.ca/data/cmhc-rental-market-survey-2025

Key facts:

- Data sourced from CMHC's annual Rental Market Survey conducted in October 2025.
- Metrics include universe, average rent, median rent, quartiles, vacancy rate, availability rate, turnover rate, and rent change.
- Includes reliability indicators.
- Disaggregated by dwelling type, construction year range, size in units, rent range, quartile, heating included, and bedroom type.
- Includes Canada, province, CSD, CT, MET, Neighborhood, and Zone geographies.
- Zone boundaries are primarily made up of census tracts and respect CT boundaries.
- File package is XLSX, 73.9 MB.
- Release date listed: March 30, 2026.

Use:

- Strong candidate for rental-zone geographies and detailed spatial aggregation.

Limitations:

- Community Data Program access/licensing may require membership and may not allow commercial redistribution. Need legal/commercial review before use.

### 5.4 Statistics Canada Table 34-10-0133-01

Source: Statistics Canada, "Canada Mortgage and Housing Corporation, average rents for areas with a population of 10,000 and over"  
URL: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301  
CSV ZIP:

```text
https://www150.statcan.gc.ca/n1/en/tbl/csv/34100133-eng.zip
```

Key facts:

- Frequency: annual.
- Table ID: 34-10-0133-01.
- Release date: 2025-12-17.
- Geography: CSD, CMA, CA, CMA part, CA part.
- Data source: CMHC.
- Download formats include CSV and SDMX.

Use:

- Easy automated ingest.
- Good historical time series for average rents by unit type and geography.

Limitations:

- Annual.
- Not neighborhood/parcel-level.
- Average rents paid differ from asking rents and pro forma market-entry rents.

### 5.5 Statistics Canada Table 46-10-0092-01

Source: Statistics Canada, "Asking rent prices, by rental unit type and number of bedrooms, experimental estimates"  
URL: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201  
CSV ZIP:

```text
https://www150.statcan.gc.ca/n1/en/tbl/csv/46100092-eng.zip
```

Key facts:

- Frequency: quarterly.
- Table ID: 46-10-0092-01.
- Release date: 2026-06-09.
- Geography: CMA and CMA part.
- Experimental estimates.
- Data begins in 2019.
- The methodology says QRS is based on major rental listing platforms in Canada and CMHC partnership.

Methodology source:

URL: https://www150.statcan.gc.ca/n1/pub/46-28-0001/2025001/article/00004-eng.htm

Methodology findings:

- QRS estimates asking rent for advertised rental units.
- It focuses on rental apartment dwellings and rooms listed on major rental platforms.
- It uses administrative extracts from major rental platforms such as Rentals.ca Network and Zumper.
- It is linked to the Statistical Building Register to improve coherence, validate information, remove duplicates, and support estimation.
- The target universe is long-term rentals of six months or more in CMAs.
- It excludes lease transfers, short-term rentals, and non-residential units.
- It excludes records with missing geocoding or outside CMAs.
- Approximately 40% of listings are excluded through validation/cleaning.
- The published data tables include weighted estimates for rental apartment dwellings; room estimates are unweighted.

Latest table sample discovered by direct CSV pull:

- Latest Toronto CMA period in table: `2026-01` (first quarter)
- Toronto CMA average asking rent:
  - Apartment, no bedroom: `$1,760`
  - Apartment, 1 bedroom: `$2,110`
  - Apartment, 2 bedrooms: `$2,660`
  - Apartment, 3+ bedrooms: `$3,250`
  - House, 3+ bedrooms: `$3,570`
  - Room: `$830`

Use:

- Best public, automated, current-ish asking-rent baseline.
- Useful for pro forma sensitivity and "market entry" risk.

Limitations:

- CMA/CMA-part geography is too coarse for neighborhood overlay.
- Experimental data.
- Does not capture final lease amounts, incentives, utilities, furnishing, parking, or unit quality.

### 5.6 Rentals.ca / Urbanation / Rentsync / Zumper

Sources:

- Rentals.ca National Rent Report: https://rentals.ca/national-rent-report
- Rentals.ca May 2025 report methodology snippet: https://rentals.ca/blog/may-2025-rentals-ca-rent-report
- Urbanation/Rentsync partnership: https://www.urbanation.ca/news/357-urbanation-rentsync-partner-create-canadas-most-powerful-rental-market-data-platform

Key findings:

- Rentals.ca reports are based on listing data from the Rentals.ca Network of Internet Listing Services.
- Rentals.ca methodology says its network covers primary and secondary markets, including basement apartments, rental apartments, condos, townhouses, semi-detached houses, and single-detached houses.
- Urbanation and Rentsync partnered to combine Rentsync's multifamily rental listing data with Urbanation's platform for new purpose-built rental projects and condominium rentals.
- StatsCan's QRS methodology names Rentals.ca Network and Zumper as major rental platforms used for experimental asking-rent estimates.

Use:

- Paid data feed candidate for live listing/comparable overlay.
- Good for asking-rent heatmaps and unit mix comps.

Limitations:

- Public reports are not an API and should not be scraped as the production data source.
- Listings are asking prices, not closed rents.
- Need commercial terms for storage, display, derived metrics, and user-facing report exports.

### 5.7 TRREB / MLS / Realtor.ca

No public API was verified in this pass. TRREB/MLS data may be valuable for resale, rental listings, and comparable market evidence, but would require partnership/licensing. Treat as future optional premium integration.

## 6. Address, Geocoding, Parcel, and Paid Data Sources

### 6.1 Canada Post AddressComplete

Source: Canada Post AddressComplete API  
URL: https://www.canadapost-postescanada.ca/ac/support/api/

Findings:

- Provides AddressComplete API for custom integrations.
- Methods include Interactive Find and Interactive Retrieve.

Use:

- Best production autocomplete/validation candidate for Canadian addresses.
- Pair with municipal address-point datasets for exact municipal geometry when available.

Limitations:

- Address validation is not the same as parcel resolution.
- Need pricing and terms for storage/use.

### 6.2 Google Maps Geocoding API

Source: Google Geocoding API usage and billing  
URL: https://developers.google.com/maps/documentation/geocoding/usage-and-billing

Findings:

- Requires billing enabled.
- Requires API key or OAuth token.
- Requests are billed using Geocoding SKU.

Use:

- Reliable fallback geocoder if using Google basemap and terms allow.

Limitations:

- Must handle cost and storage/use restrictions.
- Results should not become the durable parcel source without checking Google Maps Platform terms.

### 6.3 Mapbox Geocoding API

Source: Mapbox Geocoding API docs  
URL: https://docs.mapbox.com/api/search/geocoding/

Findings:

- Forward geocoding converts location text into coordinates.
- Reverse geocoding converts coordinates into place names.

Source: Mapbox temporary vs permanent geocoding  
URL: https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/

Use:

- Good fit if using Mapbox basemap/services.
- Permanent geocoding may be needed if coordinates are persisted as part of Build Proposal.

Limitations:

- Need permanent geocoding terms if storing results.

### 6.4 Nominatim / OpenStreetMap

Source: Nominatim  
URL: https://nominatim.org/

Finding:

- Open-source geocoding with OpenStreetMap data.

Use:

- Good for prototypes or self-hosted geocoder.

Limitations:

- Public Nominatim is for occasional use, not production/bulk geocoding.
- Production use should self-host or use a commercial provider.

### 6.5 Teranet / GeoWarehouse / Ontario Parcel / MPAC

Sources:

- GeoWarehouse: https://www2.geowarehouse.ca/
- Teranet real estate solutions: https://www.teranet.ca/real-estate-solutions/
- MPAC propertyline: https://www.mpac.ca/en/ProductDetail/MPACpropertylinetm
- Ontario Parcel, Ontario GeoHub: https://geohub.lio.gov.on.ca/documents/lio::ontario-parcel/about

Findings:

- GeoWarehouse describes itself as a source of authoritative property information in Ontario.
- Teranet says Ontario Parcel is a standardized geospatial dataset with over 7.5 million parcels, created through an agreement between Teranet, the province, and MPAC.
- MPAC propertyline provides real-time property information for more than five million Ontario properties and more than ten million Canada-wide.

Use:

- Best paid option for authoritative parcel/property data where municipal open parcel boundaries are incomplete or informational-only.

Limitations:

- Requires commercial licensing.
- Terms may restrict storage, redistribution, display, and derived outputs.

### 6.6 Zoneomics

Sources:

- Zoneomics home/API: https://www.zoneomics.com/
- Zoneomics product API: https://www.zoneomics.com/product/api

Findings:

- Provides zoning data for specific properties or bulk properties.
- `zoneDetail` API claims USA and Canada coverage and point/polygon search.

Use:

- Good fallback or accelerator for municipalities without machine-readable/open zoning.
- Could supply standardized permitted uses and development controls.

Limitations:

- Paid source.
- Need Canadian coverage validation for GTA municipalities and rule freshness.
- Need contract rights for storing/displaying/reporting outputs.

### 6.7 LightBox

Sources:

- Canadian data overview: https://www.lightboxre.com/data/canadian-data-overview/
- Zoning API docs: https://developer.lightboxre.com/apis/zoning
- LightBox data: https://www.lightboxre.com/data/

Findings:

- LightBox advertises extensive Canadian address/geographic/property data.
- Zoning data docs include zoning requirements, districts, setbacks, density/FAR, height, permitted uses, and governing jurisdiction.

Use:

- Paid normalized data option for zoning/property enrichment.

Limitations:

- Need confirm GTA coverage, Canadian zoning depth, parcel availability, and API terms.

## 7. Proposed Data Architecture Findings

### 7.1 Source registry is mandatory

Every data source should be represented in a registry:

- `sourceId`
- `sourceName`
- `jurisdiction`
- `sourceType`: `zoning`, `parcel`, `address`, `rental_market`, `rental_listing`, `hazard`, `heritage`, `official_plan`
- `sourceUrl`
- `apiUrl`
- `licenceUrl`
- `sourceUseMode`
- `allowedOperations`
- `refreshCadence`
- `lastFetchedAt`
- `lastSuccessfulTransformAt`
- `sourceVersionLabel`
- `sourceHash`
- `confidence`
- `requiresAttribution`
- `knownLimitations`

This is product-critical because source truth and licence posture vary materially across municipalities.

### 7.2 Use PostGIS for geospatial processing

Needed operations:

- Address point lookup.
- Parcel point-in-polygon and nearest-neighbor fallback.
- Zoning polygon intersection.
- Overlay intersection.
- Rental zone or census geography join.
- Geometry simplification for map rendering.
- Vector tile generation.
- Buffered neighborhood queries.
- Distance-to-transit/amenity future extensions.

PostGIS is the right core engine. Convex should hold product/audit data, not dense GIS polygons.

### 7.3 Vector tiles should be generated from canonical geometries

Options:

- PostGIS + `pg_tileserv`, Martin, or Tegola for dynamic vector tiles.
- PMTiles for static/source-snapshot tiles generated by Tippecanoe.
- MapLibre GL JS for frontend rendering.
- Deck.gl for heatmaps and richer overlays if needed.

MVP recommendation:

- Toronto: ingest GeoJSON/GPKG into PostGIS, generate vector tiles via Martin or PMTiles.
- Frontend: MapLibre GL JS with a neutral basemap and toggled overlays.
- Query API: separate endpoint for point lookup to avoid relying on clicked vector tile attributes as authoritative.

### 7.4 Zoning rule packs should be explicit, versioned data

Rule packs should not be hidden in code. They should be data files or database records:

- `jurisdiction`
- `bylaw`
- `effectiveFrom`
- `consolidatedThrough`
- `sourceLinks`
- `zoneCodePattern`
- `allowedBuildTypes`
- `maxUnits`
- `heightRules`
- `coverageRules`
- `fsiRules`
- `frontageRules`
- `setbackRules`
- `parkingRules`
- `overrides`
- `exceptions`
- `confidence`
- `requiresHumanReview`

Every interpreted result should cite the rule pack version and municipal source link.

### 7.5 Rental data should be scenario-based

Recommended rental assumptions:

- `baselineRent`: CMHC/StatsCan average or median, conservative.
- `marketAskRent`: current asking-rent source, if licensed.
- `rentP25`, `rentP50`, `rentP75`: where available.
- `vacancyRate`: CMHC RMS zone/CMA.
- `turnoverRate`: CMHC RMS.
- `confidence`: based on geography granularity, suppression, source age, listing sample size.

The map overlay should make source granularity visible:

- CMA-level data should not look like a parcel-level heatmap.
- CMHC zone or neighborhood data can be choropleth.
- Listing feeds can be heatmap/hex bins only if sample size and licence allow.

## 8. Recommended MVP Data Sources

### MVP municipality

Toronto first.

Why:

- Strongest public open-data licensing.
- CKAN and ArcGIS API availability.
- Zoning, parcel, and address datasets are all available.
- Relevant overlays exist in Toronto ArcGIS services.
- Toronto is the highest-value GTA build market and likely the expected first user expectation.

### MVP zoning sources

- Toronto CKAN `zoning-by-law`
- Toronto ArcGIS `cot_geospatial11`
- Toronto property boundaries
- Toronto One Address Repository
- Toronto Zoning By-law 569-2013 web/PDF source links
- Toronto EHON / multiplex amendment source links
- Ontario ARU regulation source links

### MVP rental sources

- StatsCan table `46-10-0092-01` for quarterly asking-rent baseline.
- StatsCan table `34-10-0133-01` for annual CMHC average rents.
- CMHC Rental Market Survey Excel as manually/semiautomatically ingested baseline.

### MVP optional sources

- TRCA Regulated Area if licence confirms ingest/use.
- Ontario Greenbelt boundary/designation if relevant to edge GTA parcels.
- Canada Post AddressComplete for address validation.

## 9. Coverage Matrix

| Jurisdiction | Zoning source | Machine ingest confidence | Licence posture | Rule-pack confidence | Recommended phase |
| --- | --- | ---: | --- | ---: | --- |
| Toronto | CKAN + ArcGIS FeatureServer | High | Open Government Licence, commercial OK | Medium-high with curated rules | MVP |
| Mississauga | ArcGIS FeatureServer | High technically | Restrictive: no copy/modify without written consent | Medium | Phase 2 only after legal/permission |
| Brampton | Zoning Online + possible ADU/UAT GIS | Low | Unclear | Low | Later / paid fallback |
| Markham | Open Data + interactive map + 2024-19 | Medium | Open licence allows commercial use | Medium-low due appeals/legacy by-laws | Phase 2/3 |
| Vaughan | Public zoning map | Low | Teranet/MPAC terms warning | Low | Later / paid fallback |
| Oakville | ArcGIS services 2014-014 and 2009-189 | High | Open-data licence link | Medium | Phase 2 |
| Burlington | ArcGIS MapServer layer | High | Open-data terms link | Medium | Phase 2 |
| Ajax | Open Data zoning | Medium | Needs licence review | Low-medium | Phase 3 |
| Whitby | ArcGIS zoning app/map | Medium | Needs licence review | Low-medium | Phase 3 |
| Oshawa | Not verified | Unknown | Unknown | Low | Later |
| Milton | Maps/apps verified, service not verified | Low | Unknown | Low | Later |
| Halton Hills | Interactive maps, API not verified | Low | Unknown | Low | Later |
| Richmond Hill | Comprehensive Zoning Viewer exists | Low-medium | Needs verification | Low | Later |

## 10. Product Risk Register

| Risk | Severity | Finding | Mitigation |
| --- | --- | --- | --- |
| Public zoning maps are not legal instruments | High | Toronto, Brampton, Mississauga, and Markham sources include convenience/no-warranty limitations | Use "feasibility assessment", not "zoning approval"; cite sources; require human review for final approval |
| Licence blocks reuse | High | Mississauga says GIS data may not be modified/copied without written consent | Source registry with use modes; legal review; live-query-only or paid source |
| Parcel boundaries are not survey-grade | High | Toronto property boundaries are general planning only | Flag parcel-derived dimensions as estimates; allow survey upload; paid parcel option |
| Zoning rules are not fully machine-readable | High | Layers include codes/overlays, not complete rule logic | Versioned rule packs; confidence flags; rule tests; human-review route |
| Rental data granularity mismatch | Medium | StatsCan QRS is CMA/CMA part; CMHC zones need zone geometries/licensing | Show granularity visibly; do not render coarse data as parcel heatmap |
| Rental listings are asking, not achieved rents | Medium | QRS/Commercial listings represent advertised rents | Separate "asking rent" from "underwritten rent"; use conservative haircuts |
| Data freshness drift | Medium | Toronto CKAN zoning package notes June 18, 2023 while City page lists later amendments | Source refresh monitors; show `sourceAsOf`; maintain amendment watchlist |
| Geocoder returns wrong parcel | High | Address geocoding is imperfect | Confirm parcel on map; allow user correction; use address points and parcel polygons where available |
| Rule changes due to provincial/municipal amendments | High | Ontario ARU and Toronto EHON rules changed recently | Rule-pack versioning and review cadence |
| Overpromising "GTA coverage" | Medium | Coverage quality varies materially by municipality | In-product coverage badges and municipality support matrix |

## 11. Open Questions

1. Should v1 be Toronto-only or Toronto plus live-query Mississauga/Oakville/Burlington as beta?
2. Is FairLend willing to license paid zoning/property APIs, or should v1 stay open-data-only?
3. What build archetypes must the first rule pack support: detached, duplex, triplex, fourplex, sixplex, garden suite, laneway suite, or purpose-built rental?
4. Does FairLend want this feature to calculate a simple rental pro forma or only zoning/rent-market evidence?
5. Who signs off on "Proceed despite warning": borrower, broker, lender staff, or lender admin?
6. Should the proposal be blocked when zoning data is missing, or proceed with a high-risk warning?
7. Does DrawFlow need permanent geocoding rights through Mapbox/Google, or can it use municipal address data plus Canada Post validation?
8. Should parcel/survey upload be required for any dimensional compliance check?

## 12. Research References

- DrawFlow Production PRD: `docs/draw_flow_production_prd.md`
- Timeline setup flow: `docs/drawflow-demo/timeline-setup-flow.md`
- Toronto Zoning By-law open data: https://open.toronto.ca/dataset/zoning-by-law/
- Toronto CKAN package API: https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=zoning-by-law
- Toronto ArcGIS zoning service: https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer
- Toronto Zoning By-law 569-2013: https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/zoning-by-law-569-2013-2/
- Toronto Open Government Licence: https://open.toronto.ca/open-data-licence/
- Toronto property boundaries: https://open.toronto.ca/dataset/property-boundaries/
- Toronto address points: https://open.toronto.ca/dataset/address-points-municipal-toronto-one-address-repository/
- Toronto EHON: https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/expanding-housing-options/
- Toronto Multiplex Housing: https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/multiplex-housing/
- Toronto Zoning By-law 648-2025 notice: https://secure.toronto.ca/nm/api/individual/notice/6420.do
- Ontario ARU O. Reg. 299/19 amendment decision: https://ero.ontario.ca/notice/019-9210
- Ontario Bill 23 ARU decision: https://ero.ontario.ca/notice/019-6197
- Mississauga zoning dataset: https://data.mississauga.ca/datasets/zoning/about
- Mississauga zoning ArcGIS item: https://www.arcgis.com/home/item.html?id=ea40103d821f4a118b0d3c55dc4ca2fa
- Mississauga zoning FeatureServer: https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/2022_Zoning/FeatureServer
- Brampton Zoning Online: https://www.brampton.ca/EN/Business/planning-development/zoning
- Brampton zoning information: https://www.brampton.ca/EN/residents/Building-Permits/Zoning
- Brampton proposed zoning mapping: https://www.brampton.ca/EN/City-Hall/Zoning-By-law-Review/Pages/Proposed-Zoning-Mapping.aspx
- Markham Open Data: https://www.markham.ca/about-city-markham/open-data-markham
- Markham Open Data catalogue: https://data-markham.opendata.arcgis.com/
- Markham comprehensive zoning project: https://yourvoicemarkham.ca/zoningbylaw
- Markham zoning information: https://www.markham.ca/economic-development-business/planning-development-services/zoning-and-development-law-information
- Vaughan Online Maps: https://www.vaughan.ca/business/online-maps
- Oakville zoning 2014-014: https://portal-exploreoakville.opendata.arcgis.com/datasets/ExploreOakville::zoning-by-law-2014-014-1/about
- Oakville zoning 2009-189 FeatureServer: https://maps.oakville.ca/oakgis/rest/services/SBS/Zoning_By_law_2009_189/FeatureServer/4?f=json
- Burlington zoning: https://navburl-burlington.opendata.arcgis.com/datasets/Burlington::zoning-bylaw-1/about
- Ajax zoning: https://opendata.ajax.ca/datasets/zoning/about
- Durham Open Data: https://opendata.durham.ca/
- Milton zoning by-laws: https://www.milton.ca/en/business-and-development/zoning-by-laws.aspx
- Halton Hills maps: https://www.haltonhills.ca/en/residents/maps.aspx
- TRCA regulated area: https://trca-camaps.opendata.arcgis.com/datasets/trca-regulated-area
- TRCA regulation mapping update: https://trca.ca/regulation-mapping-update/
- Ontario Greenbelt outer boundary: https://geohub.lio.gov.on.ca/datasets/lio::greenbelt-outer-boundary/about
- Ontario Greenbelt designation: https://geohub.lio.gov.on.ca/datasets/lio::greenbelt-designation/about
- Conservation Halton Open Data Hub: https://conservationhalton-camaps.opendata.arcgis.com/
- CMHC Rental Market Survey data tables: https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables
- CMHC Housing Market Information Portal: https://www.cmhc-schl.gc.ca/hmiportal
- Community Data Program CMHC RMS 2025: https://communitydata.ca/data/cmhc-rental-market-survey-2025
- Statistics Canada Table 34-10-0133-01: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301
- StatsCan table 34-10-0133 CSV ZIP: https://www150.statcan.gc.ca/n1/en/tbl/csv/34100133-eng.zip
- Statistics Canada Table 46-10-0092-01: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201
- StatsCan table 46-10-0092 CSV ZIP: https://www150.statcan.gc.ca/n1/en/tbl/csv/46100092-eng.zip
- StatsCan QRS methodology: https://www150.statcan.gc.ca/n1/pub/46-28-0001/2025001/article/00004-eng.htm
- Rentals.ca National Rent Report: https://rentals.ca/national-rent-report
- Rentals.ca report methodology example: https://rentals.ca/blog/may-2025-rentals-ca-rent-report
- Urbanation/Rentsync partnership: https://www.urbanation.ca/news/357-urbanation-rentsync-partner-create-canadas-most-powerful-rental-market-data-platform
- Canada Post AddressComplete API: https://www.canadapost-postescanada.ca/ac/support/api/
- Google Geocoding API billing: https://developers.google.com/maps/documentation/geocoding/usage-and-billing
- Mapbox Geocoding API: https://docs.mapbox.com/api/search/geocoding/
- Mapbox permanent geocoding: https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/
- Nominatim: https://nominatim.org/
- GeoWarehouse: https://www2.geowarehouse.ca/
- Teranet real estate solutions / Ontario Parcel: https://www.teranet.ca/real-estate-solutions/
- MPAC propertyline: https://www.mpac.ca/en/ProductDetail/MPACpropertylinetm
- Ontario Parcel, Ontario GeoHub: https://geohub.lio.gov.on.ca/documents/lio::ontario-parcel/about
- Zoneomics API: https://www.zoneomics.com/product/api
- LightBox Canadian Data: https://www.lightboxre.com/data/canadian-data-overview/
- LightBox zoning API docs: https://developer.lightboxre.com/apis/zoning
