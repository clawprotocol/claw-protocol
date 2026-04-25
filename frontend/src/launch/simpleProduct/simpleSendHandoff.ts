import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { PremiumSendIntent } from "./premiumSendIntent";

export type SimpleSendHandoff = {
  v: 1;
  agreementId: string;
  primedDraft: AgreementDraft | null;
  streamlinedSimpleFlow: boolean;
  premiumSendIntent: PremiumSendIntent | null;
  /**
   * Agreement-scoped phase when landing on `/app/send/:id` (survives `?phase=` strip + refresh).
   * Set to `"send"` when create intake completes the recipient send handoff; omit for review-first landings.
   */
  openFlowPhase?: "review" | "send";
  savedAt: number;
};

type HistoryStateShape = {
  clawSimpleSendHandoff?: Partial<SimpleSendHandoff> | null;
  clawReviewPrimedDraft?: AgreementDraft;
  clawStreamlinedSimpleFlow?: boolean;
  clawPremiumSendIntent?: PremiumSendIntent;
};

function normalizeIntent(intent: unknown): PremiumSendIntent | null {
  return intent === "review" || intent === "signature" ? intent : null;
}

export function buildSimpleSendHandoff(params: {
  agreementId: string;
  primedDraft: AgreementDraft | null;
  streamlinedSimpleFlow?: boolean;
  premiumSendIntent?: PremiumSendIntent | null;
  openFlowPhase?: "review" | "send";
}): SimpleSendHandoff {
  return {
    v: 1,
    agreementId: String(params.agreementId || "").trim(),
    primedDraft: params.primedDraft ?? null,
    streamlinedSimpleFlow: params.streamlinedSimpleFlow === true,
    premiumSendIntent: normalizeIntent(params.premiumSendIntent),
    ...(params.openFlowPhase === "send" || params.openFlowPhase === "review"
      ? { openFlowPhase: params.openFlowPhase }
      : {}),
    savedAt: Date.now(),
  };
}

export function buildSimpleSendHistoryState(handoff: SimpleSendHandoff): HistoryStateShape {
  return {
    clawSimpleSendHandoff: handoff,
    clawReviewPrimedDraft: handoff.primedDraft ?? undefined,
    ...(handoff.streamlinedSimpleFlow ? { clawStreamlinedSimpleFlow: true } : {}),
    ...(handoff.premiumSendIntent ? { clawPremiumSendIntent: handoff.premiumSendIntent } : {}),
  };
}

export function readSimpleSendHandoffFromHistory(agreementId: string): {
  primed: AgreementDraft | null;
  streamlined: boolean;
  premiumIntent: PremiumSendIntent | null;
  openFlowPhase: "review" | "send" | null;
} {
  const empty: {
    primed: null;
    streamlined: boolean;
    premiumIntent: PremiumSendIntent | null;
    openFlowPhase: "review" | "send" | null;
  } = { primed: null, streamlined: false, premiumIntent: null, openFlowPhase: null };
  if (typeof window === "undefined") return empty;
  const id = String(agreementId || "").trim();
  if (!id) return empty;
  const state = (window.history.state ?? null) as HistoryStateShape | null;
  const embedded = state?.clawSimpleSendHandoff;
  if (embedded && embedded.v === 1 && String(embedded.agreementId || "").trim() === id) {
    const d = embedded.primedDraft;
    const ofp = embedded.openFlowPhase;
    return {
      primed: d && typeof d === "object" ? (d as AgreementDraft) : null,
      streamlined: embedded.streamlinedSimpleFlow === true,
      premiumIntent: normalizeIntent(embedded.premiumSendIntent),
      openFlowPhase: ofp === "send" || ofp === "review" ? ofp : null,
    };
  }
  const d = state?.clawReviewPrimedDraft;
  const did = String(d?.id || "").trim();
  return {
    primed: d && typeof d === "object" && did === id ? d : null,
    streamlined: state?.clawStreamlinedSimpleFlow === true,
    premiumIntent: normalizeIntent(state?.clawPremiumSendIntent),
    openFlowPhase: null,
  };
}

export function resolveSimpleSendPhaseFromHandoff(params: {
  requestedPhase: string | null;
  canAccessSendActions: boolean;
  premiumIntent: PremiumSendIntent | null;
}): "review" | "send" {
  return resolveSimpleSendOpenPhase({
    urlPhase: params.requestedPhase,
    handoffOpenPhase: null,
    canAccessSendActions: params.canAccessSendActions,
    premiumIntent: params.premiumIntent,
    persistedSendPhase: null,
  });
}

/**
 * `/app/send/:id` — deterministic **review vs send** phase (GTM v1 precedence):
 * 1. URL `?phase=send` when `canAccessSendActions` allows send.
 * 2. Agreement handoff `openFlowPhase: "send"` (land on send) or `"review"` (explicit review-first).
 * 3. Premium collaborate (`review`) / signature (`send` when unlocked) — unchanged product rules.
 * 4. SessionStorage last resort for refresh after URL strip (see SimpleSendPage).
 */
export function resolveSimpleSendOpenPhase(params: {
  urlPhase: string | null;
  handoffOpenPhase: "review" | "send" | null;
  canAccessSendActions: boolean;
  premiumIntent: PremiumSendIntent | null;
  persistedSendPhase: "send" | null;
}): "review" | "send" {
  if (params.urlPhase === "send" && params.canAccessSendActions) return "send";
  if (params.handoffOpenPhase === "send" && params.canAccessSendActions) return "send";
  if (params.handoffOpenPhase === "review") return "review";
  if (params.premiumIntent === "review") return "review";
  if (params.premiumIntent === "signature" && params.canAccessSendActions) return "send";
  if (params.persistedSendPhase === "send" && params.canAccessSendActions) return "send";
  return "review";
}
