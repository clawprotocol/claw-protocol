/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { clearPendingRecipientNotice, ensureInitialVersion, loadBundle, saveBundle } from "./agreementVersionStore";

const agreementId = "ag_version_scope";
const draft: AgreementDraft = {
  id: agreementId,
  title: "T",
  jurisdiction: "CA",
  parties: [],
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

describe("agreementVersionStore recipient link scope", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("isolates bundles per recipientLinkScope", () => {
    const scopeA = "fpaaaa";
    const scopeB = "fpbbbb";
    const ba = ensureInitialVersion(agreementId, draft, "<p>a</p>", scopeA);
    saveBundle({ ...ba, pendingRecipientNotice: true }, scopeA);
    ensureInitialVersion(agreementId, { ...draft, title: "Other" }, "<p>b</p>", scopeB);
    const a = loadBundle(agreementId, scopeA);
    const b = loadBundle(agreementId, scopeB);
    expect(a?.versions[0]?.rendered_html).toBe("");
    expect(b?.versions[0]?.rendered_html).toBe("");
    expect(a?.versions[0]?.snapshot.title).toBe("T");
    expect(b?.versions[0]?.snapshot.title).toBe("Other");
    clearPendingRecipientNotice(agreementId, scopeA);
    expect(loadBundle(agreementId, scopeA)?.pendingRecipientNotice).toBe(false);
    expect(loadBundle(agreementId, scopeB)?.pendingRecipientNotice).toBeUndefined();
  });
});
