/**
 * VS01 signing packet: authoritative corpus selection, witness-block repair, and seed gating.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  pickAuthoritativePlainForSendHandoff,
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
} from "../components/agreements/sendHandoffAuthoritativeCorpus";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../components/agreements/simpleProFinalReviewCorpus";
import { stripStaleExecutionPlacementCorpusCopy } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  isIndividualPartyName,
  rebuildSignatureBlocksWithPartyIdentities,
  type CanonicalPartyIdentity,
} from "../components/agreements/guidedDealCompletion/signerPartyIdentity";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";

export const VS01_SIGNING_CORPUS_MIN_LEN = GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
/** Short preview / starter bodies must never drive guided Pro VS01 seeding. */
export const VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN = 1200;

export type Vs01SigningCorpusSource =
  | "handoff_corpus"
  | "draft_authoritative"
  | "rebuilt_witness_block"
  | "blocked_short_preview";

export type Vs01SigningCorpusResolution = {
  corpus: string;
  source: Vs01SigningCorpusSource;
  len: number;
  hash: string;
  hasWitnessBlock: boolean;
  hasByOrSignatureLines: boolean;
  signerCount: number;
  isFreeHashMatch: boolean;
  allowed: boolean;
  blockReason?: string;
};

export function logVs01SigningCorpusSource(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signing-corpus-source]", payload);
}

export function logVs01SigningCorpusRebuilt(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signing-corpus-rebuilt]", payload);
}

export function logVs01SigningCorpusBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-signing-corpus-blocked]", payload);
}

export function pickDraftSigningCorpusPlain(draft: AgreementDraft | null | undefined): string {
  return pickAuthoritativePlainForSendHandoff(draft)?.text ?? "";
}

export function identitiesFromBridgeSession(bridge: AgreementVs01BridgeSession): CanonicalPartyIdentity[] {
  const out: CanonicalPartyIdentity[] = [
    {
      index: 0,
      partyDisplayName: bridge.creatorName.trim() || "Client",
      email: bridge.creatorEmail.trim(),
      representativeName: bridge.creatorSignerName?.trim() || null,
      title: bridge.creatorSignerTitle?.trim() || null,
      blockHeading: "CLIENT",
      isIndividual: isIndividualPartyName(bridge.creatorName),
    },
  ];
  for (const [i, cp] of bridge.counterparties.entries()) {
    const name = cp.name.trim() || `Party ${i + 2}`;
    out.push({
      index: i + 1,
      partyDisplayName: name,
      email: cp.email.trim(),
      representativeName: cp.signerName?.trim() || null,
      title: cp.signerTitle?.trim() || null,
      blockHeading: i === 0 ? "SERVICE PROVIDER" : `PARTY ${i + 2}`,
      isIndividual: isIndividualPartyName(name),
    });
  }
  return out;
}

export function ensureVs01SigningCorpusWitnessBlock(args: {
  corpus: string;
  bridge: AgreementVs01BridgeSession | null;
  signerCount: number;
}): { corpus: string; rebuilt: boolean; beforeLen: number; afterLen: number } {
  const beforeLen = args.corpus.trim().length;
  let out = stripStaleExecutionPlacementCorpusCopy(args.corpus.trim()).text;
  const signerCount = Math.max(1, args.signerCount);
  if (
    args.bridge &&
    signerCount >= 2 &&
    !corpusSignatureBlocksHaveRequiredByLines(out, signerCount)
  ) {
    const identities = identitiesFromBridgeSession(args.bridge);
    if (identities.length >= 2) {
      const rebuilt = rebuildSignatureBlocksWithPartyIdentities(out, identities);
      out = stripStaleExecutionPlacementCorpusCopy(rebuilt.text).text;
      return {
        corpus: out,
        rebuilt: true,
        beforeLen,
        afterLen: out.length,
      };
    }
  }
  return { corpus: out, rebuilt: false, beforeLen, afterLen: out.length };
}

