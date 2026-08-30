import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { WorkOS } from "@workos-inc/node";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import {
  INVITATION_EXPERIENCES,
  type InvitationPersona,
  resolveInvitationPersona,
} from "#/features/onboarding/invitation-config.ts";

type InvitationLookup =
  | {
      expiresAt?: string;
      persona: InvitationPersona;
      status: "ready";
      url: string;
    }
  | {
      persona?: InvitationPersona;
      status: "inactive" | "not_found" | "unavailable";
    };

const WORKOS_INVITATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const loadInvitation = createServerFn({ method: "GET" })
  .validator((input: { invitationId: string }) => {
    const invitationId = input.invitationId.trim();
    if (!WORKOS_INVITATION_ID_PATTERN.test(invitationId)) {
      throw new Error("Invalid invitation.");
    }
    return { invitationId };
  })
  .handler(async ({ data }): Promise<InvitationLookup> => {
    const apiKey = process.env.WORKOS_API_KEY?.trim();
    if (!apiKey) {
      return { status: "unavailable" };
    }

    try {
      const invitation = await new WorkOS(apiKey).userManagement.getInvitation(
        data.invitationId
      );
      const persona = resolveInvitationPersona(invitation.roleSlug);
      if (invitation.state !== "pending") {
        return { persona, status: "inactive" };
      }
      const url = new URL(invitation.acceptInvitationUrl);
      if (url.protocol !== "https:") {
        throw new Error("Invalid invitation URL.");
      }
      return {
        expiresAt: invitation.expiresAt,
        persona,
        status: "ready",
        url: url.toString(),
      };
    } catch {
      return { status: "not_found" };
    }
  });

export const Route = createFileRoute("/invitations/$invitationId")({
  loader: ({ params }) =>
    loadInvitation({ data: { invitationId: params.invitationId } }),
  component: InvitationLanding,
});

function InvitationLanding() {
  const invitation = Route.useLoaderData();
  const experience = INVITATION_EXPERIENCES[invitation.persona ?? "brokerage"];

  if (invitation.status !== "ready") {
    return (
      <InvitationPage>
        <FrameTitle>{statusTitle(invitation.status)}</FrameTitle>
        <FrameDescription className="text-pretty">
          {statusDescription(invitation.status)}
        </FrameDescription>
        <p className="text-pretty text-muted-foreground text-sm">
          Ask the person who invited you to send a new invitation if you still
          need access.
        </p>
      </InvitationPage>
    );
  }

  return (
    <InvitationPage>
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {experience.eyebrow}
      </p>
      <FrameTitle className="mt-3 text-balance text-2xl">
        {experience.title}
      </FrameTitle>
      <FrameDescription className="text-pretty">
        {experience.description}
      </FrameDescription>
      <ol className="grid gap-3 text-sm">
        {experience.steps.map((step, index) => (
          <li className="flex gap-3" key={step}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <Button
        className="min-h-11 w-full sm:w-fit"
        render={<a href={invitation.url}>{experience.cta}</a>}
      >
        {experience.cta}
      </Button>
      <p className="text-muted-foreground text-xs">
        This secure invitation is powered by WorkOS. Do not forward this link.
      </p>
    </InvitationPage>
  );
}

function InvitationPage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/20 px-4 py-10">
      <Frame className="w-full max-w-xl">
        <FramePanel className="grid gap-5 p-6 sm:p-8">{children}</FramePanel>
      </Frame>
    </main>
  );
}

function statusTitle(status: Exclude<InvitationLookup["status"], "ready">) {
  switch (status) {
    case "inactive":
      return "This invitation is no longer active";
    case "not_found":
      return "Invitation not found";
    case "unavailable":
      return "Invitation service unavailable";
  }
}

function statusDescription(
  status: Exclude<InvitationLookup["status"], "ready">
) {
  switch (status) {
    case "inactive":
      return "This invitation may have been accepted, revoked, or expired.";
    case "not_found":
      return "We could not verify this invitation. Check that the link is complete.";
    case "unavailable":
      return "DrawFlow could not verify this invitation right now. Try again shortly.";
  }
}
