/** @vitest-environment jsdom */
/**
 * Four-party paid Pro acceptance must freeze the customer-visible corpus and
 * persist a SoT hash under the same review-session key used by ensurePremiumCompletion.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  buildRcQuadPartyPaidBody,
  RC_QUAD_PARTY_INTAKE,
  RC_QUAD_PENDING_DRAFT,
} from "../../../e2e/fixtures/rcQuadPartyProfessional";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  hydratePaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze,
  markPaidReviewSessionPremiumGeneration,
  readPaidReviewSessionCorpusInvariant,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariant";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { shouldBlockEntitledRewriteForAcceptedPaidProSnapshot } from "./premiumAuthoritativeVisibleSurface";
import { snapshotFieldsFromAcceptedPremiumCanonical } from "./acceptedPremiumCanonicalCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function quadDraft(): ParsedDraftShape {
  return {
    ...RC_QUAD_PENDING_DRAFT,
    parties: RC_QUAD_PENDING_DRAFT.parties.map((p) => ({ ...p })),
  } as ParsedDraftShape;
}

describe("paid Pro quad-party acceptance SoT authority", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    resetPaidReviewSessionCorpusInvariantForTests();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "settled_checkout" });
  });

  it("freezes SoT when mark uses agreementGenerationId and establish omits reviewSessionId", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const wire = buildRcQuadPartyPaidBody();
    expect(hashPaidProCorpus(wire)).toBe("10149:e85e06a");

    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: wire, source: "server_full_draft" });

    // Reproduce production applySuccess call shape: agreementGenerationId only.
    const record = establishPaidProSourceOfTruth({
      text: wire,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });

    expect(record.hash).toMatch(/^\d+:[a-f0-9]+$/i);
    expect(record.text.length).toBeGreaterThan(8_000);
    expect(record.text).toMatch(/Redwood Biologics/i);
    expect(record.text).toMatch(/Summit AI Consulting/i);
    expect(record.text).toMatch(/Blue Harbor Systems/i);
    expect(record.text).toMatch(/Iron Gate Security/i);
    expect(record.text).not.toMatch(/Red Mesa Logistics/i);
    expect(hashPaidProCorpus(record.text)).toBe(record.hash);

    const session = readPaidReviewSessionCorpusInvariant(generationId);
    expect(session?.premiumGenerationMarked).toBe(true);
    expect(getPaidProSourceOfTruth()?.hash).toBe(record.hash);
  });

  it("persisted SoT hash equals frozen corpus bytes (not raw wire when prep normalizes)", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const wire = buildRcQuadPartyPaidBody();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: wire, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: wire,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });

    // Pre-freeze normalization may change length vs wire; hash must track frozen bytes.
    if (record.text !== wire) {
      expect(record.hash).not.toBe(hashPaidProCorpus(wire));
    }
    expect(hashPaidProCorpus(record.text)).toBe(record.hash);
    // Deterministic for this fixture family; length may move with intentional pre-freeze prep.
    expect(record.hash).toMatch(/^\d+:[a-f0-9]+$/i);
    expect(record.text.length).toBeGreaterThan(10_000);

    // Reload/hydrate restores exact frozen bytes (does not re-run multiparty prep).
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    const hydrated = hydratePaidProSourceOfTruth({
      text: record.text,
      hash: record.hash,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    expect(hydrated?.text).toBe(record.text);
    expect(hydrated?.hash).toBe(record.hash);
  });

  it("invariant still rejects unmarked sessions (DEV/E2E assert path)", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    expect(() =>
      assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze({
        reviewSessionId: generationId,
        source: "server_full_document_text",
        tier: "pro",
      }),
    ).toThrow(/ensurePremiumCompletion premium generation/);
  });

  it("aligned session id is generationId, not review-${hash}", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const wire = buildRcQuadPartyPaidBody();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: wire, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: wire,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });

    expect(record.reviewSessionId).toBe(generationId);
    expect(record.reviewSessionId).not.toMatch(/^review-/);
  });

  it("wire→freeze prep is deterministic and idempotent (single accepted-hash family)", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const wire = buildRcQuadPartyPaidBody();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: wire, source: "server_full_draft" });

    const first = establishPaidProSourceOfTruth({
      text: wire,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    expect(first.hash).toBe("11052:5d0ca5a7");

    // Re-feeding the frozen corpus must not create a second prep family (e.g. 11147).
    const second = establishPaidProSourceOfTruth({
      text: first.text,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    expect(second.hash).toBe(first.hash);
    expect(second.text).toBe(first.text);
  });

  it("accepted snap blocks entitled rewrite; reload establish cannot overwrite frozen hash", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const wire = buildRcQuadPartyPaidBody();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    markPaidProPipelineValidationPassed({ text: wire, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: wire,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    const frozenHash = record.hash;
    const snapFields = snapshotFieldsFromAcceptedPremiumCanonical({
      ...record,
      acceptedLen: record.text.length,
      pipelineSource: record.source,
      establishedAt: record.accepted_at,
      rawAcceptedLen: record.text.length,
    });
    expect(
      shouldBlockEntitledRewriteForAcceptedPaidProSnapshot({
        savedAt: Date.now(),
        premiumDraft: quadDraft(),
        premiumParties: [],
        recipientCandidates: [],
        premiumAccepted: true,
        premiumWinningBodyText: record.text,
        premiumReadonlyPlainText: record.text,
        premiumPipelineRenderSource: "server_full_draft",
        ...snapFields,
      }),
    ).toBe(true);

    // Simulate full reload: clear in-memory SoT, hydrate from snap, refuse overwrite.
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
    const hydrated = hydratePaidProSourceOfTruth({
      text: record.text,
      hash: record.hash,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    expect(hydrated?.hash).toBe(frozenHash);

    const blocked = establishPaidProSourceOfTruth({
      text: `${record.text}\n\nIllegitimate post-acceptance append.`,
      source: "server_full_draft",
      draft: quadDraft(),
      intakeText: RC_QUAD_PARTY_INTAKE,
      agreementGenerationId: generationId,
    });
    expect(blocked.hash).toBe(frozenHash);
    expect(blocked.text).toBe(record.text);
    expect(getPaidProSourceOfTruth()?.hash).toBe(frozenHash);
  });
});
