/**
 * Confidence-based intake clarification: only block draft generation for materially
 * ambiguous legal fields (Tier 3). High/medium-confidence metadata is inferred before
 * generation and can be edited later in review.
 */
import { detectAgreementFamily, type AgreementFamily } from "./agreementFamilyRouter";
import {
  explicitIntentCanonicalTitle,
  isGenericOrEmptyTitle,
  normalizeAgreementDisplayTitle,
  resolveCanonicalAgreementTitle,
} from "./canonicalAgreementTitle";
import { hasAtLeastTwoParties, paymentCompletionMet } from "./intakeConfidenceScore";
import { applySimpleFlowSmartDefaults, type ParsedDraftShape } from "./intakeSmartDefaults";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import { extractBetweenPartyNameList, extractBetweenPartyPair } from "./partyBetweenParse";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { stripSignerInstructionClausesFromIntake } from "./intakeSignerInstructionParse";
import { isLikelyHumanSignerName } from "./intakeSignerMetadataAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

export type IntakeBlockingField =
  | "title"
  | "jurisdiction"
  | "parties"
  | "purpose"
  | "payment_terms"
  | "duration"
  | "effective_date";

export type IntakeFieldConfidenceTier = 1 | 2 | 3;

const PLACEHOLDER_PARTY_RE = /^party\s+(?:[a-d]|[1-4])\b/i;
const ROLE_ONLY_PARTY_NAME_RE =
  /^(?:the\s+)?(?:client|customer|service\s+provider|provider|vendor|contractor|consultant|supplier|buyer|seller|licensor|licensee|landlord|tenant|borrower|lender|company|business)$/i;

/**
 * High-confidence title from imperative intake ("Draft a Professional Services Agreement…").
 */
export function extractDraftIntentAgreementTitle(intakeText: string): string | null {
  const raw = (intakeText || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const m =
    raw.match(
      /\b(?:draft|create|prepare|generate|write|need|want|build)\s+(?:a|an|the|me)?\s+((?:[A-Za-z][\w'&./-]*(?:\s+(?:&|and|of|for|\/|[A-Za-z][\w'&./-]*)){0,10})\s+Agreement)\b/i,
    ) ??
    raw.match(
      /\b(?:draft|create|prepare|generate|write|need|want|build)\s+(?:a|an|the|me)?\s+((?:[A-Za-z][\w'&./-]*(?:\s+(?:&|and|of|for|\/|[A-Za-z][\w'&./-]*)){0,10})\s+Contract)\b/i,
    );
  if (!m?.[1]) return null;
  const title = normalizeAgreementDisplayTitle(m[1].trim());
  if (!title || isGenericOrEmptyTitle(title)) return null;
  return title;
}

export function agreementTitleInferenceTier(
  intakeText: string,
  parsed: ParsedDraftShape,
): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  if (extractDraftIntentAgreementTitle(intake)) return 1;
  if (explicitIntentCanonicalTitle(intake)) return 1;
  const current = (parsed.title || "").trim();
  if (current && !isGenericOrEmptyTitle(current, parsed.agreement_family)) return 1;
  const live = buildLiveDraftPreview(intake);
  const family = (parsed.agreement_family ?? detectAgreementFamily(intake)) as AgreementFamily;
  const resolved = resolveCanonicalAgreementTitle({
    currentTitle: parsed.title,
    liveDocTitle: live.docTitle,
    family,
    intakeText: intake,
  });
  if (resolved.source === "preserved" || resolved.source === "explicit-intent") return 1;
  if (resolved.source === "live" || resolved.source === "advisor" || resolved.source === "nda-mutual") return 1;
  if (resolved.source === "family" && !isGenericOrEmptyTitle(resolved.title, family)) return 2;
  if (live.docTitle && !isGenericOrEmptyTitle(live.docTitle, family)) return 2;
  return 3;
}

export function partiesInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = stripSignerInstructionClausesFromIntake(intakeText || "");
  const structured = parseIntakeToStructuredAgreement(intake);
  if (extractBetweenPartyPair(intake)) return 1;
  const between = extractBetweenPartyNameList(intake).filter(isIdentifiedContractingPartyName);
  if (between.length >= 2) return 1;
  if (
    !structured.partiesUncertain &&
    structured.parties.filter(isIdentifiedContractingPartyName).length >= 2
  ) {
    return 1;
  }
  const inferred = tryInferNamedPartiesFromIntake(intake) || [];
  if (inferred.filter((p) => isIdentifiedContractingPartyName(String(p?.name || ""))).length >= 2) {
    return 1;
  }
  if (identifiedContractingPartyCount(parsed.parties) >= 2) return 1;
  if (hasAtLeastTwoParties(intake, buildLiveDraftPreview(intake))) return 2;
  return 3;
}

