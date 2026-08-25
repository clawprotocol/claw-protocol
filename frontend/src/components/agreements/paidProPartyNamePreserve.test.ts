import { describe, expect, it } from "vitest";
import {
  shortFormsFromLegalName,
  preserveFullLegalPartyNamesInOpeningAndSignatures,
  preserveFullLegalPartyNames,
  collapseDuplicateNoticeEntityLines,
  isOccupationalOrJobTitlePartyName,
  isAgreementSectionHeadingPartyName,
  isAuthoritativeLegalEntityName,
} from "./paidProPartyNamePreserve";

describe("paidProPartyNamePreserve", () => {
  it("rejects operative section headings as legal-entity authority", () => {
    expect(isAgreementSectionHeadingPartyName("SCOPE OF SERVICES")).toBe(true);
    expect(isAgreementSectionHeadingPartyName("2. SCOPE OF SERVICES.")).toBe(true);
    expect(isAgreementSectionHeadingPartyName("LIMITATION OF LIABILITY")).toBe(true);
    expect(isAuthoritativeLegalEntityName("SCOPE OF SERVICES")).toBe(false);
    expect(isAuthoritativeLegalEntityName("2. SCOPE OF SERVICES.")).toBe(false);
    expect(isAgreementSectionHeadingPartyName("Summit AI Consulting LLC")).toBe(false);
    expect(isAgreementSectionHeadingPartyName("2. Summit AI Consulting LLC (Lead Provider)")).toBe(false);
    expect(isAuthoritativeLegalEntityName("Summit AI Consulting LLC")).toBe(true);
  });

  it("rejects occupational appositives as party legal entities", () => {
    expect(isOccupationalOrJobTitlePartyName("Freelance Product Designer")).toBe(true);
    expect(isAuthoritativeLegalEntityName("Freelance Product Designer")).toBe(false);
    expect(isOccupationalOrJobTitlePartyName("Alex Rivera")).toBe(false);
    expect(isOccupationalOrJobTitlePartyName("PixelForge Labs")).toBe(false);
  });

  it("derives short forms from legal entity names", () => {
    expect(shortFormsFromLegalName("Ironclad Systems Group LLC")).toContain("Ironclad");
    expect(shortFormsFromLegalName("Silver Mesa Analytics LP")).toContain("Silver Mesa");
  });

  it("preserves full names in preamble when model shortened them", () => {
    const parties = [
      "Ironclad Systems Group LLC",
      "Harborline Data Solutions Inc.",
      "Northwind Automation Partners LLC",
    ];
    const body = "This Agreement is among Ironclad, Harborline, and Northwind.";
    const out = preserveFullLegalPartyNamesInOpeningAndSignatures(body, parties, null);
    expect(out).toContain("Ironclad Systems Group LLC");
    expect(out).toContain("Harborline Data Solutions Inc.");
    expect(out).toContain("Northwind Automation Partners LLC");
  });

  it("does not duplicate execution blocks when witness falls within preamble cap", () => {
    const redMesa = "Red Mesa Logistics LLC";
    const harborPeak = "Harbor Peak Automation LLC";
    const witnessLine = "IN WITNESS WHEREOF, the parties execute this Agreement.";
    const body = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Agreement is between ${redMesa} (Client) and Harbor Peak Automation (Service Provider).`,
      "",
      "1. SCOPE OF SERVICES",
      "Professional workflow automation consulting services.",
      "",
      witnessLine,
      "",
      "CLIENT:",
      redMesa,
      "By: ______________________________",
      "",
      "SERVICE PROVIDER:",
      "Harbor Peak Automation",
      "By: ______________________________",
    ].join("\n");
    let padded = body;
    while (padded.length < 12_000) {
      padded += "\n\nSupplemental operative clause under Oklahoma law.";
    }
    const out = preserveFullLegalPartyNamesInOpeningAndSignatures(
      padded,
      [redMesa, harborPeak],
      null,
    );
    const tail = out.slice(out.search(/\bIN WITNESS WHEREOF\b/i));
    expect((tail.match(/^\s*CLIENT\s*:/gim) || []).length).toBe(1);
    expect((tail.match(/^\s*SERVICE\s+PROVIDER\s*:/gim) || []).length).toBe(1);
    expect(out).toContain(harborPeak);
  });

  it("collapses duplicate notice entity lines introduced by short-label expansion", () => {
    const parties = ["Iron Vale Systems Inc.", "Harbor Peak Automation LLC"];
    const body = [
      "If to Iron Vale Systems Inc.:",
      "Iron Vale Systems Inc.",
      "Iron Vale",
      "Attn: Robert Henderson, President",
    ].join("\n");
    const out = preserveFullLegalPartyNames(body, parties, null);
    const entityBodyLines = out
      .split("\n")
      .filter((line) => line.trim() === "Iron Vale Systems Inc.");
    expect(entityBodyLines).toHaveLength(1);
    expect(out).toContain("Attn: Robert Henderson, President");
  });

  it("collapseDuplicateNoticeEntityLines removes consecutive canonical entity dupes", () => {
    const parties = ["Iron Vale Systems Inc.", "Other Party LLC"];
    const raw = [
      "If to Iron Vale Systems Inc.:",
      "Iron Vale Systems Inc.",
      "Iron Vale Systems Inc.",
      "Attn: Robert Henderson, President",
    ].join("\n");
    const out = collapseDuplicateNoticeEntityLines(raw, parties);
    expect(out.split("\n").filter((l) => l.trim() === "Iron Vale Systems Inc.")).toHaveLength(1);
  });
});
