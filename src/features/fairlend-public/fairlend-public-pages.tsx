import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Home,
  Landmark,
  Leaf,
  Newspaper,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

import "./fairlend-public.css";

type CorePageId =
  | "home"
  | "about"
  | "leadership"
  | "press"
  | "multiplex"
  | "gardenSuite"
  | "mliSelect"
  | "housingThesis"
  | "drawFinancing"
  | "investors"
  | "resources"
  | "contact";

type IntakePageId =
  | "start"
  | "startMultiplex"
  | "startGardenSuite"
  | "startBuilder"
  | "startInvestor"
  | "startBroker"
  | "startMedia";

type ArticlePageId =
  | "financingGap"
  | "gardenSuitesSupply"
  | "mliSelectGuide"
  | "constructionDraws"
  | "privateCapital"
  | "sustainableReturns"
  | "multiplexVsSuite";

interface PageCard {
  title: string;
  copy: string;
  href?: string;
}

interface CorePage {
  id: CorePageId;
  path: string;
  title: string;
  description: string;
  kicker: string;
  headline: string;
  deck: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta?: string;
  secondaryHref?: string;
  brandKit: string;
  theme: "paper" | "civic" | "field" | "blueprint" | "capital";
  audience: string;
  belief: string;
  cards: PageCard[];
  process: string[];
  proof: string[];
  caution?: string;
}

interface IntakeField {
  label: string;
  type?: "text" | "email" | "tel" | "number" | "file" | "textarea" | "select" | "checkbox";
  options?: string[];
  required?: boolean;
}

interface IntakePage {
  id: IntakePageId;
  path: string;
  title: string;
  description: string;
  headline: string;
  deck: string;
  parentHref: string;
  brandKit: string;
  fields: IntakeField[];
  routes?: PageCard[];
  compliance?: string;
}

interface ArticlePage {
  id: ArticlePageId;
  path: string;
  title: string;
  description: string;
  headline: string;
  deck: string;
  audienceCta: string;
  audienceHref: string;
  brandKit: string;
  points: PageCard[];
}

