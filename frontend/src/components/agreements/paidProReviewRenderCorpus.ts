/**
 * Paid Pro final review render corpus — same sanitized body as copy/export, plus render-time fused-name guard.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  applyCanonicalPartyLegalNamesToSigningCorpus,
  corpusContainsFusedPartyLegalName,
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
} from "./canonicalPartyLegalNameSanitizer";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import {
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProFinalHydratedCorpusForSurface } from "./paidProFinalHydratedCorpus";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
import { isFusedOrConcatenatedPartyLegalName } from "./signerSetupPartyIdentity";
import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";

const LABELED_SIGNATURE_BLOCK_START =
  /^(?:CLIENT|SERVICE PROVIDER|PROVIDER|CONTRACTOR|COMPANY|PARTY\s+\d+)\s*:/i;

export function logPaidProReviewRenderFusedPartyWarning(payload: {
  repaired: boolean;
  corpusLen: number;
  pattern?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-review-render-fused-party-repair]", payload);
}

/**
 * Remove unlabeled entity-heading signature blocks when authoritative CLIENT / SERVICE PROVIDER blocks exist.
 */
export function stripDuplicateLegacySignatureBlocksAfterAuthoritative(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): { text: string; removed: number } {
  const identities = authorityPartiesToCanonicalPartyIdentities(parties);
  const canonicalNames = identities
    .map((id) => id.partyDisplayName.trim().toLowerCase())
    .filter((n) => n.length >= 2);
  if (canonicalNames.length < 2) return { text: corpus, removed: 0 };

  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: corpus, removed: 0 };

  const tail = corpus.slice(witnessIdx);
  if (!/CLIENT\s*:/i.test(tail) || !/SERVICE\s+PROVIDER\s*:/i.test(tail)) {
    return { text: corpus, removed: 0 };
  }

  const before = corpus.slice(0, witnessIdx).trimEnd();
  const witnessLine =
    tail.match(/^\s*(IN WITNESS WHEREOF[^\n]*)/i)?.[1]?.trim() ??
    "IN WITNESS WHEREOF, the Parties execute this Agreement.";
  const afterWitness = tail.replace(/^\s*IN WITNESS WHEREOF[^\n]*\n?/i, "").trim();
  const blocks = afterWitness.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const kept: string[] = [];
  let removed = 0;

  const labeledBlockCoversName = (nameLower: string): boolean =>
    kept.some(
      (b) =>
        LABELED_SIGNATURE_BLOCK_START.test(b.split("\n")[0]?.trim() ?? "") &&
        b.toLowerCase().includes(nameLower),
    );

  for (const block of blocks) {
    const firstLine = (block.split("\n")[0] ?? "").trim();
    const isLabeled = LABELED_SIGNATURE_BLOCK_START.test(firstLine);
    const looksLikeSigBlock = /\bBy\s*:/i.test(block) && /\bName\s*:/i.test(block);

    if (isFusedOrConcatenatedPartyLegalName(firstLine) && looksLikeSigBlock) {
      removed += 1;
      continue;
    }

    if (!isLabeled && looksLikeSigBlock) {
      const matchedName = canonicalNames.find(
        (n) => firstLine.toLowerCase() === n || firstLine.toLowerCase().startsWith(`${n} `),
      );
      if (matchedName && labeledBlockCoversName(matchedName)) {
        removed += 1;
        continue;
      }
    }

    kept.push(block);
  }

  if (removed === 0) return { text: corpus, removed: 0 };

  const rebuiltTail = `${witnessLine}\n\n${kept.join("\n\n")}\n`;
  return { text: `${before}\n\n${rebuiltTail}`, removed };
}

