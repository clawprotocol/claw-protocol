/**
 * Short-lived session copy so the checkout page can echo the same agreement-specific
 * reasons the user saw on the upgrade decision surface (create-flow full draft).
 */

const KEY = "claw_upgrade_checkout_context_v1";

export type UpgradeCheckoutContextV1 = {
  version: 1;
  savedAt: number;
  reasons: string[];
  /** Title or party line for “Completing: …” */
  completionLabel?: string;
  /** Same intent signals as upgrade teaser (for loss-aversion line on checkout). */
  intentSignals?: string[];
};

export type StashUpgradeCheckoutMeta = {
  completionLabel?: string;
  intentSignals?: readonly string[];
};

export function stashUpgradeCheckoutContext(
  reasons: readonly string[],
  meta?: StashUpgradeCheckoutMeta,
): void {
  try {
    const body: UpgradeCheckoutContextV1 = {
      version: 1,
      savedAt: Date.now(),
      reasons: Array.from(reasons).filter(Boolean).slice(0, 6),
      completionLabel: meta?.completionLabel?.trim() || undefined,
      intentSignals: meta?.intentSignals?.length
        ? Array.from(meta.intentSignals).map(String).slice(0, 8)
        : undefined,
    };
    sessionStorage.setItem(KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

export function readUpgradeCheckoutContext(): UpgradeCheckoutContextV1 | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpgradeCheckoutContextV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.reasons)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearUpgradeCheckoutContext(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
