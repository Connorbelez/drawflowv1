export type IdentityInvitationPersona =
  | "brokerage"
  | "builder"
  | "contractor"
  | "lender";

interface IdentityInvitationTemplate {
  cta: string;
  paragraphs: readonly string[];
  preheader: string;
  subject: string;
  title: string;
}

const WORKOS_INVITATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const IDENTITY_INVITATION_TEMPLATES: Record<
  IdentityInvitationPersona,
  IdentityInvitationTemplate
> = {
  brokerage: {
    cta: "Set up your DrawFlow access",
    paragraphs: [
      "You have been invited to join the DrawFlow team.",
      "Use the secure link below to accept the invitation and finish setting up your account.",
    ],
    preheader: "Set up your DrawFlow team access.",
    subject: "Your DrawFlow team invitation",
    title: "You are invited to DrawFlow",
  },
  builder: {
    cta: "Start builder onboarding",
    paragraphs: [
      "You have been invited to join DrawFlow as a builder.",
      "Accept the invitation to set up your builder workspace and start managing your construction work in one place.",
    ],
    preheader: "Set up your DrawFlow builder workspace.",
    subject: "Your DrawFlow builder invitation",
    title: "Your builder workspace is ready",
  },
  contractor: {
    cta: "Start contractor onboarding",
    paragraphs: [
      "You have been invited to join DrawFlow as a contractor.",
      "Accept the invitation to confirm your contractor profile and complete your onboarding before entering the workspace.",
    ],
    preheader: "Complete your DrawFlow contractor onboarding.",
    subject: "Your DrawFlow contractor invitation",
    title: "Your contractor onboarding is ready",
  },
  lender: {
    cta: "Start lender onboarding",
    paragraphs: [
      "You have been invited to join DrawFlow as a lender.",
      "Accept the invitation to set up your lender access and review the construction draw work assigned to your team.",
    ],
    preheader: "Set up your DrawFlow lender access.",
    subject: "Your DrawFlow lender invitation",
    title: "Your lender access is ready",
  },
};

export function identityInvitationPersonaForRole(
  roleSlug: string
): IdentityInvitationPersona {
  switch (roleSlug.trim().toLowerCase().replace(/_/g, "-")) {
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
    case "admin":
    case "broker":
    case "broker-staff":
    case "principle-broker":
    case "principal-broker":
      return "brokerage";
    default:
      throw new Error(`Unsupported invitation role: ${roleSlug}`);
  }
}

export function identityInvitationTemplateKey(
  persona: IdentityInvitationPersona
) {
  return `identity_invitation_${persona}_v1`;
}

export function identityInvitationPayload(
  workosInvitationId: string,
  roleSlug: string
) {
  const invitationId = workosInvitationId.trim();
  const role = roleSlug.trim();
  if (!(invitationId && role)) {
    throw new Error("WorkOS invitation identity is required.");
  }
  return JSON.stringify({ roleSlug: role, workosInvitationId: invitationId });
}

export function identityInvitationLandingUrl(workosInvitationId: string) {
  const invitationId = workosInvitationId.trim();
  if (!(invitationId && WORKOS_INVITATION_ID_PATTERN.test(invitationId))) {
    throw new Error("WorkOS invitation ID is invalid.");
  }
  const configuredOrigin = (process.env.DRAWFLOW_APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  if (!configuredOrigin) {
    throw new Error("DRAWFLOW_APP_ORIGINS is not configured.");
  }
  const origin = new URL(configuredOrigin);
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "localhost" &&
    origin.hostname !== "127.0.0.1"
  ) {
    throw new Error("DrawFlow application origin must use HTTPS.");
  }
  return new URL(
    `/invitations/${encodeURIComponent(invitationId)}`,
    origin
  ).toString();
}

export function renderIdentityInvitationEmail(input: {
  invitationUrl: string;
  recipientName?: string;
  roleSlug: string;
}) {
  const persona = identityInvitationPersonaForRole(input.roleSlug);
  const template = IDENTITY_INVITATION_TEMPLATES[persona];
  const recipientName = input.recipientName?.trim();
  const greeting = recipientName ? `Hi ${recipientName},` : "Hello,";
  const text = [
    template.preheader,
    greeting,
    ...template.paragraphs,
    `${template.cta}: ${input.invitationUrl}`,
    "If you did not expect this invitation, you can safely ignore this email.",
  ].join("\n\n");
  const html = [
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(template.preheader)}</span>`,
    `<p>${escapeHtml(greeting)}</p>`,
    `<h1>${escapeHtml(template.title)}</h1>`,
    ...template.paragraphs.map(
      (paragraph) => `<p>${escapeHtml(paragraph)}</p>`
    ),
    `<p><a href="${escapeHtml(input.invitationUrl)}">${escapeHtml(template.cta)}</a></p>`,
    `<p>${escapeHtml("If you did not expect this invitation, you can safely ignore this email.")}</p>`,
  ].join("");
  return {
    html,
    subject: template.subject,
    text,
  };
}

export function identityInvitationSubject(roleSlug: string) {
  return IDENTITY_INVITATION_TEMPLATES[
    identityInvitationPersonaForRole(roleSlug)
  ].subject;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}
