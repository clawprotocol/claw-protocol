/**
 * Paid Pro first-review render branch audit + invariant (Test289 investigation).
 * Read-only — does not mutate generation, acceptance, freeze, or SoT establishment.
 */

import {
  hasCanonicalReviewCorpusForRender,
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resolveCanonicalReviewCorpusLenForRender,
  shouldForcePaidProReviewDocumentRender,
} from "./paidProDocumentBodyRouter";

export type PaidProReviewBranchPath =
  | "forced_embedded"
  | "forced_standalone"
  | "legacy_simple_review"
  | "legacy_premium_readonly"
  | "legacy_guided"
  | "legacy_runtime_authority_wait"
  | "legacy_other"
  | "dashboard_signer_setup_resume"
  | "blocked_can_display"
  | "blocked_premium_wait"
  | "blocked_starter_textarea"
  | "none";

export type PaidProReviewBranchSnapshot = {
  forcedReviewActive: boolean;
  firstReviewSurfaceActive: boolean;
  simpleReviewActive: boolean;
  signerSetupActive: boolean;
  canDisplayPaidProDocument: boolean;
  canonicalReviewCorpusReady: boolean;
  canonicalReviewCorpusLen: number;
  hasCanonicalCorpus: boolean;
  premiumPaidDocumentSurface: boolean;
  documentMounted: boolean;
  chromeMounted: boolean;
  signerMounted: boolean;
  path: PaidProReviewBranchPath;
  reason: string;
};

const branchLogKeys = new Set<string>();
const invariantLogKeys = new Set<string>();
let instrumentationBypassTestMode = false;

export function resetPaidProReviewBranchInstrumentationForTests(): void {
  branchLogKeys.clear();
  invariantLogKeys.clear();
  instrumentationBypassTestMode = false;
}

export function enablePaidProReviewInstrumentationForTests(): void {
  instrumentationBypassTestMode = true;
}

function shouldEmitPaidProReviewInstrumentation(): boolean {
  if (instrumentationBypassTestMode) return true;
  return typeof import.meta === "undefined" || import.meta.env?.MODE !== "test";
}

export {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
  shouldForcePaidProReviewDocumentRender,
};

export function resolvePaidProReviewBranchPath(args: {
  premiumPaidDocumentSurface: boolean;
  showPaidProReviewDocumentCard: boolean;
  proUpgradeUseStarterView: boolean;
  paidProForcedFirstReviewActive: boolean;
  guidedPreReviewSignerSetupActive: boolean;
  paidProAwaitingRuntimeAuthority: boolean;
  simpleProFinalReviewShellActive: boolean;
  failedPremiumCorpusActive: boolean;
  premiumReturnWaitActive: boolean;
}): { path: PaidProReviewBranchPath; reason: string } {
  if (!args.premiumPaidDocumentSurface) {
    return { path: "none", reason: "not_premium_paid_surface" };
  }
  if (args.proUpgradeUseStarterView) {
    return { path: "blocked_starter_textarea", reason: "pro_upgrade_use_starter_view" };
  }
  if (!args.showPaidProReviewDocumentCard) {
    if (args.premiumReturnWaitActive) {
      return { path: "blocked_premium_wait", reason: "premium_return_wait_active" };
    }
    return { path: "blocked_can_display", reason: "review_document_card_gate_false" };
  }
  if (args.paidProForcedFirstReviewActive) {
    return { path: "forced_embedded", reason: "paid_pro_forced_first_review_active" };
  }
  if (args.guidedPreReviewSignerSetupActive) {
    return { path: "legacy_guided", reason: "guided_pre_review_signer_setup_active" };
  }
  if (args.paidProAwaitingRuntimeAuthority) {
    return { path: "legacy_runtime_authority_wait", reason: "paid_pro_awaiting_runtime_authority" };
  }
  if (args.simpleProFinalReviewShellActive && !args.failedPremiumCorpusActive) {
    return { path: "legacy_simple_review", reason: "simple_pro_final_review_shell_active" };
  }
  return { path: "legacy_premium_readonly", reason: "legacy_paid_pro_visible_document_shell" };
}

