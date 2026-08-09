import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  paidProReviewDefaultsToReviewTrack,
  resolveProDeliveryTrackSelected,
} from "./proDeliveryTrackState";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * TEST577 — dashboard paid-create: after the accepted-Pro review, clicking "Prepare for signing"
 * records `selectedTrack:'signature'`, but the delivery track then flipped back to `'review'`.
 *
 * Root cause: the inline signer-setup phase deliberately holds `signaturePreparationRequested` false
 * (so the signer fields stay mounted for confirmation), and `effectivePremiumSendMode` collapses to
 * the review-first default whenever `paidProAuthoritative && !signaturePreparationRequested`. That
 * default re-asserted itself over the user's explicit signature choice, so `proDeliveryTrackSelected`
 * resolved to `'review'` and the green CTA routed back to the review decision instead of advancing to
 * signature preparation.
 *
 * Fix: a sticky signature-prep intent latch (`paidProSignaturePrepIntentLatched`), set when the user
 * clicks "Prepare for signing", pins the signature track across signer setup + finalize. It is cleared
 * when the user picks the review track or the source of truth is torn down.
 */

describe("TEST577 signature delivery track survives the signer-setup phase", () => {
  it("review-first default no longer wins once the signature track is latched", () => {
    // Before the user chooses anything: review-first neutral default (latch not set).
    expect(
      paidProReviewDefaultsToReviewTrack({
        paidProAuthoritative: true,
        signaturePreparationRequested: false,
        signaturePrepIntentLatched: false,
      }),
    ).toBe(true);

    // After "Prepare for signing" latches the signature intent, the review-first default must NOT
    // re-assert itself even while signer setup holds `signaturePreparationRequested` false.
    expect(
      paidProReviewDefaultsToReviewTrack({
        paidProAuthoritative: true,
        signaturePreparationRequested: false,
        signaturePrepIntentLatched: true,
      }),
    ).toBe(false);
  });

  it("clicking Prepare for signing sets and preserves the signature track during signer setup", () => {
    // Signer setup is mounted: signaturePreparationRequested is held false, but the user picked
    // signature. The effective send mode resolves to signature (default no longer applies), and the
    // latch keeps the delivery track pinned to signature regardless.
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
        signaturePrepIntentLatched: true,
      }),
    ).toBe("signature");
  });

  it("signer metadata confirmation (finalize) does not rewrite selectedTrack to review", () => {
    // Immediately after finalize the surface returns to the review decision with
    // signaturePreparationRequested still false. Without the latch the track would flip to review;
    // with it the track stays signature so the green CTA keeps routing to signature preparation.
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        // effectiveSendMode would collapse to review-first default here, but the latch wins.
        effectiveSendMode: "review",
        premiumSignersSurfaceReady: false,
        signaturePrepIntentLatched: true,
      }),
    ).toBe("signature");
  });

  it("Send for review (Option B) still selects the review track", () => {
    // Choosing the review track releases the latch → delivery track resolves to review.
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "review",
        premiumSignersSurfaceReady: false,
        signaturePrepIntentLatched: false,
      }),
    ).toBe("review");
    // And the review-first default is available to a fresh review (latch released, nothing touched).
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
        signaturePrepIntentLatched: false,
      }),
    ).toBeNull();
  });

  it("does not regress the pre-existing signers-surface-ready signature detection", () => {
    // The already-working first-time flow: once the signers surface is ready in signature mode the
    // track is signature even without the new latch (unchanged behavior).
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: true,
      }),
    ).toBe("signature");
  });
});

describe("TEST577 AgreementBuilderIntake wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("declares the sticky signature-prep intent latch state", () => {
    expect(intake).toContain(
      "const [paidProSignaturePrepIntentLatched, setPaidProSignaturePrepIntentLatched] = useState(false);",
    );
  });

  it("effectivePremiumSendMode honors the latch via the shared review-default predicate", () => {
    const memo = intake.slice(
      intake.indexOf("const effectivePremiumSendMode = useMemo"),
      intake.indexOf("const effectivePremiumSendMode = useMemo") + 800,
    );
    expect(memo).toContain("paidProReviewDefaultsToReviewTrack({");
    expect(memo).toContain("signaturePrepIntentLatched: paidProSignaturePrepIntentLatched,");
  });

  it("the delivery track resolver is fed the latch", () => {
    const memo = intake.slice(
      intake.indexOf("resolveProDeliveryTrackSelected({"),
      intake.indexOf("resolveProDeliveryTrackSelected({") + 400,
    );
    expect(memo).toContain("signaturePrepIntentLatched: paidProSignaturePrepIntentLatched,");
  });

  it("send-mode pick latches signature and releases on review", () => {
    expect(intake).toContain(
      'setPaidProSignaturePrepIntentLatched(mode === "signature");',
    );
  });

  it("Send for review explicitly releases the signature-prep latch", () => {
    const handler = intake.slice(
      intake.indexOf("const handleProSendForReview = React.useCallback(() => {"),
      intake.indexOf("const handleProSendForReview = React.useCallback(() => {") + 400,
    );
    expect(handler).toContain("setPaidProSignaturePrepIntentLatched(false);");
  });

  it("tears down the latch when the paid Pro source of truth is gone", () => {
    expect(intake).toContain(
      "if (paidProSignaturePrepIntentLatched && !hasPaidProSourceOfTruth()) {",
    );
  });
});
