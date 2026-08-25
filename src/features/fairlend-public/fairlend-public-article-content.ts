import { corePages } from "./fairlend-public-core-content";
import type {
  ArticlePage,
  ArticlePageId,
} from "./fairlend-public-content-types";

export const articlePages: Record<ArticlePageId, ArticlePage> = {
  financingGap: {
    id: "financingGap",
    path: "/resources/financing-gap-gta-multiplex-builds",
    title: "The Financing Gap in GTA Multiplex Builds",
    description:
      "Why GTA multiplex projects often break at the financing gap and how early capital-stack review helps.",
    headline:
      "The financing gap is where many GTA multiplex builds quietly die.",
    deck: "Unit count, permits, valuation, rental income, borrower liquidity, and draw timing all have to work at the same time.",
    audienceCta: "Assess My Multiplex Project",
    audienceHref: "/start/multiplex",
    brandKit: corePages.resources.brandKit,
    points: [
      {
        title: "Land value is not cash flow",
        copy: "Equity matters, but projects still need liquidity through design, permits, soft costs, and construction.",
      },
      {
        title: "Valuation timing bites",
        copy: "The finished rental story can be compelling while the interim construction profile still needs private capital.",
      },
      {
        title: "Draw cadence matters",
        copy: "A feasible build can become fragile when reimbursement arrives too late for trade sequence.",
      },
      {
        title: "Early review helps",
        copy: "A first-pass capital stack review surfaces gaps before owners commit to a path they cannot carry.",
      },
    ],
  },
  gardenSuitesSupply: {
    id: "gardenSuitesSupply",
    path: "/resources/garden-suites-family-suitable-rental-supply",
    title: "Garden Suites and Family-Suitable Rental Supply",
    description:
      "How garden suites can add family-suitable rental supply when financing, design, and property constraints line up.",
    headline:
      "Garden suites can add real rental homes, not just backyard experiments.",
    deck: "The opportunity is strongest when the property, financing, budget, rental intent, and long-term livability all line up.",
    audienceCta: "Check If My Property Is Financeable",
    audienceHref: "/start/garden-suite",
    brandKit: corePages.gardenSuite.brandKit,
    points: [
      {
        title: "Equity sets the runway",
        copy: "Existing mortgage balance and available equity shape what the project can responsibly carry.",
      },
      {
        title: "Design affects financeability",
        copy: "A stronger rental layout can change valuation, rent assumptions, and lender confidence.",
      },
      {
        title: "Permits shape timing",
        copy: "A finance plan should respect municipal sequence instead of assuming shovel-ready certainty.",
      },
      {
        title: "Livability matters",
        copy: "Affordable rental supply is stronger when homes are durable, comfortable, and useful for real households.",
      },
    ],
  },
  mliSelectGuide: {
    id: "mliSelectGuide",
    path: "/resources/cmhc-mli-select-guide-for-multiplex-builds",
    title: "CMHC MLI Select Guide for Multiplex Builds",
    description:
      "Readiness questions for multiplex builders reviewing CMHC MLI Select affordability, accessibility, and energy efficiency considerations.",
    headline: "Treat MLI Select as a readiness path, not an assumption.",
    deck: "Affordability, accessibility, energy efficiency, documents, and timing all need review before a project relies on program execution.",
    audienceCta: "Check MLI Select Readiness",
    audienceHref: "/cmhc-mli-select-multiplex-financing",
    brandKit: corePages.mliSelect.brandKit,
    points: [
      {
        title: "Pillars drive the conversation",
        copy: "Affordability, accessibility, and energy efficiency commitments shape the readiness review.",
      },
      {
        title: "Documentation is not optional",
        copy: "Plans, rent assumptions, budgets, energy strategy, and ownership details need to be coherent.",
      },
      {
        title: "No guarantee language",
        copy: "External approval, pricing, qualification, and timing cannot be promised by Fairlend.",
      },
      {
        title: "Financing still has to work",
        copy: "Even a promising MLI Select path needs interim capital, construction budget discipline, and risk review.",
      },
    ],
  },
  constructionDraws: {
    id: "constructionDraws",
    path: "/resources/construction-draws-small-builders",
    title: "Construction Draws for Small Builders",
    description:
      "How construction draw timing affects small builder cash flow, interest exposure, and project feasibility.",
    headline: "Small builders feel draw timing before anyone else does.",
    deck: "A draw schedule is not paperwork. It decides who carries cost, for how long, and against what evidence.",
    audienceCta: "Plan My Draw Schedule",
    audienceHref: "/start/builder",
    brandKit: corePages.drawFinancing.brandKit,
    points: [
      {
        title: "Rigid draws create pressure",
        copy: "A three-draw structure can force builders to carry too much cost between reimbursements.",
      },
      {
        title: "Evidence earns release",
        copy: "Work completion, documents, site review, and approval should govern reimbursement.",
      },
      {
        title: "Interest is a timing problem",
        copy: "Funds released too early or too late can both create economic drag.",
      },
      {
        title: "Planning beats rescue",
        copy: "Draw needs should be mapped before trade sequence and supplier terms create a crisis.",
      },
    ],
  },
  privateCapital: {
    id: "privateCapital",
    path: "/resources/private-capital-affordable-housing",
    title: "Private Capital and Affordable Housing",
    description:
      "Where aligned private capital can help affordable rental housing and where it cannot replace policy.",
    headline:
      "Private capital can help affordable housing when incentives are honest.",
    deck: "Capital is not policy. But properly structured credit can bridge viable housing projects through timing, complexity, and construction risk.",
    audienceCta: "Read Fairlend's Housing Thesis",
    audienceHref: "/affordable-sustainable-rental-housing",
    brandKit: corePages.housingThesis.brandKit,
    points: [
      {
        title: "Capital cannot solve everything",
        copy: "Zoning, approvals, infrastructure, and affordability policy remain public problems.",
      },
      {
        title: "Timing can be financed",
        copy: "Private credit can bridge stages where public or conventional options move too slowly.",
      },
      {
        title: "Alignment matters",
        copy: "Borrower, community, and investor interests have to be structured with discipline.",
      },
      {
        title: "Housing outcomes count",
        copy: "The test is not volume alone. It is livable, durable rental supply that people can use.",
      },
    ],
  },
  sustainableReturns: {
    id: "sustainableReturns",
    path: "/resources/sustainable-rental-housing-investor-returns",
    title: "Sustainable Rental Housing and Investor Returns",
    description:
      "How housing-backed private credit can connect investor discipline with sustainable rental housing outcomes.",
    headline:
      "Sustainable housing and investor discipline should reinforce each other.",
    deck: "The investment thesis is strongest when the asset, borrower, project controls, and housing need are all legible.",
    audienceCta: "Request Investor Information",
    audienceHref: "/start/investor",
    brandKit: corePages.investors.brandKit,
    points: [
      {
        title: "Asset quality matters",
        copy: "Durable rental homes can support stronger collateral stories than speculative narratives.",
      },
      {
        title: "Risk comes first",
        copy: "Yield without underwriting is marketing, not an investment discipline.",
      },
      {
        title: "Project controls matter",
        copy: "Draw governance, documentation, and borrower review protect capital during construction.",
      },
      {
        title: "Suitability still applies",
        copy: "Investor participation needs eligibility, disclosure, and qualified review.",
      },
    ],
  },
  multiplexVsSuite: {
    id: "multiplexVsSuite",
    path: "/resources/multiplex-vs-garden-suite-vs-laneway-suite",
    title: "Multiplex vs Garden Suite vs Laneway Suite",
    description:
      "Compare multiplex, garden suite, and laneway suite financing considerations for GTA rental housing projects.",
    headline:
      "Multiplex, garden suite, and laneway suite financing are not the same review.",
    deck: "Each path has a different property profile, permit sequence, budget shape, rental story, and capital stack.",
    audienceCta: "Choose Your Path",
    audienceHref: "/start",
    brandKit: corePages.contact.brandKit,
    points: [
      {
        title: "Multiplex",
        copy: "Unit count, conversion scope, zoning, valuation, rental income, and construction sequencing dominate review.",
      },
      {
        title: "Garden suite",
        copy: "Existing equity, lot fit, design status, rental intent, and household risk are central.",
      },
      {
        title: "Laneway suite",
        copy: "Access, servicing, design constraints, and local permit context can change feasibility.",
      },
      {
        title: "Mixed projects",
        copy: "A main-building scope plus a suite needs one financing story, not two disconnected assumptions.",
      },
    ],
  },
};
