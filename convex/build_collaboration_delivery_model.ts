import type { BuildCollaborationNotificationKind } from "./build_collaboration_notifications";

const OPTIONAL_KINDS = new Set<BuildCollaborationNotificationKind>([
  "ordinary_activity",
  "followed_reply",
  "acknowledgement_received",
]);

export type BuildCollaborationExternalChannel = "email" | "push";
export type BuildCollaborationDeliveryCadence =
  | "immediate"
  | "daily"
  | "weekly";

export function externalDeliveryPlan(input: {
  channels?: Array<"in_app" | "email" | "push">;
  digestCadence?: "daily" | "weekly" | "never";
  digestEnabled?: boolean;
  kind: BuildCollaborationNotificationKind;
  ordinaryMuted?: boolean;
}) {
  const channels = input.channels ?? ["in_app", "email"];
  const mandatory = !OPTIONAL_KINDS.has(input.kind);
  if (!mandatory && (input.ordinaryMuted ?? false)) {
    return [];
  }
  const selected = channels.filter(
    (channel): channel is BuildCollaborationExternalChannel =>
      channel === "email" || channel === "push"
  );
  if (mandatory) {
    return selected.map((channel) => ({
      cadence: "immediate" as const,
      channel,
    }));
  }
  const cadence = input.digestCadence ?? "daily";
  if (!(input.digestEnabled ?? true) || cadence === "never") {
    return [];
  }
  return selected.map((channel) => ({ cadence, channel }));
}

export function nextBuildCollaborationDigestAt(
  now: number,
  cadence: Exclude<BuildCollaborationDeliveryCadence, "immediate">
) {
  const current = new Date(now);
  if (cadence === "daily") {
    const candidate = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      13
    );
    return candidate > now ? candidate : candidate + 24 * 60 * 60 * 1000;
  }
  const daysUntilMonday = (8 - current.getUTCDay()) % 7;
  let candidate = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + daysUntilMonday,
    13
  );
  if (candidate <= now) {
    candidate += 7 * 24 * 60 * 60 * 1000;
  }
  return candidate;
}

export function nextBuildCollaborationRetryAt(
  now: number,
  attemptNumber: number
) {
  const delay = Math.min(
    6 * 60 * 60 * 1000,
    60_000 * 2 ** Math.max(0, attemptNumber - 1)
  );
  return now + delay;
}
