/**
 * Frozen paid Pro review display corpus while signer metadata is staged locally.
 * Prevents keystroke-driven re-render / repair of the accepted SoT body.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { getPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";

let frozenPlain = "";
let frozenSotHash = "";

export function freezePaidProSignerStagingDisplayCorpus(plain: string, sotHash: string): void {
  const trimmed = (plain || "").trim();
  const hash = (sotHash || "").trim();
  if (trimmed.length < PAID_PRO_AUTHORITY_MIN_LEN || !hash) return;
  frozenPlain = trimmed;
  frozenSotHash = hash;
}

export function readPaidProSignerStagingDisplayCorpus(): { plain: string; sotHash: string } | null {
  if (frozenPlain.length < PAID_PRO_AUTHORITY_MIN_LEN || !frozenSotHash) return null;
  return { plain: frozenPlain, sotHash: frozenSotHash };
}

export function clearPaidProSignerStagingDisplayCorpus(): void {
  frozenPlain = "";
  frozenSotHash = "";
}

/** Return cached display plain when staging is active and SoT hash is unchanged. */
export function resolvePaidProSignerStagingDisplayPlain(args: {
  stagingActive: boolean;
  resolveFresh: () => string;
}): string {
  if (!args.stagingActive) {
    return args.resolveFresh();
  }
  const sot = getPaidProSourceOfTruth();
  const sotHash = sot?.hash ?? "";
  const cached = readPaidProSignerStagingDisplayCorpus();
  if (cached && cached.sotHash === sotHash && cached.plain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return cached.plain;
  }
  const fresh = args.resolveFresh().trim();
  if (fresh.length >= PAID_PRO_AUTHORITY_MIN_LEN && sotHash) {
    freezePaidProSignerStagingDisplayCorpus(fresh, sotHash);
  }
  return fresh;
}

export function paidProSignerStagingDisplayUsesFrozenCorpus(): boolean {
  const sot = getPaidProSourceOfTruth();
  const cached = readPaidProSignerStagingDisplayCorpus();
  return Boolean(
    cached &&
      sot?.hash &&
      cached.sotHash === sot.hash &&
      cached.plain.length >= PAID_PRO_AUTHORITY_MIN_LEN,
  );
}

export function resolvePaidProStagingBaselinePlain(): string {
  const cached = readPaidProSignerStagingDisplayCorpus();
  if (cached?.plain) return cached.plain;
  return getPaidProSourceOfTruthText().trim();
}
