/**
 * Temporary J5-only structured diagnostics — harness reads `window.__LAWDOG_J5_REVIEW_DECISION_DIAG__`.
 */

export const J5_REVIEW_DECISION_DIAG_SESSION_KEY = "lawdog_j5_review_decision_diag_v1";

export type PaidProJ5EffectTransition = {
  at: string;
  field: string;
  previous: unknown;
  next: unknown;
  reason: string;
  source: string;
};

export type PaidProJ5ReviewDecisionDiagnosticSnapshot = {
  capturedAt: string;
  identity: {
    url: string;
    agreementId: string | null;
    organizationId: string | null;
    authenticated: boolean | null;
    entitled: boolean | null;
    checkoutSettlementVerified: boolean | null;
  };
  corpus: {
    authoritativeReviewReady: boolean;
    acceptedSource: string | null;
    corpusLength: number;
    corpusHash: string | null;
    runtimeAuthorityFinalizing: boolean;
    runtimeAuthorityFinalized: boolean;
  };
  signingState: {
    paidProReviewDecisionPhase: string;
    signaturePreparationRequested: boolean;
    signerMetadataFinalized: boolean;
    frozenSigningAuthorityPresent: boolean;
    signingPacketPresent: boolean;
    postCheckoutDecisionLatch: boolean;
    firstReviewDecisionActive: boolean;
    inlineSignerSetupLatched: boolean;
    signaturePrepIntentLatched: boolean;
    canonicalReviewSignerSetupActive: boolean;
  };
  shellState: {
    simpleShellActive: boolean;
    forcedShellActive: boolean;
    embeddedReviewActive: boolean;
    paidReviewSurfaceActive: boolean;
    premiumPaidDocumentSurface?: boolean;
    productionDraftPrimaryReviewSurface?: boolean;
    paidProAuthoritative?: boolean;
    hasPaidPremiumCompletionSession?: boolean;
    hasPaidProSourceOfTruth?: boolean;
    createUiStage?: string;
    createFlowPhase?: string;
    reviewBranchPath: string;
    reviewBranchReason: string;
    showPaidProReviewDecisionChrome: boolean;
    selectedDecisionComponent: string;
    wrapperVisibility: Record<string, boolean>;
  };
  domState: {
    paidProReviewRoot: boolean;
    forcedFirstReviewChrome: boolean;
    forcedFirstReviewChromeVisible: boolean;
    simpleFinalReviewActions: boolean;
    prepareSignaturesControl: boolean;
    prepareSignaturesVisible: boolean;
    signerSetupShell: boolean;
    signerSetupVisible: boolean;
    legacyChooser: boolean;
    loadingIndicator: boolean;
    errorBoundary: boolean;
    blockingOverlay: boolean;
  };
  effectTrace: PaidProJ5EffectTransition[];
};

const trace: PaidProJ5EffectTransition[] = [];
let lastPublished: PaidProJ5ReviewDecisionDiagnosticSnapshot | null = null;

export function isJ5ReviewDecisionDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(J5_REVIEW_DECISION_DIAG_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function recordJ5ReviewDecisionTransition(args: Omit<PaidProJ5EffectTransition, "at">): void {
  if (!isJ5ReviewDecisionDiagnosticsEnabled()) return;
  trace.push({ ...args, at: new Date().toISOString() });
  if (trace.length > 64) trace.shift();
}

export function publishJ5ReviewDecisionDiagnostics(
  snapshot: Omit<PaidProJ5ReviewDecisionDiagnosticSnapshot, "capturedAt" | "effectTrace">,
): void {
  if (!isJ5ReviewDecisionDiagnosticsEnabled()) return;
  const full: PaidProJ5ReviewDecisionDiagnosticSnapshot = {
    ...snapshot,
    capturedAt: new Date().toISOString(),
    effectTrace: [...trace],
  };
  lastPublished = full;
  (window as Window & { __LAWDOG_J5_REVIEW_DECISION_DIAG__?: PaidProJ5ReviewDecisionDiagnosticSnapshot }).__LAWDOG_J5_REVIEW_DECISION_DIAG__ =
    full;
}

export function readJ5ReviewDecisionDiagnostics(): PaidProJ5ReviewDecisionDiagnosticSnapshot | null {
  return lastPublished;
}

export function resetJ5ReviewDecisionDiagnosticsForTests(): void {
  trace.length = 0;
  lastPublished = null;
}
