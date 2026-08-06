/**
 * Genesis Dog retest regression — Alex Rivera / PixelForge Labs sole-prop create.
 * Signer finalize must hydrate notice placeholders and pass signing-ready even when
 * optional Title fields are blank.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { resolveAuthorityPartyLegalNameField } from "./intakeSignerMetadataAuthority";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isPaidProSigningReadyHydratedCorpus } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";

const ALEX = "Alex Rivera";
const PIXEL = "PixelForge Labs";
const INTAKE =
  "I need a simple services agreement between me (Alex Rivera, freelance product designer) and a small startup called PixelForge Labs.";

function padCorpus(body: string): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(40);
  return `${body.trim()}\n\n${pad}`;
}

function buildPreSignerCorpus(): string {
  return padCorpus(
    [
      "INDEPENDENT CONTRACTOR AGREEMENT",
      "",
      `This Independent Contractor Agreement (the "Agreement") is between ${ALEX} and ${PIXEL}.`,
      "",
      "1. Project and Services",
      "Alex will design the mobile app UI for six weeks.",
      "",
      "2. Compensation and Payment",
      "Flat fee of $4,500, paid 50% up front and 50% on final delivery.",
      "",
      "NOTICES",
      "Notices must be in writing.",
      `If to ${ALEX}:`,
      "Email: provided during signer setup",
      "Address: provided during signer setup",
      `If to ${PIXEL}:`,
      "Email: provided during signer setup",
      "Address: provided during signer setup",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `CLIENT: ${ALEX}`,
      "By: ____________________",
      "Name: ____________________",
      "Title: ____________________",
      "Date: ____________________",
      "",
      `SERVICE PROVIDER: ${PIXEL}`,
      "By: ____________________",
      "Name: ____________________",
      "Title: ____________________",
      "Date: ____________________",
    ].join("\n"),
  );
}

function buildAlexPixelAuthority() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 2,
      recipient1Name: ALEX,
      recipient2Name: PIXEL,
      recipient1Email: "cryptocurated21+Alex@gmail.com",
      recipient2Email: "cryptocurated21+Pixel@gmail.com",
      extraPartyReviewEmails: [],
      partySignerNames: [ALEX, "Pixel Gin"],
      partySignerTitles: ["", "CEO"],
      partyAddresses: [
        "123 Main Street, Landville, AL 71234",
        "234 Candy Avenue, Electric, CA 91234",
      ],
    },
    "live_ui",
    {
      intakeText: INTAKE,
      draftPartyNames: [ALEX, PIXEL],
    },
  );
}

function reset(): void {
  resetPaidProPipelineTestIsolation();
  clearConsumedPaidProSignerMetadataAuthority();
}

describe("Alex/PixelForge signer finalize signing-ready", () => {
  beforeEach(reset);
  afterEach(reset);

  it("preserves sole-prop and brand party legal names in authority", () => {
    expect(resolveAuthorityPartyLegalNameField(ALEX, "")).toBe(ALEX);
    expect(resolveAuthorityPartyLegalNameField(PIXEL, "")).toBe(PIXEL);

    const authority = buildAlexPixelAuthority();
    expect(authority.parties[0]?.partyLegalName).toBe(ALEX);
    expect(authority.parties[1]?.partyLegalName).toBe(PIXEL);
  });

  it("hydrates notice placeholders and passes signing-ready with optional blank titles", () => {
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    const frozen = buildPreSignerCorpus();
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      intakeText: INTAKE,
      reviewSessionId: "review-alex-pixelforge-signer-finalize",
      generationOutcome: "ok",
    });

    const authority = buildAlexPixelAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: frozen,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });

    expect(hydrated.rejected).not.toBe(true);
    expect(hydrated.corpus).not.toMatch(/provided during signer setup/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Alex Rivera/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Pixel Gin/i);
    expect(hydrated.corpus).toMatch(/Title:\s*CEO/i);
    expect(isPaidProSigningReadyHydratedCorpus(hydrated.corpus)).toBe(true);
  });
});
