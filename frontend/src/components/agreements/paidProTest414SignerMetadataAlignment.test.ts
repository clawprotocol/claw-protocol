/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  alignIntakeSignerMetadataToLegalEntities,
  isLikelyHumanSignerName,
  looksLikeConcatenatedSignerNames,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  resolveHandoffAuthorityPartyCount,
  resolveHandoffPartySlotCount,
  writePremiumRecipientHandoffLinear,
} from "./premiumPartyNamesHandoff";
import { countSignerMetadataSlots } from "./signerMetadataEffective";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  TEST414_COORDINATOR_ONLY_INTAKE,
  TEST414_LEGAL_ENTITIES,
  TEST414_PARTY_EMAILS,
  TEST414_PARTIAL_METADATA_INTAKE,
  TEST414_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST414_REVENUE_SHARE_INTAKE,
  TEST414_SIGNER_NAMES,
  TEST414_THREE_PARTY_INTAKE,
  TEST414_TWO_PARTY_INTAKE,
  test414Draft,
  test414DraftWithPhantomFifthParty,
  test414LiveUiWithSignerDerivedEntityPollution,
} from "./paidProTest414Fixtures";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildTest401MalformedServerDraft } from "./paidProTest401MalformedQuadPartyExecutionBlockRecovery.test";

function quadPartiesFromUi(ui: ReturnType<typeof test414LiveUiWithSignerDerivedEntityPollution>) {
  return buildLivePaidProSignerMetadataAuthority(ui, "live_ui", {
    intakeText: TEST414_PRODUCTION_QUAD_PARTY_INTAKE,
    draftPartyNames: [TEST414_LEGAL_ENTITIES[0], TEST414_LEGAL_ENTITIES[1]],
  }).parties;
}

