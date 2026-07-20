import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateNegotiationReviewSessionPresentation,
  logoutNegotiationReviewSessionPresentation,
  onNegotiationReviewSessionInvalidated,
  resetNegotiationReviewSessionAuthForTests,
} from "./recipientReviewAuth";
import {
  clearEphemeralOwnerReviewCopyLinks,
  writeEphemeralOwnerReviewCopyLinks,
} from "../launch/simpleProduct/ephemeralOwnerReviewCopyLinks";
import { resolveApiBase } from "../lib/clawApi";

describe("recipientReviewAuth", () => {
  afterEach(() => {
    resetNegotiationReviewSessionAuthForTests();
    clearEphemeralOwnerReviewCopyLinks("ag_test");
    vi.unstubAllGlobals();
  });

  it("invalidates presentation and clears ephemeral owner copy links", () => {
    writeEphemeralOwnerReviewCopyLinks({
      agreementId: "ag_test",
      recipients: [{ displayName: "R", reviewHref: "https://x/review#t=secret" }],
    });
    const listener = vi.fn();
    onNegotiationReviewSessionInvalidated(listener);
    invalidateNegotiationReviewSessionPresentation();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("logout calls backend and clears presentation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) });
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    onNegotiationReviewSessionInvalidated(listener);
    const result = await logoutNegotiationReviewSessionPresentation();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${resolveApiBase().replace(/\/$/, "")}/api/negotiation-review/session/logout`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(listener).toHaveBeenCalled();
  });

  it("logout does not claim completion when backend revocation fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ authenticated: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    onNegotiationReviewSessionInvalidated(listener);
    const result = await logoutNegotiationReviewSessionPresentation();
    expect(result.ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
