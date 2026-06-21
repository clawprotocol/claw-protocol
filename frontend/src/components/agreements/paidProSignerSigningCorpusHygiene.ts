/**
 * Paid Pro signing corpus hygiene — signer metadata belongs only in the execution block.
 * No Party Notice Details, Party 1/2, or notice-style Client/Service Provider summary inserts.
 */

import { applySignerPartyIdentityToAuthoritativeAgreement } from "./guidedDealCompletion/signerPartyIdentity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { enforcePaidProSingleExecutionBlock, resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  applySignatureNoticeContactFieldsToCorpus,
  corpusHasPartyNoticeDetails,
  ensureOperativeIfToNoticeDelivery,
  isOperativeIfToNoticeStanzaHeading,
  stripExistingPartyNoticeDetails,
} from "./paidProPartyNoticeDetails";
import { applyContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";
import { enforceUserVisibleRenderTokenAuthority } from "./userVisibleRenderTokenAuthority";

const PARTY_NOTICE_HEADING_RE = /^\s*Party Notice Details:\s*$/i;
const PARTY_NUMBER_HEADING_RE = /^\s*Party\s+(\d+)\s*:\s*$/i;

function blockHasNoticeStyleSignerLines(lines: readonly string[], start: number): boolean {
  let hasSignerOrLooseEmail = false;
  let hasBy = false;
  for (let j = start + 1; j < lines.length; j += 1) {
    const t = (lines[j] ?? "").trim();
    if (!t) break;
    if (/^Signer\s*:/i.test(t)) hasSignerOrLooseEmail = true;
    if (/^Email\s*:/i.test(t) && !/^Email\s+for\s+Notice/i.test(t)) hasSignerOrLooseEmail = true;
    if (/^Address\s*:/i.test(t) && !/^Address\s+for\s+Notice/i.test(t)) hasSignerOrLooseEmail = true;
    if (/^By\s*:/i.test(t)) hasBy = true;
    if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(t)) break;
    if (PARTY_NUMBER_HEADING_RE.test(t)) break;
    if (PARTY_NOTICE_HEADING_RE.test(t)) break;
  }
  return hasSignerOrLooseEmail && !hasBy;
}