describe("TEST414_SIGNER_METADATA_LEGAL_ENTITY_ALIGNMENT", () => {
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
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });

  afterEach(() => {
    storage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    vi.unstubAllGlobals();
  });

  it("rejects human signer names and concatenated names as legal entities", () => {
    expect(isLikelyHumanSignerName("Mary Jay")).toBe(true);
    expect(isLikelyHumanSignerName("Hen Park")).toBe(true);
    expect(isLikelyHumanSignerName("Harbor Peak Automation LLC")).toBe(false);
    expect(looksLikeConcatenatedSignerNames("Mary Jay Hen Park Ira")).toBe(true);
    expect(resolveAuthorityPartyLegalNameField("Mary Jay", "Harbor Peak Automation LLC")).toBe(
      "Harbor Peak Automation LLC",
    );
    expect(resolveAuthorityPartyLegalNameField("Shared Warehouse Automation", "")).toBe("");
  });

  it("2-party agreement keeps entity and signer fields aligned", () => {
    const entities = ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST414_TWO_PARTY_INTAKE, entities);
    expect(aligned).toHaveLength(2);
    expect(aligned[0]?.partyLegalName).toBe("Blue Canyon Analytics LLC");
    expect(aligned[0]?.signerName).toBe("Sarah Mitchell");
    expect(aligned[1]?.signerName).toBe("Michael Torres");
    for (const slot of aligned) {
      expect(slot.partyLegalName).not.toBe(slot.signerName);
    }
  });

  it("3-party agreement keeps slot alignment with Party N signer blocks", () => {
    const entities = [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST414_THREE_PARTY_INTAKE, entities);
    expect(aligned).toHaveLength(3);
    expect(aligned.map((s) => s.signerName)).toEqual(["Alice One", "Bob Two", "Carol Three"]);
    expect(aligned.every((s) => s.partyLegalName !== s.signerName)).toBe(true);
  });

  it("4-party production intake aligns entities, signers, emails, and addresses", () => {
    const aligned = alignIntakeSignerMetadataToLegalEntities(
      TEST414_PRODUCTION_QUAD_PARTY_INTAKE,
      [...TEST414_LEGAL_ENTITIES],
    );
    expect(aligned).toHaveLength(4);
    expect(aligned.map((s) => s.partyLegalName)).toEqual([...TEST414_LEGAL_ENTITIES]);
    expect(aligned.map((s) => s.signerName)).toEqual([...TEST414_SIGNER_NAMES]);
    expect(aligned.every((s) => s.signerEmail.includes("@"))).toBe(true);
    expect(aligned.every((s) => s.partyAddress.length >= 8)).toBe(true);
  });

  it("coordinator-only intake stays at 2 party slots", () => {
    const entities = ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST414_COORDINATOR_ONLY_INTAKE, entities);
    expect(aligned).toHaveLength(2);
    writePremiumRecipientHandoffLinear(
      aligned.map((s) => ({
        name: s.partyLegalName,
        email: s.signerEmail,
        role: "party",
        signerName: s.signerName,
        signerTitle: s.signerTitle,
        partyAddress: s.partyAddress,
      })),
      2,
    );
    expect(resolveHandoffAuthorityPartyCount()).toBe(2);
  });

  it("revenue-share labeled intake preserves four canonical entities", () => {
    const entities = [...TEST414_LEGAL_ENTITIES];
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST414_REVENUE_SHARE_INTAKE, entities);
    expect(aligned.length).toBeGreaterThanOrEqual(4);
    for (const entity of entities) {
      expect(aligned.some((s) => s.partyLegalName.includes(entity.split(" ")[0]!))).toBe(true);
    }
  });

  it("partial metadata intake fills only populated signer fields", () => {
    const aligned = alignIntakeSignerMetadataToLegalEntities(
      TEST414_PARTIAL_METADATA_INTAKE,
      [...TEST414_LEGAL_ENTITIES],
    );
    expect(aligned[0]?.signerName).toBe("Joe Doe");
    expect(aligned[1]?.signerName).toBe("Mary Jay");
    expect(aligned[0]?.partyLegalName).toBe(TEST414_LEGAL_ENTITIES[0]);
    expect(aligned[1]?.partyLegalName).toBe(TEST414_LEGAL_ENTITIES[1]);
    expect(aligned[2]?.partyLegalName).toBe(TEST414_LEGAL_ENTITIES[2]);
    expect(aligned[3]?.partyLegalName).toBe(TEST414_LEGAL_ENTITIES[3]);
  });

  it("stale handoff with extra phantom slot is capped to canonical party count", () => {
    const draft = test414DraftWithPhantomFifthParty();
    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: TEST414_PRODUCTION_QUAD_PARTY_INTAKE,
      draftParties: draft.parties,
    });
    expect(signerCount.count).toBe(4);

    writePremiumRecipientHandoffLinear(
      [
        { name: TEST414_LEGAL_ENTITIES[0], email: "", role: "party", signerName: "Joe Doe", signerTitle: "CEO", partyAddress: "" },
        { name: TEST414_LEGAL_ENTITIES[1], email: "", role: "party", signerName: "Mary Jay", signerTitle: "COO", partyAddress: "" },
        { name: TEST414_LEGAL_ENTITIES[2], email: "", role: "party", signerName: "Hen Park", signerTitle: "CFO", partyAddress: "" },
        { name: TEST414_LEGAL_ENTITIES[3], email: "", role: "party", signerName: "Ira Vale", signerTitle: "CTO", partyAddress: "" },
        { name: "Phantom Slot", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      ],
      signerCount.count,
    );

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    expect(resolveHandoffPartySlotCount(handoff!, signerCount.count)).toBe(4);
    expect(countSignerMetadataSlots(handoff, signerCount.count).partySlots).toBe(4);
    expect(linearPremiumRecipientSlots(handoff, signerCount.count)).toHaveLength(4);
  });

  it("empty handoff read after populated write does not clobber signer metadata", () => {
    writePremiumRecipientHandoffLinear(
      [
        { name: TEST414_LEGAL_ENTITIES[0], email: TEST414_PARTY_EMAILS.red, role: "party", signerName: "Joe Doe", signerTitle: "CEO", partyAddress: "12 Sample St" },
        { name: TEST414_LEGAL_ENTITIES[1], email: TEST414_PARTY_EMAILS.blue, role: "party", signerName: "Mary Jay", signerTitle: "COO", partyAddress: "49 Picture P" },
        { name: TEST414_LEGAL_ENTITIES[2], email: TEST414_PARTY_EMAILS.harbor, role: "party", signerName: "Hen Park", signerTitle: "CFO", partyAddress: "98 Ute Way" },
        { name: TEST414_LEGAL_ENTITIES[3], email: TEST414_PARTY_EMAILS.iron, role: "party", signerName: "Ira Vale", signerTitle: "CTO", partyAddress: "87 Yahoo Way" },
      ],
      4,
    );

    const populated = readPremiumRecipientHandoff();
    expect(populated).toBeTruthy();
    applyPremiumRecipientHandoffReadGate(populated, { partySlotCount: 4 });

    const emptyRead = applyPremiumRecipientHandoffReadGate(
      {
        v: 2,
        party1: { name: TEST414_LEGAL_ENTITIES[0], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        party2: { name: TEST414_LEGAL_ENTITIES[1], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        savedAt: Date.now(),
        partyIndexSlots: [
          { name: TEST414_LEGAL_ENTITIES[2], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
          { name: TEST414_LEGAL_ENTITIES[3], email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        ],
      },
      { partySlotCount: 4 },
    );
    expect(emptyRead).toBeTruthy();
    const slots = linearPremiumRecipientSlots(emptyRead, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
    expect(countSignerMetadataSlots(emptyRead, 4).slotsWithSignerName).toBe(4);
  });

  it("finalize authority rejects signer-derived extra legal entity pollution", () => {
    const authority = buildPaidProSignerMetadataAuthorityForFinalize(
      test414LiveUiWithSignerDerivedEntityPollution(),
      {
        intakeText: TEST414_PRODUCTION_QUAD_PARTY_INTAKE,
        draftPartyNames: [TEST414_LEGAL_ENTITIES[0], TEST414_LEGAL_ENTITIES[1]],
      },
    );
    expect(authority.parties).toHaveLength(4);
    expect(authority.parties[2]?.partyLegalName).toContain("Harbor Peak");
    expect(authority.parties[3]?.partyLegalName).toContain("Iron Vale");
    expect(authority.parties[2]?.partyLegalName).not.toBe("Mary Jay");
    expect(authority.parties[3]?.partyLegalName).not.toBe("Hen Park");
    for (const party of authority.parties) {
      expect(party.partyLegalName).not.toBe(party.signerName);
    }
  });

  it("SoT freeze + hydration keeps four execution blocks aligned without scope-phrase entities", () => {
    const draft = test414Draft();
    const intake = TEST414_PRODUCTION_QUAD_PARTY_INTAKE;
    let body = buildTest401MalformedServerDraft();
    for (const name of TEST414_LEGAL_ENTITIES) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      body = body.replace(new RegExp(`If to ${esc}: ${esc}`, "g"), `If to ${name}:\n${name}`);
    }
    const prep = preparePaidProServerDocumentForAcceptance(body, draft, intake);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const pollutedUi = test414LiveUiWithSignerDerivedEntityPollution();
    const authority = buildPaidProSignerMetadataAuthorityForFinalize(pollutedUi, {
      intakeText: intake,
      draftPartyNames: [TEST414_LEGAL_ENTITIES[0], TEST414_LEGAL_ENTITIES[1]],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    });
    expect(hydrated.rejected).toBe(false);
    const tail = hydrated.corpus.slice(Math.floor(hydrated.corpus.length * 0.72));
    expect(tail).not.toMatch(/SHARED WAREHOUSE AUTOMATION/i);
    expect(tail).not.toMatch(/MARY JAY HEN PARK IRA/i);
    for (const name of TEST414_SIGNER_NAMES) {
      expect(tail).toContain(name);
    }
    for (const entity of TEST414_LEGAL_ENTITIES) {
      expect(tail).toMatch(new RegExp(entity.replace(/\.$/, "").split(" ")[0]!, "i"));
    }
  });

  it("buildLivePaidProSignerMetadataAuthority caps phantom consumed rows", () => {
    const parties = quadPartiesFromUi(test414LiveUiWithSignerDerivedEntityPollution());
    expect(parties).toHaveLength(4);
    expect(parties[2]?.signerEmail).toBe(TEST414_PARTY_EMAILS.harbor);
    expect(parties[3]?.signerEmail).toBe(TEST414_PARTY_EMAILS.iron);
  });
});
