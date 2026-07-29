/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearFrozenCanonicalAgreementCorpus,
  logAuthoritativeCorpusInvariant,
  readCanonicalAgreementCorpusForSurface,
} from "./canonicalAgreementSnapshot";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { hasFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  buildPremiumAgreementReadonlyHtml,
  stripCorpusSignatureRegionForExternalSignerUi,
} from "./premiumAgreementDocumentHtml";

describe("Pro delivery track UI wiring", () => {
  it("AgreementBuilderIntake exposes canonical decision chrome on Pro review-ready state", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const shell = readFileSync(join(__dirname, "../../launch/simpleProduct/simpleCreatePaidProReviewShell.ts"), "utf8");
    expect(intake).toContain("PaidProForcedFirstReviewChrome");
    expect(intake).toContain("paid-pro-forced-prepare-signatures");
    expect(intake).toContain("shouldShowPaidProReviewDecisionChrome");
    expect(shell).toContain("Review your agreement draft");
    expect(shell).toContain("Nothing is sent or signed until you choose the next step.");
    expect(intake).toContain("logAgreementFlowStep");
    expect(intake).toContain("logProDeliveryTrackState");
    expect(intake).toContain("canChooseProDeliveryTrack");
    expect(intake).toContain("showProReviewTrackActions");
    expect(intake).toContain("suppressProDocumentEmbeddedSignatures");
  });

  it("review-first decision chrome does not leak signer setup fields before signatures are chosen", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const chromeBlock = intake.slice(
      intake.indexOf("PaidProForcedFirstReviewChrome"),
      intake.indexOf("PaidProForcedFirstReviewChrome") + 2400,
    );
    expect(chromeBlock).toContain("onPrepareSignatures");
    expect(chromeBlock).not.toContain("Signer name");
    expect(chromeBlock).not.toContain("Signer title");
    expect(chromeBlock).not.toContain("Party address");
    expect(chromeBlock).not.toContain("Add recipient emails");
  });

  it("signer setup legal entity inputs prefer canonical party names over display labels", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("signerSetupPartyIdentities");
    expect(intake).toContain("legalEntityFieldValue");
    expect(intake).toContain("resolveSignerSetupPartyIdentities");
    expect(intake).toContain("resolveSignerSetupRenderSlot");
    const fieldsStart = intake.indexOf("const recipientFields = (");
    const fieldsBlock = intake.slice(fieldsStart, fieldsStart + 7600);
    expect(fieldsBlock).toContain("canonicalLegalEntity");
    expect(fieldsBlock).toContain("value={legalEntityFieldValue}");
    expect(fieldsBlock).not.toContain("resolveEditableSignerLegalEntityForSlot");
    const identityModule = readFileSync(join(__dirname, "signerSetupPartyIdentity.ts"), "utf8");
    expect(identityModule).toContain("[signer-identity-source]");
    expect(identityModule).toContain("[illegal-signer-render-binding-blocked]");
    const chooserBlock = intake.slice(
      intake.indexOf("PaidProForcedFirstReviewChrome"),
      intake.indexOf("PaidProForcedFirstReviewChrome") + 2400,
    );
    expect(chooserBlock).not.toContain("Add signers / prepare signature links");
  });

  it("review mode does not request signer title or address, while signature prep does", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const fieldsStart = intake.indexOf("const recipientFields = (");
    const fieldsBlock = intake.slice(fieldsStart, fieldsStart + 12000);
    expect(fieldsBlock).toContain("Party address (optional)");
    expect(fieldsBlock).toContain("Signer title (optional)");
    expect(fieldsBlock).toContain("{signaturePrepMode ? (");
    const signatureOnlyBlock = fieldsBlock.slice(
      fieldsBlock.indexOf("{signaturePrepMode ? ("),
      fieldsBlock.indexOf("{signaturePrepMode ? (") + 2800,
    );
    expect(signatureOnlyBlock).toContain('Signer name{signaturePrepMode ? "" : " (optional)"}');
    expect(signatureOnlyBlock).toContain("Required before signature links are prepared.");
    expect(signatureOnlyBlock).toContain("Signer title (optional)");
    expect(signatureOnlyBlock).toContain("Party address (optional)");
  });

  it("selecting review track routes to review finalize action, not immediate VS01 signer setup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const reviewBlock = intake.slice(
      intake.indexOf('data-testid="pro-review-track-actions"'),
      intake.indexOf('data-testid="pro-review-track-actions"') + 900,
    );
    expect(reviewBlock).toContain('handleFinalizeRoutePrimaryAction("review")');
    expect(reviewBlock).not.toContain("enterGuidedSignatureTrackRoute");
    expect(reviewBlock).not.toContain("advancePaidProToRecipientSetup");
  });

  it("requires paid Pro signer details before exposing post-decision delivery tracks", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const trackBlock = intake.slice(
      intake.indexOf("const showSimplifiedProReviewSigningFlow = Boolean("),
      intake.indexOf("const showProReviewTrackActions = Boolean(") + 520,
    );
    expect(trackBlock).toContain("signerDetailsAreComplete");
    expect(trackBlock).toContain("signaturePreparationRequested");
    expect(trackBlock).not.toMatch(/signerDetailsAreComplete[\s\S]{0,80}prepareSignatureLinksRequested\s*=/);
    expect(intake).toContain("paidProSignerSetupRequiredBeforeDelivery");
    expect(intake).toContain("Add signer details before continuing.");
    expect(intake).toContain('data-testid="pro-review-add-signer-details"');
    expect(intake).toContain('enterFinalReviewRecipientSetup("signature")');
    expect(intake).not.toContain('enterFinalReviewRecipientSetup(mode === "review" ? "review_only" : "signature")');
  });

  it("canonical hash is unchanged when reading review vs handoff surfaces", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Texas",
      agreement_family: "services_agreement",
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      purpose: "AI workflow setup.",
      payment_terms: "$5,000",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: 5000, cadence: null, valid: true },
    };
    const body = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
      "",
      "1. Scope. Service Provider will deliver AI workflow setup.",
      "",
      "Commercial implementation details. ".repeat(120),
      "",
      "IN WITNESS WHEREOF, the parties execute this Agreement.",
      "",
      "CLIENT:",
      "Red Mesa Logistics LLC",
      "By: ______________________",
      "",
      "SERVICE PROVIDER:",
      "Harbor Peak Automation LLC",
      "By: ______________________",
    ].join("\n");
    const record = establishPaidProSourceOfTruth({
      text: body,
      draft,
      intakeText: "Services agreement.",
    });
    expect(hasFrozenCanonicalAgreementCorpus()).toBe(true);
    const handoff = pickAuthoritativePlainForSendHandoff(draft);
    const exported = readCanonicalAgreementCorpusForSurface("export", { required: true });
    expect(exported).toBeTruthy();
    const invariant = logAuthoritativeCorpusInvariant({
      reviewHash: record.hash,
      signerHash: record.hash,
      reviewerHash: exported?.hash,
      canonicalHash: record.hash,
    });
    expect(handoff?.text).toBe(record.text);
    expect(exported?.hash).toBe(record.hash);
    expect(invariant.invariantOk).toBe(true);
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("suppresses corrupted embedded signature blocks for external signer UI", () => {
    const plain = `
SERVICES AGREEMENT

1. Scope. Provider performs AI workflow setup.

IN WITNESS WHEREOF, the Parties execute.

Harbor Peak Automation LLC ("Service Provider") as of the
By: ____________________
`.trim();
    const stripped = stripCorpusSignatureRegionForExternalSignerUi(plain);
    expect(stripped).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(stripped).not.toMatch(/as of the/i);
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "execution",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(html).not.toMatch(/as of the/i);
    expect(html).not.toContain("claw-premium-signature-section");
  });
});
