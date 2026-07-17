import { describe, expect, test } from "vitest";

import { getContext } from "./root-provider";

describe("TanStack Query root context", () => {
  test("uses the Convex query hash for cached subscription keys", () => {
    const { convexQueryClient, queryClient } = getContext();
    const queryKey = [
      "convexQuery",
      "production_proposals:getBackofficeDashboard",
      { workosOrganizationId: "org_query_hash_test" },
    ] as const;

    queryClient.setQueryData(queryKey, { metrics: [] });

    expect(
      queryClient.getQueryCache().find({ queryKey })?.queryHash
    ).toBe(convexQueryClient.hashFn()(queryKey));
  });
});
