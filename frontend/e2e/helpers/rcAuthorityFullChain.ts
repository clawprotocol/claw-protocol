/**
 * RC Journey 7 Authority — full-chain orchestration through production UI paths.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { SHARED_TWO_PARTY_INTAKE } from "../../src/components/agreements/paidProSharedFixtureSystem";
import {
  advancePaidProSignerSetupToReviewDecision,
  clickPaidProReviewSignatureTrack,
  fillPaidProSignerDetailsIfVisible,
  waitForPaidProReviewDecisionSurface,
} from "./rcJourneyHelpers";
import {
  assertPacketAuthority,
  createAuthoritySigningChainState,
  installAuthoritySigningChainRoutes,
  openArtifactPublicVerification,
  type AuthoritySigningChainState,
} from "./rcAuthorityCertificationChain";
import {
  completeVs01RecipientSigning,
  normalizeRecipientHref,
} from "./rcAuthorityRecipientSigning";
import {
  assertOwnershipMigrationInvariants,
  createOwnershipAuthorityHarness,
  installOwnershipMigrationAuthorityRoutes,
  runProductionAuthCallback,
  seedAnonymousAgreementContext,
} from "./rcOwnershipMigrationAuthority";
import { seedE2eAuthSession } from "./rcE2eAuthBridge";
import {
  clearRcApiMocks,
  installRcPaidProApiRoutes,
  seedRcPaidCheckoutReturn,
  type RcDraftRecord,
} from "./rcPaidProApiMocks";

export type AuthorityFullChainIds = {
  anonId: string;
  ownedId: string;
};

export const AUTHORITY_FULL_CHAIN_IDS: AuthorityFullChainIds = {
  anonId: "ag_j7_auth_anon",
  ownedId: "ag_j7_auth_sign",
};

const RECIPIENT_BASE_URL = "http://127.0.0.1:4173";

export async function bootstrapAuthorityOwnerReview(
  page: Page,
  ids: AuthorityFullChainIds = AUTHORITY_FULL_CHAIN_IDS,
): Promise<{ harness: ReturnType<typeof createOwnershipAuthorityHarness>; paidDrafts: Map<string, RcDraftRecord> }> {
  const harness = createOwnershipAuthorityHarness({
    id: "FULL",
    label: "authority full chain",
    anonAgreementId: ids.anonId,
    ownedAgreementId: ids.ownedId,
  });
  const paidDrafts = new Map<string, RcDraftRecord>();

  await clearRcApiMocks(page);
  await seedE2eAuthSession(page);
  await seedAnonymousAgreementContext(page, { anonAgreementId: ids.anonId, intakeText: SHARED_TWO_PARTY_INTAKE });
  await installOwnershipMigrationAuthorityRoutes(page, harness);
  await runProductionAuthCallback(page, { continuationId: "cont_full" });
  await assertOwnershipMigrationInvariants(page, harness);

  await installRcPaidProApiRoutes(page, paidDrafts, { draftId: ids.ownedId, partyCount: 2 });
  await installOwnershipMigrationAuthorityRoutes(page, harness);
  await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, ids.ownedId);
  await page.goto("/app/create?checkout_session_id=rc_auth_sign_cs&premiumCompletion=1", {
    waitUntil: "commit",
  });
  // Rematerialized accepted SoT before decision-surface polling (same authority gate as J4).
  await page
    .waitForFunction(
      () => Boolean(document.documentElement.getAttribute("data-claw-live-sot-hash")),
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  await waitForPaidProReviewDecisionSurface(page, { timeout: 180_000 });

  return { harness, paidDrafts };
}

/** Post-signer-setup prepare CTA — label or testid (forced chrome / simple final review). */
export function authorityPrepareForSigningLocator(page: Page) {
  return page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .or(page.getByTestId("simple-pro-send-for-signature"))
    .or(page.getByRole("button", { name: /Prepare for signing/i }))
    .first();
}

