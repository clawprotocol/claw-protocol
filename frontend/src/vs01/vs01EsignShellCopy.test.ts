/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  buildAgreementVs01BridgeSession,
  clearAgreementVs01BridgeSession,
  clearPaidProAgreementBridgeSkipMarker,
  computePaidProAgreementBridgeSkip,
  setPaidProAgreementBridgeSkipMarker,
  writeAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { parseAgreementBridgeQuery, resolveVs01EsignShellCopy } from "./vs01EsignShellCopy";

const doc = "doc_seed_1";

function bridge(over: Partial<AgreementVs01BridgeSession> = {}): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: doc,
    agreementId: "ag_1",
    agreementTitle: "Lease",
    creatorName: "Owner",
    creatorEmail: "owner@example.com",
    counterparties: [{ id: "c1", name: "Pat", email: "pat@example.com", phone: "" }],
    targetStep: 2,
    senderFirstLawdogHandoff: true,
    source: "paid_pro_sender_first",
    signerFirst: true,
    ...over,
  };
}

describe("resolveVs01EsignShellCopy", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearPaidProAgreementBridgeSkipMarker();
  });

  it("non-bridge search + no marker uses normal VS01 app shell copy", () => {
    const r = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: doc,
      bridge: null,
    });
    expect(r.copyVariant).toBe("normal");
    expect(r.title).toBe("Continue your document");
    expect(r.navVariant).toBe("full");
    expect(r.subtitle).toContain("Quick");
  });

  it("agreement_bridge=1 with reviewerApprovedCleanHandoff uses reviewer subtitle and focused nav", () => {
    const r = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: doc,
      bridge: bridge({ reviewerApprovedCleanHandoff: true }),
    });
    expect(r.title).toBe("Prepare signature links");
    expect(r.subtitle).toMatch(/LawDog sends signing links to all parties/i);
    expect(r.copyVariant).toBe("bridge_reviewer_approved");
    expect(r.navVariant).toBe("esign_bridge_focused");
  });

  it("agreement_bridge=1 without reviewer flag uses generic bridge copy", () => {
    const r = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: doc,
      bridge: bridge(),
    });
    expect(r.title).toBe("Prepare signature links");
    expect(r.subtitle).toMatch(/LawDog sends signing links to all parties/i);
    expect(r.subtitle).not.toContain("prior step");
    expect(r.copyVariant).toBe("bridge_sender_first");
    expect(r.navVariant).toBe("esign_bridge_focused");
  });

  it("URL stripped but skip marker + matching session still resolves bridge shell", () => {
    setPaidProAgreementBridgeSkipMarker(doc);
    const r = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: doc,
      bridge: bridge({ reviewerApprovedCleanHandoff: true }),
    });
    expect(r.agreementBridgeEffective).toBe(true);
    expect(r.title).toBe("Prepare signature links");
  });

  it("session-only (no query, no marker) still resolves bridge shell on refresh", () => {
    const r = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: doc,
      bridge: bridge({ reviewerApprovedCleanHandoff: true }),
    });
    expect(r.agreementBridgeEffective).toBe(true);
    expect(r.copyVariant).toBe("bridge_reviewer_approved");
    expect(r.title).toBe("Prepare signature links");
    expect(r.subtitle).toMatch(/LawDog sends signing links to all parties/i);
    expect(r.navVariant).toBe("esign_bridge_focused");
  });

  it("marker-only (no query, no matching session) still activates bridge with generic copy", () => {
    setPaidProAgreementBridgeSkipMarker(doc);
    const r = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: doc,
      bridge: null,
    });
    expect(r.agreementBridgeEffective).toBe(true);
    expect(r.copyVariant).toBe("bridge_sender_first");
    expect(r.navVariant).toBe("esign_bridge_focused");
  });

  it("no marker, no session, no query stays normal", () => {
    const r = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: doc,
      bridge: null,
    });
    expect(r.agreementBridgeEffective).toBe(false);
    expect(r.copyVariant).toBe("normal");
  });

  it("bridge flow at receipt step (vs01Step >= 4) shows completion copy, not 'Prepare for e-signing'", () => {
    const r = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: doc,
      bridge: bridge({ reviewerApprovedCleanHandoff: true }),
      vs01Step: 4,
    });
    expect(r.agreementBridgeEffective).toBe(true);
    expect(r.title).not.toBe("Prepare for e-signing");
    expect(r.title).toContain("ready");
    expect(r.subtitle).toMatch(/sent signing links to all parties/i);
  });

  it("bridge flow at setup step (vs01Step < 4) still shows 'Prepare for e-signing'", () => {
    const r = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: doc,
      bridge: bridge({ reviewerApprovedCleanHandoff: true }),
      vs01Step: 2,
    });
    expect(r.title).toBe("Prepare signature links");
    expect(r.subtitle).toMatch(/LawDog sends signing links to all parties/i);
  });
});

describe("parseAgreementBridgeQuery", () => {
  it("detects agreement_bridge=1", () => {
    expect(parseAgreementBridgeQuery("?agreement_bridge=1")).toBe(true);
    expect(parseAgreementBridgeQuery("?foo=1")).toBe(false);
  });
});

describe("computePaidProAgreementBridgeSkip (jsdom — refresh with session)", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearPaidProAgreementBridgeSkipMarker();
    clearAgreementVs01BridgeSession();
  });

  it("is true when bridge session matches seed (no marker, no query — refresh path)", () => {
    const b = buildAgreementVs01BridgeSession({
      agreementId: "ag_refresh",
      vs01DocumentId: "doc_refresh",
      draft: {
        title: "T",
        parties: [
          { id: "o1", name: "Owner", role: "owner", email: "o@t.com" },
          { id: "s1", name: "Signer", role: "signer", email: "s@t.com" },
        ],
      } as AgreementDraft,
      senderFirstLawdogHandoff: true,
    });
    writeAgreementVs01BridgeSession(b);
    expect(computePaidProAgreementBridgeSkip("doc_refresh", true)).toBe(true);
  });

  it("is false when session and marker are both cleared", () => {
    clearAgreementVs01BridgeSession();
    clearPaidProAgreementBridgeSkipMarker();
    expect(computePaidProAgreementBridgeSkip("doc_refresh", true)).toBe(false);
  });

  it("is false without hideStepper even with session", () => {
    const b = buildAgreementVs01BridgeSession({
      agreementId: "ag_r",
      vs01DocumentId: "doc_refresh",
      draft: { title: "T", parties: [] } as unknown as AgreementDraft,
    });
    writeAgreementVs01BridgeSession(b);
    expect(computePaidProAgreementBridgeSkip("doc_refresh", false)).toBe(false);
  });

  it("no-email fallback: session with empty emails does not throw", () => {
    const b = buildAgreementVs01BridgeSession({
      agreementId: "ag_empty",
      vs01DocumentId: "doc_empty",
      draft: { title: "T", parties: [] } as unknown as AgreementDraft,
    });
    writeAgreementVs01BridgeSession(b);
    expect(computePaidProAgreementBridgeSkip("doc_empty", true)).toBe(true);
    const copy = resolveVs01EsignShellCopy({
      search: "",
      seedDocumentId: "doc_empty",
      bridge: b,
    });
    expect(copy.agreementBridgeEffective).toBe(true);
  });
});
