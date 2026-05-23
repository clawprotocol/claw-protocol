/**
 * Section-aware guided answer merge — incremental and finalization paths share this module.
 * Replaces append-before-signature architecture with targeted section insertion.
 */

import type { GuidedCompletionSession } from "./types";
import { listGuidedAnsweredVariableIds } from "./guidedAnswerApplyOrchestration";
import {
  findSectionAnchor,
  normalizeGuidedSectionHeadingLine,
  resolveGuidedQuestionTarget,
  type GuidedRevisionTarget,
} from "./guidedRevisionAnchors";
import { findSignatureRegionStart } from "./signatureRegion";

export type GuidedSectionMergeRepair = {
  questionId: string;
  action: "merged" | "skipped_present" | "skipped_no_anchor" | "created_section" | "replaced";
  sectionLabel: string;
};

export type GuidedSectionMergeResult = {
  body: string;
  repairs: string[];
  merges: GuidedSectionMergeRepair[];
};

type ClauseSpec = {
  evidence: RegExp;
  clause: (answer: string) => string;
};

const CLAUSE_BY_QUESTION: Record<string, ClauseSpec> = {
  payment_timing: {
    evidence: /\bNet\s*(?:30|thirty)\b/i,
    clause: () =>
      "Invoices are due Net 30 from receipt unless a signed change order states otherwise.",
  },
  phase_payment_allocation: {
    evidence: /\bbuild-heavy\b/i,
    clause: () =>
      "Schedule A phase allocation is build-heavy: the larger share is tied to build/configuration work, with remaining payments allocated to launch, support handoff, and acceptance milestones.",
  },
  saas_sla: {
    evidence: /\b99\.9\s*%/i,
    clause: () =>
      "Provider will target 99.9% monthly uptime for production automation components, excluding scheduled maintenance, client-caused outages, and third-party platform failures outside Provider control.",
  },
  ip_ownership: {
    evidence: /\b(?:company|client)\s+owns?\s+(?:the\s+)?(?:project\s+)?deliverables?\b/i,
    clause: () =>
      "Company owns the project deliverables and work product created specifically for Company after payment, subject only to Provider's retained ownership of pre-existing tools, templates, know-how, and background technology.",
  },
  renewal_notice: {
    evidence: /\b(?:30|thirty)\s+days?.{0,30}(?:written\s+)?notice\b/i,
    clause: () =>
      "Either party may terminate for convenience with 30 days written notice, subject to payment for work performed and survival of confidentiality, payment, and ownership obligations.",
  },
};

const PREEXISTING_CARVEOUT =
  "Provider retains ownership of pre-existing tools, templates, know-how, and background technology used in performing the services.";

function normLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function signatureStartIndex(text: string): number {
  const idx = findSignatureRegionStart(text);
  if (idx >= 0) return idx;
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  return witness >= 0 ? witness : text.length;
}

/** Remove guided-answer dumps incorrectly placed after electronic signatures / before witness block. */
export function stripMisplacedGuidedClausesBeforeSignature(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const sigStart = signatureStartIndex(text);
  const before = text.slice(0, sigStart);
  const tail = text.slice(sigStart);
  const dumpRes = [
    /^Electronic Payment Terms\b/im,
    /^Schedule A\s*[-–—]\s*Phase/im,
    /^Support and Service Levels\b/im,
    /^Ownership and Work Product\b/im,
    /^Term and Termination\b/im,
  ];
  const lines = before.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (dumpRes.some((re) => re.test(trimmed))) {
      skipping = true;
      repairs.push(`strip_misplaced:${trimmed.slice(0, 32)}`);
      continue;
    }
    if (skipping) {
      if (/^\s*(?:\d+(?:\.\d+)*\.|IN WITNESS|SIGNATURE|CLIENT:)/i.test(trimmed)) {
        skipping = false;
      } else if (!trimmed) {
        continue;
      } else if (/^[A-Z][A-Za-z\s/&-]{3,60}$/.test(trimmed)) {
        skipping = false;
      } else {
        continue;
      }
    }
    out.push(line);
  }
  return { text: `${out.join("\n").trimEnd()}\n${tail}`, repairs };
}

/** Fix broken markdown headings and split electronic-signature labels. */
export function normalizeGuidedCorpusSectionFormatting(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text
    .replace(/\*\*(\d+)\.\s+/g, (_, n) => {
      repairs.push("markdown_heading");
      return `${n}. `;
    })
    .replace(/\bElectronic\s*\n+\s*Signatures\b/gi, () => {
      repairs.push("electronic_signatures_join");
      return "Electronic Signatures";
    })
    .replace(/\n{3,}/g, "\n\n");
  return { text: out, repairs };
}

function clauseAlreadyPresent(body: string, spec: ClauseSpec): boolean {
  return spec.evidence.test(body);
}

function findSignatureLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const t = normalizeGuidedSectionHeadingLine(lines[i]);
    if (/^(?:IN WITNESS WHEREOF|EXECUTION|SIGNATURES?)\b/i.test(t)) return i;
    if (/^CLIENT\s*:/i.test(t)) return i;
  }
  return lines.length;
}

function findInsertLineForNewSection(lines: string[], sectionNumber: number | null): number {
  const sigLine = findSignatureLineIndex(lines);
  if (sectionNumber == null) return sigLine;
  for (let i = 0; i < sigLine; i += 1) {
    const t = normalizeGuidedSectionHeadingLine(lines[i]);
    const m = t.match(/^(\d+)\.\s+/);
    if (m && Number(m[1]) > sectionNumber) return i;
  }
  return sigLine;
}

