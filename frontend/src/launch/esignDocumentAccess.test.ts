import { describe, expect, it } from "vitest";
import {
  buildVs01OwnerBridgeEsignPath,
  buildVs01RecipientSignEsignPath,
  parseEsignDocumentPath,
  resolveEsignDocumentAccess,
  resolveEsignDocumentMode,
} from "./esignDocumentAccess";

describe("esign document dual-mode access", () => {
  it("classifies owner bridge, recipient sign, bare, and ambiguous queries", () => {
    expect(resolveEsignDocumentMode("?agreement_bridge=1")).toBe("owner_bridge");
    expect(resolveEsignDocumentAccess("?agreement_bridge=1")).toBe("authenticated");
    expect(resolveEsignDocumentMode("?vs01_recipient_sign=1")).toBe("recipient_sign");
    expect(resolveEsignDocumentAccess("?vs01_recipient_sign=1")).toBe("recipient_token");
    expect(resolveEsignDocumentMode("")).toBe("bare");
    expect(resolveEsignDocumentAccess("")).toBe("public");
    expect(resolveEsignDocumentMode("?agreement_bridge=1&vs01_recipient_sign=1")).toBe("ambiguous");
    expect(resolveEsignDocumentAccess("?agreement_bridge=1&vs01_recipient_sign=1")).toBe("authenticated");
  });

  it("parses document paths and keeps builders on the production query contract", () => {
    expect(parseEsignDocumentPath("/app/esign/doc-1")).toEqual({ documentId: "doc-1" });
    expect(parseEsignDocumentPath("/app/esign/new")).toBeNull();
    expect(buildVs01OwnerBridgeEsignPath("doc-1")).toBe("/app/esign/doc-1?agreement_bridge=1");
    const recipient = buildVs01RecipientSignEsignPath({
      documentId: "doc-1",
      agreementId: "ag-1",
      token: "tok-1",
      recipientIndex: 1,
      counterpartyId: "p1",
    });
    expect(recipient).toContain("/app/esign/doc-1?");
    expect(recipient).toContain("vs01_recipient_sign=1");
    expect(recipient).toContain("t=tok-1");
    expect(recipient).toContain("agreement_id=ag-1");
  });
});
