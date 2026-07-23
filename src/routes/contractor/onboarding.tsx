import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "#/lib/fairLendConfig.ts";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FrameDescription, FramePanel, FrameTitle } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/onboarding")({
  beforeLoad: ({ context, location }) => {
    // The onboarding bridge is reachable by member OR contractor roles (PRD
    // §5.2, §11.1). It does NOT require a linked profile — that is the whole
    // point of the bridge.
    if (!context.userId) {
      throw redirect({
        href: `/api/auth/sign-in?returnPathname=${encodeURIComponent(
          location.pathname
        )}`,
      });
    }
  },
  staticData: {
    breadcrumb: { label: "Onboarding", to: "/contractor/onboarding" },
  },
  component: ContractorOnboardingBridge,
});

/**
 * Onboarding + claim bridge (PRD §7.1, §7.3). Handles three states:
 *  1. Self-service applicant drafting/submitting onboarding.
 *  2. Invited contractor confirming or rejecting a profile claim.
 *  3. Contractor role awaiting profile link → resolution guidance.
 */
function ContractorOnboardingBridge() {
  const navigate = useNavigate();
  const workosOrganizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;
  const bridge = useQuery(api.contractorOnboarding.getContractorOnboardingBridge, {
    workosOrganizationId,
  });
  const claim = useQuery(api.contractorOnboarding.getContractorClaimForConfirmation, {
    workosOrganizationId,
  });

  const saveDraft = useMutation(
    api.contractorOnboarding.saveContractorOnboardingDraft
  );
  const submit = useMutation(api.contractorOnboarding.submitContractorOnboarding);
  const confirmClaim = useMutation(
    api.contractorOnboarding.confirmContractorProfileClaim
  );
  const rejectMatch = useMutation(
    api.contractorOnboarding.rejectContractorProfileMatch
  );

  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftTrades, setDraftTrades] = useState("");
  const [saving, setSaving] = useState(false);

  if (bridge === undefined) {
    return (
      <Shell>
        <p className="text-muted-foreground text-sm">Loading onboarding…</p>
      </Shell>
    );
  }

  // Already fully unlocked → bounce to the workspace.
  if (bridge.workspaceUnlocked) {
    void navigate({ to: "/contractor", replace: true });
    return null;
  }

  // Invited claim awaiting confirmation takes priority (PRD §7.3).
  if (claim?.claim) {
    return (
      <Shell>
        <FrameTitle className="text-xl">Confirm your contractor profile</FrameTitle>
        <FrameDescription>
          You were invited to claim the contractor profile below. Confirm it is
          yours to unlock your workspace, or reject if it is not you.
        </FrameDescription>
        {claim.contractor ? (
          <div className="border-input rounded-md border p-4">
            <p className="font-medium">{claim.contractor.name}</p>
            {claim.contractor.email ? (
              <p className="text-muted-foreground text-sm">
                {claim.contractor.email}
              </p>
            ) : null}
            <p className="mt-1 text-muted-foreground text-xs">
              Trades: {claim.contractor.trades.join(", ") || "—"}
            </p>
          </div>
        ) : null}
        <div className="flex gap-3">
          <Button
            onClick={async () => {
              await confirmClaim({ workosOrganizationId });
              void navigate({ to: "/contractor", replace: true });
            }}
            type="button"
          >
            Confirm this is my profile
          </Button>
          <Button
            onClick={() => rejectMatch({ workosOrganizationId })}
            type="button"
            variant="outline"
          >
            This is not me
          </Button>
        </div>
      </Shell>
    );
  }

  const status = bridge.onboardingReview?.status;

  return (
    <Shell>
      <FrameTitle className="text-xl">Contractor onboarding</FrameTitle>
      <FrameDescription>
        Complete your contractor profile to request access. FairLend will review
        your details before unlocking the full workspace.
      </FrameDescription>

      {status ? <OnboardingStatusBadge status={status} /> : null}

      {status === "approved_pending_workos" || status === "active" ? (
        <Frame>
          <FramePanel className="p-4">
            <p className="text-sm">
              Your onboarding is approved. Workspace access unlocks once your
              contractor role syncs with your session.
            </p>
          </FramePanel>
        </Frame>
      ) : status === "rejected" ? (
        <Frame>
          <FramePanel className="p-4">
            <p className="text-sm">
              Your onboarding was not approved.{" "}
              {bridge.onboardingReview?.reviewDecisionNote ?? ""}
            </p>
          </FramePanel>
        </Frame>
      ) : (
        <Frame>
          <FramePanel className="flex flex-col gap-4 p-4 sm:p-5">
          <DraftField
            label="Company / crew name"
            value={draftName}
            onChange={setDraftName}
            placeholder="Northstar Masonry"
          />
          <DraftField
            label="Email"
            value={draftEmail}
            onChange={setDraftEmail}
            placeholder="you@example.com"
          />
          <DraftField
            label="Trades"
            value={draftTrades}
            onChange={setDraftTrades}
            placeholder="masonry, brick, flashing"
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await saveDraft({
                    workosOrganizationId,
                    draftFields: {
                      email: draftEmail,
                      kind: "company",
                      name: draftName,
                      trades: draftTrades
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    },
                  });
                } finally {
                  setSaving(false);
                }
              }}
              type="button"
            >
              Save draft
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await saveDraft({
                    workosOrganizationId,
                    draftFields: {
                      email: draftEmail,
                      kind: "company",
                      name: draftName,
                      trades: draftTrades
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    },
                  });
                  await submit({ workosOrganizationId });
                } finally {
                  setSaving(false);
                }
              }}
              type="button"
            >
              Submit for review
            </Button>
          </div>
          </FramePanel>
        </Frame>
      )}

      <p className="text-muted-foreground text-xs">
        Already approved and synced?{" "}
        <Link to="/contractor" className="underline">
          Go to workspace
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <Frame className="w-full max-w-xl">
        <FramePanel className="flex flex-col gap-4">{children}</FramePanel>
      </Frame>
    </main>
  );
}

function DraftField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </span>
      <input
        className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function OnboardingStatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "approved_pending_workos"
        ? "bg-blue-100 text-blue-700"
        : status === "rejected"
          ? "bg-red-100 text-red-700"
          : status === "changes_requested"
            ? "bg-amber-100 text-amber-700"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
