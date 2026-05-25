/**
 * Line-level guided Pro corpus repairs before section parsing / normalization.
 */

import { findSignatureRegionStart } from "./signatureRegion";

const MERGED_SUBCLAUSE_IN_LINE_RE =
  /^(\d+\.\d+)\s+(.+?)\s+(\d+\.\d+)\s+(.+)$/;

function subsectionContentHostNumber(line: string): number | null {
  const t = line.toLowerCase();
  if (/\b(?:confidential|non-public|proprietary information)\b/.test(t)) return 3;
  if (/\b(?:uptime|sla|support hours|production automation)\b/.test(t)) return 5;
  if (/\b(?:termination|renewal|notice period)\b/.test(t) && !/\bconfidential\b/.test(t)) return 6;
  if (/\b(?:deliverables|work product|ownership|background technology)\b/.test(t)) return 4;
  if (/\b(?:invoice|net\s*30|monthly service fee|payment timing)\b/.test(t)) return 2;
  if (/\b(?:purpose|scope of services)\b/.test(t)) return 1;
  if (/\b(?:notices|notice address)\b/.test(t)) return 7;
  if (/\b(?:electronic signature|counterpart)\b/.test(t)) return 9;
  return null;
}

const GUIDED_INSTRUCTION_LEAK_RES: readonly RegExp[] = [
  /^Add LLC suffixes\b/i,
  /^Use full legal entity names with LLC\/Inc\.\s+suffixes\b/i,
];

const EXECUTION_PLACEMENT_FOOTER_RE =
  /Execution and signature placement are handled in the electronic signing step\.?/gi;

/** Split lines like "6.1 Each Party... 8.1 All notices..." into separate subclauses. */
export function splitMergedSubclauseLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [line];
  const merged = trimmed.match(MERGED_SUBCLAUSE_IN_LINE_RE);
  if (!merged) return [line];
  const first = `${merged[1]} ${merged[2]}`.trim();
  const tail = `${merged[3]} ${merged[4]}${trimmed.slice(merged[0].length)}`.trim();
  if (!tail) return [first];
  return [first, ...splitMergedSubclauseLine(tail)];
}

