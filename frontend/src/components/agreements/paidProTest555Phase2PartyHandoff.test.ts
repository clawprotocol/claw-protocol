/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { establishLegalPartyAuthorityFromIntake } from "./legalPartyAuthority";
import { clearLegalPartyAuthoritySessionForTests } from "./legalPartyAuthoritySession";
import {
  clearStarterToPaidPartyHandoffForTests,
  readStarterToPaidPartyHandoff,
  writeStarterToPaidPartyHandoff,
} from "./starterToPaidPartyHandoff";
import {
  attachSignerToParty,
  clearSignerExecutionAuthorityForTests,
  readSignerRecordCount,
} from "./signerExecutionAuthority";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { readLegalPartyCountFromAuthority } from "./legalPartyAuthority";
import { resolveLegalPartyAuthorityForIntake } from "./legalPartyAuthoritySession";

function emptyDraft() {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  };
}

function runStarter(intake: string) {
  clearLegalPartyAuthoritySessionForTests();
  clearStarterToPaidPartyHandoffForTests();
  const draft = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
  const authority = resolveLegalPartyAuthorityForIntake(intake);
  return { draft, authority };
}

function upgrade(intake: string) {
  const { authority } = runStarter(intake);
  const handoff = writeStarterToPaidPartyHandoff(intake, authority);
  return { authority, handoff };
}

describe("paidProTest555 Phase 2 party-id handoff and signer association", () => {
  afterEach(() => {
    clearLegalPartyAuthoritySessionForTests();
    clearStarterToPaidPartyHandoffForTests();
    clearSignerExecutionAuthorityForTests();
  });

  it("Case 1 — two-party Cedar Ridge/Northwind handoff preserves IDs and roles", () => {
    const { authority, handoff } = upgrade(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(handoff.partyCount).toBe(2);
    expect(handoff.parties.map((p) => p.legalEntityName)).toEqual([TEST550_CEDAR, TEST550_NORTHWIND]);
    expect(handoff.parties[0].agreementPartyId).toBe(authority.parties[0].agreementPartyId);
    expect(handoff.parties.every((p) => !("signerEmail" in p))).toBe(true);
  });

  it("Case 2 — three-party handoff survives upgrade", () => {
    const intake =
      "Agreement between Alpha Strategy LLC, Beacon Systems Inc., and Copper Ridge Analytics LLC.";
    const { handoff } = upgrade(intake);
    expect(handoff.partyCount).toBe(3);
    expect(new Set(handoff.parties.map((p) => p.agreementPartyId)).size).toBe(3);
  });

  it("Case 3 — four-party handoff preserves canonical order", () => {
    const intake =
      "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.";
    const { handoff } = upgrade(intake);
    expect(handoff.partyCount).toBe(4);
    expect(handoff.parties.map((p) => p.canonicalOrder)).toEqual([0, 1, 2, 3]);
  });

  it("Case 4 — signer attachment by party ID does not replace entity names", () => {
    const { handoff } = upgrade(TEST550_CEDAR_NORTHWIND_INTAKE);
    attachSignerToParty({
      agreementPartyId: handoff.parties[0].agreementPartyId,
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      intakeText: TEST550_CEDAR_NORTHWIND_INTAKE,
    });
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: handoff.partyCount,
      draftPartyNames: handoff.parties.map((p) => p.legalEntityName),
      intakeText: TEST550_CEDAR_NORTHWIND_INTAKE,
      recipient1Name: TEST550_CEDAR,
      recipient2Name: TEST550_NORTHWIND,
      recipient1Email: "sarah@example.com",
      recipient2Email: "contact@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Sarah Mitchell", "Pat Provider"],
      partySignerTitles: ["CEO", "Manager"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(manifest.parties[0].partyName).toBe(TEST550_CEDAR);
    expect(manifest.parties[0].signerName).toBe("Sarah Mitchell");
  });

  it("Case 5 — four legal parties, two signers: counts separate", () => {
    const intake =
      "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.";
    const { handoff } = upgrade(intake);
    attachSignerToParty({
      agreementPartyId: handoff.parties[0].agreementPartyId,
      signerName: "A Signer",
      intakeText: intake,
    });
    attachSignerToParty({
      agreementPartyId: handoff.parties[2].agreementPartyId,
      signerName: "C Signer",
      intakeText: intake,
    });
    expect(handoff.partyCount).toBe(4);
    expect(readSignerRecordCount(intake)).toBe(2);
  });

  it("Case 13 — sequential agreement isolation", () => {
    const four =
      "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.";
    const first = writeStarterToPaidPartyHandoff(
      four,
      establishLegalPartyAuthorityFromIntake(four),
    );
    bumpAgreementGenerationId();
    clearLegalPartyAuthoritySessionForTests();
    clearStarterToPaidPartyHandoffForTests();
    clearSignerExecutionAuthorityForTests();
    const second = upgrade(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(first.partyCount).toBe(4);
    expect(second.handoff.partyCount).toBe(2);
    expect(readStarterToPaidPartyHandoff(four)).toBeNull();
  });

  it("Case 14 — stale handoff fingerprint rejected", () => {
    const intake = TEST550_CEDAR_NORTHWIND_INTAKE;
    writeStarterToPaidPartyHandoff(intake, establishLegalPartyAuthorityFromIntake(intake));
    expect(readStarterToPaidPartyHandoff("different intake text entirely")).toBeNull();
  });

  it("Case 18 — Phase 1 TEST554 non-regression", async () => {
    const mod = await import("./paidProTest554Phase1LegalPartyAuthority.test");
    expect(mod).toBeTruthy();
    const intake =
      "Services agreement between Acme LLC, Beta Inc, Gamma Studios, and Delta Holdings.";
    const authority = establishLegalPartyAuthorityFromIntake(intake);
    expect(readLegalPartyCountFromAuthority(authority.parties)).toBe(4);
    expect(assessStarterComplexityGate(intake).reasons).toContain("three_plus_legal_parties");
  });

  it("Case 19 — no paid SoT from Starter handoff alone", () => {
    upgrade(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });
});
