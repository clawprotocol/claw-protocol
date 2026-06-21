/**
 * Paid Pro final review render corpus — same sanitized body as copy/export, plus render-time guards.
 */

import {
  applyCanonicalPartyLegalNamesToSigningCorpus,
  corpusContainsFusedPartyLegalName,
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
} from "./canonicalPartyLegalNameSanitizer";
import {
  canonicalPartyRecordsFromSignerIdentities,
} from "./canonicalPartyIdentityResolver";
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import { repairDuplicateAgreementOpening } from "./canonicalPartyIdentityResolver";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { preserveFullLegalPartyNamesInOpeningAndSignatures } from "./paidProPartyNamePreserve";
import { repairProtectedLegalEntitySuffixes } from "./paidProProtectedEntityRepair";
import { ensureOperativeIfToNoticeDelivery, repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  authorityPartiesToCanonicalPartyIdentities,
  mergeLabeledPartyAuthorityIntoParties,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProUnifiedSurfaceCorpus } from "./paidProAgreementAuthorityChain";
import {
  resolvePaidProFinalHydratedCorpusForSurface,
  type PaidProFinalHydratedCorpusSource,
} from "./paidProFinalHydratedCorpus";
import {
  resolvePartiesForReviewRender,
  type ResolvePaidProReviewRenderPartiesArgs,
} from "./paidProReviewRenderParties";
import { SIGNATURE_DATE_BLANK_LINE } from "./guidedDealCompletion/signerPartyIdentity";
import { repairSignatureNameLinesUsingLegalEntity } from "./paidProSignatureNameLineRepair";

export { repairSignatureNameLinesUsingLegalEntity } from "./paidProSignatureNameLineRepair";
import { isFusedOrConcatenatedPartyLegalName } from "./signerSetupPartyIdentity";
import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import { repairPaidProSignatureSectionOrdering } from "./paidProSignatureSectionOrdering";
import { normalizePaidProOrphanSubsections } from "./normalizePaidProOrphanSubsections";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { applyContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";
import { applyPaidProUserVisibleDisplayPrep } from "./paidProDisplayPlainAuthority";
import { applyPaidProSignerMetadataMergeGate } from "./paidProSignerMetadataMergeGate";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { applySignerPartyIdentityToAuthoritativeAgreement } from "./guidedDealCompletion/signerPartyIdentity";
import {
  fillPaidProSignatureNoticeFieldsAfterExecutionRepair,
  finalizePaidProSigningCorpusText,
} from "./paidProSignerSigningCorpusHygiene";
import {
  paidProSignerStagingDisplayUsesFrozenCorpus,
  readPaidProSignerStagingDisplayCorpus,
  resolvePaidProSignerStagingDisplayPlain,
  buildPaidProSignerStagingOverlayCacheKey,
} from "./paidProSignerStagingDisplayCorpus";
import {
  resolvePaidProAuthoritativeDisplayPlain,
  shouldUsePaidProSourceOfTruthDisplayOnly,
} from "./paidProAuthoritativeRenderGate";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { tracePaidProQaPassText } from "./paidProQaPerfTrace";
import {
  buildPaidProReviewPlainMemoKey,
  readMemoizedPaidProReviewPlain,
  writeMemoizedPaidProReviewPlain,
} from "./paidProVisibleRenderMemo";
import { auditPaidProReviewRenderCorpus } from "./paidProCorpusLifecycleDiff";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  logExecutionBlockCount,
  logExecutionBlockLocation,
  logPostFreezeCorpusDrift,
} from "./paidProExecutionBlockInstrumentation";
import {
  consumedAuthoritySignerMetadataComplete,
  isPaidProPostFinalizeHydratedCorpusLocked,
  paidProReviewRenderNeedsSignerExecutionOverlay,
  shouldApplyExecutionBlockSignerOverlay,
  shouldHydratePaidProReviewSurfacesFromConsumedAuthority,
} from "./paidProSignerMetadataCommitPolicy";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "./paidProExecutionBlockEntityHeading";
import { applyPaidProSoTSignerExecutionOverlay } from "./paidProSoTSignerExecutionOverlay";
import { sanitizePaidProDomainScopeContamination } from "./paidProDomainScopeGuard";

