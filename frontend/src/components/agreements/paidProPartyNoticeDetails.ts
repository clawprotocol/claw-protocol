/**
 * Party Notice Details — signer email/address hydration into paid Pro agreement corpus.
 * Idempotent insert near Notices (Section 11) or before signature blocks.
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";

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
): string {
  const lines: string[] = [PARTY_NOTICE_DETAILS_HEADING, ""];
  let wroteParty = false;
  for (const party of parties) {
    const legal = party.partyLegalName.trim();
    const email = party.signerEmail.trim();
    if (!legal) continue;
    lines.push(`${partyRoleLabelForIndex(party.partyIndex)}:`);
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
): { text: string; applied: boolean; replaced: boolean } {
  const block = buildPartyNoticeDetailsBlock(parties);
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
