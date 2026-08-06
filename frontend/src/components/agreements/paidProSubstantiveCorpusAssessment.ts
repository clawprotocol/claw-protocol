/**
 * Authoritative Paid Pro server_full_draft substantive qualification at acceptance.
 * Length alone must not accept preview stubs or reject structurally complete concise agreements.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  analyzeTemplatePlaceholderFragments,
  prepareAgreementTextForPlaceholderScan,
} from "./agreementTemplatePlaceholderSafety";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
  premiumBodyHasRequiredPaidSections,
} from "./premiumAcceptancePolicy";
import { assessProfessionalProClauseCoverage } from "./paidProProfessionalClauseCoverage";
import { assessRepeatedSupplementalProvisionsFiller } from "./paidProSupplementalProvisionsFillerGate";

export type PaidProSubstantiveCorpusClassification =
  | "substantive_full"
  | "structurally_complete_concise"
  | "partial"
  | "truncated"
  | "degraded"
  | "mislabeled";

export type PaidProSubstantiveCorpusAssessment = {
  source: string;
  corpusHash: string;
  rawLength: number;
  normalizedLength: number;
  wordCount: number;
  sectionCount: number;
  executionBlockCount: number;
  placeholderCount: number;
  appearsTruncated: boolean;
  structurallyComplete: boolean;
  classification: PaidProSubstantiveCorpusClassification;
  blockers: string[];
  qualifiesForServerFullDraftAcceptance: boolean;
};

const SERVER_FULL_DRAFT_SOURCES: ReadonlySet<string> = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_draft_degraded",
]);

const CONCISE_AUTHORITATIVE_PAID_ENTITY_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.|Labs|Laboratory|Company|Co\.|Partners|Partnership|LLP|P\.C\.|PC|PLLC)\b/i;

/** Same floor as acceptedProposalCorpusText purpose minimum. */
export const CONCISE_AUTHORITATIVE_ESTABLISH_MIN_LEN = 120;

/** Short server_full_draft bodies that structurally resemble complete paid agreements, not preview stubs. */
export function qualifiesAsConciseAuthoritativePaidServerDraft(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < CONCISE_AUTHORITATIVE_ESTABLISH_MIN_LEN || t.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
    return false;
  }
  if (!CONCISE_AUTHORITATIVE_PAID_ENTITY_RE.test(t)) return false;
  if (!/IN WITNESS WHEREOF|executed this Agreement/i.test(t)) return false;
  if (!/^\s*\d+\.\s+[A-Za-z]/m.test(t) && !/^\s*[A-Z][A-Z0-9\s,&-]{4,}\s*$/m.test(t)) return false;
  if (/\b(?:starter preview|live preview|preview only|fallback preview|retry pro draft)\b/i.test(t)) {
    return false;
  }
  return true;
}

const PREVIEW_OR_RECOVERY_STUB_RES = [
  /\b(?:starter preview|live preview|preview only|fallback preview|retry pro draft)\b/i,
  /\bstructural recovery stub\b/i,
];

const RECOVERY_NOTICE_SCAFFOLDING_RE =
  /provided during signer setup/i;

export function isPaidProServerFullDraftSource(source: string | null | undefined): boolean {
  return SERVER_FULL_DRAFT_SOURCES.has((source ?? "").trim());
}

function countNumberedSections(text: string): number {
  return (text.match(/^\s*\d+\.\s+[A-Za-z]/gm) ?? []).length;
}

function appearsPreviewOrRecoveryStub(text: string): boolean {
  if (PREVIEW_OR_RECOVERY_STUB_RES.some((re) => re.test(text))) return true;
  if (assessRepeatedSupplementalProvisionsFiller(text).repeatCount >= 2) return true;
  return false;
}

function appearsThinRepetitiveCorpus(text: string): boolean {
  const t = text.trim();
  if (t.length < 400) return false;
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 3) {
    const unique = new Set(lines);
    if (unique.size <= 2) return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 40) {
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const max = Math.max(...freq.values());
    if (max / words.length >= 0.72) return true;
  }
  if (/^(.{1,24})\1{8,}$/s.test(t.replace(/\s+/g, ""))) return true;
  return false;
}

export function detectPaidProCorpusAbruptTruncation(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\[(?:truncated|TBD|TODO)\]/i.test(t)) return true;
  if (/\.\.\.\s*$/.test(t)) return true;
  if (t.length >= 1_500 && !/IN WITNESS WHEREOF|executed this Agreement/i.test(t)) {
    return true;
  }
  const tail = t.slice(-120).trim();
  if (t.length >= 800 && !/[.!?]"?\s*$/.test(tail) && !/_{2,}\s*$/.test(tail)) {
    if (!/IN WITNESS WHEREOF/i.test(t.slice(-600))) return true;
  }
  return false;
}

export function assessGenericOperativeStructureCompleteness(text: string): {
  ok: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  const t = text.trim();
  const bodyLow = t.toLowerCase();
  if (t.length < 800) blockers.push("below_generic_operative_min_len");
  if (!CONCISE_AUTHORITATIVE_PAID_ENTITY_RE.test(t)) {
    blockers.push("missing_legal_entity_parties");
  }
  const executionBlockCount = countPaidProExecutionBlocks(t);
  if (executionBlockCount < 1) blockers.push("missing_execution_block");
  const sectionCount = countNumberedSections(t);
  if (sectionCount < 3) blockers.push("insufficient_numbered_sections");
  let operativeHits = 0;
  if (/\b(?:payment|compensation|fee|consideration)\b/i.test(bodyLow)) operativeHits++;
  if (/\bterminat/i.test(bodyLow)) operativeHits++;
  if (/\b(?:governing\s+law|laws\s+of|governed\s+by)\b/i.test(bodyLow)) operativeHits++;
  if (/\b(?:scope|services|obligations)\b/i.test(bodyLow)) operativeHits++;
  if (/\b(?:confidential|notice|electronic\s+sign|e-?sign|counterparts?)\b/i.test(bodyLow)) {
    operativeHits++;
  }
  if (operativeHits < 4) blockers.push("insufficient_operative_families");
  return { ok: blockers.length === 0, blockers };
}

