/**
 * Canonical LawDog Pro “truth” for the **post-checkout surface** (readonly picker + success strip + CTA gating).
 *
 * Downstream UI must not re-derive premium success, document validity, or signer readiness
 * with ad-hoc `validatePaidProOutput` + `canShowPremiumSuccess` pairings — compose them here.
 *
 * Post-apply / pipeline handoff still uses `isPaidProFinishedAgreement` in `paidProCorpusAcceptance.ts`
 * (includes server-coherent readonly overrides). That function shares the same validators underneath.
 */
import type { AgreementIntentContract } from "./agreementIntentContract";
import type { AgreementValidationResult } from "./premiumFullDraftApi";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PipelineProSourceString } from "./paidProCorpusAcceptance";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { canShowPremiumSuccess, type PremiumSuccessGateResult } from "./premiumSuccessGate";

export type { PremiumSuccessGateResult, PremiumOutputState } from "./premiumSuccessGate";

/** Single point-in-time result: corpus validation + display/gating gate. */
export type ProTruthSnapshot = {
  validation: { ok: boolean; reasons: string[] };
  gate: PremiumSuccessGateResult;
};

export type ProTruthSurfaceInput = {
  intentContract: AgreementIntentContract;
  documentText: string;
  /** Resolved tier from `resolvePremiumRenderSource` / picker. */
  renderSource: PremiumRenderResolveSource | string;
  premiumPipelineSource: PipelineProSourceString | string | null | undefined;
  intakeText: string;
  draft: ParsedDraftShape | null;
  qualityRetryActive: boolean;
  serverGenerationDegraded: boolean;
  /**
   * AgreementBuilder passes `hasUsablePaidBody` (persisted + length) to allow substantive stitch escape hatches;
   * keep in sync with that hook only.
   */
  allowPaidSubstantiveStitch: boolean;
  stale: boolean;
};

/**
 * One pass: `validatePaidProOutput` then `canShowPremiumSuccess` with the same document + contract context.
 * Use for the premium surface, not for pipeline `isPaidProFinishedAgreement` (which adds pipeline overrides).
 */
export function computeProTruthSurface(input: ProTruthSurfaceInput): ProTruthSnapshot {
  const t = String(input.documentText || "").trim();
  if (!t) {
    const validation = { ok: false, reasons: ["empty_readonly_paid_corpus"] as string[] };
    const gate = canShowPremiumSuccess({
      intentContract: input.intentContract,
      renderSource: input.renderSource,
      validation,
      documentText: "",
      intakeText: input.intakeText,
      premiumPipelineSource: input.premiumPipelineSource,
      stale: input.stale,
      draft: input.draft,
      qualityRetryActive: input.qualityRetryActive,
      serverGenerationDegraded: input.serverGenerationDegraded,
      allowPaidSubstantiveStitch: false,
    });
    return { validation, gate };
  }
  const validation = validatePaidProOutput({
    text: t,
    rawIntake: input.intakeText,
    draft: input.draft,
    intentContract: input.intentContract,
    premiumPipelineSource: input.premiumPipelineSource,
  });
  const gate = canShowPremiumSuccess({
    intentContract: input.intentContract,
    renderSource: input.renderSource,
    validation,
    documentText: t,
    intakeText: input.intakeText,
    premiumPipelineSource: input.premiumPipelineSource,
    stale: input.stale,
    draft: input.draft,
    qualityRetryActive: input.qualityRetryActive,
    serverGenerationDegraded: input.serverGenerationDegraded,
    allowPaidSubstantiveStitch: input.allowPaidSubstantiveStitch,
  });
  return { validation, gate };
}

/** Shorthand for readonly / snapshot text checks (picker, session return). Forwards to `validatePaidProOutput`. */
export function validateProTruthReadonlyText(
  args: {
    text: string;
    rawIntake: string;
    intentContract: AgreementIntentContract;
    draft: ParsedDraftShape | null;
    premiumPipelineSource?: PipelineProSourceString | string | null;
    agreementValidation?: AgreementValidationResult | null;
  },
): { ok: boolean; reasons: string[] } {
  return validatePaidProOutput(args);
}

export function proTruthIsPremiumDocumentReady(s: ProTruthSnapshot | null): boolean {
  if (!s) return false;
  return s.gate.state === "premium_success" && s.validation.ok;
}

export function proTruthIsSignerCtaOpen(s: ProTruthSnapshot | null): boolean {
  return Boolean(s?.gate.signerCtaAllowed);
}