/** Remove guided UI pill/instruction text accidentally merged into agreement body. */
export function stripGuidedInstructionLeakLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t && GUIDED_INSTRUCTION_LEAK_RES.some((re) => re.test(t))) {
      repairs.push(`strip_instruction_leak:${t.slice(0, 24)}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

export function splitMergedSubclausesInText(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const parts = splitMergedSubclauseLine(line);
    if (parts.length > 1) repairs.push("split_merged_subclause");
    out.push(...parts);
  }
  return { text: out.join("\n"), repairs };
}

/** Remove exact duplicate non-empty lines (common for invoice boilerplate). */
export function dedupeRepeatingSentenceLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const key = line.trim().toLowerCase();
    if (key.length >= 48) {
      if (seen.has(key)) {
        repairs.push("dedupe_line");
        continue;
      }
      seen.add(key);
    }
    out.push(line);
  }
  return { text: out.join("\n"), repairs };
}

export function stripStaleExecutionPlacementCorpusCopy(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const hasWitness = /\bIN WITNESS WHEREOF\b/i.test(text);
  const hasByLine = /\b(?:By|Signature)\s*:\s*_{2,}/i.test(text);
  if (!hasWitness && !hasByLine) return { text, repairs };
  if (!EXECUTION_PLACEMENT_FOOTER_RE.test(text)) return { text, repairs };
  EXECUTION_PLACEMENT_FOOTER_RE.lastIndex = 0;
  const next = text.replace(EXECUTION_PLACEMENT_FOOTER_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  repairs.push("strip_execution_placement_footer");
  return { text: next, repairs };
}

/**
 * Remove top-level guided-answer section dumps that appear after Electronic Signatures
 * and before the witness block (answers belong in canonical sections only).
 */
export function stripTrailingGuidedSectionDumpBeforeWitness(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text, repairs };
  const before = text.slice(0, witnessIdx);
  const tail = text.slice(witnessIdx);
  const electronicIdx = before.search(/\b9\.\s+Electronic Signatures/i);
  if (electronicIdx < 0) return { text, repairs };

  const afterElectronic = before.slice(electronicIdx);
  const dumpHeadingRe =
    /^(?:2\.\s+Fees and Payment|4\.\s+Ownership and Work Product|5\.\s+Support Expectations|6\.\s+Term and Termination)\s*$/im;
  if (!dumpHeadingRe.test(afterElectronic)) return { text, repairs };

  const lines = before.split("\n");
  let cutAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = lines[i]?.trim() ?? "";
    if (dumpHeadingRe.test(t)) {
      cutAt = i;
      repairs.push(`strip_trailing_guided_dump:${t.slice(0, 28)}`);
      break;
    }
  }
  if (cutAt >= lines.length) return { text, repairs };
  const kept = lines.slice(0, cutAt).join("\n").trimEnd();
  return { text: `${kept}\n\n${tail}`.replace(/\n{3,}/g, "\n\n"), repairs };
}

export function extractOrphanSubclausesFromBodyLines(
  bodyLines: string[],
  hostSectionNumber: number | null,
): { kept: string[]; orphans: Map<number, string[]> } {
  const kept: string[] = [];
  const orphans = new Map<number, string[]>();
  for (const raw of bodyLines) {
    for (const line of splitMergedSubclauseLine(raw)) {
      const t = line.trim();
      const sub = t.match(/^(\d+)\.(\d+)\s+/);
      if (sub && hostSectionNumber != null && Number(sub[1]) !== hostSectionNumber) {
        const subNum = Number(sub[1]);
        const hinted = subsectionContentHostNumber(line);
        const target =
          subNum !== hostSectionNumber ? (hinted ?? subNum) : hinted && hinted !== hostSectionNumber ? hinted : subNum;
        const bucket = orphans.get(target) ?? [];
        bucket.push(line);
        orphans.set(target, bucket);
        continue;
      }
      if (sub && hostSectionNumber == null && Number(sub[1]) >= 2) {
        const n = Number(sub[1]);
        const bucket = orphans.get(n) ?? [];
        bucket.push(line);
        orphans.set(n, bucket);
        continue;
      }
      kept.push(line);
    }
  }
  return { kept, orphans };
}

const SECTION_NUMBER_TO_CANONICAL: Record<number, string> = {
  1: "purpose",
  2: "fees",
  3: "confidentiality",
  4: "ownership",
  5: "support",
  6: "term",
  7: "notices",
  8: "miscellaneous",
  9: "electronic_signatures",
};

export function applyOrphanSubclausesToSections(
  sections: Array<{ originalNumber: number | null; bodyLines: string[] }>,
  introLines: string[],
): {
  sections: Array<{ originalNumber: number | null; bodyLines: string[] }>;
  introLines: string[];
  remainingOrphans: Map<number, string[]>;
  repairs: string[];
} {
  const repairs: string[] = [];
  const orphanByNumber = new Map<number, string[]>();

  const introOrphans = extractOrphanSubclausesFromBodyLines(introLines, null);
  introLines = introOrphans.kept;
  for (const [n, lines] of introOrphans.orphans) {
    orphanByNumber.set(n, [...(orphanByNumber.get(n) ?? []), ...lines]);
    repairs.push(`orphan_from_intro:${n}`);
  }

  const nextSections = sections.map((section) => {
    const { kept, orphans } = extractOrphanSubclausesFromBodyLines(
      section.bodyLines,
      section.originalNumber,
    );
    for (const [n, lines] of orphans) {
      orphanByNumber.set(n, [...(orphanByNumber.get(n) ?? []), ...lines]);
      repairs.push(`orphan_from_section:${section.originalNumber ?? "?"}:${n}`);
    }
    return { ...section, bodyLines: kept };
  });

  for (const section of nextSections) {
    const n = section.originalNumber;
    if (n == null) continue;
    const orphanLines = orphanByNumber.get(n);
    if (!orphanLines?.length) continue;
    section.bodyLines = [...section.bodyLines, ...orphanLines];
    orphanByNumber.delete(n);
    repairs.push(`orphan_applied:${n}`);
  }

  return { sections: nextSections, introLines, remainingOrphans: orphanByNumber, repairs };
}

export function canonicalKeyForSectionNumber(sectionNumber: number): string | null {
  return SECTION_NUMBER_TO_CANONICAL[sectionNumber] ?? null;
}

const ORPHAN_NUMBERED_HEADING_RE = /^\s*(?:\*{0,2})?(\d+)\.(?:\*{0,2})?\s*$/;
const ORPHAN_EMPTY_SUBSECTION_RE = /^\s*\d+\.\d+\.?\s*$/;
const ORPHAN_MARKDOWN_NUMBERED_HEADING_RE = /^\s*\*{1,2}\s*\d+(?:\.\d+)*\.?\s*\*{0,2}\s*$/;

export function stripOrphanNumberedHeadingLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (ORPHAN_NUMBERED_HEADING_RE.test(t)) {
      repairs.push(`orphan_numbered_heading:${t.slice(0, 12)}`);
      continue;
    }
    if (ORPHAN_EMPTY_SUBSECTION_RE.test(t)) {
      repairs.push(`orphan_empty_subsection:${t}`);
      continue;
    }
    if (ORPHAN_MARKDOWN_NUMBERED_HEADING_RE.test(t)) {
      repairs.push(`orphan_markdown_numbered_heading:${t.slice(0, 12)}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

export function renumberGuidedTopLevelSectionsSequentially(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const witnessIdx = normalized.search(/\bIN WITNESS WHEREOF\b/i);
  const before = witnessIdx >= 0 ? normalized.slice(0, witnessIdx) : normalized;
  const after = witnessIdx >= 0 ? normalized.slice(witnessIdx) : "";
  let nextSection = 1;
  let currentOldSection: number | null = null;
  let currentNewSection: number | null = null;

  const lines = before.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (ORPHAN_NUMBERED_HEADING_RE.test(trimmed) || ORPHAN_EMPTY_SUBSECTION_RE.test(trimmed)) {
      repairs.push(`final_renumber_strip_orphan:${trimmed.slice(0, 16)}`);
      return "";
    }
    const heading = trimmed.match(/^\*{0,2}\s*(\d+)\.\s+(.+?)\s*\*{0,2}$/);
    if (heading && !/^\d+\.\d+\.?\s+/.test(trimmed)) {
      const oldSection = Number(heading[1]);
      const title = heading[2].replace(/\*\*/g, "").trim();
      const newSection = nextSection;
      nextSection += 1;
      currentOldSection = oldSection;
      currentNewSection = newSection;
      if (oldSection !== newSection || /\*\*/.test(trimmed)) {
        repairs.push(`final_renumber_section:${oldSection}->${newSection}`);
      }
      return `${newSection}. ${title}`;
    }
    const sub = trimmed.match(/^(\d+)\.(\d+)\.?\s+(.+)$/);
    if (sub && currentOldSection != null && currentNewSection != null && Number(sub[1]) === currentOldSection) {
      if (currentOldSection !== currentNewSection) {
        repairs.push(`final_renumber_subclause:${currentOldSection}.${sub[2]}->${currentNewSection}.${sub[2]}`);
      }
      return `${currentNewSection}.${sub[2]} ${sub[3].replace(/\*\*/g, "").trim()}`;
    }
    if (/\*\*/.test(trimmed)) {
      repairs.push("final_strip_markdown_asterisks");
      return line.replace(/\*\*/g, "");
    }
    return line;
  });

  const repaired = [lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), after.trim()]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return { text: repaired, repairs };
}

