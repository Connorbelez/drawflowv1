import { useMutation, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function pushApplicationServerKey(value?: string) {
  if (!value?.trim()) {
    return;
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return Uint8Array.from(window.atob(padded), (character) =>
    character.charCodeAt(0)
  );
}

function pushKeyToBase64Url(value: ArrayBuffer) {
  const encoded = window.btoa(String.fromCharCode(...new Uint8Array(value)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type NotificationChannel = "in_app" | "email" | "push";
type DigestCadence = "daily" | "weekly" | "never";

async function createBrowserPushSubscription() {
  if (!("Notification" in window && "serviceWorker" in navigator)) {
    throw new Error("Push notifications are not supported by this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Push notification permission was not granted.");
  }
  const registration = await navigator.serviceWorker.register(
    "/build-collaboration-push-sw.js"
  );
  const applicationServerKey = pushApplicationServerKey(
    import.meta.env.VITE_BUILD_COLLABORATION_PUSH_PUBLIC_KEY
  );
  if (!applicationServerKey) {
    throw new Error("Push notifications are not configured.");
  }
  const subscription = await registration.pushManager.subscribe({
    applicationServerKey,
    userVisibleOnly: true,
  });
  const auth = subscription.getKey("auth");
  const p256dh = subscription.getKey("p256dh");
  if (!(auth && p256dh)) {
    await subscription.unsubscribe();
    throw new Error("The browser returned an incomplete push subscription.");
  }
  return {
    auth: pushKeyToBase64Url(auth),
    endpoint: subscription.endpoint,
    p256dh: pushKeyToBase64Url(p256dh),
    subscription,
  };
}

async function unsubscribeBrowserPush() {
  const registration = await navigator.serviceWorker?.getRegistration(
    "/build-collaboration-push-sw.js"
  );
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
}

function useBuildCollaborationNotificationControls(input: {
  activeBuildId: Id<"activeBuilds">;
  organizationId?: string;
}) {
  const preferences = useQuery(
    api.build_collaboration_notifications
      .getMyBuildCollaborationNotificationPreferences,
    input.organizationId
      ? { buildId: input.activeBuildId, organizationId: input.organizationId }
      : "skip"
  );
  const pushSubscription = useQuery(
    api.build_collaboration_delivery_api
      .getMyBuildCollaborationPushSubscription,
    input.organizationId
      ? { buildId: input.activeBuildId, organizationId: input.organizationId }
      : "skip"
  );
  const updatePreferences = useMutation(
    api.build_collaboration_notifications
      .updateMyBuildCollaborationNotificationPreferences
  );
  const registerPush = useMutation(
    api.build_collaboration_delivery_api
      .registerMyBuildCollaborationPushSubscription
  );
  const revokePush = useMutation(
    api.build_collaboration_delivery_api
      .revokeMyBuildCollaborationPushSubscription
  );
  const [saving, setSaving] = useState(false);

  const save = async (patch: {
    channels?: NotificationChannel[];
    digestCadence?: DigestCadence;
    ordinaryMuted?: boolean;
  }) => {
    if (!input.organizationId) {
      return;
    }
    const digestCadence =
      patch.digestCadence ?? preferences?.digestCadence ?? "daily";
    await updatePreferences({
      buildId: input.activeBuildId,
      channels: patch.channels ?? preferences?.channels ?? ["in_app", "email"],
      digestCadence,
      digestEnabled: digestCadence !== "never",
      ordinaryMuted: patch.ordinaryMuted ?? preferences?.ordinaryMuted ?? false,
      organizationId: input.organizationId,
    });
  };

  const updateControl = async (
    patch: Parameters<typeof save>[0],
    successMessage: string
  ) => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await save(patch);
      toast.success(successMessage);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update notification preferences."
      );
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async (organizationId: string) => {
    const browser = await createBrowserPushSubscription();
    let subscriptionId: Id<"buildCollaborationPushSubscriptions"> | undefined;
    try {
      subscriptionId = await registerPush({
        auth: browser.auth,
        buildId: input.activeBuildId,
        endpoint: browser.endpoint,
        organizationId,
        p256dh: browser.p256dh,
      });
      await save({
        channels: Array.from(
          new Set([
            ...(preferences?.channels ?? ["in_app", "email"]),
            "push" as const,
          ])
        ),
      });
    } catch (error) {
      if (subscriptionId) {
        await revokePush({
          buildId: input.activeBuildId,
          organizationId,
          subscriptionId,
        }).catch(() => undefined);
      }
      await browser.subscription.unsubscribe();
      throw error;
    }
  };

  const disablePush = async (organizationId: string) => {
    if (!pushSubscription) {
      return;
    }
    await revokePush({
      buildId: input.activeBuildId,
      organizationId,
      subscriptionId: pushSubscription._id,
    });
    await save({
      channels: (preferences?.channels ?? ["in_app", "email"]).filter(
        (channel) => channel !== "push"
      ),
    });
    await unsubscribeBrowserPush().catch(() => undefined);
  };

  const togglePush = async () => {
    if (!input.organizationId || saving) {
      return;
    }
    setSaving(true);
    try {
      if (pushSubscription) {
        await disablePush(input.organizationId);
        toast.success("Push notifications disabled.");
      } else {
        await enablePush(input.organizationId);
        toast.success("Push notifications enabled.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update push notifications."
      );
    } finally {
      setSaving(false);
    }
  };

  return { preferences, pushSubscription, saving, togglePush, updateControl };
}

export function BuildCollaborationNotificationCard({
  activeBuildId,
  organizationId,
}: {
  activeBuildId: Id<"activeBuilds">;
  organizationId?: string;
}) {
  const controls = useBuildCollaborationNotificationControls({
    activeBuildId,
    organizationId,
  });
  const { preferences, pushSubscription, saving, togglePush, updateControl } =
    controls;
  const channels = preferences?.channels ?? ["in_app", "email"];
  const emailEnabled = channels.includes("email");
  const muted = preferences?.ordinaryMuted ?? false;
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 p-4">
        <span className="text-primary">
          <Bell aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">Notifications</CardTitle>
          <CardDescription className="mt-1 text-xs">
            Choose immediate alerts and digest delivery.
          </CardDescription>
        </div>
        <Badge variant="secondary">{muted ? "Muted" : "On"}</Badge>
      </CardHeader>
      <CardPanel className="space-y-3 border-t p-4">
        <div className="space-y-1.5">
          <label
            className="font-medium text-xs"
            htmlFor="collaboration-digest-cadence"
          >
            Activity digest
          </label>
          <Select
            disabled={saving}
            onValueChange={async (value) => {
              if (
                value === "daily" ||
                value === "weekly" ||
                value === "never"
              ) {
                await updateControl(
                  { digestCadence: value },
                  value === "never"
                    ? "Activity digests disabled."
                    : `${value === "daily" ? "Daily" : "Weekly"} digests enabled.`
                );
              }
            }}
            value={preferences?.digestCadence ?? "daily"}
          >
            <SelectTrigger id="collaboration-digest-cadence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            aria-pressed={emailEnabled}
            disabled={saving || preferences === undefined}
            onClick={async () => {
              await updateControl(
                {
                  channels: emailEnabled
                    ? channels.filter((channel) => channel !== "email")
                    : [...channels, "email"],
                },
                `Email notifications ${emailEnabled ? "disabled" : "enabled"}.`
              );
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Email {emailEnabled ? "on" : "off"}
          </Button>
          <Button
            aria-pressed={Boolean(pushSubscription)}
            disabled={saving || pushSubscription === undefined}
            onClick={togglePush}
            size="sm"
            type="button"
            variant="outline"
          >
            Push {pushSubscription ? "on" : "off"}
          </Button>
        </div>
        <Button
          className="w-full"
          disabled={saving}
          onClick={async () => {
            await updateControl(
              { ordinaryMuted: !muted },
              muted
                ? "Ordinary collaboration notifications enabled."
                : "Ordinary collaboration notifications muted."
            );
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {muted
            ? "Enable ordinary notifications"
            : "Mute ordinary notifications"}
        </Button>
      </CardPanel>
    </Card>
  );
}
