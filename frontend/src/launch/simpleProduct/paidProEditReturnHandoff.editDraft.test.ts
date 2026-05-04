import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  clearPaidProEditReturnHandoff,
  extractPaidProEditReturnDraftSnapshot,
  mergePaidProEditReturnSnapshotIntoApiDraft,
  paidProEditReturnHasRecoverableBody,
  readPaidProEditReturnHandoff,
  resolvePaidProEditReturnSourceDraft,
  writePaidProEditReturnHandoff,
} from "./paidProEditReturnHandoff";

function mkDraft(bodyLen: number, overrides?: Partial<AgreementDraft>): AgreementDraft {
  const body = "p".repeat(bodyLen);
  return {
    id: "agr-edit-1",
    title: "Services Agreement",
    jurisdiction: "TX",
    parties: [{ id: "p-o", name: "Owner", role: "owner", email: "o@example.com" }],
    purpose: "Consulting",
    payment_terms: "Net 30",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "server_full_document_text",
    server_full_document_text: body,
    ...overrides,
  };
}

describe("paidProEditReturnHandoff (Edit Draft → create)", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
  });

  afterEach(() => {
    clearPaidProEditReturnHandoff();
    vi.unstubAllGlobals();
  });

  it("writes v2 handoff with recoverable body so log semantics show hasPremiumDoc true and docLen > 1000", () => {
    const d = mkDraft(1500);
    expect(paidProEditReturnHasRecoverableBody(d)).toBe(true);
    writePaidProEditReturnHandoff({ agreementId: "agr-edit-1", liveDraft: d, premiumSendIntent: "review" });
    const r = readPaidProEditReturnHandoff();
    expect(r?.v).toBe(2);
    expect(r?.draftSnapshot?.server_full_document_text?.length).toBe(1500);
    expect(materialLenFromSnapshot(r!.draftSnapshot)).toBeGreaterThan(1000);
  });

  it("merge snapshot restores long server text onto thin API draft", () => {
    const thin: AgreementDraft = mkDraft(0, {
      server_full_document_text: "",
      purpose: "thin",
    });
    const snap = extractPaidProEditReturnDraftSnapshot(mkDraft(1200));
    const merged = mergePaidProEditReturnSnapshotIntoApiDraft(thin, snap);
    expect(String(merged.server_full_document_text ?? "").length).toBe(1200);
    expect(paidProEditReturnHasRecoverableBody(merged)).toBe(true);
  });

  it("resolve prefers live bridge draft when it carries recoverable Pro body", () => {
    const live = mkDraft(600);
    const initial = mkDraft(0, { id: "agr-edit-1", server_full_document_text: "" });
    const resolved = resolvePaidProEditReturnSourceDraft({
      live,
      initial,
      primed: initial,
      agreementId: "agr-edit-1",
    });
    expect(resolved?.server_full_document_text?.length).toBe(600);
  });
});

function materialLenFromSnapshot(s: { server_full_document_text?: string | null; premium_full_document_text?: string | null; premium_server_full_document_text?: string | null }): number {
  return Math.max(
    String(s.premium_full_document_text ?? "").trim().length,
    String(s.premium_server_full_document_text ?? "").trim().length,
    String(s.server_full_document_text ?? "").trim().length,
  );
}
