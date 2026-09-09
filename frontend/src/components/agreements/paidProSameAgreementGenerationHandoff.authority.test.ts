/** @vitest-environment jsdom */
/**
 * Same-agreement generation handoff authority.
 *
 * Existing paid AGREEMENT_A (resume authority already set)
 * → entitled rewrite reads that ID
 * → ensurePremiumCompletion / runPremiumCompletion
 * → postPremiumFullDraftOnce request body agreement_id === A
 * → successful corpus through production success handling
 * → resume/handoff ID remains A
 * → POST /api/agreements/draft (postNewDraft) is not called
 *
 * Network mock is only the fetch/provider boundary. Request identity is built by
 * production postPremiumFullDraftOnce. WithRetry is delegated to Once because
 * WithRetry short-circuits in Vitest (`test_mode_skipped`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId, shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { ensurePremiumCompletion } from "./premiumCompletionEnsure";
import { clearPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { TEST501_ACCEPTED_PAID_BODY, TEST501_INTAKE } from "./paidProTest501Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { persistWorkspaceAgreementAfterReviewReady } from "./paidProReviewReadyWorkspacePersist";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { resolveCanonicalPaidProReviewCorpus } from "./enterCanonicalPaidProReviewFlow";
import { resolveCreateFlowPaidReviewDisplayPlain } from "./paidProCreateFlowReviewHandoff";
import { resolveAuthoritativePremiumSnapshotPlain } from "./premiumAuthoritativeBodyPreservation";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import {
  prepareCommercialReviewSnapshotAuthority,
  sha256CorpusDigest,
} from "../../agreement/canonicalReviewSnapshotApi";

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...actual,
    postPremiumFullDraftWithRetry: async (args: Parameters<typeof actual.postPremiumFullDraftOnce>[0]) => {
      try {
        const result = await actual.postPremiumFullDraftOnce(args);
        return { ok: true as const, result };
      } catch (err) {
        return {
          ok: false as const,
          failure_kind: "http" as const,
          retryable: true,
          error_code: err instanceof Error ? err.message : "http_error",
          document_text: "" as const,
          attemptCount: 1,
        };
      }
    },
  };
});

function existingPaidAgreementDraft(): ParsedDraftShape {
  return {
    title: "Professional Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "Professional technology and consulting services.",
    payment_terms: "$96,000 milestone installments",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 96000, cadence: null, valid: true },
    agreement_family: "consulting_agreement",
  };
}

/** Production entitled-rewrite selectors immediately before prepareCommercialReviewSnapshotAuthority. */
function selectEntitledReviewCorpusForSnapshotPrepare(args: {
  winningBody: string;
  pipelineSource: string;
  draft: ParsedDraftShape;
  intakeText: string;
}): string {
  const winning = args.winningBody.trim();
  const resolvedPersist = resolvePremiumRenderSource({
    draft: args.draft,
    intakeText: args.intakeText,
    premiumWinningCorpusFallback: winning,
    paidAuthoritativeProBody: winning,
    hydratedAuthoritativeBodyHint: winning,
    buildLivePreview: () =>
      buildAgreementPreviewTextCore(args.draft, {
        starterPreview: false,
        premiumDeliverablePreview: true,
      }),
  });
  const snapshotCoalesce = resolveAuthoritativePremiumSnapshotPlain({
    winningBody: winning,
    resolvedText: resolvedPersist.text,
    pipelineSource: args.pipelineSource,
    resolvedSource: resolvedPersist.premium_render_source,
    intakeText: args.intakeText,
    draft: args.draft,
  });
  const snapshotPlain = snapshotCoalesce.text.trim();
  const acceptedCorpusPlain = resolveCanonicalPaidProReviewCorpus({
    winningBody: winning,
    snapshotPlain,
    draft: args.draft,
    agreementDocumentText: "",
    pipelineWinningBody: winning,
    hydratedPremiumBody: "",
    premiumDeliverablePlain: buildAgreementPreviewTextCore(args.draft, {
      starterPreview: false,
      premiumDeliverablePreview: true,
      intakeText: args.intakeText,
    }).trim(),
  });
  return resolveCreateFlowPaidReviewDisplayPlain({
    winningBody: acceptedCorpusPlain || winning,
    snapshotPlain: acceptedCorpusPlain || snapshotPlain,
    pipelineSource: args.pipelineSource,
    handoffBody: (acceptedCorpusPlain || winning || snapshotPlain).trim(),
    handoffEstablished: false,
  }).trim();
}

