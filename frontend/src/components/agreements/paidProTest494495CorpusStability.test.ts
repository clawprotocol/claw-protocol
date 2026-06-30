/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  createAuthoritativeSigningSnapshot,
  clearAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
  getFrozenCanonicalAgreementCorpus,
} from "./canonicalAgreementSnapshot";
import {
  classifyPaidProCorpusLifecycleDiff,
  resetPaidProCorpusLifecycleDiffForTests,
} from "./paidProCorpusLifecycleDiff";
import {
  assertPaidProHydrateAuthorityInvariant,
  resolvePaidProHydrateStructuralContext,
} from "./paidProHydrateAuthority";
import {
  countOperativeIfToNoticeStanzas,
  hasMisplacedStandaloneNoticesBeforeSubsection,
} from "./paidProPartyNoticeDetails";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { resolvePaidProFinalHydratedCorpusForSurface } from "./paidProFinalHydratedCorpus";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  hydratePaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  assessStarterComplexityGate,
  formatStarterMultiPartyGatePartyLines,
} from "./starterMultiPartyProGate";
import {
  TEST494_INTAKE,
  TEST494_SIGNERS,
  buildTest494ThreePartySection10Corpus,
  excerptSection10NoticesRegion,
  test494Draft,
} from "./paidProTest494Fixtures";
import {
  TEST490_CLEARSPRING,
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
} from "./paidProTest490Fixtures";

type StageRow = {
  stage: string;
  hash: string;
  excerpt: string;
  text: string;
};

function stageRow(stage: string, text: string): StageRow {
  return {
    stage,
    hash: hashPaidProCorpus(text),
    excerpt: excerptSection10NoticesRegion(text),
    text,
  };
}

function assertNoticesStructure(text: string, stage: string): void {
  expect(hasMisplacedStandaloneNoticesBeforeSubsection(text), stage).toBe(false);
  expect(text).toMatch(/10\.\s+Assignment[\s\S]{0,120}Notices and Miscellaneous/i);
  expect(text).toMatch(/10\.1\s+Assignment/i);
  expect(text).toMatch(/10\.4\s+Notices/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(3);
  expect((text.match(/^If to\s+/gim) || []).length).toBeGreaterThanOrEqual(3);
}

function armAuthority() {
  setConsumedPaidProSignerMetadataAuthority({
    parties: TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
    source: "live_ui",
    hash: "test494",
    updatedAt: Date.now(),
  });
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearAuthoritativeSigningSnapshot();
  clearFrozenCanonicalAgreementCorpus();
  resetPaidProCorpusLifecycleDiffForTests();
  vi.restoreAllMocks();
});

describe("TEST494 — hash / corpus stability across stages", () => {
  it("frozen SoT never contains misplaced standalone NOTICES; review/prepare/signer hashes stay aligned", () => {
    markCurrentSessionProEntitlementComplete();
    const intake = TEST494_INTAKE;
    const draft = test494Draft();
    const raw = buildTest494ThreePartySection10Corpus();

    const preview = preparePaidProServerDocumentForAcceptance(raw, draft, intake).text;
    assertNoticesStructure(preview, "preview");

    const prep = preparePaidProFreezeCandidateText({
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    const freezeGated = evaluatePaidProFreezeCandidateGates(prep, {
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    expect(freezeGated.ok).toBe(true);
    assertNoticesStructure(freezeGated.text, "freeze_candidate");

    markPaidProPipelineValidationPassed({ text: freezeGated.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: freezeGated.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const sot = getPaidProSourceOfTruth()!.text;
    const frozen = getFrozenCanonicalAgreementCorpus()?.canonicalText ?? sot;
    assertNoticesStructure(frozen, "freeze_commit");
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(frozen)).toBe(false);

    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    assertNoticesStructure(review, "review");

    const prepareDoc = getPaidProDocumentForSurface("signer_setup", { draft, intakeText: intake });
    expect(prepareDoc?.text.length).toBeGreaterThan(2000);
    assertNoticesStructure(prepareDoc!.text, "prepare_signatures");

    armAuthority();
    const authority = {
      parties: TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
      source: "live_ui" as const,
      hash: "test494",
      updatedAt: Date.now(),
    };
    const signerCorpus = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: prepareDoc!.text,
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    }).corpus;
    assertNoticesStructure(signerCorpus, "signer_corpus");

    createAuthoritativeSigningSnapshot({
      corpus: signerCorpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: authorityPartiesToCanonicalPartyIdentities(authority.parties),
        signFirst: true,
      }),
    });

    const completed = resolvePaidProFinalHydratedCorpusForSurface("finalized", {
      draft,
      intakeText: intake,
    }).text;
    assertNoticesStructure(completed, "completed");

    const stages: StageRow[] = [
      stageRow("preview", preview),
      stageRow("freeze_candidate", freezeGated.text),
      stageRow("freeze_commit", frozen),
      stageRow("review", review),
      stageRow("prepare_signatures", prepareDoc!.text),
      stageRow("signer_corpus", signerCorpus),
      stageRow("completed", completed),
    ];

    expect(stages.find((s) => s.stage === "freeze_commit")!.hash).toBe(
      hashPaidProCorpus(getPaidProSourceOfTruth()!.text),
    );

    const reviewHash = hashPaidProCorpus(review);
    expect(hashPaidProCorpus(prepareDoc!.text)).toBe(reviewHash);
    const frozenToReview = classifyPaidProCorpusLifecycleDiff(frozen, review);
    expect(frozenToReview).not.toBe("substantive_clause_change");
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(frozen)).toBe(false);
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(review)).toBe(false);
    expect(classifyPaidProCorpusLifecycleDiff(review, prepareDoc!.text)).toBe("identical");
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(signerCorpus)).toBe(false);
    expect(countOperativeIfToNoticeStanzas(signerCorpus)).toBe(3);

    for (const row of stages) {
      expect(row.excerpt).toMatch(/10\.4\s+Notices/i);
      expect(row.excerpt).not.toMatch(/\n\n\d+\.\s+NOTICES\s*\n\n10\.1/i);
    }
  });
});

