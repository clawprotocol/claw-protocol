import { describe, expect, it } from "vitest";
import {
  fillBlankPreservedAddedPartySignerNames,
  shouldPreserveApprovedAddedPartyExecutionTail,
} from "./paidProDeclaredConsultantClientPaper";

const HARBOR = "Harbor Peak Analytics LLC";
const IRONVALE = "Ironvale Manufacturing Inc.";
const PARTIES = [
  { partyLegalName: HARBOR, signerName: "Pat Harbor" },
  { partyLegalName: "Ironvale Manufacturing Inc", signerName: "Sam Ironvale" },
  { partyLegalName: "Alex Rivera", signerName: "Alex Rivera" },
];

describe("fillBlankPreservedAddedPartySignerNames", () => {
  it("replaces an inline CLIENT Name that is another party's legal entity", () => {
    const clause =
      `This Services Agreement is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Consultant, Client, and Advisor may be referred to individually as a "Party".`;
    const accepted = [
      clause,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CONSULTANT:",
      HARBOR,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "CLIENT:",
      "Ironvale Manufacturing Inc",
      `CLIENT: Ironvale Manufacturing Inc By: __________________________ Name: Harbor Peak Analytics LLC Title: _________________________`,
      "ADVISOR:",
      "Alex Rivera",
      "By: __________________________",
      "Name: Alex Rivera",
      "Title: ________",
    ].join("\n");

    expect(
      shouldPreserveApprovedAddedPartyExecutionTail(accepted, [HARBOR, IRONVALE, "Alex Rivera"]),
    ).toBe(true);

    const filled = fillBlankPreservedAddedPartySignerNames(accepted, PARTIES);
    expect(filled.slice(0, filled.search(/\bIN WITNESS WHEREOF\b/))).toBe(
      accepted.slice(0, accepted.search(/\bIN WITNESS WHEREOF\b/)),
    );
    expect(filled).toContain("Name: Pat Harbor");
    expect(filled).toContain("Name: Sam Ironvale");
    expect(filled).toMatch(/CLIENT: Ironvale Manufacturing Inc By: .+ Name: Sam Ironvale Title:/);
    expect(filled).not.toMatch(/CLIENT:.+Name: Harbor Peak Analytics LLC/);
    expect(filled).not.toContain("Consultant's authorized signer is");
  });

  it("fills a standalone blank Name under a CLIENT heading", () => {
    const accepted = [
      `This Services Agreement is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client").`,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CONSULTANT:",
      HARBOR,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "",
      "CLIENT:",
      "Ironvale Manufacturing Inc",
      "By: __________________________",
      "Name:",
      "Title: _________________________",
      "",
      "ADVISOR:",
      "Alex Rivera",
      "By: __________________________",
      "Name: Alex Rivera",
      "Title: ________",
    ].join("\n");

    const filled = fillBlankPreservedAddedPartySignerNames(accepted, PARTIES);
    expect(filled).toMatch(/CONSULTANT:[\s\S]{0,160}Name: Pat Harbor/);
    expect(filled).toMatch(/CLIENT:[\s\S]{0,160}Name: Sam Ironvale/);
    expect(filled).toMatch(/ADVISOR:[\s\S]{0,160}Name: Alex Rivera/);
  });
});
