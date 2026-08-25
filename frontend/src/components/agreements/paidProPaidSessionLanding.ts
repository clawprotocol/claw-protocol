/**
 * Paid-session visitor landing — one hole, two faces.
 *
 * After pay, the visitor dump IS the deal. The visible landing is:
 *   (A) the commercial-ready dump / ≥200 non-hollow rebuild on AGREEMENT DRAFT, or
 *   (B) a 2–5 question ask for tenets that are actually missing from the original dump.
 *
 * "Building your Pro agreement" / shimmer / empty box must never cover (A).
 * Generate may continue in the background.
 */

import { looksLikeEmail } from "./recipientEmailValidation";
import { meetsPaidSessionFallbackPaintFloor } from "./paidProFirstReviewDisplayAuthority";

/**
 * True when a paid session already has a visitor-visible deal body (≥200 non-hollow).
 * Same floor as shell paint and Retry lockout.
 */
export function resolvePaidSessionVisibleDealBody(args: {
  paidSessionActive: boolean;
  acceptedCanonicalPlain?: string | null;
  lastKnownGoodPlain?: string | null;
  intakeText?: string | null;
}): boolean {
  if (!args.paidSessionActive) return false;
  const intake = args.intakeText || "";
  return (
    meetsPaidSessionFallbackPaintFloor(args.acceptedCanonicalPlain || "", intake) ||
    meetsPaidSessionFallbackPaintFloor(args.lastKnownGoodPlain || "", intake)
  );
}

/**
 * After pay (`premiumCompletion=1` or a paid session), the leftover free
 * missing-tenet ask is never the landing. That dump is already the deal;
 * signer-setup emails must stay typeable.
 */
export function shouldSuppressFreeMissingTenetAskAfterPay(args: {
  paidSessionActive?: boolean;
  premiumCompletionReturn?: boolean;
}): boolean {
  return Boolean(args.paidSessionActive || args.premiumCompletionReturn);
}

/**
 * After pay, leftover-ask suppress is "handled": do not remount the free ask
 * and do not fall through to starter generate (that lock/overlay path blocks
 * r1-email / r2-email). Same predicate as leftover-ask suppress.
 */
export function shouldKeepPaidSessionSignerEmailsInteractive(args: {
  paidSessionActive?: boolean;
  premiumCompletionReturn?: boolean;
}): boolean {
  return shouldSuppressFreeMissingTenetAskAfterPay(args);
}

/** Shared class for after-pay reviewer/signer email inputs — never pointer-events-none. */
export const PAID_PRO_SIGNER_EMAIL_INPUT_CLASS =
  "mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 pointer-events-auto relative z-10";

/** Immediate wrapper around r1-email / r2-email — clicks must reach the input. */
export const PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS =
  "mt-3 block text-xs font-medium text-slate-400 sm:text-sm pointer-events-auto relative z-10";

export function readPremiumCompletionReturnFromHref(href?: string | null): boolean {
  const raw = (href || "").trim();
  if (!raw) return false;
  try {
    return new URL(raw, "https://lawdog.local").searchParams.get("premiumCompletion") === "1";
  } catch {
    return false;
  }
}

/**
 * Visitor-visible 1–5 question missing-tenet ask is already the landing.
 * Free (`freeStarterMissingTenetAsk`) and paid (`awaiting_gaps`) share this.
 * After pay, leftover free-ask state is not a landing — ignore it.
 */
export function isVisibleMissingTenetAskLanding(args: {
  phase?: string | null;
  freeStarterAskQuestionCount?: number;
  paidGapQuestionCount?: number;
  paidSessionActive?: boolean;
  premiumCompletionReturn?: boolean;
}): boolean {
  const suppressFree = shouldSuppressFreeMissingTenetAskAfterPay({
    paidSessionActive: args.paidSessionActive,
    premiumCompletionReturn: args.premiumCompletionReturn,
  });
  const freeCount = suppressFree ? 0 : (args.freeStarterAskQuestionCount ?? 0);
  if (freeCount >= 1 && freeCount <= 5) return true;
  const paidCount = args.paidGapQuestionCount ?? 0;
  if ((args.phase || "").trim() === "awaiting_gaps" && paidCount >= 1 && paidCount <= 5) {
    return true;
  }
  return false;
}

