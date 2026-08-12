/**
 * Party Notice Details — signer email/address hydration into paid Pro agreement corpus.
 * Idempotent insert near Notices (Section 11) or before signature blocks.
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES } from "./paidProNPartySignerSetup";
import {
  mergeLabeledPartyAuthorityIntoParties,
  partyDisplayRoleLabelForAuthorityParty,
  partyLegalNamesMatch,
  preserveSlotIndexedSignerMetadataParties,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";
import { resolveCanonicalPartyLegalNameForIndex } from "./canonicalPartyLegalNameSanitizer";
import {
  resolveCanonicalPartyIdentitiesFromIntake,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import {
  collapseDuplicateNoticeEntityLines,
  collapseDuplicatedLegalEntityPhrase,
  hasPartyMetadataLabelContamination,
  isAuthoritativeLegalEntityName,
  stripTrailingPartyMetadataLabel,
} from "./paidProPartyNamePreserve";
import { isIntakeSectionLabelLine } from "./intakeSectionLabels";
import {
  isPartyAddressBoundaryLine,
  sanitizeCanonicalPartyAddress,
} from "./canonicalPartyStructuredAddress";
import { isAddressContinuationLine } from "./labeledPartyBlockParse";
import { readFrozenCanonicalManifestPartyNames, readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import {
  resolveAuthoritativeSignerCount,
  resolveIntakeManifestAuthorityCount,
} from "./signerCountAuthority";
import { extractBetweenPartyRawPair } from "./partyBetweenParse";
import {
  applyContactAuthorityExecutionBlockIntegrity,
  stripExecutionBlockContactContamination,
} from "./contactAuthorityExecutionBlockIntegrity";
import {
  resolveAuthoritativeWitnessIndex,
  stripPreWitnessExecutionPollutionFromPrefix,
  ensureBlankLineBeforeWitnessBlock,
} from "./paidProExecutionBlockNormalization";
import {
  buildSignerMetadataPartiesFromIntakeManifest,
  extractIntakePartyManifestRows,
  intakePartyManifestIsAuthoritative,
  overlayIntakeManifestOnReviewParties,
} from "./intakePartyManifestAuthority";

export const PARTY_NOTICE_DETAILS_HEADING = "Party Notice Details:";

const NOTICE_DELIVERY_RE =
  /Any notice under this Agreement must be in writing[^\n]*(?:\n[^\n]*){0,2}/i;

const NOTICES_SECTION_RE =
  /(?:^|\n)\s*(?:11\.\s*)?Notices(?:\s+and\s+Dispute\s+Terms)?\s*\.?\s*(?:\n|$)/i;

export function partyRoleLabelForIndex(partyIndex: number): string {
  if (partyIndex === 0) return "Client";
  if (partyIndex === 1) return "Service Provider";
  return `Party ${partyIndex + 1}`;
}

export function buildPartyNoticeDetailsBlock(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const lines: string[] = [PARTY_NOTICE_DETAILS_HEADING, ""];
  let wroteParty = false;
  for (const party of parties) {
    const legal = resolveCanonicalPartyLegalNameForIndex(party.partyIndex, parties);
    const email = party.signerEmail.trim();
    if (!legal) continue;
    lines.push(`${partyDisplayRoleLabelForAuthorityParty(party, roleContext)}:`);
    lines.push(legal);
    const name = party.signerName.trim();
    const title = party.signerTitle.trim();
    const address = party.partyAddress.trim();
    if (name) lines.push(`Signer: ${name}`);
    if (title) lines.push(`Title: ${title}`);
    if (email) lines.push(`Email: ${email}`);
    if (address) lines.push(`Address: ${address}`);
    lines.push("");
    wroteParty = true;
  }
  if (!wroteParty) return "";
  return `${lines.join("\n").trimEnd()}\n`;
}

export function stripExistingPartyNoticeDetails(corpus: string): string {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const start = text.search(/^\s*Party Notice Details:\s*$/im);
  if (start < 0) return text;
  const tail = text.slice(start);
  const relEnd = tail.search(
    /\n\n(?=\d+\.\s*\w|IN WITNESS WHEREOF|CLIENT:\s*$|SERVICE PROVIDER:\s*$)/im,
  );
  const end = relEnd >= 0 ? start + relEnd : text.length;
  const before = text.slice(0, start).trimEnd();
  const after = text.slice(end).trimStart();
  if (!after) return before;
  if (!before) return after;
  return `${before}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function findPartyNoticeDetailsInsertionIndex(corpus: string): number {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const noticesSection = text.search(NOTICES_SECTION_RE);
  if (noticesSection >= 0) {
    const afterSection = text.slice(noticesSection);
    const delivery = afterSection.match(NOTICE_DELIVERY_RE);
    if (delivery?.index != null) {
      const absStart = noticesSection + delivery.index + delivery[0].length;
      const tail = text.slice(absStart);
      const nextBreak = tail.search(/\n\n/);
      return nextBreak >= 0 ? absStart + nextBreak + 2 : absStart;
    }
    const sectionTail = text.slice(noticesSection);
    const firstParaEnd = sectionTail.search(/\n\n/);
    if (firstParaEnd >= 0) {
      return noticesSection + firstParaEnd + 2;
    }
  }
  const sigStart = findSignatureRegionStart(text);
  if (sigStart >= 0) {
    return sigStart;
  }
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness >= 0) return witness;
  return text.length;
}

export function corpusHasPartyNoticeDetails(corpus: string): boolean {
  return /^\s*Party Notice Details:\s*$/im.test((corpus || "").replace(/\r\n/g, "\n"));
}

export function corpusIncludesPartyNoticeEmails(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  const body = corpus || "";
  for (const party of parties) {
    const email = party.signerEmail.trim();
    if (!email) continue;
    if (!body.includes(email)) return false;
    if (!new RegExp(`Email:\\s*${escapeRegExp(email)}`, "i").test(body)) return false;
  }
  return parties.some((p) => p.signerEmail.trim().length > 0);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let lastPartyNoticeHydrationLogHash = "";

export function logPartyNoticeDetailsHydration(payload: {
  surface: string;
  inserted: boolean;
  corpusLen: number;
  partyCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!paidProSignerMetadataForensicLineageEnabled()) return;
  const hash = `party-notice:${payload.corpusLen}:${payload.partyCount}`;
  if (hash === lastPartyNoticeHydrationLogHash && payload.inserted) return;
  if (payload.inserted) lastPartyNoticeHydrationLogHash = hash;
  // eslint-disable-next-line no-console
  console.info("[party-notice-details-hydration]", payload);
}

/**
 * Insert or replace Party Notice Details in the agreement corpus (idempotent).
 */
export function applyPartyNoticeDetailsToCorpus(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; applied: boolean; replaced: boolean } {
  const block = buildPartyNoticeDetailsBlock(parties, roleContext);
  if (!block.trim()) {
    return { text: corpus, applied: false, replaced: false };
  }
  const hasEmail = parties.some((p) => p.signerEmail.trim());
  if (!hasEmail) {
    return { text: corpus, applied: false, replaced: false };
  }

  if (corpusHasPartyNoticeDetails(corpus)) {
    const start = corpus.search(/^\s*Party Notice Details:\s*$/im);
    const tail = corpus.slice(start);
    const relEnd = tail.search(/\n\n(?=\d+\.\s*\w|IN WITNESS WHEREOF)/im);
    const existingBlock = (relEnd >= 0 ? tail.slice(0, relEnd) : tail).trim();
    if (existingBlock === block.trim()) {
      return { text: corpus, applied: true, replaced: false };
    }
  }

  const stripped = stripExistingPartyNoticeDetails(corpus);
  const replaced = stripped.length !== (corpus || "").trim().length;
  const insertAt = findPartyNoticeDetailsInsertionIndex(stripped);
  const before = stripped.slice(0, insertAt).trimEnd();
  const after = stripped.slice(insertAt).trimStart();
  const merged = after
    ? `${before}\n\n${block.trimEnd()}\n\n${after}\n`
    : `${before}\n\n${block.trimEnd()}\n`;
  return {
    text: merged.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    applied: true,
    replaced,
  };
}

const BLANK_SIGNATURE_NOTICE_EMAIL_RE = /email\s+for\s+notices?\s*:\s*_{4,}/i;
const BLANK_SIGNATURE_NOTICE_ADDRESS_RE = /address\s+for\s+notices?\s*:\s*_{4,}/i;

/**
 * Contact authority: remove legacy Email/Address for Notice lines from execution blocks.
 * Never inserts notice placeholders into signature regions.
 */
export function ensureExecutionBlockNoticeContactFieldLines(corpus: string): {
  text: string;
  inserted: number;
} {
  const stripped = stripExecutionBlockContactContamination(corpus);
  return { text: stripped.text, inserted: 0 };
}

export function corpusHasBlankSignatureNoticePlaceholders(corpus: string): boolean {
  return (
    BLANK_SIGNATURE_NOTICE_EMAIL_RE.test(corpus || "") ||
    BLANK_SIGNATURE_NOTICE_ADDRESS_RE.test(corpus || "")
  );
}

/**
 * Contact authority: strip signature-block notice/contact lines (never hydrate contact into execution blocks).
 */
export function applySignatureNoticeContactFieldsToCorpus(
  corpus: string,
  _parties: readonly PaidProSignerMetadataParty[],
  _roleContext?: PaidProPartyRoleContext | null,
): { text: string; applied: boolean; replacements: number } {
  const integrity = applyContactAuthorityExecutionBlockIntegrity(corpus, {
    source: "signature_notice_contact_strip",
    ensureNoticesClause: false,
  });
  return {
    text: integrity.text,
    applied: integrity.repaired,
    replacements: integrity.repairs.length,
  };
}

const DANGLING_IF_TO_RE = /\nIf to\s*:?\s*$/i;

const NOTICE_PLACEHOLDER_TOKEN_RE =
  /\[\s*(?:(?:SIGNER|PARTY|CONTACT)_)?(?:EMAIL|ADDRESS|NAME|TITLE)(?:_\d+)?\s*\]/i;

const ROLE_ONLY_IF_TO_HEADER_RE = /^If to (?:the )?(?:Client|Service\s+Provider)\s*:\s*$/i;

const GENERIC_MANIFEST_NOTICE_PLACEHOLDER_HEADER_RE =
  /^If to (Party\s+\d+)\s*:\s*$/i;

const CORRUPTED_NOTICE_ROLE_FUSION_RE =
  /^(?:Client|Service\s+Provider)(?:\s+(?:Client|Service\s+Provider))+\s+(?:Attention|Attn)\s*:/i;

const CORRUPTED_NOTICE_ROLE_ATTENTION_RE =
  /^(?:Client|Service\s+Provider)\s+(?:Client|Service\s+Provider\s+)?(?:Attention|Attn)\s*:/i;

export function noticeStanzaContainsPlaceholderTokens(stanza: string): boolean {
  return NOTICE_PLACEHOLDER_TOKEN_RE.test(stanza || "");
}

/** Detect execution-block pollution fused into or appended to operative notice stanzas. */
export function noticeStanzaHasExecutionPollution(stanza: string): boolean {
  const trimmed = (stanza || "").trim();
  if (!trimmed) return false;
  if (/IN WITNESS WHEREOF/i.test(trimmed) && !/^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) return true;
  if (/^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) return true;
  if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/im.test(trimmed)) return true;
  if (/^\s*(?:By|Name|Title|Date)\s*:/im.test(trimmed)) return true;
  return false;
}

function noticesRegionHasExecutionPollution(region: string): boolean {
  return noticeStanzaHasExecutionPollution(region) || /\bIN WITNESS WHEREOF\b/i.test(region || "");
}

function operativeMiddleHasExecutionBoundaryPollution(middle: string): boolean {
  const trimmed = (middle || "").trim();
  if (!trimmed) return false;
  if (noticesRegionHasExecutionPollution(trimmed)) return true;
  if (/^\s*IN WITNESS WHEREOF\b/im.test(trimmed)) return true;
  if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/im.test(trimmed)) return true;
  return /^\s*(?:By|Name|Title|Date)\s*:/im.test(trimmed);
}

/** Canonical positional notice identity for intake-less generic manifest fixtures (Party 1, Party 2, …). */
export function isCanonicalPositionalNoticeEntityIdentity(name: string): boolean {
  return /^Party\s+\d+$/i.test((name || "").trim());
}

/** True when an operative notice stanza carries a usable legal-entity line (authoritative or positional). */
export function noticeStanzaHasLegalEntityLine(stanza: string): boolean {
  const trimmed = (stanza || "").trim();
  if (!trimmed) return false;
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const entityLine = lines[1] ?? "";
  const usableEntity = (value: string): boolean => {
    const v = value.trim();
    if (v.length < 3) return false;
    if (hasPartyMetadataLabelContamination(v)) return false;
    if (/^provided during signer setup\.?$/i.test(v)) return false;
    if (/^(?:Address|Email|Attn|Attention|Fax|Phone)\s*:/i.test(v)) return false;
    // Header-only "If to Party 2:" is incomplete — positional names count only as a body line.
    if (isCanonicalPositionalNoticeEntityIdentity(v)) return false;
    return true;
  };
  if (usableEntity(entityLine)) return true;
  // Body-line positional identity (If to Party 2:\nParty 2) is authoritative for fixtures.
  if (isCanonicalPositionalNoticeEntityIdentity(entityLine)) return true;
  // `If to Blue Canyon Analytics LLC:` — real entity may live in the header when Address/Email follow.
  // Do not treat header-only Party N as a complete entity line (TEST581 heading-only rebuild).
  const headerEntity = lines[0]?.match(/^If to\s+(.+?)\s*:\s*$/i);
  if (headerEntity && usableEntity(headerEntity[1] ?? "")) return true;
  const fused = lines[0]?.match(/^If to\s+(.+?)\s*:\s*(.+)$/i);
  if (fused) {
    if (usableEntity(fused[1] ?? "")) return true;
    if (usableEntity(fused[2] ?? "")) return true;
  }
  return false;
}

