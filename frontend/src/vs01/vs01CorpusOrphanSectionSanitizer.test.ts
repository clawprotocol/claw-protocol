import { describe, expect, it } from "vitest";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  isOrphanStandaloneSectionNumberLine,
  isOrphanStandaloneTopLevelSectionNumberLine,
  sanitizeVs01RenderCorpus,
} from "./vs01CorpusOrphanSectionSanitizer";
import { buildFullyExecutedSignedSnapshot } from "./vs01FullyExecutedSignedSnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import { normalizeSigningPacketCorpusLines } from "./buildVs01SigningPacketModel";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test365",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Heath Lincoln",
        signerTitle: "Member",
      },
    ],
  });
}

function qaLongProCorpus(): string {
  const clause =
    "Service Provider shall perform commercially reasonable services, maintain documentation, deliver milestones on schedule, and support Client acceptance testing. ";
  const sections = Array.from({ length: 13 }, (_, i) => {
    const n = i + 1;
    return `${n}. SECTION TITLE ${n}\n${n}.1 Scope and deliverables.\n${clause.repeat(3)}\n${n}.2 Operational terms and cooperation.\n${clause.repeat(2)}\n${n}.3 Suspension and cure mechanics when payment or access issues arise.`;
  }).join("\n\n");
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${sections}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: CEO
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Heath Lincoln
Title: Member
Date: ____________________`;
}

function corpusWithOrphan12Long(): string {
  return qaLongProCorpus().replace(/(\n)13\. SECTION TITLE 13/, "$112.\n\n13. SECTION TITLE 13");
}

function corpusWithOrphan12Short(): string {
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

Between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").

10. ENTIRE AGREEMENT. This document is the entire agreement between the parties.

11. GOVERNING LAW. Texas law governs this Agreement.

12.

13. ELECTRONIC SIGNATURES
This Agreement may be executed electronically with the same effect as original signatures.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: CEO
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Heath Lincoln
Title: Member
Date: ____________________`;
}

describe("Test365 VS01 orphan section number sanitizer", () => {
  it("removes standalone 12. before 13. ELECTRONIC SIGNATURES", () => {
    const { text, removedLines } = sanitizeVs01RenderCorpus(corpusWithOrphan12Short());
    expect(removedLines).toContain("12.");
    expect(text).not.toMatch(/^\s*12\.\s*$/m);
    expect(text).toMatch(/13\.\s+ELECTRONIC SIGNATURES/i);
  });

  it("preserves valid section headings like 12. Governing Law", () => {
    const input = "12. Governing Law\nTexas law applies.\n\n13. ELECTRONIC SIGNATURES\nE-sign permitted.";
    const { text, removedLines } = sanitizeVs01RenderCorpus(input);
    expect(removedLines).toHaveLength(0);
    expect(text).toContain("12. Governing Law");
  });

  it("preserves subsection references like 12.1 Notices", () => {
    const input = "12. MISCELLANEOUS\n12.1 Notices must be in writing.\n\n13. ELECTRONIC SIGNATURES";
    const { text, removedLines } = sanitizeVs01RenderCorpus(input);
    expect(removedLines).toHaveLength(0);
    expect(text).toContain("12.1 Notices");
  });

  it("does not flag inline body references to section numbers", () => {
    expect(isOrphanStandaloneTopLevelSectionNumberLine("12.")).toBe(true);
    expect(isOrphanStandaloneSectionNumberLine("12. Governing Law")).toBe(false);
    expect(isOrphanStandaloneSectionNumberLine("12.1 Notices must be sent in writing.")).toBe(false);
    expect(isOrphanStandaloneSectionNumberLine("See section 12. for details.")).toBe(false);
  });

  it("VS01 signing packet render does not show orphan 12. line", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpusWithOrphan12Long(),
      roles: roles(),
      initialsEnabled: false,
    });
    expect(model.allowed).toBe(true);
    const rendered = model.pages
      .flatMap((p) => p.flowLines)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(rendered.some((l) => l === "12.")).toBe(false);
    expect(rendered.some((l) => /^13\.\s+SECTION TITLE 13/i.test(l))).toBe(true);
    expect(rendered.some((l) => /IN WITNESS WHEREOF/i.test(l))).toBe(true);
    expect(rendered.some((l) => /^By\s*:/i.test(l))).toBe(true);
  });

  it("normalizeSigningPacketCorpusLines drops orphan before pagination", () => {
    const lines = normalizeSigningPacketCorpusLines(corpusWithOrphan12Short());
    expect(lines.some((l) => l.trim() === "12.")).toBe(false);
    expect(lines.some((l) => /13\.\s+ELECTRONIC SIGNATURES/i.test(l))).toBe(true);
  });

  it("signed snapshot builder strips orphan section numbers", () => {
    let corpus = corpusWithOrphan12Short();
    corpus = corpus
      .replace("By: ______________________\nName: Ann Rice", "By: Ann Rice\nName: Ann Rice")
      .replace("By: ______________________\nName: Heath Lincoln", "By: Heath Lincoln\nName: Heath Lincoln")
      .replace(/Date: _+/g, "Date: June 7, 2026");
    const portable: Vs01CanonicalPacketPortableV1 = {
      v: 1,
      seed: {
        v: 1,
        documentId: "doc365",
        agreementId: "ag_test365",
        corpusPlain: corpus,
        corpusHash: "h",
        savedAt: "2026-01-01T00:00:00Z",
      },
      fields: [],
      roles: roles().map((r, i) => ({
        roleId: r.roleId,
        partyIndex: i,
        partyId: r.partyId,
        entityName: r.entityName,
        partyName: r.partyName,
        roleLabel: r.roleLabel,
        signerName: r.signerName,
        signerTitle: r.signerTitle,
        signerEmail: r.signerEmail,
        reviewEmail: r.reviewEmail,
        isEntityParty: r.isEntityParty,
        requiresSignature: true,
        vs01CounterpartyId: r.vs01CounterpartyId,
        kind: r.kind,
      })),
      pageCount: 9,
      witnessPageIndex: 8,
      initialsPolicy: { enabled: false, bodyPagesOnly: true },
      fieldCount: 2,
    };
    const snap = buildFullyExecutedSignedSnapshot(portable);
    expect(snap).not.toBeNull();
    expect(snap!.corpusPlain).not.toMatch(/^\s*12\.\s*$/m);
    expect(snap!.corpusPlain).toMatch(/13\.\s+ELECTRONIC SIGNATURES/i);
  });
});
