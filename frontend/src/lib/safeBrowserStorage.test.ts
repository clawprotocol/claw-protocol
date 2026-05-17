/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_VERSIONS_KEY_PREFIX,
  approxUtf8Bytes,
  isQuotaExceededError,
  pruneStorageKeysWithPrefix,
  safeStorageSetItem,
} from "./safeBrowserStorage";

describe("safeBrowserStorage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("detects QuotaExceededError", () => {
    const err = new DOMException("quota", "QuotaExceededError");
    expect(isQuotaExceededError(err)).toBe(true);
  });

  it("safeStorageSetItem returns false on quota without throwing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const ok = safeStorageSetItem(localStorage, "claw_test_key", '{"a":1}', {
      surface: "localStorage",
    });
    expect(ok).toBe(false);
    expect(setItem).toHaveBeenCalled();
  });

  it("prunes old agreement version keys on quota and retries", () => {
    const aid = "ag_prune";
    const oldKey = `${AGREEMENT_VERSIONS_KEY_PREFIX}${aid}:r:oldscope`;
    const keepKey = `${AGREEMENT_VERSIONS_KEY_PREFIX}${aid}:r:newscope`;
    localStorage.setItem(
      oldKey,
      JSON.stringify({
        agreementId: aid,
        _cacheUpdatedAt: "2020-01-01T00:00:00.000Z",
        versions: [],
        currentVersionId: "v0",
      }),
    );
    const nativeSet = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function mockSet(
      this: Storage,
      key: string,
      value: string,
    ) {
      calls += 1;
      if (calls === 1 && key === keepKey) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return nativeSet.call(this, key, value);
    });

    const payload = JSON.stringify({
      agreementId: aid,
      _cacheUpdatedAt: "2026-05-16T00:00:00.000Z",
      versions: [{ id: "v1", created_at: "2026-05-16T00:00:00.000Z" }],
      currentVersionId: "v1",
    });
    const ok = safeStorageSetItem(localStorage, keepKey, payload, {
      prunePrefixOnQuota: AGREEMENT_VERSIONS_KEY_PREFIX,
      pruneKeep: 1,
      retainKey: keepKey,
    });
    expect(ok).toBe(true);
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(localStorage.getItem(keepKey)).toBe(payload);
  });

  it("skips payloads over maxBytes without throwing", () => {
    const huge = "x".repeat(300_000);
    expect(approxUtf8Bytes(huge)).toBeGreaterThan(250_000);
    const ok = safeStorageSetItem(localStorage, "claw_big", huge, { maxBytes: 250_000 });
    expect(ok).toBe(false);
    expect(localStorage.getItem("claw_big")).toBeNull();
  });

  it("pruneStorageKeysWithPrefix only touches version prefix keys", () => {
    localStorage.setItem("claw_org_id", "keep-me");
    localStorage.setItem(
      `${AGREEMENT_VERSIONS_KEY_PREFIX}a:r:1`,
      JSON.stringify({ _cacheUpdatedAt: "2020-01-01T00:00:00.000Z" }),
    );
    localStorage.setItem(
      `${AGREEMENT_VERSIONS_KEY_PREFIX}a:r:2`,
      JSON.stringify({ _cacheUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    const removed = pruneStorageKeysWithPrefix(localStorage, AGREEMENT_VERSIONS_KEY_PREFIX, {
      keep: 1,
      retainKey: `${AGREEMENT_VERSIONS_KEY_PREFIX}a:r:2`,
    });
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem("claw_org_id")).toBe("keep-me");
    expect(localStorage.getItem(`${AGREEMENT_VERSIONS_KEY_PREFIX}a:r:2`)).not.toBeNull();
  });
});
