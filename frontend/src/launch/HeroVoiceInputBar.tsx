import type { HeroDictationPhase } from "./useHeroMediaDictation";

function MicIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5.5-3a5.5 5.5 0 0 1-11 0h-2a7.5 7.5 0 0 0 6.5 7.43V20H8v2h8v-2h-3v1.57A7.5 7.5 0 0 0 20 11h-2.5z"
      />
    </svg>
  );
}

function SpinnerIcon(props: { className?: string }) {
  return (
    <svg className={`animate-spin ${props.className ?? ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function HeroVoiceInputBar(props: {
  phase: HeroDictationPhase;
  onToggle: () => void;
  enabled: boolean;
  isSupported: boolean;
  /** e.g. "0:42" while recording */
  recordingTimerLabel?: string;
  /** e.g. "1:30" max segment */
  maxRecordingLabel?: string;
  micTooltip?: string;
  surface?: "dark" | "light";
  /** Softer idle mic until hover / focus-within (paired with peer on the input). */
  subtleIdle?: boolean;
  /** Draw attention to the mic when the UI is asking the next conversational question (idle only). */
  idleAttract?: boolean;
}) {
  const {
    phase,
    onToggle,
    enabled,
    isSupported,
    recordingTimerLabel = "0:00",
    maxRecordingLabel,
    micTooltip = "Speak instead of typing",
    surface = "dark",
    subtleIdle = false,
    idleAttract = false,
  } = props;
  const light = surface === "light";
  if (!enabled || !isSupported) return null;

  const recording = phase === "recording";
  const processing = phase === "processing";
  const label =
    recording ? "Stop voice input" : processing ? "Transcribing…" : "Start voice input";

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-end gap-2 sm:bottom-4 sm:right-4">
      {recording ? (
        <div className="flex flex-col items-end gap-1 rounded-md border border-emerald-700/45 bg-emerald-950/85 px-2.5 py-1.5 text-right shadow-sm sm:px-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95 sm:text-[11px]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Recording…
          </span>
          {maxRecordingLabel ? (
            <span className="font-mono text-[11px] tabular-nums text-emerald-100/90 sm:text-xs">
              {recordingTimerLabel}
              <span className="text-emerald-200/60"> / {maxRecordingLabel}</span>
            </span>
          ) : (
            <span className="font-mono text-[11px] tabular-nums text-emerald-100/80">{recordingTimerLabel}</span>
          )}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!processing) onToggle();
        }}
        disabled={processing}
        aria-label={label}
        title={micTooltip}
        aria-pressed={recording}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2 active:scale-[0.97] sm:h-12 sm:w-12 ${
          light ? "focus-visible:ring-offset-white" : "focus-visible:ring-offset-slate-950"
        } ${
          subtleIdle && !recording && !processing && !idleAttract
            ? "opacity-55 transition-opacity hover:opacity-100 focus-visible:opacity-100 peer-hover:opacity-100"
            : ""
        } ${
          recording
            ? light
              ? "border-emerald-500/70 bg-emerald-50 text-emerald-800 shadow-[0_0_0_4px_rgba(16,185,129,0.2)] animate-pulse"
              : "border-emerald-500/60 bg-emerald-950/50 text-emerald-200 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse"
            : processing
              ? light
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "cursor-not-allowed border-slate-700 bg-slate-900/80 text-slate-500"
              : light
                ? "border-slate-200 bg-white text-teal-700 shadow-sm hover:border-teal-400 hover:bg-teal-50/80"
                : "border-slate-600/80 bg-slate-900/90 text-slate-400 hover:border-emerald-500/50 hover:bg-slate-900 hover:text-emerald-300/95 hover:shadow-[0_0_12px_rgba(16,185,129,0.12)]"
        } ${
          idleAttract && !recording && !processing && !light
            ? "!border-emerald-500/50 !bg-slate-900/95 !text-emerald-200/95 shadow-[0_0_22px_rgba(16,185,129,0.25)] ring-2 ring-emerald-500/35 motion-safe:animate-pulse"
            : ""
        }`}
      >
        {processing ? (
          <>
            <span className="sr-only">Transcribing…</span>
            <SpinnerIcon className="h-5 w-5 text-emerald-400/90" aria-hidden />
          </>
        ) : (
          <MicIcon
            className={`h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem] ${recording ? "text-emerald-200" : light ? "text-teal-700" : ""}`}
          />
        )}
      </button>
    </div>
  );
}
