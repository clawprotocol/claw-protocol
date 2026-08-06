import { describe, expect, it } from "vitest";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { manifestToCanonicalPartyIdentities } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { buildPaidProSignerMetadataParties } from "./paidProSignerMetadataAuthority";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { resolveGeneratedAgreementPartyCount, resolveSignerSetupUiPartyCount } from "./paidProNPartySignerSetup";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteFixtures";
import { TEST372_FREE_STACKED_PARTY_INTAKE } from "./paidProTest372FreeStarterIdentityRegression.test";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import {
  assertSignerCountNotFromCorpus,
  consumeAuthoritativeSignerCount,
  inferCorpusDerivedSignerCount,
  resetSignerCountAuthorityDiagnosticsForTests,
  resolveAuthoritativeSignerCount,
  resolveSignerCountFromIdentities,
  resolveSignerCountFromManifest,
  shouldEmitDedupedLog,
  shouldEmitDedupedSurfaceLog,
} from "./signerCountAuthority";

const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK = [
  "SERVICES AGREEMENT",
  "",
  "IN WITNESS WHEREOF",
  "",
  "CLIENT:",
  BLUE,
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  HARBOR,
  "By: __________________________",
  "",
  "PARTY 3:",
  "Decorative Fallback LLC",
  "By: __________________________",
].join("\n");

const DUPLICATE_EXECUTION_CORPUS = [
  TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
  "",
  "IN WITNESS WHEREOF",
  "",
  "CLIENT:",
  BLUE,
  "By: __________________________",
].join("\n");

const COORDINATOR_TWO_PARTY_INTAKE = `
Party 1
Legal Entity: ${BLUE}
Signer Email: sarah@bluecanyonanalytics.com

Party 2
Legal Entity: ${HARBOR}
Signer Email: michael@harborpeakautomation.com

Coordinator
Name: Alex Morgan
Email: alex@coordinator.test
Role: coordinating this agreement, not signing as a party
`.trim();

function twoPartyAuthorityArgs() {
  return {
    intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
    draftParties: [{ name: BLUE }, { name: HARBOR }],
    corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
  };
}

