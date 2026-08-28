import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  autoSignaturePacketStatusMessage,
  buildAutoSignaturePacketForAllRoles,
  removeStaleSignatureOnlyAutoplaceFields,
  resolveAutoSignaturePacketMode,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import { buildPrepareAutoInitialsEveryPage } from "./vs01PrepareFieldPlacement";
import { fieldRectsOverlap, type PlacedSigningField } from "./signingFields";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";
import { buildCorpusSimulatedPageLayouts } from "./vs01PageTextLayout";

const TEST47_CORPUS = `
AI Automation Services Agreement

This Agreement is between Acme LLC and Joe Smith.

${"The parties agree to the services, payment terms, confidentiality, and general provisions. ".repeat(40)}

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
    agreementId: "ag_test47",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [
      { id: "cp1", name: "Joe Smith", email: "joe@example.com", signerName: "Joe Smith" },
    ],
  });
}

describe("VS01 placement test47 signature-only hygiene", () => {
  it("detects canonical identity blocks and enters signature_only mode", () => {
    const layouts = buildCorpusSimulatedPageLayouts(TEST47_CORPUS, 4);
    expect(
      resolveAutoSignaturePacketMode({
        corpusText: TEST47_CORPUS,
        pageLayouts: layouts,
        lastPage: 3,
        roleCount: 2,
      }),
    ).toBe("signature_only");
  });

  it("generates exactly two required signatures and no name/title/date overlays", () => {
    const r = roles();
    const layouts = buildCorpusSimulatedPageLayouts(TEST47_CORPUS, 4);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 4,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST47_CORPUS,
      pageLayouts: layouts,
    });

    expect(packet.mode).toBe("signature_only");
    expect(packet.requiredSignatureCount).toBe(2);
    expect(packet.optionalFieldCount).toBe(0);
    expect(packet.placedCount).toBe(2);
    expect(packet.fields.filter((f) => f.type === "signature")).toHaveLength(2);
    expect(packet.fields.some((f) => f.type === "printed_name")).toBe(false);
    expect(packet.fields.some((f) => f.type === "text")).toBe(false);
    expect(packet.fields.some((f) => f.type === "date")).toBe(false);
    expect(autoSignaturePacketStatusMessage(packet)).toBe("2 signature fields placed.");
  });

  it("cleans stale autoplace name/title/date overlays in automatic signature_only mode", () => {
    const stale: PlacedSigningField[] = [
      { id: "sig", type: "signature", page: 3, x: 0.1, y: 0.2, width: 0.2, height: 0.04, assignmentSource: "autoplace" },
      { id: "name", type: "printed_name", page: 3, x: 0.1, y: 0.4, width: 0.2, height: 0.04, assignmentSource: "autoplace" },
      { id: "title", type: "text", textPurpose: "title", page: 3, x: 0.1, y: 0.5, width: 0.2, height: 0.04, assignmentSource: "autoplace" },
      { id: "date", type: "date", page: 3, x: 0.1, y: 0.6, width: 0.2, height: 0.04, assignmentSource: "autoplace" },
      { id: "initials", type: "initials", page: 0, x: 0.8, y: 0.8, width: 0.07, height: 0.03, autoInitials: true, assignmentSource: "autoplace" },
    ];

    const cleaned = removeStaleSignatureOnlyAutoplaceFields(stale);
    expect(cleaned.map((f) => f.id)).toEqual(["sig", "initials"]);
    expect(cleaned.some((f) => f.type === "printed_name" || f.type === "text" || f.type === "date")).toBe(false);
  });

  it("keeps optional initials visible, in-bounds, or intentionally suppresses them", () => {
    const r = roles();
    const layouts = buildCorpusSimulatedPageLayouts(TEST47_CORPUS, 4);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 4,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST47_CORPUS,
      pageLayouts: layouts,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const initials = buildPrepareAutoInitialsEveryPage({
        role: r[0]!,
        pageCount: 4,
        skippedPages: new Set(),
        existingFields: packet.fields,
        valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
        corpusText: TEST47_CORPUS,
        pageLayouts: layouts,
      });
      expect(initials.every((f) => f.type === "initials")).toBe(true);
      for (const f of initials) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThan(0.8);
        expect(f.x + f.width).toBeLessThanOrEqual(1);
        expect(packet.fields.some((sig) => fieldRectsOverlap(sig, f))).toBe(false);
      }
      expect(initials.length).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps prepare and recipient signing geometry hashes identical", () => {
    const r = roles();
    const owner = r[0]!;
    const layouts = buildCorpusSimulatedPageLayouts(TEST47_CORPUS, 4);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: 4,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST47_CORPUS,
      pageLayouts: layouts,
    });
    const signingFields = buildRecipientSigningDocumentFields({
      ownerRole: owner,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: packet.fields,
    });
    expect(signingFieldGeometryHash(signingFields)).toBe(signingFieldGeometryHash(packet.fields));
  });

  it("keeps placement tools live on Prepare so the buyer can edit before links-ready", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("const showManualPlacementUi = true;");
    expect(src).toContain("onClick={() => setManualPlacementOverride(true)}");
    expect(src).toContain("data-testid=\"vs01-edit-field-placement\"");
    expect(src).toContain("setManualPlacementOverride(false);");
    expect(src).toContain("autoSignatureSeededRef.current = false;");
    expect(src).toContain("removeStaleSignatureOnlyAutoplaceFields(prev)");
    expect(src).not.toContain("bridgeAutoPrepareDispatchedRef");
    expect(src).not.toContain("!agreementBridgePlacementCopy || manualPlacementOverride || !autoPlacementComplete");
  });

  it("manual placement instructions are gated behind manual placement UI", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const manualUiIndex = src.indexOf("{showManualPlacementUi ? (");
    expect(manualUiIndex).toBeGreaterThan(0);
    const toolbarIndex = src.indexOf("Choose what to place", manualUiIndex);
    const toolButtonIndex = src.indexOf("vs01-sign-tool-btn", manualUiIndex);
    expect(toolbarIndex).toBeGreaterThan(manualUiIndex);
    expect(toolButtonIndex).toBeGreaterThan(manualUiIndex);
    expect(src).toContain(
      "agreementBridgePlacementCopy && !manualPlacementOverride\n                ? null",
    );
  });

  it("prepared banner counts required signatures, not optional or stale overlay fields", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const bannerIndex = src.indexOf("<Vs01PrepPreparedBanner");
    expect(bannerIndex).toBeGreaterThan(0);
    const fieldCountIndex = src.indexOf(
      'fieldCount={fields.filter((f) => f.type === "signature" && !f.autoInitials).length}',
      bannerIndex,
    );
    expect(fieldCountIndex).toBeGreaterThan(bannerIndex);
    expect(autoSignaturePacketStatusMessage({
      fields: [],
      confidence: "high",
      placedCount: 2,
      mode: "signature_only",
      requiredSignatureCount: 2,
      optionalFieldCount: 0,
    })).toContain("2 signature fields placed");
  });
});
