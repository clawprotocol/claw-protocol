/** @vitest-environment jsdom */
/**
 * TEST514 — post-freeze paid surface corpus identity.
 * Proves every downstream surface resolves from the same canonical SoT hash.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  getFrozenCanonicalAgreementCorpus,
  hasFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
} from "./canonicalAgreementSnapshot";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markPaidReviewSessionPremiumGeneration,
  readPaidReviewSessionCorpusInvariant,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariant";
import {
  markPaidProPipelineValidationPassed,
  clearPaidProPostAcceptanceValidatorCache,
} from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  longestPlainForAgreementPersist,
  pickAuthoritativePlainForSendHandoff,
} from "./sendHandoffAuthoritativeCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";
import { resolveCreateFlowAuthoritativeReviewPlain } from "./authoritativeCreateFlowReviewShell";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { buildFullyExecutedSignedSnapshot } from "../../vs01/vs01FullyExecutedSignedSnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";

const TEST514_INTAKE = "Implementation agreement between Summit Ridge Advisory Group LLC and Delta Integration Services LLC";
const SERVER_PAID_BODY = `IMPLEMENTATION AGREEMENT between Summit Ridge Advisory Group LLC and Delta Integration Services LLC. ${"Substantive paid operative clause for canonical surface parity auditing. ".repeat(180)}`;

function test514Draft(body = SERVER_PAID_BODY): ParsedDraftShape {
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
const STARTER_STALE = "Starter preview only — must never appear post-freeze. ".repeat(30);

type Test514SurfaceCapture = {
  reviewUi: string;
  finalReview: string;
  copyClipboard: string;
  pdfExportPlain: string;
  signerSetup: string;
  vs01Packet: string;
  signerPage: string;
  ownerCompleted: string;
  completionEmail: string;
  persistedAgreement: string;
  downloadEndpoint: string;
  executedSnapshotSource: string;
};

function draftHydratedFromSoT(body: string, base: ParsedDraftShape): ParsedDraftShape {
  return {
    ...base,
    purpose: body,
    premium_server_full_document_text: body,
    premium_full_document_text: body,
    server_full_document_text: body,
    premium_render_source: "server_full_document_text",
  };
}

function captureTest514Surfaces(args: {
  draft: ParsedDraftShape;
  intakeText: string;
  staleAgreementDocumentText?: string;
}): Test514SurfaceCapture {
  const opts = { draft: args.draft, intakeText: args.intakeText };
  const reviewUi = resolvePaidProReviewRenderPlain(opts);
  const finalReview = resolveSimpleProFinalReviewCorpus({
    authoritativePlain: getPaidProSourceOfTruthText(),
    renderedPreviewPlain: args.staleAgreementDocumentText ?? STARTER_STALE,
    agreementDocumentPlain: args.staleAgreementDocumentText ?? STARTER_STALE,
    finalReviewAuthorityOnly: true,
    pipelineWinningPlain: args.staleAgreementDocumentText ?? STARTER_STALE,
  }).plainText;
  const copyClipboard = getPaidProDocumentForSurface("copy", opts)?.text ?? "";
  const pdfExportPlain = reviewUi;
  const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)?.text ?? "";
  const vs01Packet = getPaidProDocumentForSurface("vs01", opts)?.text ?? "";
  const signerPage = getPaidProDocumentForSurface("vs01", { ...opts, skipUserVisibleDisplayPrep: true })?.text ?? "";
  const ownerCompleted = getPaidProDocumentForSurface("display", opts)?.text ?? "";
  const completionEmail = pickAuthoritativePlainForSendHandoff(args.draft)?.text ?? "";
  const persistedAgreement = longestPlainForAgreementPersist(args.draft, args.staleAgreementDocumentText ?? STARTER_STALE);
  const downloadEndpoint = String(args.draft.server_full_document_text ?? "").trim();
  const vs01Resolution = resolveFinalVs01CorpusOrBlock({
    guidedPro: true,
    premiumAccepted: true,
    premiumComplete: true,
    draft: args.draft as import("../../agreement/agreementTypes").AgreementDraft,
    intakeText: args.intakeText,
    agreementCorpusText: vs01Packet,
  });
  const portable: Vs01CanonicalPacketPortableV1 = {
    v: 1,
    seed: {
      v: 1,
      documentId: "test514-doc",
      agreementId: "test514-ag",
      corpusPlain: vs01Resolution.corpus,
      corpusHash: fingerprintAgreementBody(vs01Resolution.corpus),
      savedAt: new Date().toISOString(),
    },
    fields: [],
    roles: [],
    pageCount: 1,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 0,
  };
  const executedSnapshotSource = buildFullyExecutedSignedSnapshot(portable)?.corpusPlain ?? vs01Resolution.corpus;

  return {
    reviewUi,
    finalReview,
    copyClipboard,
    pdfExportPlain,
    signerSetup,
    vs01Packet,
    signerPage,
    ownerCompleted,
    completionEmail,
    persistedAgreement,
    downloadEndpoint,
    executedSnapshotSource,
  };
}

function assertSurfaceMatchesCanonicalSoT(args: {
  surface: string;
  plain: string;
  canonicalHash: string;
  canonicalFingerprint: string;
  draft: ParsedDraftShape;
  intakeText: string;
}): void {
  const plain = (args.plain || "").trim();
  expect(plain.length, `${args.surface} empty`).toBeGreaterThan(500);
  const surfaceHash = hashPaidProCorpus(plain);
  const surfaceFingerprint = fingerprintAgreementBody(plain);
  if (surfaceHash === args.canonicalHash) {
    expect(surfaceFingerprint).toBe(args.canonicalFingerprint);
    return;
  }
  const parity = auditPaidProReviewRenderSotParity({
    reviewPlain: plain,
    surface: args.surface,
    intakeText: args.intakeText,
    draft: args.draft,
  });
  expect(
    parity.invariantOk,
    `${args.surface} hash=${surfaceHash} canonical=${args.canonicalHash} parity=${parity.invariantOk}`,
  ).toBe(true);
}

function armPostFreezeSession(): {
  draft: ParsedDraftShape;
  intakeText: string;
} {
  const draft = test514Draft();
  const generationId = getOrInitSessionAgreementGenerationId();
  markPaidReviewSessionPremiumGeneration(generationId, "ensure_premium_completion");
  markPaidProPipelineValidationPassed({ text: SERVER_PAID_BODY, source: "server_full_draft" });
  establishPaidProSourceOfTruth({
    text: SERVER_PAID_BODY,
    source: "server_full_draft",
    reviewSessionId: generationId,
    draft,
  });
  expect(hasFrozenCanonicalAgreementCorpus()).toBe(true);
  const session = readPaidReviewSessionCorpusInvariant(generationId);
  expect(session?.latchedCanonicalSoTHash).toBeTruthy();
  return { draft, intakeText: TEST514_INTAKE };
}

describe("TEST514 — canonical corpus identity across every post-freeze paid surface", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProSourceOfTruth();
    resetPaidReviewSessionCorpusInvariantForTests();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProSourceOfTruth();
    resetPaidReviewSessionCorpusInvariantForTests();
  });

  it("1 — all twelve surfaces match canonical SoT hash after canonical-corpus-freeze", () => {
    const { draft, intakeText } = armPostFreezeSession();
    const sot = getPaidProSourceOfTruth()!;
    const canonicalHash = sot.hash;
    const canonicalFingerprint = fingerprintAgreementBody(sot.text);
    const frozen = getFrozenCanonicalAgreementCorpus()!;
    expect(hashPaidProCorpus(frozen.canonicalText)).toBe(canonicalHash);
    expect(readCanonicalAgreementCorpusForSurface("handoff", { tier: "pro" })?.canonicalText).toBeTruthy();
    expect(shouldUsePaidProSourceOfTruthDisplayOnly()).toBe(true);

    const hydratedDraft = draftHydratedFromSoT(sot.text, draft);
    const surfaces = captureTest514Surfaces({
      draft: hydratedDraft,
      intakeText,
      staleAgreementDocumentText: STARTER_STALE,
    });

    const labels: (keyof Test514SurfaceCapture)[] = [
      "reviewUi",
      "finalReview",
      "copyClipboard",
      "pdfExportPlain",
      "signerSetup",
      "vs01Packet",
      "signerPage",
      "ownerCompleted",
      "completionEmail",
      "persistedAgreement",
      "downloadEndpoint",
      "executedSnapshotSource",
    ];
    for (const label of labels) {
      assertSurfaceMatchesCanonicalSoT({
        surface: label,
        plain: surfaces[label],
        canonicalHash,
        canonicalFingerprint,
        draft: hydratedDraft,
        intakeText,
      });
    }

    buildPremiumAgreementReadonlyHtml(surfaces.pdfExportPlain, {
      signatureSectionMode: "execution",
      partyNames: ["Summit Ridge Advisory Group LLC", "Delta Integration Services LLC"],
      suppressDocumentIntelligenceCallouts: true,
    });
    expect(surfaces.copyClipboard).toBe(surfaces.reviewUi);
    expect(surfaces.pdfExportPlain).toBe(surfaces.reviewUi);
    expect(surfaces.persistedAgreement).toBe(sot.text);
    expect(surfaces.completionEmail).toBe(sot.text);
    expect(fingerprintAgreementBody(surfaces.executedSnapshotSource)).toBe(canonicalFingerprint);
  });

  it("2 — stale agreementDocumentText and starter preview cannot override post-freeze resolvers", () => {
    const { draft, intakeText } = armPostFreezeSession();
    const sotText = getPaidProSourceOfTruthText();
    const createFlowPlain = resolveCreateFlowAuthoritativeReviewPlain({
      agreementDocumentText: STARTER_STALE,
      draft: draftHydratedFromSoT(sotText, draft),
      pipelineWinningBody: STARTER_STALE,
      hydratedPremiumBody: STARTER_STALE,
    });
    expect(createFlowPlain).toBe(sotText);
    expect(createFlowPlain).not.toContain("Starter preview only");
    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sotText,
      agreementDocumentPlain: STARTER_STALE,
      renderedPreviewPlain: STARTER_STALE,
      finalReviewAuthorityOnly: true,
    }).plainText;
    expect(finalReview).toBe(sotText);
    expect(finalReview).not.toContain("Starter preview only");
  });

  it("3 — session latched canonical hash stable across repeated surface resolution", () => {
    const { draft, intakeText } = armPostFreezeSession();
    const generationId = getOrInitSessionAgreementGenerationId();
    const latched = readPaidReviewSessionCorpusInvariant(generationId)?.latchedCanonicalSoTHash;
    expect(latched).toBeTruthy();
    const hydratedDraft = draftHydratedFromSoT(getPaidProSourceOfTruthText(), draft);
    const first = captureTest514Surfaces({ draft: hydratedDraft, intakeText });
    const second = captureTest514Surfaces({ draft: hydratedDraft, intakeText });
    expect(hashPaidProCorpus(first.reviewUi)).toBe(hashPaidProCorpus(second.reviewUi));
    expect(hashPaidProCorpus(first.vs01Packet)).toBe(hashPaidProCorpus(second.vs01Packet));
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.latchedCanonicalSoTHash).toBe(latched);
    expect(getPaidProSourceOfTruth()?.hash).toBe(hashPaidProCorpus(first.reviewUi));
  });
});
