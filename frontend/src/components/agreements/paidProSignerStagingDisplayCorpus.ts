/**
 * Frozen paid Pro review display corpus while signer metadata is staged locally.
 * Prevents keystroke-driven re-render / repair of the accepted SoT body.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { getPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";

let frozenPlain = "";
let frozenSotHash = "";
let frozenSignerOverlayKey = "";

export function buildPaidProSignerStagingOverlayCacheKey(
  parties: readonly { signerName?: string; signerTitle?: string; signerEmail?: string; partyAddress?: string }[],
): string {
  return parties
    .map((p) =>
      [p.signerName ?? "", p.signerTitle ?? "", p.signerEmail ?? "", p.partyAddress ?? ""]
        .map((v) => v.trim())
        .join("|"),
    )
    .join(";");
}

export function freezePaidProSignerStagingDisplayCorpus(
  plain: string,
  sotHash: string,
  signerOverlayKey = "",
): void {
  const trimmed = (plain || "").trim();
  const hash = (sotHash || "").trim();
  if (trimmed.length < PAID_PRO_AUTHORITY_MIN_LEN || !hash) return;
  frozenPlain = trimmed;
  frozenSotHash = hash;
  frozenSignerOverlayKey = signerOverlayKey.trim();
}

export function readPaidProSignerStagingDisplayCorpus(): {
  plain: string;
  sotHash: string;
  signerOverlayKey: string;
} | null {
  if (frozenPlain.length < PAID_PRO_AUTHORITY_MIN_LEN || !frozenSotHash) return null;
  return { plain: frozenPlain, sotHash: frozenSotHash, signerOverlayKey: frozenSignerOverlayKey };
}

export function clearPaidProSignerStagingDisplayCorpus(): void {
  frozenPlain = "";
  frozenSotHash = "";
  frozenSignerOverlayKey = "";
}

/** Return cached display plain when staging is active and SoT hash is unchanged. */
export function resolvePaidProSignerStagingDisplayPlain(args: {
  stagingActive: boolean;
  resolveFresh: () => string;
  signerOverlayKey?: string;
}): string {
  if (!args.stagingActive) {
    return args.resolveFresh();
  }
  const sot = getPaidProSourceOfTruth();
  const sotHash = sot?.hash ?? "";
  const overlayKey = (args.signerOverlayKey ?? "").trim();
  const cached = readPaidProSignerStagingDisplayCorpus();
  if (
    cached &&
    cached.sotHash === sotHash &&
    cached.plain.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
    cached.signerOverlayKey === overlayKey
  ) {
    return cached.plain;
  }
  const fresh = args.resolveFresh().trim();
  if (fresh.length >= PAID_PRO_AUTHORITY_MIN_LEN && sotHash) {
    freezePaidProSignerStagingDisplayCorpus(fresh, sotHash, overlayKey);
  }
  return fresh;
}

export function paidProSignerStagingDisplayUsesFrozenCorpus(signerOverlayKey?: string): boolean {
  const sot = getPaidProSourceOfTruth();
  const cached = readPaidProSignerStagingDisplayCorpus();
  const overlayKey = (signerOverlayKey ?? "").trim();
  return Boolean(
    cached &&
      sot?.hash &&
      cached.sotHash === sot.hash &&
      cached.plain.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
      cached.signerOverlayKey === overlayKey,
  );
}

export function resolvePaidProStagingBaselinePlain(): string {
  const cached = readPaidProSignerStagingDisplayCorpus();
  if (cached?.plain) return cached.plain;
  return getPaidProSourceOfTruthText().trim();
}