const authorityAsset = "/assets/fairlend-public/editorial-authority-plate.png";

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
    audience: "Property owners, builders, brokers, investors, and journalists need the same first answer: Fairlend is a real financing authority with a specific housing thesis.",
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
    process: ["Choose the right path", "Submit the project basics", "Review feasibility", "Structure capital", "Move with evidence"],
    proof: ["GTA missing-middle focus", "Construction draw planning", "Borrower and investor alignment", "Founder-led underwriting"],
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
    audience: "Journalists, partners, investors, borrowers, and builders come here to understand the company behind the financing.",
    belief:
      "Technology speeds diligence, organizes evidence, and clarifies tradeoffs. Human expertise still decides whether a project deserves capital.",
    cards: [
      { title: "Fairness", copy: "Clear options, direct language, and no theatrical complexity." },
      { title: "Transparency", copy: "Borrowers and investors should understand the economics before commitment." },
      { title: "Speed", copy: "Fast intake and structured review without skipping underwriting discipline." },
      { title: "Sustainability", copy: "Capital should support housing that lasts, performs, and serves real households." },
      { title: "Alignment", copy: "The financing structure has to work for the borrower and the capital behind it." },
    ],
    process: ["Understand the asset", "Pressure-test the budget", "Map capital gaps", "Set terms clearly", "Govern the draw path"],
    proof: ["Private lending expertise", "Construction finance fluency", "Technology-led operations", "Human review where stakes are high"],
  },
  leadership: {
    id: "leadership",
    path: "/leadership/elie-soberano",
    title: "Elie Soberano | Fairlend Founder",
    description:
      "Founder profile, approved bio, expertise areas, interview contact, and Fairlend housing finance perspective.",
    kicker: "Founder Profile",
    headline: "Elie Soberano builds lending around clarity, discipline, and housing need.",
    deck: "A founder-led page for interviews, partner diligence, borrower confidence, and investor context.",
    primaryCta: "Request an Interview",
    primaryHref: "/start/media",
    secondaryCta: "Read Fairlend's Housing Thesis",
    secondaryHref: "/affordable-sustainable-rental-housing",
    brandKit: "/designConcepts/BuilderWarmGrid.png",
    theme: "field",
    audience: "Journalists, investors, brokers, partners, and borrowers need a credible founder reference they can link, quote, and verify.",
    belief:
      "Private lending works best when the person behind the decision can explain the thesis, the risks, and the human stakes without hiding behind jargon.",
    cards: [
      { title: "Private lending", copy: "Mortgage strategy, capital placement, and deal-level risk judgment." },
      { title: "Construction financing", copy: "Draw schedules, budget pressure, permit timing, and builder cash-flow realities." },
      { title: "GTA real estate", copy: "Local housing demand, missing-middle constraints, and neighborhood-scale rental supply." },
      { title: "Housing finance", copy: "How private capital can support rental creation when underwriting stays responsible." },
      { title: "Media commentary", copy: "Available for interviews on multiplexes, garden suites, CMHC MLI Select, and private capital." },
    ],
    process: ["Short bio", "Long bio", "Founder thesis", "Approved credentials", "Interview routing"],
    proof: ["Founder-led company", "Mortgage and lending perspective", "Construction finance expertise", "Housing thesis ownership"],
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
    audience: "Journalists, podcast hosts, conference organizers, PR partners, and publishers need speed, clarity, and verifiable language.",
    belief:
      "A company asking to shape the housing conversation should make itself easy to check, quote, and challenge.",
    cards: [
      { title: "Company boilerplate", copy: "Fairlend finances GTA housing projects through transparent private lending and construction finance operations." },
      { title: "Founder bio", copy: "Short and long approved biography for interviews, profiles, podcasts, and event programs." },
      { title: "Commentary topics", copy: "Multiplex financing, garden suites, CMHC MLI Select, construction draws, private capital, and rental supply." },
      { title: "Brand assets", copy: "Logo usage, editorial imagery, and approved descriptions for media use." },
      { title: "Media contact", copy: "Route interview requests and deadlines through a dedicated inquiry path." },
    ],
    process: ["Confirm topic", "Share deadline", "Request quote or interview", "Receive approved materials", "Coordinate follow-up"],
    proof: ["Founder bio", "Company boilerplate", "Commentary lanes", "Generated editorial asset plate"],
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
    audience: "Property owners, small developers, builders, and brokers searching for multiplex financing in Toronto and the GTA.",
    belief:
      "Multiplex financing fails when budget, permit risk, valuation, rental income, draw schedule, and capital stack are reviewed separately.",
    cards: [
      { title: "What counts", copy: "Conversions, additions, new small rental buildings, and mixed structures with main-house and suite work." },
      { title: "Capital stack issues", copy: "Land equity, mortgage balance, project budget, contingency, and borrower liquidity have to fit together." },
      { title: "Draw planning", copy: "A construction roadmap needs draw availability that matches work completion and evidence." },
      { title: "MLI Select context", copy: "Readiness matters, but Fairlend does not imply guaranteed CMHC qualification." },
      { title: "Documents", copy: "Plans, permits, pro forma, budget, appraisal context, mortgage details, and ownership information." },
    ],
    process: ["Submit project", "Feasibility review", "Financing structure", "Draw planning", "Funding path"],
    proof: ["3-unit conversions", "4plex and 6-unit projects", "Mixed garden suite builds", "Construction budget review"],
  },
  gardenSuite: {
    id: "gardenSuite",
    path: "/garden-suite-financing-gta",
    title: "Garden Suite Financing GTA",
    description:
      "Fairlend helps homeowners and investors assess financing for garden suites and laneway suites across the GTA.",
    kicker: "Garden Suite Financing",
    headline: "A backyard rental only works when the financing fits the property.",
    deck: "Assess equity, permits, construction budget, valuation, rent potential, and timeline before the project becomes a cash-flow problem.",
    primaryCta: "Check If My Property Is Financeable",
    primaryHref: "/start/garden-suite",
    secondaryCta: "Download Garden Suite Checklist",
    secondaryHref: "/resources/garden-suites-family-suitable-rental-supply",
    brandKit: "/designConcepts/CivicGardenBrutalist.png",
    theme: "civic",
    audience: "Homeowners, property investors, realtors, architects, designers, and builders exploring garden suite or laneway suite financing.",
    belief:
      "Small backyard housing can add useful rental supply, but the financing has to respect existing mortgage debt, permit status, and household risk.",
    cards: [
      { title: "Who it fits", copy: "Owners with enough equity, a viable lot, a credible budget, and rental intent." },
      { title: "Common blockers", copy: "Existing mortgage balance, permit uncertainty, thin contingency, and unclear rental assumptions." },
      { title: "Financeability", copy: "A project becomes financeable when property value, equity, budget, and income story line up." },
      { title: "Suite types", copy: "Garden suites, laneway suites, and multiplex additions need different risk reviews." },
      { title: "How Fairlend helps", copy: "Early review, budget context, financing options, and draw planning for the construction phase." },
    ],
    process: ["Share address", "Confirm property and mortgage", "Review design status", "Estimate budget", "Choose next step"],
    proof: ["Garden suites", "Laneway suites", "Owner-occupied properties", "Investor-owned rentals"],
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
    audience: "Builders, property owners, investors, brokers, and consultants researching CMHC MLI Select for multiplex or rental projects.",
    belief:
      "MLI Select can matter, but qualification is specific. Fairlend can help prepare and structure, not guarantee an external approval.",
    caution:
      "Fairlend does not guarantee CMHC qualification, insurance, approval, pricing, or timing. This page is educational and readiness-focused.",
    cards: [
      { title: "What it is", copy: "A CMHC mortgage loan insurance program for qualifying multi-unit residential rental projects." },
      { title: "Why it matters", copy: "Terms may be affected by affordability, accessibility, energy efficiency, and program scoring." },
      { title: "Project fit", copy: "Multiplex and rental projects need careful review before assuming program eligibility." },
      { title: "Qualification gaps", copy: "Affordability depth, energy performance, accessibility commitments, documentation, and timelines." },
      { title: "Documents", copy: "Plans, budgets, rent schedule, energy strategy, accessibility scope, ownership, and financing details." },
    ],
    process: ["Map the project", "Identify target pillars", "Find documentation gaps", "Review financing implications", "Proceed with caution"],
    proof: ["Affordability review", "Accessibility context", "Energy efficiency planning", "No guarantee language"],
  },
  housingThesis: {
    id: "housingThesis",
    path: "/affordable-sustainable-rental-housing",
    title: "Fairlend Housing Thesis",
    description:
      "Fairlend's view on affordable, sustainable, family-suitable rental housing and aligned private capital.",
    kicker: "Housing Thesis",
    headline: "More units are not enough. The GTA needs homes people can actually live in.",
    deck: "Fairlend believes private capital can help create livable, sustainable, family-suitable rentals when incentives and underwriting are aligned.",
    primaryCta: "Read Our Founder's Perspective",
    primaryHref: "/leadership/elie-soberano",
    secondaryCta: "Explore Multiplex Financing",
    secondaryHref: "/multiplex-financing-gta",
    brandKit: "/designConcepts/Human-Scale-Housing.png",
    theme: "field",
    audience: "Journalists, investors, policymakers, builders, and partners who want the thesis behind Fairlend's housing focus.",
    belief:
      "Government programs matter, but housing supply also needs disciplined private capital aimed at missing-middle, livable rental forms.",
    cards: [
      { title: "The problem", copy: "The GTA needs rental supply that supports families, workers, aging parents, and neighborhood continuity." },
      { title: "Towers are not enough", copy: "High-rise supply alone does not solve every rental need or every neighborhood constraint." },
      { title: "Missing-middle matters", copy: "Multiplexes and suites can add rental homes inside existing communities." },
      { title: "Affordability needs livability", copy: "A lower rent target loses meaning if the home is too small, inefficient, or unstable." },
      { title: "Capital can help", copy: "Aligned private credit can bridge timing, budget, and construction constraints." },
    ],
    process: ["Name the housing need", "Finance realistic projects", "Govern construction", "Protect discipline", "Measure livable outcomes"],
    proof: ["Missing-middle focus", "Sustainable rental supply", "Family-suitable lens", "Private capital alignment"],
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
    audience: "Builders, GCs, construction managers, and small developers searching for construction draw financing in Ontario and the GTA.",
    belief:
      "Cash-flow gaps kill good projects when draw timing ignores real field sequence, trade dependencies, and borrower working capital.",
    cards: [
      { title: "Why draws matter", copy: "The schedule determines how long builders carry cost before reimbursement." },
      { title: "Rigid structures", copy: "Three-draw templates can miss the real economic shape of a build." },
      { title: "Milestone availability", copy: "Draws should connect to completed work, evidence, review, and approved release." },
      { title: "Interest discipline", copy: "Releasing funds at the right time can reduce unnecessary interest exposure." },
      { title: "Builder intake", copy: "Project type, location, budget, permits, unit count, and draw requirements drive review." },
    ],
    process: ["Submit upcoming build", "Map milestones", "Estimate draw needs", "Review evidence path", "Set financing cadence"],
    proof: ["Milestone-based draw availability", "Builder cash-flow lens", "Evidence-driven release", "Ontario construction focus"],
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
    audience: "Prospective investors, capital partners, wealth advisors, and family offices seeking a compliant first overview.",
    belief:
      "Returns have to be earned through asset discipline, borrower review, project controls, legal structure, and sober risk management.",
    caution:
      "This page is for informational purposes only and requires legal and compliance review before external publication. It is not an offer to sell securities.",
    cards: [
      { title: "Investment thesis", copy: "Private credit tied to real housing demand and disciplined collateral review." },
      { title: "Why housing finance", copy: "Rental supply, construction demand, and borrower need create a real capital use case." },
      { title: "Risk management", copy: "Underwriting, loan-to-value discipline, draw controls, documentation, and portfolio monitoring." },
      { title: "Project types", copy: "Multiplexes, garden suites, construction draws, and real estate-backed borrower needs." },
      { title: "Compliance path", copy: "Prospective investors should request information and review suitability with qualified advisors." },
    ],
    process: ["Request information", "Confirm investor profile", "Review materials", "Discuss suitability", "Proceed through compliant channels"],
    proof: ["Real estate-backed credit", "Underwriting discipline", "Risk-first language", "Compliance disclaimer"],
  },
  resources: {
    id: "resources",
    path: "/resources",
    title: "Fairlend Resources",
    description:
      "Guides and insights on GTA multiplex financing, garden suites, CMHC MLI Select, construction draws, and private capital.",
    kicker: "Resource Hub",
    headline: "Practical housing finance guides for the projects people are actually trying to build.",
    deck: "Topical depth for borrowers, builders, investors, brokers, journalists, and AI search surfaces.",
    primaryCta: "Explore Guides",
    primaryHref: "/resources",
    secondaryCta: "Start a Project Review",
    secondaryHref: "/start",
    brandKit: "/designConcepts/softBrutalistBright.png",
    theme: "paper",
    audience: "All audiences need plain-language, high-signal articles that connect housing policy, project finance, construction draws, and investment context.",
    belief:
      "Useful content should help a reader make a better decision, not bury them under generic lending articles.",
    cards: [
      { title: "GTA multiplex financing gaps", copy: "Why promising missing-middle projects often break at the capital stack." },
      { title: "Garden suites and rental supply", copy: "How backyard housing can serve families when financing and design are realistic." },
      { title: "MLI Select guide", copy: "Readiness questions for multiplex builders before assuming program fit." },
      { title: "Construction draws for small builders", copy: "How draw timing changes cash pressure and interest exposure." },
      { title: "Private capital and affordable housing", copy: "Where aligned private credit can help and where it cannot substitute policy." },
    ],
    process: ["Guides", "Insights", "CMHC MLI Select", "Multiplexes", "Garden suites", "Construction financing", "Investing"],
    proof: ["SEO depth", "Media readiness", "AI visibility", "Audience-specific CTAs"],
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
    audience: "Borrowers, builders, referral partners, investors, journalists, and general inquiries all need different first questions.",
    belief:
      "Good routing reduces wasted calls and gets each person to the right financing or information path faster.",
    cards: [
      { title: "Build a multiplex", copy: "Project review for unit count, budget, permits, and financing structure.", href: "/start/multiplex" },
      { title: "Build a garden suite", copy: "Property review for equity, permits, budget, and rental intent.", href: "/start/garden-suite" },
      { title: "Builder projects", copy: "Upcoming builds, draw needs, locations, and project size.", href: "/start/builder" },
      { title: "Broker or referral partner", copy: "Partner routing for client-fit review and referral context.", href: "/start/broker" },
      { title: "Investor information", copy: "Investor profile, intended allocation, and information request.", href: "/start/investor" },
    ],
    process: ["Select path", "Share essentials", "Upload context if needed", "Fairlend reviews", "Right team follows up"],
    proof: ["Multiplex", "Garden suite", "Builder", "Broker", "Investor", "Journalist", "General inquiry"],
  },
};

