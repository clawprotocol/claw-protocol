import { describe, expect, it } from "vitest";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  findSignatureLinePlacementsFromFlowPage,
  signatureFieldRectOnUnderlineAnchor,
  signatureUnderlineBandFromAnchor,
  VS01_CANONICAL_SIGNATURE_UNDERLINE_WIDTH_NORM,
  VS01_SIGNATURE_FIELD_HEIGHT_NORM,
} from "./buildVs01SigningPacketModel";
import type { PlacedSigningField } from "./signingFields";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);
const Y_TOLERANCE = 0.006;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_underline_placement",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumWitnessCorpus(repeat = 100): string {
  return `${"Premium operational clause with detailed duties, milestones, remedies, approvals, and payment mechanics. ".repeat(repeat)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
By: ______________________
Name: Joe Smith
Title: Consultant
Date: ____________________`;
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function placementOffsets(field: PlacedSigningField, anchor: { x: number; y: number; width: number }) {
  return {
    xInset: field.x - anchor.x,
    yFromUnderline: anchor.y - field.y,
  };
}

describe("VS01 canonical signature underline placement", () => {
  it("anchors each signer field on its own By underline with consistent formula", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumWitnessCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);

    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    expect(witnessPage).toBeTruthy();

    const flowAnchors = findSignatureLinePlacementsFromFlowPage(witnessPage);
    expect(flowAnchors).toHaveLength(2);
    expect(witnessPage.signatureLineAnchors).toEqual(flowAnchors);

    const signatureFields = model.fields
      .filter((f) => f.type === "signature")
      .sort((a, b) => (a.assignedPartyIndex ?? 0) - (b.assignedPartyIndex ?? 0));
    expect(signatureFields).toHaveLength(2);

    const offsets: ReturnType<typeof placementOffsets>[] = [];

    for (const partyIndex of [0, 1]) {
      const anchor = flowAnchors.find((a) => a.partyIndex === partyIndex)!;
      const field = signatureFields.find((f) => f.assignedPartyIndex === partyIndex)!;
      const expected = signatureFieldRectOnUnderlineAnchor(anchor);

      expect(field.x).toBeCloseTo(expected.x, 4);
      expect(field.y).toBeCloseTo(expected.y, 4);
      expect(field.width).toBeCloseTo(expected.width, 4);
      expect(field.height).toBeCloseTo(VS01_SIGNATURE_FIELD_HEIGHT_NORM, 4);
      expect(anchor.width).toBeGreaterThanOrEqual(VS01_CANONICAL_SIGNATURE_UNDERLINE_WIDTH_NORM);
      expect(field.width).toBeGreaterThanOrEqual(anchor.width * 0.68);
      expect(field.x + field.width).toBeLessThanOrEqual(anchor.x + anchor.width + 0.0001);

      expect(rectsIntersect(field, signatureUnderlineBandFromAnchor(anchor))).toBe(true);

      const otherAnchor = flowAnchors.find((a) => a.partyIndex !== partyIndex)!;
      if (partyIndex === 1) {
        expect(rectsIntersect(field, signatureUnderlineBandFromAnchor(otherAnchor))).toBe(false);
      }

      const underlineBand = signatureUnderlineBandFromAnchor(anchor);
      const fieldCenter = field.y + field.height / 2;
      const underlineCenter = underlineBand.y + underlineBand.height / 2;
      expect(Math.abs(fieldCenter - underlineCenter)).toBeLessThanOrEqual(Y_TOLERANCE);
      expect(field.x).toBeGreaterThan(anchor.x);

      offsets.push(placementOffsets(field, anchor));
    }

    expect(offsets[0]!.xInset).toBeCloseTo(offsets[1]!.xInset, 4);
    expect(offsets[0]!.yFromUnderline).toBeCloseTo(offsets[1]!.yFromUnderline, 4);
  });
});
