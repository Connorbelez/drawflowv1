import type { LucideIcon } from "lucide-react";
import { BriefcaseBusiness, HardHat, Wrench } from "lucide-react";

export type AccessPersonaId = "builder" | "lender" | "contractor";

export interface AccessPersona {
  description: string;
  destination: "/backoffice" | "/builder" | "/contractor" | "/lender";
  detail: string;
  icon: LucideIcon;
  id: AccessPersonaId;
  label: string;
  routeLabel: string;
}

export const ACCESS_PERSONAS: readonly AccessPersona[] = [
  {
    description: "Build Proposal and workspace",
    destination: "/builder",
    detail:
      "Create a Build Proposal, compare feasible draw plans, and submit completion evidence.",
    icon: HardHat,
    id: "builder",
    label: "Builder or developer",
    routeLabel: "Builder workspace",
  },
  {
    description: "Operations and approvals",
    destination: "/lender",
    detail:
      "Review evidence, coordinate site visits, and route final milestone and draw-release decisions to lender admins.",
    icon: BriefcaseBusiness,
    id: "lender",
    label: "Lender team",
    routeLabel: "Lender workspace",
  },
  {
    description: "Assigned work and evidence",
    destination: "/contractor",
    detail:
      "Complete onboarding, review assigned work, and submit field evidence against milestones.",
    icon: Wrench,
    id: "contractor",
    label: "Contractor",
    routeLabel: "Contractor workspace",
  },
] as const;

export function getAccessPersona(id: AccessPersonaId): AccessPersona {
  return (
    ACCESS_PERSONAS.find((persona) => persona.id === id) ?? ACCESS_PERSONAS[0]
  );
}