export const intakePages: Record<IntakePageId, IntakePage> = {
  start: {
    id: "start",
    path: "/start",
    title: "Start with Fairlend",
    description: "Choose the right Fairlend intake path for your project, investment, referral, media, or general inquiry.",
    headline: "Start in the right lane.",
    deck: "Fairlend routes each inquiry by project type, capital need, and urgency so the first review is useful.",
    parentHref: "/contact",
    brandKit: corePages.contact.brandKit,
    fields: [],
    routes: [
      { title: "I want to build a multiplex", copy: "Unit count, budget, permit stage, and financing structure.", href: "/start/multiplex" },
      { title: "I want to build a garden suite", copy: "Property, equity, design status, and rental plan.", href: "/start/garden-suite" },
      { title: "I am a builder", copy: "Upcoming projects, draw needs, locations, and active build volume.", href: "/start/builder" },
      { title: "I am a broker or referral partner", copy: "Client fit, referral context, and desired next step.", href: "/start/broker" },
      { title: "I want investor information", copy: "Investor profile, experience, intended allocation, and consent.", href: "/start/investor" },
      { title: "I am a journalist", copy: "Topic, deadline, requested format, and media contact details.", href: "/start/media" },
    ],
  },
  startMultiplex: {
    id: "startMultiplex",
    path: "/start/multiplex",
    title: "Multiplex Project Intake",
    description: "Submit a GTA multiplex project for Fairlend feasibility review.",
    headline: "Tell us enough to assess the multiplex path.",
    deck: "The first review needs the property, unit plan, permit stage, budget, ownership, mortgage context, and timeline.",
    parentHref: "/multiplex-financing-gta",
    brandKit: corePages.multiplex.brandKit,
    fields: [
      { label: "Name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Phone", type: "tel" },
      { label: "Property address", required: true },
      { label: "Existing property type" },
      { label: "Proposed number of units", type: "number" },
      { label: "New build or conversion", type: "select", options: ["New build", "Conversion", "Addition", "Mixed scope"] },
      { label: "Permit status", type: "select", options: ["Not started", "Design underway", "Submitted", "Issued"] },
      { label: "Estimated project budget" },
      { label: "Land owned or under contract" },
      { label: "Current mortgage balance" },
      { label: "Desired timeline" },
      { label: "Upload drawings, pro forma, or budget", type: "file" },
      { label: "Project notes", type: "textarea" },
    ],
  },
  startGardenSuite: {
    id: "startGardenSuite",
    path: "/start/garden-suite",
    title: "Garden Suite Intake",
    description: "Submit a garden suite or laneway suite property for Fairlend financing review.",
    headline: "Check whether the property can carry the suite.",
    deck: "The first review looks at address, equity, existing debt, permit status, construction budget, intended rental use, and timing.",
    parentHref: "/garden-suite-financing-gta",
    brandKit: corePages.gardenSuite.brandKit,
    fields: [
      { label: "Name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Property address", required: true },
      { label: "Existing home type" },
      { label: "Lot size, if known" },
      { label: "Current mortgage balance" },
      { label: "Approximate equity" },
      { label: "Permit or design status", type: "select", options: ["Idea stage", "Designer engaged", "Permit submitted", "Permit issued"] },
      { label: "Estimated construction budget" },
      { label: "Intended rental use" },
      { label: "Timeline" },
      { label: "Notes", type: "textarea" },
    ],
  },
  startBuilder: {
    id: "startBuilder",
    path: "/start/builder",
    title: "Builder Project Intake",
    description: "Submit upcoming builder projects and draw schedule requirements for Fairlend review.",
    headline: "Map the upcoming builds before draw pressure hits.",
    deck: "Fairlend reviews project type, build volume, locations, permits, financing need, draw schedule requirements, and typical project size.",
    parentHref: "/construction-draw-financing",
    brandKit: corePages.drawFinancing.brandKit,
    fields: [
      { label: "Company name", required: true },
      { label: "Primary contact", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Project type" },
      { label: "Number of active or upcoming builds", type: "number" },
      { label: "Locations" },
      { label: "Unit count" },
      { label: "Permit status" },
      { label: "Financing needed" },
      { label: "Draw schedule requirements", type: "textarea" },
      { label: "Typical project size" },
      { label: "Additional context", type: "textarea" },
    ],
  },
  startInvestor: {
    id: "startInvestor",
    path: "/start/investor",
    title: "Investor Information Request",
    description: "Request Fairlend investor information with profile, experience, intended allocation, and consent acknowledgment.",
    headline: "Request investor information through a compliant first step.",
    deck: "This intake captures investor type, experience, intended allocation, interest area, contact details, and acknowledgement.",
    parentHref: "/investors",
    brandKit: corePages.investors.brandKit,
    compliance: "This request is informational and is not an offer to sell securities. Suitability and eligibility require separate review.",
    fields: [
      { label: "Name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Investor type", type: "select", options: ["Individual", "Accredited investor", "Family office", "Advisor", "Institution"] },
      { label: "Investment experience" },
      { label: "Approximate intended allocation" },
      { label: "Interest area" },
      { label: "Phone", type: "tel" },
      { label: "Consent and disclaimer acknowledgment", type: "checkbox", required: true },
      { label: "Questions", type: "textarea" },
    ],
  },
  startBroker: {
    id: "startBroker",
    path: "/start/broker",
    title: "Broker and Referral Partner Intake",
    description: "Route broker and referral partner inquiries to Fairlend with client and project context.",
    headline: "Bring the client context, not just the lead.",
    deck: "Referral quality improves when the first note includes project type, financing need, stage, location, and timeline.",
    parentHref: "/contact",
    brandKit: corePages.contact.brandKit,
    fields: [
      { label: "Name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Company" },
      { label: "Referral type", type: "select", options: ["Multiplex", "Garden suite", "Builder", "Investor", "Other"] },
      { label: "Client or project location" },
      { label: "Financing need" },
      { label: "Timeline" },
      { label: "Referral context", type: "textarea" },
    ],
  },
  startMedia: {
    id: "startMedia",
    path: "/start/media",
    title: "Media Inquiry",
    description: "Submit a media inquiry, deadline, topic, and requested interview or quote format for Fairlend.",
    headline: "Give the media team the deadline and the angle.",
    deck: "Fairlend can respond faster when the request includes publication, topic, deadline, format, and requested spokesperson.",
    parentHref: "/press",
    brandKit: corePages.press.brandKit,
    fields: [
      { label: "Name", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Publication or organization" },
      { label: "Topic" },
      { label: "Deadline" },
      { label: "Requested format", type: "select", options: ["Written quote", "Phone interview", "Video interview", "Background context"] },
      { label: "Questions or brief", type: "textarea" },
    ],
  },
};

export const articlePages: Record<ArticlePageId, ArticlePage> = {
  financingGap: {
    id: "financingGap",
    path: "/resources/financing-gap-gta-multiplex-builds",
    title: "The Financing Gap in GTA Multiplex Builds",
    description:
      "Why GTA multiplex projects often break at the financing gap and how early capital-stack review helps.",
    headline: "The financing gap is where many GTA multiplex builds quietly die.",
    deck: "Unit count, permits, valuation, rental income, borrower liquidity, and draw timing all have to work at the same time.",
    audienceCta: "Assess My Multiplex Project",
    audienceHref: "/start/multiplex",
    brandKit: corePages.resources.brandKit,
    points: [
      { title: "Land value is not cash flow", copy: "Equity matters, but projects still need liquidity through design, permits, soft costs, and construction." },
      { title: "Valuation timing bites", copy: "The finished rental story can be compelling while the interim construction profile still needs private capital." },
      { title: "Draw cadence matters", copy: "A feasible build can become fragile when reimbursement arrives too late for trade sequence." },
      { title: "Early review helps", copy: "A first-pass capital stack review surfaces gaps before owners commit to a path they cannot carry." },
    ],
  },
  gardenSuitesSupply: {
    id: "gardenSuitesSupply",
    path: "/resources/garden-suites-family-suitable-rental-supply",
    title: "Garden Suites and Family-Suitable Rental Supply",
    description:
      "How garden suites can add family-suitable rental supply when financing, design, and property constraints line up.",
    headline: "Garden suites can add real rental homes, not just backyard experiments.",
    deck: "The opportunity is strongest when the property, financing, budget, rental intent, and long-term livability all line up.",
    audienceCta: "Check If My Property Is Financeable",
    audienceHref: "/start/garden-suite",
    brandKit: corePages.gardenSuite.brandKit,
    points: [
      { title: "Equity sets the runway", copy: "Existing mortgage balance and available equity shape what the project can responsibly carry." },
      { title: "Design affects financeability", copy: "A stronger rental layout can change valuation, rent assumptions, and lender confidence." },
      { title: "Permits shape timing", copy: "A finance plan should respect municipal sequence instead of assuming shovel-ready certainty." },
      { title: "Livability matters", copy: "Affordable rental supply is stronger when homes are durable, comfortable, and useful for real households." },
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
      { title: "Pillars drive the conversation", copy: "Affordability, accessibility, and energy efficiency commitments shape the readiness review." },
      { title: "Documentation is not optional", copy: "Plans, rent assumptions, budgets, energy strategy, and ownership details need to be coherent." },
      { title: "No guarantee language", copy: "External approval, pricing, qualification, and timing cannot be promised by Fairlend." },
      { title: "Financing still has to work", copy: "Even a promising MLI Select path needs interim capital, construction budget discipline, and risk review." },
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
      { title: "Rigid draws create pressure", copy: "A three-draw structure can force builders to carry too much cost between reimbursements." },
      { title: "Evidence earns release", copy: "Work completion, documents, site review, and approval should govern reimbursement." },
      { title: "Interest is a timing problem", copy: "Funds released too early or too late can both create economic drag." },
      { title: "Planning beats rescue", copy: "Draw needs should be mapped before trade sequence and supplier terms create a crisis." },
    ],
  },
  privateCapital: {
    id: "privateCapital",
    path: "/resources/private-capital-affordable-housing",
    title: "Private Capital and Affordable Housing",
    description:
      "Where aligned private capital can help affordable rental housing and where it cannot replace policy.",
    headline: "Private capital can help affordable housing when incentives are honest.",
    deck: "Capital is not policy. But properly structured credit can bridge viable housing projects through timing, complexity, and construction risk.",
    audienceCta: "Read Fairlend's Housing Thesis",
    audienceHref: "/affordable-sustainable-rental-housing",
    brandKit: corePages.housingThesis.brandKit,
    points: [
      { title: "Capital cannot solve everything", copy: "Zoning, approvals, infrastructure, and affordability policy remain public problems." },
      { title: "Timing can be financed", copy: "Private credit can bridge stages where public or conventional options move too slowly." },
      { title: "Alignment matters", copy: "Borrower, community, and investor interests have to be structured with discipline." },
      { title: "Housing outcomes count", copy: "The test is not volume alone. It is livable, durable rental supply that people can use." },
    ],
  },
  sustainableReturns: {
    id: "sustainableReturns",
    path: "/resources/sustainable-rental-housing-investor-returns",
    title: "Sustainable Rental Housing and Investor Returns",
    description:
      "How housing-backed private credit can connect investor discipline with sustainable rental housing outcomes.",
    headline: "Sustainable housing and investor discipline should reinforce each other.",
    deck: "The investment thesis is strongest when the asset, borrower, project controls, and housing need are all legible.",
    audienceCta: "Request Investor Information",
    audienceHref: "/start/investor",
    brandKit: corePages.investors.brandKit,
    points: [
      { title: "Asset quality matters", copy: "Durable rental homes can support stronger collateral stories than speculative narratives." },
      { title: "Risk comes first", copy: "Yield without underwriting is marketing, not an investment discipline." },
      { title: "Project controls matter", copy: "Draw governance, documentation, and borrower review protect capital during construction." },
      { title: "Suitability still applies", copy: "Investor participation needs eligibility, disclosure, and qualified review." },
    ],
  },
  multiplexVsSuite: {
    id: "multiplexVsSuite",
    path: "/resources/multiplex-vs-garden-suite-vs-laneway-suite",
    title: "Multiplex vs Garden Suite vs Laneway Suite",
    description:
      "Compare multiplex, garden suite, and laneway suite financing considerations for GTA rental housing projects.",
    headline: "Multiplex, garden suite, and laneway suite financing are not the same review.",
    deck: "Each path has a different property profile, permit sequence, budget shape, rental story, and capital stack.",
    audienceCta: "Choose Your Path",
    audienceHref: "/start",
    brandKit: corePages.contact.brandKit,
    points: [
      { title: "Multiplex", copy: "Unit count, conversion scope, zoning, valuation, rental income, and construction sequencing dominate review." },
      { title: "Garden suite", copy: "Existing equity, lot fit, design status, rental intent, and household risk are central." },
      { title: "Laneway suite", copy: "Access, servicing, design constraints, and local permit context can change feasibility." },
      { title: "Mixed projects", copy: "A main-building scope plus a suite needs one financing story, not two disconnected assumptions." },
    ],
  },
};

const navItems = [
  { label: "Multiplex", href: "/multiplex-financing-gta" },
  { label: "Garden suites", href: "/garden-suite-financing-gta" },
  { label: "MLI Select", href: "/cmhc-mli-select-multiplex-financing" },
  { label: "Investors", href: "/investors" },
  { label: "Resources", href: "/resources" },
];

const iconSequence = [
  Home,
  Building2,
  Landmark,
  Leaf,
  ShieldCheck,
  ClipboardCheck,
  UsersRound,
  Newspaper,
];

export function getCorePageHead(pageId: CorePageId) {
  const page = corePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [
      { rel: "preload", as: "image", href: page.brandKit },
      { rel: "preload", as: "image", href: authorityAsset },
    ],
  };
}

export function getIntakePageHead(pageId: IntakePageId) {
  const page = intakePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [{ rel: "preload", as: "image", href: page.brandKit }],
  };
}