/**
 * Full-screen generating overlay / wait shimmer may show only when there is no
 * visitor-visible deal and no missing-tenet ask landing. A real ask
 * (`awaiting_gaps` / freeStarterMissingTenetAsk) is landing (B) — overlay must
 * not cover clickable inputs. Generate may continue in the background.
 */
export function shouldShowPaidSessionGeneratingOverlay(args: {
  phase: string | null | undefined;
  hasVisibleDealBody: boolean;
  hasVisibleAskLanding?: boolean;
  signerEmailsMustStayInteractive?: boolean;
}): boolean {
  if (args.signerEmailsMustStayInteractive) return false;
  if (args.hasVisibleAskLanding) return false;
  const phase = (args.phase || "").trim();
  if (!phase || phase === "premium_network_recoverable") return false;
  if (phase === "awaiting_gaps") return false;
  if (args.hasVisibleDealBody) return false;
  return true;
}

function trimSigner(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

export type PaidSessionSignerNameEmail = {
  name?: string | null;
  email?: string | null;
};

function signerNameAndEmailComplete(args: PaidSessionSignerNameEmail): boolean {
  return trimSigner(args.name).length >= 2 && looksLikeEmail(trimSigner(args.email));
}

/**
 * After-pay Continue / Complete signer details: N complete names+emails (2, 3, or 4).
 * Extra slots (party 3/4) must also be complete when present. Title, address,
 * authorized-signer-name, 1001-char SoT, and a new agreement GET are not required.
 */
export function resolvePaidSessionTwoSignerNamesEmailsComplete(args: {
  signer1Name?: string | null;
  signer1Email?: string | null;
  signer2Name?: string | null;
  signer2Email?: string | null;
  extraSigners?: readonly PaidSessionSignerNameEmail[];
}): boolean {
  const extras = (args.extraSigners ?? []).filter(
    (slot) => trimSigner(slot.name).length > 0 || trimSigner(slot.email).length > 0,
  );
  const slots: PaidSessionSignerNameEmail[] = [
    { name: args.signer1Name, email: args.signer1Email },
    { name: args.signer2Name, email: args.signer2Email },
    ...extras,
  ];
  if (slots.length < 2 || slots.length > 4) return false;
  return slots.every(signerNameAndEmailComplete);
}

/**
 * After pay, a visible deal on the card + N signer names/emails (2–4) is enough
 * to open existing SimpleProFinalReviewScreen. Do not sit on Preparing.
 */
export function canOpenPaidSessionFinalReviewAfterSigners(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
  twoSignerNamesAndEmailsComplete: boolean;
}): boolean {
  return Boolean(
    args.paidSessionActive && args.visibleDealBody && args.twoSignerNamesAndEmailsComplete,
  );
}

/**
 * Visible after-pay rebuild is already the deal. Review-screen hydrate must not
 * wait for 1001-char generate SoT or a verified agreement GET.
 */
export function shouldSkipPaidSessionReviewHydrateWait(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
}): boolean {
  return Boolean(args.paidSessionActive && args.visibleDealBody);
}

/**
 * After-pay visitor with N signers (2–4) finalized: existing SimpleProFinalReviewScreen
 * owns Send for review / Prepare for signing. Do not sit on another Continue,
 * require the inline signer-setup latch, or suppress those on-card actions.
 */
export function shouldShowPaidSessionFinalReviewActions(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
  twoSignerNamesAndEmailsComplete: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested?: boolean;
}): boolean {
  return (
    canOpenPaidSessionFinalReviewAfterSigners({
      paidSessionActive: args.paidSessionActive,
      visibleDealBody: args.visibleDealBody,
      twoSignerNamesAndEmailsComplete: args.twoSignerNamesAndEmailsComplete,
    }) &&
    Boolean(args.signerMetadataFinalized) &&
    !args.signaturePreparationRequested
  );
}

/**
 * After-pay names+emails (2–4) are enough to start the existing signing track
 * from SimpleProFinalReviewScreen. Do not require authorized-signer-name,
 * title, address, or a second dump.
 */