function successfulPremiumFullDraftWire(): PremiumFullDraftResult {
  return {
    title: "Professional Services Agreement",
    agreement_family: "consulting_agreement",
    document_text: TEST501_ACCEPTED_PAID_BODY,
    server_full_document_text: TEST501_ACCEPTED_PAID_BODY,
    authoritative_draft: TEST501_ACCEPTED_PAID_BODY,
    key_terms_found: ["Fees", "Confidentiality", "Governing law"],
    missing_material_info: [],
    generation_outcome: "ok",
    generation_ok: true,
    retryable: false,
  };
}

describe("same-agreement generation handoff authority", () => {
  const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPremiumCompletionSnapshot();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    getOrInitSessionAgreementGenerationId();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPremiumCompletionSnapshot();
    clearCurrentSessionProEntitlementMarkers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("existing paid agreement ID is sent to premium-full-draft and is not replaced", async () => {
    const rewriteMint = intakeSrc.slice(
      intakeSrc.indexOf("let agreementIdForPass ="),
      intakeSrc.indexOf("premiumGenerationCallReason: \"entitled_rewrite\""),
    );
    expect(rewriteMint).toContain("readCreateReviewAgreementResumeId()");
    expect(rewriteMint).toContain("if (!agreementIdForPass)");
    expect(rewriteMint).toContain("postNewDraft");
    expect(rewriteMint).toContain("agreementId: agreementIdForPass");
    const postMintSnapshot = intakeSrc.slice(
      intakeSrc.indexOf("reviewAgreementIdRef.current = agreementIdForPass;"),
      intakeSrc.indexOf("prepareCommercialReviewSnapshotAuthority({"),
    );
    expect(postMintSnapshot).toContain("writeCreateReviewAgreementResumeId(agreementIdForPass)");
    const prepareCallSite = intakeSrc.slice(
      intakeSrc.indexOf("const prepared = await prepareCommercialReviewSnapshotAuthority({"),
      intakeSrc.indexOf("generationSessionId: result.agreementGenerationId ?? sessionGenForPass"),
    );
    expect(prepareCallSite).toContain("agreementId: agreementIdForPass");
    expect(prepareCallSite).toContain("corpusPlain: entitledReviewCorpus");

    const preGenerationAgreementId = "54ce3926-7c60-47a9-b878-527dc155477a";
    writeCreateReviewAgreementResumeId(preGenerationAgreementId);

    const agreementIdForPass =
      (readCreateReviewAgreementResumeId() || "").trim() || null;
    expect(agreementIdForPass).toBe(preGenerationAgreementId);
    const wouldMintReplacement = !agreementIdForPass;
    expect(wouldMintReplacement).toBe(false);

    const persistGate = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      existingAgreementId: agreementIdForPass,
      skipFreeStarterCreateSubmit: true,
      ensurePersist: async () => {
        throw new Error("postNewDraft must not run for an existing paid agreement");
      },
    });
    expect(persistGate).toEqual({
      ok: true,
      agreementId: preGenerationAgreementId,
      created: false,
    });

    const observed = {
      premiumFullDraftBodies: [] as Array<Record<string, unknown>>,
      snapshotPostBodies: [] as Array<Record<string, unknown>>,
      snapshotGetCalls: 0,
      postNewDraftCalls: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || "GET").toUpperCase();
        if (url.includes("/api/agreements/draft") && method === "POST") {
          observed.postNewDraftCalls += 1;
          throw new Error("postNewDraft must not run on the existing-agreement generation path");
        }
        if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
          const raw = String(init?.body || "");
          observed.premiumFullDraftBodies.push(JSON.parse(raw) as Record<string, unknown>);
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => JSON.stringify(successfulPremiumFullDraftWire()),
          } as unknown as Response;
        }
        if (url.includes("/canonical-review-snapshot") && method === "POST") {
          const raw = String(init?.body || "");
          const posted = JSON.parse(raw) as Record<string, unknown>;
          observed.snapshotPostBodies.push(posted);
          const corpus = String(posted.corpus_plain || "").trim();
          const digest = await sha256CorpusDigest(corpus);
          const agreementId = decodeURIComponent(url.split("/api/agreements/")[1]?.split("/")[0] || "");
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
              snapshot: {
                snapshot_id: "crs_gtm_layer1",
                agreement_id: agreementId,
                corpus_plain: corpus,
                corpus_sha256: digest,
                corpus_length: corpus.length,
                status: "pending",
                schema_version: "claw.canonical_review_snapshot/v1",
              },
              registry_version: 1,
            }),
            text: async () => "",
          } as unknown as Response;
        }
        if (url.includes("/canonical-review-snapshot") && method === "GET") {
          observed.snapshotGetCalls += 1;
          const posted = observed.snapshotPostBodies[0];
          const corpus = String(posted?.corpus_plain || "").trim();
          const digest = await sha256CorpusDigest(corpus);
          const agreementId = decodeURIComponent(url.split("/api/agreements/")[1]?.split("/")[0] || "");
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
              status: "pending",
              snapshot: {
                snapshot_id: "crs_gtm_layer1",
                agreement_id: agreementId,
                corpus_plain: corpus,
                corpus_sha256: digest,
                corpus_length: corpus.length,
                status: "pending",
                schema_version: "claw.canonical_review_snapshot/v1",
              },
              registry_version: 1,
            }),
            text: async () => "",
          } as unknown as Response;
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );

    const draft = existingPaidAgreementDraft();
    const result = await ensurePremiumCompletion({
      intakeText: TEST501_INTAKE,
      originalUserIntakeRawForMerge: TEST501_INTAKE,
      structuredDraft: draft,
      agreementFamily: draft.agreement_family ?? null,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => draft,
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
      agreementGenerationId: getOrInitSessionAgreementGenerationId(),
      agreementId: agreementIdForPass,
      premiumRequestIntakeFingerprint: shortIntakeFingerprint(TEST501_INTAKE),
      isPremiumRequestStillValid: () => true,
      premiumGenerationCallReason: "entitled_rewrite",
    });

    expect(observed.premiumFullDraftBodies).toHaveLength(1);
    const requestAgreementId = String(observed.premiumFullDraftBodies[0]?.agreement_id || "");
    expect(requestAgreementId).toBe(preGenerationAgreementId);
    expect(result.staleIntakeOrGeneration).not.toBe(true);
    expect(result.premiumGenerationRetryable).not.toBe(true);
    expect((result.winningPremiumBodyText || "").trim().length).toBeGreaterThan(1000);
    expect((result.winningPremiumBodyText || "").trim()).toContain("Red Mesa Logistics LLC");
    expect(observed.postNewDraftCalls).toBe(0);

    const generationHandoffAgreementId = (readCreateReviewAgreementResumeId() || "").trim();
    expect(generationHandoffAgreementId).toBe(preGenerationAgreementId);

    const generatedCorpus = (result.winningPremiumBodyText || "").trim();
    // Current production selector: server_full_document_text (aliased to document_text on
    // success). Pipeline success handling may polish that selected body; the snapshot
    // handoff must receive the exact corpus generation-success selected, not the raw
    // provider fixture and not a Starter/fallback replacement.
    expect(result.premiumRenderSource).toMatch(/server_full_draft/);
    expect(generatedCorpus).toContain("Red Mesa Logistics LLC");
    expect(generatedCorpus).toContain("Harbor Peak Automation LLC");
    expect(generatedCorpus).toContain("Delaware");
    expect(generatedCorpus.length).toBeGreaterThan(1000);

    const entitledReviewCorpus = selectEntitledReviewCorpusForSnapshotPrepare({
      winningBody: generatedCorpus,
      pipelineSource: result.premiumRenderSource || "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
    });
    expect(entitledReviewCorpus).toBe(generatedCorpus);

    const prepared = await prepareCommercialReviewSnapshotAuthority({
      agreementId: generationHandoffAgreementId,
      corpusPlain: entitledReviewCorpus,
      generationSessionId: getOrInitSessionAgreementGenerationId(),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.code);
    expect(observed.snapshotPostBodies).toHaveLength(1);
    expect(observed.snapshotGetCalls).toBe(1);
    const snapshotPrepareAgreementId = String(prepared.snapshot.agreement_id || "");
    const snapshotPrepareCorpus = String(prepared.snapshot.corpus_plain || "").trim();
    expect(snapshotPrepareAgreementId).toBe(generationHandoffAgreementId);
    expect(snapshotPrepareCorpus).toBe(generatedCorpus);
    expect(String(observed.snapshotPostBodies[0]?.corpus_plain || "").trim()).toBe(generatedCorpus);
    expect(observed.postNewDraftCalls).toBe(0);

    const generatedHash = await sha256CorpusDigest(generatedCorpus);
    const prepareHash = await sha256CorpusDigest(snapshotPrepareCorpus);

    // eslint-disable-next-line no-console
    console.info(
      "J7_SAME_AGREEMENT_GENERATION_HANDOFF_TRACE " +
        `preGenerationAgreementId=${preGenerationAgreementId} ` +
        `request_agreement_id=${requestAgreementId} ` +
        `generation_ok=${Boolean((result.winningPremiumBodyText || "").trim())} ` +
        `render_source=${result.premiumRenderSource} ` +
        `postNewDraft_calls=${observed.postNewDraftCalls} ` +
        `generationHandoffAgreementId=${generationHandoffAgreementId} ` +
        `generatedLen=${generatedCorpus.length} generatedHash=${generatedHash} ` +
        `snapshotPrepareAgreementId=${snapshotPrepareAgreementId} ` +
        `snapshotPrepareLen=${snapshotPrepareCorpus.length} snapshotPrepareHash=${prepareHash}`,
    );
  });
});