export async function advanceAuthorityThroughSignerSetup(page: Page): Promise<void> {
  const prepareTrack = page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .or(page.getByTestId("simple-pro-send-for-signature"))
    .or(page.getByRole("button", { name: /Prepare for signing/i }))
    .first();
  // Latch signature track when the review-decision prepare CTA is available.
  if (await prepareTrack.isVisible().catch(() => false)) {
    await clickPaidProReviewSignatureTrack(page);
  }
  await fillPaidProSignerDetailsIfVisible(page);
  await advancePaidProSignerSetupToReviewDecision(page);
  try {
    await expect(authorityPrepareForSigningLocator(page)).toBeVisible({ timeout: 120_000 });
  } catch (err) {
    const diag = await page
      .evaluate(() => {
        const snapRaw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
        let sotHash: string | null = null;
        let frozenHint = false;
        try {
          if (snapRaw) {
            const snap = JSON.parse(snapRaw) as { paidProSourceOfTruthHash?: string };
            sotHash = (snap.paidProSourceOfTruthHash || "").trim() || null;
          }
        } catch {
          /* ignore */
        }
        return {
          url: location.href,
          liveHash: document.documentElement.getAttribute("data-claw-live-sot-hash"),
          snapHash: sotHash,
          frozenHint,
          buttons: Array.from(document.querySelectorAll("button"))
            .map((b) => (b.textContent || "").trim().replace(/\s+/g, " "))
            .filter(Boolean)
            .slice(0, 30),
          testIds: Array.from(document.querySelectorAll("[data-testid]"))
            .map((e) => e.getAttribute("data-testid"))
            .filter((t): t is string => Boolean(t && /sign|prepare|send|review|forced|signer|complete/i.test(t)))
            .slice(0, 40),
          bodySnippet: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 280),
        };
      })
      .catch((e: Error) => ({ evaluateError: String(e?.message || e) }));
    // eslint-disable-next-line no-console
    console.error("[j7-authority] PREPARE_MISSING_DIAG", JSON.stringify(diag));
    throw err;
  }
  const sotHash = await page
    .evaluate(() => document.documentElement.getAttribute("data-claw-live-sot-hash"))
    .catch(() => null);
  // eslint-disable-next-line no-console
  console.log("[j7-authority] prepare_ready", { sotHash });
}

