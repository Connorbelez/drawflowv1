import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { normalizeBuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import {
  type BuildSubmilestoneDetailTab,
  COLLECTION_FOR_TAB,
  type CollectionPaginationState,
  type CollectionPaginationStore,
  defaultTabForWorkspace,
  isVisibleWorkspaceBootstrap,
  isVisibleWorkspaceCollection,
  mergeCollectionRows,
  type SubmilestoneDetailSheetProps,
  type VisibleWorkspaceCollection,
  type WorkspaceBootstrap,
  type WorkspaceCollection,
  type WorkspaceCollectionResult,
} from "./submilestone-detail-sheet-contracts.ts";

interface SheetWorkspaceArgs {
  buildId: SubmilestoneDetailSheetProps["buildId"];
  buildSubmilestoneId: SubmilestoneDetailSheetProps["buildSubmilestoneId"];
  companionActionItemId?: SubmilestoneDetailSheetProps["companionActionItemId"];
  onSelectedTabChange?: SubmilestoneDetailSheetProps["onSelectedTabChange"];
  open: boolean;
  organizationId: string;
  requestNavigation: (action: () => void, label: string) => void;
  selectedTab?: BuildSubmilestoneDetailTab;
  viewerCapacity?: SubmilestoneDetailSheetProps["viewerCapacity"];
}

export function useSheetWorkspace({
  buildId,
  buildSubmilestoneId,
  companionActionItemId,
  onSelectedTabChange,
  open,
  organizationId,
  requestNavigation,
  selectedTab,
  viewerCapacity,
}: SheetWorkspaceArgs) {
  const [uncontrolledTab, setUncontrolledTab] = useState<
    BuildSubmilestoneDetailTab | undefined
  >();
  const paginationTargetKey = `${buildId}:${buildSubmilestoneId}:${companionActionItemId ?? "canonical"}:${open ? "open" : "closed"}`;
  const [paginationStore, setPaginationStore] =
    useState<CollectionPaginationStore>({
      byCollection: {},
      targetKey: paginationTargetKey,
    });
  useEffect(() => {
    if (!open) {
      setPaginationStore({
        byCollection: {},
        targetKey: paginationTargetKey,
      });
    }
  }, [open, paginationTargetKey]);

  const bootstrap = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap,
    open
      ? {
          buildId,
          buildSubmilestoneId,
          companionActionItemId,
          organizationId,
          viewerCapacity,
        }
      : "skip"
  ) as WorkspaceBootstrap | undefined;
  const normalizedSelectedTab =
    normalizeBuildSubmilestoneDetailTab(selectedTab);
  const inferredTab = defaultTabForWorkspace(bootstrap, viewerCapacity);
  const isControlled = selectedTab !== undefined;
  const activeTab = isControlled
    ? (normalizedSelectedTab ?? inferredTab)
    : (uncontrolledTab ?? inferredTab);
  const workspaceReady = isVisibleWorkspaceBootstrap(bootstrap);
  const selectedCollection = workspaceReady
    ? COLLECTION_FOR_TAB[activeTab]
    : undefined;
  const companionForQuery =
    workspaceReady && bootstrap.collaboration?.state === "available"
      ? (companionActionItemId ?? bootstrap.companion?.actionItemId)
      : undefined;
  const collectionCompanionForQuery = selectedCollection?.startsWith(
    "collaboration_"
  )
    ? companionForQuery
    : undefined;
  const paginationByCollection =
    paginationStore.targetKey === paginationTargetKey
      ? paginationStore.byCollection
      : {};
  const pagination = selectedCollection
    ? paginationByCollection[selectedCollection]
    : undefined;
  const {
    collection,
    evidenceRequirementsCollection,
    peopleHistoryCollection,
  } = useSheetCollectionQueries({
    activeTab,
    buildId,
    buildSubmilestoneId,
    collectionCompanionForQuery,
    cursor: pagination?.cursor,
    open,
    organizationId,
    selectedCollection,
    viewerCapacity,
    workspaceReady,
  });
  const visibleCollection = isVisibleWorkspaceCollection(collection)
    ? collection
    : undefined;
  const displayedCollection = getDisplayedCollection(
    collection,
    pagination?.accumulatedRows,
    pagination?.previousPage,
    visibleCollection
  );
  const loadingMore = Boolean(pagination?.cursor && collection === undefined);

  const loadMore = createLoadMoreHandler({
    paginationTargetKey,
    selectedCollection,
    setPaginationStore: (update) => setPaginationStore(update),
    visibleCollection,
  });
  const handleTabChange = createTabChangeHandler({
    activeTab,
    isControlled,
    onSelectedTabChange,
    requestNavigation,
    setUncontrolledTab: (nextTab) => setUncontrolledTab(nextTab),
  });

  return {
    activeTab,
    bootstrap,
    collection: displayedCollection,
    evidenceRequirementsCollection,
    handleTabChange,
    historyCollection: peopleHistoryCollection,
    loadMore,
    loadingMore,
  };
}

