/**
 * Final guided Pro corpus structure normalizer — one coherent agreement in canonical order.
 * Runs after guided merges and signer identity, before final review freeze / VS01 handoff.
 */

import { findSignatureRegionStart } from "./signatureRegion";
import {
  normalizeGuidedCorpusSectionFormatting,
  stripMisplacedGuidedClausesBeforeSignature,
} from "./guidedSectionAwareMerge";
import { dedupeGuidedAnswerClauses } from "./guidedFinalReviewToSigning";
import {
  applyOrphanSubclausesToSections,
  canonicalKeyForSectionNumber,
  isStructurallyEmptySectionBody,
  logGuidedEmptySectionPruned,
  repairGuidedCorpusLinesBeforeStructure,
  stripOrphanNumberedHeadingLines,
} from "./guidedCorpusLineRepairs";

export type CanonicalSectionKey =
  | "purpose"
  | "fees"
  | "confidentiality"
  | "ownership"
  | "support"
  | "term"
  | "notices"
  | "miscellaneous"
  | "electronic_signatures"
  | "unknown";

export type CorpusStructuralDefect =
  | "duplicate_top_level_number"
  | "section1_after_later_section"
  | "malformed_double_section_number"
  | "malformed_subsection_number"
  | "clause_sentence_heading"
  | "dangling_effective_date_fragment"
  | "duplicate_witness_block"
  | "prepended_guided_mini_agreement"
  | "out_of_order_sections";

export type ParsedCorpusSection = {
  originalNumber: number | null;
  heading: string;
  bodyLines: string[];
  canonicalKey: CanonicalSectionKey;
};

const CANONICAL_SECTION_SPECS: ReadonlyArray<{
  key: CanonicalSectionKey;
  number: number;
  label: string;
}> = [
  { key: "purpose", number: 1, label: "Purpose and Scope" },
  { key: "fees", number: 2, label: "Fees and Payment" },
  { key: "confidentiality", number: 3, label: "Confidentiality" },
  { key: "ownership", number: 4, label: "Ownership and Work Product" },
  { key: "support", number: 5, label: "Support Expectations" },
  { key: "term", number: 6, label: "Term and Termination" },
  { key: "notices", number: 7, label: "Notices" },
  { key: "miscellaneous", number: 8, label: "Miscellaneous" },
  { key: "electronic_signatures", number: 9, label: "Electronic Signatures and Counterparts" },
];

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+)$/;
const MALFORMED_DOUBLE_HEADING_RE = /^(\d+)\.\s+(\d+)\.\s+(.+)$/;
const SUBCLAUSE_RE = /^(\d+)\.(\d+)\.?\s+/;
const WITNESS_RE = /^(?:IN WITNESS WHEREOF|EXECUTION|SIGNATURES?)\b/i;
const CLIENT_BLOCK_RE = /^CLIENT\s*:/i;

function normLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function signatureStartLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i]?.trim() ?? "";
    if (WITNESS_RE.test(t) || CLIENT_BLOCK_RE.test(t)) return i;
  }
  const idx = findSignatureRegionStart(lines.join("\n"));
  if (idx < 0) return lines.length;
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    offset += lines[i].length + 1;
    if (offset > idx) return i;
  }
  return lines.length;
}

export function resolveCanonicalSectionKey(heading: string): CanonicalSectionKey {
  const h = heading.trim();
  const lower = h.toLowerCase();
  if (/purpose|scope\s+of\s+services?/i.test(lower)) return "purpose";
  if (/(?:fees?|payment|compensation|commercial\s+terms)/i.test(lower) && !/notice/i.test(lower)) {
    return "fees";
  }
  if (/confidential/i.test(lower)) return "confidentiality";
  if (/ownership|work\s+product|intellectual\s+property|\bip\b/i.test(lower)) return "ownership";
  if (/support|sla|uptime|availability|performance\s+expectations?/i.test(lower)) return "support";
  if (/term|terminat/i.test(lower)) return "term";
  if (/^notices?\b/i.test(lower) || /\bnotices?\s*$/i.test(lower)) return "notices";
  if (/miscellaneous|general\s+terms?/i.test(lower)) return "miscellaneous";
  if (/electronic\s+signatures?|counterparts?/i.test(lower)) return "electronic_signatures";
  if (
    h.length > 72 &&
    /\b(?:shall|will|agrees?|owns?|assigned|terminate|notice)\b/i.test(h) &&
    !/^(?:support|term|notices?|miscellaneous)/i.test(h)
  ) {
    if (/own|deliverable|work\s+product|assign/i.test(h)) return "ownership";
    if (/terminat|notice/i.test(h)) return "term";
    if (/fee|payment|invoice|net\s+\d+/i.test(h)) return "fees";
    if (/confidential/i.test(h)) return "confidentiality";
    if (/support|uptime|sla/i.test(h)) return "support";
  }
  return "unknown";
}

