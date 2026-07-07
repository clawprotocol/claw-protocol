/**
 * Clause Family Structural Integrity — platform validation before authoritative freeze.
 *
 * Repair may run upstream; freeze is allowed only when structural validation passes.
 */

import { countStandaloneClauseFamilyHeadings, type OperativeClauseFamily } from "./clauseFamilyRegistry";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  corpusHasOperativeNoticesHeading,
  ensureCanonicalNoticesSectionHeadingForFreeze,
  ensureOperativeIfToNoticeDelivery,
  extractOperativeIfToNoticeStanzas,
  findNoticesSectionStart,
  hasInlineMalformedNoticeStanzas,
  noticeStanzaContainsPlaceholderTokens,
  noticeStanzaHasExecutionPollution,
  noticeStanzaHasRoleLabelCorruption,
  resolveNoticeStructuralValidationParties,
} from "./paidProPartyNoticeDetails";
import type { PaidProPartyRoleContext, PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  resolveAuthoritativeSignerCount,
  resolveIntakeManifestAuthorityCount,
} from "./signerCountAuthority";

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

const NOTICES_OPERATIVE_TEXT_RE =
  /\bnotices?\s+(?:must|shall|are|is|will|may|under\s+this\s+agreement)\b/i;

const ORPHAN_EMAIL_LINE_RE = /^\s*Email(?:\s+for\s+Notice)?\s*:\s*$/i;
const ORPHAN_ADDRESS_LINE_RE = /^\s*Address(?:\s+for\s+Notice)?\s*:\s*$/i;
const MALFORMED_NOTICE_LABEL_RE = /^\s*Email\s+for\s+Notices?\s*:/i;
const FUSED_NOTICES_HEADING_RE = /[a-z]\.\d+\.\s+Notices\b/i;

function stanzaHasLegalEntityLine(stanza: string): boolean {
  const trimmed = (stanza || "").trim();
  if (!trimmed) return false;
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const entityLine = lines[1] ?? "";
  if (entityLine.length >= 3) return true;
  const fused = lines[0]?.match(/^If to\s+(.+?)\s*:\s*(.+)$/i);
  return Boolean(fused && fused[2].trim().length >= 3);
}

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

/** Notices heading through execution witness — canonical stanza count authority. */
function noticesRegionToWitness(corpus: string): string {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const start = findNoticesSectionStart(text);
  if (start < 0) return "";
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const end = witnessIdx >= 0 ? witnessIdx : text.length;
  return text.slice(start, end);
}

function extractClauseFamilyHeadingEvidence(corpus: string): Record<string, string | null> {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const pickHeading = (re: RegExp): string | null => {
    const match = text.match(re);
    if (!match?.[0]) return null;
    return match[0].trim().slice(0, 120);
  };
  const noticesStart = findNoticesSectionStart(text);
  const noticesSnippet =
    noticesStart >= 0
      ? text.slice(noticesStart, Math.min(noticesStart + 280, text.length)).trim().slice(0, 200)
      : null;
  const ifToLines = lines.filter((line) => /^If to\s+/i.test(line.trim())).slice(0, 6);
  return {
    noticesHeading: pickHeading(
      /(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)(?:Notices|Notice\s+Provisions?|Notice\s+Addresses?|Notice\s+Delivery)\b[^\n]*/i,
    ),
    governingLawHeading: pickHeading(/(?:^|\n)\s*\d+\.(?!\d)\s*GOVERNING\s+LAW[^\n]*/i),
    executionMarker: pickHeading(/(?:^|\n)\s*IN WITNESS WHEREOF[^\n]*/i),
    noticesRegionSnippet: noticesSnippet,
    ifToHeadingLines: ifToLines.length > 0 ? ifToLines.join(" | ") : null,
  };
}

export function logClauseFamilyStructuralDiagnostic(
  corpus: string,
  report: ClauseFamilyStructuralIntegrityReport,
  opts?: { surface?: string; phase?: string },
): void {
  if (report.ok || isTestMode()) return;
  const failedFamilies = [...new Set(report.violations.map((v) => v.family))];
  // eslint-disable-next-line no-console
  console.info("[paid-pro-clause-family-structural-diagnostic]", {
    surface: opts?.surface ?? "freeze",
    phase: opts?.phase ?? "post_acceptance",
    corpusLen: (corpus || "").trim().length,
    ok: report.ok,
    failedFamilies,
    violationCodes: report.violations.map((v) => v.code),
    violations: report.violations.map((v) => ({
      family: v.family,
      code: v.code,
      message: v.message,
    })),
    familyPresence: report.familyPresence,
    headingEvidence: extractClauseFamilyHeadingEvidence(corpus),
  });
}

