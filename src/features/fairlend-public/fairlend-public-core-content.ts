import type {
  CorePage,
} from "./fairlend-public-content-types";
import type { CorePageId } from "./fairlend-public-content-types";

export const corePages: Record<CorePageId, CorePage> = {
  home: {
    id: "home",
    path: "/",
    title: "Fairlend | GTA housing finance",
    description:
      "Fairlend finances GTA multiplexes, garden suites, construction draws, and housing-backed private credit with disciplined private capital.",
    kicker: "Fairlend Capital",
    headline: "Financing the GTA's next generation of rental housing.",
    deck: "Private lending for multiplexes, garden suites, CMHC MLI Select readiness, construction draws, and housing-backed investment programs.",
    primaryCta: "Start a Project Review",
    primaryHref: "/start",
    secondaryCta: "Request Investor Information",
    secondaryHref: "/start/investor",
    brandKit: "/designConcepts/warmBlueprint.png",
    theme: "paper",
    audience:
      "Property owners, builders, brokers, investors, and journalists need the same first answer: Fairlend is a real financing authority with a specific housing thesis.",
    belief:
      "The GTA needs capital that understands physical construction, municipal timelines, borrower cash flow, and the underwriting discipline investors expect.",
    cards: [
      {
        title: "Build a multiplex",
        copy: "Structure financing around unit count, permit stage, budget, and draw cadence.",
        href: "/multiplex-financing-gta",
      },
      {
        title: "Build a garden suite",
        copy: "Understand equity, permit status, rent potential, and construction budget before the project stalls.",
        href: "/garden-suite-financing-gta",
      },
      {
        title: "Invest in housing credit",
        copy: "Review Fairlend's approach to housing-backed private credit and disciplined underwriting.",
        href: "/investors",
      },
      {
        title: "Plan construction draws",
        copy: "Turn a build schedule into draw availability that reduces idle capital pressure.",
        href: "/construction-draw-financing",
      },
      {
        title: "Check MLI Select readiness",
        copy: "Map affordability, accessibility, and energy efficiency gaps before relying on CMHC execution.",
        href: "/cmhc-mli-select-multiplex-financing",
      },
    ],
    process: [
      "Choose the right path",
      "Submit the project basics",
      "Review feasibility",
      "Structure capital",
      "Move with evidence",
    ],
    proof: [
      "GTA missing-middle focus",
      "Construction draw planning",
      "Borrower and investor alignment",
      "Founder-led underwriting",
    ],
  },
  about: {
    id: "about",
    path: "/about",
    title: "About Fairlend",
    description:
      "Fairlend exists to make private lending more transparent, efficient, and aligned with better housing outcomes.",
    kicker: "About Fairlend",
    headline: "Private lending should be faster without becoming looser.",
    deck: "Fairlend aligns borrowers, builders, brokers, and capital partners around transparent terms, responsible underwriting, and better rental housing outcomes.",
    primaryCta: "Meet the Founder",
    primaryHref: "/leadership/elie-soberano",
    secondaryCta: "Explore Financing Options",
    secondaryHref: "/start",
    brandKit: "/designConcepts/SoftBrutalistBlueprint.png",
    theme: "blueprint",
    audience:
      "Journalists, partners, investors, borrowers, and builders come here to understand the company behind the financing.",
    belief:
      "Technology speeds diligence, organizes evidence, and clarifies tradeoffs. Human expertise still decides whether a project deserves capital.",
    cards: [
      {
        title: "Fairness",
        copy: "Clear options, direct language, and no theatrical complexity.",
      },
      {
        title: "Transparency",
        copy: "Borrowers and investors should understand the economics before commitment.",
      },
      {
        title: "Speed",
        copy: "Fast intake and structured review without skipping underwriting discipline.",
      },
      {
        title: "Sustainability",
        copy: "Capital should support housing that lasts, performs, and serves real households.",
      },
      {
        title: "Alignment",
        copy: "The financing structure has to work for the borrower and the capital behind it.",
      },
    ],
    process: [
      "Understand the asset",
      "Pressure-test the budget",
      "Map capital gaps",
      "Set terms clearly",
      "Govern the draw path",
    ],
    proof: [
      "Private lending expertise",
      "Construction finance fluency",
      "Technology-led operations",
      "Human review where stakes are high",
    ],
  },
  leadership: {
    id: "leadership",
    path: "/leadership/elie-soberano",
    title: "Elie Soberano | Fairlend Founder",
    description:
      "Founder profile, approved bio, expertise areas, interview contact, and Fairlend housing finance perspective.",
    kicker: "Founder Profile",
    headline:
      "Elie Soberano builds lending around clarity, discipline, and housing need.",
    deck: "A founder-led page for interviews, partner diligence, borrower confidence, and investor context.",
    primaryCta: "Request an Interview",
    primaryHref: "/start/media",
    secondaryCta: "Read Fairlend's Housing Thesis",
    secondaryHref: "/affordable-sustainable-rental-housing",
    brandKit: "/designConcepts/BuilderWarmGrid.png",
    theme: "field",
    audience:
      "Journalists, investors, brokers, partners, and borrowers need a credible founder reference they can link, quote, and verify.",
    belief:
      "Private lending works best when the person behind the decision can explain the thesis, the risks, and the human stakes without hiding behind jargon.",
    cards: [
      {
        title: "Private lending",
        copy: "Mortgage strategy, capital placement, and deal-level risk judgment.",
      },
      {
        title: "Construction financing",
        copy: "Draw schedules, budget pressure, permit timing, and builder cash-flow realities.",
      },
      {
        title: "GTA real estate",
        copy: "Local housing demand, missing-middle constraints, and neighborhood-scale rental supply.",
      },
      {
        title: "Housing finance",
        copy: "How private capital can support rental creation when underwriting stays responsible.",
      },
      {
        title: "Media commentary",
        copy: "Available for interviews on multiplexes, garden suites, CMHC MLI Select, and private capital.",
      },
    ],
    process: [
      "Short bio",
      "Long bio",
      "Founder thesis",
      "Approved credentials",
      "Interview routing",
    ],
    proof: [
      "Founder-led company",
      "Mortgage and lending perspective",
      "Construction finance expertise",
      "Housing thesis ownership",
    ],
  },
  press: {
    id: "press",
    path: "/press",
    title: "Fairlend Press and Media Kit",
    description:
      "Company boilerplate, founder bio, media topics, brand assets, and journalist contact routing for Fairlend.",
    kicker: "Press Room",
    headline: "Everything a housing or finance reporter needs in one place.",
    deck: "Approved company language, commentary lanes, founder context, brand assets, and a direct media inquiry path.",
    primaryCta: "Contact Media Team",
    primaryHref: "/start/media",
    brandKit: "/designConcepts/InstitutionalmplactBrutalist.png",
    theme: "civic",
    audience:
      "Journalists, podcast hosts, conference organizers, PR partners, and publishers need speed, clarity, and verifiable language.",
    belief:
      "A company asking to shape the housing conversation should make itself easy to check, quote, and challenge.",
    cards: [
      {
        title: "Company boilerplate",
        copy: "Fairlend finances GTA housing projects through transparent private lending and construction finance operations.",
      },
      {
        title: "Founder bio",
        copy: "Short and long approved biography for interviews, profiles, podcasts, and event programs.",
      },
      {
        title: "Commentary topics",
        copy: "Multiplex financing, garden suites, CMHC MLI Select, construction draws, private capital, and rental supply.",
      },
      {
        title: "Brand assets",
        copy: "Logo usage, editorial imagery, and approved descriptions for media use.",
      },
      {
        title: "Media contact",
        copy: "Route interview requests and deadlines through a dedicated inquiry path.",
      },
    ],
    process: [
      "Confirm topic",
      "Share deadline",
      "Request quote or interview",
      "Receive approved materials",
      "Coordinate follow-up",
    ],
    proof: [
      "Founder bio",
      "Company boilerplate",
      "Commentary lanes",
      "Generated editorial asset plate",
    ],
  },
  multiplex: {
    id: "multiplex",
    path: "/multiplex-financing-gta",
    title: "Multiplex Financing GTA",
    description:
      "Fairlend helps owners, developers, builders, and brokers finance GTA multiplex builds, conversions, and construction draws.",
    kicker: "Multiplex Financing GTA",
    headline: "Turn a multiplex idea into a financeable project.",
    deck: "For 3-unit conversions, 4plexes, 6-unit multiplexes, and mixed garden-suite projects that need capital stack clarity.",
    primaryCta: "Assess My Multiplex Project",
    primaryHref: "/start/multiplex",
    secondaryCta: "Talk to a Build Financing Advisor",
    secondaryHref: "/contact",
    brandKit: "/designConcepts/blueprintSwiss.png",
    theme: "blueprint",
    audience:
      "Property owners, small developers, builders, and brokers searching for multiplex financing in Toronto and the GTA.",
    belief:
      "Multiplex financing fails when budget, permit risk, valuation, rental income, draw schedule, and capital stack are reviewed separately.",
    cards: [
      {
        title: "What counts",
        copy: "Conversions, additions, new small rental buildings, and mixed structures with main-house and suite work.",
      },
      {
        title: "Capital stack issues",
        copy: "Land equity, mortgage balance, project budget, contingency, and borrower liquidity have to fit together.",
      },
      {
        title: "Draw planning",
        copy: "A construction roadmap needs draw availability that matches work completion and evidence.",
      },
      {
        title: "MLI Select context",
        copy: "Readiness matters, but Fairlend does not imply guaranteed CMHC qualification.",
      },
      {
        title: "Documents",
        copy: "Plans, permits, pro forma, budget, appraisal context, mortgage details, and ownership information.",
      },
    ],
    process: [
      "Submit project",
      "Feasibility review",
      "Financing structure",
      "Draw planning",
      "Funding path",
    ],
    proof: [
      "3-unit conversions",
      "4plex and 6-unit projects",
      "Mixed garden suite builds",
      "Construction budget review",
    ],
  },
  gardenSuite: {
    id: "gardenSuite",
    path: "/garden-suite-financing-gta",
    title: "Garden Suite Financing GTA",
    description:
      "Fairlend helps homeowners and investors assess financing for garden suites and laneway suites across the GTA.",
    kicker: "Garden Suite Financing",
    headline:
      "A backyard rental only works when the financing fits the property.",
    deck: "Assess equity, permits, construction budget, valuation, rent potential, and timeline before the project becomes a cash-flow problem.",
    primaryCta: "Check If My Property Is Financeable",
    primaryHref: "/start/garden-suite",
    secondaryCta: "Download Garden Suite Checklist",
    secondaryHref: "/resources/garden-suites-family-suitable-rental-supply",
    brandKit: "/designConcepts/CivicGardenBrutalist.png",
    theme: "civic",
    audience:
      "Homeowners, property investors, realtors, architects, designers, and builders exploring garden suite or laneway suite financing.",
    belief:
      "Small backyard housing can add useful rental supply, but the financing has to respect existing mortgage debt, permit status, and household risk.",
    cards: [
      {
        title: "Who it fits",
        copy: "Owners with enough equity, a viable lot, a credible budget, and rental intent.",
      },
      {
        title: "Common blockers",
        copy: "Existing mortgage balance, permit uncertainty, thin contingency, and unclear rental assumptions.",
      },
      {
        title: "Financeability",
        copy: "A project becomes financeable when property value, equity, budget, and income story line up.",
      },
      {
        title: "Suite types",
        copy: "Garden suites, laneway suites, and multiplex additions need different risk reviews.",
      },
      {
        title: "How Fairlend helps",
        copy: "Early review, budget context, financing options, and draw planning for the construction phase.",
      },
    ],
    process: [
      "Share address",
      "Confirm property and mortgage",
      "Review design status",
      "Estimate budget",
      "Choose next step",
    ],
    proof: [
      "Garden suites",
      "Laneway suites",
      "Owner-occupied properties",
      "Investor-owned rentals",
    ],
  },
  mliSelect: {
    id: "mliSelect",
    path: "/cmhc-mli-select-multiplex-financing",
    title: "CMHC MLI Select Multiplex Financing",
    description:
      "A careful Fairlend explainer on CMHC MLI Select considerations for multiplex and rental housing projects.",
    kicker: "CMHC MLI Select Readiness",
    headline: "Understand MLI Select before your financing plan depends on it.",
    deck: "A readiness-oriented explainer for affordability, accessibility, energy efficiency, documents, and common qualification gaps.",
    primaryCta: "Check MLI Select Readiness",
    primaryHref: "/start/multiplex",
    secondaryCta: "Book a Financing Review",
    secondaryHref: "/contact",
    brandKit: "/designConcepts/CapitalAndClimate.png",
    theme: "capital",
    audience:
      "Builders, property owners, investors, brokers, and consultants researching CMHC MLI Select for multiplex or rental projects.",
    belief:
      "MLI Select can matter, but qualification is specific. Fairlend can help prepare and structure, not guarantee an external approval.",
    caution:
      "Fairlend does not guarantee CMHC qualification, insurance, approval, pricing, or timing. This page is educational and readiness-focused.",
    cards: [
      {
        title: "What it is",
        copy: "A CMHC mortgage loan insurance program for qualifying multi-unit residential rental projects.",
      },
      {
        title: "Why it matters",
        copy: "Terms may be affected by affordability, accessibility, energy efficiency, and program scoring.",
      },
      {
        title: "Project fit",
        copy: "Multiplex and rental projects need careful review before assuming program eligibility.",
      },
      {
        title: "Qualification gaps",
        copy: "Affordability depth, energy performance, accessibility commitments, documentation, and timelines.",
      },
      {
        title: "Documents",
        copy: "Plans, budgets, rent schedule, energy strategy, accessibility scope, ownership, and financing details.",
      },
    ],
    process: [
      "Map the project",
      "Identify target pillars",
      "Find documentation gaps",
      "Review financing implications",
      "Proceed with caution",
    ],
    proof: [
      "Affordability review",
      "Accessibility context",
      "Energy efficiency planning",
      "No guarantee language",
    ],
  },
  housingThesis: {
    id: "housingThesis",
    path: "/affordable-sustainable-rental-housing",
    title: "Fairlend Housing Thesis",
    description:
      "Fairlend's view on affordable, sustainable, family-suitable rental housing and aligned private capital.",
    kicker: "Housing Thesis",
    headline:
      "More units are not enough. The GTA needs homes people can actually live in.",
    deck: "Fairlend believes private capital can help create livable, sustainable, family-suitable rentals when incentives and underwriting are aligned.",
    primaryCta: "Read Our Founder's Perspective",
    primaryHref: "/leadership/elie-soberano",
    secondaryCta: "Explore Multiplex Financing",
    secondaryHref: "/multiplex-financing-gta",
    brandKit: "/designConcepts/Human-Scale-Housing.png",
    theme: "field",
    audience:
      "Journalists, investors, policymakers, builders, and partners who want the thesis behind Fairlend's housing focus.",
    belief:
      "Government programs matter, but housing supply also needs disciplined private capital aimed at missing-middle, livable rental forms.",
    cards: [
      {
        title: "The problem",
        copy: "The GTA needs rental supply that supports families, workers, aging parents, and neighborhood continuity.",
      },
      {
        title: "Towers are not enough",
        copy: "High-rise supply alone does not solve every rental need or every neighborhood constraint.",
      },
      {
        title: "Missing-middle matters",
        copy: "Multiplexes and suites can add rental homes inside existing communities.",
      },
      {
        title: "Affordability needs livability",
        copy: "A lower rent target loses meaning if the home is too small, inefficient, or unstable.",
      },
      {
        title: "Capital can help",
        copy: "Aligned private credit can bridge timing, budget, and construction constraints.",
      },
    ],
    process: [
      "Name the housing need",
      "Finance realistic projects",
      "Govern construction",
      "Protect discipline",
      "Measure livable outcomes",
    ],
    proof: [
      "Missing-middle focus",
      "Sustainable rental supply",
      "Family-suitable lens",
      "Private capital alignment",
    ],
  },
  drawFinancing: {
    id: "drawFinancing",
    path: "/construction-draw-financing",
    title: "Construction Draw Financing Ontario",
    description:
      "Builder-facing construction draw financing for Ontario projects that need flexible milestone-based draw planning.",
    kicker: "Construction Draw Financing",
    headline: "Rigid draw schedules can choke otherwise good builds.",
    deck: "Fairlend helps builders and small developers plan draw availability around completed work, evidence, budget pressure, and interest discipline.",
    primaryCta: "Plan My Draw Schedule",
    primaryHref: "/start/builder",
    secondaryCta: "Submit Upcoming Build",
    secondaryHref: "/start/builder",
    brandKit: "/designConcepts/buildersField.png",
    theme: "field",
    audience:
      "Builders, GCs, construction managers, and small developers searching for construction draw financing in Ontario and the GTA.",
    belief:
      "Cash-flow gaps kill good projects when draw timing ignores real field sequence, trade dependencies, and borrower working capital.",
    cards: [
      {
        title: "Why draws matter",
        copy: "The schedule determines how long builders carry cost before reimbursement.",
      },
      {
        title: "Rigid structures",
        copy: "Three-draw templates can miss the real economic shape of a build.",
      },
      {
        title: "Milestone availability",
        copy: "Draws should connect to completed work, evidence, review, and approved release.",
      },
      {
        title: "Interest discipline",
        copy: "Releasing funds at the right time can reduce unnecessary interest exposure.",
      },
      {
        title: "Builder intake",
        copy: "Project type, location, budget, permits, unit count, and draw requirements drive review.",
      },
    ],
    process: [
      "Submit upcoming build",
      "Map milestones",
      "Estimate draw needs",
      "Review evidence path",
      "Set financing cadence",
    ],
    proof: [
      "Milestone-based draw availability",
      "Builder cash-flow lens",
      "Evidence-driven release",
      "Ontario construction focus",
    ],
  },
  investors: {
    id: "investors",
    path: "/investors",
    title: "Fairlend Investors",
    description:
      "Investor-facing Fairlend page for housing-backed private credit thesis, risk management, underwriting discipline, and information requests.",
    kicker: "Investor Information",
    headline: "Housing-backed private credit needs underwriting before yield.",
    deck: "A credible destination for prospective investors, capital partners, wealth advisors, and family offices reviewing Fairlend's thesis.",
    primaryCta: "Request Investor Information",
    primaryHref: "/start/investor",
    brandKit: "/designConcepts/softBrutalist.png",
    theme: "capital",
    audience:
      "Prospective investors, capital partners, wealth advisors, and family offices seeking a compliant first overview.",
    belief:
      "Returns have to be earned through asset discipline, borrower review, project controls, legal structure, and sober risk management.",
    caution:
      "This page is for informational purposes only and requires legal and compliance review before external publication. It is not an offer to sell securities.",
    cards: [
      {
        title: "Investment thesis",
        copy: "Private credit tied to real housing demand and disciplined collateral review.",
      },
      {
        title: "Why housing finance",
        copy: "Rental supply, construction demand, and borrower need create a real capital use case.",
      },
      {
        title: "Risk management",
        copy: "Underwriting, loan-to-value discipline, draw controls, documentation, and portfolio monitoring.",
      },
      {
        title: "Project types",
        copy: "Multiplexes, garden suites, construction draws, and real estate-backed borrower needs.",
      },
      {
        title: "Compliance path",
        copy: "Prospective investors should request information and review suitability with qualified advisors.",
      },
    ],
    process: [
      "Request information",
      "Confirm investor profile",
      "Review materials",
      "Discuss suitability",
      "Proceed through compliant channels",
    ],
    proof: [
      "Real estate-backed credit",
      "Underwriting discipline",
      "Risk-first language",
      "Compliance disclaimer",
    ],
  },
  resources: {
    id: "resources",
    path: "/resources",
    title: "Fairlend Resources",
    description:
      "Guides and insights on GTA multiplex financing, garden suites, CMHC MLI Select, construction draws, and private capital.",
    kicker: "Resource Hub",
    headline:
      "Practical housing finance guides for the projects people are actually trying to build.",
    deck: "Topical depth for borrowers, builders, investors, brokers, journalists, and AI search surfaces.",
    primaryCta: "Explore Guides",
    primaryHref: "/resources",
    secondaryCta: "Start a Project Review",
    secondaryHref: "/start",
    brandKit: "/designConcepts/softBrutalistBright.png",
    theme: "paper",
    audience:
      "All audiences need plain-language, high-signal articles that connect housing policy, project finance, construction draws, and investment context.",
    belief:
      "Useful content should help a reader make a better decision, not bury them under generic lending articles.",
    cards: [
      {
        title: "GTA multiplex financing gaps",
        copy: "Why promising missing-middle projects often break at the capital stack.",
      },
      {
        title: "Garden suites and rental supply",
        copy: "How backyard housing can serve families when financing and design are realistic.",
      },
      {
        title: "MLI Select guide",
        copy: "Readiness questions for multiplex builders before assuming program fit.",
      },
      {
        title: "Construction draws for small builders",
        copy: "How draw timing changes cash pressure and interest exposure.",
      },
      {
        title: "Private capital and affordable housing",
        copy: "Where aligned private credit can help and where it cannot substitute policy.",
      },
    ],
    process: [
      "Guides",
      "Insights",
      "CMHC MLI Select",
      "Multiplexes",
      "Garden suites",
      "Construction financing",
      "Investing",
    ],
    proof: [
      "SEO depth",
      "Media readiness",
      "AI visibility",
      "Audience-specific CTAs",
    ],
  },
  contact: {
    id: "contact",
    path: "/contact",
    title: "Contact Fairlend",
    description:
      "Route borrower, builder, broker, investor, journalist, and general Fairlend inquiries to the right path.",
    kicker: "Contact Fairlend",
    headline: "Choose the path that matches the capital question.",
    deck: "Every inbound lead should land in the right review lane, with enough context for Fairlend to respond intelligently.",
    primaryCta: "Choose Your Path",
    primaryHref: "/start",
    brandKit: "/designConcepts/WarmBlueprintBrutalistModern.png",
    theme: "paper",
    audience:
      "Borrowers, builders, referral partners, investors, journalists, and general inquiries all need different first questions.",
    belief:
      "Good routing reduces wasted calls and gets each person to the right financing or information path faster.",
    cards: [
      {
        title: "Build a multiplex",
        copy: "Project review for unit count, budget, permits, and financing structure.",
        href: "/start/multiplex",
      },
      {
        title: "Build a garden suite",
        copy: "Property review for equity, permits, budget, and rental intent.",
        href: "/start/garden-suite",
      },
      {
        title: "Builder projects",
        copy: "Upcoming builds, draw needs, locations, and project size.",
        href: "/start/builder",
      },
      {
        title: "Broker or referral partner",
        copy: "Partner routing for client-fit review and referral context.",
        href: "/start/broker",
      },
      {
        title: "Investor information",
        copy: "Investor profile, intended allocation, and information request.",
        href: "/start/investor",
      },
    ],
    process: [
      "Select path",
      "Share essentials",
      "Upload context if needed",
      "Fairlend reviews",
      "Right team follows up",
    ],
    proof: [
      "Multiplex",
      "Garden suite",
      "Builder",
      "Broker",
      "Investor",
      "Journalist",
      "General inquiry",
    ],
  },
};

