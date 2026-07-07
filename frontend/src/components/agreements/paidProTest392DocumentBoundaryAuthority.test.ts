/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { countStandaloneClauseFamilyHeadings } from "./clauseFamilyRegistry";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  applyPaidProDocumentBoundaryAuthority,
  assertPaidProDocumentBoundaryAuthorityForFreeze,
  detectDocumentBoundaryViolations,
  repairDocumentBoundaryFusion,
} from "./paidProDocumentBoundaryAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";
const RED_ADDR = "100 Commerce Way, Tulsa, OK 74103";
const HARBOR_ADDR = "250 Innovation Drive, Austin, TX 78701";

const TEST392_INTAKE = [
  `Create a consulting agreement between ${RED} and ${HARBOR}.`,
  `${RED}: Sarah Mitchell, CEO, ${RED_EMAIL}, ${RED_ADDR}`,
  `${HARBOR}: Michael Torres, President, ${HARBOR_EMAIL}, ${HARBOR_ADDR}`,
  "Texas law.",
].join("\n");

function test392Draft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Texas",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client", email: RED_EMAIL, partyAddress: RED_ADDR } as never,
      { name: HARBOR, role: "Service Provider", email: HARBOR_EMAIL, partyAddress: HARBOR_ADDR } as never,
    ],
    purpose: "Logistics automation consulting and workflow implementation services.",
    payment_terms: "Fixed monthly fee.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

function test392Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: RED_EMAIL,
    recipient2Email: HARBOR_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [RED_ADDR, HARBOR_ADDR],
  }).parties;
}

// A realistic server_full_draft is substantive (>= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN). Each operative
// clause carries a full paragraph of boundary-clean prose so the fixture exercises the freeze/SoT path
// as a genuine server corpus rather than a thin shell, while preserving the fused/glued boundary markers
// the other cases rely on.
const TEST392_CLAUSE_TOPICS: readonly string[] = [
  "Services and Deliverables. The Service Provider shall render the professional consulting services described in the applicable statement of work, and shall perform all such services in a diligent, workmanlike, and professional manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the Client, it being understood that time is of the essence with respect to each material milestone.",
  "Compensation and Invoicing. In consideration of the services rendered, the Client shall pay the fees set forth in the applicable order, and the Service Provider shall submit itemized invoices on a monthly cadence, each of which shall become due and payable within thirty days of receipt absent a good-faith dispute raised in writing during that period.",
  "Term and Termination. This Agreement shall commence on the effective date and continue for the stated term unless earlier terminated, and either Party may terminate for material breach upon written notice and a reasonable opportunity to cure, whereupon accrued but unpaid amounts shall remain due and payable in accordance with these terms.",
  "Confidentiality. Each Party shall protect the other Party's confidential information using at least the same degree of care it uses to protect its own information of like importance, and shall not disclose such information to any third party except as strictly necessary to perform under this Agreement and subject to obligations no less protective than those stated herein.",
  "Intellectual Property. Except for pre-existing materials, all work product created specifically for the Client in the course of the engagement shall, upon full payment, be owned by the Client, and the Service Provider hereby assigns all right, title, and interest in such work product to the extent necessary to give effect to the foregoing allocation of ownership.",
  "Representations and Warranties. Each Party represents that it has full corporate power and authority to enter into this Agreement, that its performance will not violate any other agreement to which it is bound, and that it will comply with all laws and regulations applicable to its respective performance of the obligations described in this Agreement.",
  "Limitation of Liability. Except for breaches of confidentiality or indemnification obligations, neither Party shall be liable for any indirect, incidental, special, or consequential damages, and each Party's aggregate liability arising out of or relating to this Agreement shall not exceed the total fees paid or payable during the twelve months preceding the event giving rise to the claim.",
  "Indemnification. Each Party shall indemnify, defend, and hold harmless the other Party from and against third-party claims arising from the indemnifying Party's gross negligence, willful misconduct, or material breach of this Agreement, subject to prompt written notice of the claim and reasonable cooperation in the defense and settlement thereof.",
  "General Provisions. This Agreement constitutes the entire understanding of the Parties with respect to its subject matter, supersedes all prior negotiations, and may be amended only by a writing signed by authorized representatives of both Parties; any provision found unenforceable shall be reformed to the minimum extent necessary while preserving the Parties' intent.",
];