function firstTopLevelSectionNumberInText(text: string): number | null {
  for (const line of normLines(text)) {
    const heading = isTopLevelHeadingLine(line);
    if (heading) return heading.number;
  }
  return null;
}

function isTopLevelHeadingLine(line: string): { number: number; heading: string } | null {
  const trimmed = line.trim();
  if (/^\d+\.\d+(?:\.|\s)/.test(trimmed)) return null;
  const malformed = trimmed.match(MALFORMED_DOUBLE_HEADING_RE);
  if (malformed) {
    return { number: Number(malformed[2]), heading: malformed[3].trim() };
  }
  const m = trimmed.match(TOP_LEVEL_HEADING_RE);
  if (!m) return null;
  const num = Number(m[1]);
  const heading = m[2].trim();
  if (SUBCLAUSE_RE.test(trimmed) && !MALFORMED_DOUBLE_HEADING_RE.test(trimmed)) return null;
  if (heading.length > 0 && heading.length < 120) return { number: num, heading };
  if (heading.length >= 120) return { number: num, heading };
  return null;
}

function renumberSubclausesInSection(bodyLines: string[], sectionNumber: number): string[] {
  let sub = 0;
  return bodyLines.map((line) => {
    const t = line.trim();
    const subMatch = t.match(/^(\d+)\.(\d+)\.?\s+(.*)$/);
    if (subMatch) {
      sub += 1;
      return `${sectionNumber}.${sub} ${subMatch[3]}`;
    }
    const malformedSub = t.match(/^(\d+)\.\s+(\d+)\.\s+(.*)$/);
    if (malformedSub) {
      sub += 1;
      return `${sectionNumber}.${sub} ${malformedSub[3]}`;
    }
    return line;
  });
}

function mergeSectionBodies(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of [...a, ...b]) {
    const key = block.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(block);
  }
  return out;
}

function parseSectionsFromLines(lines: string[], sigLine: number): {
  introLines: string[];
  sections: ParsedCorpusSection[];
} {
  const introLines: string[] = [];
  const sections: ParsedCorpusSection[] = [];
  let current: ParsedCorpusSection | null = null;
  let inIntro = true;

  for (let i = 0; i < sigLine; i += 1) {
    const line = lines[i] ?? "";
    const heading = isTopLevelHeadingLine(line);
    if (heading) {
      inIntro = false;
      if (current) sections.push(current);
      current = {
        originalNumber: heading.number,
        heading: heading.heading,
        bodyLines: [],
        canonicalKey: resolveCanonicalSectionKey(heading.heading),
      };
      continue;
    }
    if (inIntro) {
      introLines.push(line);
      continue;
    }
    if (current) current.bodyLines.push(line);
    else introLines.push(line);
  }
  if (current) sections.push(current);
  return { introLines, sections };
}

/** When guided answers were prepended, keep the last pre-witness block that starts with Section 1. */
function keepAuthoritativePreWitnessBlock(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const preWitness = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const purposeMatches = [...preWitness.matchAll(/(?:^|\n)\s*1\.\s+Purpose\b/gim)];
  if (purposeMatches.length <= 1) return { text, repairs };
  const firstPurpose = purposeMatches[0]?.index ?? 0;
  const lastPurpose = purposeMatches[purposeMatches.length - 1]?.index ?? firstPurpose;
  const intro = preWitness.slice(0, firstPurpose).trim();
  const introLines = intro
    .split("\n")
    .filter((line) => !isTopLevelHeadingLine(line) && line.trim().length > 0);
  const authoritative = preWitness.slice(lastPurpose).trim();
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx).trim() : "";
  const merged = [joinLines(introLines), authoritative, tail].filter(Boolean).join("\n\n").trim();
  repairs.push("prewitness_block:last_section1_kept");
  return { text: merged, repairs };
}

function stripDanglingEffectiveDateFragments(lines: string[]): { lines: string[]; repairs: string[] } {
  const repairs: string[] = [];
  const out = lines.filter((line) => {
    const t = line.trim();
    if (/^signature\s+below\s*\(?\s*effective\s+date\s*\)?\.?\s*$/i.test(t)) {
      repairs.push("dangling_effective_date_fragment");
      return false;
    }
    if (/^this\s+agreement\s+is\s+effective\s+as\s+of\s+the\s+date\s+of\s+the\s+last\s*$/i.test(t)) {
      repairs.push("truncated_effective_date_intro");
      return false;
    }
    return true;
  });
  return { lines: out, repairs };
}

