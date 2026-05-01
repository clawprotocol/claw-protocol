import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildAgreementVs01BridgeSession, fetchAgreementVs01SigningSeed } from "./agreementToVs01SigningBridge";

describe("buildAgreementVs01BridgeSession", () => {
  it("maps owner to creator and other parties to counterparties", () => {
    const draft = {
      title: "MSA",
      parties: [
        { id: "o1", name: "Owner Co", role: "owner", email: "owner@example.com" },
        { id: "s1", name: "Signer LLC", role: "signer", email: "signer@example.com" },
      ],
    } as AgreementDraft;
    const b = buildAgreementVs01BridgeSession({
      agreementId: "agr-1",
      vs01DocumentId: "doc_seed_1",
      draft,
    });
    expect(b.vs01DocumentId).toBe("doc_seed_1");
    expect(b.agreementId).toBe("agr-1");
    expect(b.creatorEmail).toBe("owner@example.com");
    expect(b.counterparties).toHaveLength(1);
    expect(b.counterparties[0].email).toBe("signer@example.com");
    expect(b.targetStep).toBe(2);
  });
});

describe("paid Pro sender-first VS01 route shape (static)", () => {
  it("SimpleSendPage seeds VS01 esign before agreement /sign fallback", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("fetchAgreementVs01SigningSeed");
    expect(s).toContain("/app/esign/");
    expect(s).toContain("agreement_bridge=1");
    expect(s).toContain("logAgreementToVs01EsignRoute");
    expect(s).toContain("vs01_seed_failed");
  });
});

describe("fetchAgreementVs01SigningSeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps structured FastAPI detail to reason and preserves status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          detail: { code: "vs01_finalize_failed", message: "OSError" },
        }),
      }),
    );
    const r = await fetchAgreementVs01SigningSeed("ag_test");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("vs01_finalize_failed");
      expect(r.httpStatus).toBe(503);
      expect(r.detail).toEqual({ code: "vs01_finalize_failed", message: "OSError" });
    }
  });

  it("returns document id on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          document_id: "doc_abc123",
          content_sha256: "a".repeat(64),
        }),
      }),
    );
    const r = await fetchAgreementVs01SigningSeed("ag_ok");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documentId).toBe("doc_abc123");
      expect(r.contentSha256).toHaveLength(64);
    }
  });
});