export function canStartPaidSessionSignatureTrackFromFinalReview(args: {
  namesAndEmailsComplete: boolean;
}): boolean {
  return Boolean(args.namesAndEmailsComplete);
}

/**
 * After-pay visible deal + complete names+emails: signing track uses the
 * painted deal body (same floor as review-link mint). Do not require
 * 1001/2000-char SoT or signature-block asserts that swallow the click.
 */
export function shouldRelaxPaidSessionSignatureTrackGates(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
  namesAndEmailsComplete: boolean;
}): boolean {
  return Boolean(
    args.paidSessionActive && args.visibleDealBody && args.namesAndEmailsComplete,
  );
}

/** Same floor as after-pay painted deal / review-link mint. */
export const PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN = 200;

/** Paid-session Send for signature already wrote the VS01 bridge. */
export function isPaidSessionSignatureTrackBridge(
  bridge: {
    senderFirstLawdogHandoff?: boolean | null;
    source?: string | null;
    agreementBridgeMode?: string | null;
  } | null | undefined,
): boolean {
  if (!bridge) return false;
  return Boolean(
    bridge.senderFirstLawdogHandoff ||
      bridge.source === "paid_pro_sender_first" ||
      bridge.agreementBridgeMode === "prepare_signing_packet",
  );
}

/**
 * After-pay `/app/esign/:id?agreement_bridge=1` must hydrate the painted deal
 * at the 200-char floor. The 1500-char VS01 gate is for long Pro snapshots only.
 */
export function vs01PaidSessionWorkspaceHydrateMinCorpusLen(args: {
  agreementBridge: boolean;
  paidProHandoff: boolean;
}): number {
  if (args.agreementBridge && args.paidProHandoff) {
    return PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN;
  }
  return 1500;
}

/** Prepare/workspace gates keep the painted deal — do not revive a leftover 1500-char packet. */
export function shouldRelaxPaidSessionWorkspaceCorpus(args: {
  bridge?: {
    senderFirstLawdogHandoff?: boolean | null;
    source?: string | null;
    agreementBridgeMode?: string | null;
  } | null;
  corpusText?: string | null;
}): boolean {
  const corpus = (args.corpusText ?? "").trim();
  return (
    isPaidSessionSignatureTrackBridge(args.bridge) &&
    corpus.length >= PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN
  );
}

/**
 * After-pay Send for signature must keep the painted-deal handoff.
 * The 1500-char session reader drops short rebuilds and can revive a leftover
 * "Links created" packet. Do not fall through to that leftover when relax is on.
 */
export function resolvePaidSessionSignatureTrackHandoff<T extends { corpusText?: string | null }>(args: {
  relaxPaidSessionCorpusAssert: boolean;
  explicitHandoff: T | null | undefined;
  leftoverSessionHandoff?: T | null;
  minLen?: number;
}): T | null {
  const explicit = args.explicitHandoff?.corpusText?.trim() ?? "";
  const minLen = Math.max(1, args.minLen ?? PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN);
  if (args.relaxPaidSessionCorpusAssert) {
    return explicit.length >= minLen ? (args.explicitHandoff ?? null) : null;
  }
  if (explicit.length >= 1500) return args.explicitHandoff ?? null;
  return args.leftoverSessionHandoff ?? null;
}

/** Pin the painted deal onto the draft so VS01 seed does not require a 1500-char snapshot. */
export function mergePaidSessionSignatureTrackDraft<T extends Record<string, unknown>>(
  draft: T,
  corpusText: string,
): T {
  const corpus = corpusText.trim();
  if (corpus.length < PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN) return draft;
  return {
    ...draft,
    server_full_document_text: corpus,
    premium_full_document_text: corpus,
    document_text: corpus,
  };
}

/**
 * Final review may display a short, signer-pinned after-pay rebuild even when
 * the stricter canonical-corpus resolver reports it unavailable. Match the
 * button gate to the existing signing-track fallback: only the completed
 * after-pay decision screen with a real visible deal may release this block.
 */
