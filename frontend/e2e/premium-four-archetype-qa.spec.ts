/**
 * Ephemeral real-browser QA — 4 archetypes. Delete after run.
 * Requires: backend :8000, Vite :4173 (playwright webServer), LLM keys for parse.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "../src/components/agreements/agreementPreviewConstants";
import { buildAgreementPreviewText } from "../src/components/agreements/agreementPreviewFromDraft";
import type { ParsedDraftShape } from "../src/components/agreements/intakeSmartDefaults";

const ORG = "local-org";
const TIMEOUT_MS = 180_000;

const ARCHETYPES: Array<{ id: string; text: string }> = [
  {
    id: "1_marketing_agency",
    text: `My skincare e-commerce brand is hiring a growth marketing agency to run Meta, TikTok, Google, and Klaviyo. Need a serious agreement: no spending above approved budgets without written signoff, all ad accounts / pixels / audiences / creatives / landing pages / customer data remain ours, no undisclosed subcontractors, weekly reporting dashboard, refund / chargeback cooperation, FTC and product claim compliance, 30 day cancellation notice, and they cannot reuse our funnels for direct competitors for 12 months.`,
  },
  {
    id: "2_referral_channel",
    text: `Need a referral partner agreement. They introduce qualified business clients to us. We pay 12% of collected revenue for first 12 months of each referred client, monthly reporting ledger, right to audit disputes, no bypassing us, no direct side deals with referred clients, confidentiality on pricing and leads, either side can terminate on 30 days notice, unpaid commissions survive termination.`,
  },
  {
    id: "3_influencer_creator",
    text: `Need an influencer agreement for a creator promoting our wellness brand. $8,500 total, half upfront half on final delivery. Need 3 short videos, 5 story posts, usage rights for paid ads for 6 months, approval rights before posting, FTC disclosure compliance, no competitor skincare sponsors for 45 days, reshoots for missed deliverables, termination if offensive conduct damages brand.`,
  },
  {
    id: "4_plain_services_light_conf",
    text: `Need a simple monthly bookkeeping agreement for a small business. $1,200 per month, reconciliations and monthly reports, either side can cancel with 15 days notice, contractor keeps information private, no taxes or legal advice included, invoices due in 10 days.`,
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
  const res = await request.post("http://127.0.0.1:8000/api/agreements/parse", {
    headers: { "X-Claw-Org-Id": ORG, "Content-Type": "application/json" },
    data: { intake_text: intake, ai_model_class: tier },
    timeout: TIMEOUT_MS,
  });
  const status = res.status();
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status, body };
}

function headingStack(plain: string): string[] {
  return plain
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s+[A-Z]/.test(l));
}

function hasAdditionalCommercial(plain: string): boolean {
  return /ADDITIONAL\s+COMMERCIAL\s+COMMITMENTS/i.test(plain);
}

function esignDupCount(plain: string): number {
  const line = AGREEMENT_PREVIEW_ESIGN_NOTICE;
  return Math.max(0, plain.split(line).length - 1);
}

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test.describe("Premium four-archetype browser QA (ephemeral)", () => {
  for (const { id, text } of ARCHETYPES) {
    test(id, async ({ page, request }) => {
      test.setTimeout(TIMEOUT_MS);

      const basic = await postParse(request, text, "basic");
      expect(basic.status).toBe(200);
      const basicDraft = normalizeDraft((basic.body.draft as Record<string, unknown>) ?? {});
      const freeRendered = buildAgreementPreviewText(basicDraft, { starterPreview: true });

      const premiumApi = await postParse(request, text, "premium");
      expect(premiumApi.status).toBe(200);

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
      await page.waitForTimeout(16_000);

      const article = page.locator('[aria-label="Agreement document preview"]');
      await article.waitFor({ state: "visible", timeout: TIMEOUT_MS - 8000 });

      const premiumDom = (await article.innerText().catch(() => "")).trim();
      expect(premiumDom.length).toBeGreaterThan(200);

      const snapJson = await page.evaluate(() => sessionStorage.getItem("claw_premium_completion_snapshot_v1"));
      expect(snapJson).toBeTruthy();
      const snap = JSON.parse(snapJson!) as {
        premiumReadonlyPlainText?: string;
        premiumWinningBodyText?: string;
      };
      const premiumPlain = (
        snap.premiumWinningBodyText ||
        snap.premiumReadonlyPlainText ||
        premiumDom
      ).trim();

      const headings = headingStack(premiumPlain);
      const additional = hasAdditionalCommercial(premiumPlain);
      const esignN = esignDupCount(premiumPlain);

      const shotPath = `/tmp/premium-qa-${id}.png`;
      await article.screenshot({ path: shotPath, type: "png" }).catch(() => {});

      // eslint-disable-next-line no-console
      console.log(`\n${"=".repeat(72)}\nARCHETYPE: ${id}\n${"=".repeat(72)}`);
      // eslint-disable-next-line no-console
      console.log("--- RAW PROMPT ---\n", text);
      // eslint-disable-next-line no-console
      console.log("--- FREE STARTER (buildAgreementPreviewText basic parse, starterPreview) ---\n", freeRendered.slice(0, 3200));
      // eslint-disable-next-line no-console
      console.log("--- PREMIUM READONLY (snapshot winner/readonly fallback → DOM if empty) ---\n", premiumPlain.slice(0, 4500));
      // eslint-disable-next-line no-console
      console.log("--- PREMIUM DOM (article innerText, first 2000) ---\n", premiumDom.slice(0, 2000));
      // eslint-disable-next-line no-console
      console.log("--- HEADING STACK ---\n", JSON.stringify(headings, null, 2));
      // eslint-disable-next-line no-console
      console.log("--- FLAGS ---", {
        ADDITIONAL_COMMERCIAL_COMMITMENTS: additional,
        esign_line_count: esignN,
        screenshot: shotPath,
      });
    });
  }
});
