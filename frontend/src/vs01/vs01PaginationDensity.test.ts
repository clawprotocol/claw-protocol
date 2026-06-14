import { describe, expect, it } from "vitest";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  maxFlowLinesPerSigningPacketPage,
  VS01_PACKET_LINE_HEIGHT_PT,
  VS01_PACKET_MARGIN_TOP_PT,
} from "./buildVs01SigningPacketModel";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_density",
    creatorName: "Blue Canyon Analytics LLC",
    creatorEmail: "owner@example.test",
    ownerSignerName: "Sarah Mitchell",
    ownerSignerTitle: "CEO",
    counterparties: [
      { id: "cp1", name: "Iron Vale Systems Inc.", email: "reviewer@example.test", signerName: "Michael Torres" },
    ],
  });
}

function consultingStyleCorpus(): string {
  const clause =
    "Provider shall perform commercially reasonable services, maintain documentation, and deliver milestones on schedule. ";
  const body = Array.from({ length: 42 }, (_, index) => `${index + 1}. Section ${index + 1}. ${clause.repeat(3)}`).join(
    "\n\n",
  );
  return `${body}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Blue Canyon Analytics LLC
By: ______________________
Name: Sarah Mitchell
Title: CEO
Date: ____________________

SERVICE PROVIDER:
Iron Vale Systems Inc.
By: ______________________
Name: Michael Torres
Title: President
Date: ____________________`;
}

describe("vs01 pagination density", () => {
  it("uses professional letter density constants without crowding", () => {
    expect(VS01_PACKET_MARGIN_TOP_PT).toBeLessThanOrEqual(48);
    expect(VS01_PACKET_LINE_HEIGHT_PT).toBeGreaterThanOrEqual(16.5);
    expect(VS01_PACKET_LINE_HEIGHT_PT).toBeLessThanOrEqual(18.5);
    expect(maxFlowLinesPerSigningPacketPage()).toBeGreaterThanOrEqual(33);
  });

  it("paginates a consulting-length corpus efficiently without clipping witness block", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: consultingStyleCorpus(),
      roles: roles(),
      corpusGateArgs: { premiumComplete: true, signatureRebuilt: true },
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThan(2);
    expect(model.pages.length).toBeLessThanOrEqual(12);
    expect(model.diagnostics.textIntersectsInitialsBand).toBe(false);
    const witnessPage = model.pages.find((page) =>
      page.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
  });
});