export function isStructurallyEmptySectionBody(bodyLines: string[]): boolean {
  const substantive = bodyLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !ORPHAN_NUMBERED_HEADING_RE.test(l))
    .filter((l) => !ORPHAN_EMPTY_SUBSECTION_RE.test(l));
  return substantive.length === 0;
}

export function logGuidedEmptySectionPruned(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-empty-section-pruned]", payload);
}

export function repairGuidedCorpusLinesBeforeStructure(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").trim();
  if (!out) return { text: out, repairs };

  const split = splitMergedSubclausesInText(out);
  out = split.text;
  repairs.push(...split.repairs);

  const instructionLeak = stripGuidedInstructionLeakLines(out);
  out = instructionLeak.text;
  repairs.push(...instructionLeak.repairs);

  const orphanHeadings = stripOrphanNumberedHeadingLines(out);
  out = orphanHeadings.text;
  repairs.push(...orphanHeadings.repairs);

  const dedupeLines = dedupeRepeatingSentenceLines(out);
  out = dedupeLines.text;
  repairs.push(...dedupeLines.repairs);

  const stripDump = stripTrailingGuidedSectionDumpBeforeWitness(out);
  out = stripDump.text;
  repairs.push(...stripDump.repairs);

  const stripFooter = stripStaleExecutionPlacementCorpusCopy(out);
  out = stripFooter.text;
  repairs.push(...stripFooter.repairs);

  const sigStart = findSignatureRegionStart(out);
  if (sigStart < 0) return { text: out, repairs };

  return { text: out, repairs };
}
