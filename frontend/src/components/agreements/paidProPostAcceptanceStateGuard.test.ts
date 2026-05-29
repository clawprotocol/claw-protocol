import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  resolveProDeliveryTrackCanonicalCorpus,
  shouldBlockStarterRegenerationAfterPaidAuthority,
  shouldSuppressPremiumProcessingModalAfterPaidAuthority,
} from "./paidProPostAcceptanceStateGuard";
import { canChooseProDeliveryTrack } from "./proDeliveryTrackState";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

const PAID_BODY = `PRO AGREEMENT. ${"Substantive clause. ".repeat(900)}`;

describe("paidProPostAcceptanceStateGuard", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("blocks starter regeneration when paid SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
    expect(shouldSuppressPremiumProcessingModalAfterPaidAuthority()).toBe(true);
  });

  it("delivery track canonical corpus derives from paid SoT when frozen corpus absent", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const corpus = resolveProDeliveryTrackCanonicalCorpus();
    expect(corpus.hasCanonicalCorpus).toBe(true);
    expect(corpus.hash).toBe(record.hash);
    expect(["frozen_canonical", "paid_pro_source_of_truth"]).toContain(corpus.source);
  });

  it("canChooseProDeliveryTrack stays true during recipient_setup_required when SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
  });

  it("review/signer/reviewer hashes stay stable from SoT across recipient_setup_required phase", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const reviewHash = fingerprintAgreementBody(PAID_BODY);
    const delivery = resolveProDeliveryTrackCanonicalCorpus();
    expect(delivery.hash).toBe(record.hash);
    expect(reviewHash).toBe(fingerprintAgreementBody(getPaidProSourceOfTruth()?.text ?? ""));
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
  });
});

describe("home create submit guard contract", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("paid SoT active implies home auto-generate skip (no starter rebuild)", async () => {
    const { shouldSkipHomeAutoGenerateForStoredReview } = await import("./createReviewRefreshRestore");
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
  });
});
