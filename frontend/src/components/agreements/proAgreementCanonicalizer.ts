export type ProAgreementCanonicalizationResult = {
  text: string;
  repairs: string[];
  warnings: string[];
  commercialSpecificity?: import("./commercialSpecificity").CommercialSpecificityScore;
};

import {
  consolidateDuplicateNoticesSections,
  dedupeElectronicSignatureLines,
  isProClauseHeadingLine,
  repairBareProSkeletonClauses,
  stripBillingNoticesFiller,
  stripWeakElectronicSignatureFluff,
} from "./proCorpusSkeletonSafety";
import { applyProCorpusIntegrity } from "./proCorpusIntegrity";
import type { GuidedSemanticFacts } from "./guidedDealCompletion/guidedAnswerSemanticMerger";
import { logCommercialSpecificityScore, scoreCommercialSpecificity } from "./commercialSpecificity";
import {
  repairProFullAgreementCandidateSurgically,
  validateProFullAgreementCandidate,
} from "./proFullAgreementCandidate";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import { assertNoPostAcceptanceStructuralMutation } from "./authoritativeAgreementDocument";

export type ProAgreementCanonicalizationOptions = {
  canonicalPartyNames?: readonly string[];
  canonicalRoles?: readonly string[];
  canonicalTerminationNoticeDays?: string | number | null;
  intakeText?: string | null;
  semanticFacts?: GuidedSemanticFacts | null;
  surface?: string;
};

export { assertNoBareProSkeletonClauses } from "./proCorpusSkeletonSafety";

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+?)\.?\s*$/;
const PLACEHOLDER_PARTY_RE = /\b(?:party_a|party_b|partyA|partyB)\b|\[(?:Your Company Name|Service Provider Name)\]/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeKey(text: string): string {
  return cleanLine(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,;:]+$/g, "")
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRepeatedTitleInsideSectionOne(text: string): { text: string; repairs: string[] } {
  const lines = text.split("\n");
  const title = cleanLine(lines.find((line) => cleanLine(line)) ?? "");
  if (!title) return { text, repairs: [] };
  let inSectionOne = false;
  const repairs: string[] = [];
  const out = lines.filter((line, index) => {
    const t = cleanLine(line);
    const top = t.match(TOP_LEVEL_HEADING_RE);
    if (top) inSectionOne = top[1] === "1";
    if (index > 0 && inSectionOne && normalizeKey(t) === normalizeKey(title)) {
      repairs.push("section1:duplicate_title_removed");
      return false;
    }
    return true;
  });
  return { text: out.join("\n"), repairs };
}

