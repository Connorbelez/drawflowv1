/**
 * Production proposals seed template defaults bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type SiteVisitGuidance } from "../demo_site_visit_guidance";
import { GARDEN_SUITE_DESCRIPTION, GARDEN_SUITE_PRODUCTION_TEMPLATE_KEY, GARDEN_SUITE_SUMMARY, GARDEN_SUITE_TEMPLATE_TITLE } from "../gardenSuiteTemplate";
import { productionDefaultScenario, productionDefaultDraw, productionDefaultMilestone, productionBudgetMilestone, productionBudgetSubmilestone, gardenSuiteProductionMilestones, fourPlexGuidance } from "./seed_default_builders.js";
import { type ProductionDefaultScenario } from "./seed_foundation.js";

export type ProductionDefaultScenarioDraw = {
  amountBps: number;
  drawKey: string;
  label: string;
  order?: number;
  reviewNote: string;
  timingDay: number;
};

export type ProductionDefaultMilestone = {
  archetypeDescription: string;
  archetypeKey: string;
  dependencyKeys: string[];
  durationDays: number;
  key: string;
  name: string;
  percentageBps: number;
  siteVisitGuidance: SiteVisitGuidance;
  submilestones: Array<{
    durationDays: number;
    key: string;
    name: string;
    percentageBps: number;
  }>;
};

export type ProductionDefaultTemplate = {
  description: string;
  isDefault: boolean;
  milestones: ProductionDefaultMilestone[];
  scenarios: ProductionDefaultScenario[];
  summary: string;
  templateKey: string;
  title: string;
};

export const PRODUCTION_DEFAULT_TEMPLATES: ProductionDefaultTemplate[] = [
  {
    description:
      "Ground-up single family construction roadmap for reimbursement draw planning.",
    isDefault: true,
    milestones: [
      productionDefaultMilestone(
        "site-prep",
        "Site prep & foundation",
        1000,
        14,
        "foundation",
        [
          "Permit mobilization",
          "Excavation",
          "Concrete forms",
          "Foundation pour",
        ],
      ),
      productionDefaultMilestone(
        "framing",
        "Framing & structure",
        1280,
        18,
        "framing",
        ["Wall framing", "Roof trusses", "Structural sheathing"],
      ),
      productionDefaultMilestone(
        "rough-in",
        "Rough-in mechanical",
        1960,
        20,
        "roughIn",
        ["Plumbing rough-in", "Electrical rough-in", "HVAC ducts"],
      ),
      productionDefaultMilestone(
        "exterior",
        "Windows & exterior",
        1680,
        18,
        "exterior",
        ["Window install", "Weather barrier", "Exterior doors"],
      ),
      productionDefaultMilestone(
        "drywall",
        "Inspections & drywall",
        1520,
        16,
        "drywall",
        ["Rough-in inspection", "Insulation", "Drywall hang"],
      ),
      productionDefaultMilestone(
        "finishes",
        "Finishes & fixtures",
        1280,
        12,
        "finishes",
        ["Cabinetry", "Flooring", "Fixture set"],
      ),
      productionDefaultMilestone(
        "closeout",
        "Final inspection & closeout",
        1280,
        4,
        "closeout",
        ["Punch list", "Final inspection", "Closeout package"],
      ),
    ],
    scenarios: [
      productionDefaultScenario(
        "standard-reimbursement",
        "Standard reimbursement",
        true,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            16,
            2000,
            "Foundation complete",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            39,
            2500,
            "Framing verified",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            64,
            2500,
            "Rough-in approved",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            108,
            2000,
            "Envelope and drywall reviewed",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            125,
            1000,
            "Finishes accepted before closeout",
          ),
        ],
      ),
      productionDefaultScenario(
        "conservative-review-lag",
        "Conservative review lag",
        false,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            18,
            1800,
            "Foundation plus review lag",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            41,
            2200,
            "Framing plus review lag",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            66,
            2500,
            "Rough-in plus review lag",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            110,
            2200,
            "Drywall plus review lag",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            127,
            1300,
            "Finishes plus review lag",
          ),
        ],
      ),
    ],
    summary: "7 milestones, 100.00% PoC, 102 field days",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  },
  {
    description:
      "Selective renovation path for quicker inspection cadence and lighter scope.",
    isDefault: false,
    milestones: [
      productionDefaultMilestone(
        "renovation-permits",
        "Permit updates and mobilization",
        800,
        10,
        "foundation",
        ["Permit update", "Site protection"],
      ),
      productionDefaultMilestone(
        "selective-demo",
        "Selective demolition",
        1400,
        16,
        "change",
        ["Interior demo", "Waste removal"],
      ),
      productionDefaultMilestone(
        "structural-repairs",
        "Structural repairs",
        1800,
        18,
        "framing",
        ["Beam repairs", "Blocking"],
      ),
      productionDefaultMilestone(
        "envelope-repairs",
        "Envelope repairs",
        1500,
        12,
        "exterior",
        ["Flashing", "Window repairs"],
      ),
      productionDefaultMilestone(
        "rough-in-refresh",
        "Rough-in refresh",
        1500,
        14,
        "roughIn",
        ["Electrical", "Plumbing"],
      ),
      productionDefaultMilestone(
        "interior-rebuild",
        "Interior rebuild",
        2200,
        14,
        "finishes",
        ["Drywall", "Millwork"],
      ),
      productionDefaultMilestone(
        "renovation-closeout",
        "Inspection closeout",
        800,
        2,
        "closeout",
        ["Deficiency list", "Final signoff"],
      ),
    ],
    scenarios: [
      productionDefaultScenario("quick-inspection", "Quick inspection", true, [
        productionDefaultDraw(
          "draw-01",
          "Draw 01",
          33,
          2200,
          "Demolition complete",
        ),
        productionDefaultDraw(
          "draw-02",
          "Draw 02",
          57,
          2800,
          "Structure reviewed",
        ),
        productionDefaultDraw(
          "draw-03",
          "Draw 03",
          93,
          3000,
          "Rough-in refresh complete",
        ),
        productionDefaultDraw(
          "draw-04",
          "Draw 04",
          111,
          2000,
          "Interior rebuild substantially complete",
        ),
      ]),
    ],
    summary: "7 milestones, 100.00% PoC, 86 days",
    templateKey: "single-family-renovation",
    title: "Single Family Renovation",
  },
  {
    description:
      "Multi-unit build template with heavier envelope and closeout coordination.",
    isDefault: false,
    milestones: [
      productionDefaultMilestone(
        "multiplex-sitework",
        "Sitework and servicing",
        900,
        18,
        "foundation",
        ["Survey", "Civil servicing"],
      ),
      productionDefaultMilestone(
        "multiplex-foundation",
        "Foundation podium",
        1600,
        26,
        "foundation",
        ["Footings", "Foundation walls"],
      ),
      productionDefaultMilestone(
        "multiplex-framing",
        "Multi-plex framing",
        2200,
        30,
        "framing",
        ["Floor framing", "Party walls"],
      ),
      productionDefaultMilestone(
        "multiplex-rough-in",
        "Stacked rough-ins",
        1800,
        28,
        "roughIn",
        ["Electrical stacks", "Mechanical shafts"],
      ),
      productionDefaultMilestone(
        "multiplex-envelope",
        "Envelope and windows",
        1500,
        18,
        "exterior",
        ["Windows", "Cladding"],
      ),
      productionDefaultMilestone(
        "multiplex-finishes",
        "Suite finishes",
        1400,
        20,
        "finishes",
        ["Drywall", "Cabinets"],
      ),
      productionDefaultMilestone(
        "multiplex-closeout",
        "Occupancy closeout",
        600,
        6,
        "closeout",
        ["Life safety", "Occupancy package"],
      ),
    ],
    scenarios: [
      productionDefaultScenario(
        "standard-multiplex",
        "Standard multi-plex",
        true,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            51,
            2500,
            "Foundation podium accepted",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            86,
            2500,
            "Framing inspection",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            119,
            2000,
            "Rough-in review",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            143,
            2000,
            "Envelope review",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            167,
            1000,
            "Suite finishes accepted",
          ),
        ],
      ),
    ],
    summary: "7 milestones, 100.00% PoC, 146 days",
    templateKey: "multiplex-build",
    title: "Multi-plex Build",
  },
  {
    description:
      "Luverne 4-plex budget template with exact draw/milestone and line-item breakdown from the 25 Luverne budget.",
    isDefault: false,
    milestones: [
      productionBudgetMilestone(
        "four-plex-draw-01",
        "Draw/Milestone 1 - Permits, demo & foundation",
        1100,
        21,
        "foundation",
        [
          productionBudgetSubmilestone("four-plex-draw-01", "DC/ED", 37, 1),
          productionBudgetSubmilestone("four-plex-draw-01", "PERMITS", 91, 2),
          productionBudgetSubmilestone("four-plex-draw-01", "DRAWINGS", 156, 3),
          productionBudgetSubmilestone("four-plex-draw-01", "DEMO EX", 458, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "TEMP FENCE",
            23,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "TREE PROTECTION",
            14,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "FOUNDATION",
            321,
            9,
          ),
        ],
        fourPlexGuidance(
          [
            "Permits and drawings: confirm DC/ED, permits, and construction drawings are uploaded and match the 25 Luverne 4-plex scope.",
            "Site controls: temporary fence and tree protection are installed before exterior demolition or excavation value is counted.",
            "Demolition: demo exterior scope is complete, debris is staged or removed, and any unsafe exposed condition is documented.",
            "Foundation: excavation, forms, reinforcing, concrete placement, anchor points, waterproofing readiness, and survey dimensions align with approved drawings.",
            "Exclusions: do not reimburse staged formwork, unpoured concrete, or permit/drawing fees without documentary evidence.",
          ],
          [
            "Required wide angle: full frontage from street showing fence, tree protection, demo limits, and foundation work area.",
            "Required side angle: left and right property-line views showing excavation/foundation relation to setbacks and adjacent structures.",
            "Required close-up: permits/drawings or permit card, foundation forms/rebar/anchors, and any waterproofing or drainage detail.",
            "Required context: photo tying DC/ED, permits, drawings, demo, fence, tree protection, and foundation areas to the same address.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-02",
        "Draw/Milestone 2 - Underground, framing & roof",
        1329,
        28,
        "framing",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "UNDERGROUND PIB",
            64,
            4,
          ),
          productionBudgetSubmilestone("four-plex-draw-02", "FRAMING", 458, 7),
          productionBudgetSubmilestone("four-plex-draw-02", "LUMBER", 413, 4),
          productionBudgetSubmilestone("four-plex-draw-02", "CONCRETE", 110, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "WATER/SEWER",
            101,
            3,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "ROOF FLAT/SHINGLES",
            183,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Underground: verify underground PIB, water/sewer, sleeves, trenches, bedding, and backfill are complete before cover-up.",
            "Framing: verify wall, floor, roof, party-wall, opening, and lateral bracing conditions against stamped drawings.",
            "Lumber: count installed framing value only; staged lumber should be photographed but not treated as completed work.",
            "Concrete: confirm any slab, cap, porch, or formed concrete scope is poured, cured enough for inspection, and tied to the approved plan.",
            "Roof: flat roof and shingle areas are dried in with underlayment, flashing, and drainage paths visible.",
          ],
          [
            "Required wide angle: front and rear elevations showing full framed massing and roof planes.",
            "Required side angle: each side elevation showing floor lines, party-wall/shaft alignment, and water/sewer trench locations.",
            "Required close-up: structural connectors, headers, sheathing nailing, roof flashing, underground pipe bedding, and concrete edges.",
            "Required overhead/interior angle: roof or upper-floor view showing roof flat/shingle transition and framing continuity.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-03",
        "Draw/Milestone 3 - Service upgrade & envelope",
        1118,
        21,
        "exterior",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "400 AMP UPGRADE",
            229,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "UTILITIES CONNECTION",
            46,
            2,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "WINDOWS/DOORS",
            321,
            6,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "STUCCO/BRICK",
            366,
            6,
          ),
          productionBudgetSubmilestone("four-plex-draw-03", "ALUM", 156, 3),
        ],
        fourPlexGuidance(
          [
            "Electrical service: verify 400 amp upgrade equipment, meter base, panel/service location, grounding, and utility coordination status.",
            "Utility connection: verify completed connections or inspected rough connection points; note any utility-owned work still pending.",
            "Openings: windows and doors are installed, shimmed, fastened, flashed, and protected from water intrusion.",
            "Envelope: stucco/brick and aluminum work are installed in claimed areas with weather barrier, flashing, weeps, and terminations visible.",
            "Unit coverage: inspect representative front, rear, side, and unit-specific envelope conditions so one finished elevation does not mask incomplete areas.",
          ],
          [
            "Required wide angle: all four elevations showing windows/doors and cladding progress.",
            "Required service angle: meter, panel, service mast or conduit route, and utility connection point with address context.",
            "Required close-up: window flashing sill/head/jamb, door threshold, stucco/brick transition, aluminum trim, and penetrations.",
            "Required defect angle: any unflashed opening, missing cladding section, damaged unit, or temporary utility condition.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-04",
        "Draw/Milestone 4 - MEP rough-ins",
        1283,
        24,
        "roughIn",
        [
          productionBudgetSubmilestone("four-plex-draw-04", "HVAC", 596, 8),
          productionBudgetSubmilestone("four-plex-draw-04", "PLUMBING", 366, 7),
          productionBudgetSubmilestone(
            "four-plex-draw-04",
            "PLUMBING SUPPLIES",
            0,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-04",
            "ELECTRICAL",
            321,
            8,
          ),
        ],
        fourPlexGuidance(
          [
            "HVAC: verify duct runs, equipment rough locations, exhaust routes, fire/smoke separations, and shaft penetrations for each unit.",
            "Plumbing: verify supply, DWV, venting, fixture rough locations, test caps/gauges, and floor/wall penetrations before cover-up.",
            "Electrical: verify panel rough-in, homeruns, box layout, smoke/CO locations, exterior circuits, and common-area feeds.",
            "Coordination: document clashes, notched framing, missing firestopping, unsupported pipes/ducts, or rough-in work outside approved locations.",
            "Plumbing supplies: this line is zero budget in the source budget; mark any visible supplies as context only unless moved into an approved revision.",
          ],
          [
            "Required wide angle: representative mechanical/electrical/plumbing rough-in view in every unit and common/service area.",
            "Required close-up: pressure gauge or test cap, panel and box rough layout, duct supports, firestopping, and penetrations.",
            "Required vertical angle: stacked wet wall or shaft view showing alignment across floors/units.",
            "Required exception angle: any failed inspection tag, conflict, unprotected penetration, or missing rough-in area.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-05",
        "Draw/Milestone 5 - Insulation, drywall & stairs",
        1099,
        14,
        "drywall",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-05",
            "INSULATION/DRYWALL/TAPING",
            916,
            10,
          ),
          productionBudgetSubmilestone("four-plex-draw-05", "STAIRS", 183, 4),
        ],
        fourPlexGuidance(
          [
            "Inspection prerequisite: rough-in, insulation, and fire separation inspections are complete or documented before drywall/taping reimbursement.",
            "Insulation: verify insulation type, coverage, vapor control, acoustic/fire assemblies, and continuity at exterior walls and demising walls.",
            "Drywall/taping: verify board, taping, corner bead, fire-rated assemblies, ceilings, shafts, and wet-area board match scope.",
            "Stairs: verify stair framing/install, guard/blocking readiness, landings, headroom, and secure temporary protection.",
            "Incomplete areas: identify rooms, units, ceilings, or stair sections not ready for finish work.",
          ],
          [
            "Required wide angle: each unit interior showing drywall/taping progress and stair placement.",
            "Required close-up: insulation/vapor barrier before board where still visible, tape joints, fire-rated board labels, and stair connections.",
            "Required document angle: inspection sticker, report, or deficiency tag tied to the milestone.",
            "Required unit context: one photo per unit entrance or room label to prevent duplicate-room ambiguity.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-06",
        "Draw/Milestone 6 - Tile, flooring & trim",
        815,
        18,
        "finishes",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TILES LABOUR",
            137,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TILES SUPPLY",
            137,
            2,
          ),
          productionBudgetSubmilestone("four-plex-draw-06", "FLOORING", 220, 6),
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TRIM CARPENTRY",
            321,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Tile labour: verify installed tile in claimed wet areas, cuts, grout, slopes, waterproofing transitions, and incomplete edges.",
            "Tile supply: materials must be delivered to site, matched to installed areas, and protected; staged supply alone should be noted separately.",
            "Flooring: verify installed flooring by unit/room, transitions, stair nosings where applicable, and protected finished surfaces.",
            "Trim carpentry: verify casing, base, doors, shelving/blocking, hardware prep, and continuity through each unit.",
            "Quality exceptions: document cracked tile, missing grout, damaged flooring, incomplete trim, or units skipped.",
          ],
          [
            "Required wide angle: each unit main living area showing flooring and trim coverage.",
            "Required wet-area angle: bathrooms/kitchens showing tile install, corners, slopes, and transitions.",
            "Required close-up: flooring transitions, base/casing joints, tile cuts, grout lines, and protected material labels.",
            "Required comparison angle: at least one completed and one incomplete room if progress differs by unit.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-07",
        "Draw/Milestone 7 - Kitchen, appliances, paint & labour",
        1283,
        20,
        "finishes",
        [
          productionBudgetSubmilestone("four-plex-draw-07", "KITCHEN", 366, 6),
          productionBudgetSubmilestone(
            "four-plex-draw-07",
            "APPLIANCES",
            257,
            3,
          ),
          productionBudgetSubmilestone("four-plex-draw-07", "PAINT", 110, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-07",
            "GENERAL LABOUR",
            550,
            7,
          ),
        ],
        fourPlexGuidance(
          [
            "Kitchen: verify cabinets, counters, sink rough/fixture readiness, millwork alignment, and unit-by-unit installation status.",
            "Appliances: verify delivered and installed appliances by unit; staged appliances must be matched to serial/model evidence and protected location.",
            "Paint: verify primer/finish coats, trim touch-ups, ceilings, closets, common areas, and any areas held back for repairs.",
            "General labour: verify reimbursable labour produced completed physical work and is tied to visible milestone progress.",
            "Punch context: document missing doors, panels, fixtures, appliance gaps, paint deficiencies, or labour-only claims with no visible output.",
          ],
          [
            "Required wide angle: each unit kitchen from entry and opposite corner.",
            "Required appliance angle: appliance install/delivery evidence with unit context and model/serial tags where visible.",
            "Required close-up: cabinet fit, counter seams, sink/fixture area, paint finish, and trim touch-ups.",
            "Required punch angle: any incomplete kitchen, missing appliance, paint defect, or labour repair area.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-08",
        "Draw/Milestone 8 - Landscaping, misc, insurance & management",
        1973,
        14,
        "closeout",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "LANDSCAPING",
            165,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "MISCELLANEOUS",
            367,
            3,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "INSURANCE",
            137,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "MANAGEMENT FEE",
            1304,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Landscaping: verify grading, drainage, hardscape/softscape, exterior cleanup, and safe access for all units.",
            "Miscellaneous: require itemized support; tie each miscellaneous cost to visible work, invoice, approved change, or closeout deficiency.",
            "Insurance: verify policy or invoice evidence before reimbursing this soft-cost line.",
            "Management fee: verify fee calculation, approved agreement, and alignment with completed project status before final draw release.",
            "Final readiness: confirm no unresolved site safety, access, occupancy, evidence, or admin exceptions remain before final reimbursement.",
          ],
          [
            "Required wide angle: front, rear, and both side yards showing final grading, landscaping, and safe access.",
            "Required close-up: drainage swales, walkways/steps, exterior deficiencies, and any remaining punch-list items.",
            "Required document angle: insurance invoice/policy, management fee support, and miscellaneous backup in the closeout package.",
            "Required final context: completed exterior plus one representative finished interior per unit for final release readiness.",
          ],
        ),
      ),
    ],
    scenarios: [
      productionDefaultScenario("four-plex-standard", "4-plex", true, [
        productionDefaultDraw(
          "draw-01",
          "Draw/Milestone 1",
          23,
          1100,
          "Permits, demo, temporary controls, tree protection, and foundation verified",
        ),
        productionDefaultDraw(
          "draw-02",
          "Draw/Milestone 2",
          56,
          1329,
          "Underground PIB, framing, lumber, concrete, water/sewer, and roof verified",
        ),
        productionDefaultDraw(
          "draw-03",
          "Draw/Milestone 3",
          82,
          1118,
          "Service upgrade, utility connection, windows/doors, stucco/brick, and aluminum verified",
        ),
        productionDefaultDraw(
          "draw-04",
          "Draw/Milestone 4",
          111,
          1283,
          "HVAC, plumbing, plumbing supplies context, and electrical rough-ins verified",
        ),
        productionDefaultDraw(
          "draw-05",
          "Draw/Milestone 5",
          130,
          1099,
          "Insulation, drywall, taping, and stairs verified",
        ),
        productionDefaultDraw(
          "draw-06",
          "Draw/Milestone 6",
          153,
          815,
          "Tile labour, tile supply, flooring, and trim carpentry verified",
        ),
        productionDefaultDraw(
          "draw-07",
          "Draw/Milestone 7",
          178,
          1283,
          "Kitchen, appliances, paint, and general labour verified",
        ),
        productionDefaultDraw(
          "draw-08",
          "Draw/Milestone 8",
          197,
          1973,
          "Landscaping, miscellaneous, insurance, and management fee closeout verified",
        ),
      ]),
    ],
    summary: "8 milestones, 36 budget line items, 100.00% PoC, 160 field days",
    templateKey: "4-plex",
    title: "4-plex",
  },
  {
    description: GARDEN_SUITE_DESCRIPTION,
    isDefault: false,
    milestones: gardenSuiteProductionMilestones(),
    scenarios: [
      productionDefaultScenario(
        "garden-suite-standard-reimbursement",
        "Garden Suite standard reimbursement",
        true,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            48,
            2603,
            "Soft costs, site servicing, and foundation verified",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            95,
            2449,
            "Framing, envelope, windows, and exterior doors verified",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            142,
            1955,
            "Mechanical, electrical, insulation, and drywall verified",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            192,
            2306,
            "Flooring, trim, kitchen, and bathroom scope verified",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            218,
            687,
            "Exterior site finishes, laundry equipment, and closeout verified",
          ),
        ],
      ),
    ],
    summary: GARDEN_SUITE_SUMMARY,
    templateKey: GARDEN_SUITE_PRODUCTION_TEMPLATE_KEY,
    title: GARDEN_SUITE_TEMPLATE_TITLE,
  },
];
