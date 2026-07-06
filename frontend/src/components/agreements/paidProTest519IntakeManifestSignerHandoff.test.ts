/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import { extractIntakePartyManifestRows, overlayIntakeManifestOnReviewParties } from "./intakePartyManifestAuthority";
import {
  partyLegalNamesMatch,
  clearConsumedPaidProSignerMetadataAuthority,
  hashPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { commitPaidProPipelineValidationAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  resolvePaidProIntakeLegalEntityAddressPrefillComplete,
  resolveSignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import { markPaidDashboardCreateContextForTests } from "../../launch/paidDashboardCreateContext";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";
import { DASHBOARD_PAID_CREATE_ROUTE_SOURCE } from "./dashboardPaidCreateRoute";
import {
  buildTest518ConciseServerBody,
  buildTest518WrongCorpusPartyOrderBody,
  test518Draft,
} from "./paidProTest518Fixtures";
import {
  TEST519_BLUE_HARBOR,
  TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE,
  TEST519_IRON_GATE,
  TEST519_PARTY_ADDRESSES,
  TEST519_REDWOOD,
  TEST519_SUMMIT,
} from "./paidProTest519Fixtures";

describe("TEST519 — colon-role intake manifest signer handoff after freeze", () => {
  const storage = new Map<string, string>();
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    resetCanonicalPartyMetadataDiagnosticsForTests();
    resetPaidProPremiumRecipientHandoffReadGateForTests();
    resetPaidProPipelineTestIsolation();
    clearConsumedPaidProSignerMetadataAuthority();
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    markCurrentSessionProEntitlementComplete();
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    storage.clear();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPremiumRecipientHandoffDedupForTests();
    resetPaidProPremiumRecipientHandoffReadGateForTests();
    consoleInfoSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("parses four colon-role manifest rows with addresses from TEST519 intake", () => {
    const rows = extractIntakePartyManifestRows(TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.roleLabel).toBe("Client");
    expect(partyLegalNamesMatch(rows[0]?.partyLegalName ?? "", TEST519_REDWOOD)).toBe(true);
    expect(rows[0]?.partyAddress).toContain("Raleigh");
    expect(rows[3]?.roleLabel).toBe("Cybersecurity Auditor");
    expect(partyLegalNamesMatch(rows[3]?.partyLegalName ?? "", TEST519_IRON_GATE)).toBe(true);
    expect(rows[3]?.partyAddress).toContain("McLean");
  });

  it("after-freeze handoff and canonical metadata prefer intake manifest over wrong corpus order", () => {
    const intake = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;
    const wrongReviewParties = [
      { partyIndex: 0, partyLegalName: TEST519_SUMMIT, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 1, partyLegalName: TEST519_BLUE_HARBOR, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 2, partyLegalName: TEST519_IRON_GATE, signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
      { partyIndex: 3, partyLegalName: "Scope Inc.", signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" },
    ];
    const handoffParties = overlayIntakeManifestOnReviewParties(intake, wrongReviewParties);
    expect(partyLegalNamesMatch(handoffParties[0]?.partyLegalName ?? "", TEST519_REDWOOD)).toBe(true);
    expect(handoffParties[3]?.partyLegalName).not.toMatch(/Scope/i);
    expect(handoffParties.map((p) => p.partyAddress)).toEqual([...TEST519_PARTY_ADDRESSES]);

    commitPaidProPipelineValidationAcceptance({
      text: padOperativeCorpusBeforeWitness(buildTest518ConciseServerBody(), SUBSTANTIVE_SERVER_DRAFT_MIN_LEN),
      source: "server_full_draft",
    });

    establishCanonicalPartyMetadataAtStage({
      stage: "after-freeze",
      legalEntities: handoffParties.map((p) => p.partyLegalName),
      intakeText: intake,
      uiParties: handoffParties,
      mutationSource: "structured_intake",
      project: false,
    });

    setConsumedPaidProSignerMetadataAuthority({
      parties: [...handoffParties],
      source: "server_full_draft",
      hash: hashPaidProSignerMetadataAuthority(handoffParties),
      updatedAt: Date.now(),
    });
    writePremiumRecipientHandoffFromAuthorityParties(handoffParties);

    const canonical = readCanonicalPartyMetadata();
    expect(canonical?.parties).toHaveLength(4);
    const counts = computeCanonicalPartyMetadataFieldCounts(canonical);
    expect(counts.entityCount).toBe(4);
    expect(counts.addressCount).toBe(4);
    expect(partyLegalNamesMatch(canonical?.parties[0]?.partyLegalName ?? "", TEST519_REDWOOD)).toBe(true);
    expect(partyLegalNamesMatch(canonical?.parties[3]?.partyLegalName ?? "", TEST519_IRON_GATE)).toBe(true);

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    expect(partyLegalNamesMatch(slots[0]?.name ?? "", TEST519_REDWOOD)).toBe(true);
    expect(partyLegalNamesMatch(slots[1]?.name ?? "", TEST519_SUMMIT)).toBe(true);
    expect(partyLegalNamesMatch(slots[2]?.name ?? "", TEST519_BLUE_HARBOR)).toBe(true);
    expect(partyLegalNamesMatch(slots[3]?.name ?? "", TEST519_IRON_GATE)).toBe(true);
    expect(slots.map((s) => s.partyAddress)).toEqual([...TEST519_PARTY_ADDRESSES]);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(0);

    const gated = applyPremiumRecipientHandoffReadGate(handoff, { partySlotCount: 4 });
    const gatedSlots = linearPremiumRecipientSlots(gated, 4);
    expect(gatedSlots.filter((s) => s.name?.trim()).length).toBe(4);
    expect(gatedSlots.filter((s) => (s.partyAddress ?? "").trim().length >= 8).length).toBe(4);

    const emptyReadLogs = consoleInfoSpy.mock.calls.filter(
      (call) =>
        call[0] === "[signer-metadata-effective]" &&
        (call[1] as { source?: string })?.source === "handoff_read_empty",
    );
    expect(emptyReadLogs).toHaveLength(0);
  });

  it("signer setup identity and intakePrefillComplete use intake manifest with blank signer names", () => {
    const intake = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;
    const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
      intakeText: intake,
      draft: test518Draft(),
    });
    expect(legalEntities).toHaveLength(4);
    expect(partyLegalNamesMatch(legalEntities[0] ?? "", TEST519_REDWOOD)).toBe(true);

    for (let i = 0; i < 4; i += 1) {
      const identity = resolveSignerSetupPartyIdentity({
        partyIndex: i,
        intakeText: intake,
        agreementBodyText: buildTest518WrongCorpusPartyOrderBody(),
        log: false,
      });
      expect(identity.source).toBe("intake_manifest");
      expect(partyLegalNamesMatch(identity.legalEntityName, legalEntities[i] ?? "")).toBe(true);
    }

    const prefillComplete = resolvePaidProIntakeLegalEntityAddressPrefillComplete({
      intakeText: intake,
      partyCount: 4,
      recipient1Name: legalEntities[0]!,
      recipient2Name: legalEntities[1]!,
      extraPartyLegalNames: legalEntities.slice(2),
      partyAddresses: [...TEST519_PARTY_ADDRESSES],
    });
    expect(prefillComplete).toBe(true);
  });
});
