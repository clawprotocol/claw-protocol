import { describe, expect, it } from "vitest";
import {
  countStandaloneClauseFamilyHeadings,
  isOperativeClauseFamilyPresent,
  scanOperativeClauseFamilies,
} from "./clauseFamilyRegistry";
import {
  gateOperativeClauseFamilyAppend,
  type OperativeClauseFamily,
} from "./documentCompositionAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  noticeStanzaHasRoleLabelCorruption,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { preserveFullLegalPartyNames } from "./paidProPartyNamePreserve";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { applyMutualConsultingProfessionalQualityFloor } from "./paidProMutualConsultingQualityFloor";
import { resolveLegalIdentitiesFromExtraction } from "./legalIdentityResolution";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const QA_INTAKE = [
  `${RED}`,
  "Attention: Sarah Mitchell, CEO",
  "contracts@redmesa-logistics.com",
  "100 Commerce Way",
  "Tulsa, Oklahoma 74103",
  "",
  `${HARBOR}`,
  "Attention: Michael Torres, President",
  "legal@harborpeakautomation.com",
  "250 Innovation Drive",
  "Austin, Texas 78701",
].join("\n");

function qaParties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: "contracts@redmesa-logistics.com",
    recipient2Email: "legal@harborpeakautomation.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "100 Commerce Way, Tulsa, Oklahoma 74103",
      "250 Innovation Drive, Austin, Texas 78701",
    ],
  }).parties;
}

const CORRUPTED_NOTICE_CORPUS = [
  "10. Governing Law, Venue and Notices",
  "10.1 Governing Law and Venue. Oklahoma law governs.",
  "10.2 Notices.",
  "If to the Client:",
  "Client Service Provider Attention: Sarah Mitchell",
  "",
  "If to the Service Provider:",
  "Service Provider Service Provider Attention: Michael Torres",
].join("\n");

export const ADVERSARIAL_CLAUSE_RICH_INTAKE = [
  "Consulting agreement.",
  "Client:",
  RED,
  "Service Provider:",
  HARBOR,
  "Include:",
  "Confidentiality",
  "Confidential Information definition",
  "Intellectual Property",
  "Ownership of Work Product",
  "Payment Terms",
  "Late Payment",
  "Termination",
  "Termination for Cause",
  "Termination for Convenience",
  "Notice Provisions",
  "Governing Law",
  "Venue",
  "Oklahoma law governs.",
].join("\n");

const ADVERSARIAL_DRAFT = {
  parties: [
    { name: RED, role: "Client" },
    { name: HARBOR, role: "Service Provider" },
  ],
  jurisdiction: "Oklahoma",
} as ParsedDraftShape;

function buildAdversarialClauseRichCorpus(): string {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "1. DEFINITIONS",
    '"Confidential Information" means non-public business information disclosed under this Agreement.',
    "",
    "2. SCOPE OF SERVICES",
    `${HARBOR} will provide professional consulting services to ${RED}.`,
    "",
    "3. PAYMENT TERMS",
    "Client will pay agreed fees. Late payment accrues interest at the lesser of 1.5% per month or the maximum allowed by law.",
    "",
    "4. CONFIDENTIALITY",
    "Each Party will protect the other Party's Confidential Information.",
    "",
    "5. INTELLECTUAL PROPERTY; OWNERSHIP OF WORK PRODUCT",
    `${RED} owns work product created for ${RED} under this Agreement.`,
    "",
    "6. TERMINATION",
    "6.1 Termination for Cause upon uncured material breach.",
    "6.2 Termination for Convenience upon thirty (30) days written notice.",
    "",
    "7. Governing Law, Venue and Notices",
    "7.1 Governing Law. Oklahoma law governs this Agreement.",
    "7.2 Venue. Exclusive venue lies in Oklahoma.",
    "7.3 Notice Provisions. Notices must be in writing.",
    "",
    "If to",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: _______________________________",
    "Title: ______________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: _______________________________",
    "Title: ______________________________",
    "Date: _____________________________",
  ].join("\n");
}

const DUPLICATION_AUDIT_FAMILIES: OperativeClauseFamily[] = [
  "confidentiality",
  "intellectual_property",
  "payment_terms",
  "termination",
  "notices",
  "governing_law",
];

function assertNoDuplicateStandaloneFamilies(text: string): void {
  for (const family of DUPLICATION_AUDIT_FAMILIES) {
    expect(
      countStandaloneClauseFamilyHeadings(text, family),
      `duplicate standalone heading for ${family}`,
    ).toBeLessThanOrEqual(1);
    expect(gateOperativeClauseFamilyAppend(text, family).allowed).toBe(false);
  }
  expect([...text.matchAll(/^\s*IN WITNESS WHEREOF\b/gim)].length).toBeLessThanOrEqual(1);
}

