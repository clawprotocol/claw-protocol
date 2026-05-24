/**
 * Session persistence for guided Pro → VS01 signing handoff.
 * Survives create-flow post-recipient navigation when React refs are not available.
 */

import type { AgreementDraft } from "../../../agreement/agreementTypes";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../simpleProFinalReviewCorpus";
import type { GuidedVs01SigningHandoff } from "./guidedVs01SigningHandoff";

const SESSION_KEY = "claw_guided_vs01_signing_handoff_v1";

export function writeGuidedVs01SigningHandoffSession(handoff: GuidedVs01SigningHandoff): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(handoff));
  } catch {
    /* ignore */
  }
}

export function readGuidedVs01SigningHandoffSession(): GuidedVs01SigningHandoff | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as GuidedVs01SigningHandoff;
    const corpusText = (o.corpusText ?? "").trim();
    if (!corpusText || corpusText.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return null;
    if (!o.source || !o.corpusHash) return null;
    return { ...o, corpusText };
  } catch {
    return null;
  }
}

export function clearGuidedVs01SigningHandoffSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer explicit handoff, then session snapshot (create-flow may run in a new mount). */
export function resolveGuidedVs01SigningHandoffForBridge(
  explicit: GuidedVs01SigningHandoff | null | undefined,
): GuidedVs01SigningHandoff | null {
  const fromExplicit = explicit?.corpusText?.trim()
    ? explicit
    : null;
  if (fromExplicit && fromExplicit.corpusText.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    return fromExplicit;
  }
  return readGuidedVs01SigningHandoffSession();
}

export function mergeAgreementDraftWithGuidedSigningHandoff(
  draft: AgreementDraft,
  handoff: GuidedVs01SigningHandoff | null | undefined,
): AgreementDraft {
  const corpusText = (handoff?.corpusText ?? "").trim();
  if (corpusText.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return draft;
  return {
    ...draft,
    server_full_document_text: corpusText,
    premium_full_document_text: corpusText,
    document_text: corpusText,
  } as AgreementDraft;
}