/** Targeted structural repair for substantive server_full drafts before freeze retry. */
export function attemptSubstantiveServerClauseFamilyStructuralRecovery(
  corpus: string,
  opts?: {
    parties?: readonly PaidProSignerMetadataParty[];
    intakeText?: string | null;
    draftPartyNames?: readonly string[] | null;
    draftPartyCount?: number;
    surface?: string;
  },
): {
  text: string;
  repaired: boolean;
  repairs: string[];
  report: ClauseFamilyStructuralIntegrityReport;
} {
  let text = (corpus || "").replace(/\r\n/g, "\n");
  const repairs: string[] = [];
  const roleContext: PaidProPartyRoleContext | null =
    opts?.intakeText || opts?.draftPartyNames
      ? {
          intakeText: opts?.intakeText ?? null,
          draftPartyNames: opts?.draftPartyNames ?? null,
          acceptedCorpus: text,
        }
      : null;
  const heading = ensureCanonicalNoticesSectionHeadingForFreeze(text);
  if (heading.repairs.length > 0) {
    text = heading.text;
    repairs.push(...heading.repairs);
  }
  const authorityParties = resolveNoticeStructuralValidationParties(opts?.parties ?? [], roleContext);
  if (authorityParties.length >= 2) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(text, authorityParties, roleContext);
    if (noticeDelivery.repairs.length > 0) {
      text = noticeDelivery.text;
      repairs.push(...noticeDelivery.repairs);
    }
  }
  const report = validateClauseFamilyStructuralIntegrity(text, {
    parties: opts?.parties,
    intakeText: opts?.intakeText,
    draftPartyNames: opts?.draftPartyNames,
    draftPartyCount: opts?.draftPartyCount,
    surface: opts?.surface ?? "substantive_structural_recovery",
    acceptedCorpus: text,
  });
  return { text, repaired: repairs.length > 0, repairs, report };
}

function countIfToStanzas(noticesRegion: string): number {
  if (!noticesRegion.trim()) return 0;
  return (noticesRegion.match(/^If to\s+/gim) || []).length;
}

function resolveCanonicalAuthorityPartyCount(
  parties?: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): number {
  const intake = roleContext?.intakeText?.trim() ?? "";
  const draftPartyNames =
    roleContext?.draftPartyNames ??
    parties?.map((p) => p.partyLegalName).filter((n) => n.trim().length >= 2) ??
    [];

  // TEST538 — the immutable intake manifest is the hard authority ceiling for notice validation.
  // A contaminated parties list (phantom 5th, "Party 1" placeholder) must never let the
  // canonical authority / required-stanza count exceed the party count the intake truly resolves.
  const intakeManifestCeiling = resolveIntakeManifestAuthorityCount(intake);

  if (intake) {
    const fromIntake = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftPartyNames,
      draftParties: (parties ?? []).map((p) => ({ name: p.partyLegalName })),
      manifestPartyCount: parties?.length ?? 0,
    }).count;
    if (fromIntake >= 2) {
      return intakeManifestCeiling >= 2 ? Math.min(fromIntake, intakeManifestCeiling) : fromIntake;
    }
  }

  if (!parties?.length) return 0;

  const enriched = resolveNoticeStructuralValidationParties(parties, roleContext);
  const enrichedCount = enriched.filter(
    (p) =>
      String(p.partyLegalName ?? "").trim().length >= 2 &&
      isAuthoritativeLegalEntityName(p.partyLegalName.trim()),
  ).length;
  return intakeManifestCeiling >= 2 ? Math.min(enrichedCount, intakeManifestCeiling) : enrichedCount;
}

function requiredNoticeStanzaCount(
  parties?: readonly PaidProSignerMetadataParty[],
  requireTwo = true,
): number {
  const canonical = resolveCanonicalAuthorityPartyCount(parties);
  if (canonical >= 2) return canonical;
  return requireTwo ? 2 : 0;
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logNoticeStanzaValidationDiagnostic(payload: {
  surface?: string;
  phase: "pre_acceptance" | "post_acceptance" | "hydrate_replay";
  canonicalAuthorityPartyCount: number;
  draftPartyCount?: number;
  handoffPartySlots?: number;
  noticeStanzaCount: number;
  noticeValidationPartySource: string;
  violations: string[];
}): void {
  if (isTestMode()) return;
  const isHydrateReplay =
    payload.phase === "hydrate_replay" ||
    (payload.surface?.includes("hydrate") ?? false);
  const excessSlots =
    payload.handoffPartySlots != null &&
    payload.canonicalAuthorityPartyCount >= 2 &&
    payload.handoffPartySlots > payload.canonicalAuthorityPartyCount;
  if (
    payload.violations.length === 0 &&
    !excessSlots &&
    payload.noticeStanzaCount >= payload.canonicalAuthorityPartyCount &&
    !(isHydrateReplay && payload.canonicalAuthorityPartyCount === 0)
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-notice-stanza-validation]", {
    ...payload,
    excessPartySlotsVsAuthority: excessSlots,
    diagnosticOnly: isHydrateReplay,
  });
}

