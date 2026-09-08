/** @vitest-environment jsdom */
/**
 * #238 — join-not-skip homepage dump so Northline pfd POSTs.
 *
 * Live #231 (c8cec2bb / index-C4Fo5aP6.js): parse 200×2, pfd OPTIONS-only,
 * `[CLAW] premium request start` then no response, dual home-create-submit.
 * #229–#231 never owned the dump AbortController. #233/#234 skipped generate
 * via shouldSkip + home-auto-generate-skipped (0/2 net-neg).
 *
 * Join the registered parse+pfd promise. Dump-owned AbortController is not
 * aborted by remount. First generate always starts. No shouldSkip that skips
 * the first generate of a user dump.
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
  hasRegisteredHomeCreateDumpFlight,
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

describe("Northline homepage dump intent (join-not-skip)", () => {
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
      networkCallReason: "unknown",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.document_text.length).toBeGreaterThanOrEqual(500);
    expect(isHomeCreateDumpFetchAborted()).toBe(false);
  });

  it("no shouldSkip that skips first generate before the flight is registered", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    // #233 used parseStarted as shouldSkip — first generate then skipped itself.
    expect(isHomeCreateDumpParseStarted()).toBe(true);
    expect(hasRegisteredHomeCreateDumpFlight()).toBe(false);
    expect(shouldJoinHomeCreateDumpSubmit()).toBe(false);
    expect(shouldKeepCreateEditorMountedForDump()).toBe(true);

    const dumpIntent = readFileSync(join(__dirname, "../../launch/homeCreateDumpIntent.ts"), "utf8");
    expect(dumpIntent).not.toContain("shouldSkipSecondHomeCreateSubmit");
    expect(dumpIntent).toContain("flightPromise != null");
    expect(dumpIntent).toContain("parseStarted alone must not skip");

    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("shouldJoinHomeCreateDumpSubmit()");
    expect(intake).not.toContain("shouldSkipSecondHomeCreateSubmit");
    const joinIdx = intake.indexOf("if (shouldJoinHomeCreateDumpSubmit())");
    const skipLogNearJoin = intake.slice(joinIdx, joinIdx + 280);
    expect(skipLogNearJoin).not.toContain("logHomeAutoGenerateSkipped");
    expect(intake).toContain("registerHomeCreateDumpFlight(dumpFlight)");
    expect(intake).toContain('handoffSource: "home_create_submit"');
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
      networkCallReason: "unknown",
    });
    expect(result.document_text.length).toBeGreaterThanOrEqual(500);
    expect(calls).toBe(2);
    expect(isHomeCreateDumpFetchAborted()).toBe(false);
  });

  it("two sequential homepage dumps both get a clean submit after settle (PASS×2)", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    const flight = Promise.resolve("dump1");
    registerHomeCreateDumpFlight(flight);
    expect(shouldJoinHomeCreateDumpSubmit()).toBe(true);
    releaseEntitledPremiumRewriteInFlightLatch({ current: true });
    expect(isHomeCreateDumpIntentActive()).toBe(false);

    initializeNewAgreementSession();
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: NORTHLINE_FP })).toBe(true);
    markHomeCreateDumpParseStarted();
    expect(shouldJoinHomeCreateDumpSubmit()).toBe(false);
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
      networkCallReason: "unknown",
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
      networkCallReason: "unknown",
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

  it("intake and create page join the flight instead of a new steal latch or skip", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const autoGenIdx = intake.indexOf("if (shouldJoinHomeCreateDumpSubmit())");
    const parseCallIdx = intake.indexOf('handoffSource: "home_create_submit"');
    expect(autoGenIdx).toBeGreaterThan(-1);
    expect(autoGenIdx).toBeLessThan(parseCallIdx);
    expect(intake).toContain("joinHomeCreateDumpFlight");
    expect(intake).toContain("registerHomeCreateDumpFlight");
    expect(intake).toContain("markHomeCreateDumpParseStarted()");
    expect(intake).toContain("ensureHomeCreateDumpIntent");
    expect(intake).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
    expect(intake).not.toContain("material_gap");
    expect(intake).not.toContain("openaiClarityReviewHold");

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
    expect(audit).toContain("if (entitledPfdFlight) return false");
  });

  it("ensure + parse-started without a registered flight never skips first generate", () => {
    expect(tryBeginHomeCreateDumpIntent({ fingerprint: "a" })).toBe(true);
    markHomeCreateDumpParseStarted();
    ensureHomeCreateDumpIntent({ fingerprint: "b" });
    expect(readHomeCreateDumpIntent()?.fingerprint).toBe("a");
    expect(shouldJoinHomeCreateDumpSubmit()).toBe(false);
    expect(
      shouldGateCreateEditorUntilEntitlementReady({
        isAuthenticated: true,
        commercialEntitlementReady: false,
        isResumingOwnedAgreement: false,
        hasCheckoutPendingMarker: false,
        keepEditorMounted: shouldKeepCreateEditorMountedForDump(),
      }),
    ).toBe(false);
    expect(tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-dump-1" })).toBe(
      true,
    );
    expect(isEntitledPremiumRewriteProcessInFlight()).toBe(true);
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-remount" }),
    ).toBe(false);
    releaseEntitledPremiumRewriteInFlightLatch({ current: true });
    expect(isHomeCreateDumpIntentActive()).toBe(false);
  });
});