export function shouldBlockPaidSessionFinalReviewSendForCorpus(args: {
  corpusBlocked: boolean;
  paidSessionFinalReviewDecisionReady: boolean;
  visibleFinalReviewCorpusLen: number;
  minimumVisibleCorpusLen?: number;
}): boolean {
  if (!args.corpusBlocked) return false;
  const minimumVisibleCorpusLen = Math.max(1, args.minimumVisibleCorpusLen ?? 200);
  return !(
    args.paidSessionFinalReviewDecisionReady &&
    args.visibleFinalReviewCorpusLen >= minimumVisibleCorpusLen
  );
}

/**
 * Disabled-without-reason is illegal once names+emails are complete.
 */
export function isIllegalSilentSendDisabled(args: {
  namesAndEmailsComplete: boolean;
  sendDisabled: boolean;
  sendDisabledReason?: string | null;
}): boolean {
  return Boolean(
    args.namesAndEmailsComplete && args.sendDisabled && !(args.sendDisabledReason || "").trim(),
  );
}

/**
 * Leftover review-packet / "Links created" copy must not disable e-sign.
 * After-pay Continue releases the recipients surface, so the chip can say
 * "Links created—share when ready" even when Send for review was never clicked.
 */
export function isLeftoverReviewPacketSendDisableReason(reason?: string | null): boolean {
  const r = (reason || "").trim().toLowerCase();
  if (!r) return false;
  return r.includes("links were created") || r.includes("create new links for this version");
}

/**
 * After-pay ≥200 painted deal may mount existing SimpleProFinalReviewScreen
 * only after Continue with complete names+emails. A painted deal alone must
 * not lift the 1001-char block — that mounts the review shell over signer
 * details and steals Reviewer 2 (#104 live miss).
 */
export function canMountPaidSessionFinalReviewShell(args: {
  paidSessionVisibleDealBody: boolean;
  namesAndEmailsComplete: boolean;
  finalReviewOpened: boolean;
}): boolean {
  return Boolean(
    args.paidSessionVisibleDealBody &&
      args.namesAndEmailsComplete &&
      args.finalReviewOpened,
  );
}

/**
 * Keep the 1001-char SoT block unless canonical first review is already
 * active, or Continue has opened final review on a painted after-pay deal.
 */
export function shouldBypassPaidProReviewShellWithoutCorpus(args: {
  blockWithoutCanonicalCorpus: boolean;
  canonicalFirstReviewActive: boolean;
  paidSessionVisibleDealBody: boolean;
  namesAndEmailsComplete: boolean;
  finalReviewOpened: boolean;
}): boolean {
  if (!args.blockWithoutCanonicalCorpus) return false;
  if (args.canonicalFirstReviewActive) return false;
  if (canMountPaidSessionFinalReviewShell(args)) return false;
  return true;
}

/**
 * Visible Send for signature stays clickable once names+emails are complete.
 * A silent disable (no reason) must not swallow the click. Leftover
 * review-packet / "Links created" state is not a busy gate.
 */
export function isPaidSessionSendClickArmed(args: {
  namesAndEmailsComplete: boolean;
  sendDisabled: boolean;
  sendDisabledReason?: string | null;
}): boolean {
  if (
    isIllegalSilentSendDisabled({
      namesAndEmailsComplete: args.namesAndEmailsComplete,
      sendDisabled: args.sendDisabled,
      sendDisabledReason: args.sendDisabledReason,
    })
  ) {
    return true;
  }
  if (
    args.namesAndEmailsComplete &&
    args.sendDisabled &&
    isLeftoverReviewPacketSendDisableReason(args.sendDisabledReason)
  ) {
    return true;
  }
  return !args.sendDisabled;
}

/**
 * Tear down paidProSignerMetadataFinalizedLatch only on a true session reset.
 * After-pay ≥200 rebuilds are never 1001-char SoT; missing SoT must not clear
 * the latch when a paid session already has a visible deal.
 */
export function shouldTeardownPaidProSignerMetadataFinalizedLatch(args: {
  latch: boolean;
  hasPaidProSourceOfTruth: boolean;
  paidSessionVisibleDealBody: boolean;
  shouldSkipPaidSessionReviewHydrateWait: boolean;
}): boolean {
  if (!args.latch) return false;
  if (args.hasPaidProSourceOfTruth) return false;
  if (args.paidSessionVisibleDealBody || args.shouldSkipPaidSessionReviewHydrateWait) {
    return false;
  }
  return true;
}
