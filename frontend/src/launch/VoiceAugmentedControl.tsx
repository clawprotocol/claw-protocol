import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type InputHTMLAttributes,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import { useLocalAppendDictation } from "../hooks/useLocalAppendDictation";
import type { HeroDictationPhase } from "./useHeroMediaDictation";
import { HeroVoiceInputBar } from "./HeroVoiceInputBar";

const MAX_SPEECH_MMSS = "5:00";

export type VoiceDictationControl = {
  /** Stops the mic and waits until recognition has fully ended (final transcripts applied). */
  finalizeDictation: () => Promise<void>;
};

type VoiceChrome = {
  value: string;
  onValueChange: (v: string) => void;
  /** When false, hide mic. Default: follow VITE_CLAW_HERO_DICTATION (same gate as hero). */
  voiceUiEnabled?: boolean;
  surface?: "dark" | "light";
  disabled?: boolean;
  onVoiceError?: (msg: string) => void;
  onDictationActiveChange?: (active: boolean) => void;
  /** Idle | recording | processing (transcribing after stop). */
  onDictationPhaseChange?: (phase: HeroDictationPhase) => void;
  /** Receive imperative API to finalize dictation before navigation / parse. */
  dictationControlRef?: RefObject<VoiceDictationControl | null>;
  /** Classes on the relative wrapper (e.g. flex-1 min-w-0). */
  wrapperClassName?: string;
  /** When false, mic stays fully visible (e.g. revision entry). Default true for softer idle chrome. */
  voiceSubtleIdle?: boolean;
  /** Pulse / glow the mic when the UI is prompting for the next spoken answer (create intake). */
  micIdleAttract?: boolean;
  /** Increment to request starting dictation (e.g. top-level “Speak your agreement” chip). */
  dictationStartNonce?: number;
};

function useMicGate(voiceUiEnabled: boolean | undefined) {
  return useMemo(
    () =>
      voiceUiEnabled !== undefined
        ? voiceUiEnabled
        : String((import.meta as ImportMeta).env?.VITE_CLAW_HERO_DICTATION ?? "1") !== "0",
    [voiceUiEnabled]
  );
}

export const VoiceAugmentedTextArea = forwardRef<
  HTMLTextAreaElement,
  VoiceChrome &
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange" | "disabled">
>(function VoiceAugmentedTextArea(props, ref) {
  const {
    value,
    onValueChange,
    voiceUiEnabled,
    surface = "dark",
    disabled = false,
    onVoiceError,
    onDictationActiveChange,
    onDictationPhaseChange,
    dictationControlRef,
    wrapperClassName,
    voiceSubtleIdle = true,
    micIdleAttract = false,
    dictationStartNonce = 0,
    className = "",
    ...rest
  } = props;
  const micGate = useMicGate(voiceUiEnabled);
  const { speech, toggleRecording, phase, finalizeCommit } = useLocalAppendDictation(value, onValueChange, {
    onError: onVoiceError,
    disabled: disabled || !micGate,
  });
  const lastDictationNonceRef = useRef(0);
  const fallbackDictationRef = useRef<VoiceDictationControl | null>(null);
  const dControlRef = dictationControlRef ?? fallbackDictationRef;

  useImperativeHandle(
    dControlRef,
    () => ({
      finalizeDictation: () => finalizeCommit(),
    }),
    [finalizeCommit],
  );

  useEffect(() => {
    const n = dictationStartNonce ?? 0;
    if (n <= 0 || n === lastDictationNonceRef.current) return;
    lastDictationNonceRef.current = n;
    if (disabled || !micGate || !speech.isSupported || speech.isListening) return;
    toggleRecording();
  }, [dictationStartNonce, disabled, micGate, speech.isListening, speech.isSupported, toggleRecording]);

  useEffect(() => {
    const busy = speech.isListening || speech.awaitingRecognitionEnd;
    onDictationActiveChange?.(busy);
  }, [speech.isListening, speech.awaitingRecognitionEnd, onDictationActiveChange]);

  useEffect(() => {
    onDictationPhaseChange?.(phase);
  }, [phase, onDictationPhaseChange]);

  return (
    <div className={`relative ${wrapperClassName ?? ""}`.trim()}>
      <textarea
        {...rest}
        ref={ref}
        disabled={disabled}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`peer ${className}`.trim()}
      />
      <HeroVoiceInputBar
        enabled={micGate}
        isSupported={speech.isSupported}
        phase={phase}
        onToggle={toggleRecording}
        recordingTimerLabel={speech.elapsedLabel}
        maxRecordingLabel={MAX_SPEECH_MMSS}
        surface={surface}
        subtleIdle={voiceSubtleIdle}
        idleAttract={micIdleAttract}
      />
    </div>
  );
});

export function VoiceAugmentedInput(
  props: VoiceChrome &
    Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "disabled">
) {
  const {
    value,
    onValueChange,
    voiceUiEnabled,
    surface = "dark",
    disabled = false,
    onVoiceError,
    onDictationActiveChange,
    onDictationPhaseChange,
    dictationControlRef,
    wrapperClassName,
    voiceSubtleIdle = true,
    micIdleAttract = false,
    dictationStartNonce = 0,
    className = "",
    ...rest
  } = props;
  const micGate = useMicGate(voiceUiEnabled);
  const { speech, toggleRecording, phase, finalizeCommit } = useLocalAppendDictation(value, onValueChange, {
    onError: onVoiceError,
    disabled: disabled || !micGate,
  });
  const lastDictationNonceRef = useRef(0);
  const fallbackDictationRef = useRef<VoiceDictationControl | null>(null);
  const dControlRef = dictationControlRef ?? fallbackDictationRef;

  useImperativeHandle(
    dControlRef,
    () => ({
      finalizeDictation: () => finalizeCommit(),
    }),
    [finalizeCommit],
  );

  useEffect(() => {
    const n = dictationStartNonce ?? 0;
    if (n <= 0 || n === lastDictationNonceRef.current) return;
    lastDictationNonceRef.current = n;
    if (disabled || !micGate || !speech.isSupported || speech.isListening) return;
    toggleRecording();
  }, [dictationStartNonce, disabled, micGate, speech.isListening, speech.isSupported, toggleRecording]);

  useEffect(() => {
    const busy = speech.isListening || speech.awaitingRecognitionEnd;
    onDictationActiveChange?.(busy);
  }, [speech.isListening, speech.awaitingRecognitionEnd, onDictationActiveChange]);

  useEffect(() => {
    onDictationPhaseChange?.(phase);
  }, [phase, onDictationPhaseChange]);

  return (
    <div className={`relative ${wrapperClassName ?? ""}`.trim()}>
      <input
        {...rest}
        disabled={disabled}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`peer ${className}`.trim()}
      />
      <HeroVoiceInputBar
        enabled={micGate}
        isSupported={speech.isSupported}
        phase={phase}
        onToggle={toggleRecording}
        recordingTimerLabel={speech.elapsedLabel}
        maxRecordingLabel={MAX_SPEECH_MMSS}
        surface={surface}
        subtleIdle={voiceSubtleIdle}
        idleAttract={micIdleAttract}
      />
    </div>
  );
}
