import { describe, expect, it } from "vitest";
import {
  analyzeTemplatePlaceholderFragments,
  classifyTemplateFragment,
  collectForbiddenTemplateFragments,
  finalizeUserVisibleAgreementPlainText,
  isAllowlistedSignatureToken,
  isNumberedSignatureContactNormalized,
  isNumberedSignatureContactToken,
  normalizePlaceholderToken,
  repairAgreementTemplatePlaceholders,
  repairContextualDraftingStubPhrases,
} from "./agreementTemplatePlaceholderSafety";

describe("agreementTemplatePlaceholderSafety", () => {
  it("repairs [CASE_ID_1] to any Party", () => {
    const raw = "Either [CASE_ID_1] may terminate.";
    const { text, repaired } = repairAgreementTemplatePlaceholders(raw, {});
    expect(text).toContain("any Party");
    expect(repaired.some((r) => r.includes("CASE_ID"))).toBe(true);
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: [],
      surface: "test",
      agreementFamily: "nda",
    });
    expect(fin.ok).toBe(true);
    expect(fin.text).toContain("any Party");
  });

  it("repairs [PARTY_1] from canonical party map when unambiguous", () => {
    const raw = "Between [PARTY_1] and [PARTY_2] for services.";
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test",
      agreementFamily: "consulting",
    });
    expect(fin.ok).toBe(true);
    expect(fin.text).toContain("Acme LLC");
    expect(fin.text).toContain("Beta Inc");
  });

  it("rejects unresolved [INSERT ADDRESS]", () => {
    const raw = "Notice at [INSERT ADDRESS] shall suffice.";
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: [],
      surface: "test",
      agreementFamily: "",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remaining.some((x) => /insert/i.test(x))).toBe(true);
  });

  it("rejects ambiguous {{client}} when not in intake allowlist", () => {
    const raw = "Fees payable by {{client}} within 30 days.";
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: [],
      surface: "test",
      agreementFamily: "",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remaining.some((x) => x.includes("{{"))).toBe(true);
  });

  it("allows literal bracket token when exact substring appears in intake", () => {
    const token = "[CUSTOM_LABEL_ABC]";
    const raw = `The label ${token} is intentional.`;
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: `User asked to keep ${token} verbatim in the contract.`,
      partyNames: [],
      surface: "test",
      agreementFamily: "",
    });
    expect(fin.ok).toBe(true);
    expect(fin.text).toContain(token);
  });

  it("detects angle-bracket legal stubs", () => {
    const found = collectForbiddenTemplateFragments("<customer legal name>", "");
    expect(found.length).toBeGreaterThan(0);
  });

  it("does not treat signature-line [NAME]/[TITLE] as hard rejects when parties are resolved", () => {
    const parties = ["Acme LLC", "Beta Inc."];
    const raw = [
      "SERVICES AGREEMENT between Acme LLC and Beta Inc.",
      "x".repeat(6000),
      "SIGNATURES",
      "Acme LLC",
      "By: [SIGNATURE]",
      "Name: [NAME]",
      "Title: [TITLE]",
      "Date: [DATE]",
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "between Acme LLC and Beta Inc.",
      partyNames: parties,
      surface: "test",
    });
    expect(fin.ok, fin.remaining.join("; ")).toBe(true);
    expect(fin.text).not.toMatch(/\[\s*NAME\s*\]/i);
  });

  it("classifies signature-line brackets as nonfatal when parties are resolved", () => {
    const raw = "AGREEMENT between Acme LLC and Beta Inc.\n" + "x".repeat(8000) + "\n[NAME]\n[TITLE]";
    const idx = raw.indexOf("[NAME]");
    const d = classifyTemplateFragment("[NAME]", raw, idx, {
      partyNames: ["Acme LLC", "Beta Inc."],
    });
    expect(d.fatal).toBe(false);
    expect(d.category).toBe("signature_line_stub");
    const fatal = collectForbiddenTemplateFragments(raw, "", { partyNames: ["Acme LLC", "Beta Inc."] });
    expect(fatal.some((x) => /\[NAME\]/i.test(x))).toBe(false);
  });

  it("rejects semantic party_a / bracket company placeholders in premium gate", () => {
    const raw =
      "This Agreement is between party_a and party_b. [Your Company Name] provides services to [Service Provider Name].\n" +
      "terms. ".repeat(120);
    const fatal = collectForbiddenTemplateFragments(raw, "Anthem Blanchard and Sarah Collins", {
      partyNames: ["Anthem Blanchard", "Sarah Collins"],
    });
    expect(fatal.some((x) => /party_a/i.test(x))).toBe(true);
    expect(fatal.some((x) => /Your Company Name/i.test(x))).toBe(true);
  });

  it("still flags operative insert/mustache placeholders in body", () => {
    const raw =
      "Between Beta Inc. and Gamma LLC, fees are {{party_name}} and notice at [INSERT PAYMENT TERMS HERE].\n" +
      "terms. ".repeat(200);
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: ["Beta Inc.", "Gamma LLC"],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.length).toBeGreaterThan(0);
    const detail = analyzeTemplatePlaceholderFragments(fin.text, {
      intakeRaw: "",
      partyNames: ["Beta Inc.", "Gamma LLC"],
    });
    expect(detail.some((d) => d.fatal && (d.token.includes("{{") || /INSERT/i.test(d.token)))).toBe(true);
  });

  it("treats [PARTY_NAME] in signature block as nonfatal without merged parties when intake names entities", () => {
    const intake =
      "Agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC.";
    const raw = [
      "AGREEMENT among Ironclad Systems Group LLC and Harborline Data Solutions Inc.",
      "x".repeat(8000),
      "SIGNATURES",
      "Ironclad Systems Group LLC",
      "Name: [PARTY_NAME]",
      "Title: [TITLE]",
      "Date: [DATE]",
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);
  });

  it("repairs [INITIALS] and [PARTY NAME] in signature blocks when parties resolve from intake", () => {
    const intake =
      "Agreement between Ironclad Systems Group LLC and Harborline Data Solutions Inc. Texas law.";
    const raw = [
      "AGREEMENT between Ironclad Systems Group LLC and Harborline Data Solutions Inc.",
      "x".repeat(6500),
      "SIGNATURES",
      "Ironclad Systems Group LLC",
      "By: [SIGNATURE]",
      "Name: [NAME]",
      "Initials: [INITIALS]",
      "Party: [PARTY NAME]",
      "Address: [ADDRESS]",
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.text).not.toMatch(/\[\s*INITIALS\s*\]/i);
  });

  it("normalizes signature allowlist tokens across case and separators", () => {
    expect(normalizePlaceholderToken("[party name]")).toBe("PARTY_NAME");
    expect(normalizePlaceholderToken("[CLIENT_NAME]")).toBe("CLIENT_NAME");
    expect(isAllowlistedSignatureToken("[Authorized Signatory]")).toBe(true);
    expect(isAllowlistedSignatureToken("[INSERT PAYMENT TERMS]")).toBe(false);
  });

  it("rejects [EMAIL_1] in operative notices section (not signature block)", () => {
    const body =
      "AGREEMENT among Acme LLC and Beta Inc.\n\n2. NOTICES\nNotice email: [EMAIL_1] for correspondence.\n" +
      "x".repeat(4000) +
      "\nIN WITNESS WHEREOF:\n[NAME]";
    const idx = body.indexOf("[EMAIL_1]");
    const d = classifyTemplateFragment("[EMAIL_1]", body, idx, {
      partyNames: ["Acme LLC", "Beta Inc."],
    });
    expect(d.fatal).toBe(true);
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: "between Acme LLC and Beta Inc.",
      partyNames: ["Acme LLC", "Beta Inc."],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /EMAIL/i.test(x))).toBe(true);
  });

  it("classifies numbered signature/contact tokens (EMAIL_1, SIGNER_EMAIL_2)", () => {
    expect(normalizePlaceholderToken("[EMAIL_1]")).toBe("EMAIL_1");
    expect(isNumberedSignatureContactNormalized("EMAIL_1")).toBe(true);
    expect(isNumberedSignatureContactNormalized("SIGNER_EMAIL_2")).toBe(true);
    expect(isNumberedSignatureContactNormalized("PARTY_1")).toBe(false);
    expect(isNumberedSignatureContactToken("[EMAIL_5]")).toBe(true);
    const raw =
      "AGREEMENT between Acme LLC and Beta Inc.\n" +
      "x".repeat(8000) +
      "\nIN WITNESS WHEREOF:\nAcme LLC\nEmail: [EMAIL_1]\nBeta Inc.\nEmail: [EMAIL_2]";
    const idx = raw.indexOf("[EMAIL_1]");
    const d = classifyTemplateFragment("[EMAIL_1]", raw, idx, {
      partyNames: ["Acme LLC", "Beta Inc."],
    });
    expect(d.fatal).toBe(false);
    expect(d.category).toBe("signature_line_stub");
  });

  it("still flags mustache party placeholders when not in intake", () => {
    const raw = "Fees payable by {{party_name}} within 30 days.";
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: "",
      partyNames: [],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remaining.some((x) => x.includes("{{"))).toBe(true);
  });
});

