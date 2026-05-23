import { describe, expect, it } from "vitest";
import {
  buildPrepareAutoInitialsEveryPage,
} from "./vs01PrepareFieldPlacement";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildPreparePageLayoutObstacleRects,
  fieldRectsOverlap,
  isRectInPrepareAutoInitialsSafeZone,
  PREPARE_PAGE_FOOTER_BAND_Y,
} from "./signingFields";
import {
  buildSignerManifestForRole,
  buildFullPacketSigningManifestFields,
} from "./vs01SigningPacketManifest";
import { isRecipientSigningEditableType } from "./recipientSigningFieldUtils";

describe("vs01 prepare placement (test37)", () => {
  it("initials avoid footer/watermark obstacle bands", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_test37",
      creatorName: "Acme LLC",
      creatorEmail: "anthem@acme.com",
      ownerSignerName: "Anthem Blanchard",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joem@gmail.com" }],
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    let existing = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 2,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem Blanchard", initials: "AB" },
    });
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
    for (const f of existing.filter((x) => x.page === 0)) {
      expect(f.y + f.height).toBeLessThan(PREPARE_PAGE_FOOTER_BAND_Y);
      expect(isRectInPrepareAutoInitialsSafeZone(f)).toBe(true);
      expect(f.x + f.width).toBeLessThanOrEqual(1 - 0.072 + 1e-5);
      for (const o of layoutObstacles) {
        expect(fieldRectsOverlap(f, o)).toBe(false);
      }
    }
  });

  it("counterparty initials merge into recipient manifest and stay editable", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_test37_manifest",
      creatorName: "Acme LLC",
      creatorEmail: "anthem@acme.com",
      ownerSignerName: "Anthem Blanchard",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joem@gmail.com" }],
    });
    const owner = roles[0]!;
    const cp = roles[1]!;
    const senderInitials = buildPrepareAutoInitialsEveryPage({
      role: cp,
      pageCount: 1,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Joe Smith", initials: "JS" },
    });
    const manifest = buildSignerManifestForRole({
      role: cp,
      ownerRole: owner,
      roles,
      senderPlacedFields: senderInitials,
      recipientPlacedFields: [],
    });
    const initials = manifest.filter((f) => f.type === "initials");
    expect(initials.length).toBeGreaterThan(0);
    expect(initials.every((f) => isRecipientSigningEditableType(f.type))).toBe(true);
    expect(initials.every((f) => f.counterpartyId === "cp1")).toBe(true);
    const full = buildFullPacketSigningManifestFields({
      ownerRole: owner,
      roles,
      senderPlacedFields: senderInitials,
      recipientPlacedFields: [],
    });
    expect(full.filter((f) => f.type === "initials" && f.counterpartyId === "cp1").length).toBeGreaterThan(0);
  });
});