function resolveCompleteOperativeNoticesFamilyEndForFreeze(text: string, noticesStart: number): number {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const operativeEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  const baseEnd = resolveOperativeNoticesFamilyEnd(text, noticesStart);
  if (noticesStart < 0 || noticesStart >= operativeEnd) return baseEnd;

  const region = text.slice(noticesStart, operativeEnd);
  if (!/^If to\s+/im.test(region)) return baseEnd;

  let end = baseEnd;
  let offset = noticesStart;
  for (const line of region.split("\n")) {
    const trimmed = line.trim();
    const lineEnd = offset + line.length;
    if (/^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) break;
    if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(trimmed)) break;
    if (
      /^\s*(?:By|Name|Title|Date)\s*:/i.test(trimmed) &&
      !/^If to\s+/i.test(trimmed) &&
      !/^Party\s+\d+$/i.test(trimmed)
    ) {
      break;
    }
    end = lineEnd;
    offset = lineEnd + 1;
  }
  return Math.min(operativeEnd, Math.max(baseEnd, end));
}

/** Shared notice-region normalization — same defuse/strip repair and validation both apply. */
function normalizeOperativeNoticesRegionText(noticesRegion: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const defusedLines: string[] = [];
  for (const line of (noticesRegion || "").split("\n")) {
    const defused = defuseEntityWitnessFusionLine(line);
    if (defused.repaired) repairs.push("notice:defuse_entity_witness_fusion");
    if (defused.line) defusedLines.push(defused.line);
  }
  let region = defusedLines.join("\n");
  const pollutionStrip = stripPreWitnessExecutionPollutionFromPrefix(region);
  if (pollutionStrip.repairs.length > 0) {
    repairs.push(...pollutionStrip.repairs.map((r) => `notice:${r}`));
  }
  return { text: pollutionStrip.text, repairs };
}

/**
 * Authoritative notices-region slice for freeze validation — matches repair boundary
 * (operative family end + defuse/strip), not the full notices-to-witness span.
 */
export function resolveAuthoritativeNoticesRegionForFreeze(corpus: string): string {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return "";
  const noticesFamilyEnd = resolveCompleteOperativeNoticesFamilyEndForFreeze(text, noticesIdx);
  const noticesFamily = text.slice(noticesIdx, noticesFamilyEnd);
  return normalizeOperativeNoticesRegionText(noticesFamily).text;
}

/**
 * Seal notice/execution boundary on the freeze corpus — drop execution pollution stranded
 * between the operative notices family and the canonical witness block.
 * Does not re-normalize the notices family (repair already owns that).
 */
export function sealPaidProNoticesExecutionBoundaryInCorpus(
  corpus: string,
): { text: string; repairs: string[] } {
  const normalized = (corpus || "").replace(/\r\n/g, "\n");
  const layout = sliceOperativeNoticeLayout(normalized);
  if (!layout) return { text: corpus, repairs: [] };
  if (!operativeMiddleHasExecutionBoundaryPollution(layout.middle)) {
    return { text: corpus, repairs: [] };
  }
  const sealed = joinOperativeNoticeLayout({
    before: layout.before,
    noticesFamily: layout.noticesFamily,
    middle: "",
    after: layout.after,
  });
  return {
    text: sealed,
    repairs: sealed !== normalized ? ["notice:seal_execution_boundary_middle"] : [],
  };
}

function defuseEntityWitnessFusionLine(line: string): { line: string; repaired: boolean } {
  const trimmed = line.trim();
  if (!/IN WITNESS WHEREOF/i.test(trimmed) || /^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) {
    return { line, repaired: false };
  }
  const cleaned = trimmed.replace(/\s*IN WITNESS WHEREOF[\s\S]*$/i, "").trim();
  if (!cleaned) return { line: "", repaired: true };
  return { line: cleaned, repaired: cleaned !== trimmed };
}

/**
 * Clear “between A and B” intakes (including bracket placeholders) must stay bipartite for
 * notice stanza authority — UI max party slots must not invent Party 3–5 repairs/warnings.
 */
function resolveClearBipartiteBetweenNoticeCeiling(intake: string): number {
  const text = (intake || "").trim();
  if (!text) return 0;
  if (/\b(?:three|four|five|3|4|5)\s+parties\b/i.test(text)) return 0;
  if (/\bParty\s*3\b/i.test(text) && /\bParty\s*[12]\b/i.test(text)) return 0;
  if (/\bamong\b/i.test(text) && /,/.test(text)) return 0;
  const pair = extractBetweenPartyRawPair(text);
  if (!pair) return 0;
  // Oxford multi-party: "A, B, and C" — left side carries an "and" or multiple comma segments.
  if (/\band\b/i.test(pair.leftRaw)) return 0;
  const leftCommaParts = pair.leftRaw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !/^(?:inc|llc|ltd|corp|co)\.?$/i.test(p));
  if (leftCommaParts.length >= 2) return 0;
  return 2;
}

export function resolveCanonicalNoticePartyCount(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): number {
  const rawCount = resolveCanonicalNoticePartyCountRaw(parties, roleContext);
  // TEST538 — never let a contaminated parties list expand the notice authority past the number of
  // real legal parties the immutable intake manifest resolves (phantom 5th / Party 1 placeholder).
  const ceiling = resolveIntakeManifestAuthorityCount(roleContext?.intakeText ?? "");
  const bipartite = resolveClearBipartiteBetweenNoticeCeiling(roleContext?.intakeText ?? "");
  let count = ceiling >= 2 ? Math.min(rawCount, ceiling) : rawCount;
  if (bipartite === 2) count = Math.min(count, 2);
  return count;
}

function resolveCanonicalNoticePartyCountRaw(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): number {
  const intake = roleContext?.intakeText?.trim() ?? "";
  const bipartiteCeiling = resolveClearBipartiteBetweenNoticeCeiling(intake);
  if (bipartiteCeiling === 2) {
    return 2;
  }
  const draftPartyNames =
    roleContext?.draftPartyNames ??
    parties.map((p) => p.partyLegalName).filter((n) => n.trim().length >= 2);
  const intakeManifestCeiling = resolveIntakeManifestAuthorityCount(intake);

  // The authoritative intake party manifest fixes the exact stanza count — corpus-derived
  // counts can over-count (phantom Scope Inc.) or under-count (dropped Client).
  if (intake && intakePartyManifestIsAuthoritative(intake)) {
    const manifestRows = extractIntakePartyManifestRows(intake).filter((row) =>
      isAuthoritativeLegalEntityName(row.partyLegalName),
    );
    if (manifestRows.length >= 2) {
      return Math.min(manifestRows.length, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
    }
  }

  if (intake) {
    const resolved = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftPartyNames,
      draftParties: parties.map((p) => ({ name: p.partyLegalName })),
      manifestPartyCount: parties.length,
    });
    if (resolved.count >= 2) {
      const capped =
        intakeManifestCeiling >= 2
          ? Math.min(resolved.count, intakeManifestCeiling)
          : resolved.count;
      return Math.min(capped, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
    }
    if (intakeManifestCeiling >= 2) {
      return Math.min(intakeManifestCeiling, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
    }
  }

  const authoritativeFromParties = parties.filter(
    (p) =>
      String(p.partyLegalName ?? "").trim().length >= 2 &&
      isAuthoritativeLegalEntityName(p.partyLegalName),
  ).length;
  if (authoritativeFromParties >= 2) {
    return Math.min(authoritativeFromParties, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
  }

  const authoritativeDraftNames = draftPartyNames.filter(isAuthoritativeLegalEntityName).length;
  if (authoritativeDraftNames >= 2) {
    return Math.min(authoritativeDraftNames, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
  }

  if (intake) {
    const resolved = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftPartyNames,
    });
    if (resolved.count >= 2) {
      return Math.min(resolved.count, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
    }
  }

  const frozen = readFrozenCanonicalManifestPartyCount();
  if (frozen >= 2) {
    return Math.min(frozen, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
  }

  const authoritativeRows = parties.filter((p) => p.partyLegalName.trim().length >= 2).length;
  return Math.min(Math.max(authoritativeRows, 2), PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
}

function resolveCanonicalNoticeAuthorityParties(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): readonly PaidProSignerMetadataParty[] {
  const intake = roleContext?.intakeText?.trim() ?? "";
  const draftPartyNames = roleContext?.draftPartyNames ?? parties.map((p) => p.partyLegalName);
  const acceptedCorpus = roleContext?.acceptedCorpus?.trim() ?? "";

  const maxParties = resolveCanonicalNoticePartyCount(parties, roleContext);

  const canonicalFromSources = (): PaidProSignerMetadataParty[] => {
    const records = resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: intake || null,
      generatedBody: acceptedCorpus || null,
      starterNames: draftPartyNames,
    });
    if (records.length < 2) return [];
    return records.slice(0, maxParties).map((record, partyIndex) => ({
      partyIndex,
      partyLegalName: record.fullLegalName,
      signerEmail: "",
      signerName: (record.signerName?.trim() || "").trim(),
      signerTitle: (record.signerTitle?.trim() || "").trim(),
      partyAddress: (record.partyAddress?.trim() || "").trim(),
    }));
  };

  let base =
    parties.length >= 2
      ? parties.slice(0, maxParties)
      : intake
        ? mergeLabeledPartyAuthorityIntoParties([], intake)
        : parties;

  if (
    base.filter((p) => isAuthoritativeLegalEntityName(p.partyLegalName.trim())).length < 2
  ) {
    const fromCanonical = canonicalFromSources();
    if (fromCanonical.length >= 2) {
      base = preserveSlotIndexedSignerMetadataParties(fromCanonical, base, maxParties).slice(
        0,
        maxParties,
      );
    }
  }

  if (intake && intakePartyManifestIsAuthoritative(intake)) {
    const manifestParties = buildSignerMetadataPartiesFromIntakeManifest(intake);
    const overlayBase = base.filter((p) => p.partyLegalName.trim().length >= 2).length >= 2 ? base : manifestParties;
    return overlayIntakeManifestOnReviewParties(intake, overlayBase).slice(0, maxParties);
  }

  if (!intake) return base.slice(0, maxParties);

  const merged = mergeLabeledPartyAuthorityIntoParties(base, intake);
  return preserveSlotIndexedSignerMetadataParties(merged, base, maxParties).slice(0, maxParties);
}

function enrichNoticeAuthorityParties(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): readonly PaidProSignerMetadataParty[] {
  const cap = resolveCanonicalNoticePartyCount(parties, roleContext);
  const cappedSource = parties.slice(0, cap);
  const resolved = ensureNoticeAuthorityPartyLegalEntities(
    resolveCanonicalNoticeAuthorityParties(cappedSource, roleContext),
    roleContext,
  );
  if (intakePartyManifestIsAuthoritative(roleContext?.intakeText)) {
    return resolved.slice(0, cap);
  }
  return preserveSlotIndexedSignerMetadataParties(resolved, cappedSource, cap).slice(0, cap);
}

/** Canonical manifest parties for notice stanza validation and freeze structural gates. */
export function resolveNoticeStructuralValidationParties(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): readonly PaidProSignerMetadataParty[] {
  return enrichNoticeAuthorityParties(parties, roleContext);
}

/** True when multiple operative "If to" notice stanzas are fused on one line or empty. */
export function hasInlineMalformedNoticeStanzas(text: string): boolean {
  const corpus = (text || "").replace(/\r\n/g, "\n");
  return corpus.split("\n").some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^\s*If to\s*:\s*$/i.test(trimmed)) return true;
    const ifToCount = (trimmed.match(/\bIf to\s+/gi) ?? []).length;
    return ifToCount >= 2;
  });
}

/** Detect fused party/role labels in operative notice stanzas. */
export function noticeStanzaHasRoleLabelCorruption(stanza: string): boolean {
  const trimmed = (stanza || "").trim();
  if (!trimmed) return false;
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines[0] ?? "";
  const entityLine = lines[1] ?? "";
  const placeholderHeader = header.match(GENERIC_MANIFEST_NOTICE_PLACEHOLDER_HEADER_RE);
  if (
    placeholderHeader &&
    entityLine.toLowerCase() === placeholderHeader[1]!.toLowerCase()
  ) {
    return false;
  }
  if (ROLE_ONLY_IF_TO_HEADER_RE.test(header)) return true;
  const ifToEntity = header.match(/^If to\s+(.+?)\s*:\s*$/i)?.[1]?.trim() ?? "";
  if (ifToEntity && hasPartyMetadataLabelContamination(ifToEntity)) return true;
  // Line 2 may be Address:/Email:/Attn: when the entity line is omitted — that is incomplete,
  // not role-label corruption (empty_notice_entity_name covers the missing entity).
  const entityLooksLikeContactField =
    /^(?:Address|Email|Attn|Attention|Phone|Tel)\b/i.test(entityLine);
  if (
    entityLine &&
    !entityLooksLikeContactField &&
    hasPartyMetadataLabelContamination(entityLine)
  ) {
    return true;
  }
  return lines.some((line) => {
    const t = line.trim();
    return CORRUPTED_NOTICE_ROLE_FUSION_RE.test(t) || CORRUPTED_NOTICE_ROLE_ATTENTION_RE.test(t);
  });
}

/** True when a line opens an operative Notices-clause "If to …:" stanza (approved contact destination). */
export function isOperativeIfToNoticeStanzaHeading(line: string): boolean {
  const trimmed = (line || "").trim();
  return /^If to\s+.+\s*:\s*$/i.test(trimmed);
}

/** Extract complete operative If to stanzas from a notices-region slice. */
export function extractOperativeIfToNoticeStanzas(noticesRegion: string): string {
  const region = (noticesRegion || "").replace(/\r\n/g, "\n");
  const blocks = region.split(/\n(?=If to\s+)/i);
  if (blocks.length <= 1) return "";
  const stanzas = blocks.slice(1).map((b) => b.trim()).filter(Boolean);
  return stanzas.join("\n\n");
}

