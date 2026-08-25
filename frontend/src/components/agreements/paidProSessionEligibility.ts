/**
 * Current-session Pro entitlement — Paid Pro Source of Truth may only be established when
 * the user clicked Pro in this session and checkout / QA bypass completed for the same generation id.
 */

import {
  bumpAgreementGenerationId,
  getOrInitSessionAgreementGenerationId,
  getSessionAgreementGenerationId,
} from "../../lib/agreementGenerationId";

const FREE_STARTER_SESSION_KEY = "claw_free_starter_session_v1";
const PRO_INTENT_SESSION_KEY = "claw_pro_intent_session_v1";
const PRO_ENTITLEMENT_SESSION_KEY = "claw_pro_entitlement_session_v1";

type SessionMarkerV1 = {
  v: 1;
  generationId: string;
  markedAt: number;
};

export type ProEntitlementSource =
  | "settled_checkout"
  | "qa_bypass"
  | "entitled_rewrite"
  | "pipeline_accepted";

export type PaidProSourceOfTruthEstablishmentDecision = {
  allowed: boolean;
  reason: string;
  hasProEntitlement: boolean;
  hasFreeStarterSession: boolean;
  generationId: string;
};

function readMarker(key: string): SessionMarkerV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionMarkerV1>;
    if (
      parsed?.v !== 1 ||
      typeof parsed.generationId !== "string" ||
      !parsed.generationId.trim() ||
      typeof parsed.markedAt !== "number" ||
      !Number.isFinite(parsed.markedAt)
    ) {
      return null;
    }
    return parsed as SessionMarkerV1;
  } catch {
    return null;
  }
}

function writeMarker(key: string, generationId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const marker: SessionMarkerV1 = {
      v: 1,
      generationId: generationId.trim(),
      markedAt: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(marker));
  } catch {
    /* ignore */
  }
}

function clearMarker(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function clearCurrentSessionProEntitlementMarkers(): void {
  clearMarker(PRO_INTENT_SESSION_KEY);
  clearMarker(PRO_ENTITLEMENT_SESSION_KEY);
  clearMarker(FREE_STARTER_SESSION_KEY);
}

export function bumpAgreementGenerationIdForFreshSession(): string {
  return bumpAgreementGenerationId();
}

/** Homepage / create free starter submit — latches this generation as starter-only until Pro completes. */
export function markCurrentSessionFreeStarterIntent(): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  writeMarker(FREE_STARTER_SESSION_KEY, generationId);
  clearMarker(PRO_INTENT_SESSION_KEY);
  clearMarker(PRO_ENTITLEMENT_SESSION_KEY);
}

export function hasCurrentSessionFreeStarterIntent(): boolean {
  const marker = readMarker(FREE_STARTER_SESSION_KEY);
  if (!marker) return false;
  return marker.generationId === getOrInitSessionAgreementGenerationId();
}

/**
 * Path rule: a painted free dump’s Continue with Pro opens existing checkout.
 * Leftover checkout identity / leftover guest quota must not treat this dump as
 * already paid — that no-ops the CTA or already-pro-bypasses into billing↔create.
 */
export function paintedFreeDumpOpensExistingCheckout(): boolean {
  return hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement();
}

/** User clicked a Pro upgrade CTA in this create session. */
export function markCurrentSessionProIntent(): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  writeMarker(PRO_INTENT_SESSION_KEY, generationId);
  clearMarker(FREE_STARTER_SESSION_KEY);
}

export function hasCurrentSessionProIntent(): boolean {
  const marker = readMarker(PRO_INTENT_SESSION_KEY);
  if (!marker) return false;
  return marker.generationId === getOrInitSessionAgreementGenerationId();
}

/** Checkout settled or QA bypass completed for the current generation. */
export function markCurrentSessionProEntitlementComplete(opts?: {
  source?: ProEntitlementSource;
  generationId?: string | null;
}): void {
  const generationId = (opts?.generationId ?? getOrInitSessionAgreementGenerationId()).trim();
  if (!generationId) return;
  writeMarker(PRO_ENTITLEMENT_SESSION_KEY, generationId);
  if (!readMarker(PRO_INTENT_SESSION_KEY)) {
    writeMarker(PRO_INTENT_SESSION_KEY, generationId);
  }
  clearMarker(FREE_STARTER_SESSION_KEY);
}

export function hasCurrentSessionProEntitlement(opts?: { generationId?: string | null }): boolean {
  const intent = readMarker(PRO_INTENT_SESSION_KEY);
  const entitlement = readMarker(PRO_ENTITLEMENT_SESSION_KEY);
  if (!intent || !entitlement) return false;
  if (intent.generationId !== entitlement.generationId) return false;
  const currentGen = getOrInitSessionAgreementGenerationId();
  if (intent.generationId !== currentGen) return false;
  const requested = (opts?.generationId ?? "").trim();
  if (requested && requested !== intent.generationId) return false;
  return true;
}

export function evaluatePaidProSourceOfTruthEstablishment(args?: {
  source?: string | null;
  agreementGenerationId?: string | null;
  allowUserApprovedRevision?: boolean;
  hasExistingSourceOfTruth?: boolean;
  /** Paid pipeline validation + freeze already succeeded for this corpus. */
  pipelineSessionAccepted?: boolean;
}): PaidProSourceOfTruthEstablishmentDecision {
  if (args?.pipelineSessionAccepted) {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "pipeline_accepted" });
  }
  const generationId = getSessionAgreementGenerationId();
  const hasProEntitlement = hasCurrentSessionProEntitlement({
    generationId: args?.agreementGenerationId ?? undefined,
  });
  const hasFreeStarterSession =
    hasCurrentSessionFreeStarterIntent() && !hasProEntitlement;

  if (args?.allowUserApprovedRevision && args?.hasExistingSourceOfTruth && hasProEntitlement) {
    return {
      allowed: true,
      reason: "user_approved_revision_with_entitlement",
      hasProEntitlement,
      hasFreeStarterSession,
      generationId,
    };
  }

  if (hasProEntitlement) {
    return {
      allowed: true,
      reason: "current_session_pro_entitlement",
      hasProEntitlement,
      hasFreeStarterSession,
      generationId,
    };
  }

  if (hasFreeStarterSession) {
    return {
      allowed: false,
      reason: "free_starter_session_without_pro_entitlement",
      hasProEntitlement,
      hasFreeStarterSession,
      generationId,
    };
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    return {
      allowed: true,
      reason: "test_mode_without_free_starter_latch",
      hasProEntitlement,
      hasFreeStarterSession,
      generationId,
    };
  }

  return {
    allowed: false,
    reason: "missing_current_session_pro_entitlement",
    hasProEntitlement,
    hasFreeStarterSession,
    generationId,
  };
}

export function logPaidProSourceOfTruthEstablishmentAttempt(args: {
  source: string;
  allowed: boolean;
  reason: string;
  hasProEntitlement: boolean;
  hasFreeStarterSession: boolean;
  generationId?: string | null;
  agreementGenerationId?: string | null;
  textLen?: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-sot-establishment]", {
    source: args.source,
    accepted: args.allowed,
    reason: args.reason,
    hasProEntitlement: args.hasProEntitlement,
    hasFreeStarterSession: args.hasFreeStarterSession,
    generationId: args.generationId ?? null,
    agreementGenerationId: args.agreementGenerationId ?? null,
    textLen: args.textLen ?? null,
  });
}
