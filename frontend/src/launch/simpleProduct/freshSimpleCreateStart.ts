/**
 * True when /app/create should use input-first + delayed-preview onboarding
 * (not continuity, resume, non-home hero prefill, or example-template scaffolds).
 * Homepage → create handoff (`handoffFromHome`) stays fresh so complexity runs only after in-app submit.
 */
export type FreshSimpleCreateStartInput = {
  /** Quick-send or similar continuity panel active */
  quickSendTypedArrival: boolean;
  /** Marketing homepage → `/app/create` navigation (with or without prefilled text) */
  handoffFromHome: boolean;
  /** Non-empty hero text seeds the intake (structured entry from another surface) */
  heroPrefillText: string | undefined;
  /** “Example structure” template — heavy pre-filled scaffold */
  usingTemplate: boolean;
  /**
   * Persisted browser draft will hydrate the textarea (`initialIntakeText === undefined`
   * and storage non-empty). False when parent forces empty initial (e.g. paste-only).
   */
  persistedIntakeWillApply: boolean;
  /** Wizard / create resume banner — editing or reopening prior prep */
  resumeNotice?: string | null;
};

export function isFreshSimpleCreateStart(i: FreshSimpleCreateStartInput): boolean {
  if (i.resumeNotice?.trim()) return false;
  if (i.quickSendTypedArrival) return false;
  if (i.usingTemplate) return false;
  if (i.persistedIntakeWillApply) return false;
  /** Marketing homepage → `/app/create` (including prefilled text): keep first-run simple UX until user submits here. */
  if (i.handoffFromHome) return true;
  if (Boolean(i.heroPrefillText?.trim())) return false;
  return true;
}