function createLoadMoreHandler({
  paginationTargetKey,
  selectedCollection,
  setPaginationStore,
  visibleCollection,
}: {
  paginationTargetKey: string;
  selectedCollection: WorkspaceCollection | undefined;
  setPaginationStore: (
    update: (current: CollectionPaginationStore) => CollectionPaginationStore
  ) => void;
  visibleCollection: VisibleWorkspaceCollection | undefined;
}) {
  return () => {
    if (!(selectedCollection && visibleCollection?.hasMore)) {
      return;
    }
    const nextCursor = visibleCollection.nextCursor;
    if (!nextCursor) {
      return;
    }
    setPaginationStore((currentStore) => {
      const current =
        currentStore.targetKey === paginationTargetKey
          ? currentStore.byCollection
          : {};
      return {
        byCollection: {
          ...current,
          [selectedCollection]: {
            accumulatedRows: mergeCollectionRows(
              current[selectedCollection]?.accumulatedRows ?? [],
              visibleCollection.page
            ),
            cursor: nextCursor,
            previousPage: visibleCollection,
          },
        },
        targetKey: paginationTargetKey,
      };
    });
  };
}

function useSheetCollectionQueries({
  activeTab,
  buildId,
  buildSubmilestoneId,
  collectionCompanionForQuery,
  cursor,
  open,
  organizationId,
  selectedCollection,
  viewerCapacity,
  workspaceReady,
}: {
  activeTab: BuildSubmilestoneDetailTab;
  buildId: SubmilestoneDetailSheetProps["buildId"];
  buildSubmilestoneId: SubmilestoneDetailSheetProps["buildSubmilestoneId"];
  collectionCompanionForQuery?: SubmilestoneDetailSheetProps["companionActionItemId"];
  cursor?: string;
  open: boolean;
  organizationId: string;
  selectedCollection: WorkspaceCollection | undefined;
  viewerCapacity?: SubmilestoneDetailSheetProps["viewerCapacity"];
  workspaceReady: boolean;
}) {
  const collection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && selectedCollection
      ? {
          buildId,
          buildSubmilestoneId,
          collection: selectedCollection,
          companionActionItemId: collectionCompanionForQuery,
          cursor,
          limit: 25,
          organizationId,
          viewerCapacity,
        }
      : "skip"
  ) as WorkspaceCollectionResult | undefined;
  const evidenceRequirementsCollection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && activeTab === "evidence"
      ? {
          buildId,
          buildSubmilestoneId,
          collection: "evidence_requirements" as const,
          cursor: undefined,
          limit: 100,
          organizationId,
          viewerCapacity,
        }
      : "skip"
  ) as WorkspaceCollectionResult | undefined;
  const peopleHistoryCollection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && activeTab === "people"
      ? {
          buildId,
          buildSubmilestoneId,
          collection: "people_history" as const,
          cursor: undefined,
          limit: 25,
          organizationId,
          viewerCapacity,
        }
      : "skip"
  ) as WorkspaceCollectionResult | undefined;
  return {
    collection,
    evidenceRequirementsCollection,
    peopleHistoryCollection,
  };
}

function createTabChangeHandler({
  activeTab,
  isControlled,
  onSelectedTabChange,
  requestNavigation,
  setUncontrolledTab,
}: {
  activeTab: BuildSubmilestoneDetailTab;
  isControlled: boolean;
  onSelectedTabChange?: SubmilestoneDetailSheetProps["onSelectedTabChange"];
  requestNavigation: (action: () => void, label: string) => void;
  setUncontrolledTab: (tab: BuildSubmilestoneDetailTab) => void;
}) {
  return (nextTab: BuildSubmilestoneDetailTab) => {
    if (nextTab === activeTab) {
      return;
    }
    requestNavigation(() => {
      if (!isControlled) {
        setUncontrolledTab(nextTab);
      }
      onSelectedTabChange?.(nextTab);
    }, "leave the Overview draft");
  };
}

function getDisplayedCollection(
  collection: WorkspaceCollectionResult | undefined,
  accumulatedRows: CollectionPaginationState["accumulatedRows"] | undefined,
  previousPage: CollectionPaginationState["previousPage"] | undefined,
  visibleCollection: VisibleWorkspaceCollection | undefined
): WorkspaceCollectionResult | undefined {
  if (visibleCollection) {
    return {
      ...visibleCollection,
      page: mergeCollectionRows(accumulatedRows ?? [], visibleCollection.page),
    };
  }
  if (collection === undefined && previousPage) {
    return {
      ...previousPage,
      page: accumulatedRows ?? [],
    };
  }
  return collection;
}
