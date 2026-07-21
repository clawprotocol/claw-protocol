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
    waitUntil: "domcontentloaded",
  });
  await waitForPaidProReviewDecisionSurface(page, { timeout: 180_000 });

  return { harness, paidDrafts };
}

export async function advanceAuthorityThroughSignerSetup(page: Page): Promise<void> {
  if (
    await page
      .getByTestId("paid-pro-forced-prepare-signatures")
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await clickPaidProReviewSignatureTrack(page);
  }
  await fillPaidProSignerDetailsIfVisible(page);
  await advancePaidProSignerSetupToReviewDecision(page);
  await expect(
    page.getByRole("button", { name: /Prepare for signing/i }).first(),
  ).toBeVisible({ timeout: 120_000 });
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

  const prepareBtn = page
    .getByTestId("paid-pro-forced-prepare-signatures")
    .or(page.getByRole("button", { name: /Prepare for signing/i }))
    .first();
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

  try {
    await expect
      .poll(
        () => chainState.timeline.filter((t) => t.tag === "signing-packet-reissue" || t.tag === "signing-links-sent").length,
        { timeout: 180_000 },
      )
      .toBeGreaterThan(0);
  } catch (err) {
    const vs01Diag = await page.evaluate(() => {
      const block = document.querySelector("[data-packet-block-reason]");
      return {
        url: location.href,
        packetBlockReason: block?.getAttribute("data-packet-block-reason") ?? null,
        packetBlockDebug: block?.getAttribute("data-packet-block-debug") ?? null,
        buttons: Array.from(document.querySelectorAll("button"))
          .map((b) => b.textContent?.trim())
          .filter(Boolean)
          .slice(0, 12),
        bodySnippet: (document.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
      };
    });
    throw new Error(
      `packet/delivery failed timeline=${chainState.timeline.map((t) => t.tag).join(",")} vs01=${JSON.stringify(vs01Diag)} trace=${JSON.stringify(await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("claw_signing_advance_trace_v1") ?? "[]"); } catch { return []; } }))}`,
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

  await completeAllVs01Recipients(page, chainState);

  expect(chainState.completions.length).toBeGreaterThanOrEqual(2);
  expect(chainState.completion).not.toBeNull();

  await openArtifactPublicVerification(browser, {
    agreementId: ids.ownedId,
    expectedArtifactId: chainState.completion!.artifactId,
    chainState,
    partyCount: 2,
    signerEmails: ["sarah.mitchell@example.com", "michael.torres@example.com"],
  });
}