const LABELED_SIGNATURE_BLOCK_START =
  /^(?:CLIENT|SERVICE PROVIDER|PROVIDER|CONTRACTOR|COMPANY|PARTY\s+\d+)\s*:/i;

const ENTITY_SUFFIX_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

const RECITAL_LINE_RE =
  /^(?:this\s+(?:agreement|mutual|consulting)|between\s+.+\s+and\s+)/i;

export type PaidProReviewRenderSource =
  | PaidProFinalHydratedCorpusSource
  | "paid_pro_review_render"
  | "paidProSourceOfTruth"
  | "none";

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

function normLegalNames(
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: { intakeText?: string | null; draftPartyNames?: readonly string[] | null },
): string[] {
  return authorityPartiesToCanonicalPartyIdentities(parties, roleContext)
    .map((id) => id.partyDisplayName.trim())
    .filter((n) => n.length >= 2);
}

/** Remove a lone legal-entity line between the title and the opening recital. */
export function stripStrayStandalonePartyEntityLinesBeforeRecital(
  corpus: string,
  legalNames: readonly string[],
): { text: string; removed: number } {
  if (/MUTUAL\s+CONSULTING[\s\S]{0,1_600}entered\s+into\s+as\s+of/i.test(corpus || "")) {
    return { text: corpus, removed: 0 };
  }
  const legalLower = new Set(legalNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (!legalLower.size) return { text: corpus, removed: 0 };

  const lines = (corpus || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let removed = 0;
  let seenRecital = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (
      RECITAL_LINE_RE.test(trimmed) ||
      /^\d+\.\s+\w/.test(trimmed) ||
      /entered\s+into\s+as\s+of/i.test(trimmed)
    ) {
      seenRecital = true;
    }
    if (
      !seenRecital &&
      trimmed.length >= 4 &&
      trimmed.length < 140 &&
      ENTITY_SUFFIX_LINE_RE.test(trimmed) &&
      legalLower.has(trimmed.toLowerCase()) &&
      !RECITAL_LINE_RE.test(trimmed)
    ) {
      const nextMeaningful = lines.slice(i + 1).find((l) => l.trim().length > 0)?.trim() ?? "";
      if (
        RECITAL_LINE_RE.test(nextMeaningful) ||
        /^MUTUAL\s+/i.test(nextMeaningful) ||
        /^THIS\s+/i.test(nextMeaningful)
      ) {
        removed += 1;
        continue;
      }
    }
    out.push(line);
  }

  if (removed === 0) return { text: corpus, removed: 0 };
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), removed };
}

/** Force signature Date lines blank for review (execution-time population only). */
export function ensureSignatureDateLinesBlank(corpus: string): { text: string; repairs: number } {
  let repairs = 0;
  const text = (corpus || "").replace(/\r\n/g, "\n").replace(
    /^(\s*)Date:\s*(?!_{4,})(.+)$/gim,
    (_m, indent, value) => {
      const trimmed = value.trim();
      const hasCalendar =
        /\d{1,2}[\/\-]|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b20\d{2}\b/i.test(
          trimmed,
        );
      if (!trimmed || /_{4,}/.test(trimmed)) return _m;
      if (hasCalendar || trimmed.length > 0) {
        repairs += 1;
        return `${indent}${SIGNATURE_DATE_BLANK_LINE}`;
      }
      return _m;
    },
  );
  return { text, repairs };
}

function isLegacyEntityInlineSignatureLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 220) return false;
  if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:/i.test(trimmed)) return false;
  return /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited)\s+Signature:\s*_{1,}\s*Date:\s*_{1,}\s*$/i.test(
    trimmed,
  );
}

