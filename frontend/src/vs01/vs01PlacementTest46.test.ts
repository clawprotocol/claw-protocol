import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import {
  assertFieldsClearOfText,
  fieldOverlapsDocumentText,
  textObstaclesForSignaturePlacement,
} from "./vs01FieldGeometry";
import { buildPrepareAutoInitialsEveryPage } from "./vs01PrepareFieldPlacement";
import {
  buildCorpusSimulatedPageLayouts,
  findByLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  textRectsToObstacles,
} from "./vs01PageTextLayout";
import { PREPARE_PAGE_FOOTER_BAND_Y } from "./signingFields";
import {
  findSignatureLineAnchorsFromCorpusText,
  signatureRectsFollowBlockOrder,
} from "./vs01SignatureBlockAnchors";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";
import { buildFullPacketSigningManifestFields } from "./vs01SigningPacketManifest";

const TEST46_TAIL = `
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

const TEST46_BODY = `AI Automation Services Agreement between Acme LLC and Joe Smith.

${"The parties agree to operational and commercial terms described herein. ".repeat(55)}
`;

const TEST46_CORPUS = `${TEST46_BODY}\n${TEST46_TAIL}`;

const AG = "ag_test46";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@x.com", signerName: "Joe Smith" }],
  });
}

describe("VS01 placement test46 — layout-anchored geometry", () => {
  it("locates two By-line anchors on the signature page from corpus layout", () => {
    const layouts = buildCorpusSimulatedPageLayouts(TEST46_CORPUS, 3);
    const last = pageLayoutForIndex(layouts, 2);
    const byLines = findByLinePlacementsFromPageLayout(last);
    expect(byLines.length).toBe(2);
    expect(byLines[0]?.blockHeading).toBe("CLIENT");
    expect(byLines[1]?.blockHeading).toBe("SERVICE PROVIDER");
    expect(byLines[0]?.lineText).toMatch(/^By\s*:/i);
    expect(byLines[1]?.lineText).toMatch(/^By\s*:/i);
  });

  it("places signature fields on By-line layout anchors with high confidence", () => {
    const r = roles();
    const layouts = buildCorpusSimulatedPageLayouts(TEST46_CORPUS, 3);
    const result = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 3,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST46_CORPUS,
      pageLayouts: layouts,
    });
    expect(result.confidence).toBe("high");
    expect(result.placedCount).toBe(2);
    const sigs = result.fields.filter((f) => f.type === "signature");
    expect(sigs).toHaveLength(2);
    expect(sigs.every((f) => f.page === 2)).toBe(true);
    const ownerSig = sigs.find((f) => f.assignedPartyIndex === 0)!;
    const cpSig = sigs.find((f) => f.assignedPartyIndex === 1)!;
    expect(signatureRectsFollowBlockOrder(ownerSig, cpSig)).toBe(true);
    const byLines = findByLinePlacementsFromPageLayout(pageLayoutForIndex(layouts, 2));
    expect(ownerSig.x).toBeGreaterThan(byLines[0]!.x);
    expect(cpSig.x).toBeGreaterThan(byLines[1]!.x);
    expect(ownerSig.y + ownerSig.height).toBeLessThan(PREPARE_PAGE_FOOTER_BAND_Y);
    expect(cpSig.y + cpSig.height).toBeLessThan(PREPARE_PAGE_FOOTER_BAND_Y);
  });

  it("places initials on the signature page without overlapping dense text", () => {
    const r = roles();
    const owner = r[0]!;
    const layouts = buildCorpusSimulatedPageLayouts(TEST46_CORPUS, 3);
    const autos = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 3,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
      corpusText: TEST46_CORPUS,
      pageLayouts: layouts,
    });
    expect(autos.some((f) => f.page === 2)).toBe(true);
    for (const f of autos) {
      const layout = pageLayoutForIndex(layouts, f.page);
      const obstacles = textRectsToObstacles(layout?.textRects ?? []);
      expect(fieldOverlapsDocumentText(f, obstacles)).toBe(false);
    }
  });

  it("places initials on dense single-page corpus without overlapping text", () => {
    const dense = `${"Dense legal paragraph line with terms and obligations. ".repeat(30)}\n${TEST46_TAIL}`;
    const layouts = buildCorpusSimulatedPageLayouts(dense, 1);
    const autos = buildPrepareAutoInitialsEveryPage({
      role: roles()[0]!,
      pageCount: 1,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
      corpusText: dense,
      pageLayouts: layouts,
    });
    expect(autos.length).toBeGreaterThan(0);
    for (const f of autos) {
      const layout = pageLayoutForIndex(layouts, f.page);
      const obstacles = textRectsToObstacles(layout?.textRects ?? []);
      expect(fieldOverlapsDocumentText(f, obstacles)).toBe(false);
    }
  });

  it("prep packet and recipient signing share identical geometry hash", () => {
    const r = roles();
    const owner = r[0]!;
    const layouts = buildCorpusSimulatedPageLayouts(TEST46_CORPUS, 3);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 3,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST46_CORPUS,
      pageLayouts: layouts,
    });
    const signingFields = buildRecipientSigningDocumentFields({
      ownerRole: owner,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: packet.fields,
    });
    const full = buildFullPacketSigningManifestFields({
      ownerRole: owner,
      roles: r,
      senderPlacedFields: packet.fields,
      recipientPlacedFields: [],
    });
    expect(signingFieldGeometryHash(signingFields)).toBe(signingFieldGeometryHash(packet.fields));
    expect(signingFieldGeometryHash(full)).toBe(signingFieldGeometryHash(packet.fields));
  });

  it("no placed field overlaps corpus text obstacles on its page", () => {
    const r = roles();
    const layouts = buildCorpusSimulatedPageLayouts(TEST46_CORPUS, 3);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 3,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST46_CORPUS,
      pageLayouts: layouts,
    });
    const owner = r[0]!;
    const initials = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 3,
      skippedPages: new Set(),
      existingFields: packet.fields,
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
      corpusText: TEST46_CORPUS,
      pageLayouts: layouts,
    });
    expect(assertFieldsClearOfText(packet.fields, layouts)).toBe(true);
    for (const f of initials) {
      const layout = pageLayoutForIndex(layouts, f.page);
      const bodyObstacles = textRectsToObstacles(
        (layout?.textRects ?? []).filter((r) => r.kind === "body"),
      );
      expect(fieldOverlapsDocumentText(f, bodyObstacles)).toBe(false);
    }
    for (const f of packet.fields.filter((x) => x.type === "signature")) {
      const layout = pageLayoutForIndex(layouts, f.page);
      expect(fieldOverlapsDocumentText(f, textObstaclesForSignaturePlacement(layout))).toBe(
        false,
      );
    }
    expect(findSignatureLineAnchorsFromCorpusText(TEST46_CORPUS).length).toBeGreaterThanOrEqual(2);
  });
});