function isRoleOrPlaceholderPartyName(name: string): boolean {
  const t = String(name || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  return PLACEHOLDER_PARTY_RE.test(t) || ROLE_ONLY_PARTY_NAME_RE.test(t);
}

function isIdentifiedContractingPartyName(name: string): boolean {
  const t = String(name || "").replace(/\s+/g, " ").trim();
  if (!t || isRoleOrPlaceholderPartyName(t)) return false;
  if (isAuthoritativeLegalEntityName(t) || isLikelyHumanSignerName(t)) return true;
  return t.length >= 2 && /[A-Za-z]/.test(t) && !/^(?:the\s+)?parties?$/i.test(t);
}

function identifiedContractingPartyCount(parties: ParsedDraftShape["parties"]): number {
  return (parties || []).filter((p) => isIdentifiedContractingPartyName(String(p?.name || ""))).length;
}

function partiesLookLikePlaceholders(parties: ParsedDraftShape["parties"]): boolean {
  const names = (parties || []).map((p) => String(p?.name || "").trim()).filter(Boolean);
  if (names.length < 2) return true;
  return names.every((n) => isRoleOrPlaceholderPartyName(n));
}

/** Two real legal or human names — role labels such as Client / Party A do not count. */
export function hasIdentifiedContractingParties(
  parsed: ParsedDraftShape,
  intakeText: string,
): boolean {
  const intake = stripSignerInstructionClausesFromIntake(intakeText || "");
  if (extractBetweenPartyPair(intake)) return true;
  const between = extractBetweenPartyNameList(intake).filter(isIdentifiedContractingPartyName);
  if (between.length >= 2) return true;
  const structured = parseIntakeToStructuredAgreement(intake);
  if (
    !structured.partiesUncertain &&
    structured.parties.filter(isIdentifiedContractingPartyName).length >= 2
  ) {
    return true;
  }
  const inferred = tryInferNamedPartiesFromIntake(intake) || [];
  if (inferred.filter((p) => isIdentifiedContractingPartyName(String(p?.name || ""))).length >= 2) {
    return true;
  }
  return identifiedContractingPartyCount(parsed.parties) >= 2;
}

export function purposeInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  if ((parsed.purpose || "").trim().length >= 12) return 1;
  const structured = parseIntakeToStructuredAgreement(intake);
  if (structured.scope.trim().length >= 12) return 1;
  const live = buildLiveDraftPreview(intake);
  const scope = (live.scopeLine || live.servicesLine || "").trim();
  if (scope.length >= 12) return 1;
  if (structured.scopeSignalPresent || live.extraction?.scopeSignalPresent) return 2;
  if (/\b(?:scope|services?|deliverables?|work|duties|obligations)\b/i.test(intake)) return 2;
  return 3;
}

export function paymentInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  if ((parsed.payment_terms || "").trim().length >= 4) return 1;
  if (paymentCompletionMet(intake, buildLiveDraftPreview(intake))) return 1;
  const structured = parseIntakeToStructuredAgreement(intake);
  if (structured.payment.trim().length >= 4) return 1;
  if (/\b(?:no\s+payment|pro\s+bono|unpaid|without\s+compensation)\b/i.test(intake)) return 2;
  return 2;
}

export function jurisdictionInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  const j = (parsed.jurisdiction || "").trim();
  if (j && j.toLowerCase() !== "tbd") return 1;
  const structured = parseIntakeToStructuredAgreement(intake);
  if (structured.governing_law.trim()) return structured.governingLawConfidence >= 0.8 ? 1 : 2;
  if (/\b(?:governing\s+law|jurisdiction|laws?\s+of|delaware|new\s+york|california|texas)\b/i.test(intake)) return 2;
  return 2;
}

export function durationInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  if ((parsed.duration || "").trim() || (parsed.due_date || "").trim()) return 1;
  const structured = parseIntakeToStructuredAgreement(intake);
  if (structured.term.trim()) return 1;
  const live = buildLiveDraftPreview(intake);
  if ((live.termLine || live.scheduleLine || "").trim()) return 1;
  if (/\b(?:term|duration|\d+\s*(?:month|year|week|day)s?)\b/i.test(intake)) return 2;
  return 2;
}

export function effectiveDateInferenceTier(intakeText: string, parsed: ParsedDraftShape): IntakeFieldConfidenceTier {
  const intake = (intakeText || "").trim();
  if ((parsed.effective_date || "").trim()) return 1;
  if (/\b(?:effective|as\s+of|commenc(?:e|ing)|start(?:ing)?\s+date|upon\s+(?:execution|signing))\b/i.test(intake)) {
    return 2;
  }
  return 2;
}

export function fieldInferenceTier(
  field: IntakeBlockingField,
  intakeText: string,
  parsed: ParsedDraftShape,
): IntakeFieldConfidenceTier {
  switch (field) {
    case "title":
      return agreementTitleInferenceTier(intakeText, parsed);
    case "parties":
      return partiesInferenceTier(intakeText, parsed);
    case "purpose":
      return purposeInferenceTier(intakeText, parsed);
    case "payment_terms":
      return paymentInferenceTier(intakeText, parsed);
    case "jurisdiction":
      return jurisdictionInferenceTier(intakeText, parsed);
    case "duration":
      return durationInferenceTier(intakeText, parsed);
    case "effective_date":
      return effectiveDateInferenceTier(intakeText, parsed);
    default:
      return 3;
  }
}