/** Strip free/simple trailing "Entity LLC Signature: ___ Date: ___" lines after authoritative blocks. */
export function stripTrailingLegacyEntitySignatureLines(corpus: string): { text: string; removed: number } {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const patchIdx = signaturePatchStartIndex(corpus);
  const tailStart = witnessIdx >= 0 ? witnessIdx : patchIdx >= 0 ? patchIdx : -1;
  if (tailStart < 0) return { text: corpus, removed: 0 };

  const prefix = corpus.slice(0, tailStart);
  const tailLines = corpus.slice(tailStart).split("\n");
  let removed = 0;
  const kept: string[] = [];
  for (const line of tailLines) {
    if (isLegacyEntityInlineSignatureLine(line)) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) return { text: corpus, removed: 0 };
  const tail = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  return { text: `${prefix}${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd(), removed };
}

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

export { consumedAuthoritySignerMetadataComplete, shouldHydratePaidProReviewSurfacesFromConsumedAuthority } from "./paidProSignerMetadataCommitPolicy";

function hydrateTextWhenSignerMetadataComplete(
  text: string,
  parties: readonly PaidProSignerMetadataParty[],
  intakeText: string,
): string {
  if (!shouldHydratePaidProReviewSurfacesFromConsumedAuthority(parties)) return text;
  if (!consumedAuthoritySignerMetadataComplete(parties)) return text;
  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (!authority) return text;
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: text,
    authority,
    intakeRaw: intakeText,
    surface: "paid_pro_review_render_hydrate",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  return hydrated.rejected ? text : hydrated.corpus;
}

export {
  resolvePartiesForReviewRender,
  type ResolvePaidProReviewRenderPartiesArgs,
} from "./paidProReviewRenderParties";

export function applyPaidProReviewRenderSanitizer(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repaired: boolean } {
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      if (!detectExecutionHeadingMetadataLeak(locked).leak) {
        return { text: locked, repaired: false };
      }
      const repaired = repairExecutionBlockEntityHeadingLines(locked, parties);
      return { text: repaired.text, repaired: repaired.repairs.length > 0 };
    }
  }
  const ctx: PaidProPartyRoleContext = {
    ...roleContext,
    acceptedCorpus: roleContext?.acceptedCorpus ?? corpus,
  };
  const identities = authorityPartiesToCanonicalPartyIdentities(parties, ctx);
  const legalNames = normLegalNames(parties, ctx);
  let text = (corpus || "").replace(/\r\n/g, "\n").trimEnd();
  let repaired = false;

  if (legalNames.length >= 2) {
    const stray = stripStrayStandalonePartyEntityLinesBeforeRecital(text, legalNames);
    if (stray.removed > 0) {
      text = stray.text;
      repaired = true;
    }
    const records = canonicalPartyRecordsFromSignerIdentities(identities);
    const dupOpen = repairDuplicateAgreementOpening(text, records);
    if (dupOpen.repairs.length > 0) {
      text = dupOpen.text;
      repaired = true;
    }
    const recital = repairMalformedPaidProAgreementRecital(text, parties);
    if (recital.repairs.length > 0) {
      text = recital.text;
      repaired = true;
    }
  }

  if (parties.length >= 2) {
    const canonical = applyCanonicalPartyLegalNamesToSigningCorpus(text, parties, ctx);
    if (canonical.repaired) {
      text = canonical.text;
      repaired = true;
    }
    const legacySig = stripTrailingLegacyEntitySignatureLines(text);
    if (legacySig.removed > 0) {
      text = legacySig.text;
      repaired = true;
    }
    const dedupe = stripDuplicateLegacySignatureBlocksAfterAuthoritative(text, parties);
    if (dedupe.removed > 0) {
      text = dedupe.text;
      repaired = true;
    }
  }

  if (identities.length >= 2) {
    const nameRepair = repairSignatureNameLinesUsingLegalEntity(text, identities);
    if (nameRepair.repairs > 0) {
      text = nameRepair.text;
      repaired = true;
    }
  }

  const dates = ensureSignatureDateLinesBlank(text);
  if (dates.repairs > 0) {
    text = dates.text;
    repaired = true;
  }

  if (legalNames.length >= 2) {
    const entityRepair = repairProtectedLegalEntitySuffixes(text, legalNames, ctx?.intakeText ?? null);
    if (entityRepair.repairs > 0) {
      text = entityRepair.text;
      repaired = true;
    }
    const preserved = preserveFullLegalPartyNamesInOpeningAndSignatures(
      text,
      legalNames,
      ctx?.intakeText ?? null,
    );
    if (preserved !== text) {
      text = preserved;
      repaired = true;
    }
  }

  if (parties.length >= 2) {
    const noticeRepair = repairIncompleteIfToNoticeStanzas(text, parties);
    if (noticeRepair.repairs.length > 0) {
      text = noticeRepair.text;
      repaired = true;
    }
  }

  const guarded = guardPaidProReviewRenderCorpus(text, parties);
  let out = guarded.text.trimEnd() + (guarded.text.endsWith("\n") ? "" : "\n");
  if (parties.length >= 2) {
    const mergeGated = applyPaidProSignerMetadataMergeGate({
      corpus: out,
      parties,
      canonicalPartyCount: parties.length,
      roleContext: ctx,
    });
    if (mergeGated.repairs.length > 0) {
      out = mergeGated.text;
      repaired = true;
    }
  }
  if (parties.length >= 2) {
    const records = canonicalPartyRecordsFromSignerIdentities(identities);
    if (records.length >= 2) {
      out = ensurePaidProServicesAgreementOpening(out, records, ctx?.intakeText ?? null).text;
    }
  }
  const execution = enforcePaidProSingleExecutionBlock(out, {
    authorityParties: parties,
    intakeText: ctx?.intakeText ?? null,
    draftPartyNames: ctx?.draftPartyNames ?? parties.map((p) => p.partyLegalName),
  });
  if (execution.text !== out) {
    out = execution.text;
    repaired = true;
  }
  if (parties.length >= 2) {
    const entityLines = repairExecutionBlockEntityHeadingLines(out, parties);
    if (entityLines.repairs.length > 0) {
      out = entityLines.text;
      repaired = true;
    }
  }
  const finalized = finalizePaidProSigningCorpusText(out, parties, ctx);
  if (finalized.text !== out) {
    out = finalized.text;
    repaired = true;
  }

  const providerLabel = parties[1]?.partyLegalName || parties[0]?.partyLegalName || "Service Provider";
  const clientLabel = parties[0]?.partyLegalName || "Client";
  const domainGuard = sanitizePaidProDomainScopeContamination(out, ctx?.intakeText ?? null, {
    providerLabel,
    clientLabel,
    logSurface: "review_render_sanitizer",
  });
  if (domainGuard.repairs.length > 0) {
    out = domainGuard.text;
    repaired = true;
  }

  if (parties.length >= 2) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(out, parties);
    if (noticeDelivery.repairs.length > 0) {
      out = noticeDelivery.text;
      repaired = true;
    }
  }

  return {
    text: out,
    repaired: repaired || guarded.repaired,
  };
}

/** Hard render-time guard: repair fused party legal names before review HTML/display. */
let fusedPartyRepairCache: { inputHash: string; text: string } | null = null;

export function clearPaidProReviewRenderFusedRepairCache(): void {
  fusedPartyRepairCache = null;
}

export function guardPaidProReviewRenderCorpus(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
): { text: string; repaired: boolean; warned: boolean } {
  const input = (corpus || "").replace(/\r\n/g, "\n").trimEnd();
  if (!input) return { text: "", repaired: false, warned: false };

  const inputHash = hashPaidProCorpus(input);
  if (fusedPartyRepairCache?.inputHash === inputHash) {
    return { text: fusedPartyRepairCache.text, repaired: false, warned: false };
  }

  const sigOrder = repairPaidProSignatureSectionOrdering(input);
  let text = sigOrder.text;
  let repaired = sigOrder.repairs.length > 0;

  const orphanSubs = normalizePaidProOrphanSubsections(text, {
    source: "paid_pro_review_render_guard",
  });
  if (orphanSubs.orphanSectionsRepaired > 0) {
    text = orphanSubs.text;
    repaired = true;
  }

  const orphanSectionNumbers = repairPaidProOrphanSectionNumbers(text);
  if (orphanSectionNumbers.repairs.length > 0) {
    text = orphanSectionNumbers.text;
    repaired = true;
  }

  const structure = applySectionStructureIntegrity(text, { source: "paid_pro_review_render_guard" });
  if (structure.repaired) {
    text = structure.text;
    repaired = true;
  }

  const contactAuthority = applyContactAuthorityExecutionBlockIntegrity(text, {
    source: "paid_pro_review_render_guard",
    ensureNoticesClause: false,
  });
  if (contactAuthority.repaired) {
    text = contactAuthority.text;
    repaired = true;
  }

  const authParties = parties ?? readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  if (!corpusContainsFusedPartyLegalName(text)) {
    fusedPartyRepairCache = { inputHash, text };
    return { text, repaired, warned: false };
  }

  if (authParties.length >= 2) {
    const canonical = applyCanonicalPartyLegalNamesToSigningCorpus(text, authParties);
    text = canonical.text;
    repaired = canonical.repaired || repaired;
    const recital = repairMalformedPaidProAgreementRecital(text, authParties);
    text = recital.text;
    repaired = recital.repairs.length > 0 || repaired;
    const legacySig = stripTrailingLegacyEntitySignatureLines(text);
    text = legacySig.text;
    repaired = legacySig.removed > 0 || repaired;
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

  fusedPartyRepairCache = { inputHash, text };
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

export type ResolvePaidProReviewRenderPlainArgs = ResolvePaidProReviewRenderPartiesArgs & {
  /** When true, return frozen SoT/review corpus without signer-driven repair or opening guards. */
  deferSignerMetadataRepair?: boolean;
  /** VS01 / transport paths — skip display-only section prep. */
  skipUserVisibleDisplayPrep?: boolean;
};

function paidProPartyRoleContextFromArgs(
  args?: ResolvePaidProReviewRenderPlainArgs,
  acceptedCorpus?: string | null,
): { intakeText?: string | null; draftPartyNames?: readonly string[] | null; acceptedCorpus?: string | null } {
  return {
    intakeText: args?.intakeText ?? null,
    draftPartyNames:
      args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
    acceptedCorpus: acceptedCorpus ?? null,
  };
}

export function resolvePaidProReviewRenderSource(
  args?: ResolvePaidProReviewRenderPlainArgs,
): { source: PaidProReviewRenderSource; hash: string; signerMetadataApplied: boolean } {
  const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  if (hydrated.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      source: hydrated.source,
      hash: hydrated.hash,
      signerMetadataApplied: hydrated.signerMetadataApplied,
    };
  }
  if (hasPaidProSourceOfTruth()) {
    const raw = getPaidProSourceOfTruthText();
    if (raw.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return {
        source: "paid_pro_review_render",
        hash: hashPaidProCorpus(raw),
        signerMetadataApplied: false,
      };
    }
  }
  return { source: "none", hash: "", signerMetadataApplied: false };
}

/**
 * Canonical plain corpus for review HTML — same resolver path as Copy Agreement + render guards.
 */
function finalizePaidProReviewRenderPlain(
  text: string,
  args?: ResolvePaidProReviewRenderPlainArgs,
): string {
  const parties = resolvePartiesForReviewRender(args);
  if (parties.length < 2) return text.trim();
  const roleContext = paidProPartyRoleContextFromArgs(args);
  const records = canonicalPartyRecordsFromSignerIdentities(
    authorityPartiesToCanonicalPartyIdentities(parties, roleContext),
  );
  if (records.length < 2) return text.trim();
  let out = text;
  if (parties.length >= 2) {
    out = stripTrailingLegacyEntitySignatureLines(out).text;
  }
  return ensurePaidProServicesAgreementOpening(out, records, args?.intakeText ?? null).text.trim();
}

function alignExecutionBlockRolesFromAcceptedCorpus(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) return locked;
  }
  const intake = roleContext?.intakeText ?? "";
  const hydrationParties = mergeLabeledPartyAuthorityIntoParties(parties ?? [], intake);
  const canOverlay = shouldApplyExecutionBlockSignerOverlay({
    parties: hydrationParties,
    intakeText: intake,
    corpusText: corpus,
  });
  if (shouldUsePaidProSourceOfTruthDisplayOnly()) {
    if (!hydrationParties.length || !canOverlay) {
      return corpus;
    }
    return applyPaidProSoTSignerExecutionOverlay(corpus, hydrationParties, roleContext);
  }
  if (!hydrationParties.length || !shouldHydratePaidProReviewSurfacesFromConsumedAuthority(hydrationParties)) {
    if (canOverlay) {
      return applyPaidProSoTSignerExecutionOverlay(corpus, hydrationParties, roleContext);
    }
    return corpus;
  }
  let text = enforcePaidProSingleExecutionBlock(corpus, {
    authorityParties: hydrationParties,
    intakeText: intake || null,
    draftPartyNames: roleContext?.draftPartyNames ?? hydrationParties.map((p) => p.partyLegalName),
  }).text;
  if (hydrationParties.length >= 2) {
    text = fillPaidProSignatureNoticeFieldsAfterExecutionRepair(text, hydrationParties, roleContext).text;
    const identities = authorityPartiesToCanonicalPartyIdentities(hydrationParties, roleContext);
    const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
      text,
      identities,
      roleContext?.intakeText ?? "",
      { signatureRegionOnly: true },
    );
    if (!identityApply.rejected) {
      text = identityApply.text;
    }
  }
  return text;
}

export function resolvePaidProReviewRenderPlain(
  args?: ResolvePaidProReviewRenderPlainArgs,
): string {
  const surface = "paid_pro_review_render_plain";
  const finishUserVisiblePlain = (plain: string): string => {
    const body = (plain || "").trim();
    if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return body;
    if (args?.skipUserVisibleDisplayPrep) return body;
    return applyPaidProUserVisibleDisplayPrep(body);
  };
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      const visible = finishUserVisiblePlain(locked);
      auditPaidProReviewRenderCorpus(visible);
      auditPaidProReviewRenderSotParity({ reviewPlain: visible, surface: "paid_pro_post_finalize_locked" });
      return visible;
    }
  }
  const partiesForRender = resolvePartiesForReviewRender(args);
  const needsSignerOverlay = paidProReviewRenderNeedsSignerExecutionOverlay({
    deferSignerMetadataRepair: args?.deferSignerMetadataRepair,
    parties: partiesForRender,
    intakeText: args?.intakeText ?? null,
  });
  const signerOverlayKey = buildPaidProSignerStagingOverlayCacheKey(partiesForRender);
  const seedForMemo = shouldUsePaidProSourceOfTruthDisplayOnly() && !needsSignerOverlay
    ? getPaidProSourceOfTruthText().trim()
    : args?.deferSignerMetadataRepair &&
        paidProSignerStagingDisplayUsesFrozenCorpus(signerOverlayKey)
      ? (readPaidProSignerStagingDisplayCorpus()?.plain ?? getPaidProSourceOfTruthText().trim())
      : hasPaidProSourceOfTruth()
        ? getPaidProSourceOfTruthText().trim()
        : "";
  const memoKey = buildPaidProReviewPlainMemoKey(seedForMemo, surface);
  const memoHit = readMemoizedPaidProReviewPlain(memoKey);
  if (memoHit != null && !needsSignerOverlay) {
    return finishUserVisiblePlain(
      normalizePaidProOrphanSubsections(memoHit, { source: `${surface}:memo` }).text,
    );
  }

  let rendered: string;
  if (shouldUsePaidProSourceOfTruthDisplayOnly() && !needsSignerOverlay) {
    rendered = tracePaidProQaPassText(
      "resolvePaidProReviewRenderPlain",
      `${surface}:display_only_sot`,
      seedForMemo,
      () => resolvePaidProAuthoritativeDisplayPlain(args),
    );
    logPostFreezeCorpusDrift({
      surface: "paid_pro_review_render",
      renderedText: rendered,
      mutationSource: "signer_identity_apply",
    });
    logExecutionBlockLocation(rendered, "paid_pro_review_render");
    logExecutionBlockCount(rendered, "paid_pro_review_render");
  } else if (
    args?.deferSignerMetadataRepair &&
    paidProSignerStagingDisplayUsesFrozenCorpus(signerOverlayKey) &&
    !needsSignerOverlay
  ) {
    rendered = tracePaidProQaPassText("resolvePaidProReviewRenderPlain", `${surface}:frozen`, seedForMemo, () => seedForMemo);
  } else {
    const seed = seedForMemo;
    rendered = tracePaidProQaPassText("resolvePaidProReviewRenderPlain", surface, seed, () =>
      resolvePaidProSignerStagingDisplayPlain({
        stagingActive: Boolean(args?.deferSignerMetadataRepair),
        signerOverlayKey,
        resolveFresh: () => {
          const parties = resolvePartiesForReviewRender(args);
          const roleContext = paidProPartyRoleContextFromArgs(args);
          const inner = alignExecutionBlockRolesFromAcceptedCorpus(
            resolvePaidProReviewRenderPlainInner(args),
            parties,
            roleContext,
          );
          if (args?.deferSignerMetadataRepair) return inner.trim();
          return finalizePaidProReviewRenderPlain(inner, args);
        },
      }),
    );
  }
  if (!needsSignerOverlay) {
    writeMemoizedPaidProReviewPlain(memoKey, rendered);
  }
  const visible = finishUserVisiblePlain(rendered);
  if (visible.length >= 200 && hasPaidProSourceOfTruth()) {
    auditPaidProReviewRenderCorpus(visible);
    auditPaidProReviewRenderSotParity({ reviewPlain: visible, surface: "paid_pro_review_render_plain" });
  }
  return visible;
}

function resolvePaidProReviewRenderPlainInner(
  args?: ResolvePaidProReviewRenderPlainArgs,
): string {
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) return locked;
  }
  if (args?.deferSignerMetadataRepair) {
    const unified = resolvePaidProUnifiedSurfaceCorpus();
    if (unified && unified.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return unified.text.trim();
    }
    const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", {
      draft: args?.draft ?? null,
      intakeText: args?.intakeText ?? null,
    });
    if (hydrated.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return hydrated.text.trim();
    }
    if (hasPaidProSourceOfTruth()) {
      return getPaidProSourceOfTruthText().trim();
    }
    return "";
  }

  const unified = resolvePaidProUnifiedSurfaceCorpus();
  const acceptedCorpusSeed =
    unified?.text?.trim() ||
    (hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim() : "");
  const roleContext = paidProPartyRoleContextFromArgs(args, acceptedCorpusSeed || null);
  if (unified && unified.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    const parties = resolvePartiesForReviewRender(args);
    const shouldSanitize =
      parties.length >= 2 &&
      (unified.layer === "execution" || shouldHydratePaidProReviewSurfacesFromConsumedAuthority(parties));
    if (shouldSanitize) {
      const intakeText = (args?.intakeText ?? "").trim();
      const hydratedBase = hydrateTextWhenSignerMetadataComplete(unified.text, parties, intakeText);
      return applyPaidProReviewRenderSanitizer(hydratedBase, parties, roleContext).text.trim();
    }
    if (parties.length >= 2) {
      return guardPaidProReviewRenderCorpus(unified.text, parties).text.trim();
    }
    return unified.text.trim();
  }

  const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });

  let text = "";
  if (hydrated.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    text = hydrated.text;
  } else if (hasPaidProSourceOfTruth()) {
    text = getPaidProSourceOfTruthText().trim();
  }

  if (text.length < PAID_PRO_AUTHORITY_MIN_LEN) return "";

  const parties = resolvePartiesForReviewRender(args);
  const shouldSanitize =
    parties.length >= 2 && shouldHydratePaidProReviewSurfacesFromConsumedAuthority(parties);
  if (shouldSanitize) {
    const intakeText = (args?.intakeText ?? "").trim();
    const hydratedBase = hydrateTextWhenSignerMetadataComplete(text, parties, intakeText);
    return applyPaidProReviewRenderSanitizer(hydratedBase, parties, roleContext).text.trim();
  }
  if (parties.length >= 2) {
    const legacy = stripTrailingLegacyEntitySignatureLines(text);
    text = legacy.text;
    return guardPaidProReviewRenderCorpus(text, parties).text.trim();
  }

  return text.trim();
}

export function assertPaidProReviewRenderParity(args: {
  reviewPlain: string;
  copyPlain: string;
}): void {
  const review = args.reviewPlain.trim();
  const copy = args.copyPlain.trim();
  if (!review || !copy) return;
  if (review === copy) return;
  if (corpusContainsFusedPartyLegalName(review) || corpusContainsFusedPartyLegalName(copy)) {
    throw new Error("fused_party_legal_name_in_review_or_copy");
  }
  const reviewHash = hashPaidProCorpus(review);
  const copyHash = hashPaidProCorpus(copy);
  if (reviewHash !== copyHash && Math.abs(review.length - copy.length) > 48) {
    throw new Error(`review_copy_corpus_drift review=${review.length} copy=${copy.length}`);
  }
}