function runCompositionPipeline(corpus: string, intake: string, draft: ParsedDraftShape) {
  let text = corpus;
  const accepted = preparePaidProServerDocumentForAcceptance(text, draft, intake);
  text = accepted.text;
  const mutual = applyMutualConsultingProfessionalQualityFloor(text, draft, intake);
  text = mutual.text;
  text = applyAiWorkflowServicesQualityFloorToFallback(text, draft, intake);
  const notice = repairIncompleteIfToNoticeStanzas(text, qaParties());
  text = notice.text;
  const sanitized = applyPaidProReviewRenderSanitizer(text, qaParties(), { intakeText: intake });
  text = sanitized.text;
  return finalizePaidProSigningCorpusText(text, qaParties()).text;
}

describe("Document Composition Authority", () => {
  describe("A — notice composition", () => {
    it("detects fused role-label notice corruption", () => {
      expect(
        noticeStanzaHasRoleLabelCorruption("Client Service Provider Attention: Sarah Mitchell"),
      ).toBe(true);
      expect(
        noticeStanzaHasRoleLabelCorruption(
          "If to the Client:\nClient Service Provider Attention: Sarah Mitchell",
        ),
      ).toBe(true);
    });

    it("rebuilds corrupted notice stanzas with structured legal-entity destinations", () => {
      const { text, repairs } = repairIncompleteIfToNoticeStanzas(
        CORRUPTED_NOTICE_CORPUS,
        qaParties(),
      );
      expect(repairs.length).toBeGreaterThan(0);
      expect(text).toContain(`If to ${RED}:`);
      expect(text).toContain(`If to ${HARBOR}:`);
      expect(text).toContain("Attn: Sarah Mitchell, CEO");
      expect(text).toContain("Attn: Michael Torres, President");
      expect(text).toContain("contracts@redmesa-logistics.com");
      expect(text).not.toMatch(/Client Service Provider Attention/i);
      expect(text).not.toMatch(/Service Provider Service Provider Attention/i);
    });

    it("party-name preserve leaves notices region untouched (repair handles corruption)", () => {
      const preserved = preserveFullLegalPartyNames(CORRUPTED_NOTICE_CORPUS, [RED, HARBOR], QA_INTAKE);
      const { text } = repairIncompleteIfToNoticeStanzas(preserved, qaParties());
      expect(text).not.toMatch(/Client Service Provider Attention/i);
      expect(text).toContain(`If to ${RED}:`);
    });

    it("review render sanitizer delivers clean notice blocks", () => {
      const corpus = [
        "CONSULTING AGREEMENT",
        "",
        `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
        "",
        ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
        "",
        "10. Notices",
        "10.1 Delivery. Notices must be in writing.",
        "",
        "If to",
        "",
        "IN WITNESS WHEREOF, the Parties execute this Agreement.",
        "",
        `CLIENT: ${RED}`,
        "By: _________________________________",
        "Name: _______________________________",
        "Title: ______________________________",
        "Date: _____________________________",
        "",
        `SERVICE PROVIDER: ${HARBOR}`,
        "By: _________________________________",
        "Name: _______________________________",
        "Title: ______________________________",
        "Date: _____________________________",
      ].join("\n");
      const sanitized = applyPaidProReviewRenderSanitizer(corpus, qaParties(), {
        intakeText: QA_INTAKE,
      }).text;
      expect(sanitized).toContain(`If to ${RED}:`);
      expect(sanitized).toContain("Attn: Sarah Mitchell, CEO");
      expect(sanitized).not.toMatch(/Client Service Provider Attention/i);
    });
  });

  describe("B — operative clause duplication", () => {
    it("blocks second standalone GOVERNING LAW when family already exists", () => {
      const corpus = [
        ...Array.from({ length: 9 }, (_, i) => `${i + 1}. Operative section ${i + 1}.`),
        "10. Governing Law, Venue and Notices",
        "10.1 Governing Law and Venue. This Agreement is governed by Delaware law.",
        "10.2 Notices. Notices must be in writing.",
        "",
        "IN WITNESS WHEREOF",
      ].join("\n");
      const out = preparePaidProServerDocumentForAcceptance(
        corpus,
        { jurisdiction: "Texas" } as never,
        "Texas operations. Parties prefer Texas law.",
      );
      expect(out.text).not.toMatch(/^\s*11\.\s*GOVERNING LAW\s*$/m);
      expect(gateOperativeClauseFamilyAppend(out.text, "governing_law").allowed).toBe(false);
    });
  });

  describe("C — clause family registry", () => {
    const fixtures: Array<{
      family: Parameters<typeof isOperativeClauseFamilyPresent>[1];
      corpus: string;
      absentCorpus: string;
    }> = [
      {
        family: "notices",
        corpus: "10. Notices.\nIf to Acme LLC:\nAcme LLC",
        absentCorpus: "1. Services. Provider will deliver.",
      },
      {
        family: "governing_law",
        corpus: "12. GOVERNING LAW. Laws of Oklahoma govern.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "confidentiality",
        corpus: "5. CONFIDENTIALITY. Each party protects confidential information.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "indemnification",
        corpus: "8. Indemnification. Party A indemnifies Party B.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "limitation_of_liability",
        corpus: "9. LIMITATION OF LIABILITY. No consequential damages.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "payment_terms",
        corpus: "3. PAYMENT TERMS. Invoices due in 30 days.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "termination",
        corpus: "6. TERMINATION. Either party may terminate on notice.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "intellectual_property",
        corpus: "7. INTELLECTUAL PROPERTY. Client owns work product.",
        absentCorpus: "1. Services only.",
      },
      {
        family: "execution_block",
        corpus: "IN WITNESS WHEREOF\nCLIENT:\nAcme LLC",
        absentCorpus: "1. Services only.",
      },
    ];

    for (const { family, corpus, absentCorpus } of fixtures) {
      it(`detects ${family} family presence without false positive on minimal corpus`, () => {
        expect(isOperativeClauseFamilyPresent(corpus, family)).toBe(true);
        expect(isOperativeClauseFamilyPresent(absentCorpus, family)).toBe(false);
      });
    }

    it("allows combined governing law / venue / notices section as single scan result", () => {
      const combined = [
        "10. Governing Law, Venue and Notices",
        "10.1 Governing Law and Venue. Oklahoma law governs.",
        "10.2 Notices. If to Acme LLC:",
      ].join("\n");
      const families = scanOperativeClauseFamilies(combined);
      expect(families.has("governing_law")).toBe(true);
      expect(families.has("notices")).toBe(true);
    });

    it("mutual consulting floor does not append governing law when registry reports present", () => {
      const corpus = [
        "MUTUAL CONSULTING AGREEMENT",
        `Between ${RED} and ${HARBOR}.`,
        ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Topic ${i + 1}.`),
        "10. Governing Law, Venue and Notices",
        "10.1 Governing Law and Venue. Delaware law governs.",
        "IN WITNESS WHEREOF",
      ].join("\n");
      const floored = applyMutualConsultingProfessionalQualityFloor(corpus, null, QA_INTAKE);
      const governingSectionMatches = [...floored.text.matchAll(/^\s*\d+\.\s*GOVERNING LAW\b/gim)];
      expect(governingSectionMatches.length).toBeLessThanOrEqual(1);
    });
  });

  describe("D — adversarial clause-rich consulting intake", () => {
    it("resolves exactly two legal parties without Pro multi-party gate", () => {
      const resolved = resolveLegalIdentitiesFromExtraction({
        intakeText: ADVERSARIAL_CLAUSE_RICH_INTAKE,
      });
      expect(resolved.map((p) => p.legalEntityName)).toEqual([RED, HARBOR]);
      const gate = assessStarterComplexityGate(ADVERSARIAL_CLAUSE_RICH_INTAKE);
      expect(gate.required).toBe(false);
      expect(gate.partyCount).toBe(2);
    });

    it("composition pipeline does not duplicate operative clause families", () => {
      const corpus = buildAdversarialClauseRichCorpus();
      const families = scanOperativeClauseFamilies(corpus);
      expect(families.has("confidentiality")).toBe(true);
      expect(families.has("intellectual_property")).toBe(true);
      expect(families.has("payment_terms")).toBe(true);
      expect(families.has("termination")).toBe(true);
      expect(families.has("governing_law")).toBe(true);
      expect(families.has("notices")).toBe(true);

      const composed = runCompositionPipeline(
        corpus,
        ADVERSARIAL_CLAUSE_RICH_INTAKE,
        ADVERSARIAL_DRAFT,
      );
      assertNoDuplicateStandaloneFamilies(composed);
      expect(composed).toContain(`If to ${RED}:`);
      expect(composed).toContain("Attn: Sarah Mitchell, CEO");
      expect(composed).not.toMatch(/Client Service Provider Attention/i);
      expect(composed).not.toMatch(/Service Provider Service Provider Attention/i);
      const witnessIdx = composed.search(/\bIN WITNESS WHEREOF\b/i);
      const tail = witnessIdx >= 0 ? composed.slice(witnessIdx) : composed;
      expect(tail).not.toMatch(/Email for Notice:/i);
      expect(tail).not.toMatch(/Address for Notice:/i);
    });

    it("registry blocks append when Oklahoma appears in intake but governing law family exists", () => {
      const corpus = buildAdversarialClauseRichCorpus();
      const out = preparePaidProServerDocumentForAcceptance(
        corpus,
        { jurisdiction: "Texas" } as never,
        ADVERSARIAL_CLAUSE_RICH_INTAKE,
      );
      expect(out.text).not.toMatch(/^\s*\d+\.\s*GOVERNING LAW\s*$/m);
      expect(isOperativeClauseFamilyPresent(out.text, "governing_law")).toBe(true);
    });
  });
});
