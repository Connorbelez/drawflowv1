export type CorePageId =
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

export type IntakePageId =
  | "start"
  | "startMultiplex"
  | "startGardenSuite"
  | "startBuilder"
  | "startInvestor"
  | "startBroker"
  | "startMedia";

export type ArticlePageId =
  | "financingGap"
  | "gardenSuitesSupply"
  | "mliSelectGuide"
  | "constructionDraws"
  | "privateCapital"
  | "sustainableReturns"
  | "multiplexVsSuite";

export interface PageCard {
  copy: string;
  href?: string;
  title: string;
}

export interface CorePage {
  audience: string;
  belief: string;
  brandKit: string;
  cards: PageCard[];
  caution?: string;
  deck: string;
  description: string;
  headline: string;
  id: CorePageId;
  kicker: string;
  path: string;
  primaryCta: string;
  primaryHref: string;
  process: string[];
  proof: string[];
  secondaryCta?: string;
  secondaryHref?: string;
  theme: "paper" | "civic" | "field" | "blueprint" | "capital";
  title: string;
}

export interface IntakeField {
  label: string;
  options?: string[];
  required?: boolean;
  type?:
    | "text"
    | "email"
    | "tel"
    | "number"
    | "file"
    | "textarea"
    | "select"
    | "checkbox";
}

export interface IntakePage {
  brandKit: string;
  compliance?: string;
  deck: string;
  description: string;
  fields: IntakeField[];
  headline: string;
  id: IntakePageId;
  parentHref: string;
  path: string;
  routes?: PageCard[];
  title: string;
}

export interface ArticlePage {
  audienceCta: string;
  audienceHref: string;
  brandKit: string;
  deck: string;
  description: string;
  headline: string;
  id: ArticlePageId;
  path: string;
  points: PageCard[];
  title: string;
}

