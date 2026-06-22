/**
 * Clause Family Structural Integrity — platform validation before authoritative freeze.
 *
 * Repair may run upstream; freeze is allowed only when structural validation passes.
 */

import { countStandaloneClauseFamilyHeadings, type OperativeClauseFamily } from "./clauseFamilyRegistry";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  extractOperativeIfToNoticeStanzas,
  hasInlineMalformedNoticeStanzas,
  noticeStanzaContainsPlaceholderTokens,
  noticeStanzaHasExecutionPollution,
  noticeStanzaHasRoleLabelCorruption,
  resolveOperativeNoticesFamilyEnd,
} from "./paidProPartyNoticeDetails";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

export type ClauseFamilyStructuralViolation = {
  family: OperativeClauseFamily | "structural";
  code: string;
  message: string;
};

export type ClauseFamilyStructuralIntegrityReport = {
  ok: boolean;
  violations: ClauseFamilyStructuralViolation[];
  familyPresence: Partial<Record<OperativeClauseFamily, boolean>>;
};

const NOTICES_HEADING_RE =
  /(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)(?:Notices|Notice\s+Addresses?)\b|(?:^|\n)\s*\d+\.\s+[^\n]*\bNotices\b/i;

const NOTICES_OPERATIVE_TEXT_RE =
  /\bnotices?\s+(?:must|shall|are|is|will|may|under\s+this\s+agreement)\b/i;

const ORPHAN_EMAIL_LINE_RE = /^\s*Email(?:\s+for\s+Notice)?\s*:\s*$/i;
const ORPHAN_ADDRESS_LINE_RE = /^\s*Address(?:\s+for\s+Notice)?\s*:\s*$/i;
const MALFORMED_NOTICE_LABEL_RE = /^\s*Email\s+for\s+Notices?\s*:/i;
const FUSED_NOTICES_HEADING_RE = /[a-z]\.\d+\.\s+Notices\b/i;

function isOrphanLabelLine(lines: readonly string[], idx: number): boolean {
  const trimmed = lines[idx]?.trim() ?? "";
  if (!trimmed) return false;
  for (let j = idx + 1; j < lines.length; j++) {
    const next = lines[j]?.trim() ?? "";
    if (!next) continue;
    if (/^If to\s+/i.test(next) || /^\d+\.\s+/.test(next) || /^IN WITNESS\b/i.test(next)) {
      return true;
    }
    return false;
  }
  return true;
}

function noticesRegionSlice(corpus: string): string {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const heading = text.match(NOTICES_HEADING_RE);
  if (!heading || heading.index == null) return "";
  const start = heading.index;
  const end = resolveOperativeNoticesFamilyEnd(text, start);
  return text.slice(start, end);
}

function countIfToStanzas(noticesRegion: string): number {
  const stanzas = extractOperativeIfToNoticeStanzas(noticesRegion);
  if (!stanzas.trim()) return 0;
  return stanzas.split(/\n\n(?=If to\s+)/i).filter((s) => s.trim()).length || 1;
}

export function validateNoticesClauseFamilyStructuralIntegrity(
  corpus: string,
  opts?: { parties?: readonly PaidProSignerMetadataParty[]; requireTwoPartyStanzas?: boolean },
): ClauseFamilyStructuralViolation[] {
  const violations: ClauseFamilyStructuralViolation[] = [];
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const hasProperHeading = NOTICES_HEADING_RE.test(text);
  const region = noticesRegionSlice(text);

  if (hasInlineMalformedNoticeStanzas(text)) {
    violations.push({
      family: "notices",
      code: "inline_malformed_notice_stanzas",
      message: "Inline or fused If to notice stanzas are forbidden.",
    });
  }

  if (FUSED_NOTICES_HEADING_RE.test(text)) {
    violations.push({
      family: "notices",
      code: "notices_heading_fused_to_prior_clause",
      message: "Notices heading must not be fused to prior clause text.",
    });
  }

  if (!hasProperHeading) {
    violations.push({
      family: "notices",
      code: "missing_notices_heading",
      message: "Notices section heading is required before freeze.",
    });
    return violations;
  }

  if (!region.trim()) {
    violations.push({
      family: "notices",
      code: "missing_notices_region",
      message: "Notices region is empty.",
    });
    return violations;
  }

  if (!NOTICES_OPERATIVE_TEXT_RE.test(region) && countIfToStanzas(region) < 2) {
    violations.push({
      family: "notices",
      code: "missing_operative_notice_text",
      message: "Notices family requires operative notice delivery text or complete party stanzas.",
    });
  }

  const stanzaBlob = extractOperativeIfToNoticeStanzas(region);
  const stanzaCount = countIfToStanzas(region);
  const requireTwo = opts?.requireTwoPartyStanzas !== false;

  if (requireTwo && stanzaCount < 2) {
    violations.push({
      family: "notices",
      code: "missing_party_notice_stanzas",
      message: `Expected at least 2 If to notice stanzas; found ${stanzaCount}.`,
    });
  }

  if (stanzaBlob) {
    const stanzas = stanzaBlob.split(/\n\n(?=If to\s+)/i).filter((s) => s.trim());
    for (const [idx, stanza] of stanzas.entries()) {
      if (noticeStanzaContainsPlaceholderTokens(stanza)) {
        violations.push({
          family: "notices",
          code: "notice_stanza_placeholder_token",
          message: `Party ${idx + 1} notice stanza contains placeholder tokens.`,
        });
      }
      if (noticeStanzaHasExecutionPollution(stanza)) {
        violations.push({
          family: "notices",
          code: "notice_stanza_execution_pollution",
          message: `Party ${idx + 1} notice stanza contains execution-block pollution.`,
        });
      }
      if (noticeStanzaHasRoleLabelCorruption(stanza)) {
        violations.push({
          family: "notices",
          code: "notice_stanza_role_corruption",
          message: `Party ${idx + 1} notice stanza has corrupted role labels.`,
        });
      }
      const entityLine = stanza.split("\n")[1]?.trim() ?? "";
      if (!entityLine || entityLine.length < 3) {
        violations.push({
          family: "notices",
          code: "empty_notice_entity_name",
          message: `Party ${idx + 1} notice stanza missing legal entity line.`,
        });
      }
    }
  }

  const regionLines = region.split("\n");
  for (const [idx, line] of regionLines.entries()) {
    const trimmed = line.trim();
    if (ORPHAN_EMAIL_LINE_RE.test(trimmed) && isOrphanLabelLine(regionLines, idx)) {
      violations.push({
        family: "notices",
        code: "orphan_email_line",
        message: "Orphan Email line without value is forbidden.",
      });
    }
    if (ORPHAN_ADDRESS_LINE_RE.test(trimmed) && isOrphanLabelLine(regionLines, idx)) {
      violations.push({
        family: "notices",
        code: "orphan_address_line",
        message: "Orphan Address line without value is forbidden.",
      });
    }
    if (MALFORMED_NOTICE_LABEL_RE.test(trimmed)) {
      violations.push({
        family: "notices",
        code: "malformed_notice_label",
        message: "Malformed notice email label is forbidden.",
      });
    }
  }

  return violations;
}

