export function pendingBuilderStaffWorkosUserId(email: string) {
  return `pending_builder_staff_${builderStaffIdentitySlug(email)}`;
}

export function pendingBuilderStaffMembershipId(invitationId: string) {
  return `pending_invitation_${builderStaffIdentitySlug(invitationId)}`;
}

export function isPendingBuilderStaffWorkosUserId(value: string) {
  return value.startsWith("pending_builder_staff_");
}

function builderStaffIdentitySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
