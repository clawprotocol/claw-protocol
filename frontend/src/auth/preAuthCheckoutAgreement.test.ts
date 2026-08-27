/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyClaimedAgreementIdsToPreAuth,
  clearPreAuthCheckoutAgreementId,
  countConversionDraftMintsAfterFirstPersist,
  pinCheckoutPathToPreAuthAgreement,
  readPreAuthCheckoutAgreementId,
  rememberPreAuthCheckoutAgreementId,
  resolveAgreementIdAfterAuthRemount,
  resolveExistingConversionAgreementId,
  shouldMintNewDraftForConversion,
} from "./preAuthCheckoutAgreement";

const GUEST = "5e79c874-91bd-4d43-95f1-80a827e8b26a";
const STALE = "36568b4c-1300-4d62-97eb-826bdf2dd6c0";

describe("preAuthCheckoutAgreement", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPreAuthCheckoutAgreementId();
  });

  it("never replaces the first real checkout UUID with a later remint", () => {
    expect(rememberPreAuthCheckoutAgreementId(GUEST)).toBe(GUEST);
    expect(rememberPreAuthCheckoutAgreementId(STALE)).toBe(GUEST);
    expect(readPreAuthCheckoutAgreementId()).toBe(GUEST);
  });

  it("pins a stale checkout dest back to the pre-auth persist", () => {
    rememberPreAuthCheckoutAgreementId(GUEST);
    expect(
      pinCheckoutPathToPreAuthAgreement(`/app/checkout/${STALE}?tier=pro&cadence=monthly`),
    ).toBe(`/app/checkout/${GUEST}?tier=pro&cadence=monthly`);
  });

  it("does not mint a second draft once the conversion persist exists", () => {
    expect(
      resolveExistingConversionAgreementId({
        reviewAgreementId: null,
        resumeId: GUEST,
        preAuthId: null,
      }),
    ).toBe(GUEST);
    expect(
      resolveExistingConversionAgreementId({
        reviewAgreementId: STALE,
        resumeId: STALE,
        preAuthId: GUEST,
      }),
    ).toBe(GUEST);
    expect(shouldMintNewDraftForConversion(GUEST)).toBe(false);
    expect(shouldMintNewDraftForConversion(null)).toBe(true);
    expect(shouldMintNewDraftForConversion("__claw_create_checkout__")).toBe(true);
  });

  it("keeps claimed leftover persist when bind returns it after a stale dest", () => {
    expect(applyClaimedAgreementIdsToPreAuth([GUEST])).toBe(GUEST);
    expect(readPreAuthCheckoutAgreementId()).toBe(GUEST);
    expect(applyClaimedAgreementIdsToPreAuth([STALE])).toBe(GUEST);
  });

  it("reuses persist/resume after remount even when a remint receipt exists", () => {
    const remount = resolveAgreementIdAfterAuthRemount({
      reactRefId: null,
      resumeId: GUEST,
      preAuthId: GUEST,
      pendingReceiptCanonicalId: STALE,
    });
    expect(remount).toEqual({ agreementId: GUEST, mustMint: false });
    expect(shouldMintNewDraftForConversion(remount.agreementId)).toBe(false);
  });

  it("does not mint a second UUID when only resume survives remount", () => {
    const remount = resolveAgreementIdAfterAuthRemount({
      reactRefId: null,
      resumeId: GUEST,
      preAuthId: null,
      pendingReceiptCanonicalId: STALE,
    });
    expect(remount.mustMint).toBe(false);
    expect(remount.agreementId).toBe(GUEST);
  });

  it("mints exactly once on persist then remount then Google then checkout prep", () => {
    const journey = countConversionDraftMintsAfterFirstPersist(GUEST, [
      { reactRefId: null, resumeId: GUEST, preAuthId: GUEST },
      { reactRefId: null, resumeId: GUEST, preAuthId: GUEST, pendingReceiptCanonicalId: STALE },
      { reactRefId: STALE, resumeId: GUEST, preAuthId: GUEST, pendingReceiptCanonicalId: STALE },
    ]);
    expect(journey.mintCount).toBe(1);
    expect(journey.agreementId).toBe(GUEST);
  });
});
