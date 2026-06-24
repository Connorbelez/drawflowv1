export const GARDEN_SUITE_DEMO_TEMPLATE_KEY = "garden_suite";
export const GARDEN_SUITE_PRODUCTION_TEMPLATE_KEY = "garden-suite";
export const GARDEN_SUITE_TEMPLATE_TITLE = "Garden Suite";

export type GardenSuiteSectionIcon =
  | "closeout"
  | "drywall"
  | "exterior"
  | "finishes"
  | "foundation"
  | "framing"
  | "kitchen"
  | "plumbing"
  | "roofing"
  | "roughIn";

export type GardenSuiteSection = {
  builderType: string;
  durationDays: number;
  icon: GardenSuiteSectionIcon;
  key: string;
  name: string;
  percentageBps: number;
  subtotalCents: number;
  submilestones: Array<{
    amountCents: number;
    durationDays: number;
    name: string;
    percentageBps: number;
  }>;
};

export const GARDEN_SUITE_SUMMARY =
  "16 milestones, 65 budget line items, 100.00% PoC, 141 field days";

export const GARDEN_SUITE_DESCRIPTION =
  "Garden suite construction template based on the 1,950 sf GTA garden suite budget, with workbook sections mapped to reimbursable milestones.";

export const GARDEN_SUITE_SECTIONS: GardenSuiteSection[] = [
  {
    builderType: "permitting",
    durationDays: 10,
    icon: "foundation",
    key: "soft-costs-and-pre-construction",
    name: "Soft Costs & Pre-Construction",
    percentageBps: 668,
    subtotalCents: 3_365_000,
    submilestones: [
      {
        amountCents: 250_000,
        durationDays: 1,
        name: "Legal / topographic survey",
        percentageBps: 50,
      },
      {
        amountCents: 1_800_000,
        durationDays: 1,
        name: "Architectural & permit drawings",
        percentageBps: 357,
      },
      {
        amountCents: 400_000,
        durationDays: 1,
        name: "Structural engineering",
        percentageBps: 79,
      },
      {
        amountCents: 200_000,
        durationDays: 1,
        name: "Arborist report & tree protection plan",
        percentageBps: 40,
      },
      {
        amountCents: 250_000,
        durationDays: 1,
        name: "Geotechnical / soils investigation",
        percentageBps: 50,
      },
      {
        amountCents: 65_000,
        durationDays: 1,
        name: "City of Toronto building permit",
        percentageBps: 13,
      },
      {
        amountCents: 250_000,
        durationDays: 1,
        name: "Builder's risk insurance",
        percentageBps: 49,
      },
      {
        amountCents: 150_000,
        durationDays: 1,
        name: "Legal & disbursements",
        percentageBps: 30,
      },
    ],
  },
  {
    builderType: "site_preparation",
    durationDays: 12,
    icon: "foundation",
    key: "site-work-and-servicing",
    name: "Site Work & Servicing",
    percentageBps: 1151,
    subtotalCents: 5_800_000,
    submilestones: [
      {
        amountCents: 400_000,
        durationDays: 2,
        name: "Mobilization, hoarding, tree protection, site prep",
        percentageBps: 79,
      },
      {
        amountCents: 2_500_000,
        durationDays: 2,
        name: "Excavation, basement dig & soil disposal",
        percentageBps: 496,
      },
      {
        amountCents: 500_000,
        durationDays: 2,
        name: "Backfill, granular & rough grade",
        percentageBps: 99,
      },
      {
        amountCents: 1_600_000,
        durationDays: 2,
        name: "Water & sanitary laterals + connection / reinstatement",
        percentageBps: 318,
      },
      {
        amountCents: 450_000,
        durationDays: 2,
        name: "Hydro service + separate 100A meter",
        percentageBps: 89,
      },
      {
        amountCents: 350_000,
        durationDays: 2,
        name: "Gas service connection",
        percentageBps: 70,
      },
    ],
  },
  {
    builderType: "foundation_structural",
    durationDays: 14,
    icon: "foundation",
    key: "concrete-and-foundation",
    name: "Concrete & Foundation",
    percentageBps: 784,
    subtotalCents: 3_950_000,
    submilestones: [
      {
        amountCents: 2_500_000,
        durationDays: 4,
        name: "Footings & foundation walls",
        percentageBps: 496,
      },
      {
        amountCents: 600_000,
        durationDays: 4,
        name: "Waterproofing, drainage membrane & weeping tile",
        percentageBps: 119,
      },
      {
        amountCents: 650_000,
        durationDays: 4,
        name: "Basement slab (granular, vapour barrier, rigid insul, concrete)",
        percentageBps: 129,
      },
      {
        amountCents: 200_000,
        durationDays: 4,
        name: "Window wells & exterior basement steps",
        percentageBps: 40,
      },
    ],
  },
  {
    builderType: "foundation_structural",
    durationDays: 16,
    icon: "framing",
    key: "framing-and-structure",
    name: "Framing & Structure",
    percentageBps: 1369,
    subtotalCents: 6_900_000,
    submilestones: [
      {
        amountCents: 3_400_000,
        durationDays: 5,
        name: "Framing lumber & engineered members (I-joists, LVL, beams)",
        percentageBps: 675,
      },
      {
        amountCents: 3_000_000,
        durationDays: 5,
        name: "Framing labour",
        percentageBps: 595,
      },
      {
        amountCents: 500_000,
        durationDays: 5,
        name: "Exterior sheathing & weather-resistive barrier",
        percentageBps: 99,
      },
    ],
  },
  {
    builderType: "exterior_envelope",
    durationDays: 10,
    icon: "roofing",
    key: "roofing-and-exterior-envelope",
    name: "Roofing & Exterior Envelope",
    percentageBps: 708,
    subtotalCents: 3_570_000,
    submilestones: [
      {
        amountCents: 1_000_000,
        durationDays: 3,
        name: "Flat / low-slope roof: membrane, tapered insulation, drains, flashing",
        percentageBps: 198,
      },
      {
        amountCents: 1_920_000,
        durationDays: 3,
        name: "Stucco / acrylic EIFS exterior",
        percentageBps: 381,
      },
      {
        amountCents: 500_000,
        durationDays: 3,
        name: "Soffit, fascia, eavestrough, downspouts, parapet caps",
        percentageBps: 99,
      },
      {
        amountCents: 150_000,
        durationDays: 3,
        name: "Exterior caulking & sealants",
        percentageBps: 30,
      },
    ],
  },
  {
    builderType: "exterior_envelope",
    durationDays: 6,
    icon: "exterior",
    key: "windows-and-exterior-doors",
    name: "Windows & Exterior Doors",
    percentageBps: 372,
    subtotalCents: 1_875_000,
    submilestones: [
      {
        amountCents: 1_595_000,
        durationDays: 2,
        name: "Windows - medium, double-glazed (supply & install)",
        percentageBps: 316,
      },
      {
        amountCents: 200_000,
        durationDays: 2,
        name: "Main entry door - insulated",
        percentageBps: 40,
      },
      {
        amountCents: 80_000,
        durationDays: 2,
        name: "Side entry door",
        percentageBps: 16,
      },
    ],
  },
  {
    builderType: "mechanical_electrical_plumbing",
    durationDays: 12,
    icon: "roughIn",
    key: "mechanical-hvac-and-plumbing",
    name: "Mechanical - HVAC & Plumbing",
    percentageBps: 576,
    subtotalCents: 2_900_000,
    submilestones: [
      {
        amountCents: 1_200_000,
        durationDays: 3,
        name: "Furnace/AC or heat pump + ductwork (3 levels)",
        percentageBps: 238,
      },
      {
        amountCents: 350_000,
        durationDays: 3,
        name: "HRV / ERV ventilation",
        percentageBps: 70,
      },
      {
        amountCents: 350_000,
        durationDays: 3,
        name: "Domestic hot water (tankless or tank)",
        percentageBps: 69,
      },
      {
        amountCents: 1_000_000,
        durationDays: 3,
        name: "Plumbing rough-in & labour (3 full + powder + kitchen + laundry)",
        percentageBps: 199,
      },
    ],
  },
  {
    builderType: "mechanical_electrical_plumbing",
    durationDays: 10,
    icon: "roughIn",
    key: "electrical",
    name: "Electrical",
    percentageBps: 585,
    subtotalCents: 2_950_000,
    submilestones: [
      {
        amountCents: 1_200_000,
        durationDays: 3,
        name: "Electrical rough-in, 100A panel, wiring & devices",
        percentageBps: 238,
      },
      {
        amountCents: 1_200_000,
        durationDays: 3,
        name: "Pot lights (fixture + install)",
        percentageBps: 238,
      },
      {
        amountCents: 400_000,
        durationDays: 3,
        name: "Decorative fixtures (pendants, vanity, exterior, smoke/CO)",
        percentageBps: 79,
      },
      {
        amountCents: 150_000,
        durationDays: 3,
        name: "Low-voltage (data, doorbell, etc.)",
        percentageBps: 30,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 10,
    icon: "drywall",
    key: "insulation-and-drywall",
    name: "Insulation & Drywall",
    percentageBps: 794,
    subtotalCents: 4_000_000,
    submilestones: [
      {
        amountCents: 1_400_000,
        durationDays: 5,
        name: "Insulation (spray foam rim/basement, batts, roof, acoustic)",
        percentageBps: 278,
      },
      {
        amountCents: 2_600_000,
        durationDays: 5,
        name: "Drywall: board, tape, sand & finish (3 levels)",
        percentageBps: 516,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 8,
    icon: "finishes",
    key: "flooring-and-stairs",
    name: "Flooring & Stairs",
    percentageBps: 662,
    subtotalCents: 3_335_000,
    submilestones: [
      {
        amountCents: 1_430_000,
        durationDays: 2,
        name: "Engineered hardwood - main + second (supply & install)",
        percentageBps: 284,
      },
      {
        amountCents: 455_000,
        durationDays: 2,
        name: "Luxury vinyl plank - basement (supply & install)",
        percentageBps: 90,
      },
      {
        amountCents: 650_000,
        durationDays: 2,
        name: "Bathroom tile - floors + shower walls + waterproofing",
        percentageBps: 129,
      },
      {
        amountCents: 800_000,
        durationDays: 2,
        name: "Stair finishing - treads, risers, railings (2 flights)",
        percentageBps: 159,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 8,
    icon: "finishes",
    key: "interior-doors-trim-and-paint",
    name: "Interior Doors, Trim & Paint",
    percentageBps: 516,
    subtotalCents: 2_600_000,
    submilestones: [
      {
        amountCents: 500_000,
        durationDays: 2,
        name: "Interior doors (~11, supply & install)",
        percentageBps: 99,
      },
      {
        amountCents: 600_000,
        durationDays: 2,
        name: "Baseboards, casings & trim",
        percentageBps: 119,
      },
      {
        amountCents: 1_200_000,
        durationDays: 2,
        name: "Paint - 3 levels",
        percentageBps: 238,
      },
      {
        amountCents: 300_000,
        durationDays: 2,
        name: "Closet shelving / built-ins allowance",
        percentageBps: 60,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 8,
    icon: "kitchen",
    key: "kitchen",
    name: "Kitchen",
    percentageBps: 806,
    subtotalCents: 4_060_000,
    submilestones: [
      {
        amountCents: 2_200_000,
        durationDays: 2,
        name: "Cabinetry - 15 ft run + 8 ft two-sided island (medium)",
        percentageBps: 437,
      },
      {
        amountCents: 690_000,
        durationDays: 2,
        name: "Quartz countertops - kitchen + island",
        percentageBps: 137,
      },
      {
        amountCents: 120_000,
        durationDays: 2,
        name: "Kitchen sink & faucet",
        percentageBps: 24,
      },
      {
        amountCents: 150_000,
        durationDays: 2,
        name: "Backsplash tile",
        percentageBps: 30,
      },
      {
        amountCents: 900_000,
        durationDays: 2,
        name: "Appliance allowance (fridge, range, hood, DW, micro)",
        percentageBps: 178,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 6,
    icon: "plumbing",
    key: "bathrooms-and-powder-room",
    name: "Bathrooms & Powder Room",
    percentageBps: 322,
    subtotalCents: 1_625_000,
    submilestones: [
      {
        amountCents: 200_000,
        durationDays: 1,
        name: "Vanities (allowance)",
        percentageBps: 39,
      },
      {
        amountCents: 80_000,
        durationDays: 1,
        name: "Vanity install labour",
        percentageBps: 16,
      },
      {
        amountCents: 160_000,
        durationDays: 1,
        name: "Quartz vanity tops",
        percentageBps: 32,
      },
      {
        amountCents: 160_000,
        durationDays: 1,
        name: "Toilets",
        percentageBps: 32,
      },
      {
        amountCents: 240_000,
        durationDays: 1,
        name: "Bathtubs",
        percentageBps: 47,
      },
      {
        amountCents: 400_000,
        durationDays: 1,
        name: "Frameless / semi glass shower enclosures",
        percentageBps: 79,
      },
      {
        amountCents: 135_000,
        durationDays: 1,
        name: "Shower / tub valves & trim",
        percentageBps: 27,
      },
      {
        amountCents: 100_000,
        durationDays: 1,
        name: "Bathroom faucets",
        percentageBps: 20,
      },
      {
        amountCents: 150_000,
        durationDays: 1,
        name: "Mirrors & accessories",
        percentageBps: 30,
      },
    ],
  },
  {
    builderType: "landscape_exterior",
    durationDays: 6,
    icon: "exterior",
    key: "exterior-site-finishes",
    name: "Exterior Site Finishes",
    percentageBps: 290,
    subtotalCents: 1_460_000,
    submilestones: [
      {
        amountCents: 560_000,
        durationDays: 2,
        name: "Concrete paver walkway - 70 ft x 4 ft",
        percentageBps: 111,
      },
      {
        amountCents: 400_000,
        durationDays: 2,
        name: "Deck - 10 x 10 (composite, footings, railing)",
        percentageBps: 80,
      },
      {
        amountCents: 500_000,
        durationDays: 2,
        name: "Landscaping / sod / grade restoration",
        percentageBps: 99,
      },
    ],
  },
  {
    builderType: "interior_finish",
    durationDays: 1,
    icon: "finishes",
    key: "laundry-and-misc-equipment",
    name: "Laundry & Misc. Equipment",
    percentageBps: 40,
    subtotalCents: 200_000,
    submilestones: [
      {
        amountCents: 200_000,
        durationDays: 1,
        name: "Washer & dryer allowance",
        percentageBps: 40,
      },
    ],
  },
  {
    builderType: "closeout",
    durationDays: 4,
    icon: "closeout",
    key: "general-conditions",
    name: "General Conditions",
    percentageBps: 357,
    subtotalCents: 1_800_000,
    submilestones: [
      {
        amountCents: 1_800_000,
        durationDays: 4,
        name: "Supervision, PM, temp services, dumpsters, scaffold, final clean",
        percentageBps: 357,
      },
    ],
  },
];
