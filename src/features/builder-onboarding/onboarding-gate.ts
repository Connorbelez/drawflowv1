/**
 * Pure first-run gating decision for the builder home route. Kept separate from
 * the route component so the branching is unit-testable without React/Convex.
 */

export type BuilderRelationshipStatus =
  | "active"
  | "missing-membership"
  | "missing-builder-profile"
  | "ambiguous-builder-profile"
  | "missing-broker-assignment"
  | "pending"
  | "transferred"
  | "failed";

export interface BuilderOnboardingState {
  complete: boolean;
  dismissed: boolean;
  hasProfile: boolean;
  hasProposals: boolean;
  isBuilder: boolean;
  relationshipStatus?: BuilderRelationshipStatus;
  recovery?: { kind: string };
}

export type BuilderHomeView =
  | "loading"
  | "first-run"
  | "profile-pending"
  | "relationship-pending"
  | "access-recovery"
  | "dashboard";

export interface BuilderHomeGateInput {
  /** Visual-parity fixtures bypass all gating and show the dashboard. */
  fixtureEnabled: boolean;
  /** User clicked "Start my first build" / "explore on my own" this session. */
  forceDashboard: boolean;
  /** Onboarding state, or `undefined` while the query is in flight. */
  state: BuilderOnboardingState | undefined;
}

export function resolveBuilderHomeView({
  fixtureEnabled,
  forceDashboard,
  state,
}: BuilderHomeGateInput): BuilderHomeView {
  if (fixtureEnabled) {
    return "dashboard";
  }
  if (state === undefined) {
    return "loading";
  }
  // Non-builders (admin god-mode, backoffice) are never gated.
  if (!state.isBuilder) {
    return "dashboard";
  }
  if (state.recovery) {
    return "access-recovery";
  }
  if (!state.hasProfile) {
    return "profile-pending";
  }
  if (state.relationshipStatus === undefined) {
    return "loading";
  }
  if (state.relationshipStatus !== "active") {
    return "relationship-pending";
  }
  if (!(forceDashboard || state.complete || state.dismissed)) {
    return "first-run";
  }
  return "dashboard";
}
