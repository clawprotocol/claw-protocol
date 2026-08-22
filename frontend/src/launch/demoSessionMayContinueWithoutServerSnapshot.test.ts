import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDemoSessionUser,
  createDemoSessionUser,
  demoSessionMayContinueWithoutServerSnapshot,
} from "./guestCheckoutAuthority";

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  });
});

afterEach(() => {
  clearDemoSessionUser();
});

describe("demoSessionMayContinueWithoutServerSnapshot", () => {
  it("is false without a demo POS session", () => {
    expect(demoSessionMayContinueWithoutServerSnapshot("auth_required")).toBe(false);
  });

  it("lets a demo POS session continue past snapshot persist 401", () => {
    createDemoSessionUser({
      displayName: "Anthem Blanchard",
      email: "anthem+lawdog-walk4@example.com",
      settlementReceiptId: "rcpt_walk4_a8fu3",
    });
    expect(demoSessionMayContinueWithoutServerSnapshot("auth_required")).toBe(true);
    expect(demoSessionMayContinueWithoutServerSnapshot("authenticated_session_required")).toBe(true);
    expect(demoSessionMayContinueWithoutServerSnapshot("ownership_not_registered")).toBe(false);
  });
});