function stripTemplatePlaceholders(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out = text
    .split("\n")
    .filter((line) => {
      const t = cleanLine(line);
      if (/^\[(?:not yet specified|tbd|todo|placeholder)[^\]]*\]$/i.test(t)) {
        repairs.push("placeholder:bracket_line_removed");
        return false;
      }
      if (/^(?:tbd|to be determined|not yet specified|insert here)\.?$/i.test(t)) {
        repairs.push("placeholder:line_removed");
        return false;
      }
      if (/this draft agreement preview is generated from your structured fields/i.test(t)) {
        repairs.push("starter_template:preview_banner_removed");
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\[(?:Not yet specified|TBD|TODO|PLACEHOLDER)\]/gi, "");
  return { text: out, repairs };
}

function partyNameAt(opts: ProAgreementCanonicalizationOptions | undefined, index: number): string {
  return cleanLine(opts?.canonicalPartyNames?.[index] ?? "");
}

function canonicalRoleAt(opts: ProAgreementCanonicalizationOptions | undefined, index: number, fallback: string): string {
  return cleanLine(opts?.canonicalRoles?.[index] ?? fallback) || fallback;
}

function replaceProCorpusPartyPlaceholders(
  text: string,
  opts?: ProAgreementCanonicalizationOptions,
): { text: string; repairs: string[]; warnings: string[] } {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const clientName = partyNameAt(opts, 0);
  const providerName = partyNameAt(opts, 1);
  const clientRole = canonicalRoleAt(opts, 0, "Client");
  const providerRole = canonicalRoleAt(opts, 1, "Service Provider");

  const resolveLine = (line: string): string | null => {
    let next = line;
    const before = next;
    if (clientName) {
      next = next
        .replace(/\b(?:party_a|partyA)\b\s*(?:\(\s*the\s+["“]?Client["”]?\s*\))?/gi, `${clientName} ("${clientRole}")`)
        .replace(/\[Your Company Name\]/gi, clientName);
    }
    if (providerName) {
      next = next
        .replace(
          /\b(?:party_b|partyB)\b\s*(?:\(\s*the\s+["“]?Service Provider["”]?\s*\))?/gi,
          `${providerName} ("${providerRole}")`,
        )
        .replace(/\[Service Provider Name\]/gi, providerName);
    }
    if (!PLACEHOLDER_PARTY_RE.test(next)) {
      if (next !== before) repairs.push("placeholder_party:resolved");
      return next;
    }
    if (PLACEHOLDER_PARTY_RE.test(line)) {
      repairs.push("placeholder_party:line_removed");
      warnings.push("placeholder_party_unresolved_removed");
      return null;
    }
    return next;
  };

  const out = text
    .split("\n")
    .map(resolveLine)
    .filter((line): line is string => line !== null)
    .join("\n");
  return { text: out, repairs, warnings };
}

function stripDuplicateParagraphs(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const blocks = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const key = normalizeKey(block);
    if (key.length > 40 && seen.has(key)) {
      repairs.push(`duplicate_clause:${key.slice(0, 48)}`);
      continue;
    }
    if (key) seen.add(key);
    out.push(block);
  }
  return { text: out.join("\n\n"), repairs };
}

function stripDuplicateLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const key = normalizeKey(line);
    const isSubstantive = key.length > 36 && !isProClauseHeadingLine(line);
    if (isSubstantive && seen.has(key)) {
      repairs.push(`duplicate_line:${key.slice(0, 48)}`);
      continue;
    }
    if (isSubstantive) seen.add(key);
    out.push(line);
  }
  return { text: out.join("\n"), repairs };
}

function canonicalizeRepeatedESignature(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let seen = false;
  const out = text
    .split(/\n{2,}/)
    .map((block) => {
      if (/electronic signatures and counterparts/i.test(block)) {
        block = block.replace(
          /The parties may execute this Agreement using electronic signatures and counterparts\./gi,
          "The parties may execute this Agreement electronically and in counterparts.",
        );
      }
      return block;
    })
    .filter((block) => {
      const key = normalizeKey(block);
      const electronicSignature =
        /\belectronic signatures?\b/.test(key) ||
        /\be signatures?\b/.test(key) ||
        /\be-signatures?\b/.test(key) ||
        (/\bcounterparts?\b/.test(key) && (/\belectronic\b/.test(key) || /\besign\b/.test(key) || /e-sign/.test(key)));
      if (!electronicSignature) return true;
      if (!seen) {
        seen = true;
        return true;
      }
      repairs.push("duplicate:e_signature_clause_removed");
      return false;
    })
    .join("\n\n");
  return { text: out, repairs };
}

function normalizePaymentConsistency(text: string): { text: string; repairs: string[]; warnings: string[] } {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const lines = text.split("\n");
  let canonicalNet: string | null = null;
  let netInvoiceLineSeen = false;
  const out = lines.filter((line) => {
    const paymentContext = /\b(payment|invoices?|fee|compensation|commercial terms)\b/i.test(line);
    const net = line.match(/\bNet\s+(\d{1,3})\b/i);
    if (!paymentContext || !net) return true;
    const found = net[1];
    if (!canonicalNet) {
      canonicalNet = found;
      netInvoiceLineSeen = true;
      return true;
    }
    const duplicateNetInvoice = found === canonicalNet && /\binvoices?\b/i.test(line) && netInvoiceLineSeen;
    if (duplicateNetInvoice) {
      repairs.push(`payment_terms:duplicate_net_${found}_invoice_removed`);
      return false;
    }
    if (found !== canonicalNet) {
      repairs.push(`payment_terms:net_${found}_normalized_to_net_${canonicalNet}`);
      warnings.push("payment_terms_conflict_resolved");
      return true;
    }
    return true;
  });
  const normalized = out.map((line) => {
    const paymentContext = /\b(payment|invoices?|fee|compensation|commercial terms)\b/i.test(line);
    const net = line.match(/\bNet\s+(\d{1,3})\b/i);
    if (!paymentContext || !net || !canonicalNet || net[1] === canonicalNet) return line;
    return line.replace(/\bNet\s+\d{1,3}\b/gi, `Net ${canonicalNet}`);
  });
  return { text: normalized.join("\n"), repairs, warnings };
}

