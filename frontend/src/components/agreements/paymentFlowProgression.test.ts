import { describe, expect, it, vi } from "vitest";
import {
  corpusIntegrityFromStructureDefects,
  isAuthoritativePremiumSnapshotHydratable,
  shouldResolvePostCheckoutFromAuthoritativeSnapshot,
  snapshotReadyForPostCheckoutUnlock,
  withSigningPrepareTimeout,
} from "./paymentFlowProgression";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";

function snap(partial: Partial<PremiumCompletionSnapshot> = {}): PremiumCompletionSnapshot {
  return {
    savedAt: Date.now(),
    premiumDraft: { title: "T", parties: [] },
    premiumParties: [],
    recipientCandidates: [],
    premiumWinningBodyText: "x".repeat(600),
    premiumReadonlyPlainText: "x".repeat(600),
    premiumReview: null,
    premiumFinalizeAudit: null,
    premiumReviewRoute: null,
    agreementGenerationId: "gen-1",
    intakeTextFingerprint: "fp-test",
    premiumPipelineRenderSource: "server_full_draft",
    premiumRenderResolveSource: "server_full_document_text",
    premiumAccepted: true,
    serverGenerationDegraded: null,
    ...partial,
  } as PremiumCompletionSnapshot;
}

describe("paymentFlowProgression", () => {
  it("resolves post-checkout from authoritative snapshot when processing and fingerprint matches", () => {
    const snapshot = snap();
    expect(
      shouldResolvePostCheckoutFromAuthoritativeSnapshot({
        postCheckoutPhase: "processing",
        snapshot,
        intakeFingerprint: "fp-test",
      }),
    ).toBe(true);
    expect(
      shouldResolvePostCheckoutFromAuthoritativeSnapshot({
        postCheckoutPhase: null,
        snapshot,
        intakeFingerprint: "fp-test",
      }),
    ).toBe(false);
  });

  it("does not resolve when snapshot fingerprint mismatches intake", () => {
    expect(
      snapshotReadyForPostCheckoutUnlock({
        snapshot: snap({ intakeTextFingerprint: "other" }),
        intakeFingerprint: "fp-test",
      }),
    ).toBe(false);
  });

  it("hydratable snapshot tolerates missing finalization fields", () => {
    expect(
      isAuthoritativePremiumSnapshotHydratable(
        snap({
          premiumFinalization: undefined,
          premiumFinalizationInputSignature: undefined,
          agreementIntelligence: undefined,
          agreementValidation: undefined,
        }),
        "fp-test",
      ),
    ).toBe(true);
  });

  it("non-authoritative short snapshot is not hydratable on payment return", () => {
    expect(
      isAuthoritativePremiumSnapshotHydratable(
        snap({ premiumWinningBodyText: "short", premiumReadonlyPlainText: "short", premiumAccepted: false }),
        "fp-test",
      ),
    ).toBe(false);
  });

  it("maps structure defects to corpus integrity warn", () => {
    expect(corpusIntegrityFromStructureDefects([])).toBe("ok");
    expect(corpusIntegrityFromStructureDefects(["orphan_section_8_heading"])).toBe("warn");
  });

  it("withSigningPrepareTimeout resolves before deadline", async () => {
    const value = await withSigningPrepareTimeout("fast", Promise.resolve(42), 2000);
    expect(value).toEqual({ ok: true, value: 42 });
  });

  it("withSigningPrepareTimeout returns timedOut when promise hangs", async () => {
    vi.useFakeTimers();
    const hanging = new Promise<string>(() => {});
    const pending = withSigningPrepareTimeout("slow", hanging, 100);
    await vi.advanceTimersByTimeAsync(150);
    const value = await pending;
    expect(value).toEqual({ ok: false, timedOut: true, label: "slow" });
    vi.useRealTimers();
  });
});