export function logPaidProNoticeSectionIntegrity(payload: {
  repairs: string[];
  partyCount: number;
  stanzaCount: number;
  phase?: "preview_repair" | "freeze_commit" | "post_signer_hydrate";
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!payload.repairs.length) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-notice-section-integrity]", {
    ...payload,
    phase: payload.phase ?? "preview_repair",
    diagnosticOnly: (payload.phase ?? "preview_repair") === "preview_repair",
  });
}

/**
 * Display-only: split a single-line US address into street + city/state/ZIP for notice stanza layout.
 * Not used for extraction or boundary detection.
 */
export function formatUsNoticeAddressForDisplay(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  const usAddress = trimmed.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (usAddress) {
    return [
      usAddress[1].trim(),
      `${usAddress[2].trim()}, ${usAddress[3].toUpperCase()} ${usAddress[4]}`,
    ];
  }
  return [trimmed];
}

/** Optional-contact display: omit missing email/address; never emit placeholder tokens. */
export function formatNoticeAddressLines(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  // Never re-emit pre-signer notice placeholders into finalized notice stanzas.
  if (/provided during signer setup/i.test(trimmed)) return [];
  const explicitLines = trimmed
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines;
  return formatUsNoticeAddressForDisplay(trimmed);
}

const NOTICE_ADDRESS_HEADER_RE = /^Address(?:\s+for\s+Notice)?\s*:\s*(.*)$/i;

const NOTICE_ADDRESS_EXECUTION_LINE_RE =
  /^(?:By|Name|Title|Date|CLIENT|SERVICE\s+PROVIDER)\s*:/i;

const NOTICE_ADDRESS_INSTRUCTIONAL_LINE_RE =
  /\b(?:each party should\b|signature block\b|in witness whereof\b|parties (?:shall )?execute\b)/i;

/** True when a line must stop multiline notice-address capture (execution, headings, prose). */
export function isNoticeAddressCaptureBoundaryLine(line: string | null | undefined): boolean {
  const t = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (isPartyAddressBoundaryLine(t)) return true;
  if (isIntakeSectionLabelLine(t)) return true;
  if (noticeStanzaHasExecutionPollution(t)) return true;
  if (NOTICE_ADDRESS_EXECUTION_LINE_RE.test(t)) return true;
  if (/^If to\s+/i.test(t)) return true;
  if (/^\d+\.(?!\d)\s+\S/.test(t)) return true;
  if (NOTICE_ADDRESS_INSTRUCTIONAL_LINE_RE.test(t)) return true;
  if (/^\s*IN WITNESS WHEREOF\b/i.test(t)) return true;
  return false;
}

/**
 * Not postal validation — true when a line may continue a multiline notice Address block.
 * Aligns with intake `isAddressContinuationLine`; adds notice-specific prose guards only.
 */
export function isNoticeAddressContinuationLine(line: string | null | undefined): boolean {
  const t = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isNoticeAddressCaptureBoundaryLine(t)) return false;
  if (/^(?:Attn|Attention|Email)\s*:/i.test(t)) return false;
  if (/\b(?:should|shall|must|will|may)\b/i.test(t) && t.length > 40) return false;
  return isAddressContinuationLine(t);
}

/** Sanitize a notice address value extracted from an operative If-to stanza. */
export function sanitizeNoticeStanzaAddress(value: string | null | undefined): string {
  return sanitizeCanonicalPartyAddress(value, { source: "sanitizeNoticeStanzaAddress" });
}

/** Extract the Address block from one operative If-to notice stanza with deterministic boundaries. */
export function extractNoticeAddressFromStanza(stanza: string): string {
  const lines = (stanza || "").replace(/\r\n/g, "\n").split("\n");
  const captured: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(NOTICE_ADDRESS_HEADER_RE);
    if (headerMatch) {
      const inlineBody = (headerMatch[1] ?? "").trim();
      if (inlineBody) {
        const sanitizedInline = sanitizeNoticeStanzaAddress(inlineBody);
        if (sanitizedInline) captured.push(sanitizedInline);
        capturing = false;
      } else {
        capturing = true;
      }
      continue;
    }
    if (!capturing) continue;
    if (isNoticeAddressCaptureBoundaryLine(trimmed)) break;
    if (/^(?:Attn|Attention|Email)\s*:/i.test(trimmed)) break;
    if (!isNoticeAddressContinuationLine(trimmed)) break;
    captured.push(trimmed);
  }

  if (captured.length === 0) return "";
  if (captured.length === 1) return captured[0]!;
  return sanitizeNoticeStanzaAddress(captured.join("\n"));
}

/** Extract notice addresses from operative If-to stanzas in a finalized agreement body. */
export function extractPartyAddressesFromOperativeNoticeStanzas(corpus: string): string[] {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return [];
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const region = text.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : text.length);
  const stanzas = region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
  return stanzas.map((stanza) => extractNoticeAddressFromStanza(stanza));
}

/** True when a notice stanza Address block contains non-address prose beyond a valid postal line. */
export function noticeStanzaHasAddressPollution(stanza: string): boolean {
  if (noticeStanzaContainsPlaceholderTokens(stanza)) return false;
  const lines = (stanza || "").replace(/\r\n/g, "\n").split("\n");
  let capturing = false;
  const rawParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(NOTICE_ADDRESS_HEADER_RE);
    if (headerMatch) {
      const inlineBody = (headerMatch[1] ?? "").trim();
      if (inlineBody) rawParts.push(inlineBody);
      else capturing = true;
      continue;
    }
    if (!capturing) continue;
    if (isNoticeAddressCaptureBoundaryLine(trimmed)) break;
    if (/^(?:Attn|Attention|Email)\s*:/i.test(trimmed)) break;
    rawParts.push(trimmed);
  }

  if (!rawParts.length) return false;
  const rawJoined = rawParts.join(", ").replace(/\s+/g, " ").trim();
  const sanitized = sanitizeNoticeStanzaAddress(rawJoined);
  if (!sanitized) return rawJoined.length > 0;
  return rawJoined.length > sanitized.length + 4 || NOTICE_ADDRESS_INSTRUCTIONAL_LINE_RE.test(rawJoined);
}

const NOTICE_SIGNER_SETUP_EMAIL_LINE = "Email: provided during signer setup";
const NOTICE_SIGNER_SETUP_ADDRESS_LINE = "Address: provided during signer setup";
const NOTICE_SIGNER_SETUP_ATTENTION_LINE = "Attention: Authorized Signer";

/** Repair Address lines inside one operative If-to notice stanza. */
export function sanitizeNoticeStanzaAddressContent(stanza: string): { stanza: string; repaired: boolean } {
  if (!/Address(?:\s+for\s+Notice)?\s*:/i.test(stanza || "")) {
    return { stanza, repaired: false };
  }
  const sanitized = extractNoticeAddressFromStanza(stanza);
  const formatted = formatNoticeAddressLines(sanitized);
  const lines = (stanza || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inAddress = false;
  let repaired = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(NOTICE_ADDRESS_HEADER_RE);
    if (headerMatch) {
      // Empty sanitize result covers bare `Address:` and placeholder-only bodies
      // ("Address: provided during signer setup") — never emit orphan `Address:`.
      if (formatted.length === 0) {
        inAddress = false;
        if (trimmed !== NOTICE_SIGNER_SETUP_ADDRESS_LINE) repaired = true;
        out.push(NOTICE_SIGNER_SETUP_ADDRESS_LINE);
        continue;
      }
      if (formatted.length <= 1) {
        const nextValue = formatted[0] ?? sanitized;
        const nextLine = `Address: ${nextValue}`;
        if (trimmed !== nextLine) repaired = true;
        out.push(nextLine);
        inAddress = false;
        continue;
      }
      if (trimmed !== "Address:") repaired = true;
      out.push("Address:");
      out.push(...formatted);
      inAddress = false;
      continue;
    }
    if (inAddress) {
      if (
        isNoticeAddressCaptureBoundaryLine(trimmed) ||
        /^(?:Attn|Attention|Email|If to)\s*:/i.test(trimmed)
      ) {
        inAddress = false;
        out.push(line);
        continue;
      }
      repaired = true;
      continue;
    }
    out.push(line);
  }

  return { stanza: out.join("\n"), repaired };
}

