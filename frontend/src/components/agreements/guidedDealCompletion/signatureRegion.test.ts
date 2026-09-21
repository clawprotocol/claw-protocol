import { describe, expect, it } from "vitest";
import {
  assertGuidedVs01SigningHandoffReady,
} from "./guidedFinalReviewToSigning";
import {
  corpusSignatureBlocksHaveRequiredByLines,
  countSignatureBlockHeadingsInTail,
  findSignatureRegionStart,
} from "./signatureRegion";

describe("signatureRegion", () => {
  it("does not anchor on early EXECUTION prose (test28)", () => {
    const body =
      "The execution of this Agreement shall occur as provided herein.\n" +
      "x".repeat(8200) +
      "\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\nCLIENT:\nName: ________";
    const marker = findSignatureRegionStart(body);
    expect(marker).toBeGreaterThan(4000);
    expect(marker).toBeLessThan(body.length);
  });

  it("does not treat numbered operational paragraphs after witness as signature headings", () => {
    const prefix = "x".repeat(2400);
    const body = [
      prefix,
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
      "",
      "Lumen Bioinformatics Inc",
      "",
      "Thalassa Data Systems LLC By: Marcus Webb Title: President Date: ________",
      "",
      "Coastal Meridian Analytics LLC By: Priya Nair Title: Vice President of Operations Date: ________",
      "",
      "Vanguard Regulatory Sciences Ltd. By: James O'Sullivan Title: Managing Director Date: ________",
      "",
      "13. Lumen Bioinformatics Inc.",
      "shall keep a written record of its assigned deliverables.",
      "",
      "31. Coastal Meridian Analytics LLC",
      "shall not assign this Agreement without prior written consent.",
    ].join("\n");
    expect(countSignatureBlockHeadingsInTail(body)).toBeLessThanOrEqual(4);
    expect(corpusSignatureBlocksHaveRequiredByLines(body, 4)).toBe(true);
    expect(body).toMatch(/\sBy:\s/);
    const handoff = assertGuidedVs01SigningHandoffReady({
      manifest: {
        parties: [
          {
            index: 0,
            role: "client",
            partyName: "Lumen Bioinformatics Inc.",
            email: "elena.vasquez@lumenbio.com",
            signerName: "Dr. Elena Vasquez",
            signerTitle: "CSO",
            roleLabel: "Platform Developer",
            signerKind: "entity_representative",
            isSenderSide: true,
            isIndividual: false,
          },
          {
            index: 1,
            role: "service_provider",
            partyName: "Thalassa Data Systems LLC",
            email: "marcus.webb@thalassadata.com",
            signerName: "Marcus Webb",
            signerTitle: "President",
            roleLabel: "Data Infrastructure Provider",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
          {
            index: 2,
            role: "party_2",
            partyName: "Coastal Meridian Analytics LLC",
            email: "priya.nair@coastalmeridian.com",
            signerName: "Priya Nair",
            signerTitle: "VP Ops",
            roleLabel: "Analytics Integrator",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
          {
            index: 3,
            role: "party_3",
            partyName: "Vanguard Regulatory Sciences Ltd.",
            email: "james.osullivan@vanguardregulatory.co",
            signerName: "James O'Sullivan",
            signerTitle: "Managing Director",
            roleLabel: "Regulatory Compliance Advisor",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
        ],
      },
      corpusSource: "accepted_review",
      corpusBody: body,
    });
    expect(handoff).toEqual({ ok: true });
  });
});
