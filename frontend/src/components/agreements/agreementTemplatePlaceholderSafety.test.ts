import { describe, expect, it } from "vitest";
import {
  collectForbiddenTemplateFragments,
  finalizeUserVisibleAgreementPlainText,
  repairAgreementTemplatePlaceholders,
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