function normalizeTerminationNoticeConsistency(
  text: string,
  opts?: ProAgreementCanonicalizationOptions,
): { text: string; repairs: string[]; warnings: string[] } {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const lines = text.split("\n");
  let canonicalDays: string | null = cleanLine(String(opts?.canonicalTerminationNoticeDays ?? "")).match(/\d{1,3}/)?.[0] ?? null;
  let keptTerminationForConvenience = false;
  const out = lines.filter((line) => {
    const terminationContext = /\b(termination|terminate|notice)\b/i.test(line);
    const terminationForConvenience = /\bterminat(?:e|ion)\b[\s\S]{0,80}\bconvenience\b|\bconvenience\b[\s\S]{0,80}\bterminat/i.test(line);
    const days = line.match(/\b(\d{1,3})\s+days?\b/i);
    if (!terminationContext || !days) return true;
    const found = days[1];
    if (!canonicalDays) {
      canonicalDays = found;
      if (terminationForConvenience) keptTerminationForConvenience = true;
      return true;
    }
    if (terminationForConvenience && keptTerminationForConvenience) {
      repairs.push(`termination_notice:duplicate_${found}_days_removed`);
      if (found !== canonicalDays) warnings.push("termination_notice_conflict_resolved");
      return false;
    }
    if (found !== canonicalDays) {
      repairs.push(`termination_notice:${found}_days_normalized_to_${canonicalDays}_days`);
      warnings.push("termination_notice_conflict_resolved");
    }
    if (terminationForConvenience) keptTerminationForConvenience = true;
    return true;
  });
  const normalized = out.map((line) => {
    const terminationContext = /\b(termination|terminate|notice)\b/i.test(line);
    const days = line.match(/\b(\d{1,3})\s+days?\b/i);
    if (!terminationContext || !days || !canonicalDays || days[1] === canonicalDays) return line;
    return line.replace(/\b\d{1,3}\s+days?\b/gi, `${canonicalDays} days`);
  });
  return { text: normalized.join("\n"), repairs, warnings };
}

function stripOrphanFragments(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let sawParentSubsectionInSection = false;
  const out = text.split("\n").filter((line) => {
    const t = cleanLine(line);
    if (!t) return true;
    if (TOP_LEVEL_HEADING_RE.test(t)) sawParentSubsectionInSection = false;
    const subsection = t.match(/^\(([a-z])\)\s+/i);
    if (subsection) {
      const marker = subsection[1].toLowerCase();
      if (marker === "a") {
        sawParentSubsectionInSection = true;
        return true;
      }
      if (!sawParentSubsectionInSection) {
        repairs.push(`orphan_subsection:${t.slice(0, 48)}`);
        return false;
      }
      return true;
    }
    if (/^(?:and|or|provided,? however|except that|subject to)\b/i.test(t) && t.length < 80) {
      repairs.push(`orphan_fragment:${t.slice(0, 48)}`);
      return false;
    }
    if (/^[).,;:-]+/.test(t)) {
      repairs.push(`orphan_punctuation:${t.slice(0, 48)}`);
      return false;
    }
    return true;
  }).join("\n");
  return { text: out, repairs };
}

