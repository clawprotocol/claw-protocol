/** @vitest-environment jsdom */
/**
 * #240 — entitled Northline dump died OPTIONS-only because TOKEN_REFRESHED /
 * entitlement re-probe remounted SimpleCreatePage and dual-fired
 * home-create-submit. The first premium-full-draft reached request-start /
 * OPTIONS, then the remount aborted before POST.
 *
 * Fix is at the remount source: keep the editor mounted and skip getAuthSession
 * when parse already cached a Bearer. Do not re-land #233/#238 dump-intent
 * shouldSkip / shouldJoin (those skipped or joined the first generate).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  setCachedAccessToken,
  clearCachedAccessToken,
  getCachedAccessToken,
} from "../../auth/authAccessTokenCache";
import {
  shouldGateCreateEditorUntilEntitlementReady,
  shouldKeepCreateEditorMountedAcrossAuthRefresh,
  shouldReplaceCreatePageWithAuthWorkspaceSettling,
  shouldResetCommercialEntitlementReadyOnAuthRefresh,
} from "../../launch/simpleProduct/createEntitlementUi";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  shouldFailClosedPremiumProcessingWithoutPfd,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSkipPartyPrepForOrdinaryNamedTwoParty,
} from "./multiPartyCreateReviewSettle";
import {
  clearPremiumGenerationCallAudit,
  markEntitledPremiumRewriteHttpStarted,
  readPremiumGenerationCallRecords,
  releaseEntitledPremiumRewriteProcessInFlight,
  tryBeginEntitledPremiumRewriteProcessInFlight,
} from "./paidProPremiumGenerationCallAudit";
import { postPremiumFullDraftOnce } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";

const h = vi.hoisted(() => ({ posts: 0, getAuthSessionCalls: 0 }));

vi.mock("../../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(async () => {
    h.getAuthSessionCalls += 1;
    throw new Error("getAuthSession must not run when Bearer is already cached");
  }),
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: (args: Parameters<typeof mod.postPremiumFullDraftWithRetry>[0]) => {
      h.posts += 1;
      return mod.postPremiumFullDraftOnce({
        intakeText: args.intakeText,
        context: args.context,
        userGapAnswers: args.userGapAnswers,
        signal: args.signal,
        agreementGenerationId: args.agreementGenerationId,
        agreementId: args.agreementId,
        networkCallReason: args.networkCallReason,
      }).then((result) => ({ ok: true as const, result }));
    },
  };
});

const NORTHLINE_CANONICAL =
  "Services agreement between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo). Northline delivers robotics integration; Cedar Peak provides analytics. Fee $12,500. Term 6 months. Governing law Texas.";

const NORTHLINE_FP = shortIntakeFingerprint(NORTHLINE_CANONICAL);

const NORTHLINE_CORPUS = [
  "SERVICES AGREEMENT",
  "This Services Agreement (the \"Agreement\") is entered into by and between Northline Robotics LLC (\"Northline\") and Cedar Peak Analytics Inc (\"Cedar Peak\").",
  "Northline shall deliver robotics integration services. Cedar Peak shall provide analytics.",
  "Fee. Cedar Peak shall pay Northline $12,500.",
  "Term. This Agreement remains in effect for six (6) months.",
  "Governing Law. This Agreement is governed by the laws of the State of Texas.",
  "IN WITNESS WHEREOF the parties have executed this Agreement.",
].join("\n\n");

const structured: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Northline Robotics LLC", role: "Service Provider" },
    { name: "Cedar Peak Analytics Inc", role: "Client" },
  ],
  purpose: "Northline delivers robotics integration; Cedar Peak provides analytics.",
  payment_terms: "$12,500",
  duration: "6 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: 12500, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

function northlineFetchResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () =>
      JSON.stringify({
        document_text: NORTHLINE_CORPUS,
        server_full_document_text: NORTHLINE_CORPUS,
        generation_outcome: "ok",
      }),
  };
}

describe("Northline keep-mounted refresh remount (#240)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPremiumGenerationCallAudit();
    clearCachedAccessToken();
    h.posts = 0;
    h.getAuthSessionCalls = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    releaseEntitledPremiumRewriteProcessInFlight();
    clearCachedAccessToken();
  });

  it("does not re-land #233/#238 dump-intent join/skip latches", () => {
    const files = [
      readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8"),
      readFileSync(join(__dirname, "premiumFullDraftApi.ts"), "utf8"),
      readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"), "utf8"),
      readFileSync(join(__dirname, "../../launch/LaunchHomePage.tsx"), "utf8"),
      readFileSync(join(__dirname, "../../launch/homeConversionFlow.test.ts"), "utf8"),
    ];
    for (const src of files) {
      expect(src).not.toContain("homeCreateDumpIntent");
      expect(src).not.toContain("shouldJoinHomeCreateDumpSubmit");
      expect(src).not.toContain("shouldSkipSecondHomeCreateSubmit");
      expect(src).not.toContain("tryBeginHomeCreateDumpIntent");
      expect(src).not.toContain("joinHomeCreateDumpFlight");
    }
  });

  it("SimpleCreatePage keeps the editor mounted across TOKEN_REFRESHED / entitlement re-probe", () => {
    const page = readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("shouldKeepCreateEditorMountedAcrossAuthRefresh");
    expect(page).toContain("shouldResetCommercialEntitlementReadyOnAuthRefresh");
    expect(page).toContain("shouldReplaceCreatePageWithAuthWorkspaceSettling");
    expect(page).toContain("keepEditorMounted: keepEditorMountedAcrossAuthRefresh");
    expect(page).toContain("isEntitledPremiumRewriteProcessInFlight");
    expect(page).toContain("homeHeroAutoGenerate");
    const resetIdx = page.indexOf("shouldResetCommercialEntitlementReadyOnAuthRefresh");
    const setFalseIdx = page.indexOf("setCommercialEntitlementReady(false)");
    expect(resetIdx).toBeGreaterThan(0);
    expect(setFalseIdx).toBeGreaterThan(resetIdx);
    expect(page).toContain("awaitingAuthWorkspace && !keepEditorMountedAcrossAuthRefresh");
    expect(page).not.toContain("homeCreateDumpIntent");
  });

  it("dual remount (token refresh + entitlement flip) does not gate or replace a live dump editor", () => {
    const keep = shouldKeepCreateEditorMountedAcrossAuthRefresh({
      homeHeroAutoGenerate: true,
      editorHasBeenShown: true,
      entitledRewriteInFlight: true,
    });
    expect(keep).toBe(true);
    // First remount: TOKEN_REFRESHED flips ready false.
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
        keepEditorMounted: keep,
      }),
    ).toBe(false);
    expect(shouldResetCommercialEntitlementReadyOnAuthRefresh({ keepEditorMounted: keep })).toBe(false);
    // Second remount: workspace bind / awaitingAuthWorkspace.
    expect(
      shouldReplaceCreatePageWithAuthWorkspaceSettling({
        awaitingAuthWorkspace: true,
        keepEditorMounted: keep,
      }),
    ).toBe(false);
  });

  it("cached Bearer skips getAuthSession so TOKEN_REFRESHED cannot abort the first pfd POST", async () => {
    setCachedAccessToken("northline-cached-bearer");
    expect(getCachedAccessToken()).toBe("northline-cached-bearer");
    const remountAbort = new AbortController();
    let releaseFetch: ((value: ReturnType<typeof northlineFetchResponse>) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.signal?.aborted).not.toBe(true);
      return new Promise((resolve) => {
        releaseFetch = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MODE", "development");

    const pending = postPremiumFullDraftOnce({
      intakeText: NORTHLINE_CANONICAL,
      context: {
        title: structured.title,
        jurisdiction: structured.jurisdiction,
        parties: structured.parties,
        purpose: structured.purpose,
        payment_terms: structured.payment_terms,
        duration: structured.duration,
        due_date: structured.due_date,
        effective_date: structured.effective_date,
        agreement_family: structured.agreement_family ?? "",
        material_asks: [],
      },
      agreementGenerationId: "gen-northline-keep-mounted",
      networkCallReason: "entitled_rewrite",
    });

    expect(h.getAuthSessionCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/agreements/premium-full-draft");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");

    // Dual remount: abort the remount controller (old unmount pattern). The
    // in-flight fetch must not observe that signal.
    remountAbort.abort("token_refreshed_remount");
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
        keepEditorMounted: true,
      }),
    ).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).not.toBe(remountAbort.signal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).not.toBe(true);

    releaseFetch?.(northlineFetchResponse());
    const result = await pending;
    expect(result.document_text).toContain("SERVICES AGREEMENT");
    expect(result.document_text).toContain("Northline Robotics LLC");
    expect(result.document_text).toContain("Cedar Peak Analytics Inc");
    expect(h.getAuthSessionCalls).toBe(0);
  });

  it("Northline-shaped entitled dump completes pfd POST 200 (usable Review corpus)", async () => {
    setCachedAccessToken("northline-cached-bearer");
    vi.stubEnv("MODE", "development");
    const fetchMock = vi.fn().mockResolvedValue(northlineFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect(tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-northline-dump" })).toBe(
      true,
    );
    markEntitledPremiumRewriteHttpStarted();

    const out = await runPremiumCompletion({
      intakeText: NORTHLINE_CANONICAL,
      originalUserIntakeRawForMerge: NORTHLINE_CANONICAL,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-northline-dump",
      premiumRequestIntakeFingerprint: NORTHLINE_FP,
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "entitled_rewrite",
    });

    expect(h.posts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/agreements/premium-full-draft");
    expect(out.winningPremiumBodyText).toContain("SERVICES AGREEMENT");
    expect(out.winningPremiumBodyText).toContain("Northline Robotics LLC");
    expect(out.winningPremiumBodyText).toContain("Cedar Peak Analytics Inc");
    expect(h.getAuthSessionCalls).toBe(0);
    expect(readPremiumGenerationCallRecords().filter((r) => r.reason === "entitled_rewrite")).toHaveLength(1);
    releaseEntitledPremiumRewriteProcessInFlight();
  });

  it("KEEP #226 60s failsafe and #231 never-steal; ordinary named-2p still generates", () => {
    expect(CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS).toBe(60_000);
    expect(
      shouldSkipPartyPrepForOrdinaryNamedTwoParty({
        intakeText: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
        generateComplete: false,
      }),
    ).toBe(true);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(true);
    const audit = readFileSync(join(__dirname, "paidProPremiumGenerationCallAudit.ts"), "utf8");
    expect(audit).toContain("if (entitledPfdFlight) return false");
    expect(audit).not.toContain("lastEntitledRewriteGenerationId !== genId");
    expect(audit).toContain("Never steals on a new generation id");
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("never stolen on a new gen id");
  });
});
