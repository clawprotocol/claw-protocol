/**
 * Professional document quality floor — display-layer repairs only.
 * Never mutates frozen source-of-truth authority.
 */

import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
import { repairGluedSectionHeadingsInText, splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { repairInlineCollapsedStarterLayout } from "./starterPreviewFormatting";

export type DocumentQualityFloorResult = {
  text: string;
  repairs: string[];
};

const MALFORMED_PUNCTUATION_RES: readonly { pattern: RegExp; replacement: string; tag: string }[] = [
  { pattern: /\.\s*;/g, replacement: ".", tag: "period_semicolon" },
  { pattern: /;\s*\./g, replacement: ";", tag: "semicolon_period" },
  { pattern: /\.{2,}/g, replacement: ".", tag: "duplicate_period" },
  { pattern: /\s+([,.;:!?])/g, replacement: "$1", tag: "space_before_punct" },
  { pattern: /([,.;:!?])([A-Za-z])/g, replacement: "$1 $2", tag: "missing_space_after_punct" },
];

const TERMINATION_HEADING_RE = /^\s*\d+\.?\s*termination\b/i;

function repairMalformedPunctuation(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  for (const { pattern, replacement, tag } of MALFORMED_PUNCTUATION_RES) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      pattern.lastIndex = 0;
      out = out.replace(pattern, replacement);
      repairs.push(`punctuation:${tag}`);
    }
    pattern.lastIndex = 0;
  }
  return { text: out, repairs };
}

const ESIGN_NOTICE_RE =
  /This agreement will be executed electronically via LawDog\.?/i;

function repairBrokenEsignNoticeSpan(text: string): { text: string; repairs: string[] } {
  const broken = /This agreement will be\s*\n+\s*executed electronically via LawDog\.?/gi;
  if (!broken.test(text)) return { text, repairs: [] };
  broken.lastIndex = 0;
  return {
    text: text.replace(broken, AGREEMENT_PREVIEW_ESIGN_NOTICE),
    repairs: ["esign_notice_rejoined"],
  };
}

/** Split e-sign notice out of termination section body into its own paragraph. */
function separateEsignFromTerminationSection(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let inTermination = false;
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (TERMINATION_HEADING_RE.test(trimmed)) {
      inTermination = true;
      out.push(line);
      continue;
    }
    if (inTermination && /^\s*\d+\.\s+/i.test(trimmed) && !TERMINATION_HEADING_RE.test(trimmed)) {
      inTermination = false;
    }
    if (inTermination && ESIGN_NOTICE_RE.test(trimmed)) {
      const esignIdx = trimmed.search(ESIGN_NOTICE_RE);
      const before = trimmed.slice(0, esignIdx).trim();
      const esignPart = trimmed.slice(esignIdx).trim();
      if (before) out.push(before);
      out.push("");
      out.push(esignPart);
      repairs.push("esign_separated_from_termination");
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n"), repairs };
}

function repairGluedNumberedSectionHeadings(text: string): { text: string; repairs: string[] } {
  let out = repairGluedSectionHeadingsInText(text);
  const repairs: string[] = [];
  const gluedPayment = out.match(/^(\d+\.\s+Payment Terms)\s+(\$\s*[\d,]+.+)$/im);
  if (gluedPayment) {
    out = out.replace(
      gluedPayment[0],
      `${gluedPayment[1]!.trim()}\n\n${gluedPayment[2]!.trim()}`,
    );
    repairs.push("glued_payment_heading");
  }
  const gluedTerm = out.match(
    /^(\d+\.\s+(?:Services Term and Effective Date|Term and Effective Date|Services Term))\s+(Term:.+)$/im,
  );
  if (gluedTerm) {
    out = out.replace(gluedTerm[0], `${gluedTerm[1]!.trim()}\n\n${gluedTerm[2]!.trim()}`);
    repairs.push("glued_term_heading");
  }
  const lines = out.split("\n");
  const fixed = lines.map((line) => {
    const split = splitGluedSectionHeadingFromLine(line);
    if (split !== line) {
      repairs.push("glued_section_heading");
      return split;
    }
    return line;
  });
  if (repairs.length) out = fixed.join("\n");
  return { text: out, repairs };
}

function dedupeConsecutiveRoleWords(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  const dupRe = /\b(Client|Service Provider|Party \d+)\s+\1\b/gi;
  if (dupRe.test(out)) {
    dupRe.lastIndex = 0;
    out = out.replace(dupRe, "$1");
    repairs.push("duplicate_role_label");
  }
  return { text: out, repairs };
}

/**
 * Apply universal professional quality repairs to user-visible agreement text.
 * Display-only — safe for Starter and Pro render paths; never write back to SoT.
 */
export function applyDocumentQualityFloor(text: string): DocumentQualityFloorResult {
  const repairs: string[] = [];
  if (!text.trim()) return { text: "", repairs };

  let working = repairInlineCollapsedStarterLayout(text);

  const punct = repairMalformedPunctuation(working);
  working = punct.text;
  repairs.push(...punct.repairs);

  const glued = repairGluedNumberedSectionHeadings(working);
  working = glued.text;
  repairs.push(...glued.repairs);

  const esign = separateEsignFromTerminationSection(working);
  working = esign.text;
  repairs.push(...esign.repairs);

  const esignRejoin = repairBrokenEsignNoticeSpan(working);
  working = esignRejoin.text;
  repairs.push(...esignRejoin.repairs);

  const dupRole = dedupeConsecutiveRoleWords(working);
  working = dupRole.text;
  repairs.push(...dupRole.repairs);

  const structure = applySectionStructureIntegrity(working, { source: "document_quality_floor" });
  working = structure.text;
  if (structure.repaired) {
    repairs.push(...structure.repairs.map((tag) => `section_structure:${tag}`));
  }

  working = working.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text: working, repairs };
}