function normalizeGenericCompanyRole(
  text: string,
  opts?: ProAgreementCanonicalizationOptions,
): { text: string; repairs: string[] } {
  const clientRole = canonicalRoleAt(opts, 0, "Client");
  if (!/^Client$/i.test(clientRole)) return { text, repairs: [] };
  const partyNames = opts?.canonicalPartyNames ?? [];
  if (partyNames.some((name) => /\bCompany\b/i.test(name))) return { text, repairs: [] };
  let replacements = 0;
  const out = text.replace(/\b(?:the\s+)?Company\b/g, (match) => {
    if (/^[Tt]he\s+/.test(match)) {
      replacements += 1;
      return clientRole;
    }
    replacements += 1;
    return clientRole;
  });
  return { text: out, repairs: replacements ? [`generic_company:normalized_to_${clientRole}`] : [] };
}

export function logProCorpusSafetyGate(payload: {
  placeholdersRemoved: number;
  placeholdersResolved: number;
  emptyHeadingsRemoved: number;
  duplicateClausesRemoved: number;
  conflictsResolved: number;
  finalLength: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "production") return;
  const shouldLog =
    typeof import.meta !== "undefined" &&
    (Boolean(import.meta.env?.DEV) || import.meta.env?.MODE === "test");
  if (!shouldLog) return;
  // eslint-disable-next-line no-console
  console.info("[pro-corpus-safety-gate]", payload);
}

function safetyGatePayload(repairs: readonly string[], warnings: readonly string[], finalLength: number) {
  return {
    placeholdersRemoved: repairs.filter((r) => r.includes("placeholder") && r.includes("removed")).length,
    placeholdersResolved: repairs.filter((r) => r.includes("placeholder") && r.includes("resolved")).length,
    emptyHeadingsRemoved: repairs.filter(
      (r) => r.startsWith("empty_heading:") || r.startsWith("skeleton_heading:removed"),
    ).length,
    duplicateClausesRemoved: repairs.filter((r) => r.includes("duplicate")).length,
    conflictsResolved: warnings.filter((w) => w.includes("conflict_resolved")).length,
    finalLength,
  };
}

