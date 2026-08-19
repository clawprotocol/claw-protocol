import { afterEach, describe, expect, it } from "vitest";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  assertPaidProFinalCorpusParity,
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
  resolvePaidProFinalHydratedCorpusForSurface,
} from "./paidProFinalHydratedCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const RAW_BODY = [
  "MASTER SERVICES AGREEMENT",
  "",
  `Between ${BLUE} and ${IRON}.`,
  "",
  ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "11. Notices.",
  "11.1 Notices. Any notice under this Agreement must be in writing and may be delivered by email or courier to the notice details below, unless a party updates those details by written notice to the other party.",
  "",
  `If to ${BLUE}:`,
  BLUE,
  "Email: notices@blue.test",
  "",
  `If to ${IRON}:`,
  IRON,
  "Email: notices@iron.test",
  "",
  "12. Miscellaneous.",
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

function partyAuthority() {
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

describe("paidProFinalHydratedCorpus", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("after finalize snapshot, copy/review/finalized surfaces share hydrated signer metadata", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    const authority = partyAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority,
      intakeRaw: "",
      surface: "test_finalize",
    });
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

    const review = resolvePaidProFinalHydratedCorpusForSurface("review");
    const copy = resolvePaidProFinalHydratedCorpusForSurface("copy");
    const finalized = resolvePaidProFinalHydratedCorpusForSurface("finalized");
    const copySurface = getPaidProDocumentForSurface("copy");

    expect(review.source).toBe("authoritative_signing_snapshot");
    expect(copy.source).toBe("authoritative_signing_snapshot");
    expect(copySurface?.source).toBe("authoritative_signing_snapshot");
    expect(copySurface?.signerMetadataApplied).toBe(true);

    for (const corpus of [review.text, copy.text, finalized.text, copySurface!.text]) {
      expect(corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
      expect(corpus).toMatch(/Name:\s*Jay Nine/i);
      expect(corpus).toMatch(/Title:\s*Member/i);
      expect(corpus).toMatch(/Email:\s*anthemhayek@gmail\.com/i);
      expect(corpus).toMatch(/Email:\s*jn789@me\.com/i);
      expect(corpus).toMatch(/Address:\s*1027 S\. Rainbow/i);
      expect(corpus).not.toMatch(/Name:\s*_{4,}/i);
      expect(corpus).not.toMatch(/Title:\s*_{4,}/i);
    }

    expect(fingerprintAgreementBody(review.text)).toBe(fingerprintAgreementBody(copy.text));
    const parity = assertPaidProFinalCorpusParity({
      reviewText: review.text,
      copyText: copy.text,
      exportText: finalized.text,
    });
    expect(parity.ok).toBe(true);
  });

  it("does not hydrate from consumed metadata until execution corpus is frozen (pin or snapshot)", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(partyAuthority());
    const beforePin = resolvePaidProFinalHydratedCorpusForSurface("copy");
    expect(beforePin.source).toBe("paidProSourceOfTruth");
    expect(beforePin.signerMetadataApplied).toBe(false);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: partyAuthority(),
      intakeRaw: "",
      surface: "test_pin",
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const afterPin = resolvePaidProFinalHydratedCorpusForSurface("copy");
    expect(afterPin.source).toBe("pinned_signer_applied_corpus");
    expect(afterPin.signerMetadataApplied).toBe(true);
    expect(afterPin.text).toMatch(/Name:\s*Jay Nine/i);
  });

  it("falls back to raw SoT when no signer metadata exists", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    const resolved = resolvePaidProFinalHydratedCorpusForSurface("copy");
    expect(resolved.source).toBe("paidProSourceOfTruth");
    expect(resolved.signerMetadataApplied).toBe(false);
  });
});
