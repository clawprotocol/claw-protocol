/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId, shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { ensurePremiumCompletion } from "./premiumCompletionEnsure";
import {
  assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze,
  assertPaidReviewSessionReviewCorpusHashParity,
  latchPaidReviewSessionCanonicalSoTHash,
  markPaidReviewSessionPremiumGeneration,
  readPaidReviewSessionCorpusInvariant,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariant";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { setPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r ? Promise.resolve(r) : Promise.reject(new Error("no_mock"));
    },
  };
});

const TEST512_INTAKE = "Implementation agreement between Summit Ridge and Delta Integration";

const SERVER_PAID_BODY = `IMPLEMENTATION AGREEMENT between Summit Ridge Advisory Group LLC and Delta Integration Services LLC. ${"Substantive paid operative clause. ".repeat(95)}`;

function test512Draft(body = SERVER_PAID_BODY): ParsedDraftShape {
  return {
    title: "Implementation Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Summit Ridge Advisory Group LLC", role: "Client" },
      { name: "Delta Integration Services LLC", role: "Service Provider" },
    ],
    purpose: body,
    payment_terms: "$240,000",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: body,
  };
}

describe("TEST512 — paid review session premium generation + post-freeze corpus hash parity", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    resetPaidReviewSessionCorpusInvariantForTests();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    setPaidProReviewSignerMetadataSessionActive(false);
    clearAuthoritativeSigningSnapshot();
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    resetPaidReviewSessionCorpusInvariantForTests();
    vi.restoreAllMocks();
  });

  it("1 — canonical-corpus-freeze requires prior ensurePremiumCompletion premium generation", async () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");

    const snap = buildCanonicalAgreementSnapshot({
      tier: "pro",
      surface: "paid_pro_review",
      candidates: [{ source: "server_full_document_text", text: SERVER_PAID_BODY }],
      intakeText: "Implementation agreement between Summit Ridge and Delta Integration",
      parties: test512Draft().parties ?? [],
      signerState: { complete: false, signerCount: 2 },
      minLen: 500,
      reviewSessionId: generationId,
    });
    expect(() => freezeCanonicalAgreementSnapshot(snap, "server_full_document_text")).not.toThrow();
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).toBe(true);
  });

  it("2 — canonical-corpus-freeze rejects sessions without premium generation marker", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    expect(() =>
      assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze({
        reviewSessionId: generationId,
        source: "server_full_document_text",
        tier: "pro",
      }),
    ).toThrow(/ensurePremiumCompletion premium generation/);
  });

  it("3 — ensurePremiumCompletion marks premium generation for the active review session", async () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    premiumApiMock.mockResponses = [
      {
        title: "Implementation Agreement",
        agreement_family: "services_agreement",
        document_text: SERVER_PAID_BODY.slice(0, 600),
        server_full_document_text: SERVER_PAID_BODY,
        key_terms_found: ["payment"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];
    await ensurePremiumCompletion({
      intakeText: TEST512_INTAKE,
      structuredDraft: test512Draft(),
      agreementFamily: "services_agreement",
      guidedFlowId: null,
      simpleProductFlow: true,
      partyRoleLabels: { relationship: "unset", label1: "Party 1", label2: "Party 2" },
      parseDraft: async (raw) => ({
        ...test512Draft(raw),
        premium_server_full_document_text: SERVER_PAID_BODY,
      }),
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: shortIntakeFingerprint(TEST512_INTAKE),
      isPremiumRequestStillValid: () => true,
      premiumGenerationCallReason: "entitled_rewrite",
    });
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).toBe(true);
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationSource).toBe(
      "ensure_premium_completion",
    );
  });

  it("4 — after SoT freeze, review render hash matches latched canonical SoT hash across rerenders", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: SERVER_PAID_BODY, source: "server_full_draft" });

    establishPaidProSourceOfTruth({
      text: SERVER_PAID_BODY,
      source: "server_full_draft",
      reviewSessionId: generationId,
      draft: test512Draft(),
    });

    const session = readPaidReviewSessionCorpusInvariant(generationId);
    const sotPlain = getPaidProSourceOfTruthText();
    expect(sotPlain.length).toBeGreaterThan(500);
    expect(session?.latchedCanonicalSoTHash).toBe(hashPaidProCorpus(sotPlain));

    assertPaidReviewSessionReviewCorpusHashParity({
      reviewSessionId: generationId,
      reviewPlain: sotPlain,
      surface: "paid_pro_review_render_plain",
      draft: test512Draft(),
    });
    assertPaidReviewSessionReviewCorpusHashParity({
      reviewSessionId: generationId,
      reviewPlain: sotPlain,
      surface: "paid_pro_review_render_plain",
      draft: test512Draft(),
    });

    const rendered = resolvePaidProReviewRenderPlain({
      draft: test512Draft(),
      intakeText: "Implementation agreement",
    });
    if (rendered.length >= 80) {
      assertPaidReviewSessionReviewCorpusHashParity({
        reviewSessionId: generationId,
        reviewPlain: rendered,
        surface: "paid_pro_review_render_plain",
        draft: test512Draft(),
      });
      expect(hashPaidProCorpus(rendered)).toBe(session?.latchedCanonicalSoTHash);
    }
  });

  it("keeps accepted SoT bytes when a prepared signing snapshot repeats that corpus", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: SERVER_PAID_BODY, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: SERVER_PAID_BODY,
      source: "server_full_draft",
      reviewSessionId: generationId,
      draft: test512Draft(),
    });
    const accepted = getPaidProSourceOfTruthText().trim();
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: "Summit Ridge Advisory Group LLC",
        recipient2Name: "Delta Integration Services LLC",
        recipient1Email: "summit@example.test",
        recipient2Email: "delta@example.test",
        extraPartyReviewEmails: [],
        extraPartyLegalNames: [],
        partySignerNames: ["Avery Summit", "Blake Delta"],
        partySignerTitles: ["", ""],
        partyAddresses: ["", ""],
      },
      "live_ui",
    );
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
    createAuthoritativeSigningSnapshot({
      corpus: accepted,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
      preserveFrozenServerFullHydratedCorpus: true,
      persistFrozenToBackend: false,
    });
    const rendered = resolvePaidProReviewRenderPlain({
      draft: test512Draft(),
      intakeText: TEST512_INTAKE,
    });
    expect(rendered).toBe(accepted);
  });

  it("keeps the accepted three-party corpus when reload display-only overlay is necessary", () => {
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      'This Consulting Services Agreement is entered into by and among Harbor Peak Analytics LLC ("Consultant"), Ironvale Manufacturing Inc. ("Client"), and Alex Rivera ("Advisor").',
      "Consultant shall perform AI workflow implementation. Client shall pay a fixed fee of $48,000. Advisor remains a distinct legal party.",
      "The initial term is twelve (12) months beginning October 1, 2026.",
      "This Agreement is governed by the laws of the State of Delaware.",
      "If to Harbor Peak Analytics LLC: Email: notices@harborpeak.test.",
      "Access remains pat.harbor@harbor.test and is not the Harbor notice address.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "Harbor Peak Analytics LLC",
      "By: ______________________",
      "Name: Pat Harbor",
      "Ironvale Manufacturing Inc.",
      "By: ______________________",
      "Name: Sam Ironvale",
      "Alex Rivera",
      "By: ______________________",
      "Name: Alex Rivera",
      "Operative consulting paragraph continues the Harbor, Ironvale, and Advisor engagement. ".repeat(80),
    ].join("\n");
    const draft = {
      ...test512Draft(corpus),
      title: "Consulting Services Agreement",
      jurisdiction: "Delaware",
      payment_terms: "$48,000",
      duration: "12 months",
      parties: [
        { id: "party-harbor", name: "Harbor Peak Analytics LLC", role: "Consultant", email: "pat.harbor@harbor.test", signerName: "Pat Harbor" },
        { id: "party-ironvale", name: "Ironvale Manufacturing Inc.", role: "Client", email: "sam.ironvale@ironvale.test", signerName: "Sam Ironvale" },
        { id: "party-advisor", name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test", signerName: "Alex Rivera" },
      ],
    } as ParsedDraftShape;
    const generationId = getOrInitSessionAgreementGenerationId();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    replacePaidProSourceOfTruth({
      text: corpus,
      hash: hashPaidProCorpus(corpus),
      accepted_at: Date.now(),
      source: "server_full_draft",
      reviewSessionId: generationId,
    });
    latchPaidReviewSessionCanonicalSoTHash({
      reviewSessionId: generationId,
      canonicalPlain: corpus,
    });
    const accepted = getPaidProSourceOfTruthText().trim();
    expect(accepted).toContain("Harbor Peak Analytics LLC");
    expect(accepted).toContain("Ironvale Manufacturing Inc.");
    expect(accepted).toContain("Alex Rivera");
    expect(accepted).toContain("$48,000");
    expect(accepted).toContain("Delaware");
    expect(accepted).toContain("notices@harborpeak.test");
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 3,
        recipient1Name: "Harbor Peak Analytics LLC",
        recipient2Name: "Ironvale Manufacturing Inc.",
        recipient1Email: "pat.harbor@harbor.test",
        recipient2Email: "sam.ironvale@ironvale.test",
        extraPartyReviewEmails: ["alex.rivera@advisor.test"],
        extraPartyLegalNames: ["Alex Rivera"],
        partySignerNames: ["Pat Harbor", "Sam Ironvale", "Alex Rivera"],
        partySignerTitles: ["", "", ""],
        partyAddresses: ["", "", ""],
      },
      "live_ui",
      { draftPartyNames: draft.parties?.map((party) => String(party.name ?? "")) ?? [], persistedMembershipAuthoritative: true },
    );
    setConsumedPaidProSignerMetadataAuthority(authority);
    setPaidProReviewSignerMetadataSessionActive(true);
    expect(shouldUsePaidProSourceOfTruthDisplayOnly()).toBe(true);
    const rendered = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: corpus,
    });
    expect(rendered).toBe(accepted);
    expect(rendered).toContain("Harbor Peak Analytics LLC");
    expect(rendered).toContain("Ironvale Manufacturing Inc.");
    expect(rendered).toContain("Alex Rivera");
    expect(rendered).toContain("$48,000");
    expect(rendered).toContain("notices@harborpeak.test");
    expect((draft.parties ?? []).map((party) => party.id)).toEqual([
      "party-harbor",
      "party-ironvale",
      "party-advisor",
    ]);
  });

  it("5 — post-freeze review hash drift fails session lifetime parity assertion", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    latchPaidReviewSessionCanonicalSoTHash({
      reviewSessionId: generationId,
      canonicalPlain: SERVER_PAID_BODY,
    });

    const drifted = `${SERVER_PAID_BODY}\n\n9. ILLEGAL POST-FREEZE INSERT`;
    expect(() =>
      assertPaidReviewSessionReviewCorpusHashParity({
        reviewSessionId: generationId,
        reviewPlain: drifted,
        surface: "paid_pro_review_render_plain",
      }),
    ).toThrow(/corpus hash diverged|display hash changed/);
  });

  it("6 — free starter canonical freeze does not require premium generation marker", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const starter = "Starter preview only. ".repeat(30);
    const snap = buildCanonicalAgreementSnapshot({
      tier: "starter",
      surface: "free_starter_review",
      candidates: [{ source: "free_starter", text: starter }],
      intakeText: "Simple services agreement",
      parties: test512Draft().parties ?? [],
      signerState: { complete: false, signerCount: 2 },
      minLen: 120,
      reviewSessionId: generationId,
    });
    expect(() => freezeCanonicalAgreementSnapshot(snap, "free_starter")).not.toThrow();
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).not.toBe(true);
  });
});
