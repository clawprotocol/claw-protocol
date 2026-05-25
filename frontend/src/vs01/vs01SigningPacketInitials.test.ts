import { describe, expect, it } from "vitest";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { summarizeCanonicalSigningPacketInitials } from "./vs01SigningPacketInitials";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_initials_gate",
    creatorName: "Acme LLC",
    creatorEmail: "a@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
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
By: ______________________
Name: Joe Smith
Date: ____________________`;
}

describe("summarizeCanonicalSigningPacketInitials", () => {
  it("marks packet complete when auto initials sit on body pages only (witness excluded)", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);
    const summary = summarizeCanonicalSigningPacketInitials({
      fields: model.fields,
      pageCount: model.pages.length,
      roleCount: roles().length,
      pages: model.pages,
    });
    expect(summary.witnessPageIndex).toBeGreaterThanOrEqual(0);
    expect(summary.eligiblePages).not.toContain(summary.witnessPageIndex);
    expect(summary.complete).toBe(true);
    expect(summary.unsafeSignatureCount).toBe(0);
    expect(summary.unsafeInitialsCount).toBe(0);

    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: summary,
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
    });
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reason).toBeNull();
  });

  it("packet readiness stays true across repeated canonical summaries (no flicker)", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);
    const results = Array.from({ length: 4 }, () => {
      const summary = summarizeCanonicalSigningPacketInitials({
        fields: model.fields,
        pageCount: model.pages.length,
        roleCount: roles().length,
        pages: model.pages,
      });
      return resolveVs01PreparePacketReadiness({
        corpusGate: { allowed: true },
        placementCanFinish: true,
        initialsSummary: summary,
        canonicalTextRendered: true,
        canonicalSignatureLinesRendered: true,
      });
    });
    for (const r of results) {
      expect(r.packetReady).toBe(true);
      expect(r.reason).toBeNull();
    }
  });
});
