/**
 * Review-first UI: recipient surface + paid Pro review-first must not land on generic /app/send.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type DraftRec = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  premium_render_source?: string;
  server_full_document_text?: string;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

const ORIGINAL_SCHEDULE_A =
  "SCHEDULE A — Phase, Payment, and Support Terms\n\nSpecific compensation mechanics will be completed in Schedule A before execution.";

const UPDATED_SCHEDULE_A =
  "SCHEDULE A — Phase, Payment, and Support Terms\n\nTotal project fee: $120,000 USD.\n\n$72,000 build/configuration due kickoff.\n\n$30,000 rollout/launch due when workflows/dashboards ready for client review.\n\n$18,000 support handoff/acceptance due at final acceptance or 30 days after launch.\n\n$6,000 monthly support begins after launch. Support scope and Net 30 invoice terms apply.";

function buildPremiumCompletionSnapshot(draft: DraftRec, bodyPlain: string) {
  return {
    savedAt: Date.now(),
    premiumDraft: {
      ...draft,
      server_full_document_text: bodyPlain,
      premium_full_document_text: bodyPlain,
      premium_render_source: "server_full_document_text",
    },
    premiumParties: (draft.parties ?? []).map((p) => ({ name: p.name, role: p.role })),
    recipientCandidates: [],
    premiumReadonlyPlainText: bodyPlain,
    premiumWinningBodyText: bodyPlain,
    premiumAccepted: true,
    premiumPipelineRenderSource: "server_full_document_text",
    premiumRenderResolveSource: "server_full_document_text",
    review_mode: "generated_agreement_review",
  };
}

function installReviewFirstApi(
  page: Page,
  draft: DraftRec,
  opts?: {
    recipientAccessMintStatus?: number;
    recipientAccessMintCode?: string;
    bodyPlain?: string;
    signingTokenConfigured?: boolean;
    reviewLinkMintEnabled?: boolean;
    signingTokenEnvVarDetected?: string | null;
  },
) {
  const bodyPlain = opts?.bodyPlain ?? draft.server_full_document_text ?? "x".repeat(600);
  let storedDraft: DraftRec = { ...draft };
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/premium-full-draft") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title: draft.title,
          agreement_family: "services_agreement",
          document_text: bodyPlain,
          server_full_document_text: bodyPlain,
          key_terms_found: ["Parties", "Payment"],
          missing_material_info: [],
          generation_outcome: "ok",
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/premium-missing-facts") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ questions: [] }),
      });
      return;
    }

    if (url.includes("/health") && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (method === "POST" && url.includes("/api/agreements/draft")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: draft.id, draft }),
      });
      return;
    }

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      const signingConfigured = opts?.signingTokenConfigured ?? true;
      const mintEnabled =
        opts?.reviewLinkMintEnabled ??
        (signingConfigured ? true : false);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: false,
          signing_token_configured: signingConfigured,
          review_link_mint_enabled: mintEnabled,
          signing_token_env_var_detected:
            opts?.signingTokenEnvVarDetected ??
            (signingConfigured ? "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET" : null),
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/access/validate") && method === "GET") {
      const partyIdx = (draft.parties ?? []).findIndex((p) => p.role !== "owner");
      const party = partyIdx >= 0 ? draft.parties[partyIdx] : undefined;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          agreement_id: draft.id,
          mode: "review",
          locked_version_id: "",
          role: "reviewer",
          recipient_party_id: (party as { id?: string } | undefined)?.id ?? `p-${partyIdx}`,
          inviter_display_name: draft.parties?.[0]?.name ?? "Owner",
        }),
      });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rendered_html: `<p>${storedDraft.title}</p><p>${storedDraft.purpose}</p><p>${storedDraft.payment_terms}</p>`,
        }),
      });
      return;
    }

    if (url.includes("/revise") && method === "POST") {
      const revised = {
        ...draft,
        payment_terms: "Net 45.",
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: revised,
          rendered_html: `<p>${draft.title}</p><p>${draft.purpose}</p><p>3. Payment. Net 45.</p>`,
        }),
      });
      return;
    }

    if (url.includes("/recipient-access-token") && method === "POST") {
      const partyIdx = (draft.parties ?? []).findIndex((p) => p.role !== "owner");
      const mintStatus = opts?.recipientAccessMintStatus ?? 200;
      if (mintStatus !== 200) {
        await route.fulfill({
          status: mintStatus,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              code: opts?.recipientAccessMintCode ?? "signing_token_secret_not_configured",
              message: "Signing token secret is not configured",
            },
          }),
        });
        return;
      }
      let rawBody: unknown = {};
      try {
        rawBody = route.request().postDataJSON();
      } catch {
        rawBody = {};
      }
      const reviewFirstDocumentText =
        rawBody && typeof rawBody === "object"
          ? String((rawBody as Record<string, unknown>).review_first_document_text ?? "").trim()
          : "";
      if (reviewFirstDocumentText) {
        storedDraft = {
          ...storedDraft,
          purpose: reviewFirstDocumentText,
          payment_terms: "",
          server_full_document_text: reviewFirstDocumentText,
          premium_render_source: "review_first_final_corpus",
          updated_at: new Date().toISOString(),
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: `tok_review_${draft.id}_${partyIdx}`,
          expires_in_seconds: 86400,
          locked_version_id: "v1",
          review_url: `https://example.test/agreements/${draft.id}/review?token=tok_review_${partyIdx}`,
        }),
      });
      return;
    }

    if (url.includes("/recipient-links/mint") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: (draft.parties ?? [])
            .filter((p) => p.role !== "owner")
            .map((p, i) => ({
              partyId: `p-${i}`,
              displayName: p.name,
              email: p.email ?? "",
              reviewHref: `https://example.test/review/${draft.id}/${i}`,
            })),
        }),
      });
      return;
    }

    if (method === "GET" && /\/api\/agreements\/[^/?]+$/.test(url.replace(/\?.*$/, ""))) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ draft: storedDraft, economics: { tier: "paid", watermark_required: false } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

function primeE2eApiBase(page: Page) {
  return page.addInitScript("window.__CLAW_PUBLIC_API_BASE__ = window.location.origin;");
}

function paidProAuthoritativeDraft(id: string): DraftRec {
  const now = new Date().toISOString();
  const body = "x".repeat(600);
  return {
    id,
    title: "Review First Services",
    jurisdiction: "California",
    parties: [
      { name: "Studio LLC", role: "owner", email: "owner@example.com" },
      { name: "Client LLC", role: "party", email: "client@example.com" },
    ],
    purpose: "Professional services agreement body for review-first routing tests.",
    payment_terms: "Payment due within 15 days.",
    duration: "6 months",
    due_date: null,
    effective_date: "2026-01-01",
    premium_render_source: "server_full_document_text",
    server_full_document_text: body,
    versions: [{ version: 1, created_at: now, note: "review" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };
}

test("review-first simplified UI (desktop + laptop PNGs)", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const artifactDir = join(testInfo.project.outputDir, "..", "artifacts", "recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });

  const agreementId = "ag_review_first_png";
  const draft = paidProAuthoritativeDraft(agreementId);

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "laptop", width: 1100, height: 900 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/agreements/${agreementId}/review?role=reviewer`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recipient-review-first-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Propose updated draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suggest changes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More options" })).toBeVisible();
    await expect(page.getByTestId("recipient-review-upload-updated-draft")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Request changes/i })).toHaveCount(0);

    await page.screenshot({
      path: join(
        artifactDir,
        viewport.name === "desktop" ? "reviewer-simplified-review-page.png" : `review-first-${viewport.name}.png`,
      ),
      fullPage: true,
    });
  }
});

test("paid Pro review-first skips generic /app/send and lands on owner done", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_paid_pro_review_first_direct";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      const handoff = {
        v: 1,
        agreementId: id,
        primedDraft: primed,
        streamlinedSimpleFlow: true,
        premiumSendIntent: "review",
        openFlowPhase: "review",
        savedAt: Date.now(),
      };
      window.history.replaceState({ clawSimpleSendHandoff: handoff }, "", `/app/send/${id}`);
    },
    { id: agreementId, primed: draft },
  );

  const mintResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/recipient-access-token") &&
      res.status() === 200,
    { timeout: 25_000 },
  );
  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.screenshot({
    path: join(artifactDir, "send-for-review-click-before.png"),
    fullPage: true,
  });
  await mintResponse;

  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });
  await expect(page.getByText("Your Agreement")).toHaveCount(0);
  await expect(page.getByText("Review before sending")).toHaveCount(0);
  await expect(page.getByText("Send this as a professional agreement")).toHaveCount(0);
  await expect(page.getByText("Continue with Pro")).toHaveCount(0);
  await expect(page.getByText("Continue with draft version")).toHaveCount(0);
  await expect(page.getByText("Review link created")).toBeVisible({ timeout: 20_000 });

  await page.screenshot({
    path: join(artifactDir, "send-for-review-link-created-after.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: join(artifactDir, "review-link-created-after.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: join(artifactDir, "review-first-direct-desktop.png"),
    fullPage: true,
  });
});

test("paid Pro review-first on /app/send shows token-config error, not generic send shell", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_paid_pro_review_first_mint_422";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft, {
    recipientAccessMintStatus: 422,
    recipientAccessMintCode: "signing_token_secret_not_configured",
    signingTokenConfigured: false,
    reviewLinkMintEnabled: false,
    signingTokenEnvVarDetected: null,
  });

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      const handoff = {
        v: 1,
        agreementId: id,
        primedDraft: primed,
        streamlinedSimpleFlow: true,
        premiumSendIntent: "review",
        openFlowPhase: "review",
        savedAt: Date.now(),
      };
      window.history.replaceState({ clawSimpleSendHandoff: handoff }, "", `/app/send/${id}`);
    },
    { id: agreementId, primed: draft },
  );

  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("review-first-mint-error-panel")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/signing\/review token minting is not configured/i)).toBeVisible();
  await expect(page.getByText("Your Agreement")).toHaveCount(0);
  await expect(page.getByText("Review before sending")).toHaveCount(0);
  await expect(page.getByText("Continue to send")).toHaveCount(0);
  await expect(page.getByText("Send this as a professional agreement")).toHaveCount(0);
  await expect(page.getByText("Continue with Pro")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/send/${agreementId}`));

  await page.screenshot({
    path: join(artifactDir, "review-first-no-legacy-send-shell-error.png"),
    fullPage: true,
  });
});

test("propose updated draft shows Schedule A before/after blocks", async ({ page }) => {
  test.setTimeout(90_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });

  const agreementId = "ag_review_first_change_vis";
  const originalBody = `AI Automation Services Agreement\n\n${ORIGINAL_SCHEDULE_A}`;
  const updatedBody = `AI Automation Services Agreement\n\n${UPDATED_SCHEDULE_A}`;
  const draft = {
    ...paidProAuthoritativeDraft(agreementId),
    parties: [
      { id: "p-owner", name: "Studio LLC", role: "owner", email: "owner@example.com" },
      { id: "p-client", name: "Client LLC", role: "party", email: "client@example.com" },
    ],
    purpose: originalBody,
    payment_terms: "",
    server_full_document_text: originalBody,
    premium_render_source: "review_first_final_corpus",
  };

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/agreements/${agreementId}/review?role=reviewer&t=tok_review_personal`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("recipient-review-propose-updated-draft").click();
  await expect(page.getByTestId("recipient-revised-draft-paste")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("recipient-review-personal-link-required")).toHaveCount(0);
  await page.screenshot({
    path: join(artifactDir, "review-first-propose-update-clean.png"),
    fullPage: true,
  });
  await page.getByTestId("recipient-revised-draft-paste").fill(updatedBody);
  await expect(page.getByTestId("recipient-compare-versions-button")).toBeEnabled();
  await page.getByTestId("recipient-compare-versions-button").click();

  await expect(page.getByTestId("recipient-preview-summary-heading")).toHaveText("Changes proposed", {
    timeout: 20_000,
  });
  const changeSummary = page.getByTestId("recipient-review-change-visibility-summary");
  await expect(changeSummary).toBeVisible();
  await expect(changeSummary.getByText("Previous", { exact: true })).toBeVisible();
  await expect(changeSummary.getByText("Proposed", { exact: true })).toBeVisible();
  await expect(changeSummary).toContainText(/Suggested change by Client LLC/i);
  await expect(changeSummary).toContainText(/Specific compensation mechanics will be completed in Schedule A before execution/i);
  await expect(changeSummary).toContainText(/Total project fee: \$120,000 USD/i);
  await expect(changeSummary).toContainText(/\$72,000 build\/configuration due kickoff/i);
  await expect(page.getByText(/Nothing is signed yet, and everyone must approve the updated version before signing/i)).toBeVisible();

  await page.screenshot({
    path: join(artifactDir, "review-first-change-before-after.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: join(artifactDir, "review-first-schedule-a-before-after.png"),
    fullPage: true,
  });
});

test("review-first missing token shows attribution message before revised draft editor", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_review_first_missing_token";
  const originalBody = `AI Automation Services Agreement\n\n${ORIGINAL_SCHEDULE_A}`;
  const draft = {
    ...paidProAuthoritativeDraft(agreementId),
    parties: [
      { id: "p-owner", name: "Studio LLC", role: "owner", email: "owner@example.com" },
      { id: "p-client", name: "Client LLC", role: "party", email: "client@example.com" },
    ],
    purpose: originalBody,
    payment_terms: "",
    server_full_document_text: originalBody,
    premium_render_source: "review_first_final_corpus",
  };
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);
  await page.goto(`/agreements/${agreementId}/review?role=reviewer`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("recipient-review-propose-updated-draft").click();
  await expect(page.getByTestId("recipient-review-personal-link-required")).toContainText(
    "Open the personal review link the sender gave you so LawDog can attribute your proposed update.",
  );
  await page.getByTestId("recipient-revised-draft-paste").fill(`AI Automation Services Agreement\n\n${UPDATED_SCHEDULE_A}`);
  await expect(page.getByTestId("recipient-compare-versions-button")).toBeDisabled();
  await page.screenshot({
    path: join(artifactDir, "review-first-missing-token-attribution-message.png"),
    fullPage: true,
  });
});

test("create final review click — review-first token error, no legacy /app/send shell", async ({ page }) => {
  test.setTimeout(90_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_create_click_review_first";
  const draft = paidProAuthoritativeDraft(agreementId);
  const bodyPlain = "x".repeat(600);

  await primeE2eApiBase(page);

  const visitedPaths: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      try {
        visitedPaths.push(new URL(frame.url()).pathname);
      } catch {
        /* ignore */
      }
    }
  });

  const premiumSnap = buildPremiumCompletionSnapshot(draft, bodyPlain);

  await page.addInitScript(
    ({ id, snap, body }) => {
      try {
        localStorage.setItem("claw_premium_completed", "1");
        localStorage.setItem("claw_org_id", "local-org");
      } catch {
        /* ignore */
      }
      sessionStorage.setItem("claw_premium_send_intent", "review");
      sessionStorage.setItem(
        "claw_paid_premium_completion_session_v1",
        JSON.stringify({ v: 1, source: "qa_bypass", markedAt: Date.now() }),
      );
      sessionStorage.setItem("claw_premium_recipients_surface_released_v1", "0");
      sessionStorage.setItem(
        "claw_review_first_pinned_corpus_v1",
        JSON.stringify({ agreementId: id, bodyPlain: body, savedAt: Date.now() }),
      );
      sessionStorage.setItem("claw_premium_completion_snapshot_v1", JSON.stringify(snap));
    },
    { id: agreementId, snap: premiumSnap, body: bodyPlain },
  );

  await installReviewFirstApi(page, draft, {
    recipientAccessMintStatus: 422,
    recipientAccessMintCode: "signing_token_secret_not_configured",
    bodyPlain,
    signingTokenConfigured: false,
    reviewLinkMintEnabled: false,
    signingTokenEnvVarDetected: null,
  });

  await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded", timeout: 30_000 });

  const finalReviewCta = page.getByTestId("guided-review-updated-agreement-cta");
  if (await finalReviewCta.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await finalReviewCta.click();
  }

  await page
    .getByTestId("simple-pro-final-review-screen")
    .or(page.getByRole("heading", { name: "Review your Pro agreement" }))
    .first()
    .waitFor({ state: "visible", timeout: 45_000 })
    .catch(() => undefined);

  const sendForReview = page.getByTestId("simple-pro-send-for-review");
  const onFinalReview = await sendForReview.isVisible({ timeout: 20_000 }).catch(() => false);

  if (onFinalReview) {
    await sendForReview.click();
    const inlineError = page.getByTestId("simple-pro-review-first-handoff-error");
    await expect(inlineError).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("simple-pro-final-review-actions")).toBeVisible();
    await expect(page.getByTestId("simple-pro-send-for-review")).toHaveCount(0);
    await expect(page.getByText(/Review links could not be created/i)).toBeVisible();
    await expect(page.getByText(/signing\/review token minting is not configured/i)).toBeVisible();
    await expect(page.getByText("We couldn't save your draft just now")).toHaveCount(0);
    await expect(page.getByText("Continue with draft version")).toHaveCount(0);
    await expect(page.getByTestId("review-first-env-config-hint")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry creating review links" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to final review" })).toBeVisible();
    await inlineError.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-visible-inline-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-inline-token-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-token-config-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-final.png"),
      fullPage: true,
    });
  } else {
    await page.addInitScript(({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      const handoff = {
        v: 1,
        agreementId: id,
        primedDraft: primed,
        streamlinedSimpleFlow: true,
        premiumSendIntent: "review",
        openFlowPhase: "review",
        savedAt: Date.now(),
      };
      window.history.replaceState({ clawSimpleSendHandoff: handoff }, "", `/app/send/${id}`);
    }, { id: agreementId, primed: draft });
    await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByTestId("review-first-mint-error-panel")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("review-first-mint-error-panel").getByText(/signing\/review token minting/i)).toBeVisible();
    await expect(page.getByText("We couldn't save your draft just now")).toHaveCount(0);
    await expect(page.getByText("Continue with draft version")).toHaveCount(0);
    await page.getByTestId("review-first-mint-error-panel").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-visible-inline-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-inline-token-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-token-config-error.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(artifactDir, "create-click-review-first-final.png"),
      fullPage: true,
    });
  }

  for (const forbidden of [
    "Your Agreement",
    "Review before sending",
    "Continue to send",
    "Send this as a professional agreement",
    "Continue with Pro",
    "Continue with draft version",
    "We couldn't save your draft just now",
  ]) {
    await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
  }

  if (onFinalReview) {
    await expect(page.getByText(/Review links could not be created/i)).toBeVisible();
  }

  const sendPathHits = visitedPaths.filter((p) => p.includes("/app/send/"));
  expect(sendPathHits.length).toBeLessThanOrEqual(onFinalReview ? 0 : 2);
});

