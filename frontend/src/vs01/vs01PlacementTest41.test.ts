import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
} from "./vs01AutoSignaturePacket";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildPrepareAutoInitialsEveryPage,
} from "./vs01PrepareFieldPlacement";
import {
  buildPreparePageLayoutObstacleRects,
  fieldRectsOverlap,
  isRectInPrepareAutoInitialsSafeZone,
  PREPARE_AUTO_INITIALS_SAFE_RIGHT_MARGIN,
  PREPARE_AUTO_INITIALS_UPPER_Y_MAX,
  PREPARE_PAGE_FOOTER_BAND_Y,
} from "./signingFields";
import {
  corpusHasPrefilledSignatureIdentity,
  findSignatureLineAnchorsFromCorpusText,
  signatureAnchorToPrepareRect,
  signatureRectsFollowBlockOrder,
  SIGNATURE_BY_LINE_X,
} from "./vs01SignatureBlockAnchors";
import { resolvePrepareSignerDisplayName } from "./vs01PrepareSignerDisplay";
import { resolveVs01FieldValueForRole } from "./vs01FieldValueResolution";
import { isRecipientSigningEditableType } from "./recipientSigningFieldUtils";

const TEST41_CORPUS = `
IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();

function test41Roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test41",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

describe("VS01 placement test41 regression", () => {
  it("detects CLIENT and SERVICE PROVIDER By-line anchors", () => {
    const anchors = findSignatureLineAnchorsFromCorpusText(TEST41_CORPUS);
    expect(anchors.length).toBe(2);
    expect(anchors[0]?.blockHeading).toBe("CLIENT");
    expect(anchors[1]?.blockHeading).toBe("SERVICE PROVIDER");
    expect(anchors[0]?.byLineIndexInTail).toBeLessThan(anchors[1]?.byLineIndexInTail ?? 0);
  });

  it("places Acme/Anthem signature on CLIENT By line above Joe signature", () => {
    const anchors = findSignatureLineAnchorsFromCorpusText(TEST41_CORPUS);
    const clientSig = signatureAnchorToPrepareRect({
      anchor: anchors[0] ?? null,
      partyIndex: 0,
      roleCount: 2,
      fieldType: "signature",
    });
    const providerSig = signatureAnchorToPrepareRect({
      anchor: anchors[1] ?? null,
      partyIndex: 1,
      roleCount: 2,
      fieldType: "signature",
    });
    expect(clientSig.x).toBeCloseTo(SIGNATURE_BY_LINE_X, 2);
    expect(providerSig.x).toBeCloseTo(SIGNATURE_BY_LINE_X, 2);
    expect(signatureRectsFollowBlockOrder(clientSig, providerSig)).toBe(true);
    expect(clientSig.y + clientSig.height).toBeLessThan(PREPARE_PAGE_FOOTER_BAND_Y);
    expect(providerSig.y + providerSig.height).toBeLessThan(PREPARE_PAGE_FOOTER_BAND_Y);
  });

  it("auto packet with prefilled corpus places signature-only fields (no name/title/date fields)", () => {
    expect(corpusHasPrefilledSignatureIdentity(TEST41_CORPUS)).toBe(true);
    const roles = test41Roles();
    const result = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem Blanchard", initials: "AB", signerEmail: "anthem@example.test" },
      corpusText: TEST41_CORPUS,
    });
    expect(result.placedCount).toBe(2);
    expect(result.fields.every((f) => f.type === "signature")).toBe(true);
    expect(result.fields.some((f) => f.type === "printed_name")).toBe(false);
    expect(result.fields.some((f) => f.type === "text")).toBe(false);
    expect(result.fields.some((f) => f.type === "date")).toBe(false);
    const ownerSig = result.fields.find((f) => f.assignedPartyIndex === 0);
    const cpSig = result.fields.find((f) => f.assignedPartyIndex === 1);
    expect(ownerSig?.value).toBe("Anthem Blanchard");
    expect(ownerSig && cpSig && ownerSig.y < cpSig.y).toBe(true);
  });

  it("initials stay within mobile-safe bounds and avoid footer/signature obstacles", () => {
    const roles = test41Roles();
    const owner = roles[0]!;
    const cp = roles[1]!;
    const signatures = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem Blanchard", initials: "AB", signerEmail: "anthem@example.test" },
      corpusText: TEST41_CORPUS,
    }).fields;
    let existing = [...signatures];
    existing = [
      ...existing,
      ...buildPrepareAutoInitialsEveryPage({
        role: owner,
        pageCount: 2,
        skippedPages: new Set(),
        existingFields: existing,
        valueCtx: { typedName: "Anthem Blanchard", initials: "AB" },
      }),
    ];
    existing = [
      ...existing,
      ...buildPrepareAutoInitialsEveryPage({
        role: cp,
        pageCount: 2,
        skippedPages: new Set(),
        existingFields: existing,
        valueCtx: { typedName: "Joe Smith", initials: "JS" },
      }),
    ];
    const layoutObstacles = buildPreparePageLayoutObstacleRects(0);
    for (const f of existing.filter((x) => x.type === "initials")) {
      expect(f.x + f.width).toBeLessThanOrEqual(1 - PREPARE_AUTO_INITIALS_SAFE_RIGHT_MARGIN + 1e-5);
      expect(f.y + f.height).toBeLessThanOrEqual(PREPARE_AUTO_INITIALS_UPPER_Y_MAX + 0.05);
      expect(isRectInPrepareAutoInitialsSafeZone(f)).toBe(true);
      for (const sig of signatures) {
        expect(fieldRectsOverlap(f, sig)).toBe(false);
      }
      for (const o of layoutObstacles) {
        expect(fieldRectsOverlap(f, o)).toBe(false);
      }
    }
  });

  it("does not resolve signer display name from email when signerName exists", () => {
    const roles = test41Roles();
    const cp = roles[1]!;
    const resolved = resolvePrepareSignerDisplayName(cp, "prepare_display");
    expect(resolved.value).toBe("Joe Smith");
    expect(resolved.source).not.toBe("email_local_part");
    const initials = resolveVs01FieldValueForRole({
      fieldType: "initials",
      role: cp,
      mode: "prepare_stored",
    });
    expect(initials).toBe("JS");
  });

  it("counterparty metadata fields are not editable types on recipient signing surface", () => {
    expect(isRecipientSigningEditableType("signature")).toBe(true);
    expect(isRecipientSigningEditableType("initials")).toBe(true);
    expect(isRecipientSigningEditableType("printed_name")).toBe(false);
    expect(isRecipientSigningEditableType("text")).toBe(false);
    expect(isRecipientSigningEditableType("date")).toBe(false);
  });
});
