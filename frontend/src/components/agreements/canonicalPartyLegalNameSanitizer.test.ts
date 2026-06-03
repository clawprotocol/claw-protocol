import { describe, expect, it } from "vitest";
import {
  applyCanonicalPartyLegalNamesToSigningCorpus,
  assertCorpusHasNoFusedPartyLegalNames,
  corpusContainsFusedPartyLegalName,
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
} from "./canonicalPartyLegalNameSanitizer";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "bca234@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Blake Caen"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124", "501 Frank Phillips Blvd., Suite 102"],
  });
}

const FUSED_CORPUS = [
  "CONSULTING AGREEMENT",
  "",
  ...Array.from({ length: 20 }, (_, i) => `Clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
  "By: __________________________",
  "Name: Anthem H Blanchard",
  "Title: Member",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: _____________________________",
  "",
  "Iron Vale Systems Inc.",
  "By: __________________________",
  "Name: Blake Caen",
  "Title: Manager",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: _____________________________",
  "",
  "Party Notice Details:",
  "",
  "Client:",
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
  "Signer: Anthem H Blanchard",
  "Email: anthemhayek@gmail.com",
  "",
  "Service Provider:",
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
  "Signer: Blake Caen",
  "Email: bca234@me.com",
].join("\n");

describe("canonicalPartyLegalNameSanitizer", () => {
  it("detects QA fused party legal name string", () => {
    expect(corpusContainsFusedPartyLegalName(FUSED_CORPUS)).toBe(true);
  });

  it("repairs fused names in signature blocks and strips legacy party notice summaries", () => {
    const { text, repaired } = applyCanonicalPartyLegalNamesToSigningCorpus(FUSED_CORPUS, authority().parties);
    expect(repaired).toBe(true);
    expect(text).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
    expect(text).not.toMatch(/Party Notice Details:/i);
    expect(text).toContain(BLUE);
    expect(text).toContain(IRON);
    const sigTail = text.split(/\bIN WITNESS WHEREOF\b/i)[1] ?? "";
    expect(sigTail).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(sigTail).toMatch(/Email for Notice:\s*bca234@me\.com/i);
    assertCorpusHasNoFusedPartyLegalNames(text, authority().parties);
  });

  it("isolates party 2 legal name when party 1 contaminated input is fused", () => {
    const auth = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
      recipient2Name: IRON,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem", "Blake"],
      partySignerTitles: ["Member", "Manager"],
      partyAddresses: ["", ""],
    });
    expect(auth.parties[0]!.partyLegalName).toBe(BLUE);
    expect(auth.parties[1]!.partyLegalName).toBe(IRON);
  });
});