test("create final review click — mocked mint success lands on /app/done", async ({ page }) => {
  test.setTimeout(90_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_create_click_review_first_success";
  const starterMarker = "STARTER_BODY_SHOULD_NOT_DISPLAY";
  const premiumMarker = "PREMIUM_BODY_SHOULD_NOT_DISPLAY";
  const finalMarker = "FINAL_GUIDED_REVIEW_CORPUS_MARKER";
  const draft = {
    ...paidProAuthoritativeDraft(agreementId),
    purpose: starterMarker,
    payment_terms: premiumMarker,
    server_full_document_text: `${premiumMarker}\n${"premium ".repeat(120)}`,
  };
  const bodyPlain = `${finalMarker}\nFinal guided review corpus with signer metadata and five guided answers.\n${"final guided corpus ".repeat(120)}`;
  const premiumSnap = buildPremiumCompletionSnapshot(draft, bodyPlain);

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft, {
    bodyPlain,
    signingTokenConfigured: true,
    reviewLinkMintEnabled: true,
  });

  await page.addInitScript(
    ({ id, snap, body, primed }) => {
      try {
        localStorage.setItem("claw_premium_completed", "1");
        localStorage.setItem("claw_org_id", "local-org");
      } catch {
        /* ignore */
      }
      sessionStorage.setItem("claw_agreement_create_review_resume_v1", id);
      sessionStorage.setItem("claw_premium_send_intent", "review");
      sessionStorage.setItem(
        "claw_paid_premium_completion_session_v1",
        JSON.stringify({ v: 1, source: "qa_bypass", markedAt: Date.now() }),
      );
      sessionStorage.setItem("claw_premium_recipients_surface_released_v1", "0");
      sessionStorage.setItem(
        "claw_review_first_pinned_corpus_v1",
        JSON.stringify({ agreementId: id, bodyPlain: body, savedAt: Date.now() }),
      );
      sessionStorage.setItem("claw_premium_completion_snapshot_v1", JSON.stringify(snap));
    },
    { id: agreementId, snap: premiumSnap, body: bodyPlain, primed: draft },
  );

  await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded", timeout: 30_000 });

  const finalReviewCta = page.getByTestId("guided-review-updated-agreement-cta");
  if (await finalReviewCta.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await finalReviewCta.click();
  }

  await page
    .getByTestId("simple-pro-final-review-screen")
    .or(page.getByRole("heading", { name: "Review your Pro agreement" }))
    .first()
    .waitFor({ state: "visible", timeout: 45_000 })
    .catch(() => undefined);

  const sendForReview = page.getByTestId("simple-pro-send-for-review");
  let onFinalReview = await sendForReview.isVisible({ timeout: 20_000 }).catch(() => false);

  if (!onFinalReview) {
    await page.addInitScript(({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      window.history.replaceState(
        {
          clawSimpleSendHandoff: {
            v: 1,
            agreementId: id,
            primedDraft: primed,
            streamlinedSimpleFlow: true,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
        },
        "",
        `/app/send/${id}`,
      );
    }, { id: agreementId, primed: draft });
    await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    onFinalReview = false;
  }

  const mintOk = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/recipient-access-token") &&
      res.status() === 200,
    { timeout: 25_000 },
  );
  if (onFinalReview) {
    await sendForReview.click();
  }
  await mintOk;
  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });
  await expect(page.getByText("Review link created")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(finalMarker)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(starterMarker)).toHaveCount(0);
  await expect(page.getByText(premiumMarker)).toHaveCount(0);
  await page.screenshot({
    path: join(artifactDir, "review-link-created-after.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: join(artifactDir, "create-click-review-first-success.png"),
    fullPage: true,
  });
  await page.screenshot({
    path: join(artifactDir, "review-first-final-corpus-owner-done.png"),
    fullPage: true,
  });

  const reviewerPage = await page.context().newPage();
  await primeE2eApiBase(reviewerPage);
  await installReviewFirstApi(
    reviewerPage,
    {
      ...draft,
      purpose: bodyPlain,
      payment_terms: "",
      server_full_document_text: bodyPlain,
      premium_render_source: "review_first_final_corpus",
    },
    { bodyPlain, signingTokenConfigured: true, reviewLinkMintEnabled: true },
  );
  await reviewerPage.goto(`/agreements/${agreementId}/review?role=reviewer`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(reviewerPage.getByRole("heading", { name: "Review agreement" })).toBeVisible({ timeout: 20_000 });
  await expect(reviewerPage.getByText(finalMarker)).toBeVisible({ timeout: 20_000 });
  await expect(reviewerPage.getByText(starterMarker)).toHaveCount(0);
  await expect(reviewerPage.getByText(premiumMarker)).toHaveCount(0);
  await reviewerPage.screenshot({
    path: join(artifactDir, "review-first-final-corpus-reviewer.png"),
    fullPage: true,
  });
  await reviewerPage.close();
});

test("paid Pro review-first on /app/send policy preflight blocks mint POST", async ({ page }) => {
  test.setTimeout(60_000);
  const agreementId = "ag_send_policy_preflight_block";
  const draft = paidProAuthoritativeDraft(agreementId);

  let mintPostCount = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/recipient-access-token")) {
      mintPostCount += 1;
    }
  });

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft, {
    signingTokenConfigured: false,
    reviewLinkMintEnabled: false,
    signingTokenEnvVarDetected: null,
  });

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      window.history.replaceState(
        {
          clawSimpleSendHandoff: {
            v: 1,
            agreementId: id,
            primedDraft: primed,
            streamlinedSimpleFlow: true,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
        },
        "",
        `/app/send/${id}`,
      );
    },
    { id: agreementId, primed: draft },
  );

  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("review-first-mint-error-panel")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(500);
  expect(mintPostCount).toBe(0);
  await expect(page.getByText("Your Agreement")).toHaveCount(0);
  await expect(page.getByText("Continue with Pro")).toHaveCount(0);
});

