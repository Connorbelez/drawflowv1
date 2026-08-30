import { describe, expect, test, vi } from "vitest";

import { finalizeAndScanCollaborationAssetUpload } from "./build_collaboration_asset_upload_application";
import type { Id } from "./types";

const assetId = "asset-1" as Id<"buildCollaborationAssets">;

describe("collaboration asset upload application", () => {
  test("finalizes, scans, and reads status in canonical order", async () => {
    const order: string[] = [];
    const result = await finalizeAndScanCollaborationAssetUpload({
      abandon: vi.fn(async () => undefined),
      finalize: async () => {
        order.push("finalize");
        return assetId;
      },
      readStatus: async () => {
        order.push("read");
        return {
          _id: assetId,
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          state: "available",
          version: 1,
        };
      },
      scan: async () => {
        order.push("scan");
      },
    });
    expect(order).toEqual(["finalize", "scan", "read"]);
    expect(result.state).toBe("available");
  });

  test("abandons staging when finalization fails and preserves the error", async () => {
    const abandon = vi.fn(async () => undefined);
    const scan = vi.fn(async () => undefined);
    await expect(
      finalizeAndScanCollaborationAssetUpload({
        abandon,
        finalize: async () => {
          throw new Error("hash mismatch");
        },
        readStatus: async () => null,
        scan,
      })
    ).rejects.toThrow("hash mismatch");
    expect(abandon).toHaveBeenCalledWith("hash mismatch");
    expect(scan).not.toHaveBeenCalled();
  });

  test("fails closed when final readback cannot observe the asset", async () => {
    await expect(
      finalizeAndScanCollaborationAssetUpload({
        abandon: async () => undefined,
        finalize: async () => assetId,
        readStatus: async () => null,
        scan: async () => undefined,
      })
    ).rejects.toThrow("finalized collaboration asset is unavailable");
  });
});
