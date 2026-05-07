import { getLegalPrivacyInquiryEmail } from "./legalConstants";

/**
 * Non-production startup check: local/staging builds should bake in a privacy/data-rights inbox.
 * Does not log in production browser sessions (avoids operator noise on recipient-facing consoles).
 * Use a staging build or CI with `import.meta.env.DEV` / non-`PROD` to see this warning.
 */
export function warnIfProductionMissingPrivacyInbox(): void {
  if (import.meta.env.PROD) return;
  if (getLegalPrivacyInquiryEmail()) return;
  console.warn(
    "[LawDog operator] This build has no VITE_LAWDOG_PRIVACY_EMAIL. " +
      "Privacy Policy and related pages will not show a direct privacy/data-rights mailbox. " +
      "Set VITE_LAWDOG_PRIVACY_EMAIL at frontend build time for production LawDog sites " +
      "(see docs/DEPLOY.md and docs/architecture/ENV_TOPOLOGY.md).",
  );
}
