import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Options = {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError?: (message: string) => void;
};

const MAX_MS = 5 * 60 * 1000;
const WARNING_MS = 4 * 60 * 1000 + 45 * 1000;

function getCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useSpeechController(opts: Options) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const restartRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [autoStopAfterSilence, setAutoStopAfterSilence] = useState(false);
  const [warningShown, setWarningShown] = useState(false);

  useEffect(() => {
    setIsSupported(Boolean(getCtor()));
  }, []);

  useEffect(() => {
    if (!isListening) return;
    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= WARNING_MS && !warningShown) {
        setWarningShown(true);
      }
      if (elapsed >= MAX_MS) {
        stopRecording();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [isListening, warningShown]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const scheduleSilenceStop = useCallback(() => {
    clearSilenceTimer();
    if (!autoStopAfterSilence || !isListening) return;
    silenceTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, 4000);
  }, [autoStopAfterSilence, clearSilenceTimer, isListening]);

  const stopRecording = useCallback(() => {
    restartRef.current = false;
    clearSilenceTimer();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore stop race errors
      }
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const startRecording = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      opts.onError?.("Dictation not supported in this browser.");
      return false;
    }
    if (!recognitionRef.current) {
      recognitionRef.current = new Ctor();
    }
    const rec = recognitionRef.current;
    if (!rec) return false;

    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      let partial = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript || "";
        if (!text.trim()) continue;
        if (result.isFinal) finalText += `${text} `;
        else partial += `${text} `;
      }
      if (partial.trim()) opts.onPartialTranscript(partial.trim());
      if (finalText.trim()) opts.onFinalTranscript(finalText.trim());
      scheduleSilenceStop();
    };
    rec.onerror = (event: any) => {
      const err = String(event?.error || "speech_error");
      opts.onError?.(err);
      if (err !== "no-speech") {
        stopRecording();
      } else {
        scheduleSilenceStop();
      }
    };
    rec.onend = () => {
      if (restartRef.current && !autoStopAfterSilence) {
        try {
          rec.start();
        } catch {
          stopRecording();
        }
      } else if (restartRef.current && autoStopAfterSilence) {
        scheduleSilenceStop();
      } else {
        setIsListening(false);
      }
    };

    restartRef.current = true;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setWarningShown(false);
    try {
      rec.start();
      setIsListening(true);
      return true;
    } catch {
      opts.onError?.("Could not start microphone. Please allow mic access.");
      setIsListening(false);
      return false;
    }
  }, [autoStopAfterSilence, opts, scheduleSilenceStop, stopRecording]);

  const elapsedLabel = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsedMs]);

  return {
    isSupported,
    isListening,
    elapsedLabel,
    autoStopAfterSilence,
    setAutoStopAfterSilence,
    warningShown,
    startRecording,
    stopRecording,
  };
}

