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
