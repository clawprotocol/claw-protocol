import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSignSession,
  isLegacySigningDeferredResponse,
  LEGACY_SIGNING_DEFERRED_DETAIL,
  LEGACY_SIGNING_UNAVAILABLE_MESSAGE,
  LegacySigningDeferredError,
} from "./vs01Api";

describe("legacy signing production containment (vs01Api)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects deferred-until-3C2C backend detail", () => {
    expect(
      isLegacySigningDeferredResponse(409, { detail: LEGACY_SIGNING_DEFERRED_DETAIL })
    ).toBe(true);
    expect(isLegacySigningDeferredResponse(503, { detail: LEGACY_SIGNING_DEFERRED_DETAIL })).toBe(
      false
    );
    expect(isLegacySigningDeferredResponse(409, { detail: "other" })).toBe(false);
  });

  it("exposes a stable user-facing unavailable message", () => {
    const err = new LegacySigningDeferredError();
    expect(err.message).toBe(LEGACY_SIGNING_UNAVAILABLE_MESSAGE);
    expect(err.deferredDetail).toBe(LEGACY_SIGNING_DEFERRED_DETAIL);
  });

  it("turns an actual exact 409 fetch response into LegacySigningDeferredError without retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: LEGACY_SIGNING_DEFERRED_DETAIL }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(createSignSession("doc-1", "ab".repeat(32))).rejects.toBeInstanceOf(
      LegacySigningDeferredError
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, { detail: "unrelated_conflict" }],
    [503, { detail: LEGACY_SIGNING_DEFERRED_DETAIL }],
  ])("does not classify unrelated status/body (%s)", async (status, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(createSignSession("doc-1", "ab".repeat(32))).rejects.not.toBeInstanceOf(
      LegacySigningDeferredError
    );
  });

  it("does not classify a malformed non-JSON error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 409, headers: { "Content-Type": "text/plain" } })
    );

    await expect(createSignSession("doc-1", "ab".repeat(32))).rejects.not.toBeInstanceOf(
      LegacySigningDeferredError
    );
  });
});
