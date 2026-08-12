/**
 * Clause Family Structural Integrity — platform validation before authoritative freeze.
 *
 * Repair may run upstream; freeze is allowed only when structural validation passes.
 */

import { countStandaloneClauseFamilyHeadings, type OperativeClauseFamily } from "./clauseFamilyRegistry";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
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
  noticeStanzaHasLegalEntityLine,
  resolveAuthoritativeNoticesRegionForFreeze,
  resolveNoticeStructuralValidationParties,
  resolveCanonicalNoticePartyCount,
} from "./paidProPartyNoticeDetails";
import { intakePartyManifestIsAuthoritative } from "./intakePartyManifestAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import type { PaidProPartyRoleContext, PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { qualifiesAsConciseAuthoritativePaidServerDraft } from "./paidProSubstantiveCorpusAssessment";

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

/** Operative notice delivery language — allow short intervening punctuation/words. */
const NOTICES_OPERATIVE_TEXT_RE =
  /(?:\bnotices?\b(?:\s*[:.—-]?\s*|\s+)(?:(?:acceptable\s+via|by)\s+)?(?:must|shall|are|is|will|may|under\s+this\s+agreement|email|e-?mail)\b|\b(?:any\s+)?notices?\s+(?:required\s+or\s+permitted\s+)?under\s+this\s+agreement\s+(?:must|shall|may|will)\b|\bnotices?\b[\s\S]{0,100}?\b(?:must|shall|may|will)\s+be\s+in\s+writing\b)/i;

const ORPHAN_EMAIL_LINE_RE = /^\s*Email(?:\s+for\s+Notice)?\s*:\s*$/i;
const ORPHAN_ADDRESS_LINE_RE = /^\s*Address(?:\s+for\s+Notice)?\s*:\s*$/i;
const MALFORMED_NOTICE_LABEL_RE = /^\s*Email\s+for\s+Notices?\s*:/i;
const FUSED_NOTICES_HEADING_RE = /[a-z]\.\d+\.\s+Notices\b/i;

