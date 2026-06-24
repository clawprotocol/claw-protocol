/**
 * Single write path for authoritative Pro corpus onto all canonical review/send surfaces.
 */

import type { MutableRefObject } from "react";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import {
  logPremiumAuthoritativeVisibleCommitFailed,
  type PremiumAuthoritativeVisibleCommitFailedPayload,
} from "./premiumAuthoritativeVisibleCommit";

export type AuthoritativePremiumDocumentRefs = {
  agreementDocumentTextRef: MutableRefObject<string>;
  agreementDocumentDirtyRef: MutableRefObject<boolean>;
  hydratedPremiumBodyRef: MutableRefObject<string>;
  lastPremiumWinningCorpusRef: MutableRefObject<string>;
  premiumPipelineOutputBodyRef: MutableRefObject<string>;
  lastPremiumPipelineRenderSourceRef: MutableRefObject<string | null>;
  /** When set, full premium commits replace stale short last-known-good snapshots. */
  lastKnownGoodAuthoritativeDraftRef?: MutableRefObject<string>;
};

export type CommitAuthoritativePremiumDocumentMetadata = {
  pipelineSource: string;
  premiumRenderResolveSource?: PremiumRenderResolveSource | string | null;
};

export type CommitAuthoritativePremiumDocumentResult = {
  collapsedDoc: string;
  bodyTrim: string;
  mergedDraft: ParsedDraftShape;
};

/** Synchronous ref + draft field updates — call before setState(agreementDocumentText). */
export function syncAuthoritativePremiumDocumentRefs(
  collapsedDoc: string,
  refs: AuthoritativePremiumDocumentRefs,
  meta: CommitAuthoritativePremiumDocumentMetadata,
): string {
  const bodyTrim = collapsedDoc.trim();
  refs.hydratedPremiumBodyRef.current = bodyTrim;
  refs.lastPremiumWinningCorpusRef.current = bodyTrim;
  refs.premiumPipelineOutputBodyRef.current = bodyTrim;
  if (refs.lastKnownGoodAuthoritativeDraftRef && bodyTrim.length >= 1500) {
    const cur = refs.lastKnownGoodAuthoritativeDraftRef.current.trim();
    if (!cur || bodyTrim.length >= cur.length) {
      refs.lastKnownGoodAuthoritativeDraftRef.current = bodyTrim;
    }
  }
  refs.lastPremiumPipelineRenderSourceRef.current = meta.pipelineSource;
  refs.agreementDocumentTextRef.current = collapsedDoc;
  refs.agreementDocumentDirtyRef.current = true;
  return bodyTrim;
}

export function mergeDraftWithAuthoritativePremiumBody(
  draft: ParsedDraftShape,
  bodyTrim: string,
  meta: CommitAuthoritativePremiumDocumentMetadata,
): ParsedDraftShape {
  if (bodyTrim.length < 500) return draft;
  const resolveSource = (meta.premiumRenderResolveSource || "server_full_document_text") as string;
  return {
    ...draft,
    premium_full_document_text: bodyTrim,
    premium_server_full_document_text: bodyTrim,
    premium_render_source: resolveSource,
  };
}

/**
 * Authoritative commit: sync refs, merge draft premium fields, return values for React setters.
 */
export function commitAuthoritativePremiumDocument(
  authoritativeText: string,
  draft: ParsedDraftShape,
  refs: AuthoritativePremiumDocumentRefs,
  meta: CommitAuthoritativePremiumDocumentMetadata,
): CommitAuthoritativePremiumDocumentResult | null {
  const collapsedDoc = authoritativeText.trim();
  if (!isAuthoritativePremiumPipelineRenderSource(meta.pipelineSource) || collapsedDoc.length < 500) {
    return null;
  }
  const bodyTrim = syncAuthoritativePremiumDocumentRefs(collapsedDoc, refs, meta);
  const mergedDraft = mergeDraftWithAuthoritativePremiumBody(draft, bodyTrim, meta);
  return { collapsedDoc, bodyTrim, mergedDraft };
}

export type AuthoritativeVisibleSurfaceProbe = {
  agreementDocumentTextLen: number;
  hydratedBodyLen: number;
  reviewDraftPlainLen: number;
  premiumRenderResolveSource: string | null;
};

