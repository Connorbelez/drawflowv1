// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mutationByRef = new Map<string, (...args: unknown[]) => unknown>();
const actionByRef = new Map<string, (...args: unknown[]) => unknown>();
const useQuery = vi.fn();
const uploadAssets = vi.fn();
const abandonAssets = vi.fn();
const getAccessToken = vi.fn();

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAccessToken: () => ({ getAccessToken }),
}));

vi.mock("convex/react", () => ({
  useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
    actionByRef.get(getFunctionName(ref)),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    mutationByRef.get(getFunctionName(ref)),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

vi.mock(
  "#/features/build-collaboration/build-collaboration-asset-upload.ts",
  () => ({
    abandonGovernedCollaborationAssets: (...args: unknown[]) =>
      abandonAssets(...args),
    uploadGovernedCollaborationAssets: (...args: unknown[]) =>
      uploadAssets(...args),
  })
);

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  parseCadCents,
  SingleCostDocumentCapture,
} from "./SingleCostDocumentCapture";

describe("SingleCostDocumentCapture", () => {
  const beginUpload = vi.fn();
  const registerUpload = vi.fn();
  const finalizeAndScan = vi.fn();
  const abandonUpload = vi.fn();
  const submitCostDocument = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutationByRef.clear();
    actionByRef.clear();
    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets.beginBuildCollaborationAssetUpload
      ),
      beginUpload
    );
    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets
          .registerBuildCollaborationAssetUploadedStorage
      ),
      registerUpload
    );
    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets.abandonMyBuildCollaborationAssets
      ),
      abandonUpload
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.submitCostDocument),
      submitCostDocument
    );
    actionByRef.set(
      getFunctionName(
        api.build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload
      ),
      finalizeAndScan
    );
    uploadAssets.mockResolvedValue(["asset-page-1"]);
    submitCostDocument.mockResolvedValue("cost-document-1");
    useQuery.mockImplementation((_ref, args) =>
      args === "skip"
        ? undefined
        : {
            grossTotalCents: 12_345,
            pages: [
              {
                assetId: "asset-page-1",
                fileName: "invoice.pdf",
                mimeType: "application/pdf",
                order: 1,
              },
            ],
            receipt: {
              recipientEmail: "builder@example.com",
              status: "queued",
            },
            title: "Foundation invoice",
            vendorName: "Cedar Forming Ltd.",
          }
    );
  });

  afterEach(() => cleanup());

  test("captures and submits one exact full-total allocation", async () => {
    render(
      <SingleCostDocumentCapture
        buildId={"build-1" as Id<"activeBuilds">}
        organizationId="org-1"
        submilestones={[
          {
            id: "submilestone-1" as Id<"buildSubmilestones">,
            label: "Foundation · Footings",
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("Invoice or Receipt pages"), {
      target: {
        files: [
          new File(["page"], "invoice.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Foundation invoice" },
    });
    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Cedar Forming Ltd." },
    });
    fireEvent.change(screen.getByLabelText("Document date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Gross Document Total (CAD)"), {
      target: { value: "123.45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Cost Document" }));

    await waitFor(() => expect(submitCostDocument).toHaveBeenCalledTimes(1));
    expect(uploadAssets).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "invoice.pdf" })],
      expect.objectContaining({
        buildId: "build-1",
        contextKind: "composer",
        organizationId: "org-1",
      })
    );
    expect(submitCostDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        allocations: [
          { amountCents: 12_345, buildSubmilestoneId: "submilestone-1" },
        ],
        currency: "CAD",
        grossTotalCents: 12_345,
        pageAssetIds: ["asset-page-1"],
      })
    );
    expect(await screen.findByText("Cost Document frozen")).not.toBeNull();
    expect(screen.getByText(/123\.45/)).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Download page 1: invoice.pdf" })
    ).not.toBeNull();
  });

  test("rejects more than 50 pages before uploading any asset", async () => {
    render(
      <SingleCostDocumentCapture
        buildId={"build-1" as Id<"activeBuilds">}
        organizationId="org-1"
        submilestones={[
          {
            id: "submilestone-1" as Id<"buildSubmilestones">,
            label: "Foundation · Footings",
          },
        ]}
      />
    );
    const input = screen.getByLabelText("Invoice or Receipt pages");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: Array.from(
        { length: 51 },
        (_, index) => new File(["page"], `invoice-${index + 1}.pdf`)
      ),
    });
    fireEvent.change(input);

    expect(
      await screen.findByText("A Cost Document supports at most 50 pages.")
    ).not.toBeNull();
    expect(uploadAssets).not.toHaveBeenCalled();
  });

  test("parses exact CAD cents and rejects ambiguous precision", () => {
    expect(parseCadCents("$1,234.50")).toBe(123_450);
    expect(() => parseCadCents("12.345")).toThrow("positive CAD amount");
    expect(() => parseCadCents("0")).toThrow("positive CAD amount");
  });
});
