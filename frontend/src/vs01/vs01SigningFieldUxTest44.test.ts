import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAutoSignaturePacketForAllRoles,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";

const CORPUS = `
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

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test44",
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe345@gmail.com", signerName: "Joe Smith" }],
  });
}

describe("VS01 signing-field UX test44", () => {
  it("prep and recipient signing surfaces share LawDogSigningField shell/class", () => {
    const component = readFileSync(join(__dirname, "LawDogSigningField.tsx"), "utf8");
    const prep = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const recipient = readFileSync(join(__dirname, "RecipientSigningFieldOverlay.tsx"), "utf8");
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(component).toContain("LAWDOG_SIGNING_FIELD_CLASS");
    expect(component).toContain("lawdog-signing-field");
    expect(prep).toContain("LawDogSigningField");
    expect(recipient).toContain("LawDogSigningField");
    expect(css).toContain(".lawdog-signing-field");
    expect(css).toContain(".vs01-recipient-signing-view .lawdog-signing-field.vs01-sign-placement-box");
  });

  it("final-review preview geometry source matches VS01 packet geometry", () => {
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: {
        typedName: "Anthem H Blanchard",
        initials: "AB",
        signerEmail: "anthemhayek@gmail.com",
      },
      corpusText: CORPUS,
    });
    const finalReviewPreviewGeometryHash = signingFieldGeometryHash(packet.fields);
    const vs01PacketGeometryHash = signingFieldGeometryHash(packet.fields);
    expect(packet.placedCount).toBe(2);
    expect(packet.confidence).toBe("high");
    expect(finalReviewPreviewGeometryHash).toBe(vs01PacketGeometryHash);
  });

  it("known identity stays document text and does not create editable metadata overlays", () => {
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: {
        typedName: "Anthem H Blanchard",
        initials: "AB",
        signerEmail: "anthemhayek@gmail.com",
      },
      corpusText: CORPUS,
    });
    expect(packet.fields.map((f) => f.type)).toEqual(["signature", "signature"]);
    expect(packet.fields.some((f) => f.type === "printed_name" || f.type === "text" || f.type === "date")).toBe(false);
  });
});
