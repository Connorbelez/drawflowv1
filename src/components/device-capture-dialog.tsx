"use client";

import { Camera, CircleStop, LoaderCircle, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";

export type DeviceCaptureKind = "photo" | "video";

const VIDEO_DURATION_LIMIT_SECONDS = 90;
const VIDEO_MEMORY_LIMIT_BYTES = 200_000_000;

export function DeviceCaptureDialog({
  kind,
  onCapture,
  onOpenChange,
  open,
}: {
  kind: DeviceCaptureKind;
  onCapture: (file: File) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback((discardRecording = true) => {
    discardRecordingRef.current = discardRecording;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setRecording(false);
    setRecordingSeconds(0);
    setStarting(false);
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }

    let disposed = false;
    let startupTimedOut = false;
    setError("");
    setStarting(true);
    setCameraReady(false);
    const getUserMedia = navigator.mediaDevices?.getUserMedia;
    if (!getUserMedia) {
      setStarting(false);
      setError(
        "This browser cannot open a live camera. Use the device capture fallback instead."
      );
      return;
    }
    const startupTimeout = window.setTimeout(() => {
      if (!disposed) {
        startupTimedOut = true;
        setStarting(false);
        setError(
          "The live camera did not start. Use the device camera now or retry the live preview."
        );
      }
    }, 12_000);

    getUserMedia
      .call(navigator.mediaDevices, {
        audio: kind === "video",
        video: { facingMode: { ideal: "environment" } },
      })
      .then(async (stream) => {
        window.clearTimeout(startupTimeout);
        if (disposed || startupTimedOut) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setCameraReady(true);
      })
      .catch(() => {
        window.clearTimeout(startupTimeout);
        if (!(disposed || startupTimedOut)) {
          setError(
            "Camera access was blocked or unavailable. Check browser permissions or use the fallback."
          );
        }
      })
      .finally(() => {
        if (!disposed) {
          setStarting(false);
        }
      });

    return () => {
      disposed = true;
      window.clearTimeout(startupTimeout);
      stopStream();
    };
  }, [kind, open, stopStream]);

  const close = () => {
    stopStream();
    onOpenChange(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!(video && canvas && cameraReady) || video.readyState < 2) {
      setError("The camera preview is not ready yet. Try again in a moment.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The browser could not capture this camera frame.");
      return;
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("The browser could not encode this photo.");
          return;
        }
        onCapture(
          new File([blob], `site-visit-${Date.now()}.webp`, {
            type: "image/webp",
          })
        );
        close();
      },
      "image/webp",
      0.88
    );
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!(stream && cameraReady)) {
      setError("The camera preview is not ready yet. Try again in a moment.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("This browser cannot record video. Use the fallback instead.");
      return;
    }
    const mimeType = preferredVideoMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    discardRecordingRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        const capturedBytes = chunksRef.current.reduce(
          (sum, chunk) => sum + chunk.size,
          0
        );
        if (
          capturedBytes >= VIDEO_MEMORY_LIMIT_BYTES &&
          recorder.state === "recording"
        ) {
          setError(
            "Recording stopped at the mobile memory limit. The captured video is ready to review."
          );
          recorder.stop();
        }
      }
    };
    recorder.onerror = () => {
      setError("Video recording failed. Try again or use the fallback.");
      setRecording(false);
    };
    recorder.onstop = () => {
      if (discardRecordingRef.current) {
        chunksRef.current = [];
        return;
      }
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size === 0) {
        setError("No video data was captured. Try recording again.");
        return;
      }
      onCapture(
        new File([blob], `site-visit-${Date.now()}.${videoExtension(type)}`, {
          type,
        })
      );
      stopStream(false);
      onOpenChange(false);
    };
    recorderRef.current = recorder;
    recorder.start(250);
    const startedAt = Date.now();
    setRecordingSeconds(0);
    recordingIntervalRef.current = window.setInterval(
      () => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    recordingTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state === "recording") {
        setError(
          `Recording stopped at the ${VIDEO_DURATION_LIMIT_SECONDS}-second field-video limit.`
        );
        recorder.stop();
      }
    }, VIDEO_DURATION_LIMIT_SECONDS * 1000);
    setRecording(true);
  };

  const stopRecording = () => {
    discardRecordingRef.current = false;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const accept = kind === "photo" ? "image/*" : "video/*";

  return (
    <Dialog
      onOpenChange={(nextOpen) => (nextOpen ? undefined : close())}
      open={open}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        className="max-h-svh max-w-2xl overflow-hidden rounded-none sm:max-h-[calc(100svh-2rem)] sm:rounded-2xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {kind === "photo" ? "Take site photo" : "Record site video"}
          </DialogTitle>
          <DialogDescription>
            {kind === "photo"
              ? "Use the device camera, then capture the frame when the evidence is clear."
              : "Use the device camera and microphone, then stop when the evidence is complete."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <div className="relative overflow-hidden rounded-xl border bg-black">
            <video
              aria-label={
                kind === "photo"
                  ? "Photo camera preview"
                  : "Video camera preview"
              }
              autoPlay
              className="aspect-[3/4] max-h-[65svh] w-full object-cover sm:aspect-video"
              muted
              playsInline
              ref={videoRef}
            />
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-foreground/70 text-background">
                <span className="flex items-center gap-2 text-sm">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-5 animate-spin"
                  />
                  Starting camera…
                </span>
              </div>
            ) : null}
            {recording ? (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-destructive px-3 py-1.5 font-medium text-destructive-foreground text-xs">
                <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" />
                Recording {formatRecordingDuration(recordingSeconds)} / 1:30
              </div>
            ) : null}
          </div>
          <canvas className="hidden" ref={canvasRef} />
          {error ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-destructive text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <input
            accept={accept}
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                onCapture(file);
                close();
              }
            }}
            ref={fallbackInputRef}
            type="file"
          />
        </DialogPanel>
        <DialogFooter>
          <Button onClick={close} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => fallbackInputRef.current?.click()}
            type="button"
            variant="outline"
          >
            Use device camera
          </Button>
          {kind === "photo" ? (
            <Button
              disabled={!cameraReady || starting}
              onClick={capturePhoto}
              type="button"
            >
              <Camera aria-hidden="true" />
              Capture photo
            </Button>
          ) : recording ? (
            <Button onClick={stopRecording} type="button" variant="destructive">
              <CircleStop aria-hidden="true" />
              Stop recording
            </Button>
          ) : (
            <Button
              disabled={!cameraReady || starting}
              onClick={startRecording}
              type="button"
            >
              <Video aria-hidden="true" />
              Start recording
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function preferredVideoMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  return (
    [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
  );
}

function videoExtension(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
