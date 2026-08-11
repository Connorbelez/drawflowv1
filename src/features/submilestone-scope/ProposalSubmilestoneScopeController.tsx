"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type ScopeRevisionContent,
  type ScopeRevisionLoadResult,
  type ScopeRevisionSummary,
  type ScopeRevisionSurfaceRoute,
  SubmilestoneScopeRevisionSurface,
} from "./SubmilestoneScopeRevisionSurface.tsx";

export interface ProposalSubmilestoneScopeControllerProps {
  onDirtyChange?: (dirty: boolean) => void;
  proposalSubmilestoneId?: string;
  scopeRoute: ScopeRevisionSurfaceRoute;
  workosOrganizationId?: string;
}

interface ScopeHistory {
  activeDraftRevisionId?: string;
  effectiveRevisionId?: string;
  revisions: Array<{
    _id: string;
    authoredByDisplayName?: string;
    authoredByWorkosUserId: string;
    basedOnRevisionId?: string;
    changeReason?: string;
    createdAt: number;
    isActiveDraft?: boolean;
    isEffective?: boolean;
    publishedAt?: number;
    savedAt?: number;
    status: "draft" | "published";
    version: number;
  }>;
}

interface ScopeContent {
  _id: string;
  scopeOfWorkTiptapJson: string;
}

function isBackofficeRoute(route: ScopeRevisionSurfaceRoute) {
  return route === "backoffice-proposal";
}

function isBuilderRoute(route: ScopeRevisionSurfaceRoute) {
  return route === "builder-proposal" || route === "active-build";
}

function historyForRoute(
  route: ScopeRevisionSurfaceRoute,
  backofficeHistory: ScopeHistory | null | undefined,
  builderHistory: ScopeHistory | null | undefined
) {
  return isBackofficeRoute(route) ? backofficeHistory : builderHistory;
}

function toRevisionSummary(
  revision: ScopeHistory["revisions"][number]
): ScopeRevisionSummary {
  return {
    authoredByWorkosUserId: revision.authoredByWorkosUserId,
    basedOnRevisionId: revision.basedOnRevisionId,
    changeReason: revision.changeReason,
    createdAt: revision.createdAt,
    id: revision._id,
    publishedAt: revision.publishedAt,
    savedAt: revision.savedAt,
    status: revision.status,
    version: revision.version,
  };
}

/**
 * Connects a proposal Sub-milestone to the shared Scope revision surface.
 *
 * The route is an explicit capability boundary.  It is deliberately not
 * inferred from the current identity: a Builder route always uses the
 * published-only query and receives no draft actions, even when the same
 * identity also has an admin role.
 */
