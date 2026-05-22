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
    expect(result.placedCount).toBeGreaterThanOrEqual(6);
    const sigs = result.fields.filter((f) => f.type === "signature");
    expect(sigs.length).toBe(2);
  });

  it("Vs01PrepPreparedBanner uses LawDog prepared copy", () => {
    const src = readFileSync(join(__dirname, "Vs01PrepPreparedBanner.tsx"), "utf8");
    expect(src).toContain("LawDog prepared your signing packet");
  });

  it("StepPrepareSignature offers Review and send when auto prepared", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("Review and send");
    expect(src).toContain("Edit field placement");
    expect(src).not.toContain("Signer name not set");
  });
});
