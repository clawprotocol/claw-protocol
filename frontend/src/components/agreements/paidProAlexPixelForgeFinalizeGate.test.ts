/**
 * Production retest (a1947802): filled Alex/PixelForge signer fields still failed with
 * "Signer details could not be applied" — prefer signing-ready hydrated corpus over a
 * non-ready post-finalize plain.
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  isPaidProSigningReadyHydratedCorpus,
  resolvePaidProPostFinalizeReviewPlain,
  resolvePaidProSignerFinalizeSigningReadyPlain,
} from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";

const ALEX = "Alex Rivera";
const PIXEL = "PixelForge Labs";
const INTAKE =
  "I need a simple services agreement between me (Alex Rivera, freelance product designer) and a small startup called PixelForge Labs.";

function buildServicesCorpus(): string {
  let body = [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${ALEX} ("Client") and ${PIXEL} ("Service Provider").`,
    "",
    "1. Services and Project Term",
    "Alex will design the mobile app UI for six weeks.",
    "",
    "2. Compensation and Payment",
    "Flat fee of $4,500, paid 50% up front and 50% on final delivery.",
    "",
    "6. Notices",
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
  ].join("\n");
  while (body.length < 10_000) {
    body +=
      "\n\nSupplemental commercial provision. Each Party shall maintain commercially reasonable records.";
  }
  return body;
}

function reset(): void {
  resetPaidProPipelineTestIsolation();
  clearConsumedPaidProSignerMetadataAuthority();
  clearAuthoritativeSigningSnapshot();
  clearPaidProSourceOfTruth();
  clearCurrentSessionProEntitlementMarkers();
  cleanup();
}

describe("Alex/PixelForge finalize gate (production retest a1947802)", () => {
  beforeEach(() => {
    reset();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });
  afterEach(reset);

  it("prefers signing-ready hydrated corpus over non-ready post-finalize plain", () => {
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: ALEX,
        recipient2Name: PIXEL,
        recipient1Email: "cryptocurated21+Alex@gmail.com",
        recipient2Email: "cryptocurated21+pixel@gmail.com",
        extraPartyReviewEmails: [],
        partySignerNames: [ALEX, "Pie Fess"],
        partySignerTitles: ["", "CEO"],
        partyAddresses: ["123 Sample St.", "893 First Ave."],
      },
      "live_ui",
      { intakeText: INTAKE, draftPartyNames: [ALEX, PIXEL] },
    );
    setConsumedPaidProSignerMetadataAuthority(authority);

    let readyBody = [
      "SERVICES AGREEMENT",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      `CLIENT: ${ALEX}`,
      "By: ____________________",
      `Name: ${ALEX}`,
      "Title: ____________________",
      `SERVICE PROVIDER: ${PIXEL}`,
      "By: ____________________",
      "Name: Pie Fess",
      "Title: CEO",
      "",
      "Notices",
      `If to ${ALEX}:`,
      "Email: cryptocurated21+Alex@gmail.com",
      "Address: 123 Sample St.",
      `If to ${PIXEL}:`,
      "Email: cryptocurated21+pixel@gmail.com",
      "Address: 893 First Ave.",
    ].join("\n");
    while (readyBody.length < 1600) {
      readyBody += "\nThe parties agree to cooperate in good faith.";
    }
    const staleWithPlaceholders = `${readyBody}\nEmail: provided during signer setup\nAddress: provided during signer setup`;
    expect(isPaidProSigningReadyHydratedCorpus(readyBody)).toBe(true);
    expect(isPaidProSigningReadyHydratedCorpus(staleWithPlaceholders)).toBe(false);

    // Legacy `a || b || c` would pick the non-ready post-finalize plain first.
    const legacyPick = (
      staleWithPlaceholders ||
      readyBody ||
      ""
    ).trim();
    expect(isPaidProSigningReadyHydratedCorpus(legacyPick)).toBe(false);

    const picked = resolvePaidProSignerFinalizeSigningReadyPlain({
      hydratedCorpus: readyBody,
      postFinalizePlain: staleWithPlaceholders,
      snapshotCorpus: staleWithPlaceholders,
    });
    expect(picked).toBe(readyBody);
    expect(isPaidProSigningReadyHydratedCorpus(picked)).toBe(true);
  });

  it("finalize snapshot path stays signing-ready for Pie Fess / blank optional title", () => {
    const frozen = buildServicesCorpus();
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      intakeText: INTAKE,
      reviewSessionId: "review-alex-pixelforge-finalize-gate",
      generationOutcome: "ok",
    });

    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: ALEX,
        recipient2Name: PIXEL,
        recipient1Email: "cryptocurated21+Alex@gmail.com",
        recipient2Email: "cryptocurated21+pixel@gmail.com",
        extraPartyReviewEmails: [],
        partySignerNames: [ALEX, "Pie Fess"],
        partySignerTitles: ["", "CEO"],
        partyAddresses: [
          "123 Sample St., Mainsville, LA 70123",
          "893 First Ave., Tuned, MS 91293",
        ],
      },
      "live_ui",
      { intakeText: INTAKE, draftPartyNames: [ALEX, PIXEL] },
    );
    setConsumedPaidProSignerMetadataAuthority(authority);

    const raw = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: frozen,
      immutableSourceOfTruthOnly: true,
    });
    expect(raw.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw.corpus,
      authority,
      intakeRaw: INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);
    expect(hydrated.corpus).not.toMatch(/provided during signer setup/i);
    expect(isPaidProSigningReadyHydratedCorpus(hydrated.corpus)).toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: INTAKE,
      draftPartyNames: [ALEX, PIXEL],
    });
    const signatureBlockModel = buildCanonicalSignerManifest({
      identities: hydrated.identities,
      signFirst: true,
    });
    const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties, []);

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata,
      partyManifest,
      signatureBlockModel,
      intakeText: INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: raw.source === "paid_pro_source_of_truth",
      agreementId: "ag-alex-pixelforge-finalize-gate",
      persistFrozenToBackend: false,
    });

    const signingReadyPlain = resolvePaidProSignerFinalizeSigningReadyPlain({
      hydratedCorpus: hydrated.corpus,
      postFinalizePlain: resolvePaidProPostFinalizeReviewPlain(),
      snapshotCorpus: getAuthoritativeSigningSnapshot()?.corpus,
    });

    expect(signingReadyPlain).not.toMatch(/provided during signer setup/i);
    expect(signingReadyPlain).toMatch(/Name:\s*Pie Fess/i);
    expect(isPaidProSigningReadyHydratedCorpus(signingReadyPlain)).toBe(true);
  });
});
