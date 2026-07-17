/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { resolveStarterTwoPartyCommercialAuthority } from "./canonicalPartyRoleAuthority";
import {
  establishLegalPartyAuthorityFromIntake,
  fingerprintLegalPartyAuthority,
  readLegalPartyCountFromAuthority,
  serializeLegalPartyAuthoritySnapshot,
} from "./legalPartyAuthority";
import {
  clearLegalPartyAuthoritySessionForTests,
  resolveLegalPartyAuthorityForIntake,
} from "./legalPartyAuthoritySession";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteFixtures";

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
  const draft = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
  const authority = resolveLegalPartyAuthorityForIntake(intake);
  return { draft, authority };
}

describe("paidProTest554 Phase 1 legal-party authority", () => {
  afterEach(() => {
    clearLegalPartyAuthoritySessionForTests();
  });

  it("Case 1 — two-party Cedar Ridge / Northwind services intake", () => {
    const { draft, authority } = runStarter(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(readLegalPartyCountFromAuthority(authority.parties)).toBe(2);
    expect(authority.parties.map((p) => p.legalEntityName)).toEqual([TEST550_CEDAR, TEST550_NORTHWIND]);
    expect(new Set(authority.parties.map((p) => p.agreementPartyId)).size).toBe(2);
    const commercial = resolveStarterTwoPartyCommercialAuthority(TEST550_CEDAR_NORTHWIND_INTAKE, [
      TEST550_CEDAR,
      TEST550_NORTHWIND,
    ]);
    expect(commercial?.clientName).toMatch(/northwind/i);
    expect(commercial?.providerName).toMatch(/cedar/i);
    expect(draft.parties?.map((p) => p.name)).toEqual([TEST550_CEDAR, TEST550_NORTHWIND]);
  });

  it("Case 2 — three-party between clause", () => {
    const intake =
      "Create a consulting agreement between Alpha Strategy LLC, Beacon Systems Inc., and Copper Ridge Analytics LLC. Scope: joint advisory. Term: 12 months. Governing law: Delaware.";
    const { draft, authority } = runStarter(intake);
    expect(authority.parties).toHaveLength(3);
    expect(authority.parties.every((p) => p.agreementPartyId.startsWith("party_"))).toBe(true);
    expect(draft.parties?.some((p) => /^party\s*[ab]$/i.test(p.name))).toBe(false);
    expect(assessStarterComplexityGate(intake).reasons).toContain("three_plus_legal_parties");
  });

  it("Case 3 — four-party between clause with stable ordering", () => {
    const intake =
      "Create a logistics partnership between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp. Term: 24 months. Texas law.";
    const { authority } = runStarter(intake);
    expect(authority.parties.map((p) => p.legalEntityName)).toEqual([
      "Alpha Logistics LLC",
      "Beta Transport Inc.",
      "Gamma Warehousing LLC",
      "Delta Distribution Corp",
    ]);
    expect(new Set(authority.parties.map((p) => p.agreementPartyId)).size).toBe(4);
  });

  it("Case 4 — labeled Party 1–4 blocks preserve entities", () => {
    const intake = `Create a services agreement.

Party 1:
Alpha Logistics LLC

Party 2:
Beta Transport Inc.

Party 3:
Gamma Warehousing LLC

Party 4:
Delta Distribution Corp.

Scope: logistics partnership.
Term: 24 months.
Governing law: Texas.`;
    const { authority } = runStarter(intake);
    expect(authority.parties).toHaveLength(4);
    expect(authority.parties.map((p) => p.legalEntityName)).toEqual([
      "Alpha Logistics LLC",
      "Beta Transport Inc.",
      "Gamma Warehousing LLC",
      "Delta Distribution Corp.",
    ]);
  });

  it("Case 5 — mention order vs semantic roles (provider first)", () => {
    const intake =
      "Services agreement between Harbor Peak Automation LLC, the service provider, and Blue Canyon Analytics LLC, the client. Fee $10,000. Term 6 months.";
    const { authority } = runStarter(intake);
    expect(authority.parties.map((p) => p.legalEntityName)).toEqual([
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);
    const provider = authority.parties.find((p) => /harbor/i.test(p.legalEntityName));
    const client = authority.parties.find((p) => /blue canyon/i.test(p.legalEntityName));
    expect(provider?.agreementRole?.toLowerCase()).toMatch(/service provider|provider/);
    expect(client?.agreementRole?.toLowerCase()).toMatch(/client/);
  });

  it("Case 6 — unknown roles preserved without index defaults", () => {
    const intake =
      "Agreement between Alpha Strategy LLC, Beacon Systems Inc., and Copper Ridge Analytics LLC regarding shared data infrastructure.";
    const { authority } = runStarter(intake);
    expect(authority.parties).toHaveLength(3);
    for (const party of authority.parties) {
      expect(party.agreementRole == null || party.agreementRole === "party" || party.confidence.role === "unknown").toBe(
        true,
      );
    }
  });

  it("Case 7 — duplicate mention does not inflate count", () => {
    const intake =
      "Services agreement between Cedar Ridge Consulting LLC and Northwind Retail Group Inc. Cedar Ridge Consulting LLC will deliver the work.";
    const { authority } = runStarter(intake);
    expect(authority.parties).toHaveLength(2);
  });

  it("Case 8 — similar entity names remain separate parties", () => {
    const intake =
      "Agreement between Northwind Analytics LLC and Northwind Retail Group Inc. for consulting services.";
    const { authority } = runStarter(intake);
    expect(authority.parties).toHaveLength(2);
    expect(new Set(authority.parties.map((p) => p.agreementPartyId)).size).toBe(2);
  });

  it("Case 9 — coordinator-only contact is not a legal party", () => {
    const intake = `Create a services agreement.

Coordinator:
Jordan Lee

Party 1:
Alpha Logistics LLC

Party 2:
Beta Transport Inc.

Scope: freight coordination.
Term: 12 months.`;
    const { authority } = runStarter(intake);
    expect(authority.parties.map((p) => p.legalEntityName)).not.toContain("Jordan Lee");
    expect(authority.parties).toHaveLength(2);
  });

  it("Case 10 — address commas do not create false parties", () => {
    const intake =
      "Lease between Sunset Holdings LLC, as landlord, and Alex Park and Jamie Chen as tenants for 123 Mockingbird Lane, Austin, TX 78701. Rent $3,200/month.";
    const { authority } = runStarter(intake);
    expect(authority.parties.map((p) => p.legalEntityName)).toEqual([
      "Sunset Holdings LLC",
      "Alex Park",
      "Jamie Chen",
    ]);
    expect(authority.parties.some((p) => /78701|mockingbird/i.test(p.legalEntityName))).toBe(false);
  });

  it("Case 11 — sequential agreement isolation", () => {
    const fourParty =
      "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.";
    const twoParty = TEST550_CEDAR_NORTHWIND_INTAKE;
    const first = establishLegalPartyAuthorityFromIntake(fourParty);
    bumpAgreementGenerationId();
    clearLegalPartyAuthoritySessionForTests();
    const second = establishLegalPartyAuthorityFromIntake(twoParty);
    expect(first.parties).toHaveLength(4);
    expect(second.parties.map((p) => p.legalEntityName)).toEqual([TEST550_CEDAR, TEST550_NORTHWIND]);
    expect(fingerprintLegalPartyAuthority(first)).not.toBe(fingerprintLegalPartyAuthority(second));
  });

  it("Case 12 — Starter preview parity with authority projection", () => {
    const intake =
      "Services agreement between Acme LLC, Beta Inc, Gamma Studios, and Delta Holdings. Fee $7,500/month.";
    const { draft } = runStarter(intake);
    const preview = buildStarterAgreementPreviewForReview(draft, { intakeText: intake, starterPreview: true });
    for (const name of ["Acme LLC", "Beta Inc", "Gamma Studios", "Delta Holdings"]) {
      expect(preview, `preview missing ${name}`).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });

  it("Case 13 — complexity gate reads canonical authority count", () => {
    const intake =
      "Create a consulting agreement between Alpha Strategy LLC, Beacon Systems Inc., and Copper Ridge Analytics LLC.";
    runStarter(intake);
    const gate = assessStarterComplexityGate(intake);
    expect(gate.partyCount).toBeGreaterThanOrEqual(3);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("Case 14 — upgrade snapshot readiness without signer or entitlement fields", () => {
    const intake =
      "Agreement between Alpha Logistics LLC, Beta Transport Inc., Gamma Warehousing LLC, and Delta Distribution Corp.";
    const authority = establishLegalPartyAuthorityFromIntake(intake);
    const snapshot = JSON.parse(serializeLegalPartyAuthoritySnapshot(authority)) as {
      parties: Array<Record<string, unknown>>;
    };
    expect(snapshot.parties).toHaveLength(4);
    for (const row of snapshot.parties) {
      expect(row).not.toHaveProperty("signerEmail");
      expect(row).not.toHaveProperty("signerName");
      expect(row.agreementPartyId).toBeTruthy();
    }
  });

  it("Case 15 — paid-path non-regression (two-party Cedar + TEST371 quad intake authority only)", () => {
    const cedar = runStarter(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(cedar.authority.parties).toHaveLength(2);
    const quad = runStarter(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(quad.authority.parties.length).toBeGreaterThanOrEqual(4);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });
});
