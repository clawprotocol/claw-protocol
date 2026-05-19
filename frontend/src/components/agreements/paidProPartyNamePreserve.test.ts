import { describe, expect, it } from "vitest";
import {
  shortFormsFromLegalName,
  preserveFullLegalPartyNamesInOpeningAndSignatures,
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
});
