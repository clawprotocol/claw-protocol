/**
 * Party Notice Details — signer email/address hydration into paid Pro agreement corpus.
 * Idempotent insert near Notices (Section 11) or before signature blocks.
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES } from "./paidProNPartySignerSetup";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  mergeLabeledPartyAuthorityIntoParties,
  partyDisplayRoleLabelForAuthorityParty,
  preserveSlotIndexedSignerMetadataParties,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";
import { resolveCanonicalPartyLegalNameForIndex } from "./canonicalPartyLegalNameSanitizer";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import {
  applyContactAuthorityExecutionBlockIntegrity,
  stripExecutionBlockContactContamination,
} from "./contactAuthorityExecutionBlockIntegrity";
import {
  resolveAuthoritativeWitnessIndex,
  stripPreWitnessExecutionPollutionFromPrefix,
} from "./paidProExecutionBlockNormalization";

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

const ROLE_ONLY_IF_TO_HEADER_RE = /^If to (?:the )?(?:Client|Service\s+Provider|Party\s+\d+)\s*:\s*$/i;

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

function defuseEntityWitnessFusionLine(line: string): { line: string; repaired: boolean } {
  const trimmed = line.trim();
  if (!/IN WITNESS WHEREOF/i.test(trimmed) || /^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) {
    return { line, repaired: false };
  }
  const cleaned = trimmed.replace(/\s*IN WITNESS WHEREOF[\s\S]*$/i, "").trim();
  if (!cleaned) return { line: "", repaired: true };
  return { line: cleaned, repaired: cleaned !== trimmed };
}

function resolveCanonicalNoticeAuthorityParties(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): readonly PaidProSignerMetadataParty[] {
  const intake = roleContext?.intakeText?.trim() ?? "";
  const draftPartyNames =
    roleContext?.draftPartyNames ??
    parties.map((p) => p.partyLegalName).filter((n) => n.trim().length >= 2);

  const labeled = intake ? parseLabeledPartyBlocks(intake) : [];
  const slotCount = intake
    ? resolveAuthoritativePartySlotCount({
        intakeText: intake,
        draftPartyNames,
        rawPartyCount: parties.length,
      })
    : parties.length;

  const maxParties = Math.min(
    labeled.length >= 2 ? labeled.length : Math.max(slotCount, parties.length),
    PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES,
  );

  const base =
    parties.length >= 2
      ? parties.slice(0, maxParties)
      : intake
        ? mergeLabeledPartyAuthorityIntoParties([], intake)
        : parties;

  if (!intake) return base.slice(0, maxParties);

  const merged = mergeLabeledPartyAuthorityIntoParties(base, intake);
  return preserveSlotIndexedSignerMetadataParties(merged, base).slice(0, maxParties);
}

function enrichNoticeAuthorityParties(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): readonly PaidProSignerMetadataParty[] {
  const resolved = ensureNoticeAuthorityPartyLegalEntities(
    resolveCanonicalNoticeAuthorityParties(parties, roleContext),
    roleContext,
  );
  return preserveSlotIndexedSignerMetadataParties(resolved, parties);
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
  const header = trimmed.split("\n")[0]?.trim() ?? "";
  if (ROLE_ONLY_IF_TO_HEADER_RE.test(header)) return true;
  return trimmed.split("\n").some((line) => {
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
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!payload.repairs.length) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-notice-section-integrity]", payload);
}

/** Optional-contact display: omit missing email/address; never emit placeholder tokens. */
export function formatNoticeAddressLines(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  const explicitLines = trimmed
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines;
  const usAddress = trimmed.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (usAddress) {
    return [
      usAddress[1].trim(),
      `${usAddress[2].trim()}, ${usAddress[3].toUpperCase()} ${usAddress[4]}`,
    ];
  }
  return [trimmed];
}

