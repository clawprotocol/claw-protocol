/**
 * Paid Pro signer metadata merge gate — keep a single execution block; strip notice-style
 * signer summary inserts before IN WITNESS WHEREOF (never Party Notice Details in body).
 */

import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { countSignatureBlockHeadingsInTail, signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import {
  authorityPartiesToCanonicalPartyIdentities,
  shouldUseAuthorityEntityExecutionHeadings,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { stripPaidProSignerSummaryBlocksFromCorpus } from "./paidProSignerSigningCorpusHygiene";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
  partyLegalNamesMatch,
} from "./paidProAcceptedCorpusPartyRoles";

const SUBSTANTIVE_ROLE_BLOCK_START_RE =
  /^(?:Client|Service Provider|Party\s+\d+)\s*:\s*$/i;

const PARTY_THREE_LINE_RE = /^Party\s+3\s*:/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function executionTailHeadingParityOk(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  identities: readonly CanonicalPartyIdentity[],
  roleContext?: PaidProPartyRoleContext | null,
): boolean {
  if (identities.length < 2 || parties.length < identities.length) return false;
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = corpus.slice(witnessIdx);
  const useEntityHeadings = shouldUseAuthorityEntityExecutionHeadings(parties, roleContext);
  if (!useEntityHeadings && countSignatureBlockHeadingsInTail(corpus) < identities.length) {
    return false;
  }
  for (const id of identities) {
    const heading = id.blockHeading.trim();
    if (!heading) return false;
    if (!new RegExp(`^\\s*${escapeRegExp(heading)}\\s*:`, "im").test(tail)) return false;
    const legal = id.partyDisplayName.trim();
    if (legal && !tail.split("\n").some((line) => partyLegalNamesMatch(line.trim(), legal))) {
      return false;
    }
  }
  return (corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length === 1;
}

function executionBlockNeedsSignerHydration(
  corpus: string,
  identities: readonly CanonicalPartyIdentity[],
): boolean {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = corpus.slice(witnessIdx);
  for (const id of identities) {
    const signer = id.representativeName?.trim();
    if (!signer) continue;
    const heading = id.blockHeading.trim();
    if (!heading) continue;
    const blockStart = tail.search(new RegExp(`^\\s*${escapeRegExp(heading)}\\s*:`, "im"));
    if (blockStart < 0) return true;
    const afterHeading = tail.slice(blockStart);
    const nextBlock = afterHeading.slice(1).search(
      /^\s*(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY\s+\d+|[A-Z][^\n:]{2,80})\s*:/im,
    );
    const block = nextBlock >= 0 ? afterHeading.slice(0, nextBlock + 1) : afterHeading;
    const nameLine = block.match(/^\s*Name:\s*(.*)$/im)?.[1]?.trim() ?? "";
    if (!nameLine || /_{4,}/.test(nameLine) || !partyLegalNamesMatch(nameLine, signer)) {
      return true;
    }
  }
  return false;
}

function clampPartiesForCanonicalCount(
  parties: readonly PaidProSignerMetadataParty[],
  canonicalPartyCount: number,
): PaidProSignerMetadataParty[] {
  if (parties.length <= canonicalPartyCount) return [...parties];
  return parties.slice(0, canonicalPartyCount).map((p, i) => ({ ...p, partyIndex: i }));
}

/** Remove Party Notice Details and stray role-labeled signer blocks before execution. */
export function stripSubstantiveSignerMetadataBeforeWitness(corpus: string): {
  text: string;
  removed: number;
} {
  const summary = stripPaidProSignerSummaryBlocksFromCorpus(corpus);
  if (summary.removed > 0) return { text: summary.text, removed: summary.removed };

  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: corpus, removed: 0 };

  const prefix = corpus.slice(0, witnessIdx);
  const tail = corpus.slice(witnessIdx);
  const lines = prefix.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let removed = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (SUBSTANTIVE_ROLE_BLOCK_START_RE.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length && lines[j]?.trim()) j += 1;
      removed += 1;
      i = j;
      continue;
    }
    if (PARTY_THREE_LINE_RE.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length && lines[j]?.trim()) j += 1;
      removed += 1;
      i = j;
      continue;
    }
    out.push(line);
    i += 1;
  }

  if (removed === 0) return { text: corpus, removed: 0 };
  const rebuilt = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n\n${tail}`;
  return { text: rebuilt, removed };
}

export function dedupePartyNoticeDetailsSections(corpus: string): { text: string; removed: number } {
  const matches = [...corpus.matchAll(/^\s*Party Notice Details:\s*$/gim)];
  if (matches.length <= 1) return { text: corpus, removed: 0 };
  let text = corpus;
  let removed = 0;
  while ((text.match(/^\s*Party Notice Details:\s*$/gim) || []).length > 1) {
    const firstStart = text.search(/^\s*Party Notice Details:\s*$/im);
    const secondStart = text.slice(firstStart + 1).search(/^\s*Party Notice Details:\s*$/im);
    if (secondStart < 0) break;
    const absSecond = firstStart + 1 + secondStart;
    const tailFromSecond = text.slice(absSecond);
    const relEnd = tailFromSecond.search(/\n\n(?=\d+\.\s*\w|IN WITNESS WHEREOF)/im);
    const end = relEnd >= 0 ? absSecond + relEnd : text.length;
    text = `${text.slice(0, absSecond).trimEnd()}\n\n${text.slice(end).trimStart()}`.replace(/\n{3,}/g, "\n\n");
    removed += 1;
  }
  return { text, removed };
}

export function sortIdentitiesForExecutionBlockOrder(
  identities: readonly CanonicalPartyIdentity[],
): CanonicalPartyIdentity[] {
  const client = identities.find((id) => id.blockHeading === "CLIENT");
  const provider = identities.find((id) => id.blockHeading === "SERVICE PROVIDER");
  const rest = identities.filter((id) => id !== client && id !== provider);
  const ordered: CanonicalPartyIdentity[] = [];
  if (client) ordered.push(client);
  if (provider) ordered.push(provider);
  ordered.push(...rest);
  return ordered.length ? ordered : [...identities];
}

/** Replace execution block party sections so CLIENT / SERVICE PROVIDER match corpus roles. */
export function reconcileExecutionBlockToRoleIdentities(
  corpus: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; repairs: number } {
  const ordered = sortIdentitiesForExecutionBlockOrder(identities);
  if (ordered.length < 2) return { text: corpus, repairs: 0 };

  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: corpus, repairs: 0 };

  const prefix = corpus.slice(0, witnessIdx).trimEnd();
  const tail = corpus.slice(witnessIdx);
  const witnessLine =
    tail.match(/^\s*(IN WITNESS WHEREOF[^\n]*)/i)?.[1]?.trim() ??
    "IN WITNESS WHEREOF, the Parties execute this Agreement.";

  const blocks: string[] = [];
  for (const id of ordered) {
    if (!id.partyDisplayName.trim()) continue;
    const heading = id.blockHeading.trim().replace(/:$/, "");
    const legal = id.partyDisplayName.trim();
    const entityHeading = heading.toLowerCase() === legal.toLowerCase();
    // Entity-heading blocks: uppercase legal name + blank line (no ROLE-style colon), matching
    // buildMultiPartyEntityNameExecutionSection / acceptance invariant shape.
    const lines = entityHeading ? [heading.toUpperCase(), ""] : [`${heading}:`, legal];
    const headingRe = new RegExp(
      `^\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?`,
      "im",
    );
    const headingIdx = tail.search(headingRe);
    const tailChunk = headingIdx >= 0 ? tail.slice(headingIdx) : "";
    const chunkLines = tailChunk.split("\n").slice(0, 40);
    for (const cl of chunkLines) {
      const t = cl.trim();
      if (/^by\s*:/i.test(t)) lines.push(cl);
      else if (/^name\s*:/i.test(t) && id.representativeName?.trim()) {
        lines.push(`Name: ${id.representativeName.trim()}`);
      } else if (/^name\s*:/i.test(t)) lines.push(cl);
      else if (/^title\s*:/i.test(t)) lines.push(id.title?.trim() ? `Title: ${id.title.trim()}` : cl);
      else if (/^email\s+for\s+notice/i.test(t)) {
        /* contact authority: strip legacy notice lines */
      } else if (/^address\s+for\s+notice/i.test(t)) {
        /* contact authority: strip legacy notice lines */
      } else if (/^date\s*:/i.test(t)) lines.push(cl);
      else if (/^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY\s+\d+)\s*:/i.test(t)) break;
      else if (
        ordered.some(
          (other) =>
            other !== id &&
            other.blockHeading.trim() &&
            new RegExp(
              `^${other.blockHeading.trim().replace(/:$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*$`,
              "i",
            ).test(t),
        )
      ) {
        break;
      }
    }
    if (!lines.some((l) => /^by\s*:/i.test(l.trim()))) {
      lines.push("By: __________________________");
      lines.push(
        id.representativeName?.trim()
          ? `Name: ${id.representativeName.trim()}`
          : "Name: __________________________",
      );
      lines.push(`Title: ${id.title?.trim() || "_________________________"}`);
      lines.push("Date: _____________________________");
    }
    blocks.push(lines.join("\n"));
  }

  if (blocks.length < 2) return { text: corpus, repairs: 0 };
  const rebuiltTail = `${witnessLine}\n\n${blocks.join("\n\n")}\n`;
  const rebuilt = `${prefix}\n\n${rebuiltTail}`;
  if (rebuilt === corpus) return { text: corpus, repairs: 0 };
  return { text: rebuilt, repairs: 1 };
}

function executionTailContainsAllPartyLegalNames(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = corpus.slice(witnessIdx);
  return parties.every((p) => {
    const legal = p.partyLegalName.trim();
    if (!legal) return false;
    return tail.split("\n").some((line) => partyLegalNamesMatch(line.trim(), legal));
  });
}

export function applyPaidProSignerMetadataMergeGate(args: {
  corpus: string;
  parties: readonly PaidProSignerMetadataParty[];
  canonicalPartyCount?: number;
  roleContext?: PaidProPartyRoleContext | null;
}): { text: string; repairs: string[] } {
  const canonicalPartyCount = args.canonicalPartyCount ?? 2;
  const parties = clampPartiesForCanonicalCount(args.parties, canonicalPartyCount);
  const roleContext: PaidProPartyRoleContext = {
    ...args.roleContext,
    acceptedCorpus: args.roleContext?.acceptedCorpus ?? args.corpus,
  };
  const identities = authorityPartiesToCanonicalPartyIdentities(parties, roleContext);

  let text = (args.corpus || "").replace(/\r\n/g, "\n");
  const repairs: string[] = [];

  if (canonicalPartyCount === 2) {
    if (PARTY_THREE_LINE_RE.test(text) || /\bParty\s+3\b/i.test(text)) {
      text = text
        .split("\n")
        .filter((line) => !PARTY_THREE_LINE_RE.test(line.trim()))
        .join("\n");
      repairs.push("strip_party_3_lines");
    }
  }

  const substantive = stripSubstantiveSignerMetadataBeforeWitness(text);
  if (substantive.removed > 0) {
    text = substantive.text;
    repairs.push(`strip_substantive_signer_blocks:${substantive.removed}`);
  }

  const summaryStrip = stripPaidProSignerSummaryBlocksFromCorpus(text);
  if (summaryStrip.removed > 0) {
    text = summaryStrip.text;
    repairs.push(`strip_signer_summary_blocks:${summaryStrip.removed}`);
  }

  if (identities.length >= 2) {
    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    if (witnessIdx >= 0) {
      const headingParityOk = executionTailHeadingParityOk(text, parties, identities, roleContext);
      const needsSignerHydration = executionBlockNeedsSignerHydration(text, identities);
      const needsReconcile =
        !headingParityOk ||
        detectExecutionBlockRoleInversion(text) ||
        !executionTailContainsAllPartyLegalNames(text, parties) ||
        needsSignerHydration;
      if (needsReconcile) {
        const reconciled = reconcileExecutionBlockToRoleIdentities(text, identities);
        if (reconciled.repairs > 0) {
          text = reconciled.text;
          repairs.push("reconcile_execution_block_from_signer_authority");
        }
      }
    } else if (signaturePatchStartIndex(text) >= 0) {
      const execInvariant = analyzePaidProExecutionBlockInvariant(text, {
        expectedParties: canonicalPartyCount,
      });
      if (execInvariant.executionBlockCount === 1 && detectExecutionBlockRoleInversion(text)) {
        const reconcileIdentities = buildCorpusRoleIdentitiesForExecutionReconcile(text);
        const reconciled = reconcileExecutionBlockToRoleIdentities(text, reconcileIdentities);
        if (reconciled.repairs > 0) {
          text = reconciled.text;
          repairs.push("reconcile_execution_block_roles");
        }
      }
    }
  }

  return { text: text.trimEnd() + (text.endsWith("\n") ? "" : "\n"), repairs };
}
