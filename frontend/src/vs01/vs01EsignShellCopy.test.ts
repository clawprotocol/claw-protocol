/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  clearPaidProAgreementBridgeSkipMarker,
  setPaidProAgreementBridgeSkipMarker,
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
    expect(r.title).toBe("Prepare for e-signing");
    expect(r.subtitle).toContain("reviewer already approved");
    expect(r.subtitle).not.toContain("prior step");
    expect(r.copyVariant).toBe("bridge_reviewer_approved");
    expect(r.navVariant).toBe("esign_bridge_focused");
  });

  it("agreement_bridge=1 without reviewer flag uses generic bridge copy", () => {
    const r = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: doc,
      bridge: bridge(),
    });
    expect(r.title).toBe("Prepare for e-signing");
    expect(r.subtitle).toContain("LawDog send");
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
    expect(r.title).toBe("Prepare for e-signing");
  });
});

describe("parseAgreementBridgeQuery", () => {
  it("detects agreement_bridge=1", () => {
    expect(parseAgreementBridgeQuery("?agreement_bridge=1")).toBe(true);
    expect(parseAgreementBridgeQuery("?foo=1")).toBe(false);
  });
});
