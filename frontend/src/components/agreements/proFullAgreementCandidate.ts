import {
  finalAgreementHasEmptySubsectionShell,
  finalAgreementHasExecutionContamination,
  validateInternalReferences,
} from "./finalAgreementCompilerIntegrity";
import { scoreCommercialSpecificity, MINIMUM_COMMERCIAL_SPECIFICITY_SCORE } from "./commercialSpecificity";
import type { GuidedSemanticFacts } from "./guidedDealCompletion/guidedAnswerSemanticMerger";

export type ProFullAgreementCandidateValidationContext = {
  intakeText?: string | null;
  canonicalPartyNames?: readonly string[] | null;
  semanticFacts?: GuidedSemanticFacts | null;
};

export type ProFullAgreementCandidateValidation = {
  ok: boolean;
  defects: string[];
};

const PLACEHOLDER_RE =
  /\[(?:ORG|ADDRESS|PERSON|PARTY|CLIENT|PROVIDER|COMPANY|ORGANIZATION|DATE|AMOUNT|STATE)[^\]]*\]|\{\{[^}]+\}\}|\bparty[_\s-]?[ab]\b/i;
const GENERIC_RENDERER_RE = /\b(?:the applicable Party|applicable deliverables|commercial terms include)\b/i;
const UNFINISHED_FRAGMENT_RE =
  /\b(?:described in Sections?|as set forth in Section|subject to Section|pursuant to Section)\s*\.?$|(?:,|;|and|or|of|for|with|under)\s*$/im;
const GOVERNING_LAW_RE = /\b(Oklahoma|Texas|Delaware|California|New York)\s+law\b/i;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function duplicateClauseCount(text: string): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const line of text.split("\n")) {
    const t = normalize(line);
    if (!t || /^\d+\.\s+/.test(t) || /^(?:by|name|title|date|client|service provider):/i.test(t)) continue;
    if (t.length < 40) continue;
    if (seen.has(t)) duplicates += 1;
    seen.add(t);
  }
  return duplicates;
}

function hasBlankClause(text: string): boolean {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!/^\d+(?:\.\d+)?\.?\s+[A-Za-z][\w\s/&()-]{2,80}$/.test(t)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    if (!next || /^\d+(?:\.\d+)?\.?\s+/.test(next) || /^IN WITNESS WHEREOF\b/i.test(next)) return true;
  }
  return false;
}