export function logPaidProReviewBranch(snapshot: PaidProReviewBranchSnapshot): void {
  if (!shouldEmitPaidProReviewInstrumentation()) return;
  const key = [
    snapshot.path,
    snapshot.forcedReviewActive,
    snapshot.canDisplayPaidProDocument,
    snapshot.documentMounted,
    snapshot.chromeMounted,
    snapshot.signerMounted,
  ].join("|");
  if (branchLogKeys.has(key)) return;
  branchLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-branch]", {
    forcedReviewActive: snapshot.forcedReviewActive,
    firstReviewSurfaceActive: snapshot.firstReviewSurfaceActive,
    simpleReviewActive: snapshot.simpleReviewActive,
    signerSetupActive: snapshot.signerSetupActive,
    documentMounted: snapshot.documentMounted,
    chromeMounted: snapshot.chromeMounted,
    signerMounted: snapshot.signerMounted,
    canDisplayPaidProDocument: snapshot.canDisplayPaidProDocument,
    canonicalReviewCorpusReady: snapshot.canonicalReviewCorpusReady,
    canonicalReviewCorpusLen: snapshot.canonicalReviewCorpusLen,
    hasCanonicalCorpus: snapshot.hasCanonicalCorpus,
    premiumPaidDocumentSurface: snapshot.premiumPaidDocumentSurface,
    path: snapshot.path,
    reason: snapshot.reason,
  });
}

export function assertPaidProReviewRenderInvariant(args: {
  reviewShellMounted: boolean;
  hasCanonicalCorpus: boolean;
  canonicalReviewCorpusLen: number;
  documentRendererCount: number;
  ctaRegionCount: number;
  path: PaidProReviewBranchPath;
}): void {
  if (!shouldEmitPaidProReviewInstrumentation()) return;
  if (!args.reviewShellMounted) return;
  if (!args.hasCanonicalCorpus || args.canonicalReviewCorpusLen < PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN) {
    return;
  }
  if (args.documentRendererCount > 0) return;

  const key = `${args.path}|${args.documentRendererCount}|${args.ctaRegionCount}`;
  if (invariantLogKeys.has(key)) return;
  invariantLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.error("[paid-pro-review-render-invariant]", {
    reviewShellMounted: args.reviewShellMounted,
    hasCanonicalCorpus: args.hasCanonicalCorpus,
    canonicalReviewCorpusLen: args.canonicalReviewCorpusLen,
    documentRendererCount: args.documentRendererCount,
    ctaRegionCount: args.ctaRegionCount,
    path: args.path,
    message:
      "Review shell mounted with canonical corpus but zero document renderers — child review components failed to mount.",
  });
}

export const PAID_PRO_REVIEW_DOCUMENT_RENDERER_SELECTORS = [
  '[data-testid="paid-pro-document-body-forced-route"]',
  '[data-testid="paid-pro-visible-document-shell"]',
  '[data-testid="simple-pro-final-review-document"]',
  '[data-testid="premium-agreement-readonly-article"]',
  "#claw-agreement-preview-editor",
] as const;

export const PAID_PRO_REVIEW_CTA_REGION_SELECTORS = [
  '[data-testid="paid-pro-forced-first-review-actions"]',
  '[data-testid="simple-pro-final-review-actions"]',
  '[data-testid="pro-delivery-track-chooser"]',
  '[data-testid="pro-review-track-actions"]',
  '[data-testid="paid-pro-inline-signer-setup"]',
] as const;

export function countDomMatches(root: ParentNode, selectors: readonly string[]): number {
  if (typeof document === "undefined") return 0;
  let count = 0;
  for (const selector of selectors) {
    count += root.querySelectorAll(selector).length;
  }
  return count;
}
