export type ContractorWorkPrototypeVariant = "A" | "B" | "C";

export function isContractorWorkPrototypeVariant(
  value: unknown
): value is ContractorWorkPrototypeVariant {
  return value === "A" || value === "B" || value === "C";
}

export const variantMeta: Record<
  ContractorWorkPrototypeVariant,
  { description: string; label: string }
> = {
  A: {
    label: "Action Command Center",
    description: "Urgent responses lead, with one selected assignment dossier.",
  },
  B: {
    label: "Build Assignment Docket",
    description: "Each Build keeps its complete assignment and plan record.",
  },
  C: {
    label: "Field Shift",
    description: "Today and the next 14 days form one chronological duty log.",
  },
};

export const prototypeVariants: ContractorWorkPrototypeVariant[] = [
  "A",
  "B",
  "C",
];
