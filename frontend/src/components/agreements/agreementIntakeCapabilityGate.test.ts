import { describe, expect, it } from "vitest";
import {
  assessAgreementIntakeCapability,
  buildAgreementIntakeClarification,
  evaluateIntentionalCreateDraftSubmit,
} from "./agreementIntakeCapabilityGate";

const COUNSEL_PREP_PILOT = `Hey LawDog, I need help with a customer agreement issue.

We're trying to close a paid pilot with a mid-market customer. It's a 60-day pilot, about $15k, and if it goes well it should convert into a $150k-ish annual SaaS deal.

They're asking us to skip our normal MSA/order form process and just sign their "pilot agreement." I don't want to slow the deal down, but some of their terms feel way too broad.

Can you help me figure out:
1. Whether we should push them back to our pilot order form/MSA/DPA setup or accept their pilot agreement with edits.
2. Which terms are actual deal risks vs. normal legal noise.
3. What positions I should take on liability, IP ownership, outputs, data use, termination, indemnity, audit rights, and SOC 2.
4. A simple negotiation plan for the AE to send back without sounding like we're lawyering the deal to death.
5. Suggested fallback language or clause edits for the risky parts.
6. A short list of things I should confirm internally before we send comments back.

Please keep it practical and GTM-focused. I'm not looking for a law school memo.`;

