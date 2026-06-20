import { describe, expect, it } from "vitest";
import {
  analyzeContactAuthorityExecutionBlockIntegrity,
  applyContactAuthorityExecutionBlockIntegrity,
  buildSigningCapacityExecutionBlockSection,
  corpusHasLawDogNoticesClause,
  DEFAULT_LAWDOG_NOTICES_CLAUSE,
  ensureLawDogNoticesClauseInCorpus,
  stripExecutionBlockContactContamination,
} from "./contactAuthorityExecutionBlockIntegrity";
import { buildStarterProCheckoutPendingDraft, assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { applySignatureNoticeContactFieldsToCorpus } from "./paidProPartyNoticeDetails";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { hydratePaidProExecutionBlockWithSignerMetadata } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { buildCanonicalExecutionTailFromManifest, manifestRecordsForPaidProAcceptance } from "./paidProAcceptanceExecutionBlockInvariant";
import { applyDocumentQualityFloor } from "./documentQualityFloor";

const CLIENT = "Red Mesa Logistics LLC";
const PROVIDER = "Harbor Peak Automation LLC";

function contaminatedExecutionBlock(): string {
  return [
    "1. Services",
    "Scope of work.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    CLIENT,
    "By: __________________________",
    "Name: Jane Doe",
    "Title: President",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    PROVIDER,
    "By: __________________________",
    "Name: John Smith",
    "Title: CEO",
    "Email for Notice: client@example.com",
    "Address for Notice: 100 Main St",
    "Date: _____________________________",
  ].join("\n");
}

function cleanExecutionBlock(): string {
  return [
    "1. Services",
    "Scope of work.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    buildSigningCapacityExecutionBlockSection({
      heading: "CLIENT",
      legalEntityName: CLIENT,
      signerName: "Jane Doe",
      signerTitle: "President",
    }),
    "",
    buildSigningCapacityExecutionBlockSection({
      heading: "SERVICE PROVIDER",
      legalEntityName: PROVIDER,
      signerName: "John Smith",
      signerTitle: "CEO",
    }),
  ].join("\n");
}

function parties(): PaidProSignerMetadataParty[] {
  return [
    {
      partyIndex: 0,
      partyLegalName: CLIENT,
      signerName: "Jane Doe",
      signerTitle: "President",
      signerEmail: "jane@redmesa.example",
      partyAddress: "100 Main St",
    },
    {
      partyIndex: 1,
      partyLegalName: PROVIDER,
      signerName: "John Smith",
      signerTitle: "CEO",
      signerEmail: "john@harborpeak.example",
      partyAddress: "200 Oak Ave",
    },
  ];
}

function signerMetadata() {
  return {
    partySignerNames: ["Jane Doe", "John Smith"],
    partySignerTitles: ["President", "CEO"],
    partyAddresses: ["100 Main St", "200 Oak Ave"],
    recipient1Name: "Jane Doe",
    recipient2Name: "John Smith",
    recipient1Email: "jane@redmesa.example",
    recipient2Email: "john@harborpeak.example",
    extraPartyReviewEmails: [],
  };
}

