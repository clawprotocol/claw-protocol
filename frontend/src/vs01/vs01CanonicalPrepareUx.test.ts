import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  maxFlowLinesPerSigningPacketPage,
  signatureFieldRectOnUnderlineAnchor,
  validateVs01SigningPacketGeometry,
} from "./buildVs01SigningPacketModel";
import { alignPlacedSignatureFieldToMeasuredUnderline } from "./vs01CanonicalTextLayout";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_prepare_ux",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumCorpus(repeat = 90): string {
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
Signature: _______________
Name: Joe Smith
Date: ____________________`;
}

describe("VS01 canonical prepare UX regressions", () => {
  it("keeps paginated text blocks out of the initials band", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);
    expect(model.diagnostics.textIntersectsInitialsBand).toBe(false);
    expect(
      validateVs01SigningPacketGeometry({
        pages: model.pages,
        fields: model.fields,
        roleCount: roles().length,
      }),
    ).not.toContain("text_intersects_initials_band");
  });

  it("aligns the second signer signature field to the measured underline anchor", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
    const anchor = witnessPage!.signatureLineAnchors.find((a) => a.partyIndex === 1);
    expect(anchor).toBeTruthy();
    const field = model.fields.find((f) => f.type === "signature" && f.assignedPartyIndex === 1);
    expect(field).toBeTruthy();
    const onUnderline = signatureFieldRectOnUnderlineAnchor(anchor!);
    expect(field!.y).toBeCloseTo(onUnderline.y, 3);
    expect(field!.x).toBeCloseTo(onUnderline.x, 3);
    const measured = { x: anchor!.x, y: anchor!.y, width: anchor!.width, height: anchor!.height };
    const aligned = alignPlacedSignatureFieldToMeasuredUnderline(field!, measured);
    expect(aligned.y).toBeCloseTo(onUnderline.y, 3);
  });

  it("does not start the witness block deep in a mostly empty page", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
    const witnessLineIdx = witnessPage!.flowLines.findIndex((line) =>
      /\bIN WITNESS WHEREOF\b/i.test(line),
    );
    const maxLines = maxFlowLinesPerSigningPacketPage();
    expect(witnessLineIdx).toBeGreaterThanOrEqual(0);
    expect(witnessLineIdx).toBeLessThan(Math.ceil(maxLines * 0.65));
  });

  it("prepare headline copy is gated on packetReady", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("PREPARE_PACKET_BRIDGE_HEADLINE_READY");
    expect(src).toContain("PREPARE_PACKET_BRIDGE_HEADLINE_BLOCKED");
    expect(src).toMatch(/packetReady[\s\S]{0,80}PREPARE_PACKET_BRIDGE_HEADLINE_READY/);
    expect(src).toMatch(/PREPARE_PACKET_BRIDGE_HEADLINE_BLOCKED/);
    expect(src).not.toMatch(
      /agreementBridgePlacementCopy\s*\?\s*PREPARE_PACKET_BRIDGE_HEADLINE_READY\s*:/,
    );
  });
});
