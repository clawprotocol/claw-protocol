/**
 * Single Paid Pro authority ceiling for legal-party count across intake, freeze, handoff, and UI.
 */

/** Maximum legal parties honored end-to-end by Paid Pro authority (signer count, slots, frozen manifest). */
export const PAID_PRO_AUTHORITY_MAX_PARTIES = 5;

/** Deterministic quad-party recovery fallback always synthesizes exactly four parties. */
export const PAID_PRO_QUAD_PARTY_FALLBACK_COUNT = 4;
