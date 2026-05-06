/**
 * Paid LawDog simple-home review-link path: recipient email hydrate from session handoff,
 * send-step gating, preflight console privacy, minted counterparty link, recipient proposal,
 * owner workspace visibility. API-mocked; no VS01 seed/real billing.
 */
import { expect, test, type Page } from "@playwright/test";

const AG_ID = "ag_paid_review_link_qa";
const OWNER_EMAIL = "anthem.blanchard.qa@example.com";
const CP_EMAIL = "sarah.collins.qa@example.com";

type DraftRec = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Array<{ id: string; name: string; role: string; email?: string; phone?: string }>;
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

function paidReviewDraft(now: string): DraftRec {
  return {
    id: AG_ID,
    title: "Paid Pro review QA agreement",
    jurisdiction: "Delaware",
    parties: [
      { id: "party_owner_qa", name: "Anthem Blanchard", role: "owner", email: "", phone: "" },
      { id: "party_reviewer_qa", name: "Sarah Collins", role: "reviewer", email: "", phone: "" },
    ],
    purpose: "Professional services for QA review-link hydration and recipient proposals.",
    payment_terms: "Net 30 from invoice.",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-04-01",
    versions: [{ version: 1, created_at: now, note: "created" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };
}

function installPaidReviewLinkRoutes(page: Page, state: { draft: DraftRec }) {
  return page.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/agreements/access/policy") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipient_link_token_required: false,
          mint_key_configured: false,
          signing_token_configured: false,
        }),
      });
      return;
    }

    if (url.includes("/api/agreements/access/validate") && method === "GET") {
      const u = new URL(url);
      const aid = (u.searchParams.get("agreement_id") || "").trim() || AG_ID;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          agreement_id: aid,
          mode: "review",
          locked_version_id: "lv_review_qa_1",
          role: "reviewer",
          recipient_party_id: "party_reviewer_qa",
          inviter_display_name: "Anthem Blanchard",
        }),
      });
      return;
    }

    if (url.includes("/recipient-access-token") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "tok_review_qa_e2e",
          expires_in_seconds: 3600,
          locked_version_id: "lv_review_qa_1",
        }),
      });
      return;
    }

    if (url.includes("/recipient-proposal") && url.includes("/apply") && method === "POST") {
      const now = new Date().toISOString();
      state.draft.payment_terms = "Revised: 45-day delivery after effective date (E2E applied).";
      state.draft.audit_log = state.draft.audit_log.filter((e) => e.event_type !== "recipient_proposal_pending");
      state.draft.audit_log.push({
        event_type: "recipient_proposal_applied",
        at: now,
        field: null,
        value: { proposal_id: "prop_qa_apply" },
      });
      state.draft.updated_at = now;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ draft: state.draft }),
      });
      return;
    }

    if (url.includes("/recipient-proposal") && method === "POST" && !url.includes("/apply") && !url.includes("/reject")) {
      const b = (route.request().postDataJSON() as { draft?: { payment_terms?: string } } | null) || {};
      const at = new Date().toISOString();
      state.draft.audit_log = [
        ...state.draft.audit_log,
        {
          event_type: "recipient_proposal_pending",
          at,
          field: null,
          value: {
            proposal_id: "prop_qa_submit",
            instruction: "Change final delivery deadline to 45 days after the effective date.",
            proposer_id: "party_reviewer_qa",
            draft: b.draft ?? state.draft,
            rendered_html: "<p>QA suggestion</p>",
            submitted_at: at,
          },
        },
      ];
      state.draft.updated_at = at;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ proposal_id: "prop_qa_submit", ok: true }),
      });
      return;
    }

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Paid review QA <strong>render</strong></p>" }),
      });
      return;
    }

    if (url.includes("/revise") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: { ...state.draft, payment_terms: "Preview: 45-day delivery (E2E preview only)." },
          rendered_html: "<p>Preview revised</p>",
        }),
      });
      return;
    }

    if (method !== "GET" && (url.match(/\/api\/agreements\/[^/]+(\/[^?]*)?$/) || url.includes("/update-field"))) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (id === AG_ID && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: state.draft,
          economics: {
            tier: "paid",
            watermark_required: false,
            free_draft_expired: false,
            free_draft_expires_at: null,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not_found" }) });
  });
}

async function seedSessionAndRoutes(page: Page, state: { draft: DraftRec }) {
  await page.addInitScript(
    ({ agreementId, ownerEmail, cpEmail }) => {
      try {
        localStorage.removeItem("claw_premium_completed");
        sessionStorage.removeItem("claw_paid_premium_completion_session_v1");
        sessionStorage.setItem("claw_premium_send_intent", "review");
        sessionStorage.setItem(
          "claw_premium_recipient_handoff_v2",
          JSON.stringify({
            v: 2,
            party1: { name: "Anthem Blanchard", email: ownerEmail, role: "owner" },
            party2: { name: "Sarah Collins", email: cpEmail, role: "reviewer" },
            savedAt: Date.now(),
          }),
        );
        sessionStorage.setItem(`claw_simple_send_unlocked_${encodeURIComponent(agreementId)}`, "1");
      } catch {
        /* ignore */
      }
    },
    { agreementId: AG_ID, ownerEmail: OWNER_EMAIL, cpEmail: CP_EMAIL },
  );
  await installPaidReviewLinkRoutes(page, state);
}