describe("signerCountAuthority", () => {
  it("resolves signer count to 2 for role-labeled two-party intake", () => {
    const resolution = resolveAuthoritativeSignerCount(twoPartyAuthorityArgs());
    expect(resolution.count).toBe(2);
    expect(resolution.corpusBlockCount).toBeGreaterThanOrEqual(2);
    expect(resolution.source).toBe("labeled_parties");
  });

  it("keeps clear between-A-and-B intakes at 2 when preview party slots inflate to 3/4", () => {
    const intake =
      "I need a simple services agreement between me (Alex Rivera, freelance product designer) and a small startup called PixelForge Labs. Flat fee of $4,500.";
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: [
        { name: "Alex Rivera" },
        { name: "PixelForge Labs" },
        { name: "Party 3" },
        { name: "Notice Contact LLC" },
      ],
      rawPartyCount: 4,
      corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
    });
    expect(resolution.count).toBe(2);
  });

  it("does not promote freelance job-title appositives into a third party slot", () => {
    const intake =
      "I need a simple services agreement between me (Alex Rivera, freelance product designer) and a small startup called PixelForge Labs. Flat fee of $4,500.";
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: [
        { name: "Alex Rivera" },
        { name: "PixelForge Labs" },
        { name: "Freelance Product Designer" },
      ],
      rawPartyCount: 3,
    });
    expect(resolution.count).toBe(2);
    expect(resolution.draftCount).toBe(2);
  });

  it("clamps sole-prop PixelForge intake to 2 from intake alone when Party C slot noise appears", () => {
    const intake =
      "I need a simple services agreement between me (Alex Rivera, freelance product designer) " +
      "and a small startup called PixelForge Labs. Flat fee of $4,500.";
    const fromIntakeOnly = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: [],
      rawPartyCount: 0,
    });
    expect(fromIntakeOnly.count).toBe(2);

    const withPlaceholderThird = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftParties: [
        { name: "Alex Rivera" },
        { name: "PixelForge Labs" },
        { name: "Party C" },
      ],
      rawPartyCount: 3,
    });
    expect(withPlaceholderThird.count).toBe(2);
    expect(withPlaceholderThird.draftCount).toBe(2);
  });

  it("generated agreement party count ignores decorative third signature block", () => {
    const count = resolveGeneratedAgreementPartyCount({
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftParties: [{ name: BLUE }, { name: HARBOR }, { name: "Decorative Fallback LLC" }],
      corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
    });
    expect(count).toBe(2);
  });

  it("blocks corpus-derived count from becoming consumer count", () => {
    const corpusCount = inferCorpusDerivedSignerCount(TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK);
    expect(corpusCount).toBeGreaterThan(2);
    const blocked = assertSignerCountNotFromCorpus(
      "decorative_signature_preview",
      corpusCount,
      twoPartyAuthorityArgs(),
    );
    expect(blocked).toBe(2);
  });

  it("consumeAuthoritativeSignerCount returns authority even when consumer count differs", () => {
    const count = consumeAuthoritativeSignerCount(
      "review_render_probe",
      twoPartyAuthorityArgs(),
      3,
    );
    expect(count).toBe(2);
  });

  it("signer setup UI party count stays at 2 for consulting intake", () => {
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 3,
        draftParties: [{ name: BLUE }, { name: HARBOR }, { name: "Decorative Fallback LLC" }],
        intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      }),
    ).toBe(2);
  });

  it("metadata authority parties slice to authoritative count", () => {
    const parties = buildPaidProSignerMetadataParties(
      {
        partyCount: 3,
        recipient1Name: BLUE,
        recipient2Name: HARBOR,
        recipient1Email: "sarah@bluecanyonanalytics.com",
        recipient2Email: "michael@harborpeakautomation.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Sarah", "Michael", "Ghost"],
        partySignerTitles: ["CEO", "President", ""],
        partyAddresses: ["", "", ""],
      },
      {
        intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
        draftPartyNames: [BLUE, HARBOR],
      },
    );
    expect(parties).toHaveLength(2);
  });

  it("canonical manifest generation stays at 4 for Test371", () => {
    const labeled = labeledPartyLegalEntities(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
      partySignerNames: [],
      recipient1Name: labeled[0] ?? "",
      recipient2Name: labeled[1] ?? "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      draftPartyNames: labeled,
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const count = resolveSignerCountFromManifest(manifest, {
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
      draftPartyNames: labeled,
    });
    expect(count).toBe(4);
    expect(manifest.parties).toHaveLength(4);
  });

  it("coordinator plus two legal parties excludes coordinator from signer count", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: COORDINATOR_TWO_PARTY_INTAKE,
      draftParties: [{ name: BLUE }, { name: HARBOR }],
    });
    expect(resolution.count).toBe(2);
    expect(labeledPartyLegalEntities(COORDINATOR_TWO_PARTY_INTAKE)).toHaveLength(2);
  });

  it("identity-derived consumer count is capped by manifest authority", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      partySignerNames: ["Sarah", "Michael", "Extra"],
      recipient1Name: BLUE,
      recipient2Name: HARBOR,
      recipient1Email: "sarah@bluecanyonanalytics.com",
      recipient2Email: "michael@harborpeakautomation.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, HARBOR, "Decorative Fallback LLC"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const identities = manifestToCanonicalPartyIdentities(manifest);
    const count = resolveSignerCountFromIdentities(identities, {
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftPartyNames: [BLUE, HARBOR],
    });
    expect(count).toBe(2);
    const signerManifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    expect(signerManifest.entries).toHaveLength(2);
  });

  it("decorative PARTY 3 heading does not fail duplicate invariant but exceeds heading count", () => {
    const analysis = analyzePaidProExecutionBlockInvariant(TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK, {
      expectedParties: 2,
    });
    expect(analysis.partyHeadingCount).toBeGreaterThan(2);
    expect(analysis.ok).toBe(true);
    expect(analysis.violations).toHaveLength(0);
    expect(
      resolveAuthoritativeSignerCount({
        ...twoPartyAuthorityArgs(),
        corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
      }).count,
    ).toBe(2);
  });

  it("duplicate execution block fails invariant when expectedParties is authoritative 2", () => {
    const analysis = analyzePaidProExecutionBlockInvariant(DUPLICATE_EXECUTION_CORPUS, {
      expectedParties: 2,
    });
    expect(analysis.ok).toBe(false);
    expect(analysis.violations.some((v) => v.includes("duplicate"))).toBe(true);
  });

  it("duplicate execution block does not inflate authoritative signer count", () => {
    const resolution = resolveAuthoritativeSignerCount({
      ...twoPartyAuthorityArgs(),
      corpusPlain: DUPLICATE_EXECUTION_CORPUS,
    });
    expect(resolution.count).toBe(2);
    expect(inferCorpusDerivedSignerCount(DUPLICATE_EXECUTION_CORPUS)).toBeGreaterThan(2);
  });

  it("readonly html authority ignores stale third extracted party name", () => {
    const html = buildPremiumAgreementReadonlyHtml(TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK, {
      signatureSectionMode: "collaboration",
      partyNames: [BLUE, HARBOR, "Decorative Fallback LLC"],
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftPartyNames: [BLUE, HARBOR],
    });
    expect(html.length).toBeGreaterThan(0);
    expect(
      consumeAuthoritativeSignerCount(
        "premium_agreement_readonly_html",
        {
          intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
          draftPartyNames: [BLUE, HARBOR],
          corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
        },
        3,
      ),
    ).toBe(2);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
        draftPartyNames: [BLUE, HARBOR],
        corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
      }).source,
    ).toBe("labeled_parties");
  });

  it("readonly html authority matches party slot when stale third party name is extracted", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: "",
      draftPartyNames: [BLUE, HARBOR],
      corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
    });
    expect(resolution.count).toBe(2);
    expect(resolution.source).toBe("party_slot_count");

    const count = consumeAuthoritativeSignerCount(
      "premium_agreement_readonly_html",
      {
        intakeText: "",
        draftPartyNames: [BLUE, HARBOR],
        corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
      },
      3,
    );
    expect(count).toBe(2);
  });

  it("manifest row count is consumer-only and cannot override labeled party authority", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 3,
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      partySignerNames: ["Sarah", "Michael", "Ghost"],
      recipient1Name: BLUE,
      recipient2Name: HARBOR,
      recipient1Email: "sarah@bluecanyonanalytics.com",
      recipient2Email: "michael@harborpeakautomation.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, HARBOR, "Decorative Fallback LLC"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(manifest.parties).toHaveLength(2);
    const count = resolveSignerCountFromManifest(manifest, {
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftPartyNames: [BLUE, HARBOR],
    });
    expect(count).toBe(2);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
        draftPartyNames: [BLUE, HARBOR],
      }).source,
    ).toBe("labeled_parties");
  });

  it("dedupes identical resolve and consumer log signatures", () => {
    resetSignerCountAuthorityDiagnosticsForTests();
    let last = "";
    const setLast = (next: string) => {
      last = next;
    };
    const sig = JSON.stringify({ count: 4, source: "labeled_parties" });
    expect(shouldEmitDedupedLog(() => last, setLast, sig)).toBe(true);
    expect(shouldEmitDedupedLog(() => last, setLast, sig)).toBe(false);
    expect(
      shouldEmitDedupedLog(
        () => last,
        setLast,
        JSON.stringify({ count: 3, source: "labeled_parties" }),
      ),
    ).toBe(true);

    const cache = new Map<string, string>();
    const consumerSig = JSON.stringify({
      surface: "enforcePaidProSingleExecutionBlock",
      authoritativeCount: 4,
      consumerCount: 4,
      matched: true,
      source: "labeled_parties",
    });
    expect(
      shouldEmitDedupedSurfaceLog(cache, "enforcePaidProSingleExecutionBlock", consumerSig),
    ).toBe(true);
    expect(
      shouldEmitDedupedSurfaceLog(cache, "enforcePaidProSingleExecutionBlock", consumerSig),
    ).toBe(false);
    expect(
      shouldEmitDedupedSurfaceLog(
        cache,
        "enforcePaidProSingleExecutionBlock",
        JSON.stringify({
          surface: "enforcePaidProSingleExecutionBlock",
          authoritativeCount: 3,
          consumerCount: 4,
          matched: false,
          source: "labeled_parties",
        }),
      ),
    ).toBe(true);
  });
});
