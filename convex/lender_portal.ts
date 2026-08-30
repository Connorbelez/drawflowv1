/**
 * Stable lender portal facade.
 *
 * Public Convex handlers remain exported from this module so generated API
 * names and route consumers do not change while coarse capabilities live in
 * bounded-context sibling modules.
 */
export {
  listLenderAssignedProposals,
  listLenderAssignedProposalPage,
  getBackofficeLenderOrganizationPortfolio,
} from "./lender_portal/proposals.js";
export {
  listLenderActiveBuilds,
  getLenderBuildDetail,
} from "./lender_portal/build_detail.js";
export { getLenderDrawQueue } from "./lender_portal/draw_queue.js";
export { getLenderDashboard } from "./lender_portal/dashboard.js";
export {
  addLenderBuildCollaborationResponse,
  getLenderBuildCollaborationLifecycleState,
  listLenderBuildCollaborationPosts,
  listLenderBuildCollaborationResponses,
  publishLenderBuildCollaborationPost,
} from "./lender_portal/collaboration.js";
export {
  abandonLenderBuildCollaborationAssets,
  authorizeLenderBuildCollaborationAssetDownload,
  beginLenderBuildCollaborationAssetUpload,
  finalizeLenderBuildCollaborationAssetUploadForAction,
  listLenderBuildCollaborationAssetStatuses,
  registerLenderBuildCollaborationAssetUploadedStorage,
} from "./lender_portal/collaboration_assets.js";
export { finalizeAndScanLenderBuildCollaborationAssetUpload } from "./lender_portal/collaboration_asset_actions.js";
