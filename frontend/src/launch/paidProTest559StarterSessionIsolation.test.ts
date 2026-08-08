/** @vitest-environment jsdom */
/**
 * TEST559 — Starter session isolation regression suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrInitSessionAgreementGenerationId,
  getSessionAgreementGenerationId,
} from "../lib/agreementGenerationId";
import {
  AGREEMENT_CREATE_REVIEW_RESUME_KEY,
  writeCreateReviewAgreementResumeId,
} from "../components/agreements/agreementIntakeStorage";
import {
  clearLegalPartyAuthorityForCurrentSession,
  readLegalPartyAuthorityFromSession,
  resolveLegalPartyAuthorityForIntake,
} from "../components/agreements/legalPartyAuthoritySession";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import {
  hasCurrentSessionProEntitlement,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "../components/agreements/paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffExact,
} from "../components/agreements/premiumPartyNamesHandoff";
import {
  clearStarterToPaidPartyHandoffForCurrentSession,
  readStarterToPaidPartyHandoff,
  writeStarterToPaidPartyHandoff,
} from "../components/agreements/starterToPaidPartyHandoff";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  hasFrozenSigningAuthoritySnapshot,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import {
  initializeNewAgreementSession,
  readPerAgreementLocalMarker,
} from "./newAgreementSessionReset";
import {
  buildStarterIsolationProDraft,
  buildStarterIsolationSubstantiveProCorpus,
  STARTER_ISOLATION_HARBOR_PEAK,
  STARTER_ISOLATION_RED_MESA,
  STARTER_ISOLATION_TWO_PARTY_INTAKE,
} from "./starterIsolationFixtures";
import { TEST518_DASHBOARD_CREATE_INTAKE } from "../components/agreements/paidProTest518Fixtures";
import type { FrozenSigningAuthoritySnapshotV1 } from "../components/agreements/frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";

const UNRELATED_INTAKE = [
  "Create an unrelated vendor agreement",
  'between Cedar Ridge Holdings LLC ("party_a") and Northwind Analytics Inc. ("party_b")',
  "for quarterly reporting support.",
  "Texas law governs.",
].join(" ");

function minimalFrozenSnapshot(sessionId: string): FrozenSigningAuthoritySnapshotV1 {
  const corpus = buildStarterIsolationSubstantiveProCorpus();
  return {
    version: 1,
    agreementId: "ag_prior_frozen",
    agreementSessionId: sessionId,
    frozenCorpusHash: hashPaidProCorpus(corpus),
    frozenAt: new Date().toISOString(),
    parties: [
      { agreementPartyId: "party_a_prior", legalEntityName: STARTER_ISOLATION_RED_MESA, canonicalOrder: 0 },
      { agreementPartyId: "party_b_prior", legalEntityName: STARTER_ISOLATION_HARBOR_PEAK, canonicalOrder: 1 },
    ],
    signers: [],
    recipients: [],
    execution: { partyOrder: ["party_a_prior", "party_b_prior"], signerOrder: [], executionBlockHash: "x" },
    packetState: "active",
    activePacketRevision: "rev_1",
  };
}

function establishPriorPaidFrozenSession(): string {
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  markPaidPremiumCompletionSession({ source: "qa_bypass" });
  resolveLegalPartyAuthorityForIntake(STARTER_ISOLATION_TWO_PARTY_INTAKE);
  establishPaidProSourceOfTruth({
    text: buildStarterIsolationSubstantiveProCorpus(),
    source: "server_full_draft",
    draft: buildStarterIsolationProDraft(),
  });
  writeStarterToPaidPartyHandoff(STARTER_ISOLATION_TWO_PARTY_INTAKE);
  const sessionId = getSessionAgreementGenerationId();
  sessionStorage.setItem(
    `claw_frozen_signing_authority_v1:${sessionId}`,
    JSON.stringify(minimalFrozenSnapshot(sessionId)),
  );
  return sessionId;
}

describe("paidProTest559 Starter session isolation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearStarterToPaidPartyHandoffForCurrentSession();
    clearFrozenSigningAuthoritySnapshotForSession();
    clearLegalPartyAuthorityForCurrentSession();
  });

  it("1 — two-party Starter → unrelated two-party Starter clears prior SoT and entitlement", () => {
    const priorGen = establishPriorPaidFrozenSession();
    initializeNewAgreementSession();
    markCurrentSessionFreeStarterIntent();
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasCurrentSessionProEntitlement()).toBe(false);
    expect(getSessionAgreementGenerationId()).not.toBe(priorGen);
  });

  it("2 — four-party intake authority does not bleed into two-party Starter after reset", () => {
    resolveLegalPartyAuthorityForIntake(TEST518_DASHBOARD_CREATE_INTAKE);
    initializeNewAgreementSession();
    markCurrentSessionFreeStarterIntent();
    const authority = readLegalPartyAuthorityFromSession(STARTER_ISOLATION_TWO_PARTY_INTAKE);
    expect(authority?.parties.length ?? 0).not.toBe(4);
    const fresh = resolveLegalPartyAuthorityForIntake(STARTER_ISOLATION_TWO_PARTY_INTAKE);
    expect(fresh.parties).toHaveLength(2);
  });

  it("3 — paid frozen agreement → anonymous Starter cannot render prior SoT", () => {
    establishPriorPaidFrozenSession();
    initializeNewAgreementSession();
    markCurrentSessionFreeStarterIntent();
    expect(getPaidProSourceOfTruth()).toBeNull();
    expect(hasFrozenSigningAuthoritySnapshot()).toBe(false);
  });

  it("4 — abandoned checkout markers cleared on new Starter", () => {
    markPaidPremiumCompletionSession({ source: "qa_bypass" });
    sessionStorage.setItem("claw_checkout_back_v1", "1");
    initializeNewAgreementSession();
    markCurrentSessionFreeStarterIntent();
    expect(sessionStorage.getItem("claw_checkout_back_v1")).toBeNull();
    expect(hasCurrentSessionProEntitlement()).toBe(false);
  });

  it("5 — prior comparison-card state absent after reset", () => {
    sessionStorage.setItem("claw_premium_recipients_surface_released_v1", "1");
    initializeNewAgreementSession();
    expect(sessionStorage.getItem("claw_premium_recipients_surface_released_v1")).toBeNull();
  });

  it("6 — prior legal-party handoff IDs absent after reset", () => {
    writeStarterToPaidPartyHandoff(STARTER_ISOLATION_TWO_PARTY_INTAKE);
    expect((readStarterToPaidPartyHandoff()?.parties.length ?? 0)).toBeGreaterThan(0);
    initializeNewAgreementSession();
    expect(readStarterToPaidPartyHandoff()?.parties ?? []).toHaveLength(0);
  });

  it("7 — prior Starter review handoff absent", () => {
    writePremiumRecipientHandoffExact(
      { name: STARTER_ISOLATION_RED_MESA, email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: STARTER_ISOLATION_HARBOR_PEAK, email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
    );
    initializeNewAgreementSession();
    expect(readPremiumRecipientHandoff()).toBeNull();
  });

  it("8 — prior typed paid handoff absent", () => {
    establishPriorPaidFrozenSession();
    initializeNewAgreementSession();
    expect(readStarterToPaidPartyHandoff()).toBeNull();
  });

  it("9 — prior paid SoT cannot render after reset", () => {
    establishPriorPaidFrozenSession();
    expect(hasPaidProSourceOfTruth()).toBe(true);
    initializeNewAgreementSession();
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("10 — prior signer frozen snapshot absent for new session", () => {
    establishPriorPaidFrozenSession();
    expect(hasFrozenSigningAuthoritySnapshot()).toBe(true);
    initializeNewAgreementSession();
    expect(hasFrozenSigningAuthoritySnapshot()).toBe(false);
  });

  it("11 — prior route/query resume markers cleared", () => {
    writeCreateReviewAgreementResumeId("ag_old");
    sessionStorage.setItem("claw_dashboard_resume_signer_setup_v1", "ag_old");
    initializeNewAgreementSession();
    expect(sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY)).toBeNull();
    expect(sessionStorage.getItem("claw_dashboard_resume_signer_setup_v1")).toBeNull();
  });

  it("12 — reload simulation: explicit reset then new agreement id", () => {
    const before = getOrInitSessionAgreementGenerationId();
    establishPriorPaidFrozenSession();
    initializeNewAgreementSession();
    expect(getSessionAgreementGenerationId()).not.toBe(before);
  });

  it("13 — second reset yields another independent generation id", () => {
    establishPriorPaidFrozenSession();
    initializeNewAgreementSession();
    const genB = getSessionAgreementGenerationId();
    initializeNewAgreementSession();
    expect(getSessionAgreementGenerationId()).not.toBe(genB);
  });

  it("14 — durable prior packet local marker preserved by agreement id", () => {
    localStorage.setItem("vs01_signing_packet_status_v1:ag_durable_prior", "sent");
    initializeNewAgreementSession({ priorAgreementId: "ag_other" });
    expect(readPerAgreementLocalMarker("vs01_signing_packet_status_v1:", "ag_durable_prior")).toBe("sent");
  });

  it("15 — anti-fixture unrelated entities after reset", () => {
    resolveLegalPartyAuthorityForIntake(STARTER_ISOLATION_TWO_PARTY_INTAKE);
    initializeNewAgreementSession();
    markCurrentSessionFreeStarterIntent();
    const authority = resolveLegalPartyAuthorityForIntake(UNRELATED_INTAKE);
    expect(authority.parties.some((p) => p.legalEntityName.includes("Cedar Ridge"))).toBe(true);
    expect(authority.parties.some((p) => p.legalEntityName.includes(STARTER_ISOLATION_RED_MESA))).toBe(false);
  });
});
