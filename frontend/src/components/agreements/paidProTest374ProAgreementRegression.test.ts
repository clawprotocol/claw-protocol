import { describe, expect, it } from "vitest";
import { shouldApplyAiWorkflowServicesQualityFloor } from "./paidProAiWorkflowScopeGuard";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { repairProtectedLegalEntitySuffixes } from "./paidProProtectedEntityRepair";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { normalizePaidProSectionRender } from "./paidProSectionRenderNormalize";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { preserveFullLegalPartyNames } from "./paidProPartyNamePreserve";
import {
  shouldArmPaidProFirstReviewSignerSetupLatch,
  shouldShowPaidProForcedFirstReviewTrackChooser,
} from "./signerSetupPartyIdentity";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { TEST372_FREE_STACKED_PARTY_INTAKE } from "./paidProTest372FreeStarterIdentityRegression.test";

const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";

function test374Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: HARBOR,
    recipient1Email: "sarah@bluecanyonanalytics.com",
    recipient2Email: "michael@harborpeakautomation.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["", ""],
  }).parties;
}

describe("Test374 Pro agreement professional-grade regression", () => {
  it("does not apply AI workflow quality floor for simple consulting intake", () => {
    expect(shouldApplyAiWorkflowServicesQualityFloor(TEST372_FREE_STACKED_PARTY_INTAKE)).toBe(false);
    const corpus = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      `This Agreement is between ${BLUE} and ${HARBOR}.`,
      "",
      "1. Services. Consulting services as described.",
    ].join("\n");
    const out = applyAiWorkflowServicesQualityFloorToFallback(corpus, null, TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(out).not.toMatch(/ACCEPTANCE AND DEMONSTRATION REVIEW/i);
    expect(out).not.toMatch(/configured AI workflow setup/i);
  });

  it("restores ClearSpring LLC in the opening even when notices still have the full name", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const body = [
      `This Agreement is entered into by and among ${stone} ("Content Owner / Licensor"), ${nova} ("Platform Adapter / Host"), and ClearSpring Distribution ("Distributor").`,
      `${stone}'s authorized signer is Sandra Wells. ${nova}'s authorized signer is Caleb Price. ClearSpring Distribution 's authorized signer is Maya Coleman.`,
      `${clear} will market and sell subscriptions.`,
      `Subscription revenue is split 20% to ClearSpring Distribution .`,
      `If to ${clear}:`,
      clear,
      "IN WITNESS WHEREOF",
      clear,
    ].join("\n");
    const { text, repairs } = repairProtectedLegalEntitySuffixes(body, [stone, nova, clear], body);
    expect(repairs).toBeGreaterThan(0);
    expect(text).toContain(`${clear} ("Distributor")`);
    expect(text).toContain(`${clear}'s authorized signer is Maya Coleman`);
    expect(text).toContain(`20% to ${clear}.`);
    expect(text).not.toMatch(/ClearSpring Distribution \("Distributor"\)/);
    expect(text).not.toMatch(/ClearSpring Distribution 's authorized signer/);
    expect(text).not.toMatch(/20% to ClearSpring Distribution \./);
  });

  it("restores Coastal Meridian Analytics LLC in unquoted role appositives", () => {
    const lumen = "Lumen Bioinformatics Inc.";
    const thalassa = "Thalassa Data Systems LLC";
    const coastal = "Coastal Meridian Analytics LLC";
    const vanguard = "Vanguard Regulatory Sciences Ltd.";
    const body = [
      `The parties are ${lumen} (Platform Developer), ${thalassa} (Data Infrastructure Provider), Coastal Meridian Analytics (Analytics Integrator), and ${vanguard} (Regulatory Compliance Advisor).`,
      `Coastal Meridian Analytics delivers analytics modules.`,
      `If to ${coastal}:`,
      coastal,
      "IN WITNESS WHEREOF",
      coastal,
    ].join("\n");
    const { text, repairs } = repairProtectedLegalEntitySuffixes(
      body,
      [lumen, thalassa, coastal, vanguard],
      body,
    );
    expect(repairs).toBeGreaterThan(0);
    expect(text).toContain(`${coastal} (Analytics Integrator)`);
    expect(text).toContain(`${coastal} delivers`);
    expect(text).not.toMatch(/Coastal Meridian Analytics \(Analytics Integrator\)/);
  });

  it("does not double an already-suffixed Ironvale Inc. on the signed view", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const body = `This Services Agreement is entered into by and between ${harbor} ("Service Provider") and ${ironvale} ("Client").`;
    const { text } = repairProtectedLegalEntitySuffixes(body, [harbor, ironvale], body);
    expect(text).toContain(`${ironvale} ("Client")`);
    expect(text).not.toMatch(/Ironvale Manufacturing Inc\. Inc\./);
    const doubledParty = repairProtectedLegalEntitySuffixes(
      body,
      [harbor, "Ironvale Manufacturing Inc. Inc."],
      body,
    ).text;
    expect(doubledParty).toContain(`${ironvale} ("Client")`);
    expect(doubledParty).not.toMatch(/Ironvale Manufacturing Inc\. Inc\./);
  });

  it("repairs truncated legal entity suffix in recital", () => {
    const body = `This Agreement is between ${BLUE} ("Client") and Harbor Peak Automation ("Service Provider").`;
    const { text } = repairProtectedLegalEntitySuffixes(body, [BLUE, HARBOR], TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(text).toContain(HARBOR);
    expect(text).not.toMatch(/Harbor Peak Automation \("Service Provider"\)/);
    expect(text).toMatch(/Harbor Peak Automation LLC \("Service Provider"\)/);
  });

  it("keeps Harbor Peak Automation LLC across recital after full-name preserve", () => {
    const body = [
      `This Agreement is between ${BLUE} ("Client") and Harbor Peak Automation ("Service Provider").`,
      "",
      "13. Notices",
      "If to",
    ].join("\n");
    const preserved = preserveFullLegalPartyNames(body, [BLUE, HARBOR], TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(preserved).toContain(HARBOR);
  });

  it("repairs dangling If to and rebuilds complete notice stanzas", () => {
    const body = [
      "13. Notices",
      "Any notice under this Agreement must be in writing.",
      "",
      "If to",
    ].join("\n");
    const { text, repairs } = repairIncompleteIfToNoticeStanzas(body, test374Parties());
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/If to\s*$/m);
    expect(text).toContain(`If to ${BLUE}:`);
    expect(text).toContain(`If to ${HARBOR}:`);
    expect(text).toContain("Attn: Sarah Mitchell, CEO");
    expect(text).toContain("Attn: Michael Torres, President");
    expect(text).toContain("sarah@bluecanyonanalytics.com");
    expect(text).toContain("michael@harborpeakautomation.com");
    const blueEntityLines = text
      .split("\n")
      .filter((line) => line.trim() === BLUE);
    expect(blueEntityLines.length).toBeLessThanOrEqual(2);
  });

  it("splits glued Pro section headings from body text", () => {
    const glued = "1. Services and Engagement Consultant will provide strategic consulting services.";
    const { text, fixedHeadingBodyCollapse } = normalizePaidProSectionRender(glued);
    expect(fixedHeadingBodyCollapse).toBeGreaterThan(0);
    expect(text).toContain("1. Services and Engagement");
    expect(text).toContain("Consultant will provide");
    expect(text).not.toMatch(/Services and Engagement Consultant/);
  });

  it("preparePaidProReviewDisplayPlain separates heading and body", () => {
    const raw = [
      "1. Services and Engagement Consultant will provide services.",
      "",
      "8. Independent Contractor Consultant is not an employee.",
    ].join("\n");
    const { text } = preparePaidProReviewDisplayPlain(raw);
    expect(text).toMatch(/1\. Services and Engagement\n\nConsultant will/);
    expect(text).toMatch(/8\. Independent Contractor\n\nConsultant is/);
  });

  it("imported signer metadata prefills but requires confirmation before track chooser", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        firstReviewSurfaceActive: true,
        hasCanonicalReviewCorpus: true,
        paidProSignatureDetailsReady: true,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
        alreadyLatched: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidProForcedFirstReviewTrackChooser({
        forcedFirstReviewActive: true,
        inlineSignerSetupMounted: false,
        signerDetailsReady: true,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
  });
});
