/**
 * Guided Pro finalize modal — visible progress while answers apply and signing version prepares.
 */

import type { GuidedFinalizeModalBlockedKind } from "./guidedSignerSetupToFinalReview";

export type GuidedFinalizeModalStage =
  | "applying_answers"
  | "preparing_final_agreement"
  | "finalizing_agreement"
  | "adding_signer_details"
  | "preparing_final_signing_version"
  | "preparing_signing_links"
  | "adding_signature_fields"
  | "signing_packet_ready"
  | "ready_to_sign"
  | "blocked";

export const GUIDED_FINALIZE_MODAL_TITLE = "Preparing your final agreement";
export const GUIDED_FINALIZE_MODAL_BODY =
  "LawDog is updating your Pro agreement with your signer details. Nothing is sent until you confirm.";

export const GUIDED_FINALIZE_IN_FLIGHT_TITLE = "Finalizing your agreement…";
export const GUIDED_FINALIZE_IN_FLIGHT_BODY =
  "Applying your answers and signer details. This usually takes a few seconds.";

export const GUIDED_SIGNING_TRACK_MODAL_TITLE = "Preparing signing links";
export const GUIDED_SIGNING_TRACK_MODAL_BODY =
  "LawDog is building your signing packet and placing signature fields. Nothing is sent until you confirm.";

const STAGE_LABELS: Record<GuidedFinalizeModalStage, string> = {
  applying_answers: "Applying your answers",
  preparing_final_agreement: "Preparing your final agreement",
  finalizing_agreement: "Finalizing your agreement",
  adding_signer_details: "Adding signer details",
  preparing_final_signing_version: "Preparing final signing version",
  preparing_signing_links: "Preparing signing links",
  adding_signature_fields: "Adding signature fields",
  signing_packet_ready: "Signing packet ready",
  ready_to_sign: "Ready to sign",
  blocked: "Needs your attention",
};

export type GuidedFinalizeModalBlockedPresentation = {
  kind: GuidedFinalizeModalBlockedKind;
  headline: string;
  body: string;
  ctaLabel: string | null;
  footnote: string;
};

const STAGE_ORDER: readonly GuidedFinalizeModalStage[] = [
  "applying_answers",
  "preparing_final_agreement",
  "finalizing_agreement",
  "adding_signer_details",
  "preparing_final_signing_version",
  "preparing_signing_links",
  "adding_signature_fields",
  "signing_packet_ready",
  "ready_to_sign",
];

export function guidedFinalizeModalUsesInFlightCopy(stage: GuidedFinalizeModalStage): boolean {
  return (
    stage === "applying_answers" ||
    stage === "preparing_final_agreement" ||
    stage === "finalizing_agreement" ||
    stage === "adding_signer_details" ||
    stage === "preparing_final_signing_version"
  );
}

export function guidedFinalizeModalUsesSigningTrackCopy(stage: GuidedFinalizeModalStage): boolean {
  return (
    stage === "preparing_signing_links" ||
    stage === "adding_signature_fields" ||
    stage === "signing_packet_ready"
  );
}

export function guidedFinalizeStageLabel(stage: GuidedFinalizeModalStage): string {
  return STAGE_LABELS[stage];
}

export function logGuidedFinalizeModalEnter(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-finalize-modal-enter]");
}

export function logGuidedFinalizeModalStage(stage: GuidedFinalizeModalStage): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-finalize-modal-stage]", { stage, label: STAGE_LABELS[stage] });
}

export function logGuidedFinalizeModalExit(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-finalize-modal-exit]");
}

/** Skip transient modal flash when handoff completes within this window (ms). */
export const GUIDED_FINALIZE_MODAL_MIN_VISIBLE_MS = 400;

export function shouldShowGuidedFinalizeModalAfterDelay(elapsedMs: number): boolean {
  return elapsedMs >= GUIDED_FINALIZE_MODAL_MIN_VISIBLE_MS;
}

export type GuidedFinalizeModalProps = {
  stage: GuidedFinalizeModalStage;
  blockedMessage?: string | null;
  blockedPresentation?: GuidedFinalizeModalBlockedPresentation | null;
  /** Scroll to signer fields — only for missing signer actions. */
  onDismissBlocked?: () => void;
  /** Re-run finalization — for internal retry actions. */
  onRetryFinalReview?: () => void;
  className?: string;
};