function insertClauseInSection(
  text: string,
  target: GuidedRevisionTarget,
  clause: string,
): { text: string; merged: boolean; createdSection: boolean } {
  if (text.toLowerCase().includes(clause.toLowerCase().slice(0, 48))) {
    return { text, merged: false, createdSection: false };
  }
  const anchor = findSectionAnchor(text, target);
  const lines = normLines(text);
  if (anchor.found) {
    let insertAt = lines.length;
    for (let i = anchor.lineIndex + 1; i < lines.length; i++) {
      const t = normalizeGuidedSectionHeadingLine(lines[i]);
      if (/^(?:\d+(?:\.\d+)*\.|SCHEDULE\s+[A-Z]|IN WITNESS WHEREOF|EXECUTION|SIGNATURES?)\b/i.test(t)) {
        insertAt = i;
        break;
      }
    }
    lines.splice(insertAt, 0, "", clause.trim());
    return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n"), merged: true, createdSection: false };
  }

  if (target.sectionNumber != null || target.sectionLabel) {
    const insertAt = findInsertLineForNewSection(lines, target.sectionNumber);
    const heading =
      target.sectionNumber != null ? `${target.sectionNumber}. ${target.sectionLabel}` : target.sectionLabel;
    lines.splice(insertAt, 0, "", heading, clause.trim());
    return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n"), merged: true, createdSection: true };
  }

  return { text, merged: false, createdSection: false };
}

function applyOwnershipContradictionFixes(text: string): string {
  return text
    .replace(
      /\b(?:Service Provider|Provider)\s+owns?\s+(?:all\s+)?(?:project\s+)?(?:deliverables|work product)\b/gi,
      "Company owns the project deliverables",
    )
    .replace(
      /\b(?:all\s+)?(?:deliverables|work product)\s+(?:belong|belongs|are assigned)\s+to\s+(?:Service Provider|Provider)\b/gi,
      "project deliverables are assigned to Company",
    );
}

export function mergeSingleGuidedAnswerIntoCorpus(args: {
  body: string;
  questionId: string;
  session?: GuidedCompletionSession | null;
}): GuidedSectionMergeResult {
  const spec = CLAUSE_BY_QUESTION[args.questionId];
  const target = resolveGuidedQuestionTarget(args.questionId);
  const repairs: string[] = [];
  const merges: GuidedSectionMergeRepair[] = [];
  let out = applyOwnershipContradictionFixes(args.body);

  if (!spec) {
    return { body: out, repairs, merges };
  }
  if (clauseAlreadyPresent(out, spec)) {
    merges.push({ questionId: args.questionId, action: "skipped_present", sectionLabel: target.sectionLabel });
    return { body: out, repairs, merges };
  }

  const clause = spec.clause((args.session?.answered[args.questionId] ?? "").trim());
  const inserted = insertClauseInSection(out, target, clause);
  if (inserted.merged) {
    out = inserted.text;
    repairs.push(`section_merge:${args.questionId}`);
    const action = inserted.createdSection ? "created_section" : "merged";
    merges.push({ questionId: args.questionId, action, sectionLabel: target.sectionLabel });
    logGuidedSectionMerge({ questionId: args.questionId, action, section: target.sectionLabel });
  } else {
    merges.push({ questionId: args.questionId, action: "skipped_no_anchor", sectionLabel: target.sectionLabel });
    logGuidedSectionMerge({ questionId: args.questionId, action: "skipped_no_anchor", section: target.sectionLabel });
  }

  if (args.questionId === "ip_ownership" && !/\b(?:pre-existing|background)\s+(?:tools|materials)/i.test(out)) {
    const carve = insertClauseInSection(out, target, PREEXISTING_CARVEOUT);
    if (carve.merged) {
      out = carve.text;
      repairs.push("section_merge:provider_preexisting_carveout");
    }
  }

  const normalized = normalizeGuidedCorpusSectionFormatting(out);
  out = normalized.text;
  repairs.push(...normalized.repairs);

  return { body: out, repairs, merges };
}

/** Merge all answered guided questions into proper sections (shared by finalizer + progressive path). */
export function mergeAllGuidedAnswersIntoCorpus(
  body: string,
  session: GuidedCompletionSession | null | undefined,
): GuidedSectionMergeResult {
  let out = body;
  const allRepairs: string[] = [];
  const allMerges: GuidedSectionMergeRepair[] = [];

  const stripped = stripMisplacedGuidedClausesBeforeSignature(out);
  out = stripped.text;
  allRepairs.push(...stripped.repairs);

  const formatted = normalizeGuidedCorpusSectionFormatting(out);
  out = formatted.text;
  allRepairs.push(...formatted.repairs);

  out = applyOwnershipContradictionFixes(out);

  const ids = listGuidedAnsweredVariableIds(session);
  for (const questionId of ids) {
    const result = mergeSingleGuidedAnswerIntoCorpus({ body: out, questionId, session });
    out = result.body;
    allRepairs.push(...result.repairs);
    allMerges.push(...result.merges);
  }

  logGuidedCorpusNormalization({ repairs: allRepairs.length, merges: allMerges.length });
  return { body: out, repairs: allRepairs, merges: allMerges };
}

export function logGuidedSectionMerge(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-section-merge]", payload);
}

export function logGuidedCorpusNormalization(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-corpus-normalization]", payload);
}

export function logGuidedAuthoritativePreviewSync(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-preview-sync]", payload);
}
