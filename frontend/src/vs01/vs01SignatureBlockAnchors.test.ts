import { describe, expect, it } from "vitest";
import {
  findSignatureLineAnchorsFromCorpusText,
  signatureAnchorToPrepareRect,
  signatureRectsFollowBlockOrder,
  SIGNATURE_BY_LINE_X,
} from "./vs01SignatureBlockAnchors";
import { PREPARE_PAGE_FOOTER_BAND_Y } from "./signingFields";

const CORPUS = `
7. General Terms
Electronic Signatures are permitted.

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();

describe("vs01SignatureBlockAnchors (test39)", () => {
  it("finds By-line anchors for client and service provider", () => {
    const anchors = findSignatureLineAnchorsFromCorpusText(CORPUS);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors.some((a) => a.partyIndex === 0 && a.blockHeading === "CLIENT")).toBe(true);
    expect(anchors.some((a) => a.partyIndex === 1 && a.blockHeading === "SERVICE PROVIDER")).toBe(true);
  });

  it("maps signature fields on By lines with client above provider", () => {
    const anchors = findSignatureLineAnchorsFromCorpusText(CORPUS);
    const client = signatureAnchorToPrepareRect({
      anchor: anchors.find((a) => a.partyIndex === 0) ?? null,
      partyIndex: 0,
      roleCount: 2,
      fieldType: "signature",
    });
    const provider = signatureAnchorToPrepareRect({
      anchor: anchors.find((a) => a.partyIndex === 1) ?? null,
      partyIndex: 1,
      roleCount: 2,
      fieldType: "signature",
    });
    expect(client.x).toBeCloseTo(SIGNATURE_BY_LINE_X, 2);
    expect(provider.x).toBeCloseTo(SIGNATURE_BY_LINE_X, 2);
    expect(signatureRectsFollowBlockOrder(client, provider)).toBe(true);
    expect(client.y + client.height).toBeLessThanOrEqual(PREPARE_PAGE_FOOTER_BAND_Y);
    expect(provider.y + provider.height).toBeLessThanOrEqual(PREPARE_PAGE_FOOTER_BAND_Y);
  });

  it("keeps anchored rects inside safe margins on narrow/mobile widths", () => {
    const anchor = findSignatureLineAnchorsFromCorpusText(CORPUS)[0] ?? null;
    const rect = signatureAnchorToPrepareRect({
      anchor,
      partyIndex: 0,
      roleCount: 2,
      fieldType: "signature",
    });
    expect(rect.x + rect.width).toBeLessThanOrEqual(0.95);
    expect(rect.y).toBeGreaterThanOrEqual(0.03);
  });
});
