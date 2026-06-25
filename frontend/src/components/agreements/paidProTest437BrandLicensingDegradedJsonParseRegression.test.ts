/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import {
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
  resolveReadonlyHtmlSignerCount,
} from "./signerCountAuthority";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  buildTest437DegradedJsonParseDocumentText,
  TEST437_BRAND_LICENSING_INTAKE,
  test437AllParties,
  test437BrandLicensingDraft,
} from "./paidProTest437BrandLicensingFixtures";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { buildPremiumPostCheckoutLocalRecoveryProDraft } from "./premiumNetworkRecoveryLocalDraft";

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

function degradedJsonParseResult(documentText: string): PremiumFullDraftResult {
  return {
    title: "Brand Licensing and Distribution Agreement",
    agreement_family: "licensing_agreement",
    document_text: documentText,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
  };
}

describe("TEST437 — Brand Licensing degraded json_parse without server_full", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
      true;
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearCurrentSessionProEntitlementMarkers();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("degraded wire body is substantive but has no server_full on wire", () => {
    const degraded = buildTest437DegradedJsonParseDocumentText();
    expect(degraded.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });

  it("deterministic local recovery satisfies display gates for brand licensing intake", () => {
    const draft = test437BrandLicensingDraft();
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST437_BRAND_LICENSING_INTAKE,
      intakeLower: TEST437_BRAND_LICENSING_INTAKE.toLowerCase(),
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, JSON.stringify(localRecovery.reasons)).toBe(true);
    const preview = previewPostCheckoutRecoverySotCommit({
      body: localRecovery.body,
      draft,
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    for (const name of test437AllParties()) {
      expect(localRecovery.body).toMatch(new RegExp(name.replace(/\./g, "\\."), "i"));
    }
  });

  it("readonly html signer count stays 4 for labeled brand licensing intake", () => {
    const draft = test437BrandLicensingDraft();
    const partyNames = draft.parties!.map((p) => String(p.name ?? ""));
    const count = resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html", {
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      draftPartyNames: partyNames,
      partyNames,
      corpusPlain: buildTest437DegradedJsonParseDocumentText(),
      manifestPartyCount: 4,
    });
    expect(count).toBe(4);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST437_BRAND_LICENSING_INTAKE,
        draftPartyNames: partyNames,
        manifestPartyCount: 4,
      }).count,
    ).toBe(4);
  });

  it("readonly html without intake must not collapse below four derived party names", () => {
    const partyNames = [...test437AllParties()];
    expect(
      resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html:derived_party_names", {
        intakeText: "",
        draftPartyNames: partyNames.slice(0, 2),
        partyNames,
        corpusPlain: buildTest437DegradedJsonParseDocumentText(),
      }),
    ).toBe(4);
  });

  it("two-party draft slots do not collapse readonly signer count when intake has four labeled parties", () => {
    const twoPartyDraft = {
      ...test437BrandLicensingDraft(),
      parties: test437BrandLicensingDraft().parties!.slice(0, 2),
    };
    const partyNames = twoPartyDraft.parties!.map((p) => String(p.name ?? ""));
    const degraded = buildTest437DegradedJsonParseDocumentText();
    expect(
      resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html", {
        intakeText: TEST437_BRAND_LICENSING_INTAKE,
        draftPartyNames: partyNames,
        partyNames,
        corpusPlain: degraded,
      }),
    ).toBe(4);
    expect(
      consumeAuthoritativeSignerCount(
        "enforcePaidProSingleExecutionBlock",
        {
          intakeText: TEST437_BRAND_LICENSING_INTAKE,
          draftPartyNames: partyNames,
          manifestPartyCount: 4,
        },
        4,
      ),
    ).toBe(4);
  });

  it("pipeline never labels degraded document_text-only as server_full_draft — recovery or clean reject", async () => {
    const degraded = buildTest437DegradedJsonParseDocumentText();
    const draft = test437BrandLicensingDraft();
    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      degradedJsonParseResult(degraded),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      originalUserIntakeRawForMerge: TEST437_BRAND_LICENSING_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test437-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test437",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumRenderSource).not.toMatch(/^server_full_draft$/);
    expect(out.premiumRenderSource).not.toMatch(/^server_full_draft_retry$/);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(4000);

    const postPipelineRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: out.premiumDraft,
      rawIntake: TEST437_BRAND_LICENSING_INTAKE,
      intakeLower: TEST437_BRAND_LICENSING_INTAKE.toLowerCase(),
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    const postPipelinePreview = postPipelineRecovery.ok
      ? previewPostCheckoutRecoverySotCommit({
          body: postPipelineRecovery.body,
          draft: out.premiumDraft,
          intakeText: TEST437_BRAND_LICENSING_INTAKE,
          premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
        })
      : null;
    expect(
      postPipelineRecovery.ok,
      `post-pipeline local recovery failed: ${JSON.stringify(postPipelineRecovery.reasons)}`,
    ).toBe(true);
    expect(postPipelinePreview?.eligible, postPipelinePreview?.blockReason).toBe(true);

    expect(
      consumeAuthoritativeSignerCount(
        "premium_agreement_readonly_html",
        {
          intakeText: TEST437_BRAND_LICENSING_INTAKE,
          draftPartyNames: test437AllParties(),
          manifestPartyCount: 4,
          corpusPlain: out.winningPremiumBodyText,
        },
        4,
      ),
    ).toBe(4);
    const html = buildPremiumAgreementReadonlyHtml(out.winningPremiumBodyText, {
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      partyNames: [...test437AllParties()],
      draftPartyNames: [...test437AllParties()],
    });
    expect(html.length).toBeGreaterThan(500);
    for (const name of test437AllParties()) {
      expect(html).toMatch(new RegExp(name.replace(/\./g, "\\."), "i"));
    }
  });
});