export function getArticlePageHead(pageId: ArticlePageId) {
  const page = articlePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [{ rel: "preload", as: "image", href: page.brandKit }],
  };
}

export function FairlendPublicPage({ pageId }: { pageId: CorePageId }): ReactElement {
  const page = corePages[pageId];
  const rootRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useFairlendPageMotion(rootRef);
  useFairlendMotion(rootRef, pinRef, trackRef);

  return (
    <main
      className={`flp-shell flp-theme-${page.theme}`}
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <section className="flp-hero" aria-labelledby={`${page.id}-title`}>
        <div className="flp-hero-copy">
          <p className="flp-kicker" data-flp-hero-reveal>{page.kicker}</p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>{page.headline}</h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <div className="flp-actions" data-flp-hero-reveal>
            <Button className="flp-primary-button" render={<a href={page.primaryHref} />} size="xl">
              {page.primaryCta}
              <ArrowRight aria-hidden="true" />
            </Button>
            {page.secondaryCta ? (
              <Button className="flp-secondary-button" render={<a href={page.secondaryHref} />} size="xl" variant="outline">
                {page.secondaryCta}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flp-hero-art" aria-label={`${page.kicker} brand kit visual`} data-flp-hero-art>
          <img alt="" decoding="async" fetchPriority="high" src={page.brandKit} />
          <div className="flp-hero-plate">
            <span>Fairlend review path</span>
            <strong>{page.process[0]}</strong>
          </div>
        </div>
      </section>

      <section className="flp-context" aria-labelledby={`${page.id}-context`} data-flp-reveal>
        <div>
          <p className="flp-kicker">Context</p>
          <h2 id={`${page.id}-context`}>{page.audience}</h2>
        </div>
        <p>{page.belief}</p>
      </section>

      {page.caution ? (
        <section className="flp-caution" aria-label="Important qualification note" data-flp-reveal>
          <ShieldCheck aria-hidden="true" />
          <p>{page.caution}</p>
        </section>
      ) : null}

      <section className="flp-bento" aria-labelledby={`${page.id}-interest`}>
        <div className="flp-section-head">
          <p className="flp-kicker">What this page resolves</p>
          <h2 id={`${page.id}-interest`}>The questions a serious review has to answer.</h2>
        </div>
        <div className="flp-bento-grid">
          {page.cards.map((card, index) => {
            const Icon = iconSequence[index % iconSequence.length];
            return (
              <Card
                className={`flp-info-card flp-info-card-${index + 1}`}
                data-flp-reveal
                key={card.title}
                render={card.href ? <a href={card.href} /> : undefined}
                style={{ "--flp-stagger": `${index * 0.06}s` } as CSSProperties}
              >
                <div className="flp-card-image" aria-hidden="true" />
                <div className="flp-card-body">
                  <Icon aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.copy}</p>
                </div>
                {card.href ? <ArrowRight aria-hidden="true" className="flp-card-arrow" /> : null}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flp-scroll-story" aria-labelledby={`${page.id}-desire`} data-flp-reveal>
        <div className="flp-scroll-pin" ref={pinRef}>
          <p className="flp-kicker">Decision path</p>
          <h2 id={`${page.id}-desire`}>A cleaner path from interest to underwriting.</h2>
          <p>
            Each page is built to move the right visitor from research into a useful
            review, without overpromising outcomes or hiding what Fairlend needs to know.
          </p>
        </div>
        <div className="flp-step-track" ref={trackRef}>
          {page.process.map((step, index) => (
            <Card className="flp-step-card" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              <p>{page.proof[index % page.proof.length]}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flp-authority" aria-labelledby={`${page.id}-authority`} data-flp-reveal>
        <div>
          <p className="flp-kicker">Authority layer</p>
          <h2 id={`${page.id}-authority`}>
            Real estate finance, construction sequence, and housing policy belong in the same conversation.
          </h2>
          <p>
            Fairlend's public site now gives media, borrowers, builders, investors,
            and referral partners enough substance to understand the thesis and take
            the next step.
          </p>
        </div>
        <img
          alt="Fairlend review materials layered over GTA missing-middle housing blueprints"
          decoding="async"
          loading="lazy"
          src={authorityAsset}
        />
      </section>

      <FairlendFooter primaryCta={page.primaryCta} primaryHref={page.primaryHref} />
    </main>
  );
}

export function FairlendIntakePage({ pageId }: { pageId: IntakePageId }): ReactElement {
  const page = intakePages[pageId];
  const rootRef = useRef<HTMLElement>(null);

  useFairlendPageMotion(rootRef);

  return (
    <main
      className="flp-shell flp-theme-paper flp-intake-shell"
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <section className="flp-intake-hero" aria-labelledby={`${page.id}-title`}>
        <div>
          <p className="flp-kicker" data-flp-hero-reveal>Fairlend intake</p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>{page.headline}</h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <Button className="flp-secondary-button" data-flp-hero-reveal render={<a href={page.parentHref} />} variant="outline">
            Review context first
          </Button>
        </div>
        <img alt="" data-flp-hero-art decoding="async" fetchPriority="high" src={page.brandKit} />
      </section>

      {page.routes ? (
        <section className="flp-route-grid" aria-label="Choose your Fairlend path">
          {page.routes.map((route, index) => (
            <Card
              className="flp-route-card"
              data-flp-reveal
              key={route.title}
              render={<a href={route.href} />}
              style={{ "--flp-stagger": `${index * 0.05}s` } as CSSProperties}
            >
              <h2>{route.title}</h2>
              <p>{route.copy}</p>
              <ArrowRight aria-hidden="true" />
            </Card>
          ))}
        </section>
      ) : (
        <section className="flp-intake-form-section" aria-labelledby={`${page.id}-form`} data-flp-reveal>
          <div className="flp-section-head">
            <p className="flp-kicker">First review</p>
            <h2 id={`${page.id}-form`}>Share the essentials. Fairlend will ask for more only when it matters.</h2>
          </div>
          {page.compliance ? (
            <div className="flp-caution flp-intake-caution">
              <ShieldCheck aria-hidden="true" />
              <p>{page.compliance}</p>
            </div>
          ) : null}
          <form className="flp-intake-form">
            {page.fields.map((field, index) => (
              <label
                className={field.type === "textarea" ? "flp-field flp-field-wide" : "flp-field"}
                data-flp-reveal
                key={field.label}
                style={{ "--flp-stagger": `${index * 0.025}s` } as CSSProperties}
              >
                <span>
                  {field.label}
                  {field.required ? <i aria-hidden="true">*</i> : null}
                </span>
                <FieldControl field={field} />
              </label>
            ))}
            <Button className="flp-primary-button flp-form-submit" type="button">
              Submit for Fairlend review
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </section>
      )}

      <FairlendFooter primaryCta="Back to contact" primaryHref="/contact" />
    </main>
  );
}

export function FairlendArticlePage({ pageId }: { pageId: ArticlePageId }): ReactElement {
  const page = articlePages[pageId];
  const rootRef = useRef<HTMLElement>(null);

  useFairlendPageMotion(rootRef);

  return (
    <main
      className="flp-shell flp-theme-paper flp-article-shell"
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <article className="flp-article" aria-labelledby={`${page.id}-title`}>
        <header className="flp-article-header">
          <p className="flp-kicker" data-flp-hero-reveal>Fairlend resource</p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>{page.headline}</h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <Button className="flp-primary-button" data-flp-hero-reveal render={<a href={page.audienceHref} />} size="xl">
            {page.audienceCta}
            <ArrowRight aria-hidden="true" />
          </Button>
        </header>
        <img alt="" className="flp-article-image" data-flp-hero-art decoding="async" fetchPriority="high" src={page.brandKit} />
        <section className="flp-article-points" aria-label="Resource takeaways">
          {page.points.map((point, index) => (
            <Card
              className="flp-step-card"
              data-flp-reveal
              key={point.title}
              style={{ "--flp-stagger": `${index * 0.05}s` } as CSSProperties}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{point.title}</strong>
              <p>{point.copy}</p>
            </Card>
          ))}
        </section>
      </article>
      <FairlendFooter primaryCta={page.audienceCta} primaryHref={page.audienceHref} />
    </main>
  );
}

function FieldControl({ field }: { field: IntakeField }): ReactElement {
  if (field.type === "textarea") {
    return <Textarea aria-label={field.label} name={field.label} />;
  }

  if (field.type === "select") {
    return (
      <select aria-label={field.label} name={field.label}>
        <option value="">Select one</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <span className="flp-checkbox-line">
        <input aria-label={field.label} name={field.label} type="checkbox" />
        <span>I acknowledge this request is informational and subject to review.</span>
      </span>
    );
  }

  return <Input aria-label={field.label} name={field.label} nativeInput type={field.type ?? "text"} />;
}

function FairlendNav(): ReactElement {
  return (
    <header className="flp-nav">
      <a className="flp-brand" href="/" aria-label="Fairlend home">
        <span>Fairlend</span>
        <small>Capital</small>
      </a>
      <nav aria-label="Fairlend public navigation">
        {navItems.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <Button className="flp-nav-button" render={<a href="/start" />}>
        Start review
      </Button>
    </header>
  );
}

function FairlendFooter({
  primaryCta,
  primaryHref,
}: {
  primaryCta: string;
  primaryHref: string;
}): ReactElement {
  return (
    <footer className="flp-footer">
      <div>
        <p className="flp-kicker">Fairlend Capital</p>
        <h2>Move the right housing project into the right capital conversation.</h2>
      </div>
      <div className="flp-footer-links">
        <a href="/about">About</a>
        <a href="/press">Press</a>
        <a href="/resources">Resources</a>
        <a href="/contact">Contact</a>
      </div>
      <Button className="flp-primary-button" render={<a href={primaryHref} />} size="xl">
        {primaryCta}
        <ArrowRight aria-hidden="true" />
      </Button>
      <p className="flp-footer-note">
        Fairlend pages are informational and do not guarantee financing, CMHC
        qualification, investment suitability, or approval.
      </p>
    </footer>
  );
}

function useFairlendPageMotion(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setScrollState = () => {
      root.classList.toggle("flp-scrolled", window.scrollY > 24);
    };

    setScrollState();
    window.addEventListener("scroll", setScrollState, { passive: true });

    if (media.matches) {
      root.classList.add("flp-motion-reduced");
      return () => window.removeEventListener("scroll", setScrollState);
    }

    root.classList.add("flp-motion-ready");
    let active = true;
    let cleanup = () => {};

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (!active) {
          return;
        }

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
          gsap.to("[data-flp-hero-reveal]", {
            autoAlpha: 1,
            duration: 0.78,
            ease: "expo.out",
            stagger: 0.09,
            y: 0,
          });

          gsap.to("[data-flp-hero-art]", {
            autoAlpha: 1,
            duration: 0.9,
            ease: "expo.out",
            scale: 1,
            y: 0,
          });

          gsap.utils.toArray<HTMLElement>("[data-flp-reveal]").forEach((item) => {
            gsap.to(item, {
              autoAlpha: 1,
              duration: 0.72,
              ease: "power4.out",
              scrollTrigger: {
                once: true,
                start: "top 88%",
                trigger: item,
              },
              y: 0,
              delay: Number.parseFloat(item.style.getPropertyValue("--flp-stagger")) || 0,
            });
          });
        }, root);

        cleanup = () => ctx.revert();
      },
    );

    return () => {
      active = false;
      cleanup();
      window.removeEventListener("scroll", setScrollState);
    };
  }, [rootRef]);
}

function useFairlendMotion(
  rootRef: React.RefObject<HTMLElement | null>,
  pinRef: React.RefObject<HTMLDivElement | null>,
  trackRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let active = true;
    let cleanup = () => {};

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (!active) {
          return;
        }

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
          gsap.fromTo(
            ".flp-hero-art img, .flp-authority img",
            { opacity: 0.72, scale: 0.88 },
            {
              opacity: 1,
              scale: 1,
              ease: "power4.out",
              scrollTrigger: {
                end: "bottom top",
                scrub: true,
                start: "top 82%",
                trigger: ".flp-hero-art",
              },
            },
          );

          if (pinRef.current && trackRef.current) {
            ScrollTrigger.create({
              end: "bottom bottom",
              pin: pinRef.current,
              pinSpacing: false,
              start: "top 96px",
              trigger: trackRef.current,
            });
          }

          gsap.utils.toArray<HTMLElement>(".flp-step-card").forEach((card, index) => {
            gsap.fromTo(
              card,
              { opacity: 0.32, scale: 0.9, y: 36 },
              {
                opacity: 1,
                scale: 1,
                y: 0,
                ease: "power4.out",
                scrollTrigger: {
                  end: "top 42%",
                  scrub: true,
                  start: "top 92%",
                  trigger: card,
                },
                delay: index * 0.02,
              },
            );
          });
        }, rootRef);

        cleanup = () => ctx.revert();
      },
    );

    return () => {
      active = false;
      cleanup();
    };
  }, [pinRef, rootRef, trackRef]);
}
