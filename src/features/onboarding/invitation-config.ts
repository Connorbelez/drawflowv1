export type InvitationPersona =
  | "brokerage"
  | "builder"
  | "contractor"
  | "lender";

export interface InvitationExperience {
  cta: string;
  description: string;
  eyebrow: string;
  steps: readonly string[];
  title: string;
}

export const INVITATION_EXPERIENCES: Record<
  InvitationPersona,
  InvitationExperience
> = {
  brokerage: {
    cta: "Accept team invitation",
    description:
      "Your team uses DrawFlow to coordinate construction-finance work, access, and decisions.",
    eyebrow: "DrawFlow team access",
    steps: [
      "Accept the invitation with your work email.",
      "Complete your account setup.",
      "Open the workspace your team assigned to you.",
    ],
    title: "You are joining DrawFlow",
  },
  builder: {
    cta: "Accept builder invitation",
    description:
      "DrawFlow gives builders one place to plan construction work, prepare evidence, and manage draw requests.",
    eyebrow: "Builder onboarding",
    steps: [
      "Accept the invitation with your work email.",
      "Complete your account setup.",
      "Open your builder workspace and review the work assigned to your team.",
    ],
    title: "Set up your builder workspace",
  },
  contractor: {
    cta: "Accept contractor invitation",
    description:
      "Your contractor profile will be connected to DrawFlow so you can collaborate on assigned construction work.",
    eyebrow: "Contractor onboarding",
    steps: [
      "Accept the invitation with your work email.",
      "Confirm the contractor profile that was invited.",
      "Complete onboarding before entering your contractor workspace.",
    ],
    title: "Complete your contractor setup",
  },
  lender: {
    cta: "Accept lender invitation",
    description:
      "DrawFlow helps lender teams review evidence, manage approvals, and govern construction draw releases.",
    eyebrow: "Lender onboarding",
    steps: [
      "Accept the invitation with your work email.",
      "Complete your account setup.",
      "Open the lender workspace and review your team access.",
    ],
    title: "Set up your lender access",
  },
};

export function resolveInvitationPersona(
  roleSlug: string | null | undefined
): InvitationPersona {
  switch (roleSlug?.trim().toLowerCase().replace(/_/g, "-")) {
    case "builder":
    case "builder-staff":
      return "builder";
    case "contractor":
    case "member":
      return "contractor";
    case "lender":
    case "lender-admin":
    case "lender-staff":
      return "lender";
    default:
      return "brokerage";
  }
}
