/**
 * LawDog legal identity — operator entity and governing-law posture for Terms, Privacy, Affiliate Terms,
 * LegalDocLayout, and other compliance surfaces. Product branding remains {@link LEGAL_PRODUCT_NAME}.
 */
export const LEGAL_OPERATING_ENTITY = "Peaceful Journey LLC";
export const LEGAL_PRODUCT_NAME = "LawDog";
/** Home-base operating state for governing-law and venue references in legal documents. */
export const LEGAL_GOVERNING_LAW_STATE = "Oklahoma";
/** Website Terms of Service — bump when counsel publishes a material revision. */
export const LEGAL_WEBSITE_TERMS_VERSION = "1.0";

/**
 * Privacy and data-rights contact for the Privacy Policy (user-facing `mailto:` and Privacy/Terms “How to reach us”).
 *
 * **Production:** embed a monitored inbox at **frontend build time** via the standard Vite privacy-email variable for
 * this repo (see `frontend/.env.example` and `docs/architecture/ENV_TOPOLOGY.md` — implemented as `import.meta.env.VITE_LAWDOG_PRIVACY_EMAIL`).
 * Returns null when unset; the Policy then directs users to published support/privacy channels (no env names in UI).
 * Non-production builds without this variable log a console-only operator warning at startup (`privacyInboxDeployGuard.ts`). Production browsers do not emit that warning.
 */
export function getLegalPrivacyInquiryEmail(): string | null {
  const raw = import.meta.env.VITE_LAWDOG_PRIVACY_EMAIL;
  if (raw == null || raw === undefined) return null;
  const t = String(raw).trim();
  return t.length > 0 ? t : null;
}
