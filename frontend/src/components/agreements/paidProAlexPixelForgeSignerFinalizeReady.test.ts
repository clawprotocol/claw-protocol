/**
 * Genesis Dog retest regression — Alex Rivera / PixelForge Labs sole-prop create.
 * Signer finalize must hydrate notice placeholders and pass signing-ready even when
 * optional Title fields are blank.
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { resolveAuthorityPartyLegalNameField } from "./intakeSignerMetadataAuthority";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import { resolveCommercialPartyRecordsForOpeningRepair } from "./canonicalPartyIdentityResolver";
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isPaidProSigningReadyHydratedCorpus } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
  readPaidProHandoffReadGateStateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";

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

function mountSignerInput(field: string, value: string): void {
  const root = document.createElement("div");
  root.setAttribute("data-claw-recipient-setup", "1");
  const input = document.createElement("input");
  input.setAttribute("data-claw-recipient-field", field);
  input.value = value;
  Object.defineProperty(input, "getBoundingClientRect", {
    value: () => ({ width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 }),
  });
  root.appendChild(input);
  document.body.appendChild(root);
}

function reset(): void {
  resetPaidProPipelineTestIsolation();
  clearConsumedPaidProSignerMetadataAuthority();
  resetPaidProPremiumRecipientHandoffReadGateForTests();
  cleanup();
  document.body.innerHTML = "";
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

  it("keeps SERVICES AGREEMENT title for sole-prop/brand opening when corpus starts at §1", () => {
    const untitled = [
      "1. Services and Project Term",
      "Alex will design the mobile app UI for six weeks.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `CLIENT: ${ALEX}`,
      "By: ____________________",
      "Name: ____________________",
      `SERVICE PROVIDER: ${PIXEL}`,
      "By: ____________________",
      "Name: ____________________",
    ].join("\n");
    const records = resolveCommercialPartyRecordsForOpeningRepair(INTAKE, [ALEX, PIXEL]);
    expect(records).toHaveLength(2);
    expect(records[0]?.fullLegalName).toBe(ALEX);
    expect(records[1]?.fullLegalName).toBe(PIXEL);
    const repaired = ensurePaidProServicesAgreementOpening(untitled, records, INTAKE);
    expect(repaired.text).toMatch(/^SERVICES AGREEMENT/m);
    expect(repaired.text).toMatch(/entered into as of the Effective Date/i);
    expect(repaired.text).toContain(ALEX);
    expect(repaired.text).toContain(PIXEL);
  });

  it("entity-only intake handoff does not latch empty signer merge that blocks live UI", () => {
    const entityOnly: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: ALEX,
        email: "",
        role: "client",
        signerName: "",
        signerTitle: "",
        partyAddress: "135 Main St., Mainville, TX 71235",
      },
      party2: {
        name: PIXEL,
        email: "",
        role: "service provider",
        signerName: "",
        signerTitle: "",
        partyAddress: "843 First Avenue, Bensty, PA 11234",
      },
      savedAt: Date.now(),
    };
    applyPremiumRecipientHandoffReadGate(entityOnly, { partySlotCount: 2 });
    expect(readPaidProHandoffReadGateStateForTests().sessionEverHadPopulatedHandoff).toBe(false);
    expect(readPaidProHandoffReadGateStateForTests().lastPopulatedSignerSlotCount).toBe(0);

    const emptyRead: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: { name: ALEX, email: "", role: "client", signerName: "", signerTitle: "" },
      party2: { name: PIXEL, email: "", role: "provider", signerName: "", signerTitle: "" },
      savedAt: Date.now(),
    };
    const gated = applyPremiumRecipientHandoffReadGate(emptyRead, { partySlotCount: 2 });
    // Must not pretend a prior signer-populated handoff existed.
    expect(gated?.party1.signerName || "").toBe("");
    expect(readPaidProHandoffReadGateStateForTests().sessionEverHadPopulatedHandoff).toBe(false);
  });

  it("DOM remount empty fields do not wipe filled React UI before finalize hydrate", () => {
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    const frozen = buildPreSignerCorpus();
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      intakeText: INTAKE,
      reviewSessionId: "review-alex-pixelforge-dom-race",
      generationOutcome: "ok",
    });

    mountSignerInput("r1-signer-name", "");
    mountSignerInput("r2-signer-name", "");
    mountSignerInput("r1-email", "");
    mountSignerInput("r2-email", "");
    mountSignerInput("r2-signer-title", "");

    const ui = {
      partyCount: 2,
      recipient1Name: ALEX,
      recipient2Name: PIXEL,
      recipient1Email: "cryptocurated21+Alex@gmail.com",
      recipient2Email: "cryptocurated21+Pixel@gmail.com",
      extraPartyReviewEmails: [] as string[],
      partySignerNames: [ALEX, "Pie Landman"],
      partySignerTitles: ["", "CEO"],
      partyAddresses: [
        "135 Main St., Mainville, TX 71235",
        "843 First Avenue, Bensty, PA 11234",
      ],
    };
    const authority = buildPaidProSignerMetadataAuthorityForFinalize(ui, {
      intakeText: INTAKE,
      draftPartyNames: [ALEX, PIXEL],
    });
    expect(authority.parties[0]?.signerName).toBe(ALEX);
    expect(authority.parties[1]?.signerName).toBe("Pie Landman");
    expect(authority.parties[1]?.signerTitle).toBe("CEO");
    expect(authority.parties[0]?.signerEmail).toMatch(/Alex@gmail/i);
    expect(authority.parties[1]?.signerEmail).toMatch(/Pixel@gmail/i);

    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: frozen,
      authority,
      intakeRaw: INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);
    expect(hydrated.corpus).not.toMatch(/provided during signer setup/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Pie Landman/i);
    expect(hydrated.corpus).toMatch(/Title:\s*CEO/i);
    expect(isPaidProSigningReadyHydratedCorpus(hydrated.corpus)).toBe(true);
  });
});
