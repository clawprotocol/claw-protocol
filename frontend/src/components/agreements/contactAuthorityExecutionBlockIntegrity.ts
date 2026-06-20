/**
 * Contact Authority & Execution Block Integrity — display-layer authority.
 *
 * Contact Authority ≠ Signature Authority.
 * Execution blocks may contain only signing-capacity fields; notice destinations are
 * governed by the Notices clause and signer metadata — never execution-block rendering.
 *
 * Display-only — never mutates source-of-truth, signer-count, party, or section authority.
 */

import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import { extractOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";

export const DEFAULT_LAWDOG_NOTICES_CLAUSE =
  "Notices under this Agreement must be in writing and may be delivered by email, nationally recognized overnight courier, certified mail, or any other method the parties later approve in writing. A notice sent by email is effective when sent, provided the sender does not receive an automated delivery failure notice. A notice sent by courier or certified mail is effective when delivered or when delivery is refused.\n\nUnless a party designates a different notice address in writing, email notices may be sent to the email address that party provides through the LawDog signing process. Mailing notices may be sent to the address that party provides through the LawDog signing process or later designates in writing.";

export type ContactAuthorityContaminationCode =
  | "execution_block_email_placeholder"
  | "execution_block_address_placeholder"
  | "execution_block_email_value"
  | "execution_block_address_value"
  | "execution_block_phone_value"
  | "execution_block_loose_contact_line"
  | "execution_block_notice_instruction";

export type ContactAuthorityDiagnostic = {
  code: ContactAuthorityContaminationCode;
  message: string;
  lineIndex?: number;
};

export type ContactAuthorityAnalysisResult = {
  diagnostics: ContactAuthorityDiagnostic[];
  contaminationCount: number;
  executionBlockStart: number;
};

export type ContactAuthorityIntegrityResult = ContactAuthorityAnalysisResult & {
  text: string;
  repairs: string[];
  repaired: boolean;
};

export type ApplyContactAuthorityIntegrityOpts = {
  source?: string;
  repair?: boolean;
  ensureNoticesClause?: boolean;
};

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;

const PARTY_BLOCK_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|BUYER|SELLER|LENDER|BORROWER|LANDLORD|TENANT|EMPLOYER|CONTRACTOR|LICENSOR|LICENSEE|PARTY(?:\s+\d+)?)\s*:/i;

const EXECUTION_BLOCK_ALLOWED_FIELD_RE = /^(?:By|Name|Title|Date)\s*:/i;

const EXECUTION_BLOCK_CONTACT_LINE_RE =
  /^(?:Email\s+for\s+Notices?|Address\s+for\s+Notices?|Phone(?:\s+Number)?|Tel(?:ephone)?|Fax|Notice\s+Email|Notice\s+Address|Email|Address|Attn)\s*:/i;

const NOTICES_SIGNATURE_BLOCK_REF_RE =
  /notices?[^.\n]{0,120}\b(?:signature\s+blocks?|execution\s+blocks?)\b/i;

const NOTICES_SECTION_RE =
  /(?:^|\n)\s*(?:\d+\.\s*)?Notices(?:\s+and\s+Dispute\s+Terms)?\s*\.?\s*(?:\n|$)/i;

let lastContactAuthorityLogKey = "";

