import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAutoSignaturePacketForAllRoles, signingFieldGeometryHash } from "./vs01AutoSignaturePacket";
import { buildPrepareAutoInitialsEveryPage } from "./vs01PrepareFieldPlacement";
import {
  PREPARE_AUTO_INITIALS_UPPER_Y_MAX,
  layoutPrepareAutoInitialsRectOnPage,
} from "./signingFields";
import {
  SIGNATURE_BLOCK_REGION_BOTTOM,
  findSignatureLineAnchorsFromCorpusText,
} from "./vs01SignatureBlockAnchors";
import { fieldOverlapsDocumentText } from "./vs01FieldGeometry";
import {
  buildCorpusSimulatedPageLayouts,
  findByLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  textRectsToObstacles,
} from "./vs01PageTextLayout";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
  mergeRecipientManifestFieldsForSignerRole,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";
import { buildFullPacketSigningManifestFields } from "./vs01SigningPacketManifest";
import type { PlacedSigningField } from "./signingFields";

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

const AG = "ag_test45";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@x.com", signerName: "Joe Smith" }],
  });
}

describe("VS01 signing field visibility test45", () => {
  it("mergeRecipientManifestFieldsForSignerRole includes owner sender-layer signatures", () => {
    const r = roles();
    const owner = r[0]!;
    const sender: PlacedSigningField[] = [
      stampSenderFieldWithPrepareRole(
        { id: "owner-s", type: "signature", page: 1, x: 0.12, y: 0.62, width: 0.34, height: 0.075 },
        owner,
      ),
    ];
    const merged = mergeRecipientManifestFieldsForSignerRole({
      ownerRole: owner,
      roles: r,
      counterpartyId: owner.partyId,
      signerRoleId: owner.roleId,
      recipientPlacedFields: [],
      senderPlacedFields: sender,
    });
    expect(merged.some((f) => f.type === "signature" && f.id.startsWith("s2r_"))).toBe(true);
  });

  it("full packet manifest includes both signers signature fields for recipient view", () => {
    const r = roles();
    const owner = r[0]!;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: CORPUS,
    });
    const full = buildFullPacketSigningManifestFields({
      ownerRole: owner,
      roles: r,
      senderPlacedFields: packet.fields,
      recipientPlacedFields: [],
    });
    const sigs = full.filter((f) => f.type === "signature");
    expect(sigs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sigs.map((f) => f.assignedSignerRoleId)).size).toBeGreaterThanOrEqual(2);
  });

  it("buildRecipientSigningDocumentFields matches full packet field ids", () => {
    const r = roles();
    const owner = r[0]!;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: CORPUS,
    });
    const doc = buildRecipientSigningDocumentFields({
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
    expect(doc.map((f) => f.id).sort()).toEqual(full.map((f) => f.id).sort());
  });

  it("auto-initials default to lower-right safe zone, not upper-right", () => {
    const r = roles();
    const owner = r[0]!;
    const autos = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 2,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
    });
    expect(autos.length).toBeGreaterThan(0);
    for (const f of autos) {
      expect(f.y).toBeGreaterThan(0.8);
      expect(f.x + f.width).toBeLessThanOrEqual(1 - 0.04);
      expect(f.x).toBeGreaterThan(0.55);
    }
    const layout = layoutPrepareAutoInitialsRectOnPage({
      partyIndex: 0,
      page: 0,
      existingFields: [],
      roleId: owner.roleId,
    });
    expect(layout.rect).not.toBeNull();
    expect(layout.rect!.y).toBeGreaterThan(PREPARE_AUTO_INITIALS_UPPER_Y_MAX);
  });

  it("places optional initials on signature page without overlapping agreement text", () => {
    const r = roles();
    const owner = r[0]!;
    const layouts = buildCorpusSimulatedPageLayouts(CORPUS, 1);
    const autos = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 1,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
      corpusText: CORPUS,
      pageLayouts: layouts,
    });
    expect(autos.length).toBeGreaterThan(0);
    for (const f of autos) {
      const layout = pageLayoutForIndex(layouts, f.page);
      const obstacles = textRectsToObstacles(layout?.textRects ?? []);
      expect(fieldOverlapsDocumentText(f, obstacles)).toBe(false);
    }
  });

  it("signature fields stay on By-line anchors with in-bounds geometry", () => {
    const r = roles();
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: CORPUS,
    });
    const anchors = findSignatureLineAnchorsFromCorpusText(CORPUS);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    const sigs = packet.fields.filter((f) => f.type === "signature");
    const layouts = buildCorpusSimulatedPageLayouts(CORPUS, 2);
    const byLines = findByLinePlacementsFromPageLayout(pageLayoutForIndex(layouts, 1));
    for (const f of sigs) {
      expect(f.width).toBeGreaterThan(0);
      expect(f.height).toBeGreaterThan(0);
      expect(f.x).toBeGreaterThanOrEqual(0);
      const by = byLines.find((b) => b.partyIndex === f.assignedPartyIndex);
      if (by) {
        expect(f.y).toBeCloseTo(by.y, 2);
        expect(f.x).toBeGreaterThan(by.x);
      }
      expect(f.y + f.height).toBeLessThanOrEqual(SIGNATURE_BLOCK_REGION_BOTTOM + 0.35);
      expect(f.x + f.width).toBeLessThanOrEqual(1.01);
      expect(f.y + f.height).toBeLessThanOrEqual(1.01);
      expect(f.page).toBe(1);
    }
  });

  it("prep and recipient signing geometry hashes match for the same packet", () => {
    const r = roles();
    const owner = r[0]!;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: CORPUS,
    });
    const signingFields = buildRecipientSigningDocumentFields({
      ownerRole: owner,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: packet.fields,
    });
    expect(signingFieldGeometryHash(signingFields)).toBe(signingFieldGeometryHash(packet.fields));
  });

  it("recipient signing CSS keeps readable labels and visible lawdog field chrome", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain(".lawdog-signing-field__label");
    expect(css).toContain("color: #111111");
    expect(css).not.toMatch(
      /\.vs01-recipient-signing-view \.vs01-sign-placement-box\s*\{[^}]*background:\s*transparent/s,
    );
    expect(css).toContain(".vs01-recipient-signing-view .lawdog-signing-field.vs01-sign-placement-box");
  });

  it("RecipientSigningFieldOverlay logs field render diagnostics", () => {
    const src = readFileSync(join(__dirname, "RecipientSigningFieldOverlay.tsx"), "utf8");
    expect(src).toContain("[vs01-signing-field-render]");
    expect(src).toContain("lawdog-signing-field__signer");
  });
});
