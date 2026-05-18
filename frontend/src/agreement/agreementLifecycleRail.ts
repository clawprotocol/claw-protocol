/**
 * Universal agreement lifecycle for persistent page rails (create, review, send, proof).
 * Transient checkout/wait UI may use other steppers — never mix those into this model.
 */

export const AGREEMENT_LIFECYCLE_STAGES = ["draft", "review", "sign", "proof"] as const;

export type AgreementLifecycleStageId = (typeof AGREEMENT_LIFECYCLE_STAGES)[number];

/** Display labels — title case in UI, stable semantics everywhere. */
export const AGREEMENT_LIFECYCLE_PROGRESS_LABELS = ["Draft", "Review", "Sign", "Proof"] as const;

export type AgreementLifecycleProgressStep = 1 | 2 | 3 | 4;

export const AGREEMENT_LIFECYCLE_CONTROL_LINE =
  "Nothing is sent or signed until you choose the next step.";

export function lifecycleStepForStage(stage: AgreementLifecycleStageId): AgreementLifecycleProgressStep {
  switch (stage) {
    case "draft":
      return 1;
    case "review":
      return 2;
    case "sign":
      return 3;
    case "proof":
      return 4;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function lifecycleStageLabel(stage: AgreementLifecycleStageId): string {
  const idx = AGREEMENT_LIFECYCLE_STAGES.indexOf(stage);
  return AGREEMENT_LIFECYCLE_PROGRESS_LABELS[idx] ?? "Draft";
}