function signatureBlockMalformed(text: string): boolean {
  if (!/\bIN WITNESS WHEREOF\b/i.test(text)) return false;
  const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
  const headings = (tail.match(/^\s*(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:/gim) ?? []).length;
  const byLines = (tail.match(/^\s*(?:By|Signature)\s*:/gim) ?? []).length;
  return headings > 0 && byLines < headings;
}

function partyNamesMissing(text: string, parties: readonly string[]): boolean {
  const normalized = normalize(text);
  return parties.filter(Boolean).some((party) => !normalized.includes(normalize(party)));
}

function governingLawConflict(text: string, intakeText = ""): boolean {
  const intakeLaw = intakeText.match(GOVERNING_LAW_RE)?.[1];
  const textLaw = text.match(GOVERNING_LAW_RE)?.[1];
  return Boolean(intakeLaw && textLaw && intakeLaw.toLowerCase() !== textLaw.toLowerCase());
}

function hasUnsupportedCommercialConflict(text: string, context: ProFullAgreementCandidateValidationContext): boolean {
  const intake = context.intakeText ?? "";
  const facts = context.semanticFacts?.facts ?? {};
  const blob = `${intake}\n${Object.values(facts).join("\n")}`;
  if (/\b40\s*%\s*build\/configuration\b|\b30\s*%\s*rollout\/onboarding\b|\b40_30_30\b/i.test(blob)) {
    if (/\b(?:build-heavy|even thirds|evenly across build)\b/i.test(text)) return true;
  }
  const paymentTiming = String(facts.payment_timing ?? "");
  if (/\bNet\s*30\b/i.test(paymentTiming) && /\bNet\s*15\b/i.test(text)) return true;
  if (/\bNet\s*15\b/i.test(paymentTiming) && /\bNet\s*30\b/i.test(text)) return true;
  if (/\b(?:month-to-month|\$4,?500\s*\/?\s*month|monthly retainer)\b/i.test(blob)) {
    if (/\b(?:milestone|phase allocation|build\/configuration|rollout\/onboarding|support\/acceptance)\b/i.test(text)) return true;
  }
  if (/\bpaid advertising|email marketing|campaign|ad spend|marketing services\b/i.test(blob)) {
    if (/\b99\.(?:9|5)\s*%|\bsoftware uptime\b|\bSLA\b/i.test(text)) return true;
  }
  return false;
}

function missingRequiredCommercialFact(text: string, context: ProFullAgreementCandidateValidationContext): boolean {
  const intake = context.intakeText ?? "";
  const facts = context.semanticFacts?.facts ?? {};
  const blob = `${intake}\n${Object.values(facts).join("\n")}`;
  if (/\b30\s*%\s*support\/acceptance\b/i.test(blob) && !/\b30\s*%\s*support\/acceptance\b/i.test(text)) {
    return true;
  }
  if (/\b40\s*%\s*build\/configuration\b/i.test(blob) && !/\b40\s*%\s*build\/configuration\b/i.test(text)) {
    return true;
  }
  if (/\b30\s*%\s*rollout\/onboarding\b/i.test(blob) && !/\b30\s*%\s*rollout\/onboarding\b/i.test(text)) {
    return true;
  }
  const amounts = blob.match(/\$[\d,]+(?:\s*\/\s*month)?/gi) ?? [];
  for (const amount of [...new Set(amounts.map((value) => value.replace(/\s+/g, "")))]) {
    const amountRe = new RegExp(amount.replace(/[$/]/g, "\\$&").replace(/,/g, ",?"), "i");
    if (!amountRe.test(text.replace(/\s+/g, ""))) return true;
  }
  return false;
}

export function validateProFullAgreementCandidate(
  text: string,
  context: ProFullAgreementCandidateValidationContext = {},
): ProFullAgreementCandidateValidation {
  const defects: string[] = [];
  const body = (text || "").trim();
  if (!body) defects.push("empty_candidate");
  if (PLACEHOLDER_RE.test(body)) defects.push("placeholder");
  if (GENERIC_RENDERER_RE.test(body)) defects.push("generic_renderer_language");
  if (UNFINISHED_FRAGMENT_RE.test(body)) defects.push("unfinished_sentence_fragment");
  if (hasBlankClause(body) || finalAgreementHasEmptySubsectionShell(body)) defects.push("blank_clause");
  if (duplicateClauseCount(body) > 0) defects.push("duplicate_clause");
  if (signatureBlockMalformed(body) || finalAgreementHasExecutionContamination(body)) defects.push("malformed_signature_block");
  if (partyNamesMissing(body, context.canonicalPartyNames ?? [])) defects.push("missing_canonical_party");
  if (governingLawConflict(body, context.intakeText ?? "")) defects.push("governing_law_conflict");
  if (hasUnsupportedCommercialConflict(body, context)) defects.push("unsupported_commercial_conflict");
  if (missingRequiredCommercialFact(body, context)) defects.push("missing_required_commercial_fact");
  const refs = validateInternalReferences(body);
  if (!refs.ok) defects.push(...refs.defects);
  const specificity = scoreCommercialSpecificity(context.intakeText ?? "", body);
  if (specificity.score < MINIMUM_COMMERCIAL_SPECIFICITY_SCORE) defects.push("commercial_specificity_below_threshold");
  return { ok: defects.length === 0, defects: [...new Set(defects)] };
}