describe("contactAuthorityExecutionBlockIntegrity", () => {
  it("A — removes email placeholders from execution blocks", () => {
    const result = stripExecutionBlockContactContamination(contaminatedExecutionBlock());
    expect(result.text).not.toMatch(/Email for Notice:/i);
    expect(result.removed).toBeGreaterThan(0);
  });

  it("B — removes address placeholders from execution blocks", () => {
    const result = stripExecutionBlockContactContamination(contaminatedExecutionBlock());
    expect(result.text).not.toMatch(/Address for Notice:/i);
  });

  it("C — signer email is never injected into execution block", () => {
    const stripped = applySignatureNoticeContactFieldsToCorpus(contaminatedExecutionBlock(), parties());
    expect(stripped.text).not.toMatch(/jane@redmesa\.example/i);
    expect(stripped.text).not.toMatch(/john@harborpeak\.example/i);
    expect(stripped.text).not.toMatch(/Email for Notice:/i);
  });

  it("D — signer address is never injected into execution block", () => {
    const stripped = applySignatureNoticeContactFieldsToCorpus(contaminatedExecutionBlock(), parties());
    expect(stripped.text).not.toMatch(/100 Main St/i);
    expect(stripped.text).not.toMatch(/200 Oak Ave/i);
    expect(stripped.text).not.toMatch(/Address for Notice:/i);
  });

  it("E — default Notices clause references LawDog-provided metadata", () => {
    const withNotices = ensureLawDogNoticesClauseInCorpus(
      "1. Services\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme\nBy:\nName:\nTitle:\nDate:",
    );
    expect(corpusHasLawDogNoticesClause(withNotices.text)).toBe(true);
    expect(withNotices.text).toMatch(/LawDog signing process/i);
    expect(withNotices.text).toContain(DEFAULT_LAWDOG_NOTICES_CLAUSE.split("\n\n")[0]!);
  });

  it("F — completed agreement execution block stays clean after integrity pass", () => {
    const integrity = applyContactAuthorityExecutionBlockIntegrity(contaminatedExecutionBlock(), {
      source: "test_completed_agreement",
    });
    expect(integrity.contaminationCount).toBe(0);
    expect(integrity.text).toMatch(/Name: Jane Doe/);
    expect(integrity.text).not.toMatch(/Email for Notice:/i);
  });

  it("G — VS01-style corpus stays clean after strip", () => {
    const integrity = applyContactAuthorityExecutionBlockIntegrity(contaminatedExecutionBlock(), {
      source: "test_vs01_corpus",
    });
    expect(analyzeContactAuthorityExecutionBlockIntegrity(integrity.text).contaminationCount).toBe(0);
  });

  it("H — signer email updates do not mutate execution block structure", () => {
    const base = cleanExecutionBlock();
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(base, {
      ...signerMetadata(),
      recipient1Email: "new-email@example.com",
      recipient2Email: "another@example.com",
    });
    expect(hydrated.corpus).not.toMatch(/new-email@example\.com/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
    expect(hydrated.corpus.split("CLIENT:").length - 1).toBe(1);
  });

  it("I — signer address updates do not mutate execution block structure", () => {
    const base = cleanExecutionBlock();
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(base, {
      ...signerMetadata(),
      partyAddresses: ["999 New Address Blvd", "888 Other Ave"],
    });
    expect(hydrated.corpus).not.toMatch(/999 New Address/i);
    expect(hydrated.corpus).not.toMatch(/Address for Notice:/i);
  });

  it("J — review render quality floor matches cleaned execution block", () => {
    const review = applyDocumentQualityFloor(contaminatedExecutionBlock());
    const completed = applyContactAuthorityExecutionBlockIntegrity(contaminatedExecutionBlock(), {
      source: "test_review_completed_parity",
    });
    expect(review.text).not.toMatch(/Email for Notice:/i);
    expect(completed.text).not.toMatch(/Email for Notice:/i);
    expect(review.text).toMatch(/Name: Jane Doe/);
    expect(completed.text).toMatch(/Name: Jane Doe/);
  });

  it("K — canonical acceptance tail contains signing-capacity fields only", () => {
    const records = manifestRecordsForPaidProAcceptance({
      intakeText: `Consulting agreement between Acme LLC and Beta Corp. Texas law.`,
    });
    const tail = buildCanonicalExecutionTailFromManifest(records);
    expect(tail).toMatch(/By:/);
    expect(tail).toMatch(/Name:/);
    expect(tail).toMatch(/Title:/);
    expect(tail).toMatch(/Date:/);
    expect(tail).not.toMatch(/Email for Notice:/i);
    expect(tail).not.toMatch(/Address for Notice:/i);
  });

  it("L — multi-party manifest acceptance tail stays clean", () => {
    const pending = buildStarterProCheckoutPendingDraft(
      `Party 1: Alpha LLC\nParty 2: Beta LLC\nParty 3: Gamma LLC\nParty 4: Delta LLC\nTexas law.`,
    );
    const tail = buildCanonicalExecutionTailFromManifest(
      pending.parties.map((party, index) => ({
        fullLegalName: party.name,
        roleLabel: party.role || `Party ${index + 1}`,
        displayAlias: party.name,
        signerName: null,
        signerTitle: null,
        partyAddress: null,
      })),
    );
    expect(tail).not.toMatch(/Email for Notice:/i);
    expect(tail).not.toMatch(/Address for Notice:/i);
  });

  it("M — existing signer setup metadata paths still hydrate name/title only", () => {
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(cleanExecutionBlock(), signerMetadata(), null, {
      overwriteExistingMetadata: true,
    });
    expect(hydrated.corpus).toMatch(/Name: Jane Doe/);
    expect(hydrated.corpus).toMatch(/Title: President/);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
  });

  it("N — starter complexity gates remain stable for representative intakes", () => {
    const twoParty = `Consulting agreement between Acme LLC and Beta Corp. Texas law.`;
    const threeParty = `Agreement between Alpha LLC, Beta LLC, and Gamma LLC. Oklahoma law.`;
    expect(assessStarterComplexityGate(twoParty).required).toBe(false);
    expect(assessStarterComplexityGate(threeParty).required).toBe(true);
    expect(assessStarterComplexityGate(threeParty).partyCount).toBeGreaterThanOrEqual(3);
  });
});