export function resetContactAuthorityIntegrityLogsForTests(): void {
  lastContactAuthorityLogKey = "";
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function logContactAuthorityIntegrity(payload: {
  source: string;
  contaminationCount: number;
  diagnostics: ContactAuthorityDiagnostic[];
  repaired: boolean;
  repairs: string[];
}): void {
  if (isTestMode()) return;
  const codes = payload.diagnostics.map((d) => d.code).join(",");
  const key = `${payload.source}|${payload.contaminationCount}|${codes}|${payload.repaired}|${payload.repairs.join(",")}`;
  if (key === lastContactAuthorityLogKey) return;
  lastContactAuthorityLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[contact-authority-integrity]", payload);
}

export function resolveExecutionBlockRegionStart(text: string): number {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = normalized.search(WITNESS_RE);
  if (witnessIdx >= 0) return witnessIdx;
  const patchIdx = signaturePatchStartIndex(normalized);
  return patchIdx >= 0 ? patchIdx : normalized.length;
}

function classifyContactLine(trimmed: string): ContactAuthorityContaminationCode | null {
  if (/^email\s+for\s+notices?\s*:/i.test(trimmed)) {
    return /_{2,}/.test(trimmed)
      ? "execution_block_email_placeholder"
      : "execution_block_email_value";
  }
  if (/^address\s+for\s+notices?\s*:/i.test(trimmed)) {
    return /_{2,}/.test(trimmed)
      ? "execution_block_address_placeholder"
      : "execution_block_address_value";
  }
  if (/^(?:phone|tel(?:ephone)?|fax)\s*:/i.test(trimmed)) {
    return "execution_block_phone_value";
  }
  if (/^(?:email|address|attn)\s*:/i.test(trimmed)) {
    return "execution_block_loose_contact_line";
  }
  if (/^notice\s*:/i.test(trimmed)) {
    return "execution_block_notice_instruction";
  }
  return null;
}

export function analyzeContactAuthorityExecutionBlockIntegrity(text: string): ContactAuthorityAnalysisResult {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const executionBlockStart = resolveExecutionBlockRegionStart(normalized);
  const lines = normalized.split("\n");
  const diagnostics: ContactAuthorityDiagnostic[] = [];
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (offset < executionBlockStart) {
      offset += line.length + 1;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    const code = classifyContactLine(trimmed);
    if (code) {
      diagnostics.push({
        code,
        message: `Execution block contact contamination: ${trimmed.slice(0, 80)}`,
        lineIndex: i,
      });
    }
    offset += line.length + 1;
  }

  return {
    diagnostics,
    contaminationCount: diagnostics.length,
    executionBlockStart,
  };
}

export function corpusNoticesClauseReferencesSignatureBlocks(text: string): boolean {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const noticesIdx = normalized.search(NOTICES_SECTION_RE);
  if (noticesIdx < 0) return false;
  const witnessIdx = normalized.search(WITNESS_RE);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : normalized.length;
  const noticesRegion = normalized.slice(noticesIdx, noticesEnd);
  return NOTICES_SIGNATURE_BLOCK_REF_RE.test(noticesRegion);
}

export function corpusHasLawDogNoticesClause(text: string): boolean {
  return /LawDog signing process/i.test(text || "");
}

function replaceNoticesSectionBody(text: string): { text: string; applied: boolean } {
  const normalized = text.replace(/\r\n/g, "\n");
  const noticesIdx = normalized.search(NOTICES_SECTION_RE);
  if (noticesIdx < 0) return { text: normalized, applied: false };

  const witnessIdx = normalized.search(WITNESS_RE);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : normalized.length;
  const noticesRegion = normalized.slice(noticesIdx, noticesEnd);
  const preservedStanzas = extractOperativeIfToNoticeStanzas(noticesRegion);
  const before = normalized.slice(0, noticesIdx);
  const noticesMatch = normalized.slice(noticesIdx).match(NOTICES_SECTION_RE);
  const heading = noticesMatch?.[0]?.trim() ?? "Notices.";
  const after = normalized.slice(noticesEnd).trimStart();
  const headingLine = heading.endsWith(".") ? heading : `${heading}.`;
  const stanzaTail = preservedStanzas ? `\n\n${preservedStanzas}` : "";
  const merged = `${before.trimEnd()}\n\n${headingLine}\n\n${DEFAULT_LAWDOG_NOTICES_CLAUSE}${stanzaTail}\n\n${after}`.replace(
    /\n{3,}/g,
    "\n\n",
  );
  return { text: merged.trimEnd() + "\n", applied: true };
}

export function ensureLawDogNoticesClauseInCorpus(text: string): { text: string; applied: boolean } {
  const normalized = (text || "").replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return { text: normalized, applied: false };
  if (corpusHasLawDogNoticesClause(normalized) && !corpusNoticesClauseReferencesSignatureBlocks(normalized)) {
    return { text: normalized + (normalized.endsWith("\n") ? "" : "\n"), applied: false };
  }
  if (corpusNoticesClauseReferencesSignatureBlocks(normalized)) {
    return replaceNoticesSectionBody(normalized);
  }
  if (!NOTICES_SECTION_RE.test(normalized)) {
    const witnessIdx = normalized.search(WITNESS_RE);
    const insertAt = witnessIdx >= 0 ? witnessIdx : normalized.length;
    const before = normalized.slice(0, insertAt).trimEnd();
    const after = normalized.slice(insertAt).trimStart();
    const block = `Notices.\n\n${DEFAULT_LAWDOG_NOTICES_CLAUSE}`;
    const merged = after
      ? `${before}\n\n${block}\n\n${after}\n`
      : `${before}\n\n${block}\n`;
    return { text: merged.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", applied: true };
  }
  return replaceNoticesSectionBody(normalized);
}

export function stripExecutionBlockContactContamination(text: string): {
  text: string;
  removed: number;
  repairs: string[];
} {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const executionBlockStart = resolveExecutionBlockRegionStart(normalized);
  const lines = normalized.split("\n");
  const repairs: string[] = [];
  let removed = 0;
  let offset = 0;

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? "";
    if (offset < executionBlockStart) {
      offset += line.length + 1;
      i += 1;
      continue;
    }
    const trimmed = line.trim();
    const code = classifyContactLine(trimmed);
    if (code) {
      lines.splice(i, 1);
      removed += 1;
      repairs.push(`strip_execution_contact:${code}`);
      continue;
    }
    offset += line.length + 1;
    i += 1;
  }

  if (removed === 0) return { text: normalized, removed: 0, repairs: [] };
  return {
    text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + (normalized.endsWith("\n") ? "\n" : ""),
    removed,
    repairs,
  };
}

/** Canonical signing-capacity execution block section (no contact fields). */
export function buildSigningCapacityExecutionBlockSection(args: {
  heading: string;
  legalEntityName: string;
  signerName?: string | null;
  signerTitle?: string | null;
  includeTitleLine?: boolean;
}): string {
  const heading = args.heading.trim().toUpperCase().replace(/\s+/g, " ");
  const legal = args.legalEntityName.trim();
  const signName = args.signerName?.trim() ?? "";
  const title = args.signerTitle?.trim() ?? "";
  const includeTitle = args.includeTitleLine !== false;
  const lines = [
    `${heading}:`,
    legal,
    "By: __________________________",
    signName ? `Name: ${signName}` : "Name: __________________________",
  ];
  if (includeTitle) {
    lines.push(title ? `Title: ${title}` : "Title: __________________________");
  }
  lines.push("Date: _____________________________");
  return lines.join("\n");
}

export function executionBlockAllowsFieldLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (PARTY_BLOCK_HEADING_RE.test(trimmed)) return true;
  if (EXECUTION_BLOCK_ALLOWED_FIELD_RE.test(trimmed)) return true;
  if (WITNESS_RE.test(trimmed)) return true;
  if (/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b/i.test(trimmed)) {
    return true;
  }
  return !EXECUTION_BLOCK_CONTACT_LINE_RE.test(trimmed);
}

export function applyContactAuthorityExecutionBlockIntegrity(
  text: string,
  opts?: ApplyContactAuthorityIntegrityOpts,
): ContactAuthorityIntegrityResult {
  const source = opts?.source ?? "contact_authority";
  const shouldRepair = opts?.repair !== false;
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n/g, "\n");

  if (shouldRepair) {
    const stripped = stripExecutionBlockContactContamination(working);
    if (stripped.removed > 0) {
      working = stripped.text;
      repairs.push(...stripped.repairs);
    }
    if (opts?.ensureNoticesClause) {
      const notices = ensureLawDogNoticesClauseInCorpus(working);
      if (notices.applied) {
        working = notices.text;
        repairs.push("notices_clause:lawdog_default");
      }
    }
  }

  const analysisAfter = analyzeContactAuthorityExecutionBlockIntegrity(working);
  const repaired = repairs.length > 0;
  if (repaired || analysisAfter.contaminationCount > 0) {
    logContactAuthorityIntegrity({
      source,
      contaminationCount: analysisAfter.contaminationCount,
      diagnostics: analysisAfter.diagnostics,
      repaired,
      repairs,
    });
  }

  return {
    ...analysisAfter,
    text: working,
    repairs,
    repaired,
  };
}
