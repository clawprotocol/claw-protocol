import { expect, test } from "@playwright/test";

type AuditCase = {
  id: string;
  prompt: string;
  parsedDraft: {
    title: string;
    jurisdiction: string;
    parties: Array<{ name: string; role: string }>;
    purpose: string;
    payment_terms: string;
    duration: string | null;
    due_date: string | null;
    effective_date: string | null;
    agreement_family: string;
    additional_terms?: string;
    termination_summary?: string;
  };
};

const CASES: AuditCase[] = [
  {
    id: "referral_pool_realtor",
    prompt:
      "I own a luxury pool and patio company and a local realtor team says they can send us high-end remodel clients. Need referral agreement with 7% on closed jobs they source, paid only after customer deposit clears, no commission on house accounts, no commission on pre-existing clients, and if a customer cancels or chargebacks hit in first 45 days that amount comes out of unpaid commissions. Need metro exclusivity only if they hit minimum lead volume, no poaching our staff, no bypassing us to clients, and a clean review then signature flow.",
    parsedDraft: {
      title: "Referral Agreement — 7% Commission on Closed Jobs",
      jurisdiction: "Arizona",
      parties: [
        { name: "Luxury Pool Co", role: "company" },
        { name: "Realtor Team", role: "referral partner" },
      ],
      purpose:
        "Scope: Referral of high-end remodel opportunities. Protections: metro exclusivity only with minimum lead volume; no poaching; no bypass.",
      payment_terms:
        "Commission is 7% on closed sourced jobs, paid only after customer deposit clears. No commission on house accounts or pre-existing clients. 45-day cancellation/chargeback clawback offsets against unpaid commissions.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      additional_terms:
        "Clauses: Non-circumvent, non-solicit, exclusivity threshold, attribution log, dispute escalation.",
      termination_summary: "Terminate for cause and uncured breach.",
    },
  },
  {
    id: "contractor_sales_rep",
    prompt:
      "Need independent contractor outside sales rep agreement for roofing leads: 11% on closed jobs, no authority to bind, no fake promises, CRM belongs to us, revoke access on termination.",
    parsedDraft: {
      title: "Independent Contractor Sales Representative Agreement",
      jurisdiction: "Texas",
      parties: [
        { name: "RoofCo", role: "company" },
        { name: "Outside Sales Rep", role: "independent contractor" },
      ],
      purpose:
        "Scope: outside sales and lead conversion support. Controls: no authority to bind, no misleading representations.",
      payment_terms:
        "Compensation: 11% commission on closed jobs sourced by representative; paid after cleared customer funds.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "independent_contractor_agreement",
      additional_terms:
        "CRM ownership, access revocation on termination, no unauthorized commitments, quality reporting cadence.",
      termination_summary: "Immediate termination for fraud, misconduct, or repeated non-compliance.",
    },
  },
  {
    id: "channel_partner",
    prompt:
      "Channel partner referral agreement with protected accounts, 8% rev share on collected receipts, anti-bypass and no-hire, quarterly true-up.",
    parsedDraft: {
      title: "Channel Partner Referral Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "VendorCo", role: "provider" },
        { name: "Channel Partner", role: "channel partner" },
      ],
      purpose: "Sections: Scope, Attribution, Protected Accounts, Exclusivity Conditions.",
      payment_terms:
        "8% revenue share on collected receipts from attributable protected accounts, quarterly statement and true-up.",
      duration: "24 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      additional_terms:
        "Anti-circumvention, no-hire tail, territory carve-outs, protected account sunset rules.",
      termination_summary: "For-cause termination and post-term payout survival for attributed accounts.",
    },
  },
  {
    id: "nda_referral_hybrid",
    prompt:
      "Mutual NDA plus referral protection: customer lists and CRM stay ours, non-circumvent and no-poach, commissions tracked for introduced accounts.",
    parsedDraft: {
      title: "Confidentiality and Referral Protection Agreement",
      jurisdiction: "New York",
      parties: [
        { name: "Data Owner LLC", role: "discloser" },
        { name: "Referral Partner LLC", role: "recipient" },
      ],
      purpose: "Confidential sharing for referral collaboration with customer-list protection.",
      payment_terms: "Referral commissions tracked per introduced accounts schedule.",
      duration: "18 months",
      due_date: null,
      effective_date: null,
      agreement_family: "confidentiality_commercial_protections_agreement",
      additional_terms:
        "Return/destroy obligations, non-circumvent, no-hire, injunctive relief, account-attribution ledger.",
      termination_summary: "Confidentiality and referral protections survive termination.",
    },
  },
  {
    id: "services_media_buy",
    prompt:
      "Marketing services agreement: monthly management fee plus 9% of ad spend, pre-approved reimbursements only, client approval before publishing claims, ownership of ad accounts and lead exports to client.",
    parsedDraft: {
      title: "Marketing Services Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Agency Alpha", role: "service provider" },
        { name: "Client Bravo", role: "client" },
      ],
      purpose: "Scope: media buying and campaign operations with approval workflow controls.",
      payment_terms:
        "Monthly management fee plus 9% of ad spend; reimbursements require prior written approval and receipts.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      additional_terms:
        "Claim-approval gate, account ownership transfer, lead-data export rights, change-order controls.",
      termination_summary: "30-day convenience termination, immediate for material misconduct.",
    },
  },
];

