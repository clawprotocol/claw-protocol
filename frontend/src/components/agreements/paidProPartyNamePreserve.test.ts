import { describe, expect, it } from "vitest";
import {
  shortFormsFromLegalName,
  preserveFullLegalPartyNamesInOpeningAndSignatures,
  preserveFullLegalPartyNames,
  collapseDuplicateNoticeEntityLines,
} from "./paidProPartyNamePreserve";

describe("paidProPartyNamePreserve", () => {
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
