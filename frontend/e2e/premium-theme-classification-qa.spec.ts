/**
 * Browser QA: premium dynamic theme routing (fees/referral vs transition).
 * Requires backend :8000, Vite :4173, parse/LLM.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buildAgreementPreviewText } from "../src/components/agreements/agreementPreviewFromDraft";
import type { ParsedDraftShape } from "../src/components/agreements/intakeSmartDefaults";

const ORG = "local-org";
const TIMEOUT_MS = 180_000;

const CASES: Array<{ id: string; text: string }> = [
  {
    id: "referral_channel",
    text: `Need a referral partner agreement. They introduce qualified business clients to us. We pay 12% of collected revenue for first 12 months of each referred client, monthly reporting ledger, right to audit disputes, no bypassing us, no direct side deals with referred clients, confidentiality on pricing and leads, either side can terminate on 30 days notice, unpaid commissions survive termination.`,
  },
  {
    id: "realtor_referral",
    text: `Need a real estate referral fee agreement. A referring realtor sends us buyers who close with our brokerage. We pay the referring agent 25% of our net brokerage commission on each closed transaction they sourced, payable at closing, monthly ledger of closed deals, 12 month exclusivity on that buyer introduction, no side deals with the buyer, either party may end the arrangement on 30 days written notice, referral fee survives termination for deals already in escrow.`,
  },
  {
    id: "influencer_rev_share",
    text: `Influencer agreement for a creator promoting our SaaS. $3,000 flat fee plus 15% rev share on attributable subscription revenue for 9 months after each post, monthly payout with true-up, clawback if refunds exceed 5% in a quarter, FTC disclosure compliance, no competing fintech sponsors for 60 days.`,
  },
  {
    id: "bookkeeping_fixed_fee",
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

test.describe.configure({ mode: "serial", timeout: TIMEOUT_MS });

test.describe("Premium theme classification (4 prompts)", () => {
  for (const { id, text } of CASES) {
    test(id, async ({ page, request }) => {
      test.setTimeout(TIMEOUT_MS);

      const basic = await postParse(request, text, "basic");
      expect(basic.status).toBe(200);
      const basicDraft = normalizeDraft((basic.body.draft as Record<string, unknown>) ?? {});

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
      const snap = JSON.parse(snapJson!) as { premiumReadonlyPlainText?: string; premiumWinningBodyText?: string };
      const premiumPlain = (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || premiumDom).trim();

      const headings = headingStack(premiumPlain);
      const premiumDraft = normalizeDraft((premiumApi.body.draft as Record<string, unknown>) ?? {});
      const fromDraftOnly = buildAgreementPreviewText(premiumDraft, {
        starterPreview: false,
        premiumDeliverablePreview: true,
      });
      const headingsFromPremiumParse = headingStack(fromDraftOnly);

      // eslint-disable-next-line no-console
      console.log(`\n${"=".repeat(72)}\nTHEME QA: ${id}\n${"=".repeat(72)}`);
      // eslint-disable-next-line no-console
      console.log("--- HEADINGS (browser snapshot paper) ---\n", JSON.stringify(headings, null, 2));
      // eslint-disable-next-line no-console
      console.log("--- HEADINGS (premium parse draft → preview only, routing probe) ---\n", JSON.stringify(headingsFromPremiumParse, null, 2));
      // eslint-disable-next-line no-console
      console.log("--- payment_terms (premium parse) ---\n", (premiumDraft.payment_terms || "").slice(0, 900));

      if (id === "referral_channel" || id === "realtor_referral" || id === "influencer_rev_share") {
        const economicsHeading = /FEES\s*&\s*SPEND|REFERRAL,\s*ATTRIBUTION/i;
        const badSecond = /2\.\s+TRANSITION,\s*NOTICE\s*&\s*EXIT/i;
        expect(premiumPlain, "economics should surface under fee/referral heading").toMatch(economicsHeading);
        expect(premiumPlain, "commission-heavy block should not be section 2 transition").not.toMatch(badSecond);
      }
    });
  }
});
