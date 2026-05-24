/**
 * Single write path for authoritative Pro corpus onto all canonical review/send surfaces.
 */

import type { MutableRefObject } from "react";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
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