export function canonicalizeProAgreementText(
  text: string,
  opts?: ProAgreementCanonicalizationOptions,
): ProAgreementCanonicalizationResult {
  const repairs: string[] = [];
  const warnings: string[] = [];
  let out = (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const placeholderParties = replaceProCorpusPartyPlaceholders(out, opts);
  out = placeholderParties.text;
  repairs.push(...placeholderParties.repairs);
  warnings.push(...placeholderParties.warnings);

  for (const step of [
    stripTemplatePlaceholders,
    stripRepeatedTitleInsideSectionOne,
    repairBareProSkeletonClauses,
    stripOrphanFragments,
    stripDuplicateParagraphs,
    stripDuplicateLines,
    dedupeElectronicSignatureLines,
    stripWeakElectronicSignatureFluff,
    canonicalizeRepeatedESignature,
    consolidateDuplicateNoticesSections,
    stripBillingNoticesFiller,
    repairBareProSkeletonClauses,
  ]) {
    const result = step(out);
    out = result.text;
    repairs.push(...result.repairs);
  }

  const genericCompany = normalizeGenericCompanyRole(out, opts);
  out = genericCompany.text;
  repairs.push(...genericCompany.repairs);

  const payment = normalizePaymentConsistency(out);
  out = payment.text;
  repairs.push(...payment.repairs);
  warnings.push(...payment.warnings);

  const termination = normalizeTerminationNoticeConsistency(out, opts);
  out = termination.text;
  repairs.push(...termination.repairs);
  warnings.push(...termination.warnings);

  const finalSkeleton = repairBareProSkeletonClauses(out);
  out = finalSkeleton.text;
  repairs.push(...finalSkeleton.repairs);

  const finalNotices = consolidateDuplicateNoticesSections(out);
  out = finalNotices.text;
  repairs.push(...finalNotices.repairs);

  const finalBillingFiller = stripBillingNoticesFiller(out);
  out = finalBillingFiller.text;
  repairs.push(...finalBillingFiller.repairs);

  const finalOrphans = stripOrphanFragments(out);
  out = finalOrphans.text;
  repairs.push(...finalOrphans.repairs);

  const fullCandidateValidation = validateProFullAgreementCandidate(out, {
    intakeText: opts?.intakeText,
    canonicalPartyNames: opts?.canonicalPartyNames,
    semanticFacts: opts?.semanticFacts,
  });
  if (!fullCandidateValidation.ok) {
    const repairedFullCandidate = repairProFullAgreementCandidateSurgically(out, {
      intakeText: opts?.intakeText,
      canonicalPartyNames: opts?.canonicalPartyNames,
      semanticFacts: opts?.semanticFacts,
    });
    if (repairedFullCandidate.repairs.length > 0) {
      const repairedValidation = validateProFullAgreementCandidate(repairedFullCandidate.text, {
        intakeText: opts?.intakeText,
        canonicalPartyNames: opts?.canonicalPartyNames,
        semanticFacts: opts?.semanticFacts,
      });
      if (repairedValidation.ok) {
        out = repairedFullCandidate.text;
        repairs.push(...repairedFullCandidate.repairs.map((repair) => `full_candidate_repair:${repair}`));
        fullCandidateValidation.defects.length = 0;
      }
    }
  }
  if (fullCandidateValidation.ok || fullCandidateValidation.defects.length === 0) {
    const stabilized = stabilizeFinalAgreementCompilerOutput(out, {
      intakeText: opts?.intakeText,
      surface: opts?.surface ?? "pro_agreement_canonicalizer_full_candidate",
    });
    out = stabilized.text;
    repairs.push("full_candidate:validated_primary");
    repairs.push(...stabilized.repairs.map((repair) => `full_candidate:${repair}`));
    const commercialSpecificity = scoreCommercialSpecificity(
      `${opts?.intakeText ?? ""}\n${Object.values(opts?.semanticFacts?.facts ?? {}).join("\n")}`,
      out,
    );
    const uniqueRepairs = [...new Set(repairs)];
    const uniqueWarnings = [...new Set(warnings)];
    logCommercialSpecificityScore({
      score: commercialSpecificity,
      normalizationMode: "soft",
      surface: opts?.surface ?? "pro_agreement_canonicalizer",
    });
    assertNoPostAcceptanceStructuralMutation({
      surface: opts?.surface ?? "pro_agreement_canonicalizer",
      mutation: "canonicalizer_full_candidate_repair",
      inputText: text,
      outputText: out,
    });
    logProCorpusSafetyGate(safetyGatePayload(uniqueRepairs, uniqueWarnings, out.length));
    return { text: out, repairs: uniqueRepairs, warnings: uniqueWarnings, commercialSpecificity };
  }
  warnings.push(...fullCandidateValidation.defects.map((defect) => `full_candidate:${defect}`));

  const integrity = applyProCorpusIntegrity(out, {
    intakeText: opts?.intakeText,
    semanticFacts: opts?.semanticFacts,
    canonicalPartyNames: opts?.canonicalPartyNames,
    surface: opts?.surface ?? "pro_agreement_canonicalizer",
  });
  out = integrity.text;
  repairs.push(...integrity.repairs);
  warnings.push(...integrity.report.warnings.map((w) => `integrity:${w}`));

  const finalGenericCompany = normalizeGenericCompanyRole(out, opts);
  out = finalGenericCompany.text;
  repairs.push(...finalGenericCompany.repairs.map((r) => `final_${r}`));

  out = out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const uniqueRepairs = [...new Set(repairs)];
  const uniqueWarnings = [...new Set(warnings)];
  const commercialSpecificity = scoreCommercialSpecificity(
    `${opts?.intakeText ?? ""}\n${Object.values(opts?.semanticFacts?.facts ?? {}).join("\n")}`,
    out,
  );
  logCommercialSpecificityScore({
    score: commercialSpecificity,
    normalizationMode: "soft",
    surface: opts?.surface ?? "pro_agreement_canonicalizer",
  });
  assertNoPostAcceptanceStructuralMutation({
    surface: opts?.surface ?? "pro_agreement_canonicalizer",
    mutation: "canonicalizer_integrity_repair",
    inputText: text,
    outputText: out,
  });
  logProCorpusSafetyGate(safetyGatePayload(uniqueRepairs, uniqueWarnings, out.length));
  return { text: out, repairs: uniqueRepairs, warnings: uniqueWarnings, commercialSpecificity };
}