function isFieldMissing(field: IntakeBlockingField, parsed: ParsedDraftShape): boolean {
  switch (field) {
    case "title":
      return !(parsed.title || "").trim();
    case "jurisdiction":
      return !(parsed.jurisdiction || "").trim() || (parsed.jurisdiction || "").trim().toLowerCase() === "tbd";
    case "parties":
      return identifiedContractingPartyCount(parsed.parties) < 2;
    case "purpose":
      return !(parsed.purpose || "").trim();
    case "payment_terms":
      return !(parsed.payment_terms || "").trim();
    case "duration":
      return !(parsed.duration || "").trim() && !(parsed.due_date || "").trim();
    case "effective_date":
      return !(parsed.effective_date || "").trim();
    default:
      return true;
  }
}

function recommendedMissingFields(parsed: ParsedDraftShape): IntakeBlockingField[] {
  const fam = parsed.agreement_family;
  if (fam === "operating_agreement" || fam === "nda") {
    const out: IntakeBlockingField[] = [];
    if (isFieldMissing("title", parsed)) out.push("title");
    if (isFieldMissing("jurisdiction", parsed)) out.push("jurisdiction");
    if (isFieldMissing("parties", parsed)) out.push("parties");
    if (isFieldMissing("purpose", parsed)) out.push("purpose");
    return out;
  }
  if (fam === "generic_business_agreement") {
    const out: IntakeBlockingField[] = [];
    if (isFieldMissing("title", parsed)) out.push("title");
    if (isFieldMissing("jurisdiction", parsed)) out.push("jurisdiction");
    if (isFieldMissing("parties", parsed)) out.push("parties");
    if (isFieldMissing("purpose", parsed)) out.push("purpose");
    if (isFieldMissing("duration", parsed)) out.push("duration");
    if (isFieldMissing("effective_date", parsed)) out.push("effective_date");
    return out;
  }
  const out: IntakeBlockingField[] = [];
  if (isFieldMissing("title", parsed)) out.push("title");
  if (isFieldMissing("jurisdiction", parsed)) out.push("jurisdiction");
  if (isFieldMissing("parties", parsed)) out.push("parties");
  if (isFieldMissing("purpose", parsed)) out.push("purpose");
  if (isFieldMissing("payment_terms", parsed)) out.push("payment_terms");
  if (isFieldMissing("duration", parsed)) out.push("duration");
  if (isFieldMissing("effective_date", parsed)) out.push("effective_date");
  return out;
}

/**
 * Tier-3 blocking gaps only — call after {@link applyPreGenerationIntakeDefaults}.
 */
export function computeBlockingIntakeGaps(
  parsed: ParsedDraftShape,
  intakeText: string,
): IntakeBlockingField[] {
  const blocking: IntakeBlockingField[] = ["parties", "purpose"];
  return blocking.filter((field) => {
    if (field === "parties") {
      return !hasIdentifiedContractingParties(parsed, intakeText);
    }
    return fieldInferenceTier(field, intakeText, parsed) >= 3 && isFieldMissing(field, parsed);
  });
}

/** Non-blocking recommended gaps — at most three, never a generation failure. */
export function computeRecommendedIntakeGaps(
  parsed: ParsedDraftShape,
  _intakeText: string,
): IntakeBlockingField[] {
  return recommendedMissingFields(parsed)
    .filter((field) => field !== "parties" && field !== "purpose")
    .slice(0, 3);
}

/**
 * Infer high/medium-confidence metadata before draft generation.
 * Does not inject placeholder parties when party inference is Tier 3.
 */
export function applyPreGenerationIntakeDefaults(
  parsed: ParsedDraftShape,
  intakeText: string,
): ParsedDraftShape {
  const intake = (intakeText || "").trim();
  let next: ParsedDraftShape = { ...parsed };
  const draftTitle = extractDraftIntentAgreementTitle(intake);
  if (draftTitle) {
    next.title = draftTitle;
  }
  const partiesBeforeDefaults = [...(next.parties || [])];
  next = applySimpleFlowSmartDefaults(next, intake);
  if (
    !hasIdentifiedContractingParties({ ...next, parties: partiesBeforeDefaults }, intake) &&
    partiesLookLikePlaceholders(next.parties)
  ) {
    next = { ...next, parties: [] };
  }
  return next;
}

export function prepareParsedDraftForIntakeGeneration(
  parsed: ParsedDraftShape,
  intakeText: string,
): { draft: ParsedDraftShape; blockingGaps: IntakeBlockingField[] } {
  const draft = applyPreGenerationIntakeDefaults(parsed, intakeText);
  return {
    draft,
    blockingGaps: computeBlockingIntakeGaps(draft, intakeText),
  };
}