test.describe("paid LawDog review-link path (hydrate + mint + proposal)", () => {
  test("hydrate, preflight, create-review CTA, counterparty link, suggestion, owner sees proposal", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const now = new Date().toISOString();
    const state = { draft: paidReviewDraft(now) };
    await seedSessionAndRoutes(page, state);

    const preflightMessages: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("[review-link-recipient-email-preflight]")) preflightMessages.push(t);
    });

    await page.goto(`/app/send/${encodeURIComponent(AG_ID)}?phase=send`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ agreementId }) => {
        const prev = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.replaceState(
          {
            ...prev,
            clawSimpleSendHandoff: {
              v: 1,
              agreementId,
              primedDraft: null,
              streamlinedSimpleFlow: false,
              premiumSendIntent: "review",
              openFlowPhase: "send",
              savedAt: Date.now(),
            },
            clawPremiumSendIntent: "review",
          },
          "",
          window.location.href,
        );
      },
      { agreementId: AG_ID },
    );
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);

    await expect
      .poll(() => preflightMessages.length, { timeout: 45_000 })
      .toBeGreaterThan(0);

    const preflightJoined = preflightMessages.join("\n");
    expect(preflightJoined).toMatch(/\[review-link-recipient-email-preflight\]/);
    expect(preflightJoined).not.toMatch(/anthem\.blanchard|sarah\.collins|@/);
    expect(preflightJoined).toMatch(/recipientEmailCount:\s*2/);
    expect(preflightJoined).toMatch(/counterpartyEmailCount:\s*1/);

    const blocking = page.getByRole("status").filter({ hasText: /Add at least one recipient email/i });
    await expect(blocking).toHaveCount(0, { timeout: 30_000 });

    const createReview = page.getByRole("button", { name: /Create review links/ });
    await expect(createReview.first()).toBeEnabled({ timeout: 30_000 });

    await expect(page.getByText(/Add at least one signer email and mobile number/i)).toHaveCount(0);

    /**
     * Minted counterparty URL (same shape as {@link mintRecipientAccessToken} + `agreementMagicLinkPath`).
     * Paid simple-home send hides the delivery-matrix “Email review link” control; the mock token matches POST /recipient-access-token.
     */
    const counterpartyReviewUrl = `http://127.0.0.1:4173/agreements/${encodeURIComponent(AG_ID)}/review?t=tok_review_qa_e2e`;

    const recipientPage = await context.newPage();
    await installPaidReviewLinkRoutes(recipientPage, state);
    await recipientPage.goto(counterpartyReviewUrl, { waitUntil: "domcontentloaded" });

    const requestChangesLanding = recipientPage.getByRole("button", { name: "Request changes" });
    if (await requestChangesLanding.isVisible().catch(() => false)) {
      await requestChangesLanding.first().click();
    } else {
      const reviewCta = recipientPage.getByRole("button", { name: "Review agreement" });
      await expect(reviewCta.first()).toBeVisible({ timeout: 30_000 });
      await reviewCta.first().click();
      await expect(recipientPage.getByRole("button", { name: "Request changes" })).toBeVisible({ timeout: 20_000 });
      await recipientPage.getByRole("button", { name: "Request changes" }).click();
    }

    await expect(recipientPage.getByText("Write request", { exact: true })).toBeVisible({ timeout: 20_000 });
    const ta = recipientPage.locator("#recipient-revision-input");
    await ta.fill("Change final delivery deadline to 45 days after the effective date.");
    await recipientPage.getByRole("button", { name: "Preview changes" }).click();
    await expect(recipientPage.getByText("Send suggestions for review").first()).toBeVisible({ timeout: 20_000 });
    await recipientPage.getByRole("button", { name: "Send suggestions for review" }).first().click();
    await expect(recipientPage.getByTestId("recipient-send-suggested-edits-modal")).toBeVisible({ timeout: 10_000 });
    await recipientPage.getByTestId("recipient-send-suggested-edits-confirm").click();
    await expect(recipientPage.getByTestId("recipient-suggested-edits-sent-ack")).toBeVisible({
      timeout: 20_000,
    });
    await recipientPage.close();

    const ownerWs = await context.newPage();
    await installPaidReviewLinkRoutes(ownerWs, state);
    await ownerWs.goto(`http://127.0.0.1:4173/app/agreements/${encodeURIComponent(AG_ID)}`, { waitUntil: "domcontentloaded" });
    await expect(ownerWs.getByText("Material change summary", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(
      ownerWs.getByText(/Suggested edits|pending your review|submitted_at|Received:/i).first(),
    ).toBeVisible();
    const previewOrApply = ownerWs.getByRole("button", { name: /Preview changes|Apply changes/i }).first();
    if (await previewOrApply.isVisible().catch(() => false)) {
      await previewOrApply.click();
      const apply = ownerWs.getByRole("button", { name: "Apply changes" });
      if (await apply.isVisible().catch(() => false)) {
        await apply.click();
        await expect(ownerWs.getByText("Material change summary", { exact: true })).toHaveCount(0, { timeout: 25_000 });
      }
    }
    await ownerWs.close();

    await page.getByRole("button", { name: /Create review links/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/done/${AG_ID}`));
    await expect(page.getByText("Review links to share")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Copy Sarah Collins review link/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy public verify link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open" }).first()).toHaveAttribute("href", /\/review\?t=/);
  });
});