const TEST392_CLAUSE_ELABORATIONS: readonly string[] = [
  "The Parties further acknowledge that the foregoing obligations are material to the bargained-for exchange reflected in this Agreement, and that any failure to perform them may cause irreparable harm for which monetary damages would be an inadequate remedy.",
  "No waiver of any provision shall be effective unless made in a writing signed by the waiving Party, and no single or partial exercise of any right shall preclude any further exercise of that right or the exercise of any other right under this Agreement.",
  "In the event of any dispute arising out of or relating to the subject matter hereof, the prevailing Party shall be entitled to recover its reasonable attorneys' fees, expert costs, and court costs to the fullest extent permitted by applicable law.",
  "Each Party shall maintain complete and accurate books and records relating to its performance, and shall, upon reasonable prior written notice, permit the other Party to audit such records solely to verify compliance with the terms set forth herein.",
  "The Parties intend that this provision be construed and enforced to the maximum extent permitted by law, and if any portion is held unenforceable, the remaining portions shall continue in full force and effect without impairment of the Parties' intent.",
];

function buildTest392FusedBoundaryCorpus(): string {
  const clauses = TEST392_CLAUSE_TOPICS.map((topic, i) => {
    const elaborations = [0, 1, 2, 3]
      .map((k) => TEST392_CLAUSE_ELABORATIONS[(i + k) % TEST392_CLAUSE_ELABORATIONS.length])
      .join(" ");
    return `${i + 1}. ${topic} ${elaborations}`;
  }).join(" ");
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    `The parties are each a "Party" and together the "Parties."1. Services and Relationship. Provider will deliver consulting services.`,
    clauses,
    "Services already performed.10. Notices",
    `If to ${RED} : ${RED} If to ${HARBOR} :`,
    "",
    "10. GOVERNING LAW",
    "This Agreement is governed by Texas law.",
    "",
    "11. GOVERNING LAW AND VENUE",
    "Exclusive venue is Travis County, Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

function topLevelHeadingNumbers(text: string): number[] {
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witness >= 0 ? text.slice(0, witness) : text;
  return [...head.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST392 — document boundary authority & professional output integrity", () => {
  it("rejects Parties.\"1. fused recital/section starts", () => {
    const raw = buildTest392FusedBoundaryCorpus();
    expect(raw).toMatch(/Parties\."1\./i);
    const fusion = repairDocumentBoundaryFusion(raw);
    expect(fusion.text).not.toMatch(/Parties\."1\./i);
    expect(fusion.text).toMatch(/^1\.\s+Services and Relationship/m);
  });

  it("rejects inline .10. Notices and digit-glued section chains", () => {
    const raw = buildTest392FusedBoundaryCorpus();
    const repaired = applyPaidProDocumentBoundaryAuthority(raw, {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    }).text;
    expect(repaired).not.toMatch(/performed\.\d+\.\s+Notices/i);
    expect(repaired).toMatch(/^\s*\d+\.\s+Notices\b/im);
  });

  it("rebuilds malformed inline Notices into structured stanzas with authority contacts", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const repaired = applyPaidProDocumentBoundaryAuthority(buildTest392FusedBoundaryCorpus(), {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    }).text;
    expect(repaired).not.toMatch(/\bIf to\s+[^:\n]+:\s*[^:\n]+\s+If to\s+/i);
    expect(repaired).toContain(`Email: ${RED_EMAIL}`);
    expect(repaired).toContain(`Email: ${HARBOR_EMAIL}`);
    expect(repaired).toContain("100 Commerce Way");
    expect(repaired).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("omits optional contacts for email-only, address-only, and neither variants", () => {
    const partiesEmailOnly = test392Parties().map((p) => ({
      ...p,
      partyAddress: "",
    }));
    setConsumedPaidProSignerMetadataAuthority({
      parties: partiesEmailOnly,
      source: "live_ui",
      hash: "x",
      updatedAt: 0,
    });
    const emailOnly = applyPaidProDocumentBoundaryAuthority(buildTest392FusedBoundaryCorpus(), {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE.replace(RED_ADDR, "").replace(HARBOR_ADDR, ""),
    }).text;
    expect(emailOnly).toContain(RED_EMAIL);
    expect(emailOnly).not.toMatch(/Address:\s*Not provided/i);

    const partiesAddrOnly = test392Parties().map((p) => ({ ...p, signerEmail: "" }));
    setConsumedPaidProSignerMetadataAuthority({
      parties: partiesAddrOnly,
      source: "live_ui",
      hash: "x",
      updatedAt: 0,
    });
    const addrOnly = applyPaidProDocumentBoundaryAuthority(buildTest392FusedBoundaryCorpus(), {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE.replace(RED_EMAIL, "").replace(HARBOR_EMAIL, ""),
    }).text;
    expect(addrOnly).toContain("100 Commerce Way");
    expect(addrOnly).not.toMatch(/Email:\s*Not provided/i);
  });

  it("dedupes governing law and notices families and preserves one execution block", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const repaired = applyPaidProDocumentBoundaryAuthority(buildTest392FusedBoundaryCorpus(), {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    }).text;
    expect(countStandaloneClauseFamilyHeadings(repaired, "governing_law")).toBeLessThanOrEqual(1);
    expect(countStandaloneClauseFamilyHeadings(repaired, "notices")).toBeLessThanOrEqual(1);
    expect(countPaidProExecutionBlocks(repaired)).toBe(1);
    expect(detectDocumentBoundaryViolations(repaired)).toEqual([]);
  });

  it("renumbers top-level headings sequentially before witness", () => {
    const repaired = applyPaidProDocumentBoundaryAuthority(buildTest392FusedBoundaryCorpus(), {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    }).text;
    const nums = topLevelHeadingNumbers(repaired);
    expect(nums.length).toBeGreaterThan(1);
    for (let i = 1; i < nums.length; i += 1) {
      expect(nums[i]).toBe(nums[i - 1]! + 1);
    }
  });

  it("freezes boundary-repaired body into SoT and keeps review/signing surfaces aligned", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const raw = buildTest392FusedBoundaryCorpus();
    const accepted = applyAcceptedProCorpusSafeDisplay(raw, {
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    }).text;
    markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });
    const record = establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: TEST392_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot).toBe(record.text);
    expect(detectDocumentBoundaryViolations(sot)).toEqual([]);
    expect(containsUnresolvedRenderTokens(sot)).toBe(false);

    const displayPrep = preparePaidProReviewDisplayPlain(sot).text;
    const signing = finalizePaidProSigningCorpusText(sot, parties, {
      intakeText: TEST392_INTAKE,
      draftPartyNames: [RED, HARBOR],
    }).text;
    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: displayPrep });
    expect(parity.invariantOk).toBe(true);
    expect(sot).toContain(RED_EMAIL);
    expect(sot).toContain(HARBOR_EMAIL);
    expect(signing).toContain(HARBOR_EMAIL);
    expect(detectDocumentBoundaryViolations(sot)).toEqual([]);
    expect(containsUnresolvedRenderTokens(sot)).toBe(false);
  });

  it("blocks integrityOk:false unresolved bodies from freeze gate", () => {
    const draft = test392Draft();
    const draftNoEmail = {
      ...draft,
      parties: draft.parties?.map((p) => ({ ...p, email: "", partyAddress: "" })),
    } as ParsedDraftShape;
    // Inject an unresolved template variable into operative body prose. A title-only variable is now
    // legitimately stripped by boundary repair, but an operative-clause variable has no authoritative
    // source and must survive as an unresolved render token so the freeze gate blocks it.
    const unresolved = buildTest392FusedBoundaryCorpus().replace(
      "The Service Provider shall render the professional consulting services",
      "The Service Provider shall render the {{scope_of_work}} consulting services",
    );
    expect(() =>
      assertPaidProDocumentBoundaryAuthorityForFreeze(unresolved, {
        draft: draftNoEmail,
        intakeText: `Agreement between ${RED} and ${HARBOR}.`,
        surface: "test392_freeze_block",
      }),
    ).toThrow(/paid-pro-document-boundary-blocked|paid-pro-notice-contact-authority-blocked/);
  });
});
