/**
 * Single Paid Pro authority ceiling for legal-party count across intake, freeze, handoff, and UI.
 */

/** Maximum legal parties honored end-to-end by Paid Pro authority (signer count, slots, frozen manifest). */
export const PAID_PRO_AUTHORITY_MAX_PARTIES = 5;

/**
 * GTM product UX ceiling for signing parties in clarification copy and Add-party UI.
 * Authority may still honor {@link PAID_PRO_AUTHORITY_MAX_PARTIES} for legacy corpora.
 */
export const PAID_PRO_GTM_MAX_SIGNING_PARTIES = 4;

/** Deterministic quad-party recovery fallback always synthesizes exactly four parties. */
export const PAID_PRO_QUAD_PARTY_FALLBACK_COUNT = 4;
