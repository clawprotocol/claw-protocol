import { describe, expect, it } from "vitest";
import {
  repairDuplicatedEntityPunctuationInDisplay,
  substitutePartyPlaceholdersInUserFacingText,
} from "./partyPlaceholderDisplay";

describe("partyPlaceholderDisplay entity punctuation", () => {
  it("repairs Inc.. LLC.. Corp.. Ltd.. in display text", () => {
    expect(repairDuplicatedEntityPunctuationInDisplay("Iron Vale Systems Inc..")).toBe(
      "Iron Vale Systems Inc.",
    );
    expect(repairDuplicatedEntityPunctuationInDisplay("Acme Holdings LLC..")).toBe("Acme Holdings LLC.");
    expect(repairDuplicatedEntityPunctuationInDisplay("Beta Corp..")).toBe("Beta Corp.");
    expect(repairDuplicatedEntityPunctuationInDisplay("Gamma Ltd..")).toBe("Gamma Ltd.");
  });

  it("preserves valid single punctuation", () => {
    expect(repairDuplicatedEntityPunctuationInDisplay("Iron Vale Systems Inc.")).toBe(
      "Iron Vale Systems Inc.",
    );
  });

  it("applies repair at end of substitutePartyPlaceholdersInUserFacingText", () => {
    const out = substitutePartyPlaceholdersInUserFacingText(
      "Between Owner and Iron Vale Systems Inc..",
      "Between Owner and Iron Vale Systems Inc..",
      ["Owner Co", "Iron Vale Systems Inc.."],
    );
    expect(out).not.toContain("Inc..");
    expect(out).toContain("Inc.");
  });
});