function stanzaHasLegalEntityLine(stanza: string): boolean {
  return noticeStanzaHasLegalEntityLine(stanza);
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

/** Authoritative notices family region — same boundary repair uses at freeze. */
function authoritativeNoticesRegionForValidation(corpus: string): string {
  return resolveAuthoritativeNoticesRegionForFreeze(corpus);
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
  if (!parties?.length && !roleContext?.intakeText?.trim()) return 0;
  return resolveCanonicalNoticePartyCount(parties ?? [], roleContext);
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
  const region = authoritativeNoticesRegionForValidation(text);
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
  // TEST542 — when the caller supplies an authoritative parties list (every freeze/gate callsite does),
  // the excess/missing decision MUST use the same intake-manifest-ceiling-aware authority
  // (canonicalAuthorityPartyCount, computed above with the notice roleContext) that the freeze trim and
  // the diagnostic log already use. The prior context-free requiredNoticeStanzaCount(opts.parties)
  // ignored the intake ceiling, so an authoritative-looking phantom Nth party leaking into the parties
  // list (from contaminated consumed authority / review-render parties) inflated the required count
  // above the number of real legal parties the intake resolves. A correctly-trimmed valid corpus was
  // then rejected with a spurious missing_/excess_party_notice_stanzas, the freeze gate failed, SoT was
  // never established, and the review fell back to the retry shell (blank review). This is
  // cache-independent, which is why the TEST541 safe-display cache fixes did not clear the live failure.
  // The pure-diagnostic callsite (no parties list) keeps its conservative context-free count.
  const callerSuppliedPartiesList = Array.isArray(opts?.parties);
  const partiesHaveAuthoritativeNames = (opts?.parties ?? []).some((p) => {
    const name = String(p.partyLegalName || "").trim();
    // Role labels ("Client", "Developer") are not legal-entity authority for notice stanzas.
    return name.length >= 3 && !/^Party\s+\d+$/i.test(name) && isAuthoritativeLegalEntityName(name);
  });
  const partiesHaveNoticeContacts = (opts?.parties ?? []).some((p) => {
    const row = p as {
      signerEmail?: string;
      email?: string;
      partyAddress?: string;
      address?: string;
    };
    const email = String(row.signerEmail || row.email || "").trim();
    const address = String(row.partyAddress || row.address || "").trim();
    // Ignore signer-setup placeholders — those are not real contact authority.
    if (/provided during signer setup/i.test(email) || /provided during signer setup/i.test(address)) {
      return false;
    }
    return email.length > 0 || address.length > 0;
  });
  const intakeHasAuthoritativeManifest = intakePartyManifestIsAuthoritative(opts?.intakeText);
  // Without real entity authority, do not require inventing Party 1/Party 2 notice scaffolding.
  const noticeAuthorityPresent = partiesHaveAuthoritativeNames || intakeHasAuthoritativeManifest;
  // Commercial no-invent: legal names / intake manifests alone must not force If-to stanzas
  // until email or address contact authority exists. Operative notice prose is enough until then.
  const requiredStanzas =
    !noticeAuthorityPresent || !partiesHaveNoticeContacts
      ? 0
      : callerSuppliedPartiesList && canonicalAuthorityPartyCount >= 2
        ? canonicalAuthorityPartyCount
        : requiredNoticeStanzaCount(opts?.parties, opts?.requireTwoPartyStanzas !== false);
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
    if (!noticeAuthorityPresent || !partiesHaveNoticeContacts) {
      // Commercial no-invent: omit notices until entity authority AND contact fields exist.
      // Legal names alone must not force invented notice emails/addresses.
      return violations;
    }
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
  // When no-invent sets requiredStanzas=0, existing If-to stanzas with entity lines still
  // count as operative Notices substance (heading-only "10. Notices." is not enough alone).
  const stanzasProvideOperativeSubstance = (() => {
    const attentionInCorpus = (
      text.match(/If to\s+[^:]+:\s*Attention:\s*Authorized\s+Signer/gi) || []
    ).length;
    if (attentionInCorpus >= 2) return true;
    if (stanzaCount < 1 && attentionInCorpus >= 1) return true;
    if (stanzaCount < 1) return false;
    const blocks = region
      .split(/\n(?=If to\s+)/i)
      .slice(1)
      .map((s) => s.trim())
      .filter(Boolean);
    const withEntity = blocks.filter((s) => stanzaHasLegalEntityLine(s)).length;
    if (withEntity >= Math.min(2, stanzaCount) && withEntity >= 1) return true;
    const attentionSignerStanzas = (
      region.match(/If to\s+[^:]+:\s*Attention:\s*Authorized\s+Signer/gi) || []
    ).length;
    return attentionSignerStanzas >= Math.min(2, stanzaCount) && attentionSignerStanzas >= 1;
  })();

  if (
    !NOTICES_OPERATIVE_TEXT_RE.test(region) &&
    !stanzasSatisfyAuthority &&
    !stanzasProvideOperativeSubstance
  ) {
    const corpusIfToCount = (text.match(/^If to\s+/gim) || []).length;
    if (
      requiredStanzas === 0 &&
      !partiesHaveNoticeContacts &&
      opts?.phase === "post_acceptance" &&
      (stanzaCount === 0 || corpusIfToCount >= 2) &&
      corpusIfToCount >= 1
    ) {
      return violations;
    }
    if (
      requiredStanzas === 0 &&
      stanzaCount === 0 &&
      !partiesHaveNoticeContacts &&
      opts?.phase === "post_acceptance"
    ) {
      return violations;
    }
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
    // Concise / e-sign-closed commercial Pro drafts may freeze before signer-setup adds
    // witness / blank By:____ chrome. Signing prepare owns execution append.
    const hasEsignClose =
      /\belectronic\s+signatures?\b|\be-?sign\b|\bcounterparts?\b/i.test(corpus);
    if (!qualifiesAsConciseAuthoritativePaidServerDraft(corpus) && !hasEsignClose) {
      violations.push({
        family: "execution_block",
        code: "missing_execution_block",
        message: "Execution block (IN WITNESS WHEREOF) is required before freeze.",
      });
    }
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
    // No-invent: freeze must not invent IN WITNESS / blank By:____ chrome.
    // Signing prepare owns execution append — do not hard-block freeze/SoT solely for
    // a missing witness when the corpus is otherwise structurally acceptable.
    const blocking = report.violations.filter((v) => v.code !== "missing_execution_block");
    if (blocking.length === 0) {
      return;
    }
    const filteredReport = { ...report, ok: false, violations: blocking };
    logClauseFamilyStructuralDiagnostic(corpus, filteredReport, {
      surface: opts?.surface ?? "freeze",
      phase: opts?.phase ?? "post_acceptance",
    });
    const codes = blocking.map((v) => v.code).join(",");
    throw new Error(
      `[paid-pro-clause-family-structural-blocked] surface=${opts?.surface ?? "freeze"} codes=${codes}`,
    );
  }
}
