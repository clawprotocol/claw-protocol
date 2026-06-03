import { afterEach, describe, expect, it } from "vitest";
import {
  applyPartyNoticeDetailsToCorpus,
  applySignatureNoticeContactFieldsToCorpus,
  buildPartyNoticeDetailsBlock,
  corpusHasPartyNoticeDetails,
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
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
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

  it("applySignatureNoticeContactFieldsToCorpus fills signature notice lines", () => {
    const parties = authority().parties;
    const withLines = applySignatureNoticeContactFieldsToCorpus(RAW_BODY, parties);
    expect(withLines.applied).toBe(true);
    expect(withLines.text).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(withLines.text).toMatch(/Address for Notice:\s*1027 S\. Rainbow/i);
    expect(withLines.text).not.toMatch(/Email for Notice:\s*_{4,}/i);
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
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*jn789@me\.com/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:\s*_{4,}/i);

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
      expect(corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
      expect(corpus).toMatch(/Email for Notice:\s*jn789@me\.com/i);
      expect(corpus).toMatch(/Address for Notice:\s*1027 S\. Rainbow/i);
    }
  });

  it("changing email before finalize changes hydrated corpus hash", () => {
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
    expect(fingerprintAgreementBody(h1.corpus)).not.toBe(fingerprintAgreementBody(h2.corpus));
    expect(h2.corpus).toMatch(/Email for Notice:\s*changed@test\.com/i);
  });
});
