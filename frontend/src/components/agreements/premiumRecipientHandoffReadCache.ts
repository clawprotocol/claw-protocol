/**
 * Memoize premium recipient handoff reads — avoid re-parsing sessionStorage on every render.
 */

import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import { readPremiumRecipientHandoff } from "./premiumPartyNamesHandoff";

const KEY_V2 = "claw_premium_recipient_handoff_v2";

let readCache: { storageKey: string; handoff: PremiumRecipientHandoffV2 | null } = {
  storageKey: "",
  handoff: null,
};

export function readPremiumRecipientHandoffMemo(): PremiumRecipientHandoffV2 | null {
  if (typeof sessionStorage === "undefined") return readPremiumRecipientHandoff();
  try {
    const storageKey = sessionStorage.getItem(KEY_V2) ?? "";
    if (storageKey === readCache.storageKey) return readCache.handoff;
    const handoff = readPremiumRecipientHandoff();
    readCache = { storageKey, handoff };
    return handoff;
  } catch {
    return readPremiumRecipientHandoff();
  }
}

export function invalidatePremiumRecipientHandoffReadCache(): void {
  readCache = { storageKey: "", handoff: null };
}
