import { afterEach, describe, expect, it } from "vitest";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { buildCorpusSimulatedPageLayouts, findSignatureLinePlacementsFromPageLayout, pageLayoutForIndex } from "../../vs01/vs01PageTextLayout";
import { resolveSignatureFieldRect } from "../../vs01/vs01SignaturePlacement";
import {
  buildHydratedAuthoritativeSigningCorpusFromAuthority,
} from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  countWitnessExecutionSections,
  stripPaidProSignerSummaryBlocksFromCorpus,
} from "./paidProSignerSigningCorpusHygiene";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE } from "./canonicalPartyLegalNameSanitizer";
import { applyPartyNoticeDetailsToCorpus } from "./paidProPartyNoticeDetails";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";

const RAW_BODY = [
  "MASTER SERVICES AGREEMENT",
  "",
  `Between ${BLUE_CANYON} and ${IRON_VALE}.`,
  "",
  ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE_CANYON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON_VALE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE_CANYON,
    recipient2Name: IRON_VALE,
    recipient1Email: "anthem@test.com",
    recipient2Email: "ira@test.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
    partySignerTitles: ["Manager", "CEO"],
    partyAddresses: ["100 Main St", "208 Main St"],
  });
}

describe("paidProSignerHydrationSigningFormat", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("hydration fills execution block without Party Notice / Party 1 / Party 2 summary sections", () => {
    const withNotice = applyPartyNoticeDetailsToCorpus(RAW_BODY, authority().parties).text;
    expect(withNotice).toMatch(/Party Notice Details:/i);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: withNotice,
      authority: authority(),
      intakeRaw: "",
      surface: "signing_format_contract",
    });
    const preWitness = hydrated.corpus.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? "";
    expect(hydrated.corpus).not.toMatch(/Party Notice Details:/i);
    expect(preWitness).not.toMatch(/^\s*Party\s+1\s*:/im);
    expect(preWitness).not.toMatch(/^\s*Party\s+2\s*:/im);
    expect(preWitness).not.toMatch(/^\s*Signer\s*:/im);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
    expect(hydrated.corpus).not.toMatch(/Address for Notice:/i);
  });

  it("hydration is idempotent when signer_identity_apply path runs twice", () => {
    const first = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: authority(),
      intakeRaw: "",
      surface: "idempotent_first",
    });
    const second = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: first.corpus,
      authority: authority(),
      intakeRaw: "",
      surface: "idempotent_second",
    });
    const witnessTail = (corpus: string) => corpus.slice(corpus.search(/\bIN WITNESS WHEREOF\b/i));
    expect(second.corpus).not.toMatch(/Email for Notice:/i);
    expect(second.corpus).not.toMatch(/Address for Notice:/i);
    expect(witnessTail(second.corpus)).toBe(witnessTail(first.corpus));
  });

  it("signing snapshot contains exactly one IN WITNESS WHEREOF execution section", () => {
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: authority(),
      intakeRaw: "",
      surface: "snapshot_witness",
    });
    const snap = createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
        partySignerTitles: ["Manager", "CEO"],
        partyAddresses: ["100 Main St", "208 Main St"],
        recipient1Name: BLUE_CANYON,
        recipient2Name: IRON_VALE,
        recipient1Email: "anthem@test.com",
        recipient2Email: "ira@test.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: resolveCanonicalFinalPartyManifest({
        partyCount: 2,
        recipient1Name: BLUE_CANYON,
        recipient2Name: IRON_VALE,
        recipient1Email: "anthem@test.com",
        recipient2Email: "ira@test.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
        partySignerTitles: ["Manager", "CEO"],
        draftPartyNames: [BLUE_CANYON, IRON_VALE],
        sendMode: "signature",
        recipientsDeferred: false,
      }),
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    expect(countWitnessExecutionSections(snap.corpus)).toBe(1);
  });

  it("VS01 signature anchors stay on execution By lines, not numbered operative sections", () => {
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority: authority(),
      intakeRaw: "",
      surface: "vs01_anchors",
    });
    const layouts = buildCorpusSimulatedPageLayouts(hydrated.corpus, 4);
    const witnessPage = layouts.length - 1;
    const layout = pageLayoutForIndex(layouts, witnessPage)!;
    const witnessY =
      layout.textRects.find((r) => /\bIN WITNESS WHEREOF\b/i.test(r.text))?.y ?? 0.5;

    for (const partyIndex of [0, 1]) {
      const placed = resolveSignatureFieldRect({
        page: witnessPage,
        partyIndex,
        roleCount: 2,
        fieldType: "signature",
        pageLayout: layout,
        corpusAnchor: null,
      });
      expect(placed.rect, `party ${partyIndex}`).not.toBeNull();
      expect(placed.rect!.y).toBeGreaterThanOrEqual(witnessY - 0.02);
      const bodyClause = layout.textRects.find((r) => /^\d+\.\d+\s/.test(r.text.trim()));
      if (bodyClause) {
        expect(placed.rect!.y).toBeGreaterThan(bodyClause.y);
      }
    }
    const byLines = findSignatureLinePlacementsFromPageLayout(layout);
    expect(byLines.length).toBeGreaterThanOrEqual(2);
  });

  it("review render sanitizer fills notice fields on fused legacy RAW fixture", () => {
    const fusedRaw = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
      "",
      ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: Anthem H Blanchard",
      "Title: Manager",
      "",
      "SERVICE PROVIDER:",
      "Iron Vale Systems Inc",
      "By: __________________________",
      "Name: Ira Vale",
      "Title: Membe",
      "",
      QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
      "By: __________________________",
      "Name: Anthem H Blanchard",
      "Title: Manager",
    ].join("\n");
    const sanitized = applyPaidProReviewRenderSanitizer(fusedRaw, authority().parties).text;
    expect(sanitized).not.toMatch(/Email for Notice:/i);
    expect(sanitized).not.toContain(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE);
  });

  it("review render sanitizer keeps execution block free of notice-contact lines", () => {
    const polluted = [
      "AGREEMENT",
      "",
      'Between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
      "",
      ...Array.from({ length: 12 }, (_, i) => `Section ${i + 1}. Text.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: Anthem H Blanchard",
      "Title: Manager",
      "Date: _____________________________",
      "",
      "SERVICE PROVIDER:",
      "Iron Vale Systems Inc",
      "By: __________________________",
      "Name: Ira Vernon",
      "Title: CEO",
      "Date: _____________________________",
    ].join("\n");
    const sanitized = applyPaidProReviewRenderSanitizer(polluted, authority().parties).text;
    expect(sanitized).not.toMatch(/Email for Notice:/i);
    expect(sanitized).not.toMatch(/Email for Notice:/i);
  });

  it("review render sanitizer does not leave duplicated signer/contact blocks in body", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(authority());
    const polluted = [
      RAW_BODY.split(/\bIN WITNESS WHEREOF\b/i)[0],
      "",
      "Party Notice Details:",
      "",
      "Client:",
      BLUE_CANYON,
      "Signer: Anthem H Blanchard",
      "Email: anthem@test.com",
      "Address: 100 Main St",
      "",
      "Party 1:",
      BLUE_CANYON,
      "Email: anthem@test.com",
      "",
      RAW_BODY.slice(RAW_BODY.search(/\bIN WITNESS WHEREOF\b/i)),
    ].join("\n");
    const sanitized = applyPaidProReviewRenderSanitizer(polluted, authority().parties).text;
    const preWitness = sanitized.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? "";
    expect(sanitized).not.toMatch(/Party Notice Details:/i);
    expect(preWitness).not.toMatch(/^\s*Party\s+1\s*:/im);
    expect(preWitness).not.toMatch(/^\s*Signer\s*:/im);
    expect(stripPaidProSignerSummaryBlocksFromCorpus(sanitized).removed).toBe(0);
  });
});
