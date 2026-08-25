import {
  Award,
  ChartNoAxesColumnIncreasing,
  FileSignature,
  Gavel,
  Landmark,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

export const renderAsset = "/assets/CleanShot Jun 8 Hero Section Blueprint.png";
export const blueprintAsset =
  "/assets/Blueprint Style Rendering Jun 8 2026 (1).png";
export const buildFinancingAsset =
  "/assets/fairlend-path-build-financing-multiplex-construction.webp";
export const multiplexAsset =
  "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
export const privateMortgagesAsset =
  "/assets/fairlend-path-private-mortgages.webp";
export const neighborhoodSketchAsset =
  "/assets/fairlend-investor-overview/paths-neighborhood-sketch.webp";
export const leadershipDeskAsset =
  "/assets/fairlend-leadership-elie/images/hero-housing-blueprint-canvas.webp";

export const fairlendLicences = [
  "FairLend Management Inc",
  "Legal business name: FairLend Management Inc",
  "Brokerage Licence #13827",
  "Administrator Licence #13828",
] as const;

export const leadershipCapabilities = [
  {
    copy: "FSRA-licensed mortgage brokerage insight across complex borrowing and investing needs.",
    icon: ShieldCheck,
    title: "Brokerage expertise",
  },
  {
    copy: "End-to-end financing for land, construction, renovation, and long-term stabilization.",
    icon: Landmark,
    title: "Construction finance",
  },
  {
    copy: "Strategic access to insured rental-housing programs, leverage, and flexibility.",
    icon: FileSignature,
    title: "MLI Select planning",
  },
  {
    copy: "Compliant structures that align risk, cash flow, lender appetite, and exit strategy.",
    icon: Gavel,
    title: "Deal structuring",
  },
] as const;

export const leadershipMetrics = [
  {
    copy: "Across mortgage brokerage, private lending, and investment finance.",
    countTo: 25,
    icon: ShieldCheck,
    label: "Years experience",
    prefix: "",
    suffix: "+",
    value: "25+",
  },
  {
    copy: "Residential, commercial, construction, and stabilization capital.",
    countTo: 2,
    icon: Landmark,
    label: "Total financed",
    prefix: "$",
    suffix: "B+",
    value: "$2B+",
  },
  {
    copy: "Relationships across borrowers, lenders, brokers, and investors.",
    countTo: 160,
    icon: Users,
    label: "Lenders & borrowers",
    prefix: "",
    suffix: "+",
    value: "160+",
  },
  {
    copy: "GTA market knowledge with national capital relationships.",
    icon: MapPin,
    label: "Toronto-based",
    value: "GTA",
  },
] as const;

export const leadershipTrustSignals = [
  {
    icon: ShieldCheck,
    label: "Regulated. Trusted. Accountable.",
  },
  {
    icon: Users,
    label: "Client-first approach",
  },
  {
    icon: Award,
    label: "Transparent communication",
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    label: "Results that speak for themselves",
  },
] as const;
