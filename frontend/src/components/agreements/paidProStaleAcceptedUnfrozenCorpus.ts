/**
 * Clears accepted-but-unfrozen Pro corpus from every store that can affect render, retry,
 * commit, diagnostics, or handoff after structural SoT establishment failure (TEST421).
 */

import { clearAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
import { clearPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearAcceptedServerFullDraftLatchAndSessionFrozenBodies } from "./premiumAcceptancePolicy";
import { quarantineAcceptedProCorpusInPremiumCompletionSnapshot } from "./premiumCompletionStorage";

export type ClearStaleAcceptedButUnfrozenProCorpusOpts = {
  rejectedCorpusText?: string | null;
  reason?: string | null;
};

export function clearStaleAcceptedButUnfrozenProCorpus(
  opts?: ClearStaleAcceptedButUnfrozenProCorpusOpts,
): void {
  clearPartialPaidProAuthoritativeState();
  clearAuthoritativeAgreementDocument();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearPaidProPipelineAcceptedCorpusHash();
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
  quarantineAcceptedProCorpusInPremiumCompletionSnapshot();

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    const rejected = (opts?.rejectedCorpusText || "").trim();
    // eslint-disable-next-line no-console
    console.info("[paid-pro-stale-unfrozen-cleared]", {
      reason: opts?.reason ?? null,
      rejectedLen: rejected.length,
      rejectedHash: rejected.length > 0 ? fingerprintAgreementBody(rejected) : null,
    });
  }
}

export function rejectedProCorpusHash(text: string | null | undefined): string | null {
  const t = (text || "").trim();
  return t.length > 0 ? fingerprintAgreementBody(t) : null;
}