const NOTICE_PRIMARY_CONTACT_FALLBACK_LINE =
  "Primary business address and email on file with the other Parties.";

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
    const normalized = expandFusedIfToNoticeStanza(trimmed);
    if (!isBareEntityOnlyNoticeStanza(normalized)) return trimmed;
    repairs.push("notice:append_primary_contact_fallback");
    return `${normalized}\n${NOTICE_PRIMARY_CONTACT_FALLBACK_LINE}`;
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
  const entityLine = stanza
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[1];
  return Boolean(entityLine && entityLine.length >= 3 && ENTITY_SUFFIX_LINE_RE.test(entityLine));
}

function logPaidProNoticeEntityMissingDiagnostic(payload: { partyIndex: number; resolvedLegal: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-notice-entity-missing]", payload);
}

function resolveNoticeStanzaLegalEntity(
  party: PaidProSignerMetadataParty,
  authorityParties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const direct = party.partyLegalName.trim();
  if (direct.length >= 2) return direct;
  const fromCanonical = resolveCanonicalPartyLegalNameForIndex(party.partyIndex, authorityParties).trim();
  if (fromCanonical.length >= 2) return fromCanonical;
  const intake = roleContext?.intakeText?.trim() ?? "";
  if (intake) {
    const fromIntake = resolveCanonicalPartyIdentitiesFromIntake(
      intake,
      roleContext?.draftPartyNames ?? null,
    );
    const legal = fromIntake[party.partyIndex]?.fullLegalName?.trim() ?? "";
    if (legal.length >= 2) return legal;
  }
  const frozen = readFrozenCanonicalManifestPartyNames();
  const frozenLegal = frozen[party.partyIndex]?.trim() ?? "";
  if (frozenLegal.length >= 2) return frozenLegal;
  logPaidProNoticeEntityMissingDiagnostic({
    partyIndex: party.partyIndex,
    resolvedLegal: `Party ${party.partyIndex + 1}`,
  });
  return `Party ${party.partyIndex + 1}`;
}

function ensureNoticeAuthorityPartyLegalEntities(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): PaidProSignerMetadataParty[] {
  return parties.map((party) => {
    const legal = resolveNoticeStanzaLegalEntity(party, parties, roleContext);
    if (legal === party.partyLegalName.trim()) return party;
    return { ...party, partyLegalName: legal };
  });
}

function expandFusedIfToNoticeStanza(stanza: string): string {
  const trimmed = stanza.trim();
  if (trimmed.includes("\n")) return trimmed;
  const fused = trimmed.match(/^If to\s+(.+?):\s*(.+)$/i);
  if (!fused?.[1] || !fused?.[2]) return trimmed;
  return `If to ${fused[1].trim()}:\n${fused[2].trim()}`;
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
  if (email) lines.push(`Email: ${email}`);
  if (addressLines.length > 0) {
    lines.push("Address:", ...addressLines);
  }
  if (!email && addressLines.length === 0) {
    lines.push(NOTICE_PRIMARY_CONTACT_FALLBACK_LINE);
  }
  return lines.join("\n");
}

