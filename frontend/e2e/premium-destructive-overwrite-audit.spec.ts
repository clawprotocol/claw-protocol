import { expect, test } from "@playwright/test";

type Case = {
  id: string;
  prompt: string;
  parsedDraft: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    id: "referral_pool_realtor",
    prompt:
      "Luxury pool referral with 7% after deposit clears; no commission on house/pre-existing; 45-day clawback; exclusivity threshold; non-circumvent and no-poach.",
    parsedDraft: {
      title: "Referral Agreement — 7% Commission on Closed Jobs",
      jurisdiction: "Arizona",
      parties: [{ name: "Luxury Pool Co", role: "company" }, { name: "Realtor Team", role: "referral partner" }],
      purpose: "1. Scope: high-end remodel referrals. 2. Payment: 7% after deposit clears.",
      payment_terms:
        "7% commission on closed sourced jobs, paid after deposit clears; no commission on house/pre-existing accounts; 45-day chargeback offset clawback.",
      additional_terms:
        "Ownership/IP: customer and CRM data remain company-owned. Exclusivity: metro only with lead threshold. Non-circumvent and non-solicit apply.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
      termination_summary: "For-cause termination and post-term protection tail.",
    },
  },
  {
    id: "contractor_sales_rep",
    prompt: "Independent closer with 11% commission, no authority to bind, CRM ownership, no bypass, no poach.",
    parsedDraft: {
      title: "Independent Contractor Sales Representative Agreement",
      jurisdiction: "Texas",
      parties: [{ name: "RoofCo", role: "company" }, { name: "Closer", role: "independent contractor" }],
      purpose: "Outside sales scope and authority controls.",
      payment_terms: "11% commission on closed sourced deals after funds clear.",
      additional_terms: "Ownership/IP and CRM remain company-owned; non-circumvent and non-solicit protections.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "independent_contractor_agreement",
    },
  },
  {
    id: "channel_partner",
    prompt: "Channel referral, 8% rev share, protected accounts, anti-bypass and no-hire.",
    parsedDraft: {
      title: "Channel Partner Referral Agreement",
      jurisdiction: "Delaware",
      parties: [{ name: "VendorCo", role: "provider" }, { name: "ChannelCo", role: "channel partner" }],
      purpose: "Attribution and protected account framework.",
      payment_terms: "8% revenue share on collected receipts from protected accounts.",
      additional_terms: "Exclusivity conditions, non-circumvent, and non-solicit/no-hire tail.",
      duration: "24 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
    },
  },
  {
    id: "nda_referral_hybrid",
    prompt: "Mutual NDA plus referral protection with ownership and non-circumvent/no-poach.",
    parsedDraft: {
      title: "Confidentiality and Referral Protection Agreement",
      jurisdiction: "New York",
      parties: [{ name: "Data Owner", role: "discloser" }, { name: "Referral Partner", role: "recipient" }],
      purpose: "Confidential collaboration with referral protection.",
      payment_terms: "Referral commission tracked for introduced accounts.",
      additional_terms: "Ownership/IP and customer list rights retained by discloser; non-circumvent and non-solicit apply.",
      duration: "18 months",
      due_date: null,
      effective_date: null,
      agreement_family: "confidentiality_commercial_protections_agreement",
    },
  },
  {
    id: "services_media_buy",
    prompt: "Marketing services with monthly fee + 9% ad spend, approvals, ownership of ad accounts/leads.",
    parsedDraft: {
      title: "Marketing Services Agreement",
      jurisdiction: "California",
      parties: [{ name: "Agency", role: "service provider" }, { name: "Client", role: "client" }],
      purpose: "Media buying and campaign management scope.",
      payment_terms: "Monthly management fee plus 9% of ad spend; reimbursable pre-approved expenses.",
      additional_terms: "Ownership/IP and lead export rights to client; approval gate and compliance controls.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
    },
  },
  {
    id: "influencer_referral",
    prompt: "Influencer referral partner gets 10% on sourced paid collaborations after deposit clears, with no bypass and no-poach.",
    parsedDraft: {
      title: "Influencer Referral Agreement",
      jurisdiction: "Florida",
      parties: [{ name: "BrandCo", role: "company" }, { name: "Influencer Partner", role: "referral partner" }],
      purpose: "Influencer-sourced collaboration referral scope.",
      payment_terms: "10% commission on sourced paid collaborations after deposit clears.",
      additional_terms: "Exclusivity by lead volume, non-circumvent, non-solicit, and data ownership.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "services_agreement",
    },
  },
  {
    id: "roofing_independent_closer",
    prompt: "Roofing independent closer with commission, CRM ownership, no authority to bind, no fake promises.",
    parsedDraft: {
      title: "Independent Contractor Sales Closer Agreement",
      jurisdiction: "Texas",
      parties: [{ name: "RoofCo", role: "company" }, { name: "Closer", role: "independent contractor" }],
      purpose: "Outside sales close support and representation limits.",
      payment_terms: "Commission on closed sourced deals with clawback for early cancellations.",
      additional_terms: "Ownership/IP of CRM and leads, non-circumvent, non-solicit, and compliance controls.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      agreement_family: "independent_contractor_agreement",
    },
  },
  {
    id: "nda_ownership_ip_hybrid",
    prompt: "NDA with invention assignment and ownership/IP return-destruction, non-circumvent and no-poach.",
    parsedDraft: {
      title: "Confidentiality and Commercial Protections Agreement",
      jurisdiction: "Delaware",
      parties: [{ name: "Innovator LLC", role: "discloser" }, { name: "Counterparty LLC", role: "recipient" }],
      purpose: "Confidential evaluation plus ownership/IP safeguards.",
      payment_terms: "No fees unless referral schedule is attached.",
      additional_terms: "Ownership/IP, invention assignment, return/destruction, non-circumvent, and non-solicit.",
      duration: "24 months",
      due_date: null,
      effective_date: null,
      agreement_family: "confidentiality_commercial_protections_agreement",
    },
  },
];

