/**
 * Document Boundary Authority — platform-level structural integrity for Paid Pro corpora.
 * Repairs section/heading fusion, duplicate clause families, execution isolation, and notice
 * contact boundaries before authoritative freeze and across acceptance surfaces.
 */

import { countStandaloneClauseFamilyHeadings } from "./clauseFamilyRegistry";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { dedupeStandaloneOperativeClauseFamilies } from "./operativeClauseFamilyDedup";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { countPaidProExecutionBlocks, analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  applyPaidProNoticeContactAuthority,
  type PaidProNoticeContactAuthorityOpts,
} from "./paidProNoticeContactAuthority";
import { assertClauseFamilyStructuralIntegrityForFreeze } from "./clauseFamilyStructuralIntegrity";
import { hasInlineMalformedNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  analyzeMultiPartyExecutionBlockShape,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { scanUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import { paidProVerboseQaLogsEnabled } from "./paidProPerfLogging";

export type PaidProDocumentBoundaryAuthorityOpts = PaidProNoticeContactAuthorityOpts & {
  /** When true (freeze path), unresolved boundary violations throw. */
  blockOnViolation?: boolean;
  /** Party authority for clause-family structural validation at freeze. */
  parties?: readonly import("./paidProSignerMetadataAuthority").PaidProSignerMetadataParty[];
  /** Diagnostics — draft-derived party row count (may exceed canonical authority). */
  draftPartyCount?: number;
  /** Diagnostics — session handoff slot count before trim. */
  handoffPartySlots?: number;
};

export type PaidProDocumentBoundaryAuthorityResult = {
  text: string;
  repairs: string[];
  violations: string[];
  ok: boolean;
  /**
   * TEST563 — exact user-visible render tokens that kept the notice/contact authority from
   * resolving (`contact.ok === false`). These are the *real* defect behind a `violations=contact`
   * boundary block; surfacing them prevents the reason collapsing to a bare `document_boundary_blocked`.
   */
  unresolvedRenderTokens: string[];
};

const RECITAL_FUSED_SECTION_RE = /Parties\."\d+\./i;

function lineHasInlineFusedTopLevelSection(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^\d+\.\s+/.test(trimmed)) return false;
  if (/[a-z]+\.\d+\.\s+(?:Notices|GOVERNING|Services|Relationship|MISCELLANEOUS|TERM|PAYMENT)/i.test(trimmed)) {
    return true;
  }
  return /\.\d+\.\s+Notices\b/i.test(trimmed);
}

function corpusHasInlineFusedTopLevelSection(corpus: string): boolean {
  return corpus.replace(/\r\n/g, "\n").split("\n").some(lineHasInlineFusedTopLevelSection);
}

/** Extra fusion repairs before the shared heading-split pass. */
export function repairDocumentBoundaryFusion(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  const before = out;

  out = out.replace(/([A-Za-z]+)\."(\d+\.\s+)/g, "$1.\"\n\n$2");
  out = out.replace(/([a-z]+)\.(\d+\.\s+Notices\b)/gi, "$1.\n\n$2");
  out = out.replace(/([a-z]+)\.(\d+\.\s+GOVERNING\b)/gi, "$1.\n\n$2");
  out = out.replace(/([a-z])\.\s*(\d+\.\s+(?!\d+\.\d)(?:Notices|GOVERNING|Services|Relationship))/gi, "$1.\n\n$2");
  out = out.replace(/([a-z])\.\s*(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1.\n\n$2");
  out = out.replace(/(\d)\.(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1.\n\n$2");
  out = out.replace(/([.!?)"\u201d])\s*(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1\n\n$2");

  if (hasInlineMalformedNoticeStanzas(out)) {
    out = out.replace(/\s+(If to\s+)/gi, "\n\n$1");
    repairs.push("boundary:split_inline_notice_stanzas");
  }

  out = repairGluedSectionHeadingsInText(out);

  const fixedLines: string[] = [];
  for (const line of out.split("\n")) {
    let segment = line;
    if (lineHasInlineFusedTopLevelSection(line)) {
      segment = line
        .replace(/([a-z]+)\.(\d+\.\s+Notices\b)/gi, "$1.\n\n$2")
        .replace(/([a-z]+)\.(\d+\.\s+GOVERNING\b)/gi, "$1.\n\n$2");
      repairs.push("boundary:split_fused_line");
    }
    fixedLines.push(...segment.split("\n"));
  }
  out = fixedLines.join("\n");

  if (out !== before) repairs.push("boundary:repair_fusion");
  return { text: out.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs: [...new Set(repairs)] };
}

export function detectDocumentBoundaryViolations(text: string): string[] {
  const corpus = (text || "").replace(/\r\n/g, "\n");
  const issues = new Set<string>();
  if (RECITAL_FUSED_SECTION_RE.test(corpus)) issues.add("recital_fused_section");
  if (corpusHasInlineFusedTopLevelSection(corpus)) issues.add("inline_top_level_section");
  if (hasInlineMalformedNoticeStanzas(corpus)) issues.add("inline_malformed_notices");
  if (countStandaloneClauseFamilyHeadings(corpus, "governing_law") > 1) {
    issues.add("duplicate_governing_law");
  }
  if (countStandaloneClauseFamilyHeadings(corpus, "notices") > 1) {
    issues.add("duplicate_notices");
  }
  if (countPaidProExecutionBlocks(corpus) > 1) issues.add("duplicate_execution_block");
  return [...issues];
}

export function applyPaidProDocumentBoundaryAuthority(
  raw: string,
  opts?: PaidProDocumentBoundaryAuthorityOpts,
): PaidProDocumentBoundaryAuthorityResult {
  const repairs: string[] = [];
  let out = (raw || "").replace(/\r\n/g, "\n");

  const fusion = repairDocumentBoundaryFusion(out);
  if (fusion.text !== out) {
    out = fusion.text;
    repairs.push(...fusion.repairs);
  }

  const display = preparePaidProReviewDisplayPlain(out);
  if (display.text !== out) {
    out = display.text;
    repairs.push(...display.repairs.map((r) => `display:${r}`));
  }

  if (/\bIN WITNESS WHEREOF\b/i.test(out)) {
    const executionManifest = resolveAcceptanceManifestRecordsForExecution({
      draft: opts?.draft ?? null,
      intakeText: opts?.intakeText ?? null,
    });
    const skipMultiPartyExecutionNormalize =
      executionManifest.length >= 3 &&
      !analyzeMultiPartyExecutionBlockShape(out, executionManifest).malformed;
    const expectedExecutionParties = Math.max(executionManifest.length, 2);
    const executionInvariantBefore = analyzePaidProExecutionBlockInvariant(out, {
      expectedParties: expectedExecutionParties,
    });
    if (
      !skipMultiPartyExecutionNormalize &&
      !executionInvariantBefore.ok
    ) {
      const execution = enforcePaidProSingleExecutionBlock(out, {
        intakeText: opts?.intakeText ?? null,
        authorityParties: executionManifest.map((r) => ({ partyLegalName: r.fullLegalName })),
        draftPartyNames: executionManifest.map((r) => r.fullLegalName),
      });
      if (execution.text !== out) {
        const executionInvariantAfter = analyzePaidProExecutionBlockInvariant(execution.text, {
          expectedParties: expectedExecutionParties,
        });
        if (executionInvariantAfter.ok) {
          out = execution.text;
          repairs.push(...execution.repairs.map((r) => `execution:${r}`));
        } else {
          repairs.push("execution:enforce_skipped_regression");
        }
      }
    }
  }

  const renumbered = repairPaidProOrphanSectionNumbers(out);
  if (renumbered.text !== out) {
    out = renumbered.text;
    repairs.push(...renumbered.repairs.map((r) => `section:${r}`));
  }

  const deduped = dedupeStandaloneOperativeClauseFamilies(out);
  if (deduped.text !== out) {
    out = deduped.text;
    repairs.push(...deduped.repairs);
  }

  const postDedupeRenumber = repairPaidProOrphanSectionNumbers(out);
  if (postDedupeRenumber.text !== out) {
    out = postDedupeRenumber.text;
    repairs.push(...postDedupeRenumber.repairs.map((r) => `section:${r}`));
  }

  const postFusion = repairDocumentBoundaryFusion(out);
  if (postFusion.text !== out) {
    out = postFusion.text;
    repairs.push(...postFusion.repairs.map((r) => `post:${r}`));
  }

  const contact = applyPaidProNoticeContactAuthority(out, {
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
    surface: opts?.surface ?? "paid_pro_document_boundary_authority",
    blockOnUnresolved: opts?.blockOnUnresolved ?? false,
  });
  if (contact.text !== out) {
    out = contact.text;
    repairs.push(...contact.repairs.map((r) => `contact:${r}`));
  }

  const terminalFusion = repairDocumentBoundaryFusion(out);
  if (terminalFusion.text !== out) {
    out = terminalFusion.text;
    repairs.push(...terminalFusion.repairs.map((r) => `terminal:${r}`));
  }

  const terminalRenumber = repairPaidProOrphanSectionNumbers(out);
  if (terminalRenumber.text !== out) {
    out = terminalRenumber.text;
    repairs.push(...terminalRenumber.repairs.map((r) => `terminal:${r}`));
  }

  const violations = detectDocumentBoundaryViolations(out);
  // TEST563 — when the contact/render-token authority could not resolve every token, capture the
  // exact survivors. A `contact.ok === false` result with *no* structural violation is the live 42k
  // `document_boundary_blocked` case: the corpus carries a genuinely unresolvable token (a degraded
  // literal like `TBD`/`UNKNOWN`, or an unknown compound field like `{{party_3_scope}}`), and the
  // reason otherwise collapses to a bare `document_boundary_blocked`.
  const unresolvedRenderTokens = contact.ok
    ? []
    : [...new Set(scanUnresolvedRenderTokens(out).map((m) => m.token))];
  const ok = violations.length === 0 && contact.ok;
  if (opts?.blockOnViolation && violations.length > 0) {
    throw new Error(`[paid-pro-document-boundary-blocked] ${violations.join(",")}`);
  }

  return {
    text: out,
    repairs: [...new Set(repairs)],
    violations,
    ok,
    unresolvedRenderTokens,
  };
}

export function assertPaidProDocumentBoundaryAuthorityForFreeze(
  text: string,
  opts?: PaidProDocumentBoundaryAuthorityOpts,
): string {
  let out = (text || "").replace(/\r\n/g, "\n");
  let lastViolations: string[] = ["uninitialized"];
  let lastUnresolvedTokens: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = applyPaidProDocumentBoundaryAuthority(out, {
      ...opts,
      blockOnViolation: false,
      blockOnUnresolved: true,
      surface: opts?.surface ?? "paid_pro_document_boundary_freeze",
    });
    out = result.text;
    lastViolations = result.violations;
    lastUnresolvedTokens = result.unresolvedRenderTokens;
    if (result.ok && result.violations.length === 0) {
      assertClauseFamilyStructuralIntegrityForFreeze(out, {
        parties: opts?.parties,
        surface: opts?.surface ?? "paid_pro_document_boundary_freeze",
        phase: "post_acceptance",
        draftPartyCount: opts?.draftPartyCount,
        handoffPartySlots: opts?.handoffPartySlots,
      });
      return out;
    }
  }
  // TEST563 — surface the *specific* blocker instead of the opaque `violations=contact`. A structural
  // violation lists its own name(s); a contact block lists the exact unresolved render tokens so the
  // reject reason (and `[paid-pro-validation-decision] rejectedRule`) proves the real defect rather
  // than collapsing to a bare `document_boundary_blocked`.
  const reasonParts: string[] = [...lastViolations.filter((v) => v && v !== "uninitialized")];
  if (lastUnresolvedTokens.length > 0) {
    reasonParts.push(`unresolved_render_tokens:${lastUnresolvedTokens.slice(0, 6).join("|")}`);
  }
  const reason = reasonParts.length > 0 ? reasonParts.join(",") : "contact";
  logPaidProDocumentBoundaryBlockedDiagnostics({
    surface: opts?.surface ?? "paid_pro_document_boundary_freeze",
    structuralViolations: lastViolations.filter((v) => v && v !== "uninitialized"),
    unresolvedRenderTokens: lastUnresolvedTokens,
    corpus: out,
  });
  throw new Error(`[paid-pro-document-boundary-blocked] violations=${reason}`);
}

/**
 * TEST566 — location-aware context window (±140 chars) around the first occurrence of each unresolved
 * token, so a live block proves *where* a survivor like `[ADDRESS_5]` sits (phantom-notice/body clause)
 * without guessing. Whitespace-collapsed; the token is wrapped in » « for eyeballing.
 */
function unresolvedTokenContextWindows(
  corpus: string,
  tokens: readonly string[],
): Array<{ token: string; context: string }> {
  const text = corpus.replace(/\r\n/g, "\n");
  return tokens.slice(0, 6).map((token) => {
    const at = text.indexOf(token);
    if (at < 0) return { token, context: "<not found in final corpus>" };
    const window = text
      .slice(Math.max(0, at - 140), Math.min(text.length, at + token.length + 140))
      .replace(/\s+/g, " ")
      .trim();
    return { token, context: window.replace(token, `»${token}«`) };
  });
}

/**
 * TEST563 — gated, non-collapsed diagnostic emitted at the moment a freeze is boundary-blocked.
 * Prints the full structural-violation list and every unresolved render-token string (not a
 * collapsed console `Array(n)`), so a live run pinpoints the exact defect and provenance.
 */
function logPaidProDocumentBoundaryBlockedDiagnostics(payload: {
  surface: string;
  structuralViolations: string[];
  unresolvedRenderTokens: string[];
  corpus?: string;
}): void {
  if (!paidProVerboseQaLogsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-document-boundary-blocked-diagnostics]", {
    surface: payload.surface,
    structuralViolations: payload.structuralViolations,
    structuralViolationCount: payload.structuralViolations.length,
    unresolvedRenderTokens: payload.unresolvedRenderTokens,
    unresolvedRenderTokenCount: payload.unresolvedRenderTokens.length,
    // TEST566 — exact location/context of each survivor (e.g. is `[ADDRESS_5]` in a body clause?).
    unresolvedTokenContexts: payload.corpus
      ? unresolvedTokenContextWindows(payload.corpus, payload.unresolvedRenderTokens)
      : [],
  });
}
