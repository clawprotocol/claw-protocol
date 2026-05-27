import {
  finalAgreementHasEmptySubsectionShell,
  finalAgreementHasExecutionContamination,
  validateInternalReferences,
} from "./finalAgreementCompilerIntegrity";
import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
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

export type ProFullAgreementCandidateRepair = {
  text: string;
  repairs: string[];
};

const PLACEHOLDER_RE =
  /\[(?:ORG|ADDRESS|PERSON|PARTY|CLIENT|PROVIDER|COMPANY|ORGANIZATION|DATE|AMOUNT|STATE)[^\]]*\]|\{\{[^}]+\}\}|\bparty[_\s-]?[ab]\b/i;
const GENERIC_RENDERER_RE = /\b(?:the applicable Party|applicable deliverables|commercial terms include)\b/i;
const UNFINISHED_FRAGMENT_RE =
  /\b(?:described in Sections?|as set forth in Section|subject to Section|pursuant to Section)\s*\.?$|(?:,|;|and|or|of|for|with|under)\s*$/im;
const GOVERNING_LAW_RE = /\b(Oklahoma|Texas|Delaware|California|New York)\s+law\b/i;
const SCHEDULE_A_REFERENCE_RE = /\bSchedule\s+A\b/i;
const SCHEDULE_A_HEADER_RE = /^\s*SCHEDULE\s+A\b[\s\S]{0,160}$/im;
const SCHEDULE_A_STUB_RE =
  /^\s*(?:Specific compensation mechanics will be completed in Schedule A before execution\.?|Fees are invoiced per Schedule A\.?)\s*$/gim;
const AWKWARD_AI_UPTIME_RE = /\bService Provider will provide no guaranteed third-party AI uptime\.?/gi;
const POLISHED_AI_UPTIME =
  "Service Provider does not guarantee the uptime, availability, compatibility, or continued operation of third-party AI platforms or services outside Service Provider's control.";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function duplicateClauseCount(text: string): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const block of text.split(/\n{2,}/)) {
    const t = normalize(block);
    if (!t || t.length < 80) continue;
    if (/^(?:by|name|title|date|client|service provider):/i.test(t)) continue;
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

function bodyForExecutionContaminationCheck(text: string): string {
  const marker = findSignatureRegionStart(text);
  if (marker < 0) return text;
  const before = text.slice(0, marker);
  const lines = before.split("\n");
  const preambleStart = Math.max(0, lines.length - 40);
  return lines.slice(0, preambleStart).join("\n");
}

function hasOrphanScheduleAReference(text: string): boolean {
  if (!SCHEDULE_A_REFERENCE_RE.test(text)) return false;
  if (SCHEDULE_A_HEADER_RE.test(text)) return false;
  return true;
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
  if (AWKWARD_AI_UPTIME_RE.test(body)) defects.push("awkward_support_disclaimer");
  AWKWARD_AI_UPTIME_RE.lastIndex = 0;
  if (hasOrphanScheduleAReference(body)) defects.push("orphan_schedule_a_reference");
  if (UNFINISHED_FRAGMENT_RE.test(body)) defects.push("unfinished_sentence_fragment");
  if (hasBlankClause(body) || finalAgreementHasEmptySubsectionShell(body)) defects.push("blank_clause");
  if (duplicateClauseCount(body) > 0) defects.push("duplicate_clause");
  if (signatureBlockMalformed(body)) defects.push("malformed_signature_block");
  if (finalAgreementHasExecutionContamination(bodyForExecutionContaminationCheck(body))) {
    defects.push("execution_contamination");
  }
  if (partyNamesMissing(body, context.canonicalPartyNames ?? [])) defects.push("missing_canonical_party");
  if (governingLawConflict(body, context.intakeText ?? "")) defects.push("governing_law_conflict");
  if (hasUnsupportedCommercialConflict(body, context)) defects.push("unsupported_commercial_conflict");
  if (missingRequiredCommercialFact(body, context)) defects.push("missing_required_commercial_fact");
  const refs = validateInternalReferences(body);
  if (!refs.ok) defects.push(...refs.defects);
  return { ok: defects.length === 0, defects: [...new Set(defects)] };
}

export function repairProFullAgreementCandidateSurgically(
  text: string,
  _context: ProFullAgreementCandidateValidationContext = {},
): ProFullAgreementCandidateRepair {
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();

  if (AWKWARD_AI_UPTIME_RE.test(working)) {
    AWKWARD_AI_UPTIME_RE.lastIndex = 0;
    working = working.replace(AWKWARD_AI_UPTIME_RE, POLISHED_AI_UPTIME);
    repairs.push("support_disclaimer_polished");
  }
  AWKWARD_AI_UPTIME_RE.lastIndex = 0;

  if (!SCHEDULE_A_HEADER_RE.test(working)) {
    const before = working;
    working = working
      .replace(SCHEDULE_A_STUB_RE, "")
      .split("\n")
      .filter((line) => !/\bSchedule\s+A\b/i.test(line))
      .join("\n");
    if (working !== before) repairs.push("orphan_schedule_a_line_removed");
  }

  const beforeFragmentRepair = working;
  working = working
    .replace(/\b(?:described in Sections?|as set forth in Section|subject to Section|pursuant to Section)\s*\.?\s*$/gim, "under this Agreement.")
    .replace(/\b(?:,|;)\s*$/gm, ".");
  if (working !== beforeFragmentRepair && !repairs.includes("truncated_fragment_completed")) {
    repairs.push("truncated_fragment_completed");
  }

  const ownershipParagraphRe =
    /\bClient will own the deliverables[\s\S]*?\bbackground materials\./gi;
  let seenOwnershipParagraph = false;
  working = working.replace(ownershipParagraphRe, (match) => {
    if (seenOwnershipParagraph) {
      repairs.push("duplicate_ownership_boilerplate_removed");
      return "";
    }
    seenOwnershipParagraph = true;
    return match;
  });

  const blocks = working.split(/\n{2,}/);
  const seenOwnership = new Set<string>();
  const kept: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    const key = normalize(trimmed);
    const isOwnership =
      /\b(?:client|company)\s+(?:will\s+)?owns?\b/i.test(trimmed) &&
      /\b(?:deliverables|work product|pre-existing|background materials|tools|templates|know-how)\b/i.test(trimmed);
    if (isOwnership && key.length >= 40 && seenOwnership.has(key)) {
      repairs.push("duplicate_ownership_boilerplate_removed");
      continue;
    }
    if (isOwnership && key.length >= 40) seenOwnership.add(key);
    kept.push(block);
  }
  working = kept.join("\n\n");

  working = working
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: working, repairs: [...new Set(repairs)] };
}

