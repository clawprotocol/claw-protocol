import { afterEach, describe, expect, it } from "vitest";
import {
  applyPartyNoticeDetailsToCorpus,
  applySignatureNoticeContactFieldsToCorpus,
  buildPartyNoticeDetailsBlock,
  corpusHasPartyNoticeDetails,
  ensureExecutionBlockNoticeContactFieldLines,
  repairCollapsedInlineNoticeStanzas,
  relocateMisplacedNoticesSectionBeforeGoverningLaw,
} from "./paidProPartyNoticeDetails";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { resolvePaidProFinalHydratedCorpusForSurface } from "./paidProFinalHydratedCorpus";
import { getPaidProDocumentForSurface } from "./paidProSourceOfTruth";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const RAW_BODY = [
  "MASTER SERVICES AGREEMENT",
  "",
  `Between ${BLUE} and ${IRON}.`,
  "",
  ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "11. Notices and Dispute Terms.",
  "11.1 Notices. Any notice under this Agreement must be in writing and may be delivered by email or courier to the notice details below, unless a party updates those details by written notice to the other party.",
  "",
  "12. Miscellaneous.",
  "Entire agreement.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "jn789@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Jay Nine"],
    partySignerTitles: ["Member", "Member"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124", "101 High St. Mainville, MS 70345"],
  });
}

