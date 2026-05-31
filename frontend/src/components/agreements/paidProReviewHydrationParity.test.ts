import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resolvePaidProFinalHydratedCorpusForSurface } from "./paidProFinalHydratedCorpus";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { computePremiumDocumentRenderHints } from "./premiumDocumentRenderHints";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";

const RAW = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  'This Consulting and Implementation Agreement (the "Agreement") is entered into as of the Effective Date This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").execution by both parties.',
  "",
  "Professional services shape — scope, acceptance, and how payment ties to deliverables or milestones.",
  "",
  ...Array.from({ length: 25 }, (_, i) => `Section ${i + 1}. Text ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "Name: _________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: May 30, 2026",
  "",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc.",
  "Name: _________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: May 30, 2026",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Blue Canyon Analytics LLC",
    recipient2Name: "Iron Vale Systems Inc.",
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ivan Vee"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124", "138 Main St., Clarkville, OH 23087"],
  });
}

describe("paidProReviewHydrationParity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("review, copy, and authoritative plain share hydrated notice metadata", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    const auth = authority();
    setConsumedPaidProSignerMetadataAuthority(auth);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW,
      authority: auth,
      intakeRaw: "consulting",
      surface: "review_parity",
    });
    const reviewPlain = resolveAuthoritativePaidProReviewPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    const reviewSurface = getPaidProDocumentForSurface("review")!;

    expect(reviewSurface.signerMetadataApplied).toBe(true);
    expect(reviewSurface.source).not.toBe("paidProSourceOfTruth");

    for (const corpus of [hydrated.corpus, reviewPlain, copy, reviewSurface.text]) {
      expect(corpus).toMatch(/Party Notice Details:/i);
      expect(corpus).toMatch(/Email for Notice:\s*anthemhayek@gmail\.com/i);
      expect(corpus).toMatch(/Address for Notice:\s*1027 S\. Rainbow/i);
      expect(corpus).not.toMatch(/Email for Notice:\s*_{4,}/i);
      expect(corpus).not.toMatch(/Professional services shape/i);
      expect(corpus).not.toMatch(/Date:\s*May\s+30,\s*2026/i);
      expect(corpus).not.toContain("Blue Canyon Analytics LLC Iron Vale");
    }

    const resolution = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [],
      signerIdentities: [],
      signingCorpusReady: true,
    });
    expect(resolution.source).not.toBe("paidProSourceOfTruth");
    expect(resolution.hasSignerHydration).toBe(true);
  });

  it("sanitizes concatenated party legal names in hydrated signature blocks", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    const auth = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Blue Canyon Analytics LLC Iron Vale Systems Inc",
      recipient2Name: "Iron Vale Systems Inc.",
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem", "Ivan"],
      partySignerTitles: ["Member", "Manager"],
      partyAddresses: ["100 Main", "200 Oak"],
    });
    setConsumedPaidProSignerMetadataAuthority(auth);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW,
      authority: auth,
      intakeRaw: "",
      surface: "concat_sanitize",
    });
    expect(hydrated.corpus).toContain("Blue Canyon Analytics LLC");
    expect(hydrated.corpus).not.toMatch(/Blue Canyon Analytics LLC Iron Vale Systems Inc Analytics/i);
  });

  it("review HTML uses hydrated corpus without intelligence callouts", () => {
    establishPaidProSourceOfTruth({ text: RAW, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const plain = resolvePaidProFinalHydratedCorpusForSurface("review").text;
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      renderHints: computePremiumDocumentRenderHints(null, plain, "consulting"),
      suppressDocumentIntelligenceCallouts: true,
      forceEmbeddedCorpusSignature: true,
    });
    expect(html).not.toMatch(/Professional services shape/i);
    expect(html).not.toContain("premium-doc-callout");
    expect(plain).toMatch(/Email for Notice:\s*ivee23@me\.com/i);
  });
});
