// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DeviceCaptureDialog } from "./device-capture-dialog";

const stopTrack = vi.fn();
const stream = {
  getTracks: () => [{ stop: stopTrack }],
} as unknown as MediaStream;
const getUserMedia = vi.fn().mockResolvedValue(stream);

describe("DeviceCaptureDialog", () => {
  beforeEach(() => {
    getUserMedia.mockClear();
    getUserMedia.mockResolvedValue(stream);
    stopTrack.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("captures a live camera frame as a WebP file", async () => {
    const onCapture = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["photo"], { type: "image/webp" })),
    );

    render(
      <DeviceCaptureDialog
        kind="photo"
        onCapture={onCapture}
        onOpenChange={vi.fn()}
        open
      />,
    );

    const preview = screen.getByLabelText("Photo camera preview");
    Object.defineProperties(preview, {
      readyState: { configurable: true, value: 4 },
      videoHeight: { configurable: true, value: 1920 },
      videoWidth: { configurable: true, value: 1080 },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "Capture photo",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture photo" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const capturedFile = onCapture.mock.calls[0]?.[0] as File;
    expect(capturedFile.type).toBe("image/webp");
    expect(capturedFile.name).toMatch(/^site-visit-\d+\.webp$/);
    expect(drawImage).toHaveBeenCalledWith(preview, 0, 0);
    expect(stopTrack).toHaveBeenCalled();
  });

  test("records camera and microphone data as a video file", async () => {
    const onCapture = vi.fn();
    class FakeMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "video/webm";
      }

      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      state: RecordingState = "inactive";

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType ?? "video/webm";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["video"], { type: this.mimeType }),
        } as BlobEvent);
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    render(
      <DeviceCaptureDialog
        kind="video"
        onCapture={onCapture}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "Start recording",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const capturedFile = onCapture.mock.calls[0]?.[0] as File;
    expect(capturedFile.type).toBe("video/webm");
    expect(capturedFile.name).toMatch(/^site-visit-\d+\.webm$/);
    expect(stopTrack).toHaveBeenCalled();
  });
});