export function GuidedFinalizeModal({
  stage,
  blockedMessage,
  blockedPresentation = null,
  onDismissBlocked,
  onRetryFinalReview,
  className = "",
}: GuidedFinalizeModalProps) {
  const blocked = stage === "blocked";
  const blockedCopy = blockedPresentation ?? {
    kind: "generic" as const,
    headline: STAGE_LABELS.blocked,
    body: blockedMessage || "Complete the highlighted signer field, then try again.",
    ctaLabel: "Edit signer details",
    footnote: "Update signer details below, then continue.",
  };
  const blockedCtaHandler =
    blockedCopy.kind === "signers_needed"
      ? onDismissBlocked
      : blockedCopy.ctaLabel && (blockedCopy.kind === "internal_retry" || blockedCopy.kind === "validation_retry")
        ? onRetryFinalReview ?? onDismissBlocked
        : null;
  const signingTrack = guidedFinalizeModalUsesSigningTrackCopy(stage);
  const inFlight = guidedFinalizeModalUsesInFlightCopy(stage);
  const visibleStages: GuidedFinalizeModalStage[] = signingTrack
    ? ["preparing_signing_links", "adding_signature_fields", "signing_packet_ready"]
    : STAGE_ORDER.filter(
        (s) =>
          s !== "preparing_signing_links" &&
          s !== "adding_signature_fields" &&
          s !== "signing_packet_ready",
      );
  const visibleActiveIndex = signingTrack
    ? visibleStages.indexOf(stage)
    : visibleStages.indexOf(stage);
  return (
    <div
      className={`fixed inset-0 z-[225] flex items-center justify-center bg-[#0a0e18]/92 px-4 backdrop-blur-sm ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="claw-guided-finalize-modal-title"
      data-testid="guided-finalize-modal"
    >
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/25 bg-slate-950/95 p-8 shadow-2xl shadow-black/60 sm:p-10">
        <h2
          id="claw-guided-finalize-modal-title"
          className="font-serif text-xl font-semibold tracking-tight text-white sm:text-2xl"
        >
          {blocked ? blockedCopy.headline : signingTrack ? GUIDED_SIGNING_TRACK_MODAL_TITLE : inFlight ? GUIDED_FINALIZE_IN_FLIGHT_TITLE : GUIDED_FINALIZE_MODAL_TITLE}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {blocked
            ? blockedCopy.body
            : signingTrack
              ? GUIDED_SIGNING_TRACK_MODAL_BODY
              : inFlight
                ? GUIDED_FINALIZE_IN_FLIGHT_BODY
                : GUIDED_FINALIZE_MODAL_BODY}
        </p>
        {!blocked ? (
          <ol className="mt-6 space-y-2.5" aria-label="Finalize progress">
            {visibleStages.map((s, i) => {
              const done = i < visibleActiveIndex;
              const current = s === stage;
              return (
                <li
                  key={s}
                  className={`flex items-center gap-2.5 text-sm ${
                    current ? "font-semibold text-emerald-300" : done ? "text-emerald-600/90" : "text-slate-500"
                  }`}
                  data-testid={`guided-finalize-stage-${s}`}
                  aria-current={current ? "step" : undefined}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      done
                        ? "bg-emerald-700 text-white"
                        : current
                          ? "border-2 border-emerald-400 bg-emerald-950"
                          : "border border-slate-600 bg-slate-900"
                    }`}
                    aria-hidden
                  >
                    {done ? "✓" : current ? "…" : ""}
                  </span>
                  {guidedFinalizeStageLabel(s)}
                </li>
              );
            })}
          </ol>
        ) : null}
        <p className="mt-6 text-xs text-slate-400" role="status" aria-live="polite">
          {blocked ? blockedCopy.footnote : `${guidedFinalizeStageLabel(stage)}…`}
        </p>
        {blocked && blockedCopy.ctaLabel && blockedCtaHandler ? (
          <button
            type="button"
            className="mt-6 w-full rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            data-testid="guided-finalize-modal-dismiss"
            onClick={() => blockedCtaHandler()}
          >
            {blockedCopy.ctaLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