type StagePayload = Record<string, unknown>;

const CLAUSE_FAMILIES: Array<{ key: string; re: RegExp }> = [
  { key: "ownership_ip", re: /\b(ownership|ip|intellectual property|work product|invention|crm|lead data|customer list)\b/i },
  { key: "exclusivity", re: /\b(exclusive|exclusivity|territory|lead threshold)\b/i },
  { key: "non_circumvent", re: /\b(non-circumvent|anti-bypass|bypass)\b/i },
  { key: "non_solicit", re: /\b(non-solicit|no-poach|no-hire)\b/i },
];

function textOf(p: StagePayload): string {
  return `${String(p.purpose || "")}\n${String(p.payment_terms || "")}\n${String(p.additional_terms || "")}`;
}

function sectionLabels(p: StagePayload): string[] {
  return Array.isArray(p.section_labels) ? (p.section_labels as string[]).map((s) => String(s)) : [];
}

for (const c of CASES) {
  test(`destructive overwrite audit ${c.id}`, async ({ page }) => {
    const stages: Record<string, StagePayload> = {};

    await page.addInitScript((args: { prompt: string; family?: string; jurisdiction?: string }) => {
      const pending = {
        title: "Referral Agreement",
        jurisdiction: args.jurisdiction || "Delaware",
        parties: [{ name: "Party A", role: "party" }, { name: "Party B", role: "party" }],
        purpose: "Referral relationship.",
        payment_terms: "Payment schedule to be agreed.",
        duration: null,
        due_date: null,
        effective_date: null,
        agreement_family: args.family || "services_agreement",
      };
      sessionStorage.setItem("claw_advanced_full_draft_checkout_ok_v1", String(Date.now()));
      sessionStorage.setItem(
        "claw_create_complexity_resume_v1",
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          rawIntake: args.prompt,
          pending,
          awaitingProCheckout: true,
          resume_kind: "optional_full_upgrade",
          originalUserIntakeRaw: args.prompt,
        }),
      );
    }, { prompt: c.prompt, family: String(c.parsedDraft.agreement_family || ""), jurisdiction: String(c.parsedDraft.jurisdiction || "") });

    await page.route("**/api/agreements/parse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: c.parsedDraft,
          parse_meta: { model: "gpt-5.4-mini", tokens_in: 720, tokens_out: 200, response_chars: JSON.stringify(c.parsedDraft).length },
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
      const payload = (vals[1] || {}) as StagePayload;
      const stage = String(payload.stage || "");
      if (["parse_response", "premium_pipeline_output", "persisted_snapshot", "rendered_body_source"].includes(stage)) {
        stages[stage] = payload;
      }
    });

    await page.goto("/app/create?premiumCompletion=1");
    await page.waitForTimeout(7000);

    const parse = stages.parse_response;
    const pipe = stages.premium_pipeline_output;
    const persisted = stages.persisted_snapshot;
    const rendered = stages.rendered_body_source;
    expect(parse).toBeTruthy();
    expect(pipe).toBeTruthy();
    expect(persisted).toBeTruthy();
    expect(rendered).toBeTruthy();

    const weak: string[] = [];

    const parseSig = Array.isArray(parse.signature_labels) ? (parse.signature_labels as string[]) : [];
    const renderSig = Array.isArray(rendered.signature_labels) ? (rendered.signature_labels as string[]) : [];
    if (parseSig.length && renderSig.length && renderSig.some((s) => /^party [ab]$/i.test(s))) weak.push("signature_block_labels");

    const pLabels = sectionLabels(parse);
    const rLabels = sectionLabels(rendered);
    if (pLabels.length >= 2 && rLabels.length >= 2) {
      const parseLead = pLabels.slice(0, 2).join(">");
      const renderLead = rLabels.slice(0, 2).join(">");
      if (parseLead !== renderLead && !rLabels.every((x) => pLabels.includes(x))) weak.push("section_ordering");
    }

    const pText = textOf(parse);
    const pipelineText = textOf(pipe);
    const renderText = textOf(rendered);
    for (const fam of CLAUSE_FAMILIES) {
      if (fam.re.test(pText) && !fam.re.test(pipelineText)) weak.push(`${fam.key}_lost_at_pipeline`);
      if (fam.re.test(pipelineText) && !fam.re.test(renderText)) weak.push(`${fam.key}_lost_at_render`);
    }

    const parseRoles = Array.isArray(parse.party_roles) ? (parse.party_roles as string[]).map((r) => String(r).toLowerCase()) : [];
    const renderRoles = Array.isArray(rendered.party_roles) ? (rendered.party_roles as string[]).map((r) => String(r).toLowerCase()) : [];
    if (parseRoles.some((r) => r && r !== "party") && !renderRoles.some((r) => r && r !== "party")) weak.push("party_roles_lost_at_render");

    const parsePay = String(parse.payment_terms || "");
    if (
      /\b\d{1,2}\s*%|commission|deposit clears|clawback|chargeback/i.test(parsePay) &&
      !/\b\d{1,2}\s*%|commission|deposit clears|clawback|chargeback/i.test(renderText)
    ) {
      weak.push("economics_lost_at_render");
    }

    if (weak.length) {
      // eslint-disable-next-line no-console
      console.log(`[destructive-audit] case=${c.id} weaken=${weak.join(",")}`);
    }
    expect(weak, `destructive weakening in ${c.id}: ${weak.join(",")}`).toEqual([]);
  });
}

