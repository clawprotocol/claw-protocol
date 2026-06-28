import { describe, expect, it } from "vitest";
import {
  buildFlowLineDescriptors,
} from "./vs01CanonicalTextLayout";

const FOUR_PARTY_WITNESS = [
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "Evergreen Outdoor Brands LLC:",
  "By: ______________________________",
  "Name: Ann Center",
  "Title: CIO",
  "",
  "Atlas Consumer Products Inc:",
  "By: ______________________________",
  "Name: Hans Wiener",
  "Title: Member",
  "",
  "Horizon Wholesale Group LLC:",
  "By: ______________________________",
  "Name: Benton Reese",
  "Title: Manager",
  "",
  "BrightPeak Retail Solutions LLC:",
  "By: ______________________________",
  "Name: Eve Green",
  "Title: CEO",
];

describe("vs01ExecutionBlockHeading — four-party entity execution block", () => {
  it("assigns partyIndex 0–3 to By: lines under entity legal-name headings", () => {
    const descriptors = buildFlowLineDescriptors(FOUR_PARTY_WITNESS, {
      roleEntityNames: [
        "Evergreen Outdoor Brands LLC",
        "Atlas Consumer Products Inc",
        "Horizon Wholesale Group LLC",
        "BrightPeak Retail Solutions LLC",
      ],
    });
    const sigLines = descriptors.filter((d) => d.isSignatureExecutionLine);
    expect(sigLines.map((d) => d.partyIndex)).toEqual([0, 1, 2, 3]);
  });
});