function fixIntroEffectiveDateSentence(introLines: string[]): string[] {
  const joined = introLines.join("\n");
  if (/\beffective\s+as\s+of\b/i.test(joined) && !/signature\s+below/i.test(joined)) {
    return introLines;
  }
  const out = [...introLines];
  const lastIdx = out.length - 1;
  if (lastIdx >= 0 && /effective\s+as\s+of\s+the\s+date\s+of\s+the\s+last\s*$/i.test(out[lastIdx]?.trim() ?? "")) {
    out[lastIdx] = out[lastIdx].replace(
      /effective\s+as\s+of\s+the\s+date\s+of\s+the\s+last\s*$/i,
      "effective as of the date of the last signature below (\"Effective Date\").",
    );
  }
  return out;
}

export function detectCorpusStructuralDefects(text: string): CorpusStructuralDefect[] {
  const defects = new Set<CorpusStructuralDefect>();
  const lines = normLines(text);
  const sigLine = signatureStartLine(lines);
  const { introLines, sections } = parseSectionsFromLines(lines, sigLine);

  if (/^\s*\d+\.\s+\d+\.\s+/m.test(text)) {
    defects.add("malformed_double_section_number");
  }
  if (/^\s*\d+\.\d+\.\s*\d+\.\s+/m.test(text)) {
    defects.add("malformed_subsection_number");
  }
  if (/signature\s+below\s*\(?\s*effective\s+date/i.test(text) && !/^1\.\s+/m.test(text.slice(0, 800))) {
    const introJoined = introLines.join("\n");
    if (!/effective\s+as\s+of/i.test(introJoined)) {
      defects.add("dangling_effective_date_fragment");
    }
  }

  const topNumbers = sections.map((s) => s.originalNumber).filter((n): n is number => n != null);
  const seenNums = new Set<number>();
  for (const n of topNumbers) {
    if (seenNums.has(n)) defects.add("duplicate_top_level_number");
    seenNums.add(n);
  }

  const purposeIdx = sections.findIndex((s) => s.canonicalKey === "purpose");
  const firstLater = sections.findIndex(
    (s) => s.canonicalKey !== "unknown" && s.canonicalKey !== "purpose" && (s.originalNumber ?? 99) >= 2,
  );
  const witnessPos = text.search(/\bIN WITNESS WHEREOF\b/i);
  const preWitness = witnessPos >= 0 ? text.slice(0, witnessPos) : text;
  const firstHeadingNumber = firstTopLevelSectionNumberInText(preWitness);
  if (firstHeadingNumber != null && firstHeadingNumber >= 2) {
    defects.add("prepended_guided_mini_agreement");
  }
  if (purposeIdx > 0 && firstLater >= 0 && purposeIdx > firstLater) {
    defects.add("section1_after_later_section");
    defects.add("prepended_guided_mini_agreement");
    defects.add("out_of_order_sections");
  }

  for (const s of sections) {
    if (
      s.heading.length > 80 &&
      resolveCanonicalSectionKey(s.heading) === "unknown" &&
      /\b(?:shall|will|agrees?)\b/i.test(s.heading)
    ) {
      defects.add("clause_sentence_heading");
    }
  }

  const witnessMatches = text.match(/\bIN WITNESS WHEREOF\b/gi);
  if (witnessMatches && witnessMatches.length > 1) {
    defects.add("duplicate_witness_block");
  }

  if (sections.length >= 2) {
    let lastNum = -1;
    for (const s of sections) {
      const n = s.originalNumber ?? 0;
      if (n > 0 && n < lastNum) defects.add("out_of_order_sections");
      if (n > 0) lastNum = n;
    }
  }

  return [...defects];
}

export function normalizeGuidedProCorpusStructure(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = (text || "").trim();
  if (!working) return { text: working, repairs };

  const lineRepairs = repairGuidedCorpusLinesBeforeStructure(working);
  working = lineRepairs.text;
  repairs.push(...lineRepairs.repairs);

  const formatted = normalizeGuidedCorpusSectionFormatting(working);
  working = formatted.text;
  repairs.push(...formatted.repairs);

  const strippedMisplaced = stripMisplacedGuidedClausesBeforeSignature(working);
  working = strippedMisplaced.text;
  repairs.push(...strippedMisplaced.repairs);

  const deduped = dedupeGuidedAnswerClauses(working);
  working = deduped.text;
  repairs.push(...deduped.repairs);

  const authoritative = keepAuthoritativePreWitnessBlock(working);
  working = authoritative.text;
  repairs.push(...authoritative.repairs);

  const dangling = stripDanglingEffectiveDateFragments(normLines(working));
  repairs.push(...dangling.repairs);

  const lines = dangling.lines;
  const sigLine = signatureStartLine(lines);
  const signatureTail = joinLines(lines.slice(sigLine));
  let { introLines, sections } = parseSectionsFromLines(lines, sigLine);
  const orphanRepartition = applyOrphanSubclausesToSections(sections, introLines);
  introLines = orphanRepartition.introLines;
  sections = orphanRepartition.sections as ParsedCorpusSection[];
  repairs.push(...orphanRepartition.repairs);

  const mergedByKey = new Map<CanonicalSectionKey, ParsedCorpusSection>();
  for (const [sectionNumber, lines] of orphanRepartition.remainingOrphans) {
    const keyName = canonicalKeyForSectionNumber(sectionNumber);
    if (!keyName || lines.length === 0) continue;
    const key = keyName as CanonicalSectionKey;
    const existing = mergedByKey.get(key);
    if (existing) {
      mergedByKey.set(key, {
        ...existing,
        bodyLines: mergeSectionBodies(existing.bodyLines, lines),
      });
    } else {
      mergedByKey.set(key, {
        originalNumber: sectionNumber,
        heading: CANONICAL_SECTION_SPECS.find((s) => s.key === key)?.label ?? `Section ${sectionNumber}`,
        bodyLines: lines,
        canonicalKey: key,
      });
    }
    repairs.push(`orphan_bucket:${sectionNumber}`);
  }
  const unknownSections: ParsedCorpusSection[] = [];

  for (const section of sections) {
    const key =
      section.canonicalKey === "unknown"
        ? resolveCanonicalSectionKey(section.heading)
        : section.canonicalKey;
    const normalized: ParsedCorpusSection = { ...section, canonicalKey: key };
    if (key === "unknown") {
      const retryKey = resolveCanonicalSectionKey(section.heading);
      if (retryKey !== "unknown") {
        const existing = mergedByKey.get(retryKey);
        if (existing) {
          mergedByKey.set(retryKey, {
            ...existing,
            bodyLines: mergeSectionBodies(existing.bodyLines, normalized.bodyLines),
          });
          repairs.push(`merge_unknown_into:${retryKey}`);
        } else {
          mergedByKey.set(retryKey, { ...normalized, canonicalKey: retryKey });
        }
        continue;
      }
      unknownSections.push(normalized);
      continue;
    }
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, normalized);
      continue;
    }
    repairs.push(`merge_duplicate_section:${key}`);
    mergedByKey.set(key, {
      ...existing,
      bodyLines: mergeSectionBodies(existing.bodyLines, normalized.bodyLines),
      heading: existing.heading.length >= normalized.heading.length ? existing.heading : normalized.heading,
    });
  }

  const introFixed = fixIntroEffectiveDateSentence(introLines).filter((line) => {
    const heading = isTopLevelHeadingLine(line);
    if (heading) {
      repairs.push(`intro_strip_heading:${heading.number}`);
      return false;
    }
    return line.trim().length > 0;
  });
  const rebuilt: string[] = [];
  if (joinLines(introFixed).trim()) {
    rebuilt.push(joinLines(introFixed));
  }

  if (!mergedByKey.has("purpose")) {
    mergedByKey.set("purpose", {
      originalNumber: 1,
      heading: "Purpose and Scope",
      bodyLines: [],
      canonicalKey: "purpose",
    });
    repairs.push("canonical_section:purpose_created");
  }

  for (const spec of CANONICAL_SECTION_SPECS) {
    const section = mergedByKey.get(spec.key);
    if (!section) continue;
    if (isStructurallyEmptySectionBody(section.bodyLines)) {
      logGuidedEmptySectionPruned({
        sectionNumber: spec.number,
        title: spec.label,
        bodyLength: 0,
        source: "canonical_emit",
        canonicalKey: spec.key,
      });
      repairs.push(`prune_empty_section:${spec.key}`);
      if (spec.key === "purpose") {
        rebuilt.push(`${spec.number}. ${spec.label}`);
      }
      continue;
    }
    const body = renumberSubclausesInSection(section.bodyLines, spec.number).map((line) =>
      line.replace(/^(\s*)\d+\.\s+(\d+)\.\s+/, (_, indent, second) => {
        repairs.push("body_malformed_subclause");
        return `${indent}${spec.number}.${second}. `;
      }),
    );
    const bodyText = joinLines(body);
    rebuilt.push(`${spec.number}. ${spec.label}${bodyText ? `\n${bodyText}` : ""}`);
    repairs.push(`canonical_section:${spec.key}`);
  }

  let body = rebuilt.filter(Boolean).join("\n\n").trim();
  if (signatureTail) {
    body = `${body}\n\n${signatureTail}`.trim();
  }

  const secondPass = normalizeGuidedCorpusSectionFormatting(body);
  body = secondPass.text;
  repairs.push(...secondPass.repairs);

  const finalLineRepairs = repairGuidedCorpusLinesBeforeStructure(body);
  body = finalLineRepairs.text;
  repairs.push(...finalLineRepairs.repairs.map((r) => `final:${r}`));
  const finalOrphanHeadings = stripOrphanNumberedHeadingLines(body);
  body = finalOrphanHeadings.text;
  repairs.push(...finalOrphanHeadings.repairs.map((r) => `final:${r}`));

  body = body
    .replace(/\b7\.\s+8\.\s+Notices\b/gi, () => {
      repairs.push("final_malformed_notices_heading");
      return "7. Notices";
    })
    .replace(/\b2\.\s+3\.\s+All payments\b/gi, () => {
      repairs.push("final_malformed_payment_subclause");
      return "2.3. All payments";
    })
    .replace(/^\s*signature\s+below\s*\([^)]*effective\s+date[^)]*\)\.?\s*$/gim, () => {
      repairs.push("final_dangling_effective_date");
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: body, repairs };
}