function repairNoticeStanzaAddressBoundariesInCorpus(corpus: string): { text: string; repairs: string[] } {
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return { text: corpus, repairs: [] };
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const end = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const before = corpus.slice(0, noticesIdx);
  const region = corpus.slice(noticesIdx, end);
  const after = corpus.slice(end);
  const blocks = region.split(/\n(?=If to\s+)/i);
  const intro = blocks[0] ?? "";
  const stanzas = blocks.slice(1);
  const repairs: string[] = [];
  const rebuilt = stanzas.map((stanza) => {
    const { stanza: sanitized, repaired } = sanitizeNoticeStanzaAddressContent(stanza);
    if (repaired) repairs.push("notice:sanitize_stanza_address_boundary");
    return sanitized;
  });
  if (!repairs.length) return { text: corpus, repairs: [] };
  const mergedRegion = `${intro.trimEnd()}\n\n${rebuilt.join("\n\n")}`.replace(/\n{3,}/g, "\n\n");
  return {
    text: `${before}${mergedRegion}\n\n${after.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs,
  };
}

export function isBareEntityOnlyNoticeStanza(stanza: string): boolean {
  const lines = stanza
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 2) return false;
  if (!/^If to\s+/i.test(lines[0] ?? "")) return false;
  if (/Email|Attn|Address|primary business address/i.test(stanza)) return false;
  const entityFromHeading = (lines[0] ?? "")
    .replace(/^If to\s+/i, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  if (lines.length === 1) return entityFromHeading.length >= 2;
  const second = (lines[1] ?? "").trim().toLowerCase();
  return second === entityFromHeading || ENTITY_SUFFIX_LINE_RE.test(lines[1] ?? "");
}

const ENTITY_SUFFIX_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|INC|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

export function hasBareEntityOnlyNoticeStanzas(text: string): boolean {
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return false;
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const region = text.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : text.length);
  const blocks = region.split(/\n(?=If to\s+)/i).slice(1);
  return blocks.some((block) => isBareEntityOnlyNoticeStanza(block.trim()));
}

function noticeStanzaNeedsProfessionalSignerSetupFormat(stanza: string): boolean {
  const trimmed = expandFusedIfToNoticeStanza(stanza.trim());
  if (!/^If to\s+/im.test(trimmed)) return false;
  const hasEmail = /^Email(?:\s+for\s+Notice)?\s*:/im.test(trimmed);
  const hasAddress = /^Address(?:\s+for\s+Notice)?\s*:/im.test(trimmed);
  const hasAttention = /^(?:Attn|Attention)\s*:/im.test(trimmed);
  if (hasEmail && hasAddress && hasAttention) return false;
  if (isBareEntityOnlyNoticeStanza(trimmed)) return true;
  if (/provided during signer setup/i.test(trimmed) && (!hasEmail || !hasAddress || !hasAttention)) {
    return true;
  }
  return false;
}

function buildProfessionalSignerSetupNoticeStanza(stanza: string): string {
  const normalized = expandFusedIfToNoticeStanza(stanza.trim());
  const headingMatch = normalized.match(/^If to\s+(.+?):\s*/im);
  const entity = headingMatch?.[1]?.trim() ?? "";
  if (!entity) return stanza.trim();
  const bodyLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .join(" ")
    .replace(new RegExp(`^${entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(/provided during signer setup\.?/gi, "")
    .trim();
  const entityLine =
    bodyLine && ENTITY_SUFFIX_LINE_RE.test(bodyLine) && bodyLine.length >= entity.length
      ? bodyLine.replace(/:$/, "").trim()
      : entity;
  return [
    `If to ${entity}:`,
    entityLine,
    NOTICE_SIGNER_SETUP_ATTENTION_LINE,
    NOTICE_SIGNER_SETUP_EMAIL_LINE,
    NOTICE_SIGNER_SETUP_ADDRESS_LINE,
  ].join("\n");
}

/** Append safe notice destination wording to bare entity-name-only stanzas (display-only). */
export function repairBareEntityOnlyNoticeStanzas(corpus: string): { text: string; repairs: string[] } {
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return { text: corpus, repairs: [] };
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const before = corpus.slice(0, noticesIdx);
  const noticesFamilyEnd = resolveOperativeNoticesFamilyEnd(corpus, noticesIdx);
  let noticesRegion = corpus.slice(noticesIdx, noticesFamilyEnd);
  const middle = corpus.slice(noticesFamilyEnd, noticesEnd);
  const after = corpus.slice(noticesEnd);

  const blocks = noticesRegion.split(/\n(?=If to\s+)/i);
  const intro = blocks[0] ?? "";
  const stanzas = blocks.slice(1);
  const repairs: string[] = [];
  const rebuilt = stanzas.map((stanza) => {
    const trimmed = stanza.trim();
    if (!noticeStanzaNeedsProfessionalSignerSetupFormat(trimmed)) return trimmed;
    repairs.push("notice:professional_signer_setup_stanza");
    return buildProfessionalSignerSetupNoticeStanza(trimmed);
  });
  if (!repairs.length) return { text: corpus, repairs: [] };

  const mergedNotices = `${intro.trimEnd()}\n\n${rebuilt.join("\n\n")}`.replace(/\n{3,}/g, "\n\n");
  const middlePart = middle.trimEnd();
  const executionTail = after.trimStart();
  const middleSuffix = middlePart ? `\n\n${middlePart}` : "";
  const text = executionTail
    ? `${before}${mergedNotices}${middleSuffix}\n\n${executionTail}`.replace(/\n{3,}/g, "\n\n").trimEnd()
    : `${before}${mergedNotices}${middleSuffix}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text, repairs };
}

function noticeStanzaHasEntityLine(stanza: string): boolean {
  if (noticeStanzaHasLegalEntityLine(stanza)) return true;
  const entityLine = stanza
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[1];
  return Boolean(entityLine && entityLine.length >= 3 && ENTITY_SUFFIX_LINE_RE.test(entityLine));
}

function logPaidProNoticeEntityMissingDiagnostic(payload: {
  partyIndex: number;
  resolvedLegal: string;
  /** When set, suppress expected Party-N fallbacks past the deal’s party count. */
  noticePartyCap?: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const cap = payload.noticePartyCap;
  if (
    typeof cap === "number" &&
    cap >= 2 &&
    payload.partyIndex >= cap &&
    /^Party\s+\d+$/i.test(payload.resolvedLegal)
  ) {
    return;
  }
  // Ordinary 2-party drafts often carry unused UI slots; Party 3+ positional fallback is noise.
  if (payload.partyIndex >= 2 && /^Party\s+\d+$/i.test(payload.resolvedLegal)) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-notice-entity-missing]", payload);
}

function resolveNoticeStanzaLegalEntity(
  party: PaidProSignerMetadataParty,
  authorityParties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const direct = party.partyLegalName.trim();
  if (direct.length >= 2 && isAuthoritativeLegalEntityName(direct)) return direct;

  // TEST539 — the immutable intake manifest is the authority for party identity. Once it resolves the
  // real legal entity for this slot, notice validation must use it and must NEVER degrade to a
  // "Party N" placeholder — even when the draft/canonical/frozen/corpus sources are missing or were
  // contaminated by a prior generation attempt. This is the identity counterpart to the TEST538 count
  // ceiling: real manifest entity for the index always wins over a placeholder.
  const manifestIntake = roleContext?.intakeText?.trim() ?? "";
  if (manifestIntake && intakePartyManifestIsAuthoritative(manifestIntake)) {
    const manifestParties = buildSignerMetadataPartiesFromIntakeManifest(manifestIntake);
    const manifestLegal = manifestParties[party.partyIndex]?.partyLegalName?.trim() ?? "";
    if (manifestLegal.length >= 2 && isAuthoritativeLegalEntityName(manifestLegal)) {
      return manifestLegal;
    }
  }

  const draftNames = roleContext?.draftPartyNames ?? [];
  const fromDraft = String(draftNames[party.partyIndex] ?? "").trim();
  if (fromDraft.length >= 2 && isAuthoritativeLegalEntityName(fromDraft)) return fromDraft;

  const fromCanonical = resolveCanonicalPartyLegalNameForIndex(party.partyIndex, authorityParties).trim();
  if (fromCanonical.length >= 2 && isAuthoritativeLegalEntityName(fromCanonical)) return fromCanonical;
  const intake = roleContext?.intakeText?.trim() ?? "";
  if (intake) {
    const fromIntake = resolveCanonicalPartyIdentitiesFromIntake(
      intake,
      roleContext?.draftPartyNames ?? null,
    );
    const legal = fromIntake[party.partyIndex]?.fullLegalName?.trim() ?? "";
    if (legal.length >= 2 && isAuthoritativeLegalEntityName(legal)) return legal;
  }
  const frozen = readFrozenCanonicalManifestPartyNames();
  const frozenLegal = frozen[party.partyIndex]?.trim() ?? "";
  if (frozenLegal.length >= 2 && isAuthoritativeLegalEntityName(frozenLegal)) return frozenLegal;
  const acceptedCorpus = roleContext?.acceptedCorpus?.trim() ?? "";
  if (acceptedCorpus) {
    const fromCorpus = resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: intake || null,
      generatedBody: acceptedCorpus,
      starterNames: draftNames,
    });
    const corpusLegal = fromCorpus[party.partyIndex]?.fullLegalName?.trim() ?? "";
    if (corpusLegal.length >= 2 && isAuthoritativeLegalEntityName(corpusLegal)) return corpusLegal;
  }
  const sanitizeFallback = (value: string): string => {
    const raw = value.trim();
    if (raw.length < 2) return "";
    if (!hasPartyMetadataLabelContamination(raw)) return raw;
    const stripped = stripTrailingPartyMetadataLabel(raw);
    if (
      stripped.length >= 2 &&
      !hasPartyMetadataLabelContamination(stripped)
    ) {
      return stripped;
    }
    return "";
  };
  // Bracket template placeholders from suggested rewrites are acceptable interim identities.
  const bracketPlaceholder = (value: string): string => {
    const t = value.trim();
    return /^\[[^\]]{2,80}\]$/.test(t) ? t : "";
  };
  const fromBracket = bracketPlaceholder(direct) || bracketPlaceholder(fromDraft);
  if (fromBracket) return fromBracket;

  const safeDraft = sanitizeFallback(fromDraft);
  if (safeDraft) return safeDraft;
  const safeDirect = sanitizeFallback(direct);
  if (safeDirect) return safeDirect;
  logPaidProNoticeEntityMissingDiagnostic({
    partyIndex: party.partyIndex,
    resolvedLegal: `Party ${party.partyIndex + 1}`,
    noticePartyCap: authorityParties.length,
  });
  return `Party ${party.partyIndex + 1}`;
}

function ensureNoticeAuthorityPartyLegalEntities(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): PaidProSignerMetadataParty[] {
  return parties.map((party) => {
    const direct = party.partyLegalName.trim();
    if (direct.length >= 2 && isAuthoritativeLegalEntityName(direct)) return party;
    if (direct.length >= 2 && isCanonicalPositionalNoticeEntityIdentity(direct)) return party;
    const legal = resolveNoticeStanzaLegalEntity(party, parties, roleContext);
    if (legal === direct) return party;
    if (legal.length >= 2) {
      return { ...party, partyLegalName: legal };
    }
    return party;
  });
}

function noticeIntroAlreadyHasDeliveryLanguage(intro: string): boolean {
  return /notices?\s+(?:under|for)\s+this\s+agreement\s+must\s+be\s+in\s+writing/i.test(intro);
}

function expandFusedIfToNoticeStanza(stanza: string): string {
  const trimmed = stanza.trim();
  if (trimmed.includes("\n")) {
    return expandCollapsedInlineNoticeStanza(trimmed);
  }
  const fused = trimmed.match(/^If to\s+(.+?):\s*(.+)$/i);
  if (!fused?.[1] || !fused?.[2]) return trimmed;
  const expanded = `If to ${fused[1].trim()}:\n${fused[2].trim()}`;
  return expandCollapsedInlineNoticeStanza(expanded);
}

/** True when Attn/Email/address are fused on one line instead of canonical multiline blocks. */
export function isCollapsedInlineNoticeStanza(stanza: string): boolean {
  const trimmed = (stanza || "").trim();
  if (!/^If to\s+/i.test(trimmed)) return false;
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  if (lines.length === 1) {
    return /\b(?:Attn|Attention):\s*.+\s+Email:/i.test(lines[0] ?? "");
  }
  if (lines.some((line) => /\b(?:Attn|Attention):\s*.+\s+Email:/i.test(line))) return true;
  const headingLine = lines[0] ?? "";
  if (/^If to\s+.+\s*:\s*.+\b(?:Attn|Attention):/i.test(headingLine)) return true;
  const secondLine = lines[1] ?? "";
  const entityAttnFused = secondLine.match(/^(.+?)\s+(?:Attn|Attention):\s*(.+)$/i);
  if (entityAttnFused?.[1] && ENTITY_SUFFIX_LINE_RE.test(entityAttnFused[1])) return true;
  return false;
}

/** Expand inline fused notice rows into canonical multiline display blocks. */
export function expandCollapsedInlineNoticeStanza(stanza: string): string {
  const trimmed = (stanza || "").trim();
  if (!/^If to\s+/i.test(trimmed)) return trimmed;

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headingMatch = lines[0]?.match(/^If to\s+(.+?):\s*$/i);
  const entityFromHeading = headingMatch?.[1]?.trim() ?? "";
  const fusedSecond = lines[1]?.match(/^(.+?)\s+(?:Attn|Attention):\s*(.+)$/i);
  if (
    entityFromHeading &&
    fusedSecond?.[1] &&
    ENTITY_SUFFIX_LINE_RE.test(fusedSecond[1]) &&
    !/\bEmail:/i.test(lines[1] ?? "")
  ) {
    const entityLine = fusedSecond[1].trim();
    const attnPart = fusedSecond[2]?.trim() ?? "";
    const attnLine = /provided during signer setup/i.test(attnPart)
      ? NOTICE_SIGNER_SETUP_ATTENTION_LINE
      : `Attention: ${attnPart}`;
    return [lines[0]!, entityLine, attnLine, ...lines.slice(2)].join("\n");
  }

  if (!isCollapsedInlineNoticeStanza(trimmed)) return trimmed;
  const fused = trimmed.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const fusedHeadingMatch = fused.match(/^If to\s+(.+?):\s*(.*)$/i);
  if (!fusedHeadingMatch?.[1]) return trimmed;

  const entity = fusedHeadingMatch[1].trim();
  let body = (fusedHeadingMatch[2] ?? "").trim();
  body = body.replace(new RegExp(`^${escapeRegExp(entity)}\\s*`, "i"), "").trim();

  const inlineMatch = body.match(
    /^(?:Attn|Attention):\s*(.+?)\s+Email:\s*(\S+)(?:\s+(.*))?$/i,
  );
  if (!inlineMatch) return trimmed;

  const attnPart = inlineMatch[1]?.trim() ?? "";
  const email = inlineMatch[2]?.trim() ?? "";
  const addressPart = (inlineMatch[3] ?? "").trim();

  const outLines: string[] = [`If to ${entity}:`, entity];

  if (/provided during signer setup/i.test(attnPart)) {
    outLines.push(NOTICE_SIGNER_SETUP_ATTENTION_LINE);
  } else if (attnPart) {
    outLines.push(`Attention: ${attnPart}`);
  }

  if (/provided during signer setup/i.test(email)) {
    outLines.push(NOTICE_SIGNER_SETUP_EMAIL_LINE);
  } else if (email) {
    outLines.push(`Email: ${email}`);
  }

  if (/provided during signer setup/i.test(addressPart)) {
    outLines.push(NOTICE_SIGNER_SETUP_ADDRESS_LINE);
  } else if (addressPart) {
    if (/^Address:/i.test(addressPart)) {
      const addrBody = addressPart.replace(/^Address:\s*/i, "").trim();
      const addrLines = formatNoticeAddressLines(addrBody);
      if (addrLines.length > 0) outLines.push(...addrLines);
    } else {
      const addrLines = formatNoticeAddressLines(addressPart);
      if (addrLines.length > 0) outLines.push(...addrLines);
    }
  }

  return outLines.join("\n");
}

/** True when operative notice stanzas are collapsed inline (single-line Attn/Email fusion). */
export function hasCollapsedInlineNoticeStanzas(text: string): boolean {
  const corpus = (text || "").replace(/\r\n/g, "\n");
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return false;
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const region = corpus.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : corpus.length);
  const blocks = region.split(/\n(?=If to\s+)/i).slice(1);
  return blocks.some((block) => isCollapsedInlineNoticeStanza(block.trim()));
}

/** Display-only repair: expand collapsed inline notice stanzas into multiline blocks. */
export function repairCollapsedInlineNoticeStanzas(corpus: string): { text: string; repairs: string[] } {
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return { text: corpus, repairs: [] };
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const before = corpus.slice(0, noticesIdx);
  const fullRegion = corpus.slice(noticesIdx, noticesEnd);
  const after = corpus.slice(noticesEnd);

  const blocks = fullRegion.split(/\n(?=If to\s+)/i);
  const intro = blocks[0] ?? "";
  const stanzas = blocks.slice(1);
  const repairs: string[] = [];
  const rebuilt = stanzas.map((stanza) => {
    const trimmed = stanza.trim();
    if (!isCollapsedInlineNoticeStanza(trimmed)) return trimmed;
    repairs.push("notice:expand_collapsed_inline_stanza");
    return expandCollapsedInlineNoticeStanza(trimmed);
  });
  if (!repairs.length) return { text: corpus, repairs: [] };

  const mergedRegion = `${intro.trimEnd()}\n\n${rebuilt.join("\n\n")}`.replace(/\n{3,}/g, "\n\n");
  const text = `${before}${mergedRegion}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text, repairs };
}

export function normalizeNoticeStanzaLines(stanza: string, fullNames?: readonly string[]): string {
  const lines = stanza.split("\n");
  const out = lines.map((line, idx) => {
    const trimmed = line.trim();
    if (idx === 0) {
      const match = trimmed.match(/^If to\s+(.+?)\s*:?\s*$/i);
      if (!match?.[1]) return line;
      const entity = collapseDuplicatedLegalEntityPhrase(match[1].trim(), fullNames);
      const normalized = `If to ${entity}:`;
      return trimmed === normalized ? line : normalized;
    }
    if (/^Attn:/i.test(trimmed) || /^Email(?:\s+for\s+Notice)?\s*:/i.test(trimmed) || /^Address/i.test(trimmed)) {
      return line;
    }
    const entityOnly = trimmed.replace(/:$/, "").trim();
    if (!entityOnly) return line;
    const collapsed = collapseDuplicatedLegalEntityPhrase(entityOnly, fullNames);
    if (collapsed === entityOnly) return line;
    const normalized = trimmed.endsWith(":") ? `${collapsed}:` : collapsed;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}${normalized}`;
  });
  return out.join("\n");
}

function stripInvalidNoticeStanzaLines(stanza: string, fullNames?: readonly string[]): string {
  const stripped = stanza
    .split("\n")
    .filter((line) => !isIntakeSectionLabelLine(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const normalized = normalizeNoticeStanzaLines(stripped, fullNames);
  if (!noticeStanzaHasAddressPollution(normalized)) {
    return normalized;
  }
  return sanitizeNoticeStanzaAddressContent(normalized).stanza;
}

function buildIfToNoticeStanza(
  party: PaidProSignerMetadataParty,
  authorityParties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const legal = resolveNoticeStanzaLegalEntity(party, authorityParties, roleContext);
  const lines = [`If to ${legal}:`, legal];
  const name = party.signerName.trim();
  const title = party.signerTitle.trim();
  if (name) {
    lines.push(title ? `Attn: ${name}, ${title}` : `Attn: ${name}`);
  }
  const email = party.signerEmail.trim();
  const addressLines = formatNoticeAddressLines(party.partyAddress);
  // Product/safety conflict: some fixtures forbid live emails in operative notices;
  // others require them. Keep prior materialization until founder decides.
  if (email) lines.push(`Email: ${email}`);
  if (addressLines.length > 0) {
    lines.push("Address:", ...addressLines);
  }
  // Commercial no-invent: do not synthesize "provided during signer setup" contact lines.
  // Entity-only stanzas stand until real email/address authority exists.
  return lines.join("\n");
}

function noticeStanzaUsesGenericPrimaryContactFallback(stanza: string): boolean {
  return /primary business address and email on file/i.test(stanza);
}

function noticeStanzaComplete(stanza: string, party?: PaidProSignerMetadataParty): boolean {
  const trimmed = stanza.trim();
  if (!trimmed) return false;
  if (isCollapsedInlineNoticeStanza(trimmed)) return false;
  if (noticeStanzaContainsPlaceholderTokens(trimmed)) return false;
  if (noticeStanzaHasExecutionPollution(trimmed)) return false;
  if (noticeStanzaHasAddressPollution(trimmed)) return false;
  if (noticeStanzaHasRoleLabelCorruption(trimmed)) return false;
  if (DANGLING_IF_TO_RE.test(`\n${trimmed}`)) return false;
  if (/^If to\s*:\s*$/i.test(trimmed)) return false;
  // Attn/Email must be real field lines — not fused into the If-to header ("If to Alex Rivera Attn:").
  const hasAttn = /(?:^|\n)\s*Attn\s*:/i.test(trimmed);
  const hasEmailLine = /(?:^|\n)\s*Email(?:\s+for\s+Notice)?\s*:/i.test(trimmed);
  const hasSafeFallback = /primary business address and email on file/i.test(trimmed);
  const requiredEmail = party?.signerEmail?.trim() ?? "";
  if (requiredEmail) {
    if (!hasEmailLine) return false;
    if (!trimmed.toLowerCase().includes(requiredEmail.toLowerCase())) return false;
  }
  const requiredAddress = party?.partyAddress?.trim() ?? "";
  if (requiredAddress) {
    if (!/Address(?:\s+for\s+Notice)?\s*:/i.test(trimmed)) return false;
    if (!trimmed.toLowerCase().includes(requiredAddress.toLowerCase().slice(0, 12))) return false;
  }
  return (hasAttn || hasEmailLine || hasSafeFallback) && noticeStanzaHasEntityLine(trimmed);
}

const NOTICES_SECTION_HEADING_RE =
  /(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)(?:Notices|Notice\s+Addresses?)\b|(?:^|\n)\s*\d+\.\s+[^\n]*\bNotices\b/i;

export function corpusHasCanonicalNoticesHeading(text: string): boolean {
  return NOTICES_SECTION_HEADING_RE.test((text || "").replace(/\r\n/g, "\n"));
}

/** Non-canonical numbered headings that still open an operative Notices clause family. */
const NOTICE_EQUIVALENT_SECTION_HEADING_RE =
  /(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)(?:Notice\s+Provisions?|Notice\s+Delivery|Notice\s+and\s+Contact)\b/i;

/** Bare "Communications" is not a Notices family opener — TEST419/420 require freeze fail-closed. */
const BARE_COMMUNICATIONS_SECTION_HEADING_RE =
  /(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)Communications?\b/i;

function inferNoticesSectionNumber(beforeRegion: string): number {
  const sectionNums: number[] = [];
  for (const m of beforeRegion.matchAll(/(?:^|\n)(\d+)\.(?!\d)\s+/g)) {
    const n = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(n)) sectionNums.push(n);
  }
  if (sectionNums.length === 0) return 11;
  const set = new Set(sectionNums);
  const max = Math.max(...sectionNums);
  for (let n = 10; n <= max + 1; n += 1) {
    if (!set.has(n)) return n;
  }
  return max + 1;
}

/** True when a standalone NOTICES parent heading appears between §N and §N.1. */
export function hasMisplacedStandaloneNoticesBeforeSubsection(corpus: string): boolean {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? "";
    const standaloneNotices = trimmed.match(/^(\d+)\.\s+NOTICES\s*$/i);
    if (!standaloneNotices) continue;
    const prevMain = lines
      .slice(0, i)
      .map((line) => line.trim())
      .reverse()
      .find((line) => /^\d+\.(?!\d)\s+\S/.test(line));
    const nextLine = lines.slice(i + 1).find((line) => line.trim().length > 0)?.trim() ?? "";
    const prevNum = prevMain?.match(/^(\d+)\./)?.[1];
    const nextSub = nextLine.match(/^(\d+)\.(\d+)\b/);
    if (prevNum && nextSub && nextSub[1] === prevNum) return true;
  }
  return false;
}

/** Collapse repeated standalone NOTICES headings inside the notices-to-witness region. */
export function dedupeDuplicateStandaloneNoticesHeadings(text: string): { text: string; repairs: string[] } {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return { text, repairs: [] };
  const end = witnessIdx >= 0 ? witnessIdx : text.length;
  const before = text.slice(0, noticesIdx);
  const region = text.slice(noticesIdx, end);
  const after = text.slice(end);
  const lines = region.split("\n");
  const repairs: string[] = [];
  const out: string[] = [];
  let keptNoticesHeading = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const standaloneNotices =
      /^NOTICES\s*$/i.test(trimmed) || /^\d+\.\s+NOTICES\s*$/i.test(trimmed);
    if (standaloneNotices) {
      if (keptNoticesHeading) {
        repairs.push("notice:dedupe_duplicate_notices_heading");
        continue;
      }
      keptNoticesHeading = true;
    }
    out.push(line);
  }
  if (!repairs.length) return { text, repairs: [] };
  const dedupedRegion = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return {
    text: `${before}${dedupedRegion}${after}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs,
  };
}

/** Remove a standalone `N. NOTICES` line when the same section already has a composite heading including Notices. */
export function removeRedundantNoticesSubheading(text: string): { text: string; repairs: string[] } {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const lines = head.split("\n");
  const compositeSectionNums = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    const composite = trimmed.match(/^(\d+)\.\s+.*\bNotices\b/i);
    if (composite?.[1] && /\band\b/i.test(trimmed)) {
      compositeSectionNums.add(composite[1]);
    }
  }

  if (compositeSectionNums.size === 0) return { text, repairs: [] };

  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const standalone = trimmed.match(/^(\d+)\.\s+NOTICES\s*$/i);
    if (standalone?.[1] && compositeSectionNums.has(standalone[1])) {
      repairs.push("notice:remove_redundant_notices_subheading");
      continue;
    }
    out.push(line);
  }

  if (!repairs.length) return { text, repairs: [] };
  const newHead = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return { text: `${newHead}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs };
}

function resolveNoticesHeadingInsertIndex(head: string): number {
  const governingIdx = head.search(/(?:^|\n)\s*\d+\.\s+GOVERNING LAW\b/im);
  const firstIfTo = head.search(/(?:^|\n)If to\s+/i);
  if (governingIdx >= 0) {
    if (firstIfTo >= 0 && firstIfTo < governingIdx) return firstIfTo;
    return governingIdx;
  }
  if (firstIfTo >= 0) return firstIfTo;
  return head.length;
}

/** True when an insert point sits between a top-level section heading and its first subsection. */
function isInsertPointInsideSectionBeforeSubsection(head: string, insertAt: number): boolean {
  if (insertAt <= 0) return false;
  const prefix = head.slice(0, insertAt);
  const suffix = head.slice(insertAt).trimStart();
  const mainSections = [...prefix.matchAll(/(?:^|\n)(\d+)\.(?!\d)\s+[^\n]+/g)];
  const lastMain = mainSections[mainSections.length - 1]?.[1];
  if (!lastMain) return false;
  return new RegExp(`^${lastMain}\\.\\d+\\b`).test(suffix);
}

/** Remove a standalone NOTICES heading wrongly inserted before a parent section's first subsection. */
export function removeMisplacedNoticesHeadingBeforeSubsection(corpus: string): {
  text: string;
  repairs: string[];
} {
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const head = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";
  const lines = head.split("\n");
  const repairs: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? "";
    const standaloneNotices = trimmed.match(/^(\d+)\.\s+NOTICES\s*$/i);
    if (standaloneNotices) {
      const prevMain = out
        .map((line) => line.trim())
        .reverse()
        .find((line) => /^\d+\.(?!\d)\s+\S/.test(line));
      const nextLine = lines.slice(i + 1).find((line) => line.trim().length > 0)?.trim() ?? "";
      const prevNum = prevMain?.match(/^(\d+)\./)?.[1];
      const nextSub = nextLine.match(/^(\d+)\.(\d+)\b/);
      if (prevNum && nextSub && nextSub[1] === prevNum) {
        repairs.push("notice:remove_misplaced_notices_before_subsection");
        continue;
      }
    }
    out.push(lines[i] ?? "");
  }
  if (!repairs.length) return { text: corpus, repairs: [] };
  return {
    text: `${out.join("\n")}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs,
  };
}