describe("assessAgreementIntakeCapability", () => {
  it("blocks counsel-prep / negotiation Q&A with guided clarification + suggested rewrite", () => {
    const decision = assessAgreementIntakeCapability(COUNSEL_PREP_PILOT);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("counsel_prep");
    expect(decision.clarification.kind).toBe("counsel_prep");
    expect(decision.clarification.whatWeHeard.length).toBeGreaterThan(0);
    expect(decision.clarification.guidedSteps.length).toBeGreaterThanOrEqual(3);
    expect(decision.clarification.suggestedRewrite).toMatch(/Draft a .+pilot agreement between/i);
    expect(decision.clarification.suggestedRewrite).toMatch(/\$15k|\$15,000/i);
    expect(decision.clarification.suggestedRewrite).toMatch(/\[Your Company Legal Name\]/);
    expect(decision.clarification.suggestedRewrite).toMatch(/\[Customer Legal Name\]/);
    expect(decision.userMessage).toMatch(/negotiation prep|executable agreements/i);
    expect(decision.userMessage).toMatch(/How to fix it/i);
  });

  it("allows an explicit draft-between-parties pilot agreement request", () => {
    const decision = assessAgreementIntakeCapability(
      "Draft a 60-day SaaS pilot agreement between Northstar Analytics LLC and Contoso MidMarket Inc for $15,000. " +
        "If the pilot succeeds it may convert to an annual SaaS subscription near $150k. " +
        "Include liability caps, IP ownership of work product, data use restrictions, and SOC 2 Type I representations.",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows ordinary short services intakes", () => {
    const decision = assessAgreementIntakeCapability(
      "Create a services agreement between Alex Rivera and PixelForge Labs for mobile app UI design for 6 weeks at $4500.",
    );
    expect(decision.ok).toBe(true);
  });

  it("guides sparse prompts that lack parties and deal basics", () => {
    const decision = assessAgreementIntakeCapability("need an NDA");
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("too_sparse");
    expect(decision.clarification.suggestedRewrite).toMatch(/non-disclosure|NDA|\[Party/i);
  });

  it("guides commercial prompts that omit named parties", () => {
    const decision = assessAgreementIntakeCapability(
      "We need a 60-day paid SaaS pilot for about $15k converting to annual if it works. Include liability and SOC 2.",
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("missing_named_parties");
    expect(decision.clarification.guidedSteps.some((s) => /between/i.test(s))).toBe(true);
    expect(decision.clarification.suggestedRewrite).toMatch(/between \[/i);
  });
});

const COUNSEL_PREP_ENTERPRISE_SAAS = `Hey LawDog, I need help thinking through a customer contract issue.

We're trying to get a new enterprise customer over the line. It's a 12-month SaaS subscription, around $240k ACV, with a possible expansion if the first team rollout goes well.

The customer wants to use their paper instead of ours. I'm fine being flexible, but their agreement has a few terms that seem pretty heavy for this deal size and for what the product actually does.

Some of the things they're asking for:
- unlimited liability for data security, confidentiality, IP claims, and service failures
- a 99.9% uptime SLA with service credits and termination rights
- custom security obligations that go beyond our current security program
- full audit rights, including on-site audits and interviews with our personnel
- approval rights over all subprocessors
- 30-day termination for convenience
- customer ownership of all data, configurations, reports, outputs, and "derivative works"
- broad indemnity for any losses connected to use of the product
- a right to withhold payment if there's any dispute
- a requirement that we support their internal policies even if they change later

Our product will handle their internal business records, employee names/emails, and usage analytics. It should not involve PHI, PCI, children's data, or government classified information.

Can you help me figure out:
1. Whether we should accept their paper and mark it up or push them back to our MSA/order form/DPA.
2. Which terms are the biggest commercial or legal risks.
3. What our preferred and fallback positions should be on liability, SLA, security commitments, audit rights, subprocessors, IP/output ownership, indemnity, termination, and payment disputes.
4. Where we can make reasonable concessions without creating bad precedent.
5. Suggested language or redline concepts for the most problematic clauses.
6. A short AE-friendly note explaining our position without making this feel like a legal standoff.
7. What I should confirm with security, product, finance, and legal before responding.

Please keep this practical. I need deal guidance, not a long memo. Tell me what to push back on, what we can probably live with, and what needs attorney review before we agree.`;

describe("buildAgreementIntakeClarification", () => {
  it("extracts retest pilot economics into the suggested rewrite", () => {
    const c = buildAgreementIntakeClarification(COUNSEL_PREP_PILOT);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("counsel_prep");
    expect(c!.whatWeHeard.some((h) => /60-day|\$15k|mid-market|negotiation/i.test(h))).toBe(true);
    expect(c!.primaryCtaLabel).toMatch(/suggested draft request/i);
  });

  it("thoroughly salvages enterprise SaaS counsel-prep facts into heard + rewrite", () => {
    const c = buildAgreementIntakeClarification(COUNSEL_PREP_ENTERPRISE_SAAS);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("counsel_prep");
    const heard = c!.whatWeHeard.join(" | ");
    expect(heard).toMatch(/12-month/i);
    expect(heard).toMatch(/\$240k/i);
    expect(heard).toMatch(/enterprise/i);
    expect(heard).toMatch(/their paper/i);
    expect(heard).toMatch(/SLA|uptime/i);
    expect(heard).toMatch(/subprocessor/i);
    expect(heard).toMatch(/indemnity/i);
    expect(heard).toMatch(/withhold|payment dispute/i);
    expect(heard).toMatch(/PHI|PCI/i);
    expect(heard).toMatch(/topics called out \(\d{2,}\)|topics called out \(1[0-4]\)/i);

    const rewrite = c!.suggestedRewrite || "";
    expect(rewrite).toMatch(/Draft a 12-month SaaS subscription agreement between/i);
    expect(rewrite).toMatch(/\$240k/i);
    expect(rewrite).toMatch(/uptime SLA|service credits/i);
    expect(rewrite).toMatch(/subprocessor/i);
    expect(rewrite).toMatch(/IP \/ outputs|data ownership/i);
    expect(rewrite).toMatch(/security commitments/i);
    expect(rewrite).toMatch(/payment dispute|withhold/i);
    expect(rewrite).toMatch(/PHI|PCI|Out of scope|Data scope/i);
    expect(rewrite).not.toMatch(/pilot agreement/i);
  });

  it("covers a wide spectrum of commercial topics across deal families (product-wide)", () => {
    const mega = `Hey LawDog, help me thinking through a customer contract issue before we respond.

It's a 24-month SaaS subscription, about $480k ARR, auto-renewal with 90-day renewal notice.
Customer paper asks for:
- unlimited liability and consequential damages
- 99.95% uptime SLA with service credits
- SOC 2 Type II plus ISO 27001 and penetration testing rights
- full audit rights and subprocessor approval
- GDPR/CCPA DPA with EU data residency
- source code escrow and work-for-hire on outputs
- most-favored pricing and annual price increases capped
- insurance with cyber liability COI
- arbitration in New York and jury waiver
- assignment restrictions on change of control
- force majeure carveouts
- non-solicit for 12 months
- publicity / logo use without approval
- late fees on invoices and net 30 payment terms
- change orders for out-of-scope work

We process customer content and PII. No PHI, PCI, or children's data.
Governing law: Delaware.

Can you help me figure out:
1. Whether we should accept their paper with edits or push to our MSA/order form/DPA.
2. Which terms are the biggest commercial risks.
3. What preferred and fallback positions should be.
I'm not looking for a law school memo.`;

    const c = buildAgreementIntakeClarification(mega);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("counsel_prep");
    const blob = `${c!.whatWeHeard.join(" ")} ${c!.suggestedRewrite}`;
    for (const needle of [
      /24-month/i,
      /\$480k|480k/i,
      /renewal|auto-?renew/i,
      /liability/i,
      /SLA|uptime/i,
      /SOC\s*2/i,
      /subprocessor/i,
      /DPA|privacy|GDPR|CCPA/i,
      /IP|ownership|escrow|work for hire/i,
      /MFN|pricing|price/i,
      /insurance/i,
      /governing law|Delaware|arbitration|dispute/i,
      /assignment|change of control/i,
      /force majeure/i,
      /publicity|logo/i,
      /payment|late fee|net 30/i,
      /PII|PHI|PCI/i,
    ]) {
      expect(blob, `missing spectrum needle ${needle}`).toMatch(needle);
    }
    expect(c!.suggestedRewrite).toMatch(/Draft a 24-month SaaS subscription agreement between/i);
    // No account / identity coupling in salvage output.
    expect(blob).not.toMatch(/Anthem|Blanchard|047b01af|Genesis Dog/i);
  });
});

describe("evaluateIntentionalCreateDraftSubmit", () => {
  it("returns clarification on block_capability for counsel-prep", () => {
    const decision = evaluateIntentionalCreateDraftSubmit(COUNSEL_PREP_PILOT);
    expect(decision.action).toBe("block_capability");
    if (decision.action !== "block_capability") return;
    expect(decision.clarification.suggestedRewrite).toBeTruthy();
  });
});
