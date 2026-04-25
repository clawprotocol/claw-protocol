import { resetAgreementsCreatedForLocalDev } from "../access/usageMeter";
import { isLocalhostDevMonetizationRelax } from "../monetization/lawDogMonetization";

const SIMPLE_SEND_UNLOCK_PREFIX = "claw_simple_send_unlocked_";

/**
 * One-shot on app boot: clear stale client gating so localhost E2E tests repeat cleanly.
 * Production and vitest never run this (relax is false).
 */
export function initLawdogLocalhostDevGating(): void {
  if (!isLocalhostDevMonetizationRelax()) return;
  resetAgreementsCreatedForLocalDev();
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SIMPLE_SEND_UNLOCK_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  console.info("[LawDog dev] Reset local free-use state for localhost testing");
}
