export type RecipientRedlineNavigationLogTag =
  | "recipient-redline-card-click"
  | "recipient-redline-chip-click"
  | "recipient-redline-target-resolved"
  | "recipient-redline-target-missing"
  | "recipient-redline-scroll-complete";

/** DEV-only structured logs for recipient redline navigation QA. */
export function devLogRecipientRedlineNavigation(tag: RecipientRedlineNavigationLogTag, payload: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional DEV-only navigation instrumentation
    console.log(`[${tag}]`, payload);
  }
}
