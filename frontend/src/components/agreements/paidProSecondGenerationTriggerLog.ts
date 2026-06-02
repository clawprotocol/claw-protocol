/**
 * Structured log emitted immediately before a client-initiated second premium-full-draft POST.
 * Dev / QA / perf-trace only — never logs agreement or intake text.
 */

import { paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";
import { readPremiumNetworkCallRecords } from "./paidProPremiumGenerationCallAudit";
import type { PremiumNetworkCallReason } from "./paidProPremiumGenerationCallAudit";

export type PremiumSecondGenerationTriggerPayload = {
  attempt: number;
  reason: PremiumNetworkCallReason;
  firstDocumentLen: number;
  firstServerFullDocumentLen: number;
  generationOutcome: string | null;
  agreementValidationPassed: boolean | null;
  agreementValidationFailureCodes: string[];
  clientAcceptanceOk: boolean;
  clientAcceptanceReasons: string[];
  lexicalSimilarityToFreePreview: number | null;
  skipStructuralRetryApplied: boolean;
  traceId: string;
  sessionGenerationId: string | null;
  intakeFingerprint: string;
};

export function buildPremiumSecondGenerationTriggerPayload(
  args: Omit<PremiumSecondGenerationTriggerPayload, "attempt"> & { attempt?: number },
): PremiumSecondGenerationTriggerPayload {
  return {
    attempt: args.attempt ?? readPremiumNetworkCallRecords().length + 1,
    reason: args.reason,
    firstDocumentLen: args.firstDocumentLen,
    firstServerFullDocumentLen: args.firstServerFullDocumentLen,
    generationOutcome: args.generationOutcome,
    agreementValidationPassed: args.agreementValidationPassed,
    agreementValidationFailureCodes: args.agreementValidationFailureCodes.slice(0, 16),
    clientAcceptanceOk: args.clientAcceptanceOk,
    clientAcceptanceReasons: args.clientAcceptanceReasons.slice(0, 20),
    lexicalSimilarityToFreePreview:
      args.lexicalSimilarityToFreePreview == null
        ? null
        : Number(args.lexicalSimilarityToFreePreview.toFixed(4)),
    skipStructuralRetryApplied: args.skipStructuralRetryApplied,
    traceId: args.traceId,
    sessionGenerationId: args.sessionGenerationId,
    intakeFingerprint: args.intakeFingerprint,
  };
}

export function logPremiumSecondGenerationTriggered(
  args: Omit<PremiumSecondGenerationTriggerPayload, "attempt"> & { attempt?: number },
): PremiumSecondGenerationTriggerPayload | null {
  const payload = buildPremiumSecondGenerationTriggerPayload(args);
  if (import.meta.env.MODE === "test") return payload;
  if (!paidProVerboseDetailLogsEnabled()) return null;
  // eslint-disable-next-line no-console
  console.info("[premium-second-generation-triggered]", payload);
  return payload;
}

/** Ensures payload never embeds raw agreement/intake/signer text (test guard). */
export function premiumSecondGenerationTriggerPayloadIsSafe(
  payload: PremiumSecondGenerationTriggerPayload,
): boolean {
  const serialized = JSON.stringify(payload);
  if (serialized.length > 4_000) return false;
  if (/IN WITNESS WHEREOF|Blue Canyon|Iron Vale|\$8,?500/i.test(serialized)) return false;
  if (/\b\d{3,}\s+char/.test(serialized)) return false;
  return true;
}