const GENERIC_PAY_RE = /\b(to be agreed|to be specified|payment schedule to be agreed|tbd)\b/i;

function changedFields(parseLog: Record<string, unknown>, pipelineLog: Record<string, unknown>): Record<string, string> {
  const parseRoles = (Array.isArray(parseLog.party_roles) ? (parseLog.party_roles as string[]) : []).join("|");
  const pipelineRoles = (Array.isArray(pipelineLog.party_roles) ? (pipelineLog.party_roles as string[]) : []).join("|");
  const pairs: Array<[string, string, string]> = [
    ["title", String(parseLog.title || ""), String(pipelineLog.title || "")],
    ["payment_terms", String(parseLog.payment_terms || ""), String(pipelineLog.payment_terms || "")],
    ["section_labels", JSON.stringify(parseLog.section_labels || []), JSON.stringify(pipelineLog.section_labels || [])],
    ["clause_specificity_score", String(parseLog.clause_specificity_score ?? ""), String(pipelineLog.clause_specificity_score ?? "")],
    ["party_roles", parseRoles, pipelineRoles],
  ];
  const outMap: Record<string, string> = {};
  for (const [k, a, b] of pairs) {
    if ((a || "").trim() !== (b || "").trim()) {
      outMap[k] = `from=${(a || "").slice(0, 120)} | to=${(b || "").slice(0, 120)}`;
    }
  }
  return outMap;
}

for (const c of CASES) {
  test(`canonicalization audit ${c.id}`, async ({ page }) => {
    let parseLog: Record<string, unknown> | null = null;
    let pipelineLog: Record<string, unknown> | null = null;

    await page.addInitScript((args: { prompt: string; parsedDraft: { jurisdiction?: string; agreement_family?: string } }) => {
      const prompt = args.prompt;
      const parsedDraft = args.parsedDraft || {};
      const pending = {
        title: "Referral Agreement",
        jurisdiction: parsedDraft.jurisdiction || "Delaware",
        parties: [
          { name: "Party A", role: "party" },
          { name: "Party B", role: "party" },
        ],
        purpose: "Referral relationship.",
        payment_terms: "Payment schedule to be agreed.",
        duration: null,
        due_date: null,
        effective_date: null,
        agreement_family: parsedDraft.agreement_family || "services_agreement",
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
    }, { prompt: c.prompt, parsedDraft: c.parsedDraft });

    await page.route("**/api/agreements/parse", async (route) => {
      const body = route.request().postDataJSON() as { ai_model_class?: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: c.parsedDraft,
          parse_meta: {
            model: body.ai_model_class === "premium" ? "gpt-5.4-mini" : "gpt-5.4-nano",
            tokens_in: 700,
            tokens_out: 180,
            response_chars: JSON.stringify(c.parsedDraft).length,
          },
        }),
      });
    });

    page.on("console", async (msg) => {
      if (!msg.text().includes("[premium-live-trace]")) return;
      const vals: unknown[] = [];
      for (const a of msg.args()) {
        try {
          vals.push(await a.jsonValue());
        } catch {
          vals.push(String(a));
        }
      }
      const payload = (vals[1] || {}) as Record<string, unknown>;
      const stage = String(payload.stage || "");
      if (stage === "parse_response") parseLog = payload;
      if (stage === "premium_pipeline_output") pipelineLog = payload;
    });

    await page.goto("/app/create?premiumCompletion=1");
    await page.waitForTimeout(7000);
    expect(parseLog).not.toBeNull();
    expect(pipelineLog).not.toBeNull();
    const changes = changedFields(parseLog || {}, pipelineLog || {});
    const changedKeys = Object.keys(changes);
    // eslint-disable-next-line no-console
    console.log(`[canonical-audit] case=${c.id} changed_fields=${changedKeys.join(",") || "(none)"}`);
    for (const k of changedKeys) {
      // eslint-disable-next-line no-console
      console.log(`[canonical-audit] case=${c.id} ${k} ${changes[k]}`);
    }
    const outPay = String(pipelineLog?.payment_terms || "");
    if (!GENERIC_PAY_RE.test(String(parseLog?.payment_terms || ""))) {
      expect(outPay).not.toMatch(GENERIC_PAY_RE);
    }
    const parsedRoles = Array.isArray(parseLog?.party_roles)
      ? (parseLog?.party_roles as string[]).map((r) => String(r).toLowerCase())
      : [];
    const outRoles = Array.isArray(pipelineLog?.party_roles)
      ? (pipelineLog?.party_roles as string[]).map((r) => String(r).toLowerCase())
      : [];
    const parsedSpecificRole = parsedRoles.some((r) => r && r !== "party");
    if (parsedSpecificRole) {
      expect(outRoles.some((r) => r && r !== "party")).toBeTruthy();
    }
    const parsedSpecificity = Number(parseLog?.clause_specificity_score || 0);
    const outSpecificity = Number(pipelineLog?.clause_specificity_score || 0);
    expect(outSpecificity).toBeGreaterThanOrEqual(Math.max(1, parsedSpecificity - 1));
  });
}

