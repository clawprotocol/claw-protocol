import { describe, expect, it } from "vitest";
import {
  isUnknownIntakePlaceholderValue,
  labeledPartyLegalEntities,
  parseLabeledPartyBlocks,
} from "./labeledPartyBlockParse";

const SAMPLE = `Party 1
Legal Entity: Red Mesa Logistics LLC
Signer Name: Sarah Mitchell
Signer Title: Chief Executive Officer
Signer Email: sarah@redmesalogistics.com
Address: 845 Tyrone St., Bentonville, AR 75029

Party 2
Legal Entity: Harbor Peak Automation LLC
Signer Name: Robert Henderson

Party 3
Legal Entity: Blue Canyon Analytics LLC
Signer Name: Unknown
Signer Title: Unknown`;

const STACKED_UNLABELED = `Party 1:
Blue Canyon Analytics LLC
Sarah Mitchell
CEO
sarah@bluecanyonanalytics.com

Party 2:
Harbor Peak Automation LLC
Michael Torres
President
michael@harborpeakautomation.com`;

describe("labeledPartyBlockParse", () => {
  it("parses labeled party blocks and treats Unknown as blank", () => {
    const blocks = parseLabeledPartyBlocks(SAMPLE);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      index: 1,
      legalEntity: "Red Mesa Logistics LLC",
      signerName: "Sarah Mitchell",
      signerTitle: "Chief Executive Officer",
      signerEmail: "sarah@redmesalogistics.com",
      address: "845 Tyrone St., Bentonville, AR 75029",
    });
    expect(blocks[2]?.signerName).toBe("");
    expect(blocks[2]?.signerTitle).toBe("");
    expect(isUnknownIntakePlaceholderValue("Unknown")).toBe(true);
    expect(labeledPartyLegalEntities(SAMPLE)).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);
  });

  it("parses stacked unlabeled Party N blocks (entity, signer, title, email lines)", () => {
    const blocks = parseLabeledPartyBlocks(STACKED_UNLABELED);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.legalEntity).toBe("Blue Canyon Analytics LLC");
    expect(blocks[0]?.signerName).toBe("Sarah Mitchell");
    expect(blocks[0]?.signerTitle).toBe("CEO");
    expect(blocks[1]?.legalEntity).toBe("Harbor Peak Automation LLC");
    expect(blocks[1]?.signerEmail).toBe("michael@harborpeakautomation.com");
  });
});
