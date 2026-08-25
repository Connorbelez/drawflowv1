export type ContractorQuotesPrototypeMode = "my" | "public";

export type QuoteStatus =
  | "draft"
  | "submitted"
  | "stale"
  | "offer"
  | "closed"
  | "public";

export interface QuoteInput {
  basis: string;
  label: string;
  quantity: string;
  total: string;
}

export interface QuotePricing {
  labour: QuoteInput[];
  materials: QuoteInput[];
}

export interface QuoteRow {
  id: string;
  name: string;
  scopePreview: string;
  materialsPreview: string;
  status: QuoteStatus;
  deadline: string;
  deadlineLabel: string;
  amount?: string;
  location?: string;
  packageNote?: string;
  offerExpires?: string;
  pricing?: QuotePricing;
  staleReason?: string;
}

export interface QuoteRequest {
  id: string;
  title: string;
  deadline: string;
  rows: QuoteRow[];
}

export interface BuildGroup {
  id: string;
  name: string;
  city: string;
  address: string;
  permit?: string;
  plannedDateRange?: string;
  quoteRequests: QuoteRequest[];
}

export type PanelState =
  | { kind: "workspace" | "snapshot" | "offer"; quoteId: string }
  | null;
