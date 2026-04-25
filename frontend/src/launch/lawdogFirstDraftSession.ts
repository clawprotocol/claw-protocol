/** Client-only: first workspace draft not yet created this browser session. */

export const LAWDOG_HAS_CREATED_DRAFT_KEY = "lawdog_has_created_draft";

export function isFirstLawdogSession(): boolean {
  try {
    return !sessionStorage.getItem(LAWDOG_HAS_CREATED_DRAFT_KEY);
  } catch {
    return true;
  }
}

export function markLawdogDraftCreated(): void {
  try {
    sessionStorage.setItem(LAWDOG_HAS_CREATED_DRAFT_KEY, "true");
  } catch {
    /* ignore */
  }
}