/** Hard render-time guard: repair fused party legal names before review HTML/display. */
export function guardPaidProReviewRenderCorpus(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
): { text: string; repaired: boolean; warned: boolean } {
  const input = (corpus || "").replace(/\r\n/g, "\n").trimEnd();
  if (!input) return { text: "", repaired: false, warned: false };

  const authParties = parties ?? readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  if (!corpusContainsFusedPartyLegalName(input)) {
    return { text: input, repaired: false, warned: false };
  }

  let text = input;
  let repaired = false;

  if (authParties.length >= 2) {
    const canonical = applyCanonicalPartyLegalNamesToSigningCorpus(text, authParties);
    text = canonical.text;
    repaired = canonical.repaired || repaired;
    const recital = repairMalformedPaidProAgreementRecital(text, authParties);
    text = recital.text;
    repaired = recital.repairs.length > 0 || repaired;
    const dedupe = stripDuplicateLegacySignatureBlocksAfterAuthoritative(text, authParties);
    text = dedupe.text;
    repaired = dedupe.removed > 0 || repaired;
  }

  if (text.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE)) {
    for (const id of authorityPartiesToCanonicalPartyIdentities(authParties)) {
      const legal = id.partyDisplayName.trim();
      if (legal) text = text.split(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE).join(legal);
    }
    repaired = true;
  }

  const marker = signaturePatchStartIndex(text);
  const scan = marker >= 0 ? text.slice(0, marker) : text;
  const fusedLine = scan.split("\n").find((line) => isFusedOrConcatenatedPartyLegalName(line));
  if (fusedLine && authParties.length >= 2) {
    const client = authorityPartiesToCanonicalPartyIdentities(authParties)[0]?.partyDisplayName.trim();
    if (client) text = text.split(fusedLine.trim()).join(client);
    repaired = true;
  }

  logPaidProReviewRenderFusedPartyWarning({
    repaired,
    corpusLen: text.length,
    pattern: QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
  });

  return { text, repaired: repaired || text !== input, warned: true };
}

function extractSignerTitleFromCorpus(corpus: string, partyIndex: number): string {
  const noticeRe =
    partyIndex === 0
      ? /Client:\s*[\s\S]*?\nTitle:\s*([^\n]+)/i
      : partyIndex === 1
        ? /Service Provider:\s*[\s\S]*?\nTitle:\s*([^\n]+)/i
        : null;
  if (noticeRe) {
    const noticeMatch = corpus.match(noticeRe);
    if (noticeMatch?.[1]?.trim()) return noticeMatch[1].trim();
  }
  const headingRe =
    partyIndex === 0
      ? /CLIENT\s*:/i
      : partyIndex === 1
        ? /SERVICE\s+PROVIDER\s*:/i
        : new RegExp(`PARTY\\s+${partyIndex + 1}\\s*:`, "i");
  const idx = corpus.search(headingRe);
  if (idx < 0) return "";
  const tail = corpus.slice(idx, idx + 1200);
  const titleMatch = tail.match(/\nTitle:\s*([^\n]+)/i);
  return titleMatch?.[1]?.trim() ?? "";
}

/** After direct plain-text edits, sync signer titles from corpus back into consumed authority. */
export function syncConsumedAuthoritySignerTitlesFromCorpus(corpus: string): void {
  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (!authority?.parties.length) return;
  const parties = authority.parties.map((party) => {
    const title = extractSignerTitleFromCorpus(corpus, party.partyIndex);
    if (!title || title === party.signerTitle) return party;
    return { ...party, signerTitle: title };
  });
  const next: PaidProSignerMetadataAuthority = { ...authority, parties };
  setConsumedPaidProSignerMetadataAuthority(next);
}

export type ResolvePaidProReviewRenderPlainArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
};

/**
 * Canonical plain corpus for review HTML — aligned with copy/export hydrated resolution + slot-isolated legal names.
 */
export function resolvePaidProReviewRenderPlain(
  args?: ResolvePaidProReviewRenderPlainArgs,
): string {
  const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });

  let text = (
    hydrated.signerMetadataApplied && hydrated.text.length >= PAID_PRO_AUTHORITY_MIN_LEN
      ? hydrated.text
      : resolveAuthoritativePaidProReviewPlain({
          draft: args?.draft ?? null,
          intakeText: args?.intakeText ?? null,
        })
  ).trim();

  if (text.length < PAID_PRO_AUTHORITY_MIN_LEN) return "";

  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (parties && parties.length >= 2) {
    text = applyCanonicalPartyLegalNamesToSigningCorpus(text, parties).text;
    text = repairMalformedPaidProAgreementRecital(text, parties).text;
    text = stripDuplicateLegacySignatureBlocksAfterAuthoritative(text, parties).text;
  }

  return guardPaidProReviewRenderCorpus(text, parties).text.trim();
}