describe("paidProPartyNoticeDetails", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
  });

  it("buildPartyNoticeDetailsBlock includes email and address, omits blank address", () => {
    const block = buildPartyNoticeDetailsBlock([
      {
        partyIndex: 0,
        partyLegalName: BLUE,
        signerEmail: "a@test.com",
        signerName: "Anthem",
        signerTitle: "Member",
        partyAddress: "100 Main",
      },
      {
        partyIndex: 1,
        partyLegalName: IRON,
        signerEmail: "b@test.com",
        signerName: "Jay",
        signerTitle: "VP",
        partyAddress: "",
      },
    ]);
    expect(block).toContain("Email: a@test.com");
    expect(block).toContain("Address: 100 Main");
    expect(block).toContain("Email: b@test.com");
    const spSection = block.split(/Service Provider:/i)[1] ?? "";
    expect(spSection).not.toMatch(/\nAddress:/i);
  });

  it("ensureExecutionBlockNoticeContactFieldLines strips legacy notice rows from execution blocks", () => {
    const sparseBody = [
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      BLUE,
      "By: __________________________",
      "Name:",
      "Title:",
      "Date:",
      "",
      "SERVICE PROVIDER:",
      IRON,
      "By: __________________________",
      "Name:",
      "Title:",
      "Date:",
    ].join("\n");
    const ensured = ensureExecutionBlockNoticeContactFieldLines(sparseBody);
    expect(ensured.inserted).toBe(0);
    expect(ensured.text).not.toMatch(/Email for Notice:/i);
    expect(ensured.text).not.toMatch(/Address for Notice:/i);
    const stripped = applySignatureNoticeContactFieldsToCorpus(ensured.text, authority().parties);
    expect(stripped.text).not.toMatch(/anthemhayek@gmail\.com/i);
  });

  it("applySignatureNoticeContactFieldsToCorpus strips signature notice lines", () => {
    const contaminated = [
      ...RAW_BODY.split("\n").slice(0, -8),
      "Email for Notice: __________________________",
      "Address for Notice: ________________________",
      "Date:",
      "",
      "SERVICE PROVIDER:",
      IRON,
      "By: _________________________________",
      "Name:",
      "Title:",
      "Email for Notice: anthemhayek@gmail.com",
      "Address for Notice: 1027 S. Rainbow Blvd.",
      "Date:",
    ].join("\n");
    const withLines = applySignatureNoticeContactFieldsToCorpus(contaminated, authority().parties);
    expect(withLines.applied).toBe(true);
    expect(withLines.text).not.toMatch(/Email for Notice:/i);
    expect(withLines.text).not.toMatch(/Address for Notice:/i);
    expect(withLines.text).not.toMatch(/anthemhayek@gmail\.com/i);
  });

  it("applyPartyNoticeDetailsToCorpus is idempotent", () => {
    const parties = authority().parties;
    const first = applyPartyNoticeDetailsToCorpus(RAW_BODY, parties);
    const second = applyPartyNoticeDetailsToCorpus(first.text, parties);
    expect(corpusHasPartyNoticeDetails(first.text)).toBe(true);
    expect((first.text.match(/Party Notice Details:/gi) || []).length).toBe(1);
    expect((second.text.match(/Party Notice Details:/gi) || []).length).toBe(1);
    expect(fingerprintAgreementBody(first.text)).toBe(fingerprintAgreementBody(second.text));
  });

  it("hydrates emails and addresses into final corpus surfaces", () => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    const auth = authority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: auth,
      intakeRaw: "",
      surface: "test_notice_hydration",
    });
    expect(hydrated.partyNoticeApplied).toBe(false);
    expect(hydrated.corpus).not.toMatch(/Party Notice Details:/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
    expect(hydrated.corpus).not.toMatch(/anthemhayek@gmail\.com/i);

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", "Jay Nine"],
      partySignerTitles: ["Member", "Member"],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "jn789@me.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Jay Nine"],
        partySignerTitles: ["Member", "Member"],
        partyAddresses: ["1027 S. Rainbow Blvd., #124", "101 High St. Mainville, MS 70345"],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "anthemhayek@gmail.com",
        recipient2Email: "jn789@me.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });

    const copy = resolvePaidProFinalHydratedCorpusForSurface("copy").text;
    const exportText = resolvePaidProFinalHydratedCorpusForSurface("finalized").text;
    const reviewDoc = getPaidProDocumentForSurface("copy")!.text;
    const vs01 = resolveFinalVs01CorpusOrBlock({
      guidedPro: true,
      premiumComplete: true,
      intakeText: "",
    }).corpus;

    for (const corpus of [copy, exportText, reviewDoc, vs01]) {
      expect(corpus).not.toMatch(/Email for Notice:/i);
      expect(corpus).not.toMatch(/Address for Notice:/i);
      expect(corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    }
  });

  it("changing email before finalize does not mutate execution block corpus", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    const auth1 = authority();
    const h1 = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: auth1,
      intakeRaw: "",
      surface: "hash_a",
    });
    const auth2 = buildLivePaidProSignerMetadataAuthority({
      ...{
        partyCount: 2,
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "changed@test.com",
        recipient2Email: "jn789@me.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Anthem H Blanchard", "Jay Nine"],
        partySignerTitles: ["Member", "Member"],
        partyAddresses: ["1027 S. Rainbow Blvd., #124", "101 High St. Mainville, MS 70345"],
      },
    });
    const h2 = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: auth2,
      intakeRaw: "",
      surface: "hash_b",
    });
    expect(fingerprintAgreementBody(h1.corpus)).toBe(fingerprintAgreementBody(h2.corpus));
    expect(h2.corpus).not.toMatch(/changed@test\.com/i);
    expect(h2.corpus).not.toMatch(/Email for Notice:/i);
  });

  it("repairCollapsedInlineNoticeStanzas preserves IN WITNESS when padding immediately precedes execution", () => {
    const padding = Array.from({ length: 3 }, (_, i) =>
      `Operational supplement ${i + 1}. Each Party shall maintain inventory reporting tier ${i + 1} under Oklahoma comm`,
    ).join("\n\n");
    const corpus = [
      "11. NOTICES",
      "Notices under this Agreement must be in writing.",
      "",
      "If to Evergreen Outdoor Brands LLC: Evergreen Outdoor Brands LLC Attn: Authorized Signer Email: to be completed Address: provided during signer setup",
      "",
      "If to Atlas Consumer Products Inc.: Atlas Consumer Products Inc. Attn: Authorized Signer Email: provided during signer setup Address: provided during signer setup",
      "",
      padding,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "Evergreen Outdoor Brands LLC:",
      "By: ______________________________",
    ].join("\n");
    const repaired = repairCollapsedInlineNoticeStanzas(corpus);
    expect(repaired.text).toMatch(/\bIN WITNESS WHEREOF\b/i);
    expect(repaired.text).not.toMatch(/commIN WITNESS/i);
    expect(repaired.repairs.length).toBeGreaterThan(0);
  });

  it("relocateMisplacedNoticesSectionBeforeGoverningLaw moves trailing notices before section 12", () => {
    const corpus = [
      "10. TERM AND TERMINATION",
      "Term text.",
      "",
      "12. GOVERNING LAW",
      "Oklahoma law.",
      "",
      "13. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
      "Counterparts.",
      "",
      "11. NOTICES",
      "",
      "If to Evergreen Outdoor Brands LLC:",
      "Evergreen Outdoor Brands LLC",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n");
    const relocated = relocateMisplacedNoticesSectionBeforeGoverningLaw(corpus);
    expect(relocated.text).toMatch(/10\. TERM[\s\S]*11\. NOTICES[\s\S]*12\. GOVERNING LAW/);
    expect(relocated.text.indexOf("11. NOTICES")).toBeLessThan(relocated.text.indexOf("12. GOVERNING LAW"));
  });
});
