"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SiteVisitOrderConfirmation } from "../backoffice-build-detail/SiteVisitOrderDialog.tsx";
import { createCanonicalCommandKey } from "./SubmilestoneDetailCanonical.tsx";
import type {
  ReviewCommand,
  SubmilestoneReviewTabProps,
} from "./submilestone-review-tab-contracts.ts";
import { costDocumentsForSubmilestone } from "./submilestone-review-tab-formatters.ts";

export function useSubmilestoneReviewTabWorkflow({
  bootstrap,
  buildId,
  costDocuments = [],
  organizationId,
  readOnly,
}: SubmilestoneReviewTabProps) {
  const review = useQuery(
    api.build_submilestone_review.getActiveBuildSubmilestoneReview,
    {
      buildId,
      milestoneKey: bootstrap.milestone.key,
      submilestoneKey: bootstrap.submilestone.key,
      workosOrganizationId: organizationId,
    }
  );
  const fieldGuidance = useQuery(
    api.submilestone_field_guidance.getSubmilestoneFieldGuidance,
    {
      proposalSubmilestoneId: bootstrap.submilestone.proposalSubmilestoneId,
      workosOrganizationId: organizationId,
    }
  );
  const siteVisits = useQuery(
    api.production_proposals.listBrokerageSiteVisits,
    {
      buildId,
      milestoneKey: bootstrap.milestone.key,
      submilestoneId: bootstrap.submilestone.buildSubmilestoneId,
      workosOrganizationId: organizationId,
    }
  );
  const recommend = useMutation(
    api.build_submilestone_review.recommendActiveBuildSubmilestoneReview
  );
  const requestChanges = useMutation(
    api.build_submilestone_review.requestActiveBuildSubmilestoneChanges
  );
  const waiveSiteVisit = useMutation(
    api.build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit
  );
  const approveChild = useMutation(
    api.build_submilestone_review.approveActiveBuildSubmilestone
  );
  const retractChild = useMutation(
    api.build_submilestone_review.retractActiveBuildSubmilestoneApproval
  );
  const scheduleSiteVisit = useMutation(
    api.production_proposals.scheduleActiveBuildSiteVisit
  );
  const cancelSiteVisit = useMutation(
    api.production_proposals.cancelActiveBuildSiteVisit
  );

  const [busy, setBusy] = useState<ReviewCommand | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [remediationText, setRemediationText] = useState("");
  const [siteVisitRequired, setSiteVisitRequired] = useState(false);
  const [siteVisitOpen, setSiteVisitOpen] = useState(false);
  const visitScopeKey = `${buildId}:${bootstrap.submilestone.buildSubmilestoneId}`;
  const optimisticVisits = useOptimisticallyHiddenVisits(visitScopeKey);

  if (review === undefined) {
    return null;
  }

  const capabilities = bootstrap.capabilities;
  const requirement = review.siteVisit.requirement;
  const currentVisit = review.siteVisit.currentVisit;
  const remediation = remediationText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const inReview = review.child.evidenceReviewState === "in_review";
  const childApproved = review.child.reviewDecisionState === "approved";
  const requiredVisitSatisfied =
    !requirement?.required ||
    requirement.status === "satisfied" ||
    requirement.status === "waived";
  const canRecommend =
    !readOnly && capabilities.review.recommend.allowed && inReview;
  const canRequestChanges =
    !readOnly && capabilities.review.requestChanges.allowed && inReview;
  const canWaive =
    !readOnly &&
    capabilities.canonical.waiveSiteVisit.allowed &&
    inReview &&
    requirement?.required === true &&
    requirement.status === "required";
  const canApprove =
    !readOnly &&
    capabilities.canonical.approveChild.allowed &&
    inReview &&
    requiredVisitSatisfied;
  const canRetract =
    !readOnly &&
    capabilities.canonical.retractChildApproval.allowed &&
    childApproved;
  const canOrderSiteVisit = !readOnly && capabilities.siteVisit.order.allowed;
  const canCancelSiteVisit = !readOnly && capabilities.siteVisit.cancel.allowed;
  const showApproveInterface = !(readOnly || childApproved);
  const approvalBlocker = capabilities.canonical.approveChild.allowed
    ? inReview
      ? requiredVisitSatisfied
        ? undefined
        : "Complete or waive the required Site Visit before approving this Sub-milestone."
      : "Builder evidence must be in review before this Sub-milestone can be approved."
    : (capabilities.canonical.approveChild.reason ??
      "You do not have authority to approve this Sub-milestone.");

  const commandArgs = {
    buildId,
    expectedRevision: review.child.reviewRevision,
    milestoneKey: bootstrap.milestone.key,
    submilestoneKey: bootstrap.submilestone.key,
    workosOrganizationId: organizationId,
  };

  const runCommand = async (
    command: ReviewCommand,
    action: () => Promise<unknown>,
    success: string
  ) => {
    setBusy(command);
    setError(null);
    try {
      await action();
      setNote("");
      setReason("");
      setRemediationText("");
      setSiteVisitRequired(false);
      toast.success(success);
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const recommendReview = async () => {
    if (!note.trim()) {
      setError("Add a reviewer note before recording the recommendation.");
      return;
    }
    await runCommand(
      "recommend",
      () =>
        recommend({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("review-recommendation"),
          note: note.trim(),
          ...(remediation.length ? { remediation } : {}),
          siteVisitRequired,
        }),
      "Review recommendation recorded."
    );
  };

  const requestReviewChanges = async () => {
    if (!reason.trim() || remediation.length === 0) {
      setError(
        "Add a reason and at least one remediation step before requesting changes."
      );
      return;
    }
    await runCommand(
      "request_changes",
      () =>
        requestChanges({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("review-changes"),
          reason: reason.trim(),
          remediation,
        }),
      "Changes requested from the field team."
    );
  };

  const waiveRequiredSiteVisit = async () => {
    if (!reason.trim()) {
      setError("Add the Admin waiver rationale before waiving the Site Visit.");
      return;
    }
    await runCommand(
      "waive",
      () =>
        waiveSiteVisit({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("site-visit-waiver"),
          reason: reason.trim(),
        }),
      "Required Site Visit waived with an audited rationale."
    );
  };

  const approveSubmilestone = async () => {
    await runCommand(
      "approve",
      () =>
        approveChild({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("child-approval"),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      "Sub-milestone approved."
    );
  };

  const retractSubmilestone = async () => {
    if (!reason.trim()) {
      setError("Add a reason before retracting child approval.");
      return;
    }
    await runCommand(
      "retract",
      () =>
        retractChild({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("child-retraction"),
          reason: reason.trim(),
        }),
      "Sub-milestone approval retracted."
    );
  };

  const orderSiteVisit = async (input: SiteVisitOrderConfirmation) => {
    const ordered = await runCommand(
      "site_visit",
      () =>
        scheduleSiteVisit({
          buildId,
          idempotencyKey: createCanonicalCommandKey("site-visit-order"),
          milestoneKey: input.milestoneKey,
          ...(input.note ? { note: input.note } : {}),
          requestedDay: input.requestedDay ?? 0,
          ...(input.requestedTime
            ? { requestedTime: input.requestedTime }
            : {}),
          siteVisitGuidance: input.siteVisitGuidance,
          submilestoneGuidanceSections: input.submilestoneGuidanceSections.map(
            (section) => ({
              ...section,
              buildSubmilestoneId:
                section.buildSubmilestoneId as Id<"buildSubmilestones">,
              proposalSubmilestoneId:
                section.proposalSubmilestoneId as Id<"proposalSubmilestones">,
            })
          ),
          submilestoneKeys: input.submilestoneKeys,
          workosOrganizationId: organizationId,
        }),
      "Site Visit ordered."
    );
    if (ordered) {
      setSiteVisitOpen(false);
    }
  };

  const cancelVisitOptimistically = async (input: {
    buildId: string;
    reason: string;
    visitId: string;
  }) => {
    optimisticVisits.hide(input.visitId);
    try {
      await cancelSiteVisit({
        buildId,
        reason: input.reason,
        visitId: input.visitId,
        workosOrganizationId: organizationId,
      });
    } catch (cause) {
      optimisticVisits.restore(input.visitId);
      throw cause;
    }
  };

  const visibleSiteVisits = siteVisits
    ? {
        ...siteVisits,
        visits: siteVisits.visits.filter(
          (visit) =>
            visit.operationalStatus !== "cancelled" &&
            !optimisticVisits.hiddenIds.has(visit.visitId)
        ),
      }
    : undefined;
  const scopedCostDocuments = costDocumentsForSubmilestone(
    costDocuments,
    bootstrap.submilestone.buildSubmilestoneId
  );

  const showCommands =
    canRecommend ||
    canRequestChanges ||
    canWaive ||
    showApproveInterface ||
    canRetract;

  return {
    approvalBlocker,
    approveSubmilestone,
    busy,
    canApprove,
    canCancelSiteVisit,
    canOrderSiteVisit,
    canRecommend,
    canRequestChanges,
    canRetract,
    canWaive,
    cancelVisitOptimistically,
    currentVisit,
    error,
    fieldGuidance,
    note,
    orderSiteVisit,
    reason,
    recommendReview,
    requestReviewChanges,
    remediationText,
    requirement,
    retractSubmilestone,
    review,
    scopedCostDocuments,
    setNote,
    setReason,
    setRemediationText,
    setSiteVisitOpen,
    setSiteVisitRequired,
    showApproveInterface,
    showCommands,
    siteVisitOpen,
    siteVisitRequired,
    visibleSiteVisits,
    waiveRequiredSiteVisit,
  };
}

const EMPTY_VISIT_IDS = new Set<string>();

function useOptimisticallyHiddenVisits(scopeKey: string) {
  const [state, setState] = useState<{
    hiddenIds: Set<string>;
    scopeKey: string;
  }>(() => ({ hiddenIds: new Set(), scopeKey }));
  const hiddenIds =
    state.scopeKey === scopeKey ? state.hiddenIds : EMPTY_VISIT_IDS;
  const update = (visitId: string, hidden: boolean) => {
    setState((current) => {
      const nextIds = new Set(
        current.scopeKey === scopeKey ? current.hiddenIds : EMPTY_VISIT_IDS
      );
      if (hidden) {
        nextIds.add(visitId);
      } else {
        nextIds.delete(visitId);
      }
      return { hiddenIds: nextIds, scopeKey };
    });
  };
  return {
    hiddenIds,
    hide: (visitId: string) => update(visitId, true),
    restore: (visitId: string) => update(visitId, false),
  };
}