export async function advanceAuthorityThroughPacketDelivery(
  page: Page,
  chainState: AuthoritySigningChainState,
  ids: AuthorityFullChainIds = AUTHORITY_FULL_CHAIN_IDS,
): Promise<void> {
  await installAuthoritySigningChainRoutes(page, chainState, {
    agreementId: ids.ownedId,
    partyCount: 2,
    signerEmails: ["sarah.mitchell@example.com", "michael.torres@example.com"],
  });

  const forcedPrepareVisible = await page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .isVisible()
    .catch(() => false);
  const simplePrepareVisible = await page
    .getByTestId("simple-pro-send-for-signature")
    .isVisible()
    .catch(() => false);

  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      /guided-signature|send-flow|agreement-vs01|vs01-signing-seed|guided-transition|payment-flow-stage/i.test(t)
    ) {
      consoleLines.push(t);
    }
  });

  const prepareBtn = authorityPrepareForSigningLocator(page);
  await expect(prepareBtn).toBeVisible({ timeout: 60_000 });
  const sotHashBeforePrepare = await page
    .evaluate(() => document.documentElement.getAttribute("data-claw-live-sot-hash"))
    .catch(() => null);
  // eslint-disable-next-line no-console
  console.log("[j7-authority] prepare_click", { sotHashBeforePrepare });
  await prepareBtn.scrollIntoViewIfNeeded();
  await prepareBtn.click();

  try {
    await expect
      .poll(async () => {
        const url = page.url();
        if (/\/app\/esign\//.test(url)) return true;
        if (/vs01_packet_ready=1/.test(url)) return true;
        return (
          chainState.timeline.filter(
            (t) => t.tag === "signing-packet-reissue" || t.tag === "signing-links-sent",
          ).length > 0
        );
      }, { timeout: 120_000 })
      .toBe(true);
  } catch (err) {
    throw new Error(
      `esign navigation failed url=${await page.url()} forced=${forcedPrepareVisible} simple=${simplePrepareVisible} timeline=${chainState.timeline.map((t) => t.tag).join(",")} trace=${JSON.stringify(await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("claw_signing_advance_trace_v1") ?? "[]"); } catch { return []; } }))} console=${consoleLines.slice(-8).join(" | ")}`,
      { cause: err instanceof Error ? err : undefined },
    );
  }

  const packetPollStartedAt = Date.now();
  try {
    await expect
      .poll(
        () => chainState.timeline.filter((t) => t.tag === "signing-packet-reissue" || t.tag === "signing-links-sent").length,
        { timeout: 180_000 },
      )
      .toBeGreaterThan(0);
  } catch (err) {
    const elapsedMs = Date.now() - packetPollStartedAt;
    const vs01Diag = await page
      .evaluate(() => {
        const block = document.querySelector("[data-packet-block-reason]");
        let acceptedSotHash: string | null = null;
        let acceptedSotLen = 0;
        let handoffHash: string | null = null;
        let handoffLen = 0;
        let generationId: string | null = null;
        let agreementId: string | null = null;
        let documentId: string | null = null;
        let sessionId: string | null = null;
        let handoffStatus: string | null = null;
        let handoffTargetRoute: string | null = null;
        let requiredSignerCount: number | null = null;
        let signerManifestStatus: string | null = null;
        let signerManifestError: string | null = null;
        try {
          const snapRaw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
          if (snapRaw) {
            const snap = JSON.parse(snapRaw) as {
              paidProSourceOfTruthHash?: string;
              paidProSourceOfTruthText?: string;
              agreementGenerationId?: string;
              agreementId?: string;
              documentId?: string;
            };
            acceptedSotHash = (snap.paidProSourceOfTruthHash || "").trim() || null;
            acceptedSotLen = (snap.paidProSourceOfTruthText || "").trim().length;
            generationId = (snap.agreementGenerationId || "").trim() || null;
            agreementId = (snap.agreementId || "").trim() || null;
            documentId = (snap.documentId || "").trim() || null;
          }
          const handoffRaw = sessionStorage.getItem("claw_guided_vs01_signing_handoff_v1");
          if (handoffRaw) {
            const handoff = JSON.parse(handoffRaw) as {
              corpusHash?: string;
              corpusText?: string;
              status?: string;
              targetRoute?: string;
              agreementId?: string;
              documentId?: string;
              sessionId?: string;
              roles?: unknown[];
            };
            handoffHash = (handoff.corpusHash || "").trim() || null;
            handoffLen = (handoff.corpusText || "").trim().length;
            handoffStatus = (handoff.status || "").trim() || "present";
            handoffTargetRoute = (handoff.targetRoute || "").trim() || null;
            sessionId = (handoff.sessionId || "").trim() || null;
            if (!agreementId) agreementId = (handoff.agreementId || "").trim() || null;
            if (!documentId) documentId = (handoff.documentId || "").trim() || null;
            if (Array.isArray(handoff.roles)) requiredSignerCount = handoff.roles.length;
          } else {
            handoffStatus = "missing";
          }
          const manifestRaw =
            sessionStorage.getItem("claw_vs01_signer_manifest_v1") ||
            sessionStorage.getItem("claw_guided_signer_manifest_v1");
          if (manifestRaw) {
            try {
              const manifest = JSON.parse(manifestRaw) as {
                roles?: unknown[];
                error?: string;
                status?: string;
              };
              signerManifestStatus = (manifest.status || "present").trim() || "present";
              signerManifestError = (manifest.error || "").trim() || null;
              if (requiredSignerCount == null && Array.isArray(manifest.roles)) {
                requiredSignerCount = manifest.roles.length;
              }
            } catch {
              signerManifestStatus = "parse_error";
              signerManifestError = "invalid_json";
            }
          } else {
            signerManifestStatus = "missing";
          }
        } catch {
          /* ignore */
        }
        const pathDoc = location.pathname.match(/\/app\/esign\/([^/?#]+)/)?.[1] ?? null;
        if (!documentId) documentId = pathDoc;
        const executionLines = document.querySelectorAll("[data-vs01-signature-execution-line]").length;
        const sigAnchors = document.querySelectorAll(
          "[data-vs01-signature-line-anchor], [data-vs01-canonical-signature-line]",
        ).length;
        const canonicalTextNodes = document.querySelectorAll("[data-vs01-canonical-text]").length;
        const partyMarkers = document.querySelectorAll("[data-vs01-signature-party]").length;
        const liveSotHash = document.documentElement.getAttribute("data-claw-live-sot-hash");
        const liveSotLenRaw = document.documentElement.getAttribute("data-claw-live-sot-len");
        const liveSotLen = liveSotLenRaw != null ? Number(liveSotLenRaw) : null;
        const signerAppliedDistinct =
          Boolean(handoffHash) &&
          Boolean(acceptedSotHash || liveSotHash) &&
          handoffHash !== (acceptedSotHash || liveSotHash);
        return {
          url: location.href,
          targetRoute: location.pathname,
          acceptedSotHash: acceptedSotHash || liveSotHash,
          acceptedSotLen: acceptedSotLen || liveSotLen,
          liveSotHash,
          liveSotLen,
          signerAppliedCorpusHash: handoffHash,
          signerAppliedCorpusLen: handoffLen,
          signerAppliedDistinctFromAcceptedSot: signerAppliedDistinct,
          agreementId,
          documentId,
          generationId,
          sessionId,
          handoffStatus,
          handoffTargetRoute,
          requiredSignerCount,
          renderedSignatureExecutionLineCount: executionLines,
          renderedSignatureAnchorCount: sigAnchors,
          renderedSignaturePartyMarkerCount: partyMarkers,
          canonicalTextNodeCount: canonicalTextNodes,
          canonicalSignatureLineSelectors: {
            executionLine: executionLines,
            anchorOrCanonicalLine: sigAnchors,
            partyMarker: partyMarkers,
          },
          signerManifestStatus,
          signerManifestError,
          packetBlockReason: block?.getAttribute("data-packet-block-reason") ?? null,
          packetBlockDebug: block?.getAttribute("data-packet-block-debug") ?? null,
          lastReadinessState: block
            ? "blocked"
            : document.querySelector(".vs01-sign-status-ready")
              ? "ready"
              : "unknown",
          buttons: Array.from(document.querySelectorAll("button"))
            .map((b) => (b.textContent || "").trim().replace(/\s+/g, " "))
            .filter(Boolean)
            .slice(0, 10),
        };
      })
      .catch((e: Error) => ({ evaluateError: String(e?.message || e) }));
    // eslint-disable-next-line no-console
    console.error(
      "[j7-authority] PACKET_READY_DIAG",
      JSON.stringify({
        ...vs01Diag,
        sotHashBeforePrepare,
        elapsedMs,
        timeline: chainState.timeline.map((t) => t.tag),
      }),
    );
    throw new Error(
      `packet/delivery failed timeline=${chainState.timeline.map((t) => t.tag).join(",")} elapsedMs=${elapsedMs} vs01=${JSON.stringify(vs01Diag)} trace=${JSON.stringify(await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("claw_signing_advance_trace_v1") ?? "[]"); } catch { return []; } }))}`,
      { cause: err instanceof Error ? err : undefined },
    );
  }

  if (chainState.timeline.every((t) => t.tag !== "signing-links-sent")) {
    const sendLinks = page.getByRole("button", { name: /Send signing links/i });
    if (await sendLinks.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await sendLinks.click();
      await expect
        .poll(() => chainState.timeline.filter((t) => t.tag === "signing-links-sent").length, { timeout: 120_000 })
        .toBeGreaterThan(0);
    }
  }

  await assertPacketAuthority(chainState);
  expect(chainState.delivery.signingMessages().length).toBeGreaterThanOrEqual(1);
  expect(chainState.portablePacket, "signing-links-sent must capture portable_packet").not.toBeNull();
}

export async function completeAllVs01Recipients(
  page: Page,
  chainState: AuthoritySigningChainState,
  opts?: { limit?: number; baseURL?: string },
): Promise<void> {
  const baseURL = opts?.baseURL ?? RECIPIENT_BASE_URL;
  const messages = chainState.delivery.signingMessages();
  const toRun = opts?.limit != null ? messages.slice(0, opts.limit) : messages;
  expect(toRun.length).toBeGreaterThanOrEqual(1);

  for (let i = 0; i < toRun.length; i += 1) {
    const msg = toRun[i]!;
    const completionsBefore = chainState.completions.length;
    const signPage = await page.context().newPage();
    try {
      const result = await completeVs01RecipientSigning({
        signPage,
        msg: { ...msg, href: normalizeRecipientHref(msg.href, baseURL) },
        chainState,
        signerIndex: i,
        baseURL,
        completionsBefore,
      });
      test.info().annotations.push({
        type: `recipient-${i + 1}`,
        description: JSON.stringify({
          durationMs: result.durationMs,
          signerRoleId: result.completion?.signerRoleId?.slice(0, 24),
          stages: result.diagnostics.map((d) => d.stage),
        }),
      });
      expect(chainState.completions.length).toBe(completionsBefore + 1);
    } finally {
      await signPage.close();
    }
  }
}

export async function runAuthorityFullChain(
  page: Page,
  browser: Browser,
  chainState: AuthoritySigningChainState,
  ids: AuthorityFullChainIds = AUTHORITY_FULL_CHAIN_IDS,
): Promise<void> {
  await advanceAuthorityThroughPacketDelivery(page, chainState, ids);

  // Authority full-chain is a two-party SoT journey; UI may expose a surplus slot — only complete the first two.
  await completeAllVs01Recipients(page, chainState, { limit: 2 });

  expect(chainState.completions.length).toBe(2);
  expect(chainState.completion).not.toBeNull();

  await openArtifactPublicVerification(browser, {
    agreementId: ids.ownedId,
    expectedArtifactId: chainState.completion!.artifactId,
    chainState,
    partyCount: 2,
    signerEmails: ["sarah.mitchell@example.com", "michael.torres@example.com"],
  });
}
