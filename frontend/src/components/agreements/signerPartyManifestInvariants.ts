/**
 * Post-acceptance signer party manifest hash invariants (dev/test diagnostics).
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function fingerprintSignerPartyManifest(names: readonly (string | null | undefined)[]): string {
  const payload = names
    .map((n) => norm(String(n ?? "")))
    .filter((n) => n.length > 0);
  return fingerprintAgreementBody(JSON.stringify(payload));
}

export function logSignerPartyManifestHashInvariant(args: {
  authoritativeHash: string;
  signerSetupHash?: string | null;
  reviewLinkHash?: string | null;
  vs01Hash?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-party-manifest-hash]", args);
}

export function logUserEditedSignerPartyManifest(args: {
  oldHash: string;
  newHash: string;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[user-edited-signer-party-manifest]", args);
}

export function assertSignerPartyManifestHashesMatch(args: {
  label: string;
  authoritativeNames: readonly string[];
  signerSetupNames: readonly string[];
  reviewLinkNames?: readonly string[];
  vs01Names?: readonly string[];
  allowUserEdit?: boolean;
  userEditSurface?: string;
}): void {
  const authoritativeHash = fingerprintSignerPartyManifest(args.authoritativeNames);
  const signerSetupHash = fingerprintSignerPartyManifest(args.signerSetupNames);
  const reviewLinkHash = args.reviewLinkNames
    ? fingerprintSignerPartyManifest(args.reviewLinkNames)
    : null;
  const vs01Hash = args.vs01Names ? fingerprintSignerPartyManifest(args.vs01Names) : null;

  logSignerPartyManifestHashInvariant({
    authoritativeHash,
    signerSetupHash,
    reviewLinkHash,
    vs01Hash,
  });

  const isTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;

  if (args.allowUserEdit && authoritativeHash !== signerSetupHash) {
    logUserEditedSignerPartyManifest({
      oldHash: authoritativeHash,
      newHash: signerSetupHash,
      surface: args.userEditSurface || args.label,
    });
    return;
  }

  if (authoritativeHash !== signerSetupHash && (isTest || isDev)) {
    throw new Error(
      `[signer-party-manifest-hash-mismatch] ${args.label}: authoritative !== signerSetup`,
    );
  }
  if (reviewLinkHash && reviewLinkHash !== authoritativeHash && (isTest || isDev)) {
    throw new Error(
      `[signer-party-manifest-hash-mismatch] ${args.label}: reviewLink !== authoritative`,
    );
  }
  if (vs01Hash && vs01Hash !== authoritativeHash && (isTest || isDev)) {
    throw new Error(`[signer-party-manifest-hash-mismatch] ${args.label}: vs01 !== authoritative`);
  }
}
