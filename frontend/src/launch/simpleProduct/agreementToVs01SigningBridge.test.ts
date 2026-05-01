import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildAgreementVs01BridgeSession } from "./agreementToVs01SigningBridge";

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
  });
});
