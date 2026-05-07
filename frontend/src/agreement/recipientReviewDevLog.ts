/** Dev / explicit-diagnostics only — quiet in production browser sessions. */
export const RECIPIENT_REVIEW_DEV_DIAG_ENABLED =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    window.localStorage.getItem("lawdogRecipientReviseDiag") === "1");

export function recipientReviewDevInfo(...args: unknown[]): void {
  if (!RECIPIENT_REVIEW_DEV_DIAG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.info(...args);
}

export function recipientReviewDevWarn(...args: unknown[]): void {
  if (!RECIPIENT_REVIEW_DEV_DIAG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.warn(...args);
}
