/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  compactBundleForRecipientScopeStorage,
  ensureInitialVersion,
  saveBundle,
  versionBundleStorageKey,
} from "./agreementVersionStore";
import {
  AGREEMENT_VERSIONS_KEY_PREFIX,
  pruneStorageKeysWithPrefix,
} from "../lib/safeBrowserStorage";

const agreementId = "ag_safe_store";
const draft: AgreementDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [{ name: "A", role: "party" }],
  purpose: "p",
  payment_terms: "x",
  duration: "1y",
  due_date: null,
  effective_date: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
  audit_log: [],
};

describe("agreementVersionStore safe storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("compactBundleForRecipientScopeStorage strips rendered_html", () => {
    const bundle = ensureInitialVersion(agreementId, draft, "<p>" + "x".repeat(30_000) + "</p>", "scope_a");
    const compact = compactBundleForRecipientScopeStorage(bundle);
    expect(compact.versions.every((v) => v.rendered_html === "")).toBe(true);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(bundle).length);
  });

  it("saveBundle does not throw when localStorage quota is exceeded", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const bundle = ensureInitialVersion(agreementId, draft, "<p>hi</p>", "scope_quota");
    expect(() => saveBundle(bundle, "scope_quota")).not.toThrow();
    expect(saveBundle(bundle, "scope_quota")).toBe(false);
  });

  it("saveBundle compacts oversized recipient payload below html duplication", () => {
    const scope = "scope_big";
    const html = "<p>" + "z".repeat(80_000) + "</p>";
    ensureInitialVersion(agreementId, draft, html, scope);
    const key = versionBundleStorageKey(agreementId, scope);
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    if (raw) {
      expect(raw.includes("zzzz")).toBe(false);
      const parsed = JSON.parse(raw) as { versions: { rendered_html: string }[] };
      expect(parsed.versions[0]?.rendered_html).toBe("");
    }
  });

  it("prunes older version keys when quota retry runs", () => {
    const prefix = `${AGREEMENT_VERSIONS_KEY_PREFIX}${agreementId}:r:`;
    for (let i = 0; i < 12; i += 1) {
      const key = `${prefix}scope_${i}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          agreementId,
          currentVersionId: `v${i}`,
          _cacheUpdatedAt: `2020-01-0${(i % 9) + 1}T00:00:00.000Z`,
          versions: [],
        }),
      );
    }
    const retainKey = `${prefix}scope_new`;
    const removed = pruneStorageKeysWithPrefix(localStorage, AGREEMENT_VERSIONS_KEY_PREFIX, {
      keep: 2,
      retainKey,
    });
    expect(removed).toBeGreaterThanOrEqual(10);
    expect(localStorage.getItem(`${prefix}scope_0`)).toBeNull();
    expect(localStorage.getItem(retainKey)).toBeNull();
  });
});
