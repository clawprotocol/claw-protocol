/** @vitest-environment jsdom */
/**
 * Live #231 (88ccb982 / index-C9gAXKv6.js) still OPTIONS-only on run1:
 * parse POST 200×2, premium request start ×1, premium response ×0,
 * pfd OPTIONS 204 only, home-create-submit ×2, then #226 60s failsafe.
 *
 * Root cause is not another steal/never-steal latch. The create editor
 * remounts when entitlement re-probes (TOKEN_REFRESHED after
 * refreshCachedAccessToken, or authSession.access_token change). The
 * remount resets homeAutoGenerateStartedRef and fires a second
 * home-create-submit + parse while the first pfd fetch is in preflight.
 * #229–#231 only owned the rewrite; they never single-flighted the
 * create submit, so they oscillated PASS↔FAIL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearCachedAccessToken,
  setCachedAccessToken,
} from "../../auth/authAccessTokenCache";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  clearHomeCreateDumpIntent,
  ensureHomeCreateDumpIntent,
  getHomeCreateDumpFetchSignal,
  isHomeCreateDumpFetchAborted,
  isHomeCreateDumpIntentActive,
  isHomeCreateDumpParseStarted,
  joinHomeCreateDumpFlight,
  markHomeCreateDumpParseStarted,
  readHomeCreateDumpIntent,
  registerHomeCreateDumpFlight,
  resolveHomeCreateDumpFetchSignal,
  shouldJoinHomeCreateDumpSubmit,
  shouldKeepCreateEditorMountedForDump,
  shouldSkipSecondHomeCreateSubmit,
  tryBeginHomeCreateDumpIntent,
} from "../../launch/homeCreateDumpIntent";
import { initializeNewAgreementSession } from "../../launch/newAgreementSessionReset";
import { shouldGateCreateEditorUntilEntitlementReady } from "../../launch/simpleProduct/createEntitlementUi";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  shouldFailClosedPremiumProcessingWithoutPfd,
} from "./multiPartyCreateReviewSettle";
import {
  clearPremiumGenerationCallAudit,
  isEntitledPremiumRewriteProcessInFlight,
  releaseEntitledPremiumRewriteInFlightLatch,
  tryBeginEntitledPremiumRewriteProcessInFlight,
} from "./paidProPremiumGenerationCallAudit";
import { isOptionsOnlyGhostAbort, postPremiumFullDraftOnce } from "./premiumFullDraftApi";

const NORTHLINE =
  "Services agreement between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo). Northline delivers robotics integration; Cedar Peak provides analytics. Fee $12,500. Term 6 months. Governing law Texas.";

const NORTHLINE_FP = shortIntakeFingerprint(NORTHLINE);

const minimalContext = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Northline Robotics LLC", role: "Service Provider" },
    { name: "Cedar Peak Analytics Inc", role: "Client" },
  ],
  purpose: "Northline delivers robotics integration",
  payment_terms: "$12,500",
  duration: "6 months",
  due_date: null as string | null,
  effective_date: null as string | null,
  agreement_family: "services_agreement",
  material_asks: [] as string[],
};

describe("Northline homepage dump intent (OPTIONS-only remount)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPremiumGenerationCallAudit();
    clearHomeCreateDumpIntent();
    clearCachedAccessToken();
  });

  afterEach(() => {
    clearHomeCreateDumpIntent();
    clearCachedAccessToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("second home-create during OPTIONS joins the same promise and does not abort fetch", async () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    let resolveFlight: (v: string) => void = () => undefined;
    const flight = new Promise<string>((resolve) => {
      resolveFlight = resolve;
    });
    registerHomeCreateDumpFlight(flight);
    const dumpSignal = getHomeCreateDumpFetchSignal();
    expect(dumpSignal?.aborted).toBe(false);

    const remountAbort = new AbortController();
    remountAbort.abort(new DOMException("The user aborted a request.", "AbortError"));
    expect(resolveHomeCreateDumpFetchSignal(remountAbort.signal)).toBe(dumpSignal);
    expect(dumpSignal?.aborted).toBe(false);
    expect(isHomeCreateDumpFetchAborted()).toBe(false);

    expect(shouldJoinHomeCreateDumpSubmit()).toBe(true);
    const joined = joinHomeCreateDumpFlight();
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(false);

    resolveFlight("dump1-settled");
    await expect(joined).resolves.toBe("dump1-settled");
    expect(getHomeCreateDumpFetchSignal()?.aborted).toBe(false);
  });

  it("Northline-shaped dump completes pfd POST after remount abort is dropped", async () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    setCachedAccessToken("northline-session-token");
    const remountAbort = new AbortController();
    remountAbort.abort(new DOMException("The user aborted a request.", "AbortError"));
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect((init.signal as AbortSignal | undefined)?.aborted).toBe(false);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            document_text: "x".repeat(900),
            server_full_document_text: "x".repeat(900),
            generation_outcome: "ok",
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPremiumFullDraftOnce({
      intakeText: NORTHLINE,
      context: minimalContext,
      signal: remountAbort.signal,
      networkCallReason: "entitled_rewrite",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.document_text.length).toBeGreaterThanOrEqual(500);
    expect(isHomeCreateDumpFetchAborted()).toBe(false);
  });

  it("request-start then remount AbortError retries to POST (never OPTIONS-only ghost)", async () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    setCachedAccessToken("northline-session-token");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              document_text: "x".repeat(900),
              server_full_document_text: "x".repeat(900),
              generation_outcome: "ok",
            }),
        });
      }),
    );

    expect(isOptionsOnlyGhostAbort(new DOMException("The user aborted a request.", "AbortError"))).toBe(
      true,
    );
    expect(
      isOptionsOnlyGhostAbort(new DOMException("premium_full_draft_fetch_timeout", "AbortError")),
    ).toBe(false);

    const result = await postPremiumFullDraftOnce({
      intakeText: NORTHLINE,
      context: minimalContext,
      networkCallReason: "entitled_rewrite",
    });
    expect(result.document_text.length).toBeGreaterThanOrEqual(500);
    expect(calls).toBe(2);
    expect(isHomeCreateDumpFetchAborted()).toBe(false);
  });

  it("second home-create-submit / remount cannot start another parse while dump1 pfd is in OPTIONS", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    expect(tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-dump-1" })).toBe(
      true,
    );

    // Remount: refs reset, layout effect runs again.
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(false);
    expect(shouldSkipSecondHomeCreateSubmit()).toBe(true);
    expect(isHomeCreateDumpParseStarted()).toBe(true);
    expect(shouldKeepCreateEditorMountedForDump()).toBe(true);
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
        keepEditorMounted: shouldKeepCreateEditorMountedForDump(),
      }),
    ).toBe(false);
    expect(isEntitledPremiumRewriteProcessInFlight()).toBe(true);
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-remount" }),
    ).toBe(false);

    releaseEntitledPremiumRewriteInFlightLatch({ current: true });
    expect(isHomeCreateDumpIntentActive()).toBe(false);
  });

  it("two sequential homepage dumps both get a clean submit after settle (PASS×2)", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    expect(shouldSkipSecondHomeCreateSubmit()).toBe(true);
    releaseEntitledPremiumRewriteInFlightLatch({ current: true });
    expect(isHomeCreateDumpIntentActive()).toBe(false);

    initializeNewAgreementSession();
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    expect(shouldSkipSecondHomeCreateSubmit()).toBe(true);
    clearHomeCreateDumpIntent();
  });

  it("cached token is reused for pfd POST — no getAuthSession refresh mid-OPTIONS", async () => {
    setCachedAccessToken("parse-already-used-this-token");
    const sessionMod = await import("../../auth/supabaseAuthService");
    const getSession = vi.spyOn(sessionMod, "getAuthSession");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          document_text: "x".repeat(600),
          server_full_document_text: "x".repeat(600),
          generation_outcome: "ok",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: NORTHLINE,
      context: minimalContext,
      networkCallReason: "entitled_rewrite",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("empty cache still hydrates once then POSTs (cold start)", async () => {
    clearCachedAccessToken();
    const sessionMod = await import("../../auth/supabaseAuthService");
    const getSession = vi.spyOn(sessionMod, "getAuthSession").mockResolvedValue({
      access_token: "cold-start-token",
    } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          document_text: "x".repeat(600),
          server_full_document_text: "x".repeat(600),
          generation_outcome: "ok",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: NORTHLINE,
      context: minimalContext,
      networkCallReason: "entitled_rewrite",
    });

    expect(getSession).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("#226 named-2p 60s no-pfd failsafe and pfdHttpCompleted short-circuit stay in force", () => {
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
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: true,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(false);
    const settle = readFileSync(join(__dirname, "multiPartyCreateReviewSettle.ts"), "utf8");
    expect(settle).toContain("if (input.pfdHttpCompleted) return false");
    expect(settle).toContain("CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS");
    expect(settle).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
    expect(settle).not.toContain("looksOverSpecifiedOrComplexityIntake");
    expect(settle).not.toContain("material_gap");
  });

  it("intake and create page single-flight the submit instead of a new steal latch", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const autoGenIdx = intake.indexOf("if (shouldJoinHomeCreateDumpSubmit() || isHomeCreateDumpParseStarted())");
    const parseCallIdx = intake.indexOf('handoffSource: "home_create_submit"');
    expect(autoGenIdx).toBeGreaterThan(-1);
    expect(autoGenIdx).toBeLessThan(parseCallIdx);
    expect(intake).toContain("joinHomeCreateDumpFlight");
    expect(intake).toContain("registerHomeCreateDumpFlight");
    expect(intake).toContain("markHomeCreateDumpParseStarted()");
    expect(intake).toContain("ensureHomeCreateDumpIntent");
    expect(intake).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
    expect(intake).not.toContain("material_gap");

    const createPage = readFileSync(
      join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
      "utf8",
    );
    expect(createPage).toContain("shouldKeepCreateEditorMountedForDump");
    expect(createPage).toContain("if (!shouldKeepCreateEditorMountedForDump()");
    expect(createPage).toContain("awaitingAuthWorkspace && !keepEditorMountedForDump");
    expect(createPage).toContain("keepEditorMounted: keepEditorMountedForDump");

    const home = readFileSync(join(__dirname, "../../launch/LaunchHomePage.tsx"), "utf8");
    expect(home).toContain("tryBeginHomeCreateDumpIntent");

    const api = readFileSync(join(__dirname, "premiumFullDraftApi.ts"), "utf8");
    expect(api).toContain("if (!getCachedAccessToken())");
    expect(api).toContain("resolveHomeCreateDumpFetchSignal");
    expect(api).toContain("isOptionsOnlyGhostAbort");
    expect(api.indexOf("if (!getCachedAccessToken())")).toBeLessThan(api.indexOf("res = await fetch(requestUrl"));

    const audit = readFileSync(join(__dirname, "paidProPremiumGenerationCallAudit.ts"), "utf8");
    expect(audit).not.toContain("lastEntitledRewriteGenerationId !== genId");
  });

  it("ensure + parse-started is join-only — never steals a live dump", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: "a" })).toBe(true);
    markHomeCreateDumpParseStarted();
    ensureHomeCreateDumpIntent({ fingerprint: "b" });
    expect(readHomeCreateDumpIntent()?.fingerprint).toBe("a");
    expect(shouldSkipSecondHomeCreateSubmit()).toBe(true);
  });
});
