import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  assertPaidProFinalCorpusParity,
  clearPaidProPinnedSignerAppliedCorpus,
  resolvePaidProFinalHydratedCorpusForSurface,
} from "./paidProFinalHydratedCorpus";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { SIGNATURE_DATE_BLANK_LINE } from "./guidedDealCompletion/signerPartyIdentity";
import { applyPartyNoticeDetailsToCorpus } from "./paidProPartyNoticeDetails";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const RAW_WITH_NOTICE_FIELDS = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Mutual Consulting and Implementation Agreement ("Agreement") is This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").execution by both parties.`,
  "",
  ...Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. Operative text ${i + 1}.`),
  "",
  "11. Notices.",
  "11.1 Any notice under this Agreement must be in writing.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE,
  "By: _________________________________",
  "Name: _______________________________",
  "Title: ______________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: May 30, 2026",
  "",
  "SERVICE PROVIDER:",
  IRON,
  "By: _________________________________",
  "Name: _______________________________",
  "Title: ______________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: May 30, 2026",
].join("\n");

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "irenev34@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Irene Vale"],
    partySignerTitles: ["Member", "CEO"],
    partyAddresses: [
      "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89132",
      "149 First St., Smithville, AR 75023",
    ],
  });
}

describe("paidProSignatureNoticeHydration", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("hydrates signature Email for Notice and Address for Notice per party", () => {
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_WITH_NOTICE_FIELDS,
      authority,
      intakeRaw: "",
      surface: "signature_notice_hydration",
    });
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*irenev34@gmail\.com/i);
    expect(hydrated.corpus).toMatch(
      /Address for Notice:\s*1027 S\. Rainbow Blvd\., #124, Las Vegas, NV 89132/i,
    );
    expect(hydrated.corpus).toMatch(/Address for Notice:\s*149 First St\., Smithville, AR 75023/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:\s*_{4,}/i);
    expect(hydrated.corpus).not.toMatch(/Address for Notice:\s*_{4,}/i);
  });

  it("clears prefilled signature Date lines before signing", () => {
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_WITH_NOTICE_FIELDS,
      authority: qaAuthority(),
      intakeRaw: "",
      surface: "signature_date_blank",
    });
    const tail = hydrated.corpus.slice(Math.floor(hydrated.corpus.length * 0.6));
    expect(tail).not.toMatch(/Date:\s*May\s+30,\s*2026/i);
    expect(tail.match(new RegExp(SIGNATURE_DATE_BLANK_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))?.length).toBeGreaterThanOrEqual(2);
  });

  it("Party Notice Details stays idempotent and single", () => {
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_WITH_NOTICE_FIELDS,
      authority,
      intakeRaw: "",
      surface: "notice_idempotent",
    });
    const second = applyPartyNoticeDetailsToCorpus(hydrated.corpus, authority.parties);
    expect((hydrated.corpus.match(/Party Notice Details:/gi) || []).length).toBe(1);
    expect((second.text.match(/Party Notice Details:/gi) || []).length).toBe(1);
  });

  it("review, copy, export, and VS01 share hydrated notice fields", () => {
    establishPaidProSourceOfTruth({ text: RAW_WITH_NOTICE_FIELDS, source: "server_full_draft" });
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_WITH_NOTICE_FIELDS,
      authority,
      intakeRaw: "",
      surface: "parity",
    });
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", "Irene Vale"],
      partySignerTitles: ["Member", "CEO"],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "irenev34@gmail.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Irene Vale"],
        partySignerTitles: ["Member", "CEO"],
        partyAddresses: [
          "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89132",
          "149 First St., Smithville, AR 75023",
        ],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "anthemhayek@gmail.com",
        recipient2Email: "irenev34@gmail.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });

    const review = resolvePaidProFinalHydratedCorpusForSurface("review").text;
    const copy = resolvePaidProFinalHydratedCorpusForSurface("copy").text;
    const exportText = resolvePaidProFinalHydratedCorpusForSurface("finalized").text;
    const vs01 = resolveFinalVs01CorpusOrBlock({
      guidedPro: true,
      premiumComplete: true,
      intakeText: "",
    }).corpus;

    const parity = assertPaidProFinalCorpusParity({
      reviewText: review,
      copyText: copy,
      exportText,
      vs01Text: vs01,
    });
    expect(parity.ok).toBe(true);

    for (const corpus of [review, copy, exportText, getPaidProDocumentForSurface("copy")!.text, vs01]) {
      expect(corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
      expect(corpus).toMatch(/Email for Notice:\s*irenev34@gmail\.com/i);
      expect(corpus).not.toMatch(/Email for Notice:\s*_{4,}/i);
    }
  });
});
