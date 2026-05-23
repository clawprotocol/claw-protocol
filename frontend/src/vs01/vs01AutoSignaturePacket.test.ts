import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAutoSignaturePacketForAllRoles } from "./vs01AutoSignaturePacket";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";

describe("vs01AutoSignaturePacket", () => {
  it("places fields for every signer role on last page", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_auto",
      creatorName: "Acme",
      creatorEmail: "alex@acme.com",
      ownerSignerName: "Alex Owner",
      ownerSignerTitle: "CEO",
      counterparties: [
        { id: "cp1", name: "Beta LLC", email: "signer@beta.com", signerName: "", signerTitle: "" },
      ],
    });
    const result = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 3,
      existingFields: [],
      ownerValueCtx: { typedName: "Alex Owner", initials: "AO", signerEmail: "alex@acme.com" },
    });
    expect(result.placedCount).toBeGreaterThanOrEqual(2);
    const sigs = result.fields.filter((f) => f.type === "signature");
    expect(sigs.length).toBe(2);
  });

  it("logs signature block auto-placement payload", () => {
    const src = readFileSync(join(__dirname, "vs01AutoSignaturePacket.ts"), "utf8");
    expect(src).toContain("[signature-fields-auto-placed]");
    expect(src).toContain('source: "signature_blocks"');
    expect(src).toContain("signerCount: args.roles.length");
    expect(src).toContain("fieldCount: placedCount");
  });

  it("Vs01PrepPreparedBanner uses LawDog prepared copy", () => {
    const src = readFileSync(join(__dirname, "Vs01PrepPreparedBanner.tsx"), "utf8");
    expect(src).toContain("LawDog prepared your signing packet");
  });

  it("StepPrepareSignature offers Continue to signing links when auto prepared", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("PREPARE_PACKET_BRIDGE_PRIMARY_CTA");
    expect(src).toContain("PREPARE_PACKET_BRIDGE_SECONDARY_CTA");
    expect(src).not.toContain("Signer name not set");
  });

  it("anchors signature fields to corpus By lines when corpus text is provided", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_anchor",
      creatorName: "Acme LLC",
      creatorEmail: "anthem@acme.com",
      ownerSignerName: "Anthem H Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
    });
    const corpus = `
IN WITNESS WHEREOF

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
    const result = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AH", signerEmail: "anthem@acme.com" },
      corpusText: corpus,
    });
    expect(result.confidence).toBe("high");
    expect(result.placedCount).toBe(2);
    expect(result.fields.every((f) => f.type === "signature")).toBe(true);
    for (const f of result.fields) {
      expect(f.y + f.height).toBeLessThanOrEqual(0.9);
      expect(f.x).toBeGreaterThan(0.05);
      expect(f.width).toBeGreaterThan(0.15);
    }
  });

  it("StepPrepareSignature passes corpus text into auto signature packet builder", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("prepareCorpusText");
    expect(src).toContain("corpusText: prepareCorpusText");
  });

  it("StepPrepareSignature hides manual scroll hint in default bridge mode", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("agreementBridgePlacementCopy && !manualPlacementOverride");
    expect(src).toContain("? null");
  });

  it("auto signature fields stay above footer band", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_auto_footer",
      creatorName: "Acme LLC",
      creatorEmail: "alex@acme.com",
      ownerSignerName: "Alex Owner",
      ownerSignerTitle: "CEO",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
    });
    const result = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Alex Owner", initials: "AO", signerEmail: "alex@acme.com" },
    });
    for (const f of result.fields) {
      expect(f.y + f.height).toBeLessThanOrEqual(0.9);
    }
  });
});