export function validateGoverningLawClauseFamilyStructuralIntegrity(
  corpus: string,
): ClauseFamilyStructuralViolation[] {
  const violations: ClauseFamilyStructuralViolation[] = [];
  const count = countStandaloneClauseFamilyHeadings(corpus, "governing_law");
  if (count > 1) {
    violations.push({
      family: "governing_law",
      code: "duplicate_governing_law_heading",
      message: `Duplicate standalone Governing Law headings (${count}).`,
    });
  }
  if (count >= 1 && !/\b(?:governed\s+by|governing\s+law|laws?\s+of)\b/i.test(corpus)) {
    violations.push({
      family: "governing_law",
      code: "governing_law_missing_operative_text",
      message: "Governing Law heading without operative governing text.",
    });
  }
  return violations;
}

export function validateExecutionClauseFamilyStructuralIntegrity(
  corpus: string,
): ClauseFamilyStructuralViolation[] {
  const violations: ClauseFamilyStructuralViolation[] = [];
  const blocks = countPaidProExecutionBlocks(corpus);
  if (blocks === 0) {
    violations.push({
      family: "execution_block",
      code: "missing_execution_block",
      message: "Execution block (IN WITNESS WHEREOF) is required before freeze.",
    });
  }
  if (blocks > 1) {
    violations.push({
      family: "execution_block",
      code: "duplicate_execution_block",
      message: `Duplicate execution blocks (${blocks}).`,
    });
  }
  return violations;
}

export function validateClauseFamilyStructuralIntegrity(
  corpus: string,
  opts?: {
    parties?: readonly PaidProSignerMetadataParty[];
    families?: OperativeClauseFamily[];
    requireNotices?: boolean;
  },
): ClauseFamilyStructuralIntegrityReport {
  const families = opts?.families ?? [
    "notices",
    "governing_law",
    "execution_block",
  ];
  const violations: ClauseFamilyStructuralViolation[] = [];

  if (families.includes("notices") || opts?.requireNotices !== false) {
    violations.push(...validateNoticesClauseFamilyStructuralIntegrity(corpus, opts));
  }
  if (families.includes("governing_law")) {
    violations.push(...validateGoverningLawClauseFamilyStructuralIntegrity(corpus));
  }
  if (families.includes("execution_block")) {
    violations.push(...validateExecutionClauseFamilyStructuralIntegrity(corpus));
  }

  return {
    ok: violations.length === 0,
    violations,
    familyPresence: {
      notices: NOTICES_HEADING_RE.test(corpus),
      governing_law: countStandaloneClauseFamilyHeadings(corpus, "governing_law") > 0,
      execution_block: countPaidProExecutionBlocks(corpus) > 0,
    },
  };
}

/** Hard gate — throws when any clause family fails structural validation. */
export function assertClauseFamilyStructuralIntegrityForFreeze(
  corpus: string,
  opts?: Parameters<typeof validateClauseFamilyStructuralIntegrity>[1] & { surface?: string },
): void {
  const report = validateClauseFamilyStructuralIntegrity(corpus, opts);
  if (!report.ok) {
    const codes = report.violations.map((v) => v.code).join(",");
    throw new Error(
      `[paid-pro-clause-family-structural-blocked] surface=${opts?.surface ?? "freeze"} codes=${codes}`,
    );
  }
}
