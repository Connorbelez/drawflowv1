// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "./BuildPermitViewerDrawer";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreObjectUrlStatics();
});

describe("BuildPermitViewerDrawer", () => {
  test("renders nothing when no permit is attached", () => {
    render(<BuildPermitViewerDrawer permit={null} />);

    expect(screen.queryByTestId("build-permit-viewer-trigger")).toBeNull();
  });

  test("shows a disabled trigger when permit metadata has no usable URL", () => {
    render(
      <BuildPermitViewerDrawer
        permit={{ fileName: "permit.pdf", storageId: "storage_123" }}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /view permit/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("opens the PDF drawer with viewer and fallback actions", async () => {
    render(
      <BuildPermitViewerDrawer
        permit={{
          fileName: "permit.pdf",
          mimeType: "application/pdf",
          storageUrl: "https://example.com/permit.pdf",
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("build-permit-viewer-trigger"));

    expect(await screen.findByText("permit.pdf")).toBeTruthy();
    expect(
      screen.getByTestId("build-permit-pdf-frame").getAttribute("src"),
    ).toBe("https://example.com/permit.pdf#toolbar=1&navpanes=1&scrollbar=1");
    expect(
      screen
        .getByRole("link", { name: /open in new tab/i })
        .getAttribute("href"),
    ).toBe("https://example.com/permit.pdf");
    expect(
      screen.getByRole("link", { name: /download/i }).getAttribute("download"),
    ).toBe("permit.pdf");
  });

  test("creates and revokes an object URL for in-memory upload files", () => {
    ensureObjectUrlStatics();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:permit");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const file = new File(["permit"], "uploaded-permit.pdf", {
      type: "application/pdf",
    });

    const { unmount } = render(<BuildPermitViewerDrawer permit={{ file }} />);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0]?.[0] as File).name).toBe(
      "uploaded-permit.pdf",
    );
    fireEvent.click(screen.getByTestId("build-permit-viewer-trigger"));
    expect(
      screen.getByTestId("build-permit-pdf-frame").getAttribute("src"),
    ).toBe("blob:permit#toolbar=1&navpanes=1&scrollbar=1");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:permit");
  });
});

function ensureObjectUrlStatics() {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "",
    });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  }
}

function restoreObjectUrlStatics() {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
}

describe("firstPermitDocument", () => {
  test("selects permit document from mixed document rows", () => {
    expect(
      firstPermitDocument([
        { documentType: "supporting", fileName: "invoice.pdf" },
        {
          documentType: "permit",
          fileName: "permit.pdf",
          storageUrl: "https://example.com/permit.pdf",
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        fileName: "permit.pdf",
        storageUrl: "https://example.com/permit.pdf",
      }),
    );
  });

  test("selects the latest active permit version", () => {
    expect(
      firstPermitDocument([
        {
          documentType: "permit",
          fileName: "permit-v1.pdf",
          status: "superseded",
          version: 1,
        },
        {
          documentType: "permit",
          fileName: "permit-v2.pdf",
          status: "uploaded",
          version: 2,
        },
      ]),
    ).toEqual(expect.objectContaining({ fileName: "permit-v2.pdf" }));
  });
});