describe("repairContextualDraftingStubPhrases", () => {
  const pad = "Commercial operative terms apply throughout this agreement. ".repeat(120);

  function expectStillFatalDraftingStub(raw: string): void {
    const { text, repaired } = repairContextualDraftingStubPhrases(raw);
    expect(repaired).toEqual([]);
    expect(text).toBe(raw);
    const fatal = collectForbiddenTemplateFragments(raw, "", { partyNames: ["Acme LLC", "Beta Inc."] });
    expect(fatal.some((x) => /\bto be completed\b/i.test(x))).toBe(true);
  }

  it("repairs Schedule A to be completed by the parties", () => {
    const raw = `${pad}\nSchedule A details to be completed by the parties before kickoff.\n${pad}`;
    const { text, repaired } = repairContextualDraftingStubPhrases(raw);
    expect(repaired).toHaveLength(1);
    expect(text).toContain("as confirmed by the Parties in writing");
    expect(text).not.toMatch(/\bto be completed\b/i);
    const fin = finalizeUserVisibleAgreementPlainText(text, {
      intakeRaw: "between Acme LLC and Beta Inc.",
      partyNames: ["Acme LLC", "Beta Inc."],
      surface: "test",
    });
    expect(fin.ok).toBe(true);
  });

  it("repairs Statement of Work to be completed by the parties", () => {
    const raw = `${pad}\nThe Statement of Work to be completed by the parties is attached as Schedule A.\n${pad}`;
    const { text, repaired } = repairContextualDraftingStubPhrases(raw);
    expect(repaired).toHaveLength(1);
    expect(text).toContain("as confirmed by the Parties in writing");
    expect(text).not.toMatch(/\bto be completed\b/i);
  });

  it("repairs milestone and deliverable context", () => {
    const raw = `${pad}\nEach milestone deliverable may be to be completed before acceptance testing.\n${pad}`;
    const { text, repaired } = repairContextualDraftingStubPhrases(raw);
    expect(repaired).toHaveLength(1);
    expect(text).toContain("as confirmed by the Parties in writing");
    expect(text).not.toMatch(/\bto be completed\b/i);
  });

  it("repairs implementation schedule and workstream context via repairAgreementTemplatePlaceholders", () => {
    const raw = `${pad}\nThe implementation schedule for workstream Alpha remains to be completed in Phase 2.\n${pad}`;
    const { text, repaired } = repairAgreementTemplatePlaceholders(raw, {
      intakeRaw: "between Acme LLC and Beta Inc.",
      partyNames: ["Acme LLC", "Beta Inc."],
    });
    expect(repaired.some((r) => r.includes("drafting_stub:to be completed"))).toBe(true);
    expect(text).toContain("as confirmed by the Parties in writing");
    expect(text).not.toMatch(/\bto be completed\b/i);
  });

  it("leaves notice address to be completed fatal", () => {
    expectStillFatalDraftingStub(
      `${pad}\nThe notice address to be completed before execution must be supplied in writing.\n${pad}`,
    );
  });

  it("leaves email for notice to be completed fatal", () => {
    expectStillFatalDraftingStub(
      `${pad}\nThe email for notice to be completed must be provided under Section 8.\n${pad}`,
    );
  });

  it("leaves additional commercial terms remain to be completed fatal", () => {
    expectStillFatalDraftingStub(
      `${pad}\nAdditional commercial terms remain to be completed at a later date.\n${pad}`,
    );
  });

  it("leaves bare to be completed fatal", () => {
    expectStillFatalDraftingStub(`${pad}\nPayment mechanics shall be to be completed.\n${pad}`);
  });

  it("demotes notice If-to signer-setup scaffolding on substantive brand-licensing corpus", () => {
    const notices = [
      "11. NOTICES",
      "Notices under this Agreement must be in writing.",
      "",
      "If to Evergreen Outdoor Brands LLC:",
      "Evergreen Outdoor Brands LLC",
      "Attention: Authorized Signer",
      "Email: to be completed",
      "Address: provided during signer setup",
    ].join("\n");
    const raw = `${pad}\n${notices}\n${pad}`;
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw:
        "Evergreen Outdoor Brands LLC (Brand Owner) and Atlas Consumer Products Inc. (Manufacturer) brand licensing agreement.",
      partyNames: ["Evergreen Outdoor Brands LLC", "Atlas Consumer Products Inc."],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);
    expect(fin.remainingDetail.filter((d) => d.fatal)).toHaveLength(0);
  });

  it("leaves signature and execution context unchanged", () => {
    const raw =
      `${pad}\nIN WITNESS WHEREOF, the Parties have executed this Agreement.\n` +
      "Counterpart execution details to be completed below.\n" +
      "Acme LLC\nBy: _________________________\n";
    const { text, repaired } = repairContextualDraftingStubPhrases(raw);
    expect(repaired).toEqual([]);
    expect(text).toBe(raw);
    expect(text).toMatch(/\bto be completed\b/i);
  });
});
