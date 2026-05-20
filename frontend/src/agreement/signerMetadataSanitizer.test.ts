import { describe, expect, it } from "vitest";
import {
  evaluateSignerMetadataInput,
  signerMetadataLooksLikeAgreementBody,
} from "./signerMetadataSanitizer";

describe("signerMetadataSanitizer", () => {
  it("rejects 25k-char agreement body pasted into signerName", () => {
    const body = "1. DEFINITIONS\n".repeat(1800) + "This Agreement is entered into among parties.";
    expect(body.length).toBeGreaterThan(20_000);
    const d = evaluateSignerMetadataInput(body, "Ethan Cole", "signerName");
    expect(d.accept).toBe(false);
    if (!d.accept) {
      expect(d.reason).toBe("too_long");
      expect(d.previous).toBe("Ethan Cole");
    }
    expect(signerMetadataLooksLikeAgreementBody(body)).toBe(true);
  });

  it("accepts normal signer name and title", () => {
    expect(evaluateSignerMetadataInput("Ethan Cole", "", "signerName").accept).toBe(true);
    expect(evaluateSignerMetadataInput("CEO", "", "signerTitle").accept).toBe(true);
  });

  it("rejects agreement-like prose in signerTitle", () => {
    const d = evaluateSignerMetadataInput("Section 4. Confidentiality obligations", "CEO", "signerTitle");
    expect(d.accept).toBe(false);
    if (!d.accept) expect(d.reason).toBe("agreement_prose");
  });
});
