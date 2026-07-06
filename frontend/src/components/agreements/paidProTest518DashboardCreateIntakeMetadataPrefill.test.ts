/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import {
  alignIntakeSignerMetadataToLegalEntities,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { extractIntakePartyManifestRows } from "./intakePartyManifestAuthority";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import { planCanonicalPaidProSignerHandoff } from "./enterCanonicalPaidProReviewFlow";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { commitPaidProPipelineValidationAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { markPaidDashboardCreateContextForTests } from "../../launch/paidDashboardCreateContext";
import { DASHBOARD_PAID_CREATE_ROUTE_SOURCE } from "./dashboardPaidCreateRoute";
import {
  TEST518_DASHBOARD_CREATE_INTAKE,
  TEST518_IRON_GATE,
  TEST518_LEGAL_ENTITIES,
  TEST518_PARTY_ADDRESSES,
  TEST518_PARTY_ROLES,
  TEST518_REDWOOD,
  TEST518_SUMMIT,
  buildTest518ConciseServerBody,
  buildTest518WrongCorpusPartyOrderBody,
  test518Draft,
} from "./paidProTest518Fixtures";

describe("TEST518 — dashboard_paid_create intake metadata prefill", () => {
  const storage = new Map<string, string>();

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
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
  });

  afterEach(() => {
    storage.clear();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    vi.unstubAllGlobals();
  });

  it("extracts four manifest rows with addresses and roles from TEST518 intake", () => {
    const rows = extractIntakePartyManifestRows(TEST518_DASHBOARD_CREATE_INTAKE);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.partyNumber).toBe(1);
    expect(rows[0]?.roleLabel).toBe("Client");
    expect(rows[0]?.partyAddress).toContain("Raleigh");
    expect(rows[3]?.partyNumber).toBe(4);
    expect(partyLegalNamesMatch(rows[3]?.partyLegalName ?? "", TEST518_IRON_GATE)).toBe(true);
  });

  it("prefers intake manifest entity order over wrong generated corpus", () => {
    const draft = test518Draft();
    const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      draft,
    });
    expect(legalEntities).toHaveLength(4);
    expect(partyLegalNamesMatch(legalEntities[0] ?? "", TEST518_REDWOOD)).toBe(true);
    expect(legalEntities[0]).not.toBe(TEST518_SUMMIT);
    expect(partyLegalNamesMatch(legalEntities[3] ?? "", TEST518_IRON_GATE)).toBe(true);
    expect(legalEntities[3]).not.toMatch(/Scope/i);

    const seedFromCorpus = runPaidProSignerMetadataAuthoritySeed({
      stage: "test518_corpus_contamination",
      legalEntities: ["Summit AI Consulting LLC", "Blue Harbor Systems LLC", "Iron Gate Security LLC", "Scope Inc."],
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      corpusText: buildTest518WrongCorpusPartyOrderBody(),
      draft,
      authoritativePartyCount: 4,
    });
    expect(seedFromCorpus.addresses.filter(Boolean)).toHaveLength(4);

    const seedFromIntake = runPaidProSignerMetadataAuthoritySeed({
      stage: "test518_intake_manifest",
      legalEntities,
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      corpusText: null,
      draft,
      authoritativePartyCount: 4,
    });
    expect(seedFromIntake.contactFieldsChanged).toBe(true);
    expect(seedFromIntake.addresses).toEqual([...TEST518_PARTY_ADDRESSES]);
  });

  it("canonical party metadata after freeze has entityCount 4 and addressCount 4", () => {
    const draft = test518Draft();
    const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      draft,
    });
    const corpus = buildTest518ConciseServerBody();
    commitPaidProPipelineValidationAcceptance({ text: corpus, source: "server_full_draft" });

    establishCanonicalPartyMetadataAtStage({
      stage: "after-freeze",
      legalEntities,
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      mutationSource: "structured_intake",
    });

    const bundle = readCanonicalPartyMetadata();
    expect(bundle?.parties).toHaveLength(4);
    const counts = computeCanonicalPartyMetadataFieldCounts(bundle);
    expect(counts.entityCount).toBe(4);
    expect(counts.addressCount).toBe(4);
    expect(partyLegalNamesMatch(bundle?.parties[0]?.partyLegalName ?? "", TEST518_REDWOOD)).toBe(true);
    expect(bundle?.parties[0]?.roleLabel).toBe("Client");
    expect(partyLegalNamesMatch(bundle?.parties[3]?.partyLegalName ?? "", TEST518_IRON_GATE)).toBe(true);
    expect(bundle?.parties.map((p) => p.partyAddress)).toEqual([...TEST518_PARTY_ADDRESSES]);
  });

  it("planCanonicalPaidProSignerHandoff hydrates intake manifest without recipient candidates", () => {
    const handoff = planCanonicalPaidProSignerHandoff({
      draft: test518Draft(),
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      corpusPlain: buildTest518ConciseServerBody(),
    });
    expect(handoff).toBeTruthy();
    expect(handoff!.partyLegalNames).toHaveLength(4);
    expect(partyLegalNamesMatch(handoff!.partyLegalNames[0] ?? "", TEST518_REDWOOD)).toBe(true);
    expect(handoff!.partyAddresses).toEqual([...TEST518_PARTY_ADDRESSES]);
    expect(handoff!.signerNames.every((n) => !n.trim())).toBe(true);
  });

  it("signer setup slots carry legal entity names and addresses from intake", () => {
    const draft = test518Draft();
    const legalEntities = [...TEST518_LEGAL_ENTITIES];
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test518_signer_setup",
      legalEntities,
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      corpusText: null,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: ["", "", "", ""],
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    expect(seed.contactFieldsChanged).toBe(true);
    expect(seed.addresses).toEqual([...TEST518_PARTY_ADDRESSES]);

    const counts = countIntakeSignerMetadataSlots(TEST518_DASHBOARD_CREATE_INTAKE, legalEntities);
    expect(counts.partySlotCount).toBe(4);
    expect(counts.slotsWithAddress).toBe(4);
    expect(counts.slotsWithSignerName).toBe(0);

    const aligned = alignIntakeSignerMetadataToLegalEntities(
      TEST518_DASHBOARD_CREATE_INTAKE,
      legalEntities,
    );
    expect(aligned).toHaveLength(4);
    expect(partyLegalNamesMatch(aligned[0]?.partyLegalName ?? "", TEST518_REDWOOD)).toBe(true);
    expect(aligned.every((s) => s.partyAddress.length >= 8)).toBe(true);

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots).toHaveLength(4);
    expect(partyLegalNamesMatch(slots[0]?.name ?? "", TEST518_REDWOOD)).toBe(true);
    expect(partyLegalNamesMatch(slots[3]?.name ?? "", TEST518_IRON_GATE)).toBe(true);
    expect(slots.map((s) => s.partyAddress)).toEqual([...TEST518_PARTY_ADDRESSES]);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(0);

    const gateIncomplete = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: TEST518_DASHBOARD_CREATE_INTAKE,
      draftPartyNames: draft.parties?.map((p) => String(p.name ?? "")) ?? [],
      partySignerNames: seed.names,
      recipient1Name: legalEntities[0]!,
      recipient2Name: legalEntities[1]!,
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: ["", ""],
      extraPartyLegalNames: legalEntities.slice(2),
      partyAddresses: seed.addresses,
    });
    expect(gateIncomplete.complete).toBe(false);
    expect(gateIncomplete.blockers.length).toBeGreaterThan(0);

    const metadataRows = extractCanonicalIntakeSignerMetadata(TEST518_DASHBOARD_CREATE_INTAKE);
    expect(metadataRows.filter((r) => r.source === "numbered_party_manifest")).toHaveLength(4);
    for (const role of TEST518_PARTY_ROLES) {
      expect(
        extractIntakePartyManifestRows(TEST518_DASHBOARD_CREATE_INTAKE).some((r) => r.roleLabel === role),
      ).toBe(true);
    }
  });
});
