/**
 * Paid Pro execution / signature block authority.
 * After SoT acceptance, the authoritative corpus carries exactly one execution block;
 * downstream paths may hydrate signer fields inside it but must not synthesize duplicates.
 */

import {
  corpusHasWitnessBlock,
  corpusSignatureBlocksHaveRequiredByLines,
  countSignatureBlockHeadingsInTail,
  findSignatureRegionStart,
  signaturePatchStartIndex,
} from "./guidedDealCompletion/signatureRegion";

const LEGACY_ENTITY_INLINE_SIGNATURE_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited)\s+Signature:\s*_{1,}\s*Date:\s*_{1,}/gi;

function countCompletePartySignatureSections(text: string): {
  clientWithBy: number;
  serviceProviderWithBy: number;
  witnessBlocks: number;
  legacyEntitySignatureLines: number;
  clientHeadings: number;
  serviceProviderHeadings: number;
} {
  const body = (text || "").replace(/\r\n/g, "\n");
  const tailStart = signaturePatchStartIndex(body);
  const tail = tailStart >= 0 ? body.slice(tailStart) : body.slice(Math.floor(body.length * 0.72));
  const chunks = tail.split(/\n(?=\s*(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY\s+\d+)\s*:)/i).filter((c) => c.trim());
  let clientWithBy = 0;
  let serviceProviderWithBy = 0;
  for (const chunk of chunks) {
    const hasBy = /\bBy\s*:/i.test(chunk);
    if (!hasBy) continue;
    if (/^\s*CLIENT\s*:/im.test(chunk)) clientWithBy += 1;
    if (/^\s*SERVICE\s+PROVIDER\s*:/im.test(chunk)) serviceProviderWithBy += 1;
  }
  LEGACY_ENTITY_INLINE_SIGNATURE_RE.lastIndex = 0;
  return {
    clientWithBy,
    serviceProviderWithBy,
    witnessBlocks: (body.match(/\bIN WITNESS WHEREOF\b/gi) || []).length,
    legacyEntitySignatureLines: (tail.match(LEGACY_ENTITY_INLINE_SIGNATURE_RE) || []).length,
    clientHeadings: (tail.match(/^\s*CLIENT\s*:/gim) || []).length,
    serviceProviderHeadings: (tail.match(/^\s*SERVICE\s+PROVIDER\s*:/gim) || []).length,
  };
}

export type PaidProExecutionBlockInvariantResult = {
  executionBlockCount: number;
  witnessClauseCount: number;
  partyHeadingCount: number;
  ok: boolean;
  violations: string[];
};

/** True when By/Name signer fields are collapsed on one line (malformed), not valid multi-line blocks. */
export function tailHasCollapsedInlineSignerFields(tail: string): boolean {
  return tail.split("\n").some((line) => {
    const compact = line.replace(/\s+/g, " ").trim();
    return /By\s*:(?:\s|_)+Name\s*:/i.test(compact);
  });
}

export function countPaidProExecutionBlocks(text: string): number {
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return 0;
  const witnesses = (body.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
  if (witnesses > 0) return witnesses;
  const regionStart = findSignatureRegionStart(body);
  if (regionStart < 0) return 0;
  const headings = countSignatureBlockHeadingsInTail(body);
  return headings >= 1 ? 1 : 0;
}

export function analyzePaidProExecutionBlockInvariant(
  text: string,
  opts?: { expectedParties?: number },
): PaidProExecutionBlockInvariantResult {
  const expectedParties = opts?.expectedParties ?? 2;
  const violations: string[] = [];
  const executionBlockCount = countPaidProExecutionBlocks(text);
  const witnessClauseCount = (text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
  const partyHeadingCount = countSignatureBlockHeadingsInTail(text);
  const sections = countCompletePartySignatureSections(text);

  if (executionBlockCount === 0) {
    violations.push("execution_block_missing");
  } else if (executionBlockCount > 1) {
    violations.push(`execution_block_duplicate:${executionBlockCount}`);
  }
  if (sections.witnessBlocks > 1) {
    violations.push(`witness_clause_duplicate:${sections.witnessBlocks}`);
  }
  if (expectedParties === 2 && sections.clientWithBy > 1) {
    violations.push(`client_signature_section_duplicate:${sections.clientWithBy}`);
  }
  if (expectedParties === 2 && sections.serviceProviderWithBy > 1) {
    violations.push(
      `service_provider_signature_section_duplicate:${sections.serviceProviderWithBy}`,
    );
  }
  if (expectedParties === 2 && sections.clientHeadings > 1) {
    violations.push(`client_heading_duplicate:${sections.clientHeadings}`);
  }
  if (expectedParties === 2 && sections.serviceProviderHeadings > 1) {
    violations.push(`service_provider_heading_duplicate:${sections.serviceProviderHeadings}`);
  }
  if (expectedParties >= 3) {
    const tailStart = signaturePatchStartIndex(text);
    const tail = tailStart >= 0 ? text.slice(tailStart) : text.slice(Math.floor(text.length * 0.72));
    const witnessFirstLine = tail.split("\n")[0] ?? "";
    if (/\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(tail)) {
      violations.push("two_party_role_fallback");
    }
    if (sections.clientHeadings >= 1) {
      violations.push(`client_heading_fallback:${sections.clientHeadings}`);
    }
    if (sections.serviceProviderHeadings >= 1) {
      violations.push(`service_provider_heading_duplicate:${sections.serviceProviderHeadings}`);
    }
    if (
      /\bIN WITNESS WHEREOF\b/i.test(witnessFirstLine) &&
      (/\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(witnessFirstLine) || /\bBy\s*:/i.test(witnessFirstLine))
    ) {
      violations.push("inline_witness_collapsed");
    }
    if (tailHasCollapsedInlineSignerFields(tail)) {
      violations.push("inline_signer_fields");
    }
  }
  if (sections.legacyEntitySignatureLines > 0) {
    violations.push(`legacy_entity_signature_lines:${sections.legacyEntitySignatureLines}`);
  }

  return {
    executionBlockCount,
    witnessClauseCount,
    partyHeadingCount,
    ok: violations.length === 0 && executionBlockCount === 1,
    violations,
  };
}

export function assertPaidProSingleExecutionBlock(
  text: string,
  surface: string,
  opts?: { expectedParties?: number },
): void {
  const result = analyzePaidProExecutionBlockInvariant(text, opts);
  if (result.ok) return;
  const msg = `[paid-pro-execution-block-invariant] surface=${surface} ${result.violations.join("; ")}`;
  if (import.meta.env?.MODE === "test") {
    throw new Error(msg);
  }
  // eslint-disable-next-line no-console
  console.error(msg, result);
}

/** Corpus already carries a single authoritative execution block (witness or signature tail). */
export function paidProCorpusHasAuthoritativeExecutionBlock(
  text: string,
  partyCount = 2,
): boolean {
  if (countPaidProExecutionBlocks(text) !== 1) return false;
  return (
    corpusHasWitnessBlock(text) ||
    corpusSignatureBlocksHaveRequiredByLines(text, partyCount)
  );
}

/**
 * When the corpus already carries an authoritative execution block, forbid synthesis,
 * rebuild, append, decorative PDF cards, and duplicate repair tails.
 */
export function forbidPaidProExecutionBlockSynthesis(
  corpus: string,
  partyCount = 2,
): boolean {
  return paidProCorpusHasAuthoritativeExecutionBlock(corpus, partyCount);
}

export function logPaidProExecutionBlockSynthesisBlocked(payload: {
  surface: string;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-execution-block-synthesis-blocked]", payload);
}
