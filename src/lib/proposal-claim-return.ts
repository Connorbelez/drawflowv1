export const PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY =
  "drawflow:proposalClaimReturnPath";

export function isProposalClaimReturnPath(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && /^\/proposal-claim\/[^/?#]+$/.test(value);
}

export function rememberProposalClaimReturnPath(pathname: string) {
  if (!isProposalClaimReturnPath(pathname) || typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(
    PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY,
    pathname
  );
}

export function forgetProposalClaimReturnPath() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY);
}

export function takeProposalClaimReturnPath() {
  if (typeof window === "undefined") {
    return null;
  }
  const pathname = window.sessionStorage.getItem(
    PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY
  );
  window.sessionStorage.removeItem(PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY);
  return isProposalClaimReturnPath(pathname) ? pathname : null;
}
