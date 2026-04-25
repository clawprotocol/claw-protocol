/**
 * Real browser QA: 6 prompts × (free preview text from basic parse draft,
 * premium readonly DOM, backend parse JSON, pipeline console stage, picker source).
 * Requires backend on :8000 (Vite proxies /api) and working LLM keys for premium parse.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buildAgreementPreviewText } from "../src/components/agreements/agreementPreviewFromDraft";
import type { ParsedDraftShape } from "../src/components/agreements/intakeSmartDefaults";

const ORG = "local-org";
const TIMEOUT_MS = 180_000;

const PROMPTS: Array<{ name: string; text: string }> = [
  {
    name: "referral_commission",
    text: "I introduced a roofing company to storm restoration jobs. Need a referral agreement where I get 11% of net collected revenue on any job I source, paid within 3 business days after customer funds clear. Need audit rights, no side deals, chargeback clawback only proportionally, and 18-month tail on leads I introduced.",
  },
  {
    name: "marketing_agency",
    text: "My e-commerce brand wants to hire a marketing agency that will run Meta/TikTok ads and email flows. Need spend approval limits, ownership of ad accounts and pixel data, no hidden subcontractors, performance reporting, confidentiality, FTC compliance, chargeback handling, cancellation notice, and no using our creatives for competitors.",
  },
  {
    name: "re_jv",
    text: "Two friends and I are buying distressed houses together but nobody trusts each other enough right now. Need a simple JV agreement covering who finds deals, who funds earnest money, who manages rehab, profit splits by project, what happens if someone flakes, approval rights for budgets, deadlock resolution, and signatures tonight.",
  },
  {
    name: "ic_closer",
    text: "Need an independent contractor agreement for a sales closer calling inbound leads. 15% commission on collected cash, no salary, weekly reporting, company owns CRM data, no poaching leads, confidentiality, immediate termination for fraud, Texas law.",
  },
  {
    name: "nda_hybrid",
    text: "I need an NDA with a software developer who will also build internal tools for us. Need confidentiality, IP ownership to us, no reuse of proprietary workflows, secure deletion on request, milestone delivery schedule, payment by milestone, and injunctive relief.",
  },
  {
    name: "influencer",
    text: "We’re hiring a creator for a 3-month campaign. Need 6 videos + 12 stories monthly, FTC disclosure compliance, approval rights before posting, usage rights for paid ads for 12 months, morality clause, cancellation rights, payment half upfront half on delivery.",
  },
];

function normalizeDraft(d: Record<string, unknown>): ParsedDraftShape {
  const partiesRaw = Array.isArray(d.parties) ? d.parties : [];
  const parties = partiesRaw.slice(0, 2).map((p: unknown) => {
    const o = p as Record<string, unknown>;
    return { name: String(o.name ?? "").slice(0, 280), role: String(o.role ?? "party") };
  });
  while (parties.length < 2) {
    parties.push({ name: parties.length ? "Party B" : "Party A", role: "party" });
  }
  return {
    title: String(d.title ?? "Agreement"),
    jurisdiction: String(d.jurisdiction ?? "Delaware"),
    parties,
    purpose: String(d.purpose ?? ""),
    payment_terms: String(d.payment_terms ?? ""),
    duration: d.duration == null || d.duration === "" ? null : String(d.duration),
    due_date: d.due_date == null || d.due_date === "" ? null : String(d.due_date),
    effective_date: d.effective_date == null || d.effective_date === "" ? null : String(d.effective_date),
    payment: { amount: null, cadence: null, valid: true },
    termination_summary: d.termination_summary != null ? String(d.termination_summary) : null,
    additional_terms: d.additional_terms != null ? String(d.additional_terms) : null,
    agreement_family: d.agreement_family as ParsedDraftShape["agreement_family"],
  };
}

async function postParse(request: APIRequestContext, intake: string, tier: "basic" | "premium") {
  /** Hit backend directly — Playwright `request` + Vite baseURL can 404 on /api in CI. */
  const res = await request.post("http://127.0.0.1:8000/api/agreements/parse", {
    headers: { "X-Claw-Org-Id": ORG, "Content-Type": "application/json" },
    data: { intake_text: intake, ai_model_class: tier },
    timeout: TIMEOUT_MS,
  });
  const status = res.status();
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status, body };
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test.describe("Premium six-prompt browser QA (live parse)", () => {
  for (const { name, text } of PROMPTS) {
    test(`${name}: capture free/premium/render source`, async ({ page, request }) => {
      test.setTimeout(TIMEOUT_MS);

      const basic = await postParse(request, text, "basic");
      expect(basic.status, `basic parse status ${basic.status}`).toBe(200);
      const basicDraft = normalizeDraft((basic.body.draft as Record<string, unknown>) ?? {});
      const freeRendered = buildAgreementPreviewText(basicDraft, { starterPreview: true });

      const premiumApi = await postParse(request, text, "premium");
      expect(premiumApi.status, `premium parse status ${premiumApi.status}`).toBe(200);

      const parseBodies: string[] = [];
      page.on("response", async (resp) => {
        const u = resp.url();
        if (!u.includes("/api/agreements/parse")) return;
        try {
          parseBodies.push(`${resp.status()} ${(await resp.text()).slice(0, 8000)}`);
        } catch {
          /* ignore */
        }
      });

      const liveTraceStages: Array<Record<string, unknown>> = [];
      page.on("console", async (msg) => {
        const t = msg.text();
        if (!t.includes("[premium-live-trace]") && !t.includes("[premium-picker-audit]")) return;
        for (const a of msg.args()) {
          try {
            const j = await a.jsonValue();
            if (j && typeof j === "object" && "stage" in (j as object)) {
              liveTraceStages.push(j as Record<string, unknown>);
            }
          } catch {
            /* ignore */
          }
        }
      });

      await page.addInitScript(
        ({ prompt, pending }) => {
          try {
            localStorage.setItem("claw_org_id", "local-org");
          } catch {
            /* ignore */
          }
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
        },
        { prompt: text, pending: basicDraft },
      );

      await page.goto("/app/create?premiumCompletion=1");
      await page.waitForTimeout(14_000);

      const article = page.locator('[aria-label="Agreement document preview"]');
      await article.waitFor({ state: "visible", timeout: TIMEOUT_MS - 5000 }).catch(() => null);

      const premiumDom = (await article.innerText().catch(() => "")).trim();
      expect(premiumDom.length, "premium DOM should have body").toBeGreaterThan(400);

      const snapJson = await page.evaluate(() => sessionStorage.getItem("claw_premium_completion_snapshot_v1"));
      expect(snapJson).toBeTruthy();
      const snap = JSON.parse(snapJson!) as {
        premiumDraft?: ParsedDraftShape;
        premiumReadonlyPlainText?: string;
        premiumWinningBodyText?: string;
      };
      const addLen = (snap.premiumDraft?.additional_terms ?? "").length;
      const purposeLen = (snap.premiumDraft?.purpose ?? "").length;
      const payLen = (snap.premiumDraft?.payment_terms ?? "").length;

      const pipelineObj = liveTraceStages.find((r) => String(r.stage) === "premium_pipeline_output");
      const renderObj = liveTraceStages.find((r) => String(r.stage) === "rendered_body_source");
      const parseObj = liveTraceStages.find((r) => String(r.stage) === "parse_response");

      // eslint-disable-next-line no-console
      console.log(`\n========== QA ${name} ==========`);
      // eslint-disable-next-line no-console
      console.log("--- (1) FREE (starter preview from basic parse draft, same as app tier) ---\n", freeRendered.slice(0, 3500));
      // eslint-disable-next-line no-console
      console.log("--- (2) PREMIUM DOM (readonly article innerText) ---\n", premiumDom.slice(0, 4500));
      // eslint-disable-next-line no-console
      console.log("--- (3) BACKEND basic parse (trunc) ---\n", JSON.stringify(basic.body).slice(0, 4000));
      // eslint-disable-next-line no-console
      console.log("--- (3b) BACKEND premium parse (trunc) ---\n", JSON.stringify(premiumApi.body).slice(0, 4000));
      // eslint-disable-next-line no-console
      console.log("--- (4) premium_pipeline_output (parsed console object) ---\n", JSON.stringify(pipelineObj ?? {}, null, 0).slice(0, 4000));
      // eslint-disable-next-line no-console
      console.log("--- (5) rendered_body_source ---\n", JSON.stringify(renderObj ?? {}, null, 0).slice(0, 4000));
      // eslint-disable-next-line no-console
      console.log("--- (4b) parse_response trace (if any) ---\n", JSON.stringify(parseObj ?? {}, null, 0).slice(0, 4000));
      // eslint-disable-next-line no-console
      console.log("--- SCHEMA LOAD RATIO additional_terms / (purpose+payment) ---", {
        additional_terms_len: addLen,
        purpose_len: purposeLen,
        payment_len: payLen,
        ratio_add_to_core: +((addLen / Math.max(1, purposeLen + payLen)).toFixed(2)),
      });

      expect(renderObj, "expect rendered_body_source trace").toBeTruthy();
    });
  }
});
