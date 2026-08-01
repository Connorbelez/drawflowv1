import { describe, expect, test } from "vitest";

import { releaseMetadataResponse } from "./release";

describe("production release metadata", () => {
  test("binds the responding application origin to its deployment and Git SHA", async () => {
    const response = releaseMetadataResponse(
      new Request("https://drawflow.example.com/api/release"),
      {
        VERCEL_DEPLOYMENT_ID: "deployment_123",
        VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      applicationUrl: "https://drawflow.example.com",
      applicationVersion: "deployment_123",
      gitCommit: "a".repeat(40),
    });
  });

  test("fails closed when deployment metadata is absent", async () => {
    const response = releaseMetadataResponse(
      new Request("https://drawflow.example.com/api/release"),
      {}
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Release metadata is unavailable.",
    });
  });
});
