import { getLegalPrivacyInquiryEmail } from "./legalConstants";

/**
 * Operator-only startup check: production bundles should bake in a privacy/data-rights inbox.
 * Emits `console.warn` only — never a user-visible banner.
 */
export function warnIfProductionMissingPrivacyInbox(): void {
  if (!import.meta.env.PROD) return;
  if (getLegalPrivacyInquiryEmail()) return;
  console.warn(
    "[LawDog operator] This production build has no VITE_LAWDOG_PRIVACY_EMAIL. " +
      "Privacy Policy and related pages will not show a direct privacy/data-rights mailbox. " +
      "Set VITE_LAWDOG_PRIVACY_EMAIL at frontend build time for production LawDog sites " +
      "(see docs/DEPLOY.md and docs/architecture/ENV_TOPOLOGY.md).",
  );
}
