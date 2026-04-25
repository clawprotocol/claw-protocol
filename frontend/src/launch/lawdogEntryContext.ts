/** Client-only bridge from marketing home → workspace (sessionStorage, no new APIs). */

export const LAWDOG_ENTRY_CONTEXT_KEY = "lawdog_entry_context";
const LAWDOG_FOCUS_CREATE_INTAKE_KEY = "lawdog_focus_create_intake";

export type LawdogEntryContext = "new" | "drafting" | "returning";

export function setLawdogEntryContext(ctx: LawdogEntryContext): void {
  try {
    sessionStorage.setItem(LAWDOG_ENTRY_CONTEXT_KEY, ctx);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getLawdogEntryContextStored(): LawdogEntryContext | null {
  try {
    const v = sessionStorage.getItem(LAWDOG_ENTRY_CONTEXT_KEY);
    if (v === "new" || v === "drafting" || v === "returning") return v;
    return null;
  } catch {
    return null;
  }
}

export function clearLawdogEntryContext(): void {
  try {
    sessionStorage.removeItem(LAWDOG_ENTRY_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

/** After workspace redirects to create, intake should receive focus once. */
export function setLawdogFocusCreateIntakeAfterNavigation(): void {
  try {
    sessionStorage.setItem(LAWDOG_FOCUS_CREATE_INTAKE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeLawdogFocusCreateIntake(): boolean {
  try {
    if (sessionStorage.getItem(LAWDOG_FOCUS_CREATE_INTAKE_KEY) !== "1") return false;
    sessionStorage.removeItem(LAWDOG_FOCUS_CREATE_INTAKE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Effective entry story for workspace hero + nudges.
 * Stored value wins; if unset and the index already has rows, treat as returning.
 */
export function resolveLawdogEntryContext(recentLen: number, indexLoading: boolean): LawdogEntryContext | null {
  const stored = getLawdogEntryContextStored();
  if (stored) return stored;
  if (!indexLoading && recentLen > 0) return "returning";
  return null;
}

/** Homepage primary CTA label — reads last persisted intent only (no index fetch on marketing). */
export function getLawdogHomepagePrimaryCtaLabel(): string {
  const s = getLawdogEntryContextStored();
  if (s === "returning") return "Continue your agreements";
  if (s === "drafting") return "Continue your draft";
  return "Start your agreement";
}
