import type { LawdogViewerContext } from "./lawdogViewerContext";

/** Low-risk promo on recipient approved/waiting screen — no account or billing language. */
export const RECIPIENT_APPROVED_LAWDOG_PROMO_LINE =
  "Reviewed with LawDog — plain-English agreements, review, and signing.";

/** Public recipient / QA simulation never show creator account chrome. */
export function resolveRecipientReviewHeaderAside(_viewerContext: LawdogViewerContext): null {
  return null;
}
