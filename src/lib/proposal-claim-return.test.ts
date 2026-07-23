// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";

import {
  isProposalClaimReturnPath,
  PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY,
  rememberProposalClaimReturnPath,
  takeProposalClaimReturnPath,
} from "./proposal-claim-return.ts";

describe("proposal claim return path", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test("accepts only proposal claim route paths", () => {
    expect(isProposalClaimReturnPath("/proposal-claim/token-123")).toBe(true);
    expect(isProposalClaimReturnPath("/proposal-claim/token%20123")).toBe(true);
    expect(isProposalClaimReturnPath("/builder/proposals/123")).toBe(false);
    expect(isProposalClaimReturnPath("/proposal-claim/token-123?next=/builder")).toBe(false);
    expect(isProposalClaimReturnPath("https://example.com/proposal-claim/token")).toBe(false);
  });

  test("remembers and consumes a valid claim return path once", () => {
    rememberProposalClaimReturnPath("/proposal-claim/token-123");

    expect(takeProposalClaimReturnPath()).toBe("/proposal-claim/token-123");
    expect(takeProposalClaimReturnPath()).toBeNull();
  });

  test("ignores invalid return paths", () => {
    rememberProposalClaimReturnPath("/builder");

    expect(
      window.sessionStorage.getItem(PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY)
    ).toBeNull();
  });

  test("clears stored invalid values when consumed", () => {
    window.sessionStorage.setItem(
      PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY,
      "/protected-access"
    );

    expect(takeProposalClaimReturnPath()).toBeNull();
    expect(
      window.sessionStorage.getItem(PROPOSAL_CLAIM_RETURN_PATH_STORAGE_KEY)
    ).toBeNull();
  });
});
