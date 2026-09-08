/** @vitest-environment jsdom */
/**
 * Already-paid Pro homepage dump (post-#240 / #241): create-flow-entitlement-transition
 * logged paid_pro while ABI remounted. Dual home-create-submit aborted the first
 * premium-full-draft after OPTIONS (OPTIONS_ONLY, no POST).
 *
 * Fix is at the remount source: stable ABI key + hide never flips on entitlement
 * tick when the workspace is already entitled. Do not re-land #233/#238 dump-intent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  setCachedAccessToken,
  clearCachedAccessToken,
} from "../../auth/authAccessTokenCache";
import {
  resolveStableCreateIntakeMountKey,
  shouldChangeCreateIntakeMountKeyOnEntitlementTick,
  shouldHideAgreementEditor,
  shouldKeepCreateEditorMountedAcrossAuthRefresh,
} from "../../launch/simpleProduct/createEntitlementUi";
import {
  shouldRemountAgreementBuilderIntakeOnEntitlementTick,
  shouldStartCreateFromPaidProShell,
} from "./createFlowEntitlementTransition";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  shouldFailClosedPremiumProcessingWithoutPfd,
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

const h = vi.hoisted(() => ({ posts: 0 }));

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

function simulateEntitledProHomepageDumpMount(tick: {
  commercialEntitlementReady: boolean;
  alreadyEntitledPro: boolean;
}) {
  const keep = shouldKeepCreateEditorMountedAcrossAuthRefresh({
    homeHeroAutoGenerate: true,
    editorHasBeenShown: true,
    entitledRewriteInFlight: true,
    alreadyEntitledPro: tick.alreadyEntitledPro,
  });
  const hide = shouldHideAgreementEditor({
    editorGatedUntilEntitlement: !tick.commercialEntitlementReady,
    showAccessChoiceScreen: false,
    entitlementProbeBlocked: false,
    awaitingAuthWorkspace: !tick.commercialEntitlementReady,
    keepEditorMounted: keep,
  });
  const intakeKey = resolveStableCreateIntakeMountKey({
    usingTemplate: false,
    pasteOnly: false,
    heroHandoff: { text: NORTHLINE_CANONICAL, voiceFinalize: false },
    alreadyEntitledPro: tick.alreadyEntitledPro,
    homeHeroAutoGenerate: true,
  });
  return { keep, hide, intakeKey };
}

describe("already-entitled Pro stable ABI mount (Northline pfd POST)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPremiumGenerationCallAudit();
    clearCachedAccessToken();
    h.posts = 0;
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
      readFileSync(join(__dirname, "createFlowEntitlementTransition.ts"), "utf8"),
      readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"), "utf8"),
      readFileSync(join(__dirname, "../../launch/simpleProduct/createEntitlementUi.ts"), "utf8"),
    ];
    for (const src of files) {
      expect(src).not.toContain("homeCreateDumpIntent");
      expect(src).not.toContain("shouldJoinHomeCreateDumpSubmit");
      expect(src).not.toContain("shouldSkipSecondHomeCreateSubmit");
      expect(src).not.toContain("tryBeginHomeCreateDumpIntent");
      expect(src).not.toContain("joinHomeCreateDumpFlight");
    }
  });

  it("SimpleCreatePage mounts ABI once from paid_pro and does not remount on entitlement tick", () => {
    const page = readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("shouldStartCreateFromPaidProShell");
    expect(page).toContain("resolveCreateFlowEntitlementSyncForSubmit");
    expect(page).toContain("shouldHideAgreementEditor");
    expect(page).toContain("resolveStableCreateIntakeMountKey");
    expect(page).toContain("keepEditorMountedRef");
    expect(page).toContain("key={intakeKey}");
    expect(page).toContain("{!hideAgreementEditor ? (");
    const effectStart = page.indexOf("Mid-dump TOKEN_REFRESHED remounted intake");
    expect(effectStart).toBeGreaterThan(0);
    const effectDeps = page.slice(effectStart, effectStart + 1600);
    expect(effectDeps).toContain("keepEditorMountedRef.current");
    expect(effectDeps).toContain("probesReady,\n    isReallyAuthenticated,\n    workspaceOrgId,\n    authSession?.access_token,");
    expect(effectDeps).not.toContain("keepEditorMountedAcrossAuthRefresh,");
    expect(page).not.toContain("homeCreateDumpIntent");
  });

  it("already-entitled Pro homepage dump does not remount ABI on entitlement tick", () => {
    expect(shouldStartCreateFromPaidProShell({ workspaceAlreadyEntitled: true })).toBe(true);
    const beforeReady = simulateEntitledProHomepageDumpMount({
      commercialEntitlementReady: false,
      alreadyEntitledPro: true,
    });
    const afterTransition = simulateEntitledProHomepageDumpMount({
      commercialEntitlementReady: true,
      alreadyEntitledPro: true,
    });
    expect(beforeReady.keep).toBe(true);
    expect(afterTransition.keep).toBe(true);
    expect(beforeReady.hide).toBe(false);
    expect(afterTransition.hide).toBe(false);
    expect(beforeReady.intakeKey).toBe("create-intake-stable");
    expect(afterTransition.intakeKey).toBe(beforeReady.intakeKey);
    expect(
      shouldChangeCreateIntakeMountKeyOnEntitlementTick({
        previousKey: beforeReady.intakeKey,
        nextKey: afterTransition.intakeKey,
        keepEditorMounted: afterTransition.keep,
      }),
    ).toBe(false);
    expect(
      shouldRemountAgreementBuilderIntakeOnEntitlementTick({
        keepEditorMounted: afterTransition.keep,
        hideAgreementEditor: afterTransition.hide,
        previousIntakeKey: beforeReady.intakeKey,
        nextIntakeKey: afterTransition.intakeKey,
      }),
    ).toBe(false);
  });

  it("dual home-create-submit does not abort first pfd before POST", async () => {
    setCachedAccessToken("northline-entitled-bearer");
    vi.stubEnv("MODE", "development");
    const firstPfd = new AbortController();
    const remount = shouldRemountAgreementBuilderIntakeOnEntitlementTick({
      keepEditorMounted: true,
      hideAgreementEditor: false,
      previousIntakeKey: "create-intake-stable",
      nextIntakeKey: "create-intake-stable",
    });
    expect(remount).toBe(false);

    let releaseFetch: ((value: ReturnType<typeof northlineFetchResponse>) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.signal?.aborted).not.toBe(true);
      return new Promise((resolve) => {
        releaseFetch = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

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
      agreementGenerationId: "gen-northline-stable-abi",
      networkCallReason: "unknown",
      signal: firstPfd.signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/agreements/premium-full-draft");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");

    // Proven live failure: entitlement tick remounted ABI and aborted the first
    // pfd after OPTIONS. Stable mount must not abort that signal.
    if (remount) {
      firstPfd.abort("create-flow-entitlement-transition");
    }
    expect(firstPfd.signal.aborted).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).not.toBe(true);

    releaseFetch?.(northlineFetchResponse());
    const result = await pending;
    expect(result.document_text).toContain("SERVICES AGREEMENT");
    expect(result.document_text).toContain("Northline Robotics LLC");
  });

  it("Northline-shaped entitled dump completes pfd POST 200 with valid PremiumNetworkCallReason", async () => {
    setCachedAccessToken("northline-entitled-bearer");
    vi.stubEnv("MODE", "development");
    const fetchMock = vi.fn().mockResolvedValue(northlineFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect(tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-northline-stable" })).toBe(
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
      agreementGenerationId: "gen-northline-stable",
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
    expect(readPremiumGenerationCallRecords().filter((r) => r.reason === "entitled_rewrite")).toHaveLength(1);
    releaseEntitledPremiumRewriteProcessInFlight();
  });

  it("KEEP #226 60s named-2p no-pfd failsafe and #231 never-steal", () => {
    expect(CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS).toBe(60_000);
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
  });
});
