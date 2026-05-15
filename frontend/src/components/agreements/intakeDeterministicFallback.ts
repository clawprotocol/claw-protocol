/**
 * When parse is thin or times out, fill key draft slots from deterministic patterns on raw intake.
 * Complements server parse — overwrites only empty fields **or** known thin parser stubs when raw
 * intake carries richer labeled clauses (Scope includes… / Total fee… / Term… / Governing law…).
 */
import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function looksLikePaymentPlanMisrouteTitle(t: string): boolean {
  return /^payment\s+plan\b/i.test((t || "").trim());
}

/** Shell titles the basic parser often emits on timeout while explicit intake names another deal type. */
const MISROUTED_SHELL_TITLES = new Set([
  "Payment Plan Agreement",
  "Independent Contractor Agreement",
  "Consulting Agreement",
  "Business Services Agreement",
  "Services Agreement",
]);

/** Purpose strings the structured model uses as category stubs when parse is thin. */
const GENERIC_PURPOSE_STUBS = new Set(
  [
    "software development / technical services",
    "consulting / advisory services",
    "cleaning services",
    "weekly lawn care / property maintenance",
    "scope of work described in this agreement.",
    "marketing and advertising services between the parties.",
  ].map((s) => s.toLowerCase()),
);

export function purposeLooksLikeGenericScopeStub(purpose: string | null | undefined): boolean {
  const p = collapseWs(purpose || "");
  if (!p) return true;
  const low = p.toLowerCase();
  if (GENERIC_PURPOSE_STUBS.has(low)) return true;
  // Slash-separated short category labels without deal-specific anchors.
  if (
    p.length < 56 &&
    /\b(services|consulting|development|technical|advisory|marketing|software)\b/i.test(p) &&
    !/\b(white[-\s]?label|reseller|milestone|deploy|integrat|licen[cs]e|sla|uptime|analytics|api|onboarding)\b/i.test(low)
  ) {
    if (/\/.+\//.test(p)) return false;
    if (/\s\/\s/.test(p) && p.split(/\s\/\s/).every((seg) => seg.length <= 36)) return true;
  }
  return false;
}

export function paymentTermsLookLikeAmountOnlyStub(paymentTerms: string | null | undefined): boolean {
  const t = collapseWs(paymentTerms || "");
  if (!t) return true;
  if (t.length > 52) return false;
  if (/^\$?\s*[\d,]+(?:\.\d{2})?\s*$/i.test(t)) return true;
  if (/^(?:payment|fee|compensation)\s*(?:of|is)?\s*:?\s*\$?\s*[\d,]+(?:\.\d{2})?\s*$/i.test(t)) return true;
  return false;
}

export function durationLooksLikeLengthOnlyStub(duration: string | null | undefined): boolean {
  const t = collapseWs(duration || "");
  if (!t) return true;
  if (t.length > 40) return false;
  if (!/\b(renewal|notice|automatic|month-to-month|convenience|cause)\b/i.test(t)) {
    if (/^\d+\s*(?:day|days|week|weeks|month|months|year|years)\b/i.test(t)) return true;
  }
  return false;
}

function extractScopeIncludes(raw: string): string | null {
  const scopeM =
    /\bscope\s+includes\s+([\s\S]+?)(?:\.(?:\s|$)|(?=\s*total\s+fee\b)|(?=\s*term\b)|(?=\s*governing\s+law\b))/i.exec(
      raw,
    );
  if (!scopeM) return null;
  const s = collapseWs(scopeM[1]);
  return s.length >= 8 ? s : null;
}

function extractTotalFeeClause(raw: string): string | null {
  const stopped = /\btotal\s+fee\s+([\s\S]+?)\.\s*(?:term\b|governing\s+law|include\b)/i.exec(raw);
  if (stopped) return collapseWs(stopped[1]);
  const payM = /\btotal\s+fee\s+([^.\n]+(?:\.[^.\n]+)?)/i.exec(raw);
  if (!payM) return null;
  return collapseWs(payM[1]);
}

function extractTermClause(raw: string): string | null {
  const termM = /\bterm\s+([^.]+?)(?:\.(?:\s|$)|$)/i.exec(raw);
  if (!termM) return null;
  const s = collapseWs(termM[1]);
  return s.length >= 3 ? s : null;
}

function extractGoverningLawClause(raw: string): string | null {
  const lawM = /\bgoverning\s+law\s+([^.]+?)(?:\.(?:\s|$)|$)/i.exec(raw);
  if (!lawM) return null;
  const s = collapseWs(lawM[1]);
  return s.length >= 2 ? s : null;
}

function isJurisdictionReplaceable(j: string | undefined | null): boolean {
  const t = (j || "").trim();
  if (!t) return true;
  const low = t.toLowerCase();
  if (low === "tbd") return true;
  if (t === PREMIUM_JURISDICTION_PLACEHOLDER) return true;
  if (/to be selected|pick the correct state|not taken from category/i.test(low)) return true;
  return false;
}

function shouldReplacePaymentWithExtracted(current: string, extracted: string, raw: string): boolean {
  if (!collapseWs(current)) return true;
  if (extracted.length > current.length + 12) return true;
  const rawHasStructure = /\b(milestone|installment|phases?|paid\s+across|net\s*\d|retainer|equity)\b/i.test(raw);
  if (
    rawHasStructure &&
    /\b(milestone|installment|phases?|paid\s+across)\b/i.test(extracted) &&
    !/\b(milestone|installment|phases?|paid\s+across)\b/i.test(current)
  ) {
    return true;
  }
  return paymentTermsLookLikeAmountOnlyStub(current);
}

function shouldReplaceDurationWithExtracted(current: string, extracted: string): boolean {
  if (!collapseWs(current)) return true;
  if (extracted.length > current.length + 12) return true;
  if (
    /\b(renewal|notice|automatic|month-to-month|convenience)\b/i.test(extracted) &&
    !/\b(renewal|notice|automatic|month-to-month|convenience)\b/i.test(current)
  ) {
    return true;
  }
  return durationLooksLikeLengthOnlyStub(current);
}

export function applyDeterministicCommercialIntakeFallback(rawIntake: string, parsed: ParsedDraftShape): ParsedDraftShape {
  const raw = rawIntake.replace(/\r\n/g, "\n").trim();
  if (raw.length < 12) return parsed;
  let next: ParsedDraftShape = { ...parsed };

  const explicit = explicitIntentCanonicalTitle(raw);
  const priorTitle = (parsed.title || "").trim();
  const titleMisrouteVsExplicit =
    Boolean(explicit) &&
    MISROUTED_SHELL_TITLES.has(priorTitle) &&
    priorTitle.length > 0 &&
    explicit!.toLowerCase() !== priorTitle.toLowerCase();
  const titleThin =
    !priorTitle ||
    priorTitle === "Agreement" ||
    looksLikePaymentPlanMisrouteTitle(priorTitle) ||
    titleMisrouteVsExplicit;
  if (explicit && titleThin) {
    next.title = explicit;
  }

  const extractedScope = extractScopeIncludes(raw);
  if (extractedScope && purposeLooksLikeGenericScopeStub(next.purpose)) {
    next.purpose = extractedScope;
  }

  const extractedPay = extractTotalFeeClause(raw);
  if (extractedPay && shouldReplacePaymentWithExtracted((next.payment_terms || "").trim(), extractedPay, raw)) {
    next.payment_terms = extractedPay;
  }

  const extractedTerm = extractTermClause(raw);
  if (extractedTerm && shouldReplaceDurationWithExtracted((next.duration || "").trim(), extractedTerm)) {
    next.duration = extractedTerm;
  }

  const lawM = extractGoverningLawClause(raw);
  if (lawM && isJurisdictionReplaceable(next.jurisdiction)) {
    next.jurisdiction = lawM;
  }

  return next;
}
