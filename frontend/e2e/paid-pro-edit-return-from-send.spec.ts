/**
 * Paid Pro: Edit Draft from /app/send/:id must resume /app/create with authoritative corpus
 * (no starter POST /api/agreements/draft, no forced Retry Pro CTA). API-mocked.
 */
import { expect, test, type Page } from "@playwright/test";

const AG_EDIT = "ag_paid_pro_edit_return_e2e";
const CORPUS = "E".repeat(620);

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
  server_full_document_text?: string;
  premium_render_source?: string;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  created_at: string;
  updated_at: string;
};

function editReturnDraft(now: string): DraftRec {
  return {
    id: AG_EDIT,
    title: "Edit return QA",
    jurisdiction: "Delaware",
    parties: [
      { id: "p1", name: "Owner QA", role: "owner", email: "owner.qa@example.com", phone: "" },
      { id: "p2", name: "Reviewer QA", role: "reviewer", email: "reviewer.qa@example.com", phone: "" },
    ],
    purpose: "Paid Pro edit-return path.",
    payment_terms: "Net 30.",
    duration: "12 months",
    due_date: null,
    effective_date: "2026-04-01",
    server_full_document_text: CORPUS,
    premium_render_source: "server_full_document_text",
    versions: [{ version: 1, created_at: now, note: "created" }],
    audit_log: [],
    created_at: now,
    updated_at: now,
  };
}

function installEditReturnRoutes(page: Page, state: { draft: DraftRec; draftPostCount: number }) {
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

    if (url.includes("/render") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rendered_html: "<p>Edit return QA <strong>render</strong></p>" }),
      });
      return;
    }

    if (method === "POST" && url.includes("/api/agreements/draft")) {
      state.draftPostCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: AG_EDIT, draft: state.draft }),
      });
      return;
    }

    if (method !== "GET" && (url.match(/\/api\/agreements\/[^/]+(\/[^?]*)?$/) || url.includes("/update-field"))) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    const m = url.match(/\/api\/agreements\/([^/?]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (id === AG_EDIT && method === "GET") {
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

test("paid Pro send → Edit Draft resumes create without POST /draft or Retry Pro CTA", async ({ page }) => {
  test.setTimeout(120_000);
  const now = new Date().toISOString();
  const state = { draft: editReturnDraft(now), draftPostCount: 0 };
  await installEditReturnRoutes(page, state);

  await page.addInitScript(
    ({ agreementId }) => {
      try {
        sessionStorage.setItem(`claw_simple_send_unlocked_${encodeURIComponent(agreementId)}`, "1");
        sessionStorage.setItem("claw_premium_send_intent", "review");
        sessionStorage.setItem(
          "claw_premium_recipient_handoff_v2",
          JSON.stringify({
            v: 2,
            party1: { name: "Owner QA", email: "owner.qa@example.com", role: "owner" },
            party2: { name: "Reviewer QA", email: "reviewer.qa@example.com", role: "reviewer" },
            savedAt: Date.now(),
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { agreementId: AG_EDIT },
  );

  /** Review step avoids send-step watermark modal intercepting the edit control. */
  await page.goto(`/app/send/${encodeURIComponent(AG_EDIT)}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ agreementId, draft }) => {
      const prev = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.replaceState(
        {
          ...prev,
          clawSimpleSendHandoff: {
            v: 1,
            agreementId,
            primedDraft: draft,
            streamlinedSimpleFlow: false,
            premiumSendIntent: "review",
            openFlowPhase: "review",
            savedAt: Date.now(),
          },
          clawPremiumSendIntent: "review",
        },
        "",
        window.location.href,
      );
    },
    { agreementId: AG_EDIT, draft: state.draft },
  );
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText("Something went wrong displaying this agreement.")).toHaveCount(0);

  const editBackToCreate = page.getByRole("button", { name: "Edit Draft" });
  await expect(editBackToCreate.first()).toBeVisible({ timeout: 45_000 });

  await editBackToCreate.first().click();
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 30_000 });

  await expect(page.getByRole("button", { name: /^Retry Pro draft$/ })).toHaveCount(0, { timeout: 45_000 });

  expect(state.draftPostCount).toBe(0);

  await expect(page.getByText(/owner\.qa@example|reviewer\.qa@example/)).toHaveCount(0);
});
