export type VoiceResultHandler = (text: string) => void;
export type VoiceErrorHandler = (message: string) => void;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

let recognition: SpeechRecognitionLike | null = null;

function getCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isVoiceIntakeSupported(): boolean {
  return Boolean(getCtor());
}

export function startVoiceIntake(onText: VoiceResultHandler, onError?: VoiceErrorHandler): boolean {
  const Ctor = getCtor();
  if (!Ctor) {
    onError?.("Voice dictation is not supported in this browser.");
    return false;
  }
  if (!recognition) {
    recognition = new Ctor();
  }
  const rec = recognition;
  if (!rec) {
    onError?.("Voice dictation is not supported in this browser.");
    return false;
  }
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (event: any) => {
    const transcript = event?.results?.[0]?.[0]?.transcript;
    if (typeof transcript === "string" && transcript.trim()) {
      onText(transcript.trim());
    }
  };
  rec.onerror = (event: any) => {
    onError?.(String(event?.error || "dictation_error"));
  };
  rec.start();
  return true;
}

export function stopVoiceIntake(): void {
  if (!recognition) return;
  recognition.stop();
}