export function ProposalSubmilestoneScopeController({
  onDirtyChange,
  proposalSubmilestoneId,
  scopeRoute,
  workosOrganizationId,
}: ProposalSubmilestoneScopeControllerProps) {
  const queryArgs =
    proposalSubmilestoneId && workosOrganizationId
      ? {
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          workosOrganizationId,
        }
      : "skip";
  const backofficeHistory = useQuery(
    api.submilestone_scope_contracts.getSubmilestoneScopeHistory,
    isBackofficeRoute(scopeRoute) ? queryArgs : "skip"
  ) as ScopeHistory | null | undefined;
  const builderHistory = useQuery(
    api.submilestone_scope_contracts.getBuilderSubmilestoneScopeHistory,
    isBuilderRoute(scopeRoute) ? queryArgs : "skip"
  ) as ScopeHistory | null | undefined;

  const history = historyForRoute(
    scopeRoute,
    backofficeHistory,
    builderHistory
  );
  const revisions = useMemo(
    () => (history?.revisions ?? []).map(toRevisionSummary),
    [history?.revisions]
  );
  const activeDraftRevision = useMemo(() => {
    if (!(isBackofficeRoute(scopeRoute) && history?.activeDraftRevisionId)) {
      return null;
    }
    const revision = revisions.find(
      (candidate) => candidate.id === history.activeDraftRevisionId
    );
    return revision?.status === "draft" ? revision : null;
  }, [history?.activeDraftRevisionId, revisions, scopeRoute]);
  const effectiveRevisionId = history?.effectiveRevisionId ?? null;
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    effectiveRevisionId
  );

  useEffect(() => {
    if (
      selectedRevisionId &&
      revisions.some((revision) => revision.id === selectedRevisionId)
    ) {
      return;
    }
    setSelectedRevisionId(effectiveRevisionId ?? revisions[0]?.id ?? null);
  }, [effectiveRevisionId, revisions, selectedRevisionId]);

  const selectedContentResult = useQuery(
    isBackofficeRoute(scopeRoute)
      ? api.submilestone_scope_contracts.getSubmilestoneScopeRevisionContent
      : api.submilestone_scope_contracts
          .getBuilderSubmilestoneScopeRevisionContent,
    selectedRevisionId && workosOrganizationId
      ? {
          revisionId: selectedRevisionId as Id<"submilestoneScopeRevisions">,
          workosOrganizationId,
        }
      : "skip"
  ) as ScopeContent | undefined;
  const selectedRevisionContent: ScopeRevisionContent | null =
    selectedContentResult && selectedRevisionId
      ? {
          revisionId: selectedContentResult._id,
          scopeOfWorkTiptapJson: selectedContentResult.scopeOfWorkTiptapJson,
        }
      : null;

  const createDraft = useMutation(
    api.submilestone_scope_contracts.createSubmilestoneScopeDraft
  );
  const saveDraft = useMutation(
    api.submilestone_scope_contracts.saveSubmilestoneScopeDraft
  );
  const publishDraft = useMutation(
    api.submilestone_scope_contracts.publishSubmilestoneScopeRevision
  );
  // Publication freezes backoffice-authored content. It is not final approval:
  // SFG-05 borrower/lender decisions (or an admin override) alone advance the
  // effective revision after submission.
  const canAuthor =
    isBackofficeRoute(scopeRoute) && Boolean(workosOrganizationId);

  const onCreateDraftFromRevision = canAuthor
    ? async (
        sourceRevisionId: string
      ): Promise<ScopeRevisionLoadResult | undefined> => {
        const revisionId = await createDraft({
          basedOnRevisionId:
            sourceRevisionId as Id<"submilestoneScopeRevisions">,
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          workosOrganizationId: workosOrganizationId as string,
        });
        // The history query is reactive and will add the new draft. Selecting
        // its ID here makes the editor switch immediately without inventing a
        // client-side revision summary or content payload.
        setSelectedRevisionId(String(revisionId));
      }
    : undefined;

  const onLoadDraft = canAuthor
    ? () => Promise.resolve<ScopeRevisionLoadResult | undefined>(undefined)
    : undefined;

  const onSaveDraft = canAuthor
    ? async ({
        revisionId,
        scopeOfWorkTiptapJson,
      }: {
        revisionId: string;
        scopeOfWorkTiptapJson: string;
      }) => {
        await saveDraft({
          revisionId: revisionId as Id<"submilestoneScopeRevisions">,
          scopeOfWorkTiptapJson,
          workosOrganizationId: workosOrganizationId as string,
        });
      }
    : undefined;

  const onPublishDraft = canAuthor
    ? async ({
        changeReason,
        revisionId,
      }: {
        changeReason?: string;
        revisionId: string;
      }) => {
        await publishDraft({
          ...(changeReason ? { changeReason } : {}),
          revisionId: revisionId as Id<"submilestoneScopeRevisions">,
          workosOrganizationId: workosOrganizationId as string,
        });
      }
    : undefined;

  return (
    <SubmilestoneScopeRevisionSurface
      activeDraftRevision={canAuthor ? activeDraftRevision : null}
      capabilities={{
        canEditDraft: canAuthor,
        canLoadUnpublishedDraft: canAuthor,
        canPublishDraft: canAuthor,
        canStartDraft: canAuthor,
      }}
      effectiveRevisionId={effectiveRevisionId}
      onCreateDraftFromRevision={onCreateDraftFromRevision}
      onDirtyChange={onDirtyChange}
      onLoadDraft={onLoadDraft}
      onPublishDraft={onPublishDraft}
      onSaveDraft={onSaveDraft}
      onSelectRevision={setSelectedRevisionId}
      revisions={revisions}
      scopeRoute={scopeRoute}
      selectedRevisionContent={selectedRevisionContent}
      selectedRevisionId={selectedRevisionId}
      selectedRevisionLoading={Boolean(
        selectedRevisionId && !selectedContentResult
      )}
    />
  );
}
