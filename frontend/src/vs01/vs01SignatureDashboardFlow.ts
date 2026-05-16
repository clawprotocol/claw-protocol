/**
 * Canonical Paid Pro → VS01 → agreement workspace (dashboard) flow.
 * Used to suppress review-phase telemetry and block review displayPhase bleed on the sender-first path.
 */
import { readAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { PAID_PRO_VS01_POST_SIGN_SESSION_KEY } from "./vs01PaidProPostSignHandoff";

function readUrlSearch(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

/** True while LawDog session indicates post–VS01 Pro handoff (any agreement id). */
export function hasActivePaidProVs01PostSignHandoffSession(): boolean {
  try {
    const raw = sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as { v?: unknown; agreementId?: unknown };
    return o?.v === 1 && Boolean(String(o.agreementId || "").trim());
  } catch {
    return false;
  }
}

/**
 * Suppress `[review-handoff]`, `[review-gate]`, `[review-editor-mount]` while VS01 sender-first
 * or post-sign dashboard handoff is active.
 */
export function shouldSuppressReviewPipelineTelemetry(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  if (p.includes("/app/esign")) return true;
  const q = readUrlSearch();
  if (q?.get("agreement_bridge") === "1") return true;
  if (q?.get("vs01_saved") === "1") return true;
  if (q?.get("vs01_packet_ready") === "1") return true;
  const br = readAgreementVs01BridgeSession();
  if (br?.source === "paid_pro_sender_first") return true;
  if (hasActivePaidProVs01PostSignHandoffSession()) return true;
  return false;
}

/** Block `displayPhase === "review"` in AgreementBuilderIntake for VS01 / bridge entry only. */
export function shouldBlockIntakeReviewDisplayPhaseForVs01(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  if (p.includes("/app/esign")) return true;
  const q = readUrlSearch();
  if (q?.get("agreement_bridge") === "1") return true;
  const br = readAgreementVs01BridgeSession();
  if (br?.source === "paid_pro_sender_first") return true;
  return false;
}