function detectNormalizationShrinkage(rawLength: number, normalizedLength: number): boolean {
  if (rawLength < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  if (normalizedLength <= 0) return false;
  return normalizedLength < Math.max(PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN, Math.floor(rawLength * 0.85));
}

export function assessPaidProSubstantiveServerDraftCorpus(args: {
  text: string;
  source: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  normalizedText?: string | null;
  generationOutcome?: string | null;
}): PaidProSubstantiveCorpusAssessment {
  const raw = (args.text || "").trim();
  const normalized = (args.normalizedText ?? raw).trim();
  const source = (args.source || "unknown").trim();
  const intakeText = args.intakeText ?? "";
  const draft = args.draft ?? null;
  const generationOutcome = (args.generationOutcome || "").trim().toLowerCase();

  const rawLength = raw.length;
  const normalizedLength = normalized.length;
  const corpusHash = rawLength > 0 ? fingerprintAgreementBody(raw) : "";
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  const sectionCount = countNumberedSections(raw);
  const executionBlockCount = countPaidProExecutionBlocks(raw);
  const placeholderScanCtx = {
    intakeRaw: intakeText,
    partyNames: (draft?.parties ?? []).map((p) => String(p?.name ?? "").trim()).filter(Boolean),
  };
  const placeholderScan = analyzeTemplatePlaceholderFragments(
    prepareAgreementTextForPlaceholderScan(raw),
    placeholderScanCtx,
  );
  const placeholderCount = placeholderScan.filter((d) => d.fatal).length;

  const blockers: string[] = [];
  if (!raw) blockers.push("empty_corpus");
  if (appearsPreviewOrRecoveryStub(raw)) blockers.push("preview_or_recovery_stub");
  if (appearsThinRepetitiveCorpus(raw)) blockers.push("thin_repetitive_corpus");
  if (RECOVERY_NOTICE_SCAFFOLDING_RE.test(raw) && rawLength < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
    blockers.push("recovery_notice_scaffolding");
  }
  if (placeholderCount > 0) blockers.push("unresolved_placeholders");
  const appearsTruncated = detectPaidProCorpusAbruptTruncation(raw);
  if (appearsTruncated) blockers.push("truncated");
  if (detectNormalizationShrinkage(rawLength, normalizedLength)) {
    blockers.push("normalization_shrinkage");
  }

  const exceedsStrongLengthFloor = rawLength >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;
  const hasRequiredSections = premiumBodyHasRequiredPaidSections({
    text: raw,
    rawIntake: intakeText,
    draft,
  });
  const professional = assessProfessionalProClauseCoverage({ text: raw, intake: intakeText });
  const conciseHeuristic = qualifiesAsConciseAuthoritativePaidServerDraft(raw);
  const genericStructure = assessGenericOperativeStructureCompleteness(raw);

  const professionalMaterialSatisfied =
    professional.applies &&
    professional.materialClausesMissing.length === 0 &&
    (professional.ok || professional.conciseComplete);

  const structurallyComplete =
    blockers.length === 0 &&
    (hasRequiredSections ||
      professionalMaterialSatisfied ||
      conciseHeuristic ||
      genericStructure.ok);

  let classification: PaidProSubstantiveCorpusClassification;
  if (!isPaidProServerFullDraftSource(source)) {
    classification = exceedsStrongLengthFloor && blockers.length === 0 ? "substantive_full" : "partial";
  } else if (blockers.includes("preview_or_recovery_stub") || blockers.includes("thin_repetitive_corpus")) {
    classification = "mislabeled";
  } else if (blockers.includes("recovery_notice_scaffolding")) {
    classification = "mislabeled";
  } else if (appearsTruncated) {
    classification = "truncated";
  } else if (
    generationOutcome === "degraded" &&
    !exceedsStrongLengthFloor &&
    !structurallyComplete
  ) {
    classification = "degraded";
  } else if (exceedsStrongLengthFloor && blockers.length === 0) {
    classification = "substantive_full";
  } else if (structurallyComplete) {
    classification = "structurally_complete_concise";
  } else if (rawLength > 0 && rawLength < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
    classification = "mislabeled";
  } else {
    classification = "partial";
  }

  const qualifiesForServerFullDraftAcceptance =
    isPaidProServerFullDraftSource(source) &&
    (classification === "substantive_full" || classification === "structurally_complete_concise");

  return {
    source,
    corpusHash,
    rawLength,
    normalizedLength,
    wordCount,
    sectionCount,
    executionBlockCount,
    placeholderCount,
    appearsTruncated,
    structurallyComplete,
    classification,
    blockers,
    qualifiesForServerFullDraftAcceptance,
  };
}

export function paidProServerFullDraftBelowSubstantiveMin(args: {
  text: string;
  source: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  normalizedText?: string | null;
  generationOutcome?: string | null;
}): boolean {
  if (!isPaidProServerFullDraftSource(args.source)) return false;
  const trimmed = (args.text || "").trim();
  if (!trimmed || trimmed.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) return false;
  const assessment = assessPaidProSubstantiveServerDraftCorpus(args);
  return !assessment.qualifiesForServerFullDraftAcceptance;
}