describe("TEST495 — Notices rendering across every stage", () => {
  it("preserves composite §10 structure and 3 stanzas from preview through completed corpus", () => {
    markCurrentSessionProEntitlementComplete();
    const intake = TEST494_INTAKE;
    const draft = test494Draft();
    const raw = buildTest494ThreePartySection10Corpus();
    armAuthority();

    const stages = [
      { label: "preview", text: preparePaidProServerDocumentForAcceptance(raw, draft, intake).text },
    ];

    const prep = preparePaidProFreezeCandidateText({
      text: stages[0]!.text,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    const freezeGated = evaluatePaidProFreezeCandidateGates(prep, {
      text: stages[0]!.text,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    stages.push({ label: "freeze_candidate", text: freezeGated.text });

    markPaidProPipelineValidationPassed({ text: freezeGated.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: freezeGated.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    stages.push({
      label: "freeze_commit",
      text: getFrozenCanonicalAgreementCorpus()?.canonicalText ?? getPaidProSourceOfTruth()!.text,
    });

    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    stages.push({ label: "review", text: review });

    const prepare = getPaidProDocumentForSurface("signer_setup", { draft, intakeText: intake })!.text;
    stages.push({ label: "prepare_signatures", text: prepare });

    const hydrated = applyPaidProNoticeContactAuthority(getPaidProSourceOfTruth()!.text, {
      intakeText: intake,
      draft,
    });
    const authority = {
      parties: TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
      source: "live_ui" as const,
      hash: "test494",
      updatedAt: Date.now(),
    };
    const signer = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: hydrated.text,
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
    }).corpus;
    stages.push({ label: "signer", text: signer });

    for (const { label, text } of stages) {
      assertNoticesStructure(text, label);
      expect(text.match(/10\.\s+Assignment, Dispute Resolution, Notices and Miscellaneous/gi)?.length).toBe(1);
    }
  });
});

describe("TEST494 hydrate authority — frozen manifest reuse", () => {
  beforeEach(() => {
    markCurrentSessionProEntitlementComplete();
  });

  it("hydrate reuses frozen manifest and rejects partyCount 0 when authority is missing", () => {
    const intake = TEST494_INTAKE;
    const draft = test494Draft();
    const raw = buildTest494ThreePartySection10Corpus();
    armAuthority();

    const preview = preparePaidProServerDocumentForAcceptance(raw, draft, intake).text;
    const prep = preparePaidProFreezeCandidateText({
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    const freezeGated = evaluatePaidProFreezeCandidateGates(prep, {
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    expect(freezeGated.ok).toBe(true);

    markPaidProPipelineValidationPassed({ text: freezeGated.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: freezeGated.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const frozenRecord = getFrozenCanonicalAgreementCorpus()!;
    const text = frozenRecord.canonicalText;
    const hash = frozenRecord.hash;
    clearPaidProSourceOfTruth();
    freezeCanonicalAgreementSnapshot(frozenRecord, "server_full_document_text");

    const ctx = resolvePaidProHydrateStructuralContext({
      text,
      hash,
      intakeText: intake,
      draft,
    });
    expect(ctx.canonicalAuthorityPartyCount).toBe(3);
    expect(ctx.replayFromFrozenHash).toBe(true);
    expect(ctx.manifestSource).toMatch(/frozen_snapshot|consumed_authority/);
    assertPaidProHydrateAuthorityInvariant(ctx);

    const hydrated = hydratePaidProSourceOfTruth({
      text,
      hash,
      source: "server_full_draft",
      intakeText: intake,
      draft,
    });
    expect(hydrated?.text.length).toBeGreaterThan(2500);
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(hydrated!.text)).toBe(false);

    expect(() =>
      assertPaidProHydrateAuthorityInvariant({
        structuralParties: [],
        draftPartyNames: [],
        handoffPartySlots: 0,
        canonicalAuthorityPartyCount: 0,
        replayFromFrozenHash: false,
        manifestSource: "none",
      }),
    ).toThrow(/paid-pro-hydrate-authority-blocked/);
  });
});

describe("TEST490 gate regression (preserved)", () => {
  it("pre-payment Pro gate still lists 3 clean parties", () => {
    const gate = assessStarterComplexityGate(TEST494_INTAKE);
    expect(gate.parties).toEqual([TEST490_STONEBRIDGE, TEST490_NOVAPATH, TEST490_CLEARSPRING]);
    expect(formatStarterMultiPartyGatePartyLines(gate.parties).join("|")).not.toMatch(/:\s*\d+\s*%/);
  });
});