export function validateNoticesClauseFamilyStructuralIntegrity(
  corpus: string,
  opts?: {
    parties?: readonly PaidProSignerMetadataParty[];
    requireTwoPartyStanzas?: boolean;
    surface?: string;
    phase?: "pre_acceptance" | "post_acceptance";
    handoffPartySlots?: number;
    draftPartyCount?: number;
    intakeText?: string | null;
    draftPartyNames?: readonly string[] | null;
    acceptedCorpus?: string | null;
  },
): ClauseFamilyStructuralViolation[] {
  const violations: ClauseFamilyStructuralViolation[] = [];
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const hasOperativeNoticesFamily = corpusHasOperativeNoticesHeading(text);
  const region = noticesRegionToWitness(text);
  const noticeRoleContext: PaidProPartyRoleContext | null =
    opts?.intakeText || opts?.acceptedCorpus || opts?.draftPartyNames
      ? {
          intakeText: opts?.intakeText ?? null,
          draftPartyNames: opts?.draftPartyNames ?? null,
          acceptedCorpus: opts?.acceptedCorpus ?? corpus,
        }
      : null;
  const canonicalAuthorityPartyCount = resolveCanonicalAuthorityPartyCount(
    opts?.parties,
    noticeRoleContext,
  );
  const requiredStanzas = requiredNoticeStanzaCount(opts?.parties, opts?.requireTwoPartyStanzas !== false);
  const noticeValidationPartySource =
    canonicalAuthorityPartyCount >= 2 ? "canonical_authority_parties" : "minimum_two_party";

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

  if (!hasOperativeNoticesFamily) {
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

  const stanzaCount = countIfToStanzas(region);
  const stanzasSatisfyAuthority =
    requiredStanzas > 0 && stanzaCount >= requiredStanzas;

  if (!NOTICES_OPERATIVE_TEXT_RE.test(region) && !stanzasSatisfyAuthority) {
    violations.push({
      family: "notices",
      code: "missing_operative_notice_text",
      message: "Notices family requires operative notice delivery text or complete party stanzas.",
    });
  }

  const stanzaBlob = extractOperativeIfToNoticeStanzas(region);

  if (requiredStanzas > 0 && stanzaCount < requiredStanzas) {
    violations.push({
      family: "notices",
      code: "missing_party_notice_stanzas",
      message: `Expected ${requiredStanzas} If to notice stanzas; found ${stanzaCount}.`,
    });
  }

  if (requiredStanzas > 0 && stanzaCount > requiredStanzas) {
    violations.push({
      family: "notices",
      code: "excess_party_notice_stanzas",
      message: `Expected ${requiredStanzas} If to notice stanzas; found ${stanzaCount}.`,
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
      if (!stanzaHasLegalEntityLine(stanza)) {
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

  logNoticeStanzaValidationDiagnostic({
    surface: opts?.surface,
    phase: opts?.phase ?? "pre_acceptance",
    canonicalAuthorityPartyCount,
    draftPartyCount: opts?.draftPartyCount,
    handoffPartySlots: opts?.handoffPartySlots,
    noticeStanzaCount: stanzaCount,
    noticeValidationPartySource,
    violations: violations.map((v) => v.code),
  });

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
    surface?: string;
    phase?: "pre_acceptance" | "post_acceptance";
    handoffPartySlots?: number;
    draftPartyCount?: number;
    intakeText?: string | null;
    draftPartyNames?: readonly string[] | null;
    acceptedCorpus?: string | null;
  },
): ClauseFamilyStructuralIntegrityReport {
  const families = opts?.families ?? [
    "notices",
    "governing_law",
    "execution_block",
  ];
  const violations: ClauseFamilyStructuralViolation[] = [];

  if (families.includes("notices") || opts?.requireNotices !== false) {
    violations.push(
      ...validateNoticesClauseFamilyStructuralIntegrity(corpus, {
        parties: opts?.parties,
        surface: opts?.surface,
        phase: opts?.phase,
        handoffPartySlots: opts?.handoffPartySlots,
        draftPartyCount: opts?.draftPartyCount,
        intakeText: opts?.intakeText,
        draftPartyNames: opts?.draftPartyNames,
        acceptedCorpus: opts?.acceptedCorpus ?? corpus,
      }),
    );
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
      notices: corpusHasOperativeNoticesHeading(corpus),
      governing_law: countStandaloneClauseFamilyHeadings(corpus, "governing_law") > 0,
      execution_block: countPaidProExecutionBlocks(corpus) > 0,
    },
  };
}

/** Hard gate — throws when any clause family fails structural validation. */
export function assertClauseFamilyStructuralIntegrityForFreeze(
  corpus: string,
  opts?: Parameters<typeof validateClauseFamilyStructuralIntegrity>[1] & {
    surface?: string;
    phase?: "pre_acceptance" | "post_acceptance";
    handoffPartySlots?: number;
    draftPartyCount?: number;
  },
): void {
  const report = validateClauseFamilyStructuralIntegrity(corpus, {
    ...opts,
    surface: opts?.surface ?? "freeze",
    phase: opts?.phase ?? "post_acceptance",
  });
  if (!report.ok) {
    logClauseFamilyStructuralDiagnostic(corpus, report, {
      surface: opts?.surface ?? "freeze",
      phase: opts?.phase ?? "post_acceptance",
    });
    const codes = report.violations.map((v) => v.code).join(",");
    throw new Error(
      `[paid-pro-clause-family-structural-blocked] surface=${opts?.surface ?? "freeze"} codes=${codes}`,
    );
  }
}