export function probeAuthoritativeVisibleSurfaces(args: {
  refs: AuthoritativePremiumDocumentRefs;
  draft: ParsedDraftShape | null;
  snapshotRenderResolveSource?: string | null;
}): AuthoritativeVisibleSurfaceProbe {
  const draftPlain = (
    args.draft?.premium_server_full_document_text ||
    args.draft?.premium_full_document_text ||
    ""
  ).trim();
  return {
    agreementDocumentTextLen: args.refs.agreementDocumentTextRef.current.trim().length,
    hydratedBodyLen: args.refs.hydratedPremiumBodyRef.current.trim().length,
    reviewDraftPlainLen: draftPlain.length,
    premiumRenderResolveSource:
      args.snapshotRenderResolveSource ??
      (args.draft?.premium_render_source as string | undefined) ??
      null,
  };
}

export function clearAcceptedUnfrozenPremiumDocumentRefs(
  refs: AuthoritativePremiumDocumentRefs,
): void {
  refs.hydratedPremiumBodyRef.current = "";
  refs.lastPremiumWinningCorpusRef.current = "";
  refs.premiumPipelineOutputBodyRef.current = "";
  refs.lastPremiumPipelineRenderSourceRef.current = null;
  if (refs.lastKnownGoodAuthoritativeDraftRef) {
    refs.lastKnownGoodAuthoritativeDraftRef.current = "";
  }
}

export function stripAcceptedPremiumServerFieldsFromDraft(draft: ParsedDraftShape): ParsedDraftShape {
  const next = { ...draft };
  delete next.premium_full_document_text;
  delete next.premium_server_full_document_text;
  if (
    next.premium_render_source &&
    next.premium_render_source !== "live_generated_preview"
  ) {
    next.premium_render_source = "live_generated_preview";
  }
  return next;
}

export function rejectedCorpusMatchesStoredText(
  rejectedCorpusText: string | null | undefined,
  text: string | null | undefined,
): boolean {
  const rejected = (rejectedCorpusText || "").trim();
  const candidate = (text || "").trim();
  if (!rejected || !candidate) return false;
  if (rejected === candidate) return true;
  if (rejected.length >= 500 && candidate.length >= 500) {
    return fingerprintAgreementBody(rejected) === fingerprintAgreementBody(candidate);
  }
  return false;
}

/** Revert agreement document away from rejected Pro corpus; clear winning/hydrated refs. */
export function revertAgreementDocumentAwayFromRejectedCorpus(
  refs: AuthoritativePremiumDocumentRefs,
  rejectedCorpusText: string,
  starterPlain: string,
): { reverted: boolean; starterPlain: string } {
  clearAcceptedUnfrozenPremiumDocumentRefs(refs);
  const current = refs.agreementDocumentTextRef.current.trim();
  const rejected = (rejectedCorpusText || "").trim();
  const shouldRevert =
    rejected.length > 0 &&
    (rejectedCorpusMatchesStoredText(rejected, current) || current.length >= 1500);
  if (!shouldRevert) {
    return { reverted: false, starterPlain: current };
  }
  const revert = (starterPlain || "").trim();
  refs.agreementDocumentTextRef.current = revert;
  refs.agreementDocumentDirtyRef.current = false;
  return { reverted: true, starterPlain: revert };
}

/** True when any canonical surface carries the authoritative corpus (not starter preview). */
export function isAuthoritativeVisibleSurfaceAligned(
  acceptedBodyLen: number,
  probe: AuthoritativeVisibleSurfaceProbe,
): boolean {
  if (acceptedBodyLen < 500) return false;
  const threshold = acceptedBodyLen - 200;
  const corpusLen = Math.max(
    probe.agreementDocumentTextLen,
    probe.hydratedBodyLen,
    probe.reviewDraftPlainLen,
  );
  if (corpusLen < 500 || corpusLen < threshold) return false;
  const rs = (probe.premiumRenderResolveSource || "").trim();
  if (rs === "live_generated_preview") return false;
  return true;
}

/**
 * After React paints, verify visible/editor surfaces match authoritative corpus.
 * Only logs `[premium-authoritative-visible-commit-failed]` on real mismatch.
 */
export function scheduleAuthoritativeVisibleSurfaceVerification(args: {
  acceptedBodyLen: number;
  getProbe: () => AuthoritativeVisibleSurfaceProbe;
  buildFailurePayload: (probe: AuthoritativeVisibleSurfaceProbe) => PremiumAuthoritativeVisibleCommitFailedPayload;
}): void {
  if (!import.meta.env.DEV) return;
  const runCheck = () => {
    const probe = args.getProbe();
    if (!isAuthoritativeVisibleSurfaceAligned(args.acceptedBodyLen, probe)) {
      logPremiumAuthoritativeVisibleCommitFailed(args.buildFailurePayload(probe));
    }
  };
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(runCheck);
    });
  });
}
