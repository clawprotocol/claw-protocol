import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, errorMessageFromResponse, logClawClientWarning, readJson } from "../lib/clawApi";
import type { FinalizeRecordingResult } from "./heroIntakePrefill";

export type HeroDictationPhase = "idle" | "recording" | "processing";

export type { FinalizeRecordingResult };

/** Long-form agreement dictation: multi-pass allowed (auto-stop finalizes segment and appends). */
const MAX_RECORDING_MS = 90_000;
const CLIENT_MAX_UPLOADS_PER_MINUTE = 12;
const MIN_BLOB_BYTES = 400;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "audio/webm";
}

function recordingStartsAllowed(timestamps: number[]): boolean {
  const now = Date.now();
  const recent = timestamps.filter((t) => now - t < 60_000);
  timestamps.length = 0;
  timestamps.push(...recent);
  return recent.length < CLIENT_MAX_UPLOADS_PER_MINUTE;
}

function pushRecordingStart(timestamps: number[]): void {
  timestamps.push(Date.now());
}

type FinalizeWaiter = (r: FinalizeRecordingResult) => void;

function formatMmSs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function useHeroMediaDictation(options: {
  onTranscript: (text: string) => void;
  enabled?: boolean;
}) {
  const { onTranscript, enabled = true } = options;
  const [phase, setPhase] = useState<HeroDictationPhase>("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpmRef = useRef<number[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<HeroDictationPhase>(phase);
  phaseRef.current = phase;
  const finalizeWaitersRef = useRef<FinalizeWaiter[]>([]);
  const maxDurationStopRef = useRef(false);

  const flushFinalizeWaiters = useCallback((result: FinalizeRecordingResult) => {
    const waiters = finalizeWaitersRef.current;
    finalizeWaitersRef.current = [];
    for (const w of waiters) w(result);
  }, []);

  const clearMaxTimer = useCallback(() => {
    if (maxTimerRef.current != null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    clearMaxTimer();
  }, [clearMaxTimer]);

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      const hitMaxDuration = maxDurationStopRef.current;
      maxDurationStopRef.current = false;

      if (blob.size < MIN_BLOB_BYTES) {
        setPhase("idle");
        setBanner("Recording too short — hold the mic a little longer.");
        flushFinalizeWaiters({ status: "failed", reason: "short" });
        return;
      }
      if (!recordingStartsAllowed(rpmRef.current)) {
        setPhase("idle");
        setBanner("Voice limit: please wait a few seconds, then tap the mic again — your text is unchanged.");
        flushFinalizeWaiters({ status: "failed", reason: "rate_limit" });
        return;
      }
      pushRecordingStart(rpmRef.current);
      setPhase("processing");
      setBanner(null);
      try {
        const fd = new FormData();
        fd.append("file", blob, "hero.webm");
        const res = await fetch(apiUrl("/v1/transcribe/hero"), {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const msg = await errorMessageFromResponse(res, `Transcription failed (${res.status})`);
          logClawClientWarning("hero.transcribe", { status: res.status });
          setBanner(msg);
          flushFinalizeWaiters({ status: "failed", reason: "error" });
          return;
        }
        const j = await readJson<{ text?: string }>(res);
        const text = String(j.text || "").trim();
        if (!text) {
          setBanner("No speech detected. Edit and try again.");
          flushFinalizeWaiters({ status: "failed", reason: "empty" });
          return;
        }
        onTranscript(text);
        if (hitMaxDuration) {
          setBanner(
            "Saved this part — tap the mic anytime to keep going. Nothing was replaced; we only added your new words.",
          );
        }
        flushFinalizeWaiters({ status: "ok", transcript: text });
      } catch (e) {
        logClawClientWarning("hero.transcribe", { error: String(e) });
        setBanner("Couldn't reach the server. Your text is unchanged — type or retry.");
        flushFinalizeWaiters({ status: "failed", reason: "network" });
      } finally {
        setPhase("idle");
      }
    },
    [onTranscript, flushFinalizeWaiters],
  );

  const stopAndSend = useCallback(() => {
    /** Caller must set maxDurationStopRef before if stopping for segment limit. */
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      cleanupStream();
      setRecordingElapsedMs(0);
      setPhase("idle");
      return;
    }
    clearMaxTimer();
    rec.stop();
  }, [cleanupStream, clearMaxTimer]);

  stopRef.current = stopAndSend;

  useEffect(() => {
    return () => {
      clearMaxTimer();
      cleanupStream();
    };
  }, [clearMaxTimer, cleanupStream]);

  useEffect(() => {
    if (phase !== "recording") {
      setRecordingElapsedMs(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setRecordingElapsedMs(Date.now() - t0);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const startRecording = useCallback(async () => {
    if (!enabled || phase !== "idle") return;
    setBanner(null);
    maxDurationStopRef.current = false;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setBanner("Voice input isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      mimeRef.current = pickMime();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
      } catch {
        rec = new MediaRecorder(stream);
        mimeRef.current = rec.mimeType || "audio/webm";
      }
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onerror = () => {
        setBanner("Recording error. You can keep typing — nothing was removed.");
        cleanupStream();
        setPhase("idle");
        setRecordingElapsedMs(0);
        flushFinalizeWaiters({ status: "failed", reason: "error" });
      };
      rec.onstop = () => {
        const mime = mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        cleanupStream();
        setRecordingElapsedMs(0);
        void uploadBlob(blob);
      };
      rec.start(250);
      setPhase("recording");
      maxTimerRef.current = setTimeout(() => {
        maxDurationStopRef.current = true;
        stopRef.current?.();
      }, MAX_RECORDING_MS);
    } catch {
      setBanner("Microphone permission denied or unavailable.");
      cleanupStream();
      setPhase("idle");
      setRecordingElapsedMs(0);
      flushFinalizeWaiters({ status: "failed", reason: "error" });
    }
  }, [cleanupStream, enabled, phase, uploadBlob, flushFinalizeWaiters]);

  const toggleRecording = useCallback(() => {
    if (phase === "recording") {
      maxDurationStopRef.current = false;
      stopAndSend();
      return;
    }
    if (phase === "idle") {
      void startRecording();
    }
  }, [phase, startRecording, stopAndSend]);

  const finalizeRecordingAndGetTranscript = useCallback((): Promise<FinalizeRecordingResult> => {
    return new Promise((resolve) => {
      const p = phaseRef.current;
      if (p !== "recording" && p !== "processing") {
        resolve({ status: "none" });
        return;
      }
      finalizeWaitersRef.current.push(resolve);
      if (p === "recording") {
        maxDurationStopRef.current = false;
        stopAndSend();
      }
    });
  }, [stopAndSend]);

  return {
    phase,
    banner,
    dismissBanner: () => setBanner(null),
    toggleRecording,
    finalizeRecordingAndGetTranscript,
    recordingTimerLabel: phase === "recording" ? formatMmSs(recordingElapsedMs) : "0:00",
    maxRecordingLabel: formatMmSs(MAX_RECORDING_MS),
    maxRecordingMs: MAX_RECORDING_MS,
    /** False when MediaRecorder / getUserMedia likely missing */
    isSupported:
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
  };
}
