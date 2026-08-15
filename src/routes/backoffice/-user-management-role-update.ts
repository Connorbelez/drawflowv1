import type { MembershipRoleUpdate } from "./-user-management-types";

type MembershipRoleCommandResult = {
  operation: string;
  reason?: string;
  status: string;
  sync?: string;
};

export async function persistMembershipRoleUpdate({
  args,
  syncDirectory,
  updateRoles,
}: {
  args: MembershipRoleUpdate;
  syncDirectory: () => Promise<unknown>;
  updateRoles: (
    args: MembershipRoleUpdate
  ) => Promise<MembershipRoleCommandResult>;
}): Promise<MembershipRoleCommandResult> {
  const result = await updateRoles(args);
  if (result.status !== "accepted") {
    throw new Error(
      result.reason === "principal-broker-transfer-required"
        ? "Principal Broker changes require the transfer workflow."
        : "The role update was not accepted by WorkOS."
    );
  }

  // WorkOS owns membership roles. Refresh its canonical projection before the
  // UI reports success so every downstream query sees the accepted role set.
  await syncDirectory();
  return result;
}