export function resolveVs01SigningCorpusForHandoff(args: {
  agreementCorpusText?: string | null;
  draft?: AgreementDraft | null;
  bridge?: AgreementVs01BridgeSession | null;
  guidedPro?: boolean;
  freeBaselinePlain?: string | null;
}): Vs01SigningCorpusResolution {
  const guidedPro = args.guidedPro !== false;
  const handoff = (args.agreementCorpusText ?? "").trim();
  const draftPlain = pickDraftSigningCorpusPlain(args.draft ?? null);
  const signerCount = Math.max(
    2,
    1 + (args.bridge?.counterparties?.length ?? args.draft?.parties?.length ?? 1),
  );

  const candidates: { source: Vs01SigningCorpusSource; text: string }[] = [];
  if (handoff.length > 0) candidates.push({ source: "handoff_corpus", text: handoff });
  if (draftPlain.length > 0) candidates.push({ source: "draft_authoritative", text: draftPlain });

  let best =
    candidates.sort((a, b) => b.text.length - a.text.length)[0] ??
    ({ source: "blocked_short_preview" as const, text: "" });

  if (guidedPro && best.text.length < VS01_SIGNING_CORPUS_MIN_LEN && draftPlain.length > best.text.length) {
    best = { source: "draft_authoritative", text: draftPlain };
  }

  if (
    guidedPro &&
    best.text.length > 0 &&
    best.text.length <= VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN &&
    draftPlain.length >= VS01_SIGNING_CORPUS_MIN_LEN
  ) {
    best = { source: "draft_authoritative", text: draftPlain };
  }

  const witness = ensureVs01SigningCorpusWitnessBlock({
    corpus: best.text,
    bridge: args.bridge ?? null,
    signerCount,
  });
  const corpus = witness.corpus;
  const source: Vs01SigningCorpusSource = witness.rebuilt ? "rebuilt_witness_block" : best.source;
  if (witness.rebuilt) {
    logVs01SigningCorpusRebuilt({
      reason: "missing_witness_or_by_lines",
      beforeLen: witness.beforeLen,
      afterLen: witness.afterLen,
      hasWitnessBlock: corpusHasVisibleSignatureExecutionLines(corpus),
    });
  }

  const hash = fingerprintAgreementBody(corpus);
  const freeHash = (args.freeBaselinePlain ?? "").trim()
    ? fingerprintAgreementBody(args.freeBaselinePlain!)
    : "";
  const isFreeHashMatch = Boolean(freeHash && hash === freeHash);
  const hasWitnessBlock = corpusHasVisibleSignatureExecutionLines(corpus);
  const hasByOrSignatureLines = corpusSignatureBlocksHaveRequiredByLines(corpus, signerCount);

  let allowed = false;
  let blockReason: string | undefined;
  if (!corpus.trim()) {
    blockReason = "empty_corpus";
  } else if (guidedPro && corpus.length < VS01_SIGNING_CORPUS_MIN_LEN) {
    blockReason = "corpus_too_short_for_guided_pro";
  } else if (guidedPro && isFreeHashMatch) {
    blockReason = "free_basic_hash_match";
  } else if (!hasWitnessBlock) {
    blockReason = "missing_witness_block";
  } else if (!hasByOrSignatureLines) {
    blockReason = "missing_by_or_signature_lines";
  } else if (!guidedPro && corpus.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    blockReason = "corpus_below_send_handoff_min";
  } else {
    allowed = true;
  }

  const resolution: Vs01SigningCorpusResolution = {
    corpus,
    source,
    len: corpus.length,
    hash,
    hasWitnessBlock,
    hasByOrSignatureLines,
    signerCount,
    isFreeHashMatch,
    allowed,
    blockReason,
  };

  if (allowed) {
    logVs01SigningCorpusSource({
      source: resolution.source,
      len: resolution.len,
      hash: resolution.hash,
      hasWitnessBlock: resolution.hasWitnessBlock,
      hasByOrSignatureLines: resolution.hasByOrSignatureLines,
      signerCount: resolution.signerCount,
      isFreeHashMatch: resolution.isFreeHashMatch,
      allowed: true,
    });
  } else {
    logVs01SigningCorpusBlocked({
      reason: blockReason,
      source: resolution.source,
      len: resolution.len,
      hash: resolution.hash,
      hasWitnessBlock: resolution.hasWitnessBlock,
      hasByOrSignatureLines: resolution.hasByOrSignatureLines,
      isFreeHashMatch: resolution.isFreeHashMatch,
    });
  }

  return resolution;
}