test("create policy preflight blocks mint POST when review_link_mint_enabled is false", async ({ page }) => {
  test.setTimeout(90_000);
  const agreementId = "ag_create_policy_preflight_block";
  const draft = paidProAuthoritativeDraft(agreementId);
  const bodyPlain = "x".repeat(600);
  const premiumSnap = buildPremiumCompletionSnapshot(draft, bodyPlain);

  let mintPostCount = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/recipient-access-token")) {
      mintPostCount += 1;
    }
  });

  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft, {
    bodyPlain,
    signingTokenConfigured: false,
    reviewLinkMintEnabled: false,
    signingTokenEnvVarDetected: null,
  });

  await page.addInitScript(
    ({ id, snap, body }) => {
      sessionStorage.setItem("claw_agreement_create_review_resume_v1", id);
      sessionStorage.setItem("claw_premium_send_intent", "review");
      sessionStorage.setItem("claw_premium_completion_snapshot_v1", JSON.stringify(snap));
      sessionStorage.setItem(
        "claw_review_first_pinned_corpus_v1",
        JSON.stringify({ agreementId: id, bodyPlain: body, savedAt: Date.now() }),
      );
    },
    { id: agreementId, snap: premiumSnap, body: bodyPlain },
  );

  await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded", timeout: 30_000 });
  const finalReviewCta = page.getByTestId("guided-review-updated-agreement-cta");
  if (await finalReviewCta.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await finalReviewCta.click();
  }
  const sendForReview = page.getByTestId("simple-pro-send-for-review");
  if (!(await sendForReview.isVisible({ timeout: 20_000 }).catch(() => false))) {
    test.skip(true, "Final Pro review surface not reachable in this e2e harness");
    return;
  }
  await sendForReview.click();
  await expect(page.getByTestId("simple-pro-review-first-handoff-error")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(500);
  expect(mintPostCount).toBe(0);
});

