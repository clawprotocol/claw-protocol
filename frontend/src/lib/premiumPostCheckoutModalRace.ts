/**
 * After checkout, `ensurePremiumCompletion` can resolve after a **soft** modal timeout (30s) that
 * only shows a failopen draft — we still apply a late success. If the user **dismissed** the
 * post-checkout wait UI, do not override their choice with a late server result.
 */
export function canApplyLatePremiumCompletionFromModal(args: {
  runIsStillCurrent: boolean;
  userDismissedPostCheckoutWait: boolean;
  /** Network/generation retryable results must always land recovery UI even if the run unmounted. */
  retryableResult?: boolean;
}): { apply: boolean; reason: "ok" | "stale_unmounted" | "user_dismissed" } {
  if (args.retryableResult) {
    return { apply: true, reason: "ok" };
  }
  if (!args.runIsStillCurrent) {
    return { apply: false, reason: "stale_unmounted" };
  }
  if (args.userDismissedPostCheckoutWait) {
    return { apply: false, reason: "user_dismissed" };
  }
  return { apply: true, reason: "ok" };
}
