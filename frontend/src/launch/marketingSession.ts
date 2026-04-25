/**
 * Fresh marketing entry: no stale intake from prior agreements in this browser tab.
 * Call from `/` on mount and before “new agreement” entry points.
 */

import { clearAgreementCreatorIntakeStorage } from "../components/agreements/agreementIntakeStorage";
import { resetHeroHandoffForCreateNavigationWithoutPayload } from "./heroIntakePrefill";

export const CLAW_MARKETING_SESSION_KEY = "claw_marketing_session_v1";

export function getOrCreateMarketingSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem(CLAW_MARKETING_SESSION_KEY);
    if (!id) {
      id = `m_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      sessionStorage.setItem(CLAW_MARKETING_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `m_fallback_${Date.now()}`;
  }
}

/** Start a clean marketing session: new id + clear persisted creator prompt + hero handoff transport. */
export function prepareFreshMarketingEntry(): string {
  if (typeof sessionStorage !== "undefined") {
    try {
      const id = `m_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      sessionStorage.setItem(CLAW_MARKETING_SESSION_KEY, id);
    } catch {
      /* ignore */
    }
  }
  clearAgreementCreatorIntakeStorage();
  resetHeroHandoffForCreateNavigationWithoutPayload();
  return getOrCreateMarketingSessionId();
}