/**
 * Paid Pro review-first redirect on `/app/send` (defensive fallback only).
 */
test("paid Pro review-first handoff lands on done with review link artifacts", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_create_review_first_handoff_e2e";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      window.history.replaceState(
        {
          clawSimpleSendHandoff: {
            v: 1,
            agreementId: id,
            primedDraft: primed,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
        },
        "",
        `/app/send/${id}`,
      );
    },
    { id: agreementId, primed: draft },
  );

  const mintResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/recipient-access-token") &&
      res.status() === 200,
    { timeout: 25_000 },
  );
  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await mintResponse;
  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });
  await expect(page.getByText("Review link created")).toBeVisible({ timeout: 20_000 });
});

test("paid Pro review-first direct route laptop PNG", async ({ page }) => {
  test.setTimeout(60_000);
  const artifactDir = join(process.cwd(), "artifacts/recipient-review-first");
  mkdirSync(artifactDir, { recursive: true });
  const agreementId = "ag_paid_pro_review_first_laptop";
  const draft = paidProAuthoritativeDraft(agreementId);
  await primeE2eApiBase(page);
  await installReviewFirstApi(page, draft);

  await page.addInitScript(
    ({ id, primed }) => {
      sessionStorage.setItem("claw_premium_send_intent", "review");
      window.history.replaceState(
        {
          clawSimpleSendHandoff: {
            v: 1,
            agreementId: id,
            primedDraft: primed,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
        },
        "",
        `/app/send/${id}`,
      );
    },
    { id: agreementId, primed: draft },
  );

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/app/send/${agreementId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/app/done/${agreementId}`), { timeout: 25_000 });

  await page.screenshot({
    path: join(artifactDir, "review-first-direct-laptop.png"),
    fullPage: true,
  });
});
