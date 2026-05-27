import type {
  AgreementValidationResult,
  PremiumFinalizationClarificationAnswer,
  PremiumFinalizationReason,
  PremiumFinalizationResult,
} from "./premiumFullDraftApi";
import type { ProClarificationRoutingState } from "./proClarificationRouting";
import type { GuidedCompletionSession } from "./guidedDealCompletion/types";

export const PREMIUM_FINALIZATION_REPAIR_NEEDED_MESSAGE =
  "This draft needs another quality pass before signing.";

export type PremiumFinalizationDecision =
  | {
      shouldFinalize: false;
      reason: "not_needed" | "loop_guard";
      signature: string;
      clarificationAnswers: PremiumFinalizationClarificationAnswer[];
    }
  | {
      shouldFinalize: true;
      reason: Exclude<PremiumFinalizationReason, "not_needed">;
      signature: string;
      clarificationAnswers: PremiumFinalizationClarificationAnswer[];
    };

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`)
    .join(",")}}`;
}

export function buildPremiumFinalizationClarificationAnswers(
  session: GuidedCompletionSession | null | undefined,
): PremiumFinalizationClarificationAnswer[] {
  if (!session) return [];
  const out: PremiumFinalizationClarificationAnswer[] = [];
  for (const variable of session.variables) {
    const answer = normalizeText(session.answered[variable.id]);
    if (!answer) continue;
    out.push({
        question_id: variable.id,
        question: variable.question,
        answer,
    });
  }
  return out;
}

export function buildPremiumFinalizationInputSignature(args: {
  firstDraft: string;
  agreementValidation?: AgreementValidationResult | null;
  clarificationAnswers?: readonly PremiumFinalizationClarificationAnswer[];
  forceFinalize?: boolean;
}): string {
  const validation = args.agreementValidation;
  const payload = {
    draftHash: hashString(args.firstDraft || ""),
    draftLen: (args.firstDraft || "").length,
    validationPassed: validation?.passed ?? null,
    validationFailures: (validation?.failures ?? []).map((f) => f.code).sort(),
    validationFailureCount: validation?.summary?.failure_count ?? null,
    clarificationAnswers: args.clarificationAnswers ?? [],
    forceFinalize: Boolean(args.forceFinalize),
  };
  return `${payload.draftLen}:${hashString(stableJson(payload))}`;
}

export function resolvePremiumFinalizationDecision(args: {
  routing: ProClarificationRoutingState | null;
  agreementValidation?: AgreementValidationResult | null;
  session?: GuidedCompletionSession | null;
  firstDraft: string;
  previousSignature?: string | null;
  forceFinalize?: boolean;
}): PremiumFinalizationDecision {
  const clarificationAnswers = buildPremiumFinalizationClarificationAnswers(args.session);
  const signature = buildPremiumFinalizationInputSignature({
    firstDraft: args.firstDraft,
    agreementValidation: args.agreementValidation,
    clarificationAnswers,
    forceFinalize: args.forceFinalize,
  });

  if (args.previousSignature && args.previousSignature === signature) {
    return { shouldFinalize: false, reason: "loop_guard", signature, clarificationAnswers };
  }
  if (args.forceFinalize) {
    return { shouldFinalize: true, reason: "forced", signature, clarificationAnswers };
  }
  if (args.agreementValidation?.passed === false) {
    return { shouldFinalize: true, reason: "validation_failed", signature, clarificationAnswers };
  }
  if (clarificationAnswers.length > 0 && args.routing?.mode === "material_questions") {
    return { shouldFinalize: true, reason: "clarifications_answered", signature, clarificationAnswers };
  }
  return { shouldFinalize: false, reason: "not_needed", signature, clarificationAnswers };
}

export function premiumFinalizationAllowsSigning(result: PremiumFinalizationResult): boolean {
  return (
    result.repair_succeeded === true &&
    result.agreement_validation?.passed === true &&
    (result.document_text || "").trim().length >= 200
  );
}

