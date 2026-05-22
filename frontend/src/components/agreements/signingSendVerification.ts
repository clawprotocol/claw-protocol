/**
 * Pre-send signing packet / version verification.
 */

import { fingerprintAgreementBody, resolveSigningPacketStale } from "./guidedDealCompletion/guidedSigningPacketVersion";

export type SigningSendVerificationResult = {
  ok: boolean;
  blockReason: string | null;
  fixLabel: string | null;
};

export function verifySigningSendReady(args: {
  agreementBodyPlain: string;
  authoritativeVersionId: string | null;
  packetPrepared: boolean;
  signerCount: number;
  fieldsPlacedCount: number;
}): SigningSendVerificationResult {
  const bodyHash = fingerprintAgreementBody(args.agreementBodyPlain);
  const stale = resolveSigningPacketStale({
    currentVersionId: args.authoritativeVersionId,
    currentBodyHash: bodyHash,
  });

  if (stale.stale && stale.preparedVersion) {
    // eslint-disable-next-line no-console
    console.warn("[signing-send-blocked-stale-packet]", stale);
    return {
      ok: false,
      blockReason: "stale_packet",
      fixLabel: "Refresh signing packet",
    };
  }

  if (args.packetPrepared && args.fieldsPlacedCount <= 0) {
    // eslint-disable-next-line no-console
    console.warn("[signing-send-blocked-missing-fields]", {
      signerCount: args.signerCount,
      fieldsPlacedCount: args.fieldsPlacedCount,
    });
    return {
      ok: false,
      blockReason: "missing_fields",
      fixLabel: "Review field placement",
    };
  }

  if (args.signerCount < 1) {
    return {
      ok: false,
      blockReason: "missing_signer",
      fixLabel: "Add missing email",
    };
  }

  // eslint-disable-next-line no-console
  console.info("[signing-version-verified-before-send]", {
    versionIdShort: (args.authoritativeVersionId || "").slice(0, 8) || null,
    bodyHashShort: bodyHash.slice(0, 12),
    packetPrepared: args.packetPrepared,
    fieldsPlacedCount: args.fieldsPlacedCount,
  });

  return { ok: true, blockReason: null, fixLabel: null };
}
