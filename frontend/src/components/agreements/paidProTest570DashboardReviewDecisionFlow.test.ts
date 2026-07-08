/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolvePaidProInlineSignerSetupMounted,
  shouldArmPaidProFirstReviewSignerSetupLatch,
  shouldShowPaidProForcedFirstReviewTrackChooser,
} from "./signerSetupPartyIdentity";
import {
  parseAllStructuredPartyContactBlocks,
  splitAuthorizedSignerLabeledValue,
} from "./labeledPartyBlockParse";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";

/**
 * TEST570 — dashboard paid-create post-freeze must present the review decision (delivery track)
 * FIRST and only mount signer setup after the user chooses "Prepare signature links". Also, the
 * "Authorized signer: Name, Title, email" role-header shape must be parsed into clean name/title.
 */
describe("TEST570 dashboard paid-create review decision precedes signer setup", () => {
  const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  const baseLatchArgs = {
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
  } as const;

  it("review_ready delivery-track decision suppresses first-review signer setup auto-arm", () => {
    // Console evidence: review_ready + canChooseProDeliveryTrack:true + selectedTrack:null.
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        deliveryTrackDecisionActive: true,
      }),
    ).toBe(false);
  });

  it("still auto-arms first-review signer setup when no delivery decision is available", () => {
    // Legacy first-time behavior (TEST297) is preserved when the decision surface is not active.
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        deliveryTrackDecisionActive: false,
      }),
    ).toBe(true);
  });

  it("keeps the latch armed once the user explicitly chose Prepare signature links", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        deliveryTrackDecisionActive: true,
        alreadyLatched: true,
      }),
    ).toBe(true);
  });

  it("shows delivery track chooser at review_ready before signer metadata is finalized", () => {
    expect(
      shouldShowPaidProForcedFirstReviewTrackChooser({
        forcedFirstReviewActive: true,
        inlineSignerSetupMounted: false,
        signerDetailsReady: true,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
        deliveryTrackDecisionActive: true,
      }),
    ).toBe(true);
  });

  it("hides delivery track chooser once inline signer setup is mounted", () => {
    expect(
      shouldShowPaidProForcedFirstReviewTrackChooser({
        forcedFirstReviewActive: true,
        inlineSignerSetupMounted: true,
        signerDetailsReady: true,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
        deliveryTrackDecisionActive: true,
      }),
    ).toBe(false);
  });

  it("signer setup fields are absent until latched, then mount", () => {
    const mountArgs = {
      hasAcceptedPaidProAuthority: true,
      premiumPaidDocumentSurface: true,
      premiumRecipientUxActive: false,
      createUiStageIsDraft: true,
      signaturePreparationRequested: false,
    } as const;
    // On first review the latch is not armed → inline signer fields are absent.
    expect(resolvePaidProInlineSignerSetupMounted({ ...mountArgs, signerSetupLatched: false })).toBe(
      false,
    );
    // Choosing "Prepare signature links" arms the latch → inline signer fields mount.
    expect(resolvePaidProInlineSignerSetupMounted({ ...mountArgs, signerSetupLatched: true })).toBe(
      true,
    );
  });

  it("AgreementBuilderIntake routes the delivery-track decision ahead of signer setup", () => {
    expect(intakeSrc).toContain("firstReviewDeliveryTrackDecisionActive");
    expect(intakeSrc).toContain("deliveryTrackDecisionActive: firstReviewDeliveryTrackDecisionActive");
    // Prepare signature links mounts inline signer setup (arms the latch) rather than auto-finalizing.
    const prepareBlock = intakeSrc.slice(
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview"),
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview") + 1400,
    );
    expect(prepareBlock).toContain("setPaidProInlineSignerSetupLatched(true)");
    expect(prepareBlock).toContain("!paidProSignerMetadataFinalized");
  });
});

describe("TEST570 authorized-signer name/title parsing", () => {
  it("splits an Authorized signer: Name, Title, email value into clean fields", () => {
    const split = splitAuthorizedSignerLabeledValue(
      "Authorized signer: Emily Carter, Chief Executive Officer, emily.carter@redwoodbiologics.com",
      "",
    );
    expect(split.signerName).toBe("Emily Carter");
    expect(split.signerTitle).toBe("Chief Executive Officer");
    expect(split.signerEmail).toBe("emily.carter@redwoodbiologics.com");
  });

  it("splits a corpus-style value with a trailing comma and no email", () => {
    // Matches the live execution-block pollution: "Name: Authorized signer: Emily Carter, Chief Executive Officer,".
    const split = splitAuthorizedSignerLabeledValue(
      "Authorized signer: Emily Carter, Chief Executive Officer,",
      "",
    );
    expect(split.signerName).toBe("Emily Carter");
    expect(split.signerTitle).toBe("Chief Executive Officer");
  });

  it("never mangles a clean standalone signer name", () => {
    expect(splitAuthorizedSignerLabeledValue("Emily Carter", "")).toEqual({
      signerName: "Emily Carter",
      signerTitle: "",
      signerEmail: "",
    });
    expect(splitAuthorizedSignerLabeledValue("Emily Carter", "CEO")).toEqual({
      signerName: "Emily Carter",
      signerTitle: "CEO",
      signerEmail: "",
    });
  });

  it("parses labeled 'Authorized signer:' contact lines into clean name/title/email", () => {
    const intake = [
      "Redwood Biologics Inc",
      "Authorized signer: Emily Carter, Chief Executive Officer, emily.carter@redwoodbiologics.com",
      "",
      "Summit AI Consulting LLC",
      "Authorized signer: Daniel Brooks, Managing Partner, daniel.brooks@summitaiconsulting.com",
    ].join("\n");
    const blocks = parseAllStructuredPartyContactBlocks(intake);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.signerName).toBe("Emily Carter");
    expect(blocks[0]!.signerTitle).toBe("Chief Executive Officer");
    expect(blocks[0]!.signerEmail).toBe("emily.carter@redwoodbiologics.com");
    expect(blocks[1]!.signerName).toBe("Daniel Brooks");
    expect(blocks[1]!.signerTitle).toBe("Managing Partner");
    for (const block of blocks) {
      expect(block.signerName.toLowerCase()).not.toContain("authorized signer");
    }
  });

  it("seed cleans a polluted signer name from any upstream source (state/display only)", () => {
    // Simulate signer names hydrated with the label prefix (e.g. from the corpus execution block).
    const seeded = runPaidProSignerMetadataAuthoritySeed({
      stage: "test570_dashboard_post_freeze",
      legalEntities: ["Redwood Biologics Inc", "Summit AI Consulting LLC"],
      intakeText: "",
      authoritativePartyCount: 2,
      uiSignerNames: [
        "Authorized signer: Emily Carter, Chief Executive Officer,",
        "Authorized signer: Daniel Brooks, Managing Partner,",
      ],
      uiSignerTitles: ["", ""],
    });
    expect(seeded.names[0]).toBe("Emily Carter");
    expect(seeded.titles[0]).toBe("Chief Executive Officer");
    expect(seeded.names[1]).toBe("Daniel Brooks");
    expect(seeded.titles[1]).toBe("Managing Partner");
    for (const name of seeded.names) {
      expect(name.toLowerCase()).not.toContain("authorized signer");
    }
  });
});