export function validateCorpusStructureBeforeFreeze(text: string): {
  ok: boolean;
  defects: CorpusStructuralDefect[];
} {
  const defects = detectCorpusStructuralDefects(text);
  return { ok: defects.length === 0, defects };
}

/** Post-normalization validation — canonical section order, no malformed headings. */
export function validateNormalizedCorpusStructure(text: string): {
  ok: boolean;
  defects: string[];
} {
  const defects: string[] = [];
  if (/\b7\.\s+8\.\s+Notices\b/i.test(text) || /\b2\.\s+3\.\s+All payments\b/i.test(text)) {
    defects.push("malformed_double_section_number");
  }
  if (/^\s*signature\s+below\s*\([^)]*effective\s+date[^)]*\)\.?\s*$/im.test(text)) {
    defects.push("dangling_effective_date_fragment");
  }
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const preWitness = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const firstHeadingNumber = firstTopLevelSectionNumberInText(preWitness);
  if (!/(?:^|\n)\s*1\.\s+Purpose\b/im.test(preWitness)) {
    defects.push("missing_section_1");
  }
  if (firstHeadingNumber != null && firstHeadingNumber >= 2) {
    defects.push("prepended_guided_mini_agreement");
  }
  if ((text.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length > 1) {
    defects.push("duplicate_witness_block");
  }
  if (/^[^\n]*\b6\.1\b[^\n]*\b8\.1\b[^\n]*$/im.test(text)) {
    defects.push("merged_subclause_line");
  }
  if (/^\s*(?:\*{0,2})?8\.(?:\*{0,2})?\s*$/im.test(text)) {
    defects.push("orphan_section_8_heading");
  }
  if (/^\s*\d+\.\d+\.?\s*$/m.test(text.replace(/\*\*/g, ""))) {
    defects.push("orphan_empty_subsection");
  }
  if ((text.match(/Contractor will invoice Company monthly in arrears/gi) ?? []).length > 1) {
    defects.push("duplicate_invoice_clause");
  }
  const feesAfterNine = preWitness.search(/\b9\.\s+Electronic Signatures[\s\S]*\n\s*2\.\s+Fees and Payment/i);
  if (feesAfterNine >= 0) {
    defects.push("guided_section_dump_after_electronic_signatures");
  }
  if (/Execution and signature placement are handled in the electronic signing step/i.test(text)) {
    defects.push("stale_execution_placement_footer");
  }
  return { ok: defects.length === 0, defects };
}

export function logGuidedCorpusSectionNormalized(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-corpus-section-normalized]", payload);
}

export function logGuidedCorpusIntegrityWarn(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[guided-corpus-integrity-warn]", payload);
}

export function logGuidedCorpusIntegrityFail(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[guided-corpus-integrity-fail]", payload);
}

export function logGuidedCorpusStructureNormalization(payload: Record<string, unknown>): void {
  logGuidedCorpusSectionNormalized(payload);
}

export function logGuidedCorpusStructureBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[guided-final-corpus-structure-blocked]", payload);
}