/** Move a notices section that was appended after Governing Law back before it. */
export function relocateMisplacedNoticesSectionBeforeGoverningLaw(corpus: string): {
  text: string;
  repairs: string[];
} {
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const head = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";
  const noticesHeadingIdx = head.search(/(?:^|\n)\s*\d+\.\s+NOTICES\s*(?:\n|$)/im);
  if (noticesHeadingIdx < 0) return { text: corpus, repairs: [] };
  const governingIdx = head.search(/(?:^|\n)\s*\d+\.\s+GOVERNING LAW\b/im);
  if (governingIdx < 0 || noticesHeadingIdx < governingIdx) return { text: corpus, repairs: [] };
  const prefix = head.slice(0, governingIdx).trimEnd();
  const suffix = head.slice(governingIdx, noticesHeadingIdx).trimEnd();
  const noticesBlock = head.slice(noticesHeadingIdx).trimStart();
  const parts = [prefix, noticesBlock, suffix].filter(Boolean);
  return {
    text: `${parts.join("\n\n")}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs: ["notice:relocate_notices_before_governing_law"],
  };
}

/** Defuse a Notices heading fused onto prior clause prose (e.g. `clause.12. Notices`). */
export function repairFusedNoticesHeadingToPriorClause(corpus: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let text = (corpus || "").replace(/\r\n/g, "\n");
  // "…Agreement.12. Notices" / "…letter.12. Notices" (any Notices casing)
  const fusedDotRe = /([a-z])(\.\d+(?:\.\d+)?\.\s+)Notices\b/gi;
  // "…Agreement12. Notices" / "…Agreement12. NOTICES" (no separating punctuation)
  const fusedBareRe = /([A-Za-z])(\d+\.\s+)Notices\b/gi;
  const hadDot = fusedDotRe.test(text);
  fusedDotRe.lastIndex = 0;
  const hadBare = fusedBareRe.test(text);
  fusedBareRe.lastIndex = 0;
  if (!hadDot && !hadBare) return { text: corpus, repairs: [] };
  if (hadDot) {
    text = text.replace(fusedDotRe, (_match, priorLetter: string, sectionPart: string) => {
      const numMatch = sectionPart.match(/\.(\d+(?:\.\d+)?)\.\s+/);
      const num = numMatch?.[1] ?? "11";
      repairs.push("notice:defuse_fused_notices_heading");
      return `${priorLetter}\n\n${num}. NOTICES`;
    });
  }
  if (hadBare) {
    text = text.replace(fusedBareRe, (_match, priorLetter: string, sectionPart: string) => {
      const num = sectionPart.match(/^(\d+)/)?.[1] ?? "12";
      repairs.push("notice:defuse_fused_notices_heading_bare");
      return `${priorLetter}\n\n${num}. NOTICES`;
    });
  }
  return { text, repairs };
}

/**
 * Resolve the content span for a regex match that may include a leading `(?:^|\n)`.
 * Avoids `indexOf("\\n", matchIndex)` collapsing to a zero-width span when matchIndex
 * already points at the newline — which previously fused `10. NOTICES`+`11. NOTICES`.
 */
function resolveMatchedLineSpan(
  text: string,
  matchIndex: number,
): { start: number; end: number; line: string } {
  let start = Math.max(0, matchIndex);
  if (start < text.length && text[start] === "\n") start += 1;
  while (start < text.length && (text[start] === " " || text[start] === "\t")) start += 1;
  let end = text.indexOf("\n", start);
  if (end < 0) end = text.length;
  return { start, end, line: text.slice(start, end).trim() };
}

function hasTopLevelNoticesParentForMajor(head: string, major: string): boolean {
  if (!major) return false;
  return new RegExp(`(?:^|\\n)\\s*${major}\\.(?!\\d)\\s+NOTICES\\s*$`, "im").test(head);
}

/** Drop empty `N.M NOTICES` shells when parent `N. NOTICES` already exists. */
export function removeEmptyNoticesSubsectionShells(corpus: string): {
  text: string;
  repairs: string[];
} {
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus || "");
  const head = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";
  const lines = (head || "").replace(/\r\n/g, "\n").split("\n");
  const repairs: string[] = [];
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const sub = trimmed.match(/^(\d+)\.(\d+)\s+NOTICES\s*$/i);
    if (sub?.[1] && hasTopLevelNoticesParentForMajor(head, sub[1])) {
      repairs.push(`notice:remove_empty_notices_subsection:${sub[1]}.${sub[2]}`);
      continue;
    }
    out.push(line);
  }
  if (!repairs.length) return { text: corpus, repairs: [] };
  const newHead = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  return {
    text: (tail ? `${newHead}\n\n${tail.trimStart()}` : newHead).replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs,
  };
}

/**
 * Insert or normalize a canonical `N. NOTICES` heading before operative If-to stanzas.
 * Pre-freeze only — repairs missing or notice-equivalent headings instead of rejecting.
 */
export function ensureCanonicalNoticesSectionHeadingForFreeze(corpus: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const fusedHeading = repairFusedNoticesHeadingToPriorClause(corpus);
  let text = fusedHeading.text;
  if (fusedHeading.repairs.length > 0) repairs.push(...fusedHeading.repairs);
  const misplaced = removeMisplacedNoticesHeadingBeforeSubsection(text);
  text = misplaced.text;
  if (misplaced.repairs.length > 0) repairs.push(...misplaced.repairs);
  const relocated = relocateMisplacedNoticesSectionBeforeGoverningLaw(text);
  text = relocated.text;
  if (relocated.repairs.length > 0) repairs.push(...relocated.repairs);
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  let head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  let tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  // Fail-closed: bare Communications must not be rewritten into NOTICES (TEST419/420).
  if (
    BARE_COMMUNICATIONS_SECTION_HEADING_RE.test(head) &&
    !corpusHasCanonicalNoticesHeading(head) &&
    !NOTICE_EQUIVALENT_SECTION_HEADING_RE.test(head)
  ) {
    return { text: corpus, repairs: [] };
  }
  const stanzaCount = (head.match(/^If to\s+/gim) || []).length;
  if (stanzaCount < 1) return { text: corpus, repairs: [] };

  const redundantNotices = removeRedundantNoticesSubheading(text);
  if (redundantNotices.repairs.length > 0) {
    text = redundantNotices.text;
    repairs.push(...redundantNotices.repairs);
    const witnessIdxAfter = resolveAuthoritativeWitnessIndex(text);
    head = witnessIdxAfter >= 0 ? text.slice(0, witnessIdxAfter) : text;
    tail = witnessIdxAfter >= 0 ? text.slice(witnessIdxAfter) : "";
  }

  if (corpusHasCanonicalNoticesHeading(head)) {
    const eq = head.match(NOTICE_EQUIVALENT_SECTION_HEADING_RE);
    if (eq?.[0] && eq.index != null && !/\bNotices\b/i.test(eq[0])) {
      const { start, end, line: oldLine } = resolveMatchedLineSpan(head, eq.index);
      const major =
        oldLine.match(/^(\d+)/)?.[1] ??
        String(inferNoticesSectionNumber(head.slice(0, start)));
      if (hasTopLevelNoticesParentForMajor(head, major)) {
        const newHead = `${head.slice(0, start).trimEnd()}\n\n${head.slice(end).trimStart()}`
          .replace(/\n{3,}/g, "\n\n")
          .trimEnd();
        repairs.push("notice:remove_equivalent_subsection_under_parent_notices");
        text = `${newHead}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd();
      } else {
        const replacement = `${major}. NOTICES`;
        const newHead = `${head.slice(0, start).trimEnd()}\n\n${replacement}\n\n${head
          .slice(end)
          .trimStart()}`
          .replace(/\n{3,}/g, "\n\n")
          .trimEnd();
        repairs.push("notice:normalize_equivalent_heading_to_notices");
        text = `${newHead}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd();
      }
    }
    const stripped = removeEmptyNoticesSubsectionShells(text);
    if (stripped.repairs.length > 0) {
      repairs.push(...stripped.repairs);
      text = stripped.text;
    }
    return { text, repairs };
  }

  const firstIfTo = head.search(/(?:^|\n)If to\s+/i);
  if (firstIfTo < 0) return { text: corpus, repairs: [] };

  const insertAt = resolveNoticesHeadingInsertIndex(head);
  if (isInsertPointInsideSectionBeforeSubsection(head, insertAt)) {
    return { text, repairs };
  }
  const beforeInsert = head.slice(0, insertAt).trimEnd();
  const afterInsert = head.slice(insertAt).trimStart();

  const eqBefore = beforeInsert.match(NOTICE_EQUIVALENT_SECTION_HEADING_RE);
  if (eqBefore?.index != null) {
    const { start, end, line: oldLine } = resolveMatchedLineSpan(beforeInsert, eqBefore.index);
    const num =
      oldLine.match(/^(\d+)/)?.[1] ??
      String(inferNoticesSectionNumber(beforeInsert.slice(0, start)));
    const newHead =
      `${beforeInsert.slice(0, start).trimEnd()}\n\n${num}. NOTICES\n\n${beforeInsert
        .slice(end)
        .trimStart()}${afterInsert ? `\n\n${afterInsert}` : ""}`
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();
    repairs.push("notice:replace_equivalent_with_notices");
    text = `${newHead}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd();
    const stripped = removeEmptyNoticesSubsectionShells(text);
    if (stripped.repairs.length > 0) {
      repairs.push(...stripped.repairs);
      text = stripped.text;
    }
    return { text, repairs };
  }

  const sectionNum = inferNoticesSectionNumber(beforeInsert);
  const headingBlock = `${sectionNum}. NOTICES\n\nNotices under this Agreement must be in writing and delivered as set forth below.\n\n`;
  const newHead = `${beforeInsert}\n\n${headingBlock}${afterInsert}`;
  repairs.push("notice:insert_missing_notices_heading");
  text = `${newHead}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  const stripped = removeEmptyNoticesSubsectionShells(text);
  if (stripped.repairs.length > 0) {
    repairs.push(...stripped.repairs);
    text = stripped.text;
  }
  return { text, repairs };
}

export function findNoticesSectionStart(text: string): number {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const operativeSubsection = normalized.match(
    /(?:^|\n)\s*\d+\.\d+(?:\.\s*|\s+)(?:Notices|Notice\s+Addresses?)\b/i,
  );
  if (operativeSubsection?.index != null) return operativeSubsection.index;
  const canonical = normalized.match(NOTICES_SECTION_HEADING_RE);
  if (canonical?.index != null) return canonical.index;
  const equivalent = normalized.match(NOTICE_EQUIVALENT_SECTION_HEADING_RE);
  if (equivalent?.index != null) return equivalent.index;
  const ifTo = normalized.search(/(?:^|\n)If to\s+/i);
  if (ifTo >= 0 && (normalized.match(/^If to\s+/gim) || []).length >= 1) return ifTo;
  return -1;
}

/** Substance-based Notices family opener — canonical, equivalent, or operative If-to stanzas. */
export function corpusHasOperativeNoticesHeading(text: string): boolean {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  if (corpusHasCanonicalNoticesHeading(normalized)) return true;
  if (NOTICE_EQUIVALENT_SECTION_HEADING_RE.test(normalized)) return true;
  // Bare Communications is intentionally not a Notices opener (TEST419/420 freeze fail-closed).
  if (BARE_COMMUNICATIONS_SECTION_HEADING_RE.test(normalized)) return false;
  if (findNoticesSectionStart(normalized) >= 0) return true;
  return (normalized.match(/^If to\s+/gim) || []).length >= 2;
}

const TOP_LEVEL_OPERATIVE_HEADING_RE = /^\s*\d+\.(?!\d)\s+\S/;

type OperativeNoticeLayout = {
  before: string;
  noticesFamily: string;
  middle: string;
  after: string;
};

function sliceOperativeNoticeLayout(corpus: string): OperativeNoticeLayout | null {
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return null;
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const operativeEnd = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const noticesFamilyEnd = resolveOperativeNoticesFamilyEnd(corpus, noticesIdx);
  return {
    before: corpus.slice(0, noticesIdx),
    noticesFamily: corpus.slice(noticesIdx, noticesFamilyEnd),
    middle: corpus.slice(noticesFamilyEnd, operativeEnd),
    after: corpus.slice(operativeEnd),
  };
}

function joinOperativeNoticeLayout(layout: OperativeNoticeLayout): string {
  const middleSuffix = layout.middle.trimEnd() ? `\n\n${layout.middle.trimEnd()}` : "";
  return layout.after.trimStart()
    ? `${layout.before}${layout.noticesFamily}${middleSuffix}\n\n${layout.after.trimStart()}`
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd()
    : `${layout.before}${layout.noticesFamily}${middleSuffix}`.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Exclusive end index of the Notices clause family (before the next top-level operative section). */
export function resolveOperativeNoticesFamilyEnd(text: string, noticesStart: number): number {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const operativeEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  if (noticesStart < 0 || noticesStart >= operativeEnd) return operativeEnd;

  const lines = text.slice(noticesStart, operativeEnd).split("\n");
  let seenNoticesHeading = false;
  let seenIfToStanza = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed) continue;

    if (!seenNoticesHeading) {
      if (/\bNotices\b/i.test(trimmed) && TOP_LEVEL_OPERATIVE_HEADING_RE.test(trimmed)) {
        seenNoticesHeading = true;
      }
      continue;
    }

    if (/^If to\s+/i.test(trimmed)) {
      seenIfToStanza = true;
      continue;
    }

    if (TOP_LEVEL_OPERATIVE_HEADING_RE.test(trimmed) && !/\bNotices\b/i.test(trimmed)) {
      if (seenIfToStanza || !/^If to\s+/i.test(trimmed)) {
        const offset = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        return noticesStart + offset;
      }
    }
  }

  return operativeEnd;
}

function noticeStanzaHeadingLegalEntity(stanza: string): string {
  const header = stanza.trim().split("\n")[0]?.trim() ?? "";
  const match = header.match(/^If to\s+(.+?)\s*:\s*$/i);
  return match?.[1]?.trim() ?? "";
}

function findExistingNoticeStanzaForParty(
  party: PaidProSignerMetadataParty,
  authorityParties: readonly PaidProSignerMetadataParty[],
  roleContext: PaidProPartyRoleContext | null | undefined,
  existingStanzas: readonly string[],
  slotIndex: number,
  consumedStanzaIndexes: Set<number>,
  opts?: { manifestAuthoritative?: boolean },
): string {
  const legal = resolveNoticeStanzaLegalEntity(party, authorityParties, roleContext);
  if (legal) {
    for (let j = 0; j < existingStanzas.length; j++) {
      if (consumedStanzaIndexes.has(j)) continue;
      const stanza = existingStanzas[j] ?? "";
      const headingEntity = noticeStanzaHeadingLegalEntity(stanza);
      if (headingEntity.length >= 2 && partyLegalNamesMatch(headingEntity, legal)) {
        consumedStanzaIndexes.add(j);
        if (noticeStanzaHasLegalEntityLine(stanza)) {
          return stanza.trim();
        }
      }
    }
  }
  if (opts?.manifestAuthoritative) return "";
  if (!consumedStanzaIndexes.has(slotIndex)) {
    const fallback = existingStanzas[slotIndex]?.trim() ?? "";
    if (fallback) consumedStanzaIndexes.add(slotIndex);
    return fallback;
  }
  return "";
}

function noticeStanzaMatchesManifestPartyAddress(
  stanza: string,
  party: PaidProSignerMetadataParty,
): boolean {
  const requiredAddress = party.partyAddress.trim();
  if (!requiredAddress || requiredAddress.length <= 8) return true;
  return stanza.toLowerCase().includes(requiredAddress.toLowerCase().slice(0, 12));
}

function noticeAuthorityRequiresManifestRepair(
  existingStanzas: readonly string[],
  authorityParties: readonly PaidProSignerMetadataParty[],
  roleContext: PaidProPartyRoleContext | null | undefined,
): boolean {
  if (!intakePartyManifestIsAuthoritative(roleContext?.intakeText)) return false;
  if (existingStanzas.length !== authorityParties.length) return true;
  const manifestKeys = new Set(
    authorityParties.map((party) => party.partyLegalName.trim().toLowerCase()),
  );
  for (const stanza of existingStanzas) {
    const entity = noticeStanzaHeadingLegalEntity(stanza).trim().toLowerCase();
    if (!entity) return true;
    const inManifest = [...manifestKeys].some((key) => partyLegalNamesMatch(entity, key));
    if (!inManifest) return true;
  }
  const consumed = new Set<number>();
  for (let i = 0; i < authorityParties.length; i++) {
    const party = authorityParties[i]!;
    const existing = findExistingNoticeStanzaForParty(
      party,
      authorityParties,
      roleContext,
      existingStanzas,
      i,
      consumed,
      { manifestAuthoritative: true },
    );
    if (
      !noticeStanzaComplete(existing, party) ||
      !noticeStanzaMatchesManifestPartyAddress(existing, party)
    ) {
      return true;
    }
  }
  return false;
}

/** Hydrate/repair operative notice stanzas so each carries an authoritative entity line before freeze validation. */
export function ensureOperativeNoticeStanzaEntityLinesAtFreeze(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const authorityParties = enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };

  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return { text: corpus, repairs: [] };

  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const before = corpus.slice(0, noticesIdx);
  const after = corpus.slice(noticesEnd);
  const noticesFamilyEnd = resolveOperativeNoticesFamilyEnd(corpus, noticesIdx);
  const noticesRegion = corpus.slice(noticesIdx, noticesFamilyEnd);
  const middle = corpus.slice(noticesFamilyEnd, noticesEnd);
  const middleParts = middle.split(/\n(?=If to\s+)/i);
  const middleClean = (middleParts[0] ?? "").trim();
  const misplacedMiddleStanzas = middleParts
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);
  const blocks = noticesRegion.split(/\n(?=If to\s+)/i);
  const intro = blocks[0]?.trim() ?? "";
  const existingStanzas = [
    ...blocks.slice(1).map((s) => s.trim()).filter(Boolean),
    ...misplacedMiddleStanzas,
  ];
  const repairs: string[] = [];
  const canonicalNames = authorityParties.map((party) =>
    resolveNoticeStanzaLegalEntity(party, authorityParties, roleContext),
  );
  const rebuiltStanzas: string[] = [];
  const consumedExisting = new Set<number>();

  for (let i = 0; i < authorityParties.length; i += 1) {
    const party = authorityParties[i]!;
    const existing = findExistingNoticeStanzaForParty(
      party,
      authorityParties,
      roleContext,
      existingStanzas,
      i,
      consumedExisting,
      { manifestAuthoritative: true },
    );
    const candidate = existing.trim()
      ? stripInvalidNoticeStanzaLines(expandCollapsedInlineNoticeStanza(existing), canonicalNames)
      : "";
    if (candidate && noticeStanzaHasLegalEntityLine(candidate)) {
      rebuiltStanzas.push(candidate);
      continue;
    }
    if (candidate) {
      // Preserve existing Email/Address lines — inject the legal entity under If-to only.
      const legal = resolveNoticeStanzaLegalEntity(party, authorityParties, roleContext);
      const lines = candidate.split("\n");
      const header = lines[0]?.trim() || `If to ${legal}:`;
      const rest = lines.slice(1);
      rebuiltStanzas.push(
        stripInvalidNoticeStanzaLines([header, legal, ...rest].join("\n"), canonicalNames),
      );
      repairs.push(`notice:hydrate_entity_line_party_${i + 1}`);
      continue;
    }
    rebuiltStanzas.push(
      stripInvalidNoticeStanzaLines(
        buildIfToNoticeStanza(party, authorityParties, roleContext),
        canonicalNames,
      ),
    );
    repairs.push(`notice:hydrate_entity_line_party_${i + 1}`);
  }

  if (repairs.length === 0) {
    const stanzaCount = (noticesRegion.match(/^If to\s+/gim) || []).length + misplacedMiddleStanzas.length;
    const completeCount = existingStanzas.filter((stanza) => noticeStanzaHasLegalEntityLine(stanza)).length;
    if (stanzaCount >= authorityParties.length && completeCount >= authorityParties.length) {
      return { text: corpus, repairs: [] };
    }
  }

  if (repairs.length === 0 && rebuiltStanzas.length === 0) return { text: corpus, repairs: [] };

  const introBlock = intro.trimEnd();
  const mergedNotices = [
    introBlock,
    rebuiltStanzas.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const afterNotices = [middleClean, after.trimStart()].filter(Boolean).join("\n\n");
  const text = afterNotices
    ? `${before}${mergedNotices}\n\n${afterNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd()
    : `${before}${mergedNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text, repairs };
}

function countOperativeIfToStanzasInRegion(noticesRegion: string): number {
  return (noticesRegion.match(/^If to\s+/gim) || []).length;
}

/** Reconcile operative notice stanza count to canonical party authority before terminal validation. */
export function ensureOperativeNoticeStanzaCountAuthorityAtFreeze(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const authorityParties = enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };

  const region = resolveAuthoritativeNoticesRegionForFreeze(corpus);
  const regionCount = countOperativeIfToStanzasInRegion(region);
  const completeCount = region
    .split(/\n(?=If to\s+)/i)
    .slice(1)
    .map((s) => s.trim())
    .filter((stanza) => stanza && noticeStanzaHasLegalEntityLine(stanza)).length;

  // Excess Party 3–5 stanzas on a 2-party deal must always trim — "enough complete" is not enough.
  if (regionCount > authorityParties.length) {
    const trimmed = trimOperativeNoticeStanzasToPartyCount(corpus, authorityParties.length);
    if (trimmed.repairs.length > 0) {
      return { text: trimmed.text, repairs: trimmed.repairs };
    }
  } else if (regionCount === authorityParties.length && completeCount >= authorityParties.length) {
    return { text: corpus, repairs: [] };
  }

  const reconciled = ensureOperativeNoticeStanzaEntityLinesAtFreeze(corpus, parties, roleContext);
  if (reconciled.repairs.length > 0) {
    return {
      text: reconciled.text,
      repairs: reconciled.repairs.map((r) => `notice:${r}`),
    };
  }

  const repaired = repairIncompleteIfToNoticeStanzas(reconciled.text, parties, roleContext);
  if (repaired.repairs.length > 0 || repaired.text !== reconciled.text) {
    return {
      text: repaired.text,
      repairs: repaired.repairs.map((r) => `notice:reconcile_stanza_count_${r}`),
    };
  }

  return reconciled;
}

/**
 * Repair incomplete operative Notices stanzas (dangling "If to", missing Attn/Email lines).
 */
export function repairIncompleteIfToNoticeStanzas(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
  opts?: { allowEntityOnlyNoticesAtFreeze?: boolean },
): { text: string; repairs: string[] } {
  const cap = resolveCanonicalNoticePartyCount(parties, roleContext);
  const cappedParties = parties.slice(0, cap);
  const authorityParties = enrichNoticeAuthorityParties(cappedParties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };
  const repairs: string[] = [];
  let text = repairGluedSectionHeadingsInText(corpus.replace(/\r\n/g, "\n"));
  if (text !== corpus) repairs.push("notice:split_glued_section_headings");

  const noticesIdxEarly = findNoticesSectionStart(text);
  if (noticesIdxEarly >= 0) {
    const witnessIdxEarly = resolveAuthoritativeWitnessIndex(text);
    const noticesEndEarly = witnessIdxEarly >= 0 ? witnessIdxEarly : text.length;
    let fullNoticesRegionEarly = text.slice(noticesIdxEarly, noticesEndEarly);
    let existingStanzasEarly = fullNoticesRegionEarly
      .split(/\n(?=If to\s+)/i)
      .slice(1)
      .map((s) => s.trim())
      .filter(Boolean);
    if (existingStanzasEarly.length > authorityParties.length) {
      const trimmedEarly = trimOperativeNoticeStanzasToPartyCount(text, authorityParties.length);
      if (trimmedEarly.repairs.length > 0) {
        repairs.push(...trimmedEarly.repairs);
        text = trimmedEarly.text;
        const noticesIdx = findNoticesSectionStart(text);
        const witnessIdx = resolveAuthoritativeWitnessIndex(text);
        if (noticesIdx >= 0) {
          fullNoticesRegionEarly = text.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : text.length);
          existingStanzasEarly = fullNoticesRegionEarly
            .split(/\n(?=If to\s+)/i)
            .slice(1)
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
    }
    const consumedEarly = new Set<number>();
    const manifestRepairRequired = noticeAuthorityRequiresManifestRepair(
      existingStanzasEarly,
      authorityParties,
      roleContext,
    );
    let allCompleteEarly =
      !manifestRepairRequired &&
      existingStanzasEarly.length === authorityParties.length;
    if (allCompleteEarly && existingStanzasEarly.length >= 2) {
      for (let i = 0; i < authorityParties.length; i++) {
        const party = authorityParties[i]!;
        const existing = findExistingNoticeStanzaForParty(
          party,
          authorityParties,
          roleContext,
          existingStanzasEarly,
          i,
          consumedEarly,
          { manifestAuthoritative: manifestRepairRequired },
        );
        if (
          !noticeStanzaComplete(existing, party) ||
          !noticeStanzaMatchesManifestPartyAddress(existing, party)
        ) {
          allCompleteEarly = false;
          break;
        }
      }
    } else {
      allCompleteEarly = false;
    }
    if (
      allCompleteEarly &&
      !NOTICE_PLACEHOLDER_TOKEN_RE.test(fullNoticesRegionEarly) &&
      !noticesRegionHasExecutionPollution(fullNoticesRegionEarly) &&
      !hasInlineMalformedNoticeStanzas(fullNoticesRegionEarly)
    ) {
      const addressRepair = repairNoticeStanzaAddressBoundariesInCorpus(text);
      if (addressRepair.repairs.length > 0) {
        repairs.push(...addressRepair.repairs);
        return { text: addressRepair.text, repairs };
      }
      return { text, repairs };
    }
  }

  const canonicalNames = authorityParties.map((party) =>
    resolveNoticeStanzaLegalEntity(party, authorityParties, roleContext),
  );
  const collapsed = collapseDuplicateNoticeEntityLines(
    text,
    canonicalNames.filter((n) => n.length >= 2),
  );
  if (collapsed !== text) {
    text = collapsed;
  }

  if (DANGLING_IF_TO_RE.test(text) || /Notices[\s\S]*\nIf to\s*$/i.test(text)) {
    text = text.replace(/\nIf to\s*:?\s*$/i, "");
    repairs.push("notice:remove_dangling_if_to");
  }

  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) {
    if (/\nIf to\s*$/i.test(text)) {
      const partiesBlock = authorityParties
        .map((p) => buildIfToNoticeStanza(p, authorityParties, roleContext))
        .join("\n\n");
      text = `${text.trimEnd()}\n\n${partiesBlock}`;
      repairs.push("notice:append_stanzas_after_dangling_if_to");
      logPaidProNoticeSectionIntegrity({
        repairs,
        partyCount: authorityParties.length,
        stanzaCount: authorityParties.length,
      });
    } else if (authorityParties.length >= 2) {
      // Commercial no-invent: legal names alone must not force a Notices section with
      // placeholder contact lines. Require real email/address before scaffolding Notices.
      const hasRealNoticeContacts = authorityParties.some((p) => {
        const email = p.signerEmail.trim();
        const address = p.partyAddress.trim();
        if (!email && address.length <= 8) return false;
        if (/provided during signer setup/i.test(email) || /provided during signer setup/i.test(address)) {
          return false;
        }
        return Boolean(email) || address.length > 8;
      });
      if (!hasRealNoticeContacts && !opts?.allowEntityOnlyNoticesAtFreeze) {
        return { text: text.trimEnd(), repairs };
      }
      if (opts?.allowEntityOnlyNoticesAtFreeze) {
        if (BARE_COMMUNICATIONS_SECTION_HEADING_RE.test(text)) {
          return { text: text.trimEnd(), repairs };
        }
        if ((text.match(/^If to\s+/gim) || []).length > 0) {
          return { text: text.trimEnd(), repairs };
        }
      }
      const witnessIdx = resolveAuthoritativeWitnessIndex(text);
      const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
      const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
      const sectionNum = inferNoticesSectionNumber(head);
      const partiesBlock = authorityParties
        .map((p) => buildIfToNoticeStanza(p, authorityParties, roleContext))
        .join("\n\n");
      const noticesBlock = `\n\n${sectionNum}. NOTICES\n\nNotices under this Agreement must be in writing and delivered as set forth below.\n\n${partiesBlock}`;
      text = `${head.trimEnd()}${noticesBlock}${tail ? `\n\n${tail.trimStart()}` : ""}`
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();
      repairs.push("notice:insert_missing_notices_region");
      logPaidProNoticeSectionIntegrity({
        repairs,
        partyCount: authorityParties.length,
        stanzaCount: authorityParties.length,
      });
    }
    return { text: text.trimEnd(), repairs };
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  const before = text.slice(0, noticesIdx);
  const after = text.slice(noticesEnd);
  const fullNoticesRegion = text.slice(noticesIdx, noticesEnd);
  const noticesFamilyEnd = resolveOperativeNoticesFamilyEnd(text, noticesIdx);
  let noticesRegion = text.slice(noticesIdx, noticesFamilyEnd);
  const middle = text.slice(noticesFamilyEnd, noticesEnd);
  // Later sections (§9/§10) must stay in `middle` — never fold them into the Notices intro
  // or rebuilt If-to stanzas land after ELECTRONIC SIGNATURES (post-freeze drift).
  const middleParts = middle.split(/\n(?=If to\s+)/i);
  const middleClean = (middleParts[0] ?? "").trim();
  const misplacedMiddleStanzas = middleParts
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);

  if (hasInlineMalformedNoticeStanzas(fullNoticesRegion)) {
    noticesRegion = noticesRegion.replace(/\s+(If to\s+)/gi, "\n\n$1");
    repairs.push("notice:split_inline_stanzas");
  }

  const normalizedRegion = normalizeOperativeNoticesRegionText(noticesRegion);
  if (normalizedRegion.repairs.length > 0) {
    repairs.push(...normalizedRegion.repairs);
  }
  noticesRegion = normalizedRegion.text;

  const blocks = noticesRegion.split(/\n(?=If to\s+)/i);
  const intro = (blocks[0] ?? "").trim();
  const existingStanzas = [
    ...blocks.slice(1).map((s) => s.trim()).filter(Boolean),
    ...misplacedMiddleStanzas,
  ];
  let tailAfterStanzas = "";
  if (blocks.length > 1) {
    const lastBlock = blocks[blocks.length - 1] ?? "";
    const relIdx = noticesRegion.lastIndexOf(lastBlock);
    if (relIdx >= 0) {
      tailAfterStanzas = noticesRegion.slice(relIdx + lastBlock.length).trim();
    }
  }
  const rebuiltStanzas: string[] = [];
  let stanzaCount = 0;
  const consumedExistingStanzas = new Set<number>();

  const manifestRepairRequired = noticeAuthorityRequiresManifestRepair(
    existingStanzas,
    authorityParties,
    roleContext,
  );
  for (let i = 0; i < authorityParties.length; i++) {
    const party = authorityParties[i]!;
    const existing = findExistingNoticeStanzaForParty(
      party,
      authorityParties,
      roleContext,
      existingStanzas,
      i,
      consumedExistingStanzas,
      { manifestAuthoritative: manifestRepairRequired },
    );
    const requiredEmail = party.signerEmail.trim();
    const stanzaHasAuthorityEmail =
      !requiredEmail ||
      new RegExp(`Email:\\s*${escapeRegExp(requiredEmail)}`, "i").test(existing);
    const authorityHasContact = party.signerEmail.trim() || party.partyAddress.trim();
    if (
      !manifestRepairRequired &&
      noticeStanzaComplete(existing, party) &&
      stanzaHasAuthorityEmail &&
      noticeStanzaMatchesManifestPartyAddress(existing, party) &&
      !(authorityHasContact && noticeStanzaUsesGenericPrimaryContactFallback(existing))
    ) {
      rebuiltStanzas.push(
        stripInvalidNoticeStanzaLines(
          expandCollapsedInlineNoticeStanza(existing),
          canonicalNames,
        ),
      );
      stanzaCount += 1;
      continue;
    }
    rebuiltStanzas.push(
      stripInvalidNoticeStanzaLines(buildIfToNoticeStanza(party, authorityParties, roleContext), canonicalNames),
    );
    repairs.push(`notice:rebuild_stanza_party_${i + 1}`);
    stanzaCount += 1;
  }

  if (!repairs.length) {
    const trimmedOnly = trimOperativeNoticeStanzasToPartyCount(text, authorityParties.length);
    if (trimmedOnly.repairs.length > 0 && trimmedOnly.text.length >= text.length - 100) {
      logPaidProNoticeSectionIntegrity({
        repairs: trimmedOnly.repairs,
        partyCount: authorityParties.length,
        stanzaCount: authorityParties.length,
      });
      return { text: trimmedOnly.text, repairs: trimmedOnly.repairs };
    }
    return { text, repairs };
  }

  const mergedParts = [`${intro.trimEnd()}\n\n${rebuiltStanzas.join("\n\n")}`.replace(/\n{3,}/g, "\n\n").trimEnd()];
  if (tailAfterStanzas) mergedParts.push(tailAfterStanzas);
  let mergedNotices = mergedParts.join("\n\n");
  const preservedHeading = noticesRegion.match(/(?:^|\n)\s*(\d+\.\s+NOTICES\s*)(?:\n|$)/im)?.[1]?.trim();
  const introHasNoticesHeading = /(?:^|\n)\s*(?:\d+\.\s+)?NOTICES\s*$/im.test(intro);
  if (preservedHeading && !corpusHasCanonicalNoticesHeading(mergedNotices) && !introHasNoticesHeading) {
    const introBlock = noticeIntroAlreadyHasDeliveryLanguage(mergedNotices)
      ? `${preservedHeading}\n\n${mergedNotices}`
      : `${preservedHeading}\n\nNotices under this Agreement must be in writing and delivered as set forth below.\n\n${mergedNotices}`;
    mergedNotices = introBlock.replace(/\n{3,}/g, "\n\n").trimEnd();
    repairs.push("notice:preserve_notices_section_heading");
  }
  const afterNotices = [middleClean, after.trimStart()].filter(Boolean).join("\n\n");
  text = afterNotices
    ? `${before}${mergedNotices}\n\n${afterNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd()
    : `${before}${mergedNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  logPaidProNoticeSectionIntegrity({ repairs, partyCount: authorityParties.length, stanzaCount });
  const dedupedHeadings = dedupeDuplicateStandaloneNoticesHeadings(text);
  if (dedupedHeadings.repairs.length > 0) {
    repairs.push(...dedupedHeadings.repairs);
    text = dedupedHeadings.text;
  }
  const trimmed = trimOperativeNoticeStanzasToPartyCount(text, authorityParties.length);
  // Always keep excess-stanza trims (Party 3–5 on a 2-party deal). The old length-100
  // guard discarded those trims when three placeholder stanzas were removed.
  if (trimmed.repairs.length > 0) {
    repairs.push(...trimmed.repairs);
    text = trimmed.text;
  }
  return { text, repairs };
}

export function trimOperativeNoticeStanzasToPartyCount(
  corpus: string,
  partyCount: number,
): { text: string; repairs: string[] } {
  if (partyCount < 2) return { text: corpus, repairs: [] };

  const trimRegionIfToStanzas = (text: string): { text: string; repairs: string[] } => {
    const noticesIdx = findNoticesSectionStart(text);
    if (noticesIdx < 0) return { text, repairs: [] };
    const witnessIdx = resolveAuthoritativeWitnessIndex(text);
    const end = witnessIdx >= 0 ? witnessIdx : text.length;
    const before = text.slice(0, noticesIdx);
    const region = text.slice(noticesIdx, end);
    const after = text.slice(end);
    const blocks = region.split(/\n(?=If to\s+)/i);
    const intro = blocks[0] ?? "";
    const stanzas = blocks.slice(1).filter((s) => s.trim());
    if (stanzas.length <= partyCount) return { text, repairs: [] };
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const stanza of stanzas) {
      const entity = stanza.match(/^If to\s+(.+?):/i)?.[1]?.trim().toLowerCase() ?? "";
      if (entity && seen.has(entity)) continue;
      if (entity) seen.add(entity);
      kept.push(stanza);
      if (kept.length >= partyCount) break;
    }
    const trimmedRegion = `${intro.trimEnd()}\n\n${kept.join("\n\n")}`
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
    return {
      text: `${before}${trimmedRegion}\n\n${after.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
      repairs: ["notice:trim_excess_stanzas"],
    };
  };

  const layout = sliceOperativeNoticeLayout(corpus);
  if (!layout) {
    return trimRegionIfToStanzas(corpus);
  }
  const blocks = layout.noticesFamily.split(/\n(?=If to\s+)/i);
  const stanzaBlocks = blocks.slice(1).filter((s) => s.trim());
  if (stanzaBlocks.length <= partyCount) {
    const regionTrim = trimRegionIfToStanzas(corpus);
    return regionTrim.repairs.length > 0 ? regionTrim : { text: corpus, repairs: [] };
  }
  const intro = blocks[0] ?? "";
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const stanza of stanzaBlocks) {
    const entity = stanza.match(/^If to\s+(.+?):/i)?.[1]?.trim().toLowerCase() ?? "";
    if (entity && seen.has(entity)) continue;
    if (entity) seen.add(entity);
    kept.push(stanza);
    if (kept.length >= partyCount) break;
  }
  const mergedFamily = `${intro.trimEnd()}\n\n${kept.join("\n\n")}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  const layoutTrimmed = joinOperativeNoticeLayout({ ...layout, noticesFamily: mergedFamily });
  if (countOperativeIfToNoticeStanzas(layoutTrimmed) > partyCount) {
    return trimRegionIfToStanzas(layoutTrimmed);
  }
  return {
    text: layoutTrimmed,
    repairs: ["notice:trim_excess_stanzas"],
  };
}

/** Remove duplicate If-to stanzas and placeholder Party N entities before freeze contamination gates. */
export function repairDuplicateOperativeNoticeStanzas(
  corpus: string,
  partyCount: number,
  authoritativePartyNames?: readonly string[],
): { text: string; repairs: string[] } {
  if (partyCount < 2) return { text: corpus, repairs: [] };
  let text = corpus;
  const repairs: string[] = [];

  const trimmed = trimOperativeNoticeStanzasToPartyCount(text, partyCount);
  if (trimmed.repairs.length > 0) {
    text = trimmed.text;
    repairs.push(...trimmed.repairs);
  }

  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return { text, repairs };

  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const end = witnessIdx >= 0 ? witnessIdx : text.length;
  const before = text.slice(0, noticesIdx);
  const region = text.slice(noticesIdx, end);
  const after = text.slice(end);
  const blocks = region.split(/\n(?=If to\s+)/i);
  const intro = blocks[0] ?? "";
  const stanzas = blocks.slice(1).filter((s) => s.trim());
  const kept: string[] = [];
  const seen = new Set<string>();
  const hasAuthoritativeNames =
    (authoritativePartyNames ?? []).filter((n) => n.trim().length >= 2).length >= 2;

  for (const stanza of stanzas) {
    const entity = stanza.match(/^If to\s+(.+?):/i)?.[1]?.trim() ?? "";
    const entityLower = entity.toLowerCase();
    if (hasAuthoritativeNames && /^party\s+\d+$/i.test(entity)) {
      repairs.push("notice:strip_placeholder_stanza");
      continue;
    }
    if (entityLower && seen.has(entityLower)) {
      repairs.push("notice:strip_duplicate_stanza_entity");
      continue;
    }
    if (entityLower) seen.add(entityLower);
    kept.push(stanza);
    if (kept.length >= partyCount) break;
  }

  if (kept.length === stanzas.length && repairs.length === 0) {
    return { text, repairs: [] };
  }

  const trimmedRegion = `${intro.trimEnd()}\n\n${kept.join("\n\n")}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  text = `${before}${trimmedRegion}\n\n${after.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text, repairs: [...new Set(repairs)] };
}

/** Count operative If-to stanzas in the notices-to-witness region. */
export function countOperativeIfToNoticeStanzas(corpus: string): number {
  const region = resolveAuthoritativeNoticesRegionForFreeze(corpus);
  if (!region.trim()) return 0;
  return (region.match(/^If to\s+/gim) || []).length;
}

/** Hydrate operative notice stanzas from consumed signer metadata when contact fields exist. */
export function hydrateOperativeNoticeStanzasFromSignerMetadata(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const authorityParties = enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };
  const hasContactMetadata = authorityParties.some(
    (p) => p.signerEmail.trim() || p.partyAddress.trim().length > 8,
  );
  if (!hasContactMetadata) return { text: corpus, repairs: [] };
  return repairIncompleteIfToNoticeStanzas(corpus, authorityParties, roleContext);
}

/** Rebuild operative notice stanzas when authority contact fields are missing from the corpus. */
export function ensureOperativeIfToNoticeDelivery(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
  opts?: { allowEntityOnlyNoticesAtFreeze?: boolean },
): { text: string; repairs: string[] } {
  const allowEntityOnlyNoticesAtFreeze = Boolean(opts?.allowEntityOnlyNoticesAtFreeze);
  if (
    allowEntityOnlyNoticesAtFreeze &&
    findNoticesSectionStart(corpus) < 0 &&
    resolveAuthoritativeWitnessIndex(corpus) >= 0
  ) {
    return repairIncompleteIfToNoticeStanzas(corpus, parties, roleContext, {
      allowEntityOnlyNoticesAtFreeze: true,
    });
  }
  const authorityParties = enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };

  const noticesIdx = findNoticesSectionStart(corpus);
  const authorityHasRealContactFields = authorityParties.some((p) => {
    const email = p.signerEmail.trim();
    const address = p.partyAddress.trim();
    if (!email && address.length <= 8) return false;
    if (/provided during signer setup/i.test(email) || /provided during signer setup/i.test(address)) {
      return false;
    }
    return Boolean(email) || address.length > 8;
  });
  // Signer display names alone must not invent Notices / "provided during signer setup".
  if (!authorityHasRealContactFields && noticesIdx < 0 && !allowEntityOnlyNoticesAtFreeze) {
    return { text: corpus, repairs: [] };
  }
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const noticesRegion =
    noticesIdx >= 0 ? corpus.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : corpus.length) : "";

  const noticesRegionIncludesEmail = (email: string): boolean =>
    Boolean(
      email &&
        noticesRegion.toLowerCase().includes(email.toLowerCase()) &&
        /Email(?:\s+for\s+Notice)?\s*:/i.test(noticesRegion),
    );

  const noticesRegionIncludesAddress = (addr: string): boolean => {
    if (!addr || addr.length <= 8) return true;
    const needle = addr.toLowerCase().slice(0, 12);
    return (
      noticesRegion.toLowerCase().includes(needle) &&
      /Address(?:\s+for\s+Notice)?\s*:/i.test(noticesRegion)
    );
  };

  const stanzaBlocks = noticesRegion.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim());
  const consumedStanzaIndexes = new Set<number>();
  const stanzasMissingPerPartyContact = authorityParties.some((party, index) => {
    const manifestRepairRequired = noticeAuthorityRequiresManifestRepair(
      stanzaBlocks,
      authorityParties,
      roleContext,
    );
    const stanza =
      findExistingNoticeStanzaForParty(
        party,
        authorityParties,
        roleContext,
        stanzaBlocks,
        index,
        consumedStanzaIndexes,
        { manifestAuthoritative: manifestRepairRequired },
      ) ?? (manifestRepairRequired ? "" : stanzaBlocks[index] ?? "");
    const email = party.signerEmail.trim();
    if (email && !noticeStanzaComplete(stanza, party)) return true;
    const addr = party.partyAddress.trim();
    if (addr && addr.length > 8 && !noticeStanzaComplete(stanza, party)) return true;
    return false;
  });

  const missingNoticesRegion = noticesIdx < 0;
  const missing =
    missingNoticesRegion ||
    stanzasMissingPerPartyContact ||
    authorityParties.some((p) => {
      const email = p.signerEmail.trim();
      if (email && !noticesRegionIncludesEmail(email)) return true;
      const addr = p.partyAddress.trim();
      if (addr && !noticesRegionIncludesAddress(addr)) return true;
      return false;
    });
  // Bracket tokens always force rebuild. Live "provided during signer setup" lines only
  // force rebuild when authority has real email/address to apply — otherwise freeze-time
  // rebuilds with empty contact metadata invent placeholder Notices scaffolding.
  const authorityHasContactToApply = authorityHasRealContactFields;
  const hasPlaceholderTokens =
    NOTICE_PLACEHOLDER_TOKEN_RE.test(noticesRegion) ||
    (authorityHasContactToApply && /provided during signer setup/i.test(noticesRegion));
  const hasExecutionPollution = noticesRegionHasExecutionPollution(noticesRegion);
  const hasInlineMalformedNotices = hasInlineMalformedNoticeStanzas(corpus);
  const hasBareNoticeStanzas = allowEntityOnlyNoticesAtFreeze
    ? false
    : hasBareEntityOnlyNoticeStanzas(corpus);
  const operativeStanzaCount = countOperativeIfToStanzasInRegion(noticesRegion);
  const stanzaCountMismatch = operativeStanzaCount < authorityParties.length;
  if (
    !missing &&
    !stanzaCountMismatch &&
    !hasPlaceholderTokens &&
    !hasExecutionPollution &&
    !hasInlineMalformedNotices &&
    !hasBareNoticeStanzas
  ) {
    const addressRepair = repairNoticeStanzaAddressBoundariesInCorpus(corpus);
    const baseText = addressRepair.repairs.length > 0 ? addressRepair.text : corpus;
    const trimmed = trimOperativeNoticeStanzasToPartyCount(baseText, authorityParties.length);
    const witnessSeparated = ensureBlankLineBeforeWitnessBlock(trimmed.text);
    const text = witnessSeparated.text;
    const repairs = [
      ...addressRepair.repairs,
      ...trimmed.repairs,
      ...witnessSeparated.repairs,
    ];
    if (repairs.length > 0 || text !== corpus) {
      return { text, repairs };
    }
    return { text: corpus, repairs: [] };
  }
  const repaired = repairIncompleteIfToNoticeStanzas(corpus, authorityParties, roleContext, {
    allowEntityOnlyNoticesAtFreeze,
  });
  const witnessSeparated = ensureBlankLineBeforeWitnessBlock(repaired.text);
  const merged = {
    text: witnessSeparated.text,
    repairs: [...repaired.repairs, ...witnessSeparated.repairs],
  };
  const trimmed = trimOperativeNoticeStanzasToPartyCount(merged.text, authorityParties.length);
  if (trimmed.repairs.length > 0) {
    return {
      text: trimmed.text,
      repairs: [...merged.repairs, ...trimmed.repairs],
    };
  }
  return merged;
}
