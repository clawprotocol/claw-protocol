import { useCallback, useRef } from "react";
import type { HeroDictationPhase } from "../launch/useHeroMediaDictation";
import { useSpeechController } from "./useSpeechController";

/**
 * Browser Web Speech dictation that appends into a controlled field (tap to start/stop).
 * Local only — no uploads or server calls.
 */
export function useLocalAppendDictation(
  value: string,
  onValueChange: (next: string) => void,
  options?: { onError?: (message: string) => void; disabled?: boolean }
) {
  const { onError, disabled = false } = options ?? {};
  const committedRef = useRef("");
  const speech = useSpeechController({
    onPartialTranscript: (partial) => {
      const base = committedRef.current;
      const next = base.trim() ? `${base.trim()} ${partial}` : partial;
      onValueChange(next);
    },
    onFinalTranscript: (final) => {
      const base = committedRef.current.trim();
      const next = base ? `${base} ${final.trim()}`.trim() : final.trim();
      committedRef.current = next;
      onValueChange(next);
    },
    onError,
  });

  const toggleRecording = useCallback(() => {
    if (disabled) return;
    if (speech.isListening) {
      speech.stopRecording();
    } else {
      committedRef.current = value;
      speech.startRecording();
    }
  }, [disabled, speech, value]);

  const phase: HeroDictationPhase = speech.awaitingRecognitionEnd
    ? "processing"
    : speech.isListening
      ? "recording"
      : "idle";

  const finalizeCommit = useCallback(async () => {
    await speech.finalizeRecording();
  }, [speech]);

  return {
    speech,
    toggleRecording,
    phase,
    finalizeCommit,
  };
}
