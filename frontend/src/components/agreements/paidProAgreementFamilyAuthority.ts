/**
 * One authoritative agreement-family decision per Paid Pro run (intake + optional server hint).
 */

import type { AgreementFamily } from "./agreementFamilyRouter";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { mapPremiumFullDraftFamilyHint } from "./premiumFullDraftMapFamily";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type PaidProAgreementFamilyDecisionSource =
  | "intake_detect"
  | "server_hint_mapped"
  | "input_override"
  | "hard_lock";

export type PaidProAgreementFamilyDecision = {
  family: AgreementFamily;
  source: PaidProAgreementFamilyDecisionSource;
  intakeFamily: AgreementFamily;
  serverHintFamily?: AgreementFamily;
};

type CacheEntry = {
  decision: PaidProAgreementFamilyDecision;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(args: {
  traceId?: string | null;
  sessionGenerationId?: string | null;
  intakeFingerprint: string;
}): string {
  return [args.traceId, args.sessionGenerationId, args.intakeFingerprint].filter(Boolean).join("|");
}

export function resolveAuthoritativePaidProAgreementFamily(args: {
  intakeText: string;
  draft?: ParsedDraftShape | null;
  serverFamilyHint?: string | null;
  inputAgreementFamily?: AgreementFamily | null;
  traceId?: string | null;
  sessionGenerationId?: string | null;
  intakeFingerprint: string;
}): PaidProAgreementFamilyDecision {
  const key = cacheKey(args);
  const hit = cache.get(key);
  if (hit) return hit.decision;

  const intake = (args.intakeText || "").trim();
  const intakeFamily = detectAgreementFamily(intake);
  let family: AgreementFamily = intakeFamily;
  let source: PaidProAgreementFamilyDecisionSource = "intake_detect";
  let serverHintFamily: AgreementFamily | undefined;

  if (args.inputAgreementFamily) {
    family = args.inputAgreementFamily;
    source = "input_override";
  } else if (args.serverFamilyHint?.trim()) {
    const mapped = mapPremiumFullDraftFamilyHint(args.serverFamilyHint, intakeFamily);
    if (mapped) {
      serverHintFamily = mapped;
      family = mapped;
      source = "server_hint_mapped";
    }
  }

  if (args.draft?.agreement_family && !args.inputAgreementFamily) {
    const draftFam = args.draft.agreement_family as AgreementFamily;
    if (draftFam === family) {
      source = source === "intake_detect" ? "intake_detect" : source;
    }
  }

  const decision: PaidProAgreementFamilyDecision = {
    family,
    source,
    intakeFamily,
    serverHintFamily,
  };
  cache.set(key, { decision });
  return decision;
}

export function applyAuthoritativeFamilyToDraft(
  draft: ParsedDraftShape,
  decision: PaidProAgreementFamilyDecision,
): ParsedDraftShape {
  return { ...draft, agreement_family: decision.family };
}

export function clearPaidProAgreementFamilyCache(): void {
  cache.clear();
}

export function readPaidProAgreementFamilyCacheSize(): number {
  return cache.size;
}
