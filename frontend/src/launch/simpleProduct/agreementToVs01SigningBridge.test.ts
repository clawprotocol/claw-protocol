import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  buildAgreementVs01BridgeSession,
  clearPaidProAgreementBridgeSkipMarker,
  computePaidProAgreementBridgeSkip,
  fetchAgreementVs01SigningSeed,
  lawdogSenderFirstBridgeMetadataReady,
  logAgreementVs01SeedBlocked,
  readPaidProAgreementBridgeSkipMarker,
  setPaidProAgreementBridgeSkipMarker,
} from "./agreementToVs01SigningBridge";

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

  it("preserves counterparty email when it matches creator (VS01 Email placement prefills from draft)", () => {
    const draft = {
      title: "MSA",
      parties: [
        { id: "o1", name: "Owner Co", role: "owner", email: "Same@Example.com" },
        { id: "s1", name: "Signer LLC", role: "signer", email: "same@example.com" },
      ],
    } as AgreementDraft;
    const b = buildAgreementVs01BridgeSession({
      agreementId: "agr-dedupe",
      vs01DocumentId: "doc_x",
      draft,
    });
    expect(b.creatorEmail).toBe("Same@Example.com");
    expect(b.counterparties[0].email).toBe("same@example.com");
    expect(b.counterparties[0].name).toBe("Signer LLC");
  });

  it("sets senderFirstLawdogHandoff when requested", () => {
    const draft = {
      title: "T",
      parties: [
        { id: "o1", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "s1", name: "Sig", role: "signer", email: "s@example.com" },
      ],
    } as AgreementDraft;
    const b = buildAgreementVs01BridgeSession({
      agreementId: "a1",
      vs01DocumentId: "doc1",
      draft,
      senderFirstLawdogHandoff: true,
    });
    expect(b.senderFirstLawdogHandoff).toBe(true);
    expect(b.source).toBe("paid_pro_sender_first");
    expect(b.signerFirst).toBe(true);
  });
});

describe("computePaidProAgreementBridgeSkip", () => {
  const ssStore: Record<string, string> = {};
  const mockSessionStorage = {
    getItem: (k: string) => (k in ssStore ? ssStore[k] : null),
    setItem: (k: string, v: string) => {
      ssStore[k] = v;
    },
    removeItem: (k: string) => {
      delete ssStore[k];
    },
    clear: () => {
      Object.keys(ssStore).forEach((k) => delete ssStore[k]);
    },
    key: () => null,
    get length() {
      return Object.keys(ssStore).length;
    },
  } as Storage;

  beforeEach(() => {
    Object.keys(ssStore).forEach((k) => delete ssStore[k]);
    vi.stubGlobal("sessionStorage", mockSessionStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.keys(ssStore).forEach((k) => delete ssStore[k]);
  });

  it("is true when skip marker matches seed id", () => {
    setPaidProAgreementBridgeSkipMarker("doc_marker");
    expect(computePaidProAgreementBridgeSkip("doc_marker", true)).toBe(true);
    expect(readPaidProAgreementBridgeSkipMarker("doc_marker")).toBe(true);
    clearPaidProAgreementBridgeSkipMarker();
    expect(computePaidProAgreementBridgeSkip("doc_marker", true)).toBe(false);
  });

  it("is false for /app/quick (no seed document id)", () => {
    setPaidProAgreementBridgeSkipMarker("doc_x");
    expect(computePaidProAgreementBridgeSkip("", true)).toBe(false);
  });
});

describe("lawdogSenderFirstBridgeMetadataReady", () => {
  it("is true when handoff flag set and creator + recipient identity present", () => {
    expect(
      lawdogSenderFirstBridgeMetadataReady(
        {
          senderFirstLawdogHandoff: true,
          creatorName: "Owner",
          creatorEmail: "o@example.com",
        },
        [{ id: "1", name: "", email: "signer@example.com", phone: "" }],
      ),
    ).toBe(true);
  });

  it("is false without handoff flag (normal agreement_bridge)", () => {
    expect(
      lawdogSenderFirstBridgeMetadataReady(
        { senderFirstLawdogHandoff: false, creatorName: "A", creatorEmail: "a@b.com" },
        [{ id: "1", name: "R", email: "r@b.com", phone: "" }],
      ),
    ).toBe(false);
  });

  it("is false when recipient row is empty", () => {
    expect(
      lawdogSenderFirstBridgeMetadataReady(
        { senderFirstLawdogHandoff: true, creatorName: "Owner", creatorEmail: "o@example.com" },
        [{ id: "1", name: "", email: "", phone: "" }],
      ),
    ).toBe(false);
  });
});

describe("paid Pro sender-first VS01 route shape (static)", () => {
  it("SimpleSendPage seeds VS01 then navigates to esign; seed failure hard-blocks without resolvePremiumSenderFirstSigningPath", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("fetchAgreementVs01SigningSeed");
    expect(s).toContain("/app/esign/");
    expect(s).toContain("agreement_bridge=1");
    expect(s).toContain("logAgreementToVs01EsignRoute");
    expect(s).toContain("logAgreementVs01SeedBlocked");
    expect(s).toContain("vs01_seed_failed");
    expect(s).toContain("senderFirstVs01SeedFailure");
    expect(s).not.toContain("resolvePremiumSenderFirstSigningPath");
    expect(s).not.toContain("premiumSenderFirstSigningRoute");
    const seedCall = s.indexOf("fetchAgreementVs01SigningSeed(id)");
    const blockedCall = s.indexOf("logAgreementVs01SeedBlocked(");
    expect(seedCall).toBeGreaterThanOrEqual(0);
    expect(blockedCall).toBeGreaterThan(seedCall);
  });
});

describe("agreementToVs01SigningBridge logging (static)", () => {
  it("logs seed success and route in all environments", () => {
    const p = join(__dirname, "agreementToVs01SigningBridge.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("[agreement-vs01-seed-success]");
    expect(s).toContain("[agreement-to-vs01-esign-route]");
    expect(s).toContain("[agreement-vs01-seed-blocked]");
    expect(s).toContain("logAgreementVs01SeedBlocked");
    expect(s).not.toMatch(/logAgreementToVs01EsignRoute[\s\S]*import\.meta\.env\.DEV/);
  });
});

describe("logAgreementVs01SeedBlocked", () => {
  it("logs paid_pro_sender_first with agreementId, status, and detail", () => {
    const w = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAgreementVs01SeedBlocked({
      agreementId: "agr-block",
      status: 503,
      detail: { code: "vs01_down", message: "try later" },
      source: "paid_pro_sender_first",
    });
    expect(w).toHaveBeenCalledWith(
      "[agreement-vs01-seed-blocked]",
      expect.objectContaining({
        agreementId: "agr-block",
        status: 503,
        detail: { code: "vs01_down", message: "try later" },
        source: "paid_pro_sender_first",
      }),
    );
    w.mockRestore();
  });
});

describe("fetchAgreementVs01SigningSeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps structured FastAPI detail to reason and preserves status", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(logSpy).toHaveBeenCalledWith(
      "[agreement-vs01-seed-failed]",
      expect.objectContaining({
        agreementId: "ag_test",
        status: 503,
        detail: { code: "vs01_finalize_failed", message: "OSError" },
      }),
    );
    logSpy.mockRestore();
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
