import { expect, test } from "@playwright/test";

const PROMPT =
  "I own a luxury pool and patio company and a local realtor team says they can send us high-end remodel clients. Need referral agreement with 7% on closed jobs they source, paid only after customer deposit clears, no commission on house accounts, no commission on pre-existing clients, and if a customer cancels or chargebacks hit in first 45 days that amount comes out of unpaid commissions. Need metro exclusivity only if they hit minimum lead volume, no poaching our staff, no bypassing us to clients, and a clean review then signature flow.";

const GENERIC_PAYMENT_RE = /\b(to be agreed|to be specified|payment schedule to be agreed)\b/i;

function stageScore(source: string | undefined): number {
  if (!source) return 0;
  if (source === "server_full_document_text") return 5;
  if (source === "server_repair_document_text") return 4;
  if (source === "live_generated_preview") return 3;
  if (source === "legacy_snapshot") return 2;
  if (source === "premium_winning_corpus") return 5;
  if (source === "premium_readonly_snapshot") return 2;
  if (source === "rebuilt_from_draft") return 3;
  if (source === "agreement_document_text") return 1;
  return 0;
}

test("premium referral browser trace finds first frontend divergence", async ({ page }) => {
  const traceRows: Array<Record<string, unknown>> = [];
  const stageRows: Array<Record<string, unknown>> = [];

  await page.addInitScript((prompt) => {
    const pending = {
      title: "Referral Agreement",
      jurisdiction: "Arizona",
      parties: [
        { name: "Luxury Pool Co", role: "party" },
        { name: "Realtor Team", role: "party" },
      ],
      purpose: "Referral relationship.",
      payment_terms: "Payment schedule to be agreed.",
      duration: null,
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
    };
    sessionStorage.setItem("claw_advanced_full_draft_checkout_ok_v1", String(Date.now()));
    sessionStorage.setItem(
      "claw_create_complexity_resume_v1",
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        rawIntake: prompt,
        pending,
        awaitingProCheckout: true,
        resume_kind: "optional_full_upgrade",
        originalUserIntakeRaw: prompt,
      }),
    );
  }, PROMPT);

  await page.route("**/api/agreements/parse", async (route) => {
    const body = route.request().postDataJSON() as { ai_model_class?: string; intake_text?: string };
    const premiumDraft = {
      title: "Referral Agreement — 7% Commission on Closed Jobs",
      jurisdiction: "Arizona",
      parties: [
        { name: "Luxury Pool Co", role: "party" },
        { name: "Realtor Team", role: "party" },
      ],
      purpose:
        "Referral channel for high-end remodel clients with exclusivity tied to minimum lead volume and anti-bypass/no-poach protections.",
      payment_terms:
        "Commission is 7% on closed jobs they source. Paid only after customer deposit clears. No commission on house accounts or pre-existing clients. Cancellations or chargebacks in first 45 days are offset against unpaid commissions.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      additional_terms:
        "Metro exclusivity only while minimum qualified lead volume is met. Non-circumvent and non-solicit protections apply.",
      termination_summary: "Terminate for cause and standard notice; unresolved disputes to agreed forum.",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: premiumDraft,
        parse_meta: {
          model: body.ai_model_class === "premium" ? "gpt-5.4-mini" : "gpt-5.4-nano",
          tokens_in: 700,
          tokens_out: 180,
          response_chars: JSON.stringify(premiumDraft).length,
        },
      }),
    });
  });

  page.on("console", async (msg) => {
    const t = msg.text();
    if (
      !t.includes("[premium-live-trace]") &&
      !t.includes("[premium-trace]") &&
      !t.includes("[premium-dualtrack]") &&
      !t.includes("[premium-quality]") &&
      !t.includes("[premium-render]")
    ) {
      return;
    }
    const vals: unknown[] = [];
    for (const a of msg.args()) {
      try {
        vals.push(await a.jsonValue());
      } catch {
        vals.push(String(a));
      }
    }
    const row = { text: t, args: vals };
    if (t.includes("[premium-live-trace]")) traceRows.push(row);
    else stageRows.push(row);
  });

  await page.goto("/app/create?premiumCompletion=1");
  await page.waitForTimeout(7000);

  const stageNames = [
    "parse_response",
    "premium_pipeline_output",
    "persisted_snapshot",
    "hydrated_snapshot",
    "readonly_corpus_picker",
    "rendered_body_source",
  ];
  const picked = stageNames
    .map((stage) =>
      traceRows.find((r) => {
        const a = (r.args?.[1] || {}) as Record<string, unknown>;
        return String(a.stage || "") === stage;
      }),
    )
    .filter(Boolean) as Array<Record<string, unknown>>;

  expect(picked.length).toBeGreaterThanOrEqual(4);

  const normalized = picked.map((r) => {
    const a = (r.args?.[1] || {}) as Record<string, unknown>;
    return {
      stage: String(a.stage || ""),
      title: String(a.title || ""),
      payment_terms: String(a.payment_terms || ""),
      source_id: String(a.source_id || ""),
      chars: Number(a.chars || 0),
      text_hash: String(a.text_hash || ""),
    };
  });
  // Print compact trace rows for CI/console inspection.
  for (const row of normalized) {
    // eslint-disable-next-line no-console
    console.log(
      `[qa-trace] ${row.stage} | title=${row.title.slice(0, 90)} | payment=${row.payment_terms.slice(0, 120)} | source=${row.source_id} | chars=${row.chars} | hash=${row.text_hash}`,
    );
  }

  let divergence: string | null = null;
  let prevScore = 0;
  for (const row of normalized) {
    if (row.stage !== "readonly_corpus_picker" && (!/referral|commission|services/i.test(row.title) || /payment plan agreement/i.test(row.title))) {
      divergence = `${row.stage}:title_regressed`;
      break;
    }
    if (row.stage !== "readonly_corpus_picker" && GENERIC_PAYMENT_RE.test(row.payment_terms)) {
      divergence = `${row.stage}:payment_generic`;
      break;
    }
    const sc = stageScore(row.source_id);
    if (sc > 0 && prevScore > 0 && sc < prevScore) {
      divergence = `${row.stage}:source_weakened`;
      break;
    }
    if (row.chars < 600) {
      divergence = `${row.stage}:chars_thin`;
      break;
    }
    if (sc > 0) prevScore = sc;
  }
  expect(divergence, divergence || "ok").toBeNull();
});

