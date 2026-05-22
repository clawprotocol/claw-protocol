/**
 * Guided Pro finalize modal — visible progress while answers apply and signing version prepares.
 */

export type GuidedFinalizeModalStage =
  | "applying_answers"
  | "adding_signer_details"
  | "preparing_final_review"
  | "ready_for_signing";

export const GUIDED_FINALIZE_MODAL_TITLE = "Applying your answers";
export const GUIDED_FINALIZE_MODAL_BODY =
  "LawDog is updating your Pro agreement and preparing the signing version. Nothing is sent until you confirm.";

const STAGE_LABELS: Record<GuidedFinalizeModalStage, string> = {
  applying_answers: "Applying your answers",
  adding_signer_details: "Adding signer details",
  preparing_final_review: "Preparing final review",
  ready_for_signing: "Ready for signing",
};

const STAGE_ORDER: readonly GuidedFinalizeModalStage[] = [
  "applying_answers",
  "adding_signer_details",
  "preparing_final_review",
  "ready_for_signing",
];

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

export type GuidedFinalizeModalProps = {
  stage: GuidedFinalizeModalStage;
  className?: string;
};

export function GuidedFinalizeModal({ stage, className = "" }: GuidedFinalizeModalProps) {
  const activeIndex = STAGE_ORDER.indexOf(stage);
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
          {GUIDED_FINALIZE_MODAL_TITLE}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{GUIDED_FINALIZE_MODAL_BODY}</p>
        <ol className="mt-6 space-y-2.5" aria-label="Finalize progress">
          {STAGE_ORDER.map((s, i) => {
            const done = i < activeIndex;
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
        <p className="mt-6 text-xs text-slate-400" role="status" aria-live="polite">
          {guidedFinalizeStageLabel(stage)}…
        </p>
      </div>
    </div>
  );
}
