import { describe, expect, it } from "vitest";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  canonicalFlowLineStackStepUnits,
  findSignatureLinePlacementsFromFlowPage,
  signatureFieldRectOnUnderlineAnchor,
  signatureUnderlineBandFromAnchor,
  VS01_CANONICAL_SIGNATURE_UNDERLINE_WIDTH_NORM,
  VS01_PACKET_LINE_HEIGHT_PT,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_SIGNATURE_FIELD_HEIGHT_NORM,
  type Vs01SigningPacketPage,
} from "./buildVs01SigningPacketModel";
import { buildFlowLineDescriptors, flowLinesForPage } from "./vs01CanonicalTextLayout";
import type { PlacedSigningField } from "./signingFields";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);
const LINE_HEIGHT = VS01_PACKET_LINE_HEIGHT_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const Y_TOLERANCE = 0.004;

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

function nameLineTopByParty(page: Pick<Vs01SigningPacketPage, "flowLines" | "contentRect" | "textBlocks">): Map<number, number> {
  const descriptors = buildFlowLineDescriptors(flowLinesForPage(page));
  let cursorY = page.contentRect.y;
  let currentParty: number | null = null;
  const tops = new Map<number, number>();

  for (const descriptor of descriptors) {
    const step = canonicalFlowLineStackStepUnits(descriptor.text);
    const lineTop = cursorY;

    if (descriptor.trimmed) {
      if (/^\s*CLIENT\s*:?\s*$/i.test(descriptor.trimmed)) currentParty = 0;
      else if (/^\s*SERVICE PROVIDER\s*:?\s*$/i.test(descriptor.trimmed)) currentParty = 1;
      else {
        const partyMatch = descriptor.trimmed.match(/^\s*PARTY\s+(\d+)\s*:?\s*$/i);
        if (partyMatch) currentParty = Math.max(0, Number(partyMatch[1]) - 1);
      }
    }

    if (/^Name\s*:/i.test(descriptor.trimmed) && currentParty != null && !tops.has(currentParty)) {
      tops.set(currentParty, lineTop);
    }

    cursorY += step * LINE_HEIGHT;
  }

  return tops;
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

    const nameTops = nameLineTopByParty(witnessPage);
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
      expect(field.width).toBeGreaterThanOrEqual(anchor.width * 0.8);
      expect(field.x + field.width).toBeLessThanOrEqual(anchor.x + anchor.width + 0.0001);

      expect(rectsIntersect(field, signatureUnderlineBandFromAnchor(anchor))).toBe(true);

      const otherAnchor = flowAnchors.find((a) => a.partyIndex !== partyIndex)!;
      if (partyIndex === 1) {
        expect(rectsIntersect(field, signatureUnderlineBandFromAnchor(otherAnchor))).toBe(false);
      }

      const underlineBand = signatureUnderlineBandFromAnchor(anchor);
      expect(field.y + field.height).toBeLessThanOrEqual(underlineBand.y + underlineBand.height + Y_TOLERANCE);
      expect(field.y).toBeLessThan(anchor.y + Y_TOLERANCE);

      const nameTop = nameTops.get(partyIndex);
      expect(nameTop).toBeDefined();
      expect(field.y + field.height).toBeLessThan(nameTop! - 0.002);

      offsets.push(placementOffsets(field, anchor));
    }

    expect(offsets[0]!.xInset).toBeCloseTo(offsets[1]!.xInset, 4);
    expect(offsets[0]!.yFromUnderline).toBeCloseTo(offsets[1]!.yFromUnderline, 4);
  });
});