/** Remove Party Notice Details and pre-witness notice-style party summary blocks. */
export function stripPaidProSignerSummaryBlocksFromCorpus(corpus: string): {
  text: string;
  removed: number;
} {
  let text = (corpus || "").replace(/\r\n/g, "\n");
  let removed = 0;

  if (corpusHasPartyNoticeDetails(text)) {
    const before = text.length;
    text = stripExistingPartyNoticeDetails(text);
    if (text.length !== before) removed += 1;
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  if (witnessIdx < 0) {
    return { text: text.trimEnd() + (text.endsWith("\n") ? "" : "\n"), removed };
  }

  const prefix = text.slice(0, witnessIdx);
  const tail = text.slice(witnessIdx);
  const lines = prefix.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed) {
      out.push(lines[i] ?? "");
      i += 1;
      continue;
    }
    if (PARTY_NOTICE_HEADING_RE.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? "").trim()) j += 1;
      removed += 1;
      i = j;
      continue;
    }
    if (isOperativeIfToNoticeStanzaHeading(trimmed)) {
      out.push(lines[i] ?? "");
      i += 1;
      while (i < lines.length) {
        const stanzaLine = (lines[i] ?? "").trim();
        if (!stanzaLine) {
          out.push(lines[i] ?? "");
          i += 1;
          break;
        }
        if (isOperativeIfToNoticeStanzaHeading(stanzaLine)) break;
        if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(stanzaLine)) break;
        if (PARTY_NUMBER_HEADING_RE.test(stanzaLine)) break;
        if (PARTY_NOTICE_HEADING_RE.test(stanzaLine)) break;
        if (/^\d+(?:\.\d+)?\.\s+\w/.test(stanzaLine)) break;
        out.push(lines[i] ?? "");
        i += 1;
      }
      continue;
    }
    if (PARTY_NUMBER_HEADING_RE.test(trimmed) || blockHasNoticeStyleSignerLines(lines, i)) {
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? "").trim()) j += 1;
      removed += 1;
      i = j;
      continue;
    }
    out.push(lines[i] ?? "");
    i += 1;
  }

  if (removed === 0) return { text, removed: 0 };
  const rebuilt = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n\n${tail}`;
  return { text: rebuilt.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", removed };
}

export function countWitnessExecutionSections(corpus: string): number {
  return (corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
}

/** Fill Email/Address for Notice after execution-block repairs that may reset placeholders. */
export function fillPaidProSignatureNoticeFieldsAfterExecutionRepair(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; applied: boolean } {
  const notice = applySignatureNoticeContactFieldsToCorpus(corpus, parties, roleContext);
  return { text: notice.text, applied: notice.applied };
}

/** Strip summary blocks and enforce a single execution tail after hydration. */
export function finalizePaidProSigningCorpusText(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let text = (corpus || "").replace(/\r\n/g, "\n").trimEnd();

  const stripped = stripPaidProSignerSummaryBlocksFromCorpus(text);
  if (stripped.removed > 0) {
    text = stripped.text;
    repairs.push(`strip_signer_summary_blocks:${stripped.removed}`);
  }

  const execution = enforcePaidProSingleExecutionBlock(text, {
    authorityParties: parties?.map((p) => ({ partyLegalName: p.partyLegalName })),
    intakeText: roleContext?.intakeText ?? null,
    draftPartyNames: roleContext?.draftPartyNames ?? parties?.map((p) => p.partyLegalName) ?? null,
  });
  if (execution.text !== text) {
    text = execution.text;
    repairs.push(...execution.repairs);
  }

  const strippedAgain = stripPaidProSignerSummaryBlocksFromCorpus(text);
  if (strippedAgain.removed > 0) {
    text = strippedAgain.text;
    repairs.push(`strip_signer_summary_blocks_post:${strippedAgain.removed}`);
  }

  if (parties && parties.length >= 2) {
    const notice = fillPaidProSignatureNoticeFieldsAfterExecutionRepair(text, parties, roleContext);
    if (notice.applied) {
      text = notice.text;
      repairs.push("signature_notice_contact_strip_post_execution");
    }
    const identities = authorityPartiesToCanonicalPartyIdentities(parties, roleContext);
    const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
      text,
      identities,
      roleContext?.intakeText ?? "",
      { signatureRegionOnly: true },
    );
    if (!identityApply.rejected && identityApply.text !== text) {
      text = identityApply.text;
      repairs.push("signer_identity_post_execution");
    }
  }

  const contactAuthority = applyContactAuthorityExecutionBlockIntegrity(text, {
    source: "finalize_paid_pro_signing_corpus",
    ensureNoticesClause: true,
  });
  if (contactAuthority.repaired) {
    text = contactAuthority.text;
    repairs.push(...contactAuthority.repairs.map((tag) => `contact_authority:${tag}`));
  }

  if (parties && parties.length >= 2) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(text, parties, roleContext);
    if (noticeDelivery.repairs.length > 0) {
      text = noticeDelivery.text;
      repairs.push(...noticeDelivery.repairs.map((tag) => `notice_delivery:${tag}`));
    }
  }

  const outputIntegrity = enforceUserVisibleRenderTokenAuthority(text, {
    intakeRaw: roleContext?.intakeText ?? null,
    parties,
    partyNames: parties?.map((p) => p.partyLegalName) ?? null,
    surface: "finalize_paid_pro_signing_corpus",
    blockOnUnresolved: false,
  });
  if (outputIntegrity.repairs.length > 0) {
    text = outputIntegrity.text;
    repairs.push(...outputIntegrity.repairs.map((tag) => `output_integrity:${tag}`));
  }

  return { text: text.trimEnd() + (text.endsWith("\n") ? "" : "\n"), repairs };
}