function noticeStanzaComplete(stanza: string, party?: PaidProSignerMetadataParty): boolean {
  const trimmed = stanza.trim();
  if (!trimmed) return false;
  if (noticeStanzaContainsPlaceholderTokens(trimmed)) return false;
  if (noticeStanzaHasExecutionPollution(trimmed)) return false;
  if (noticeStanzaHasRoleLabelCorruption(trimmed)) return false;
  if (DANGLING_IF_TO_RE.test(`\n${trimmed}`)) return false;
  if (/^If to\s*:\s*$/i.test(trimmed)) return false;
  const hasAttn = /Attn:/i.test(trimmed);
  const hasEmailLine = /Email(?:\s+for\s+Notice)?\s*:/i.test(trimmed);
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

function findNoticesSectionStart(text: string): number {
  const match = text.match(NOTICES_SECTION_HEADING_RE);
  if (!match || match.index == null) return -1;
  return match.index;
}

const TOP_LEVEL_OPERATIVE_HEADING_RE = /^\s*\d+\.(?!\d)\s+\S/;

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

/**
 * Repair incomplete operative Notices stanzas (dangling "If to", missing Attn/Email lines).
 */
export function repairIncompleteIfToNoticeStanzas(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const authorityParties = parties.some((p) => p.signerEmail.trim() || p.partyAddress.trim() || p.signerName.trim())
    ? preserveSlotIndexedSignerMetadataParties(
        enrichNoticeAuthorityParties(parties, roleContext),
        parties,
      )
    : enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };
  const repairs: string[] = [];
  let text = corpus.replace(/\r\n/g, "\n");

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
  const middleBeforeIfTo = middle.split(/\n(?=If to\s+)/i)[0]?.trim() ?? "";

  if (hasInlineMalformedNoticeStanzas(fullNoticesRegion)) {
    noticesRegion = noticesRegion.replace(/\s+(If to\s+)/gi, "\n\n$1");
    repairs.push("notice:split_inline_stanzas");
  }

  const defusedLines: string[] = [];
  for (const line of noticesRegion.split("\n")) {
    const defused = defuseEntityWitnessFusionLine(line);
    if (defused.repaired) repairs.push("notice:defuse_entity_witness_fusion");
    if (defused.line) defusedLines.push(defused.line);
  }
  noticesRegion = defusedLines.join("\n");

  const pollutionStrip = stripPreWitnessExecutionPollutionFromPrefix(noticesRegion);
  if (pollutionStrip.repairs.length > 0) {
    noticesRegion = pollutionStrip.text;
    repairs.push(...pollutionStrip.repairs.map((r) => `notice:${r}`));
  }

  const blocks = fullNoticesRegion.split(/\n(?=If to\s+)/i);
  const introParts = [blocks[0]?.trim() ?? ""];
  if (middleBeforeIfTo && !introParts[0]?.includes(middleBeforeIfTo)) {
    introParts.push(middleBeforeIfTo);
  }
  const intro = introParts.filter(Boolean).join("\n\n");
  const existingStanzas = blocks.slice(1).map((s) => s.trim()).filter(Boolean);
  let tailAfterStanzas = "";
  if (blocks.length > 1) {
    const lastBlock = blocks[blocks.length - 1] ?? "";
    const relIdx = fullNoticesRegion.lastIndexOf(lastBlock);
    if (relIdx >= 0) {
      tailAfterStanzas = fullNoticesRegion.slice(relIdx + lastBlock.length).trim();
    }
  }
  const rebuiltStanzas: string[] = [];
  let stanzaCount = 0;

  for (let i = 0; i < authorityParties.length; i++) {
    const party = authorityParties[i]!;
    const existing = existingStanzas[i]?.trim() ?? "";
    const requiredEmail = party.signerEmail.trim();
    const stanzaHasAuthorityEmail =
      !requiredEmail ||
      new RegExp(`Email:\\s*${escapeRegExp(requiredEmail)}`, "i").test(existing);
    if (noticeStanzaComplete(existing, party) && stanzaHasAuthorityEmail) {
      rebuiltStanzas.push(existing);
      stanzaCount += 1;
      continue;
    }
    rebuiltStanzas.push(buildIfToNoticeStanza(party, authorityParties, roleContext));
    repairs.push(`notice:rebuild_stanza_party_${i + 1}`);
    stanzaCount += 1;
  }

  if (!repairs.length) {
    const trimmedOnly = trimOperativeNoticeStanzasToPartyCount(text, authorityParties.length);
    if (trimmedOnly.repairs.length > 0) {
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
  const mergedNotices = mergedParts.join("\n\n");
  text = after.trimStart()
    ? `${before}${mergedNotices}\n\n${after.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd()
    : `${before}${mergedNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  logPaidProNoticeSectionIntegrity({ repairs, partyCount: authorityParties.length, stanzaCount });
  const trimmed = trimOperativeNoticeStanzasToPartyCount(text, authorityParties.length);
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
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return { text: corpus, repairs: [] };
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const end = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const before = corpus.slice(0, noticesIdx);
  const region = corpus.slice(noticesIdx, end);
  const after = corpus.slice(end);
  const blocks = region.split(/\n(?=If to\s+)/i);
  const stanzaBlocks = blocks.slice(1).filter((s) => s.trim());
  if (stanzaBlocks.length <= partyCount) return { text: corpus, repairs: [] };
  const intro = blocks[0] ?? "";
  const kept = stanzaBlocks.slice(0, partyCount);
  const mergedNotices = `${intro.trimEnd()}\n\n${kept.join("\n\n")}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  const text = after.trimStart()
    ? `${before}${mergedNotices}\n\n${after.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd()
    : `${before}${mergedNotices}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text, repairs: ["notice:trim_excess_stanzas"] };
}

/** Count operative If-to stanzas between the numbered Notices heading and execution witness. */
export function countOperativeIfToNoticeStanzas(corpus: string): number {
  const noticesIdx = findNoticesSectionStart(corpus);
  if (noticesIdx < 0) return 0;
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const end = witnessIdx >= 0 ? witnessIdx : corpus.length;
  const region = corpus.slice(noticesIdx, end);
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
    (p) => p.signerEmail.trim() || p.partyAddress.trim() || p.signerName.trim(),
  );
  if (!hasContactMetadata) return { text: corpus, repairs: [] };
  return repairIncompleteIfToNoticeStanzas(corpus, authorityParties, roleContext);
}

/** Rebuild operative notice stanzas when authority contact fields are missing from the corpus. */
export function ensureOperativeIfToNoticeDelivery(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const authorityParties = enrichNoticeAuthorityParties(parties, roleContext);
  if (!corpus?.trim() || authorityParties.length < 2) return { text: corpus, repairs: [] };

  const noticesIdx = findNoticesSectionStart(corpus);
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
  const stanzasMissingPerPartyContact = authorityParties.some((party, index) => {
    const stanza = stanzaBlocks[index] ?? "";
    const email = party.signerEmail.trim();
    if (email && !noticeStanzaComplete(stanza, party)) return true;
    const addr = party.partyAddress.trim();
    if (addr && addr.length > 8 && !noticeStanzaComplete(stanza, party)) return true;
    return false;
  });

  const missing =
    stanzasMissingPerPartyContact ||
    authorityParties.some((p) => {
      const email = p.signerEmail.trim();
      if (email && !noticesRegionIncludesEmail(email)) return true;
      const addr = p.partyAddress.trim();
      if (addr && !noticesRegionIncludesAddress(addr)) return true;
      return false;
    });
  const hasPlaceholderTokens = NOTICE_PLACEHOLDER_TOKEN_RE.test(noticesRegion);
  const hasExecutionPollution = noticesRegionHasExecutionPollution(noticesRegion);
  const hasInlineMalformedNotices = hasInlineMalformedNoticeStanzas(corpus);
  const hasBareNoticeStanzas = hasBareEntityOnlyNoticeStanzas(corpus);
  if (!missing && !hasPlaceholderTokens && !hasExecutionPollution && !hasInlineMalformedNotices && !hasBareNoticeStanzas) {
    const trimmed = trimOperativeNoticeStanzasToPartyCount(corpus, authorityParties.length);
    return trimmed.repairs.length > 0
      ? { text: trimmed.text, repairs: trimmed.repairs }
      : { text: corpus, repairs: [] };
  }
  const repaired = repairIncompleteIfToNoticeStanzas(corpus, authorityParties, roleContext);
  const trimmed = trimOperativeNoticeStanzasToPartyCount(repaired.text, authorityParties.length);
  if (trimmed.repairs.length > 0) {
    return {
      text: trimmed.text,
      repairs: [...repaired.repairs, ...trimmed.repairs],
    };
  }
  return repaired;
}
