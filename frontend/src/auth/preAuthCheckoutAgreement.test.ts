/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyClaimedAgreementIdsToPreAuth,
  clearPreAuthCheckoutAgreementId,
  pinCheckoutPathToPreAuthAgreement,
  readPreAuthCheckoutAgreementId,
  rememberPreAuthCheckoutAgreementId,
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

  it("keeps claimed leftover persist when bind returns it after a stale dest", () => {
    expect(applyClaimedAgreementIdsToPreAuth([GUEST])).toBe(GUEST);
    expect(readPreAuthCheckoutAgreementId()).toBe(GUEST);
    expect(applyClaimedAgreementIdsToPreAuth([STALE])).toBe(GUEST);
  });
});
