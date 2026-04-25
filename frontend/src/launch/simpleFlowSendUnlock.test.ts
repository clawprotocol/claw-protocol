import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySimpleSendUnlockFromReturnPath,
  canAccessSimpleSendActions,
  hasOneTimeAgreementUnlock,
  hasSimpleFlowSendUnlocked,
  markOneTimeAgreementUnlock,
  markSimpleFlowSendUnlocked,
  simpleFlowSendUnlockStorageKey,
} from "./simpleFlowSendUnlock";

describe("simpleFlowSendUnlock", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      length: 0,
      key: () => null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it("stores and reads unlock per agreement", () => {
    expect(hasSimpleFlowSendUnlocked("a1")).toBe(false);
    markSimpleFlowSendUnlocked("a1");
    expect(hasSimpleFlowSendUnlocked("a1")).toBe(true);
    expect(hasSimpleFlowSendUnlocked("a2")).toBe(false);
    expect(simpleFlowSendUnlockStorageKey("a1")).toContain("a1");
  });

  it("applySimpleSendUnlockFromReturnPath marks send agreement id", () => {
    applySimpleSendUnlockFromReturnPath("/app/send/deal-99?phase=send");
    expect(hasSimpleFlowSendUnlocked("deal-99")).toBe(true);
  });

  it("canAccessSimpleSendActions is true after unlock when paywall is active", () => {
    markSimpleFlowSendUnlocked("x");
    expect(canAccessSimpleSendActions("x")).toBe(true);
  });

  it("stores one-time unlock separately and grants access", () => {
    expect(hasOneTimeAgreementUnlock("b1")).toBe(false);
    markOneTimeAgreementUnlock("b1");
    expect(hasOneTimeAgreementUnlock("b1")).toBe(true);
    expect(hasSimpleFlowSendUnlocked("b1")).toBe(false);
    expect(canAccessSimpleSendActions("b1")).toBe(true);
  });
});
