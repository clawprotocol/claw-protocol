/**
 * Party Notice Details — signer email/address hydration into paid Pro agreement corpus.
 * Idempotent insert near Notices (Section 11) or before signature blocks.
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import {
  partyDisplayRoleLabelForAuthorityParty,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";
import { resolveCanonicalPartyLegalNameForIndex } from "./canonicalPartyLegalNameSanitizer";
import {
  applyContactAuthorityExecutionBlockIntegrity,
  stripExecutionBlockContactContamination,
} from "./contactAuthorityExecutionBlockIntegrity";

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

function buildIfToNoticeStanza(party: PaidProSignerMetadataParty): string {
  const legal = party.partyLegalName.trim();
  const lines = [`If to ${legal}:`, legal];
  const name = party.signerName.trim();
  const title = party.signerTitle.trim();
  if (name) {
    lines.push(title ? `Attn: ${name}, ${title}` : `Attn: ${name}`);
  }
  const email = party.signerEmail.trim();
  if (email) lines.push(`Email: ${email}`);
  const address = party.partyAddress.trim();
  if (address) lines.push(`Address: ${address}`);
  return lines.join("\n");
}

function noticeStanzaComplete(stanza: string): boolean {
  const trimmed = stanza.trim();
  if (!trimmed) return false;
  if (DANGLING_IF_TO_RE.test(`\n${trimmed}`)) return false;
  if (/^If to\s*:\s*$/i.test(trimmed)) return false;
  return /Attn:/i.test(trimmed) || /Email:/i.test(trimmed);
}

/**
 * Repair incomplete operative Notices stanzas (dangling "If to", missing Attn/Email lines).
 */
export function repairIncompleteIfToNoticeStanzas(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): { text: string; repairs: string[] } {
  if (!corpus?.trim() || parties.length < 2) return { text: corpus, repairs: [] };
  const repairs: string[] = [];
  let text = corpus.replace(/\r\n/g, "\n");

  if (DANGLING_IF_TO_RE.test(text) || /Notices[\s\S]*\nIf to\s*$/i.test(text)) {
    text = text.replace(/\nIf to\s*:?\s*$/i, "");
    repairs.push("notice:remove_dangling_if_to");
  }

  const noticesIdx = text.search(/(?:^|\n)\s*\d+\.\s*Notices\b/i);
  if (noticesIdx < 0) {
    if (/\nIf to\s*$/i.test(text)) {
      const partiesBlock = parties.map((p) => buildIfToNoticeStanza(p)).join("\n\n");
      text = `${text.trimEnd()}\n\n${partiesBlock}`;
      repairs.push("notice:append_stanzas_after_dangling_if_to");
      logPaidProNoticeSectionIntegrity({ repairs, partyCount: parties.length, stanzaCount: parties.length });
    }
    return { text: text.trimEnd(), repairs };
  }

  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  const before = text.slice(0, noticesIdx);
  const noticesRegion = text.slice(noticesIdx, noticesEnd);
  const after = text.slice(noticesEnd);

  const blocks = noticesRegion.split(/\n(?=If to\s+)/i);
  const intro = blocks[0] ?? "";
  const stanzas = blocks.slice(1);
  const rebuiltStanzas: string[] = [];
  let stanzaCount = 0;

  for (let i = 0; i < parties.length; i++) {
    const party = parties[i]!;
    const existing = stanzas[i]?.trim() ?? "";
    if (noticeStanzaComplete(existing)) {
      rebuiltStanzas.push(existing);
      stanzaCount += 1;
      continue;
    }
    rebuiltStanzas.push(buildIfToNoticeStanza(party));
    repairs.push(`notice:rebuild_stanza_party_${i + 1}`);
    stanzaCount += 1;
  }

  if (!repairs.length) return { text, repairs };

  const mergedNotices = `${intro.trimEnd()}\n\n${rebuiltStanzas.join("\n\n")}`.replace(/\n{3,}/g, "\n\n");
  text = `${before}${mergedNotices}${after}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  logPaidProNoticeSectionIntegrity({ repairs, partyCount: parties.length, stanzaCount });
  return { text, repairs };
}
