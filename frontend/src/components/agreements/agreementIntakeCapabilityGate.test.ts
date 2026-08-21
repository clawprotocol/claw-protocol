import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(rewrite).toMatch(/children'?s\s+data/i);
    expect(rewrite).not.toMatch(/pilot agreement/i);
  });

  it("guides nonsensical / low-signal prompts with a starter template (universal)", () => {
    const mash = assessAgreementIntakeCapability("asdfasdfasdf qwerty zxcvbnm lorem ipsum dolor ".repeat(6));
    expect(mash.ok).toBe(false);
    if (mash.ok) return;
    expect(mash.code).toBe("low_signal");
    expect(mash.clarification.suggestedRewrite).toMatch(/Draft a .+ agreement between/i);

    const junk = assessAgreementIntakeCapability(
      "!!! ### @@@ 🚀🚀🚀 random pasted chat nonsense without any companies fees or contracts " +
        "blah blah blah filler filler filler more filler and emoji spam 🎉🎉🎉",
    );
    expect(junk.ok).toBe(false);
    if (junk.ok) return;
    expect(junk.code).toBe("low_signal");
  });

  it("guides too-thin draft-between shells that lack fee/term/purpose", () => {
    const decision = assessAgreementIntakeCapability(
      "Draft an agreement between Alpha and Beta about stuff.",
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("needs_commercial_basics");
  });

  it("allows substantive custom prompts without memorized deal-family labels", () => {
    const peacefulJourney = assessAgreementIntakeCapability(
      "please create a agreement between Peaceful Journey LLC and Truity Credit Union for understanding " +
        "that delinquent mortgage payments and equity line of credit payments will be satisfied through " +
        "either settlement or Judgment of tortious interference and defamation civil cases of which " +
        "Cynthia Blanchard is a claimant once the case settles or wins period effective upon signing " +
        "date of both parties",
    );
    expect(peacefulJourney.ok).toBe(true);

    const spectrum = [
      "Create an agreement between Harbor Peak LLC and Red Mesa Credit Union regarding satisfaction of " +
        "delinquent mortgage and HELOC balances from settlement or judgment proceeds in related civil claims, " +
        "effective upon signing.",
      "Draft an agreement between Orion Labs LLC and Vega Partners LP to memorialize that revenue-share " +
        "payments from the joint catalog will be split 60/40 after platform fees, commencing on the signing date.",
      "Please create an agreement between Northstar Analytics LLC and Contoso Holdings Inc for understanding " +
        "that Contoso will release claims against Northstar upon receipt of the negotiated lump-sum settlement " +
        "payment, effective upon execution by both parties.",
      "Write an agreement between Cedar Craft Co and Delta Distributors LLC covering exclusive wholesale " +
        "distribution of Cedar's seasonal product line in Texas, with purchase orders as the ordering mechanism.",
    ];
    for (const intake of spectrum) {
      const decision = assessAgreementIntakeCapability(intake);
      expect(decision.ok, intake.slice(0, 80)).toBe(true);
    }
  });

  it("clarification gate does not require catalog deal-family keywords to proceed", () => {
    // Source-lock: draft+parties+purpose path must not demand NDA/SaaS/services labels.
    const file = readFileSync(join(__dirname, "agreementIntakeClarification.ts"), "utf8");
    expect(file).toContain("hasSubstantiveDealPurpose");
    expect(file).toMatch(/hasMoney \|\| hasTerm \|\| hasDealType \|\| hasTopics \|\| hasPurpose/);
    expect(file).not.toMatch(
      /if \(hasDraftIntent && hasBetweenParties\)[\s\S]{0,400}Name the agreement type \(services, NDA, SaaS/,
    );
  });

  it("preserves children’s / COPPA exclusions from list-style data-scope sentences", () => {
    const c = buildAgreementIntakeClarification(
      "Hey LawDog, help me thinking through a customer contract. 12-month SaaS, $100k ACV.\n" +
        "It should not involve PHI, PCI, children's data, or government classified information.\n" +
        "Can you help me figure out:\n" +
        "1. Whether we should accept their paper with edits.\n" +
        "2. Which terms are actual deal risks.\n" +
        "I'm not looking for a law school memo.",
    );
    expect(c?.kind).toBe("counsel_prep");
    expect(c?.suggestedRewrite || "").toMatch(/children'?s\s+data/i);
    expect(c?.whatWeHeard.join(" ")).toMatch(/children'?s\s+data/i);
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

describe("messy prose with embedded party names (GTM LawDog hole #10)", () => {
  const MESSY_TWO_COMPANY_PROMPT = `hey so I run Harbor Pool & Patio in Scottsdale, we do high-end remodels. Mesa Realty Group (the team at the old mill office, like 8 agents) said they can send us clients. I want a referral deal, 7% of the job once the customer actually puts a deposit down, not on our house accounts or anyone we already talked to last year. if they cancel or chargeback in the first 45 days that comes out of what I still owe them. they want exclusive in phoenix metro but only if they actually send enough leads, I don't want to be locked if they send 2 people and disappear. no poaching my guys, they can't go around me to the homeowner. also my dog is named Biscuit and I like the color teal, ignore that. arizona law I guess? start whenever we sign, run a year. I still need to look at it before anyone signs.`;

  it("allows messy 'I run X. Y said they can' prose when two company names are obvious", () => {
    const decision = assessAgreementIntakeCapability(MESSY_TWO_COMPANY_PROMPT);
    expect(decision.ok).toBe(true);
  });

  it("extracts Harbor Pool and Mesa Realty Group from messy prose", () => {
    const c = buildAgreementIntakeClarification(MESSY_TWO_COMPANY_PROMPT);
    // Should return null (no clarification needed) because parties are found
    expect(c).toBeNull();
  });

  it("still blocks when prompt has commercial details but truly zero party names", () => {
    const noNamesPrompt =
      "I want a referral deal, 7% of the job once the customer puts a deposit down. " +
      "They want exclusive in the metro area but only if they send enough leads. " +
      "No poaching my guys. Start whenever we sign, run a year. Arizona law.";
    const decision = assessAgreementIntakeCapability(noNamesPrompt);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    // Either missing_named_parties or low_signal is acceptable - both communicate
    // "we can't proceed without party names" to the user
    expect(["missing_named_parties", "low_signal"]).toContain(decision.code);
    // The clarification should guide toward adding parties
    expect(decision.clarification.suggestedRewrite).toMatch(/between.*Party.*Legal Name/i);
  });

  it("allows similar 'We work with X. Y referred us' prose patterns with commercial anchors", () => {
    const variations = [
      // MSA-style with dollar amount and term
      "My company Summit AI Consulting LLC does ML integrations. Vertex Data Partners reached out about a joint project for their enterprise clients. $50k budget, 3-month engagement. Need an MSA.",
      // Services with clear fee and duration
      "I run Cedar Woodworks LLC. River Valley Realty Group wants us to build custom cabinetry for their staged homes. $8,000 per project, ongoing for the next year. California law.",
      // Referral deal with both parties having entity suffixes
      "We work with Apex Construction LLC on commercial builds. Sterling Property Management Inc said they can refer tenants who need renovations. 10% referral fee for 12 months. Texas law.",
    ];
    for (const intake of variations) {
      const decision = assessAgreementIntakeCapability(intake);
      expect(decision.ok, intake.slice(0, 60)).toBe(true);
    }
  });
});

describe("2–4 party edge spectrum (product-wide)", () => {
  it("defaults sparse prompts to a 2-party starter rewrite", () => {
    const decision = assessAgreementIntakeCapability("need an NDA");
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.clarification.suggestedRewrite).toMatch(/between .+ and .+/i);
    expect(decision.clarification.suggestedRewrite).not.toMatch(/among/i);
    expect(decision.clarification.suggestedRewrite).not.toMatch(/Party 5/i);
  });

  it("counsel-prep rewrite stays bipartite until more parties are named", () => {
    const c = buildAgreementIntakeClarification(COUNSEL_PREP_ENTERPRISE_SAAS);
    expect(c?.kind).toBe("counsel_prep");
    expect(c?.suggestedRewrite).toMatch(/between \[Your Company Legal Name\] and \[Customer Legal Name\]/i);
    expect(c?.suggestedRewrite).not.toMatch(/Party 3|among/i);
  });

  it("unnamed explicit three-party NDA asks for the three legal names and does not invent a two-party draft", () => {
    const prompt =
      "Provide an NDA for 3 parties using Texas law for proprietary IP for the statutory limit";
    const decision = assessAgreementIntakeCapability(prompt);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("missing_named_parties");
    expect(decision.clarification.whatWeHeard.join(" ")).toMatch(/3-party deal/i);
    expect(decision.clarification.suggestedRewrite).toMatch(
      /among \[Party 1 Legal Name\], \[Party 2 Legal Name\], and \[Party 3 Legal Name\]/i,
    );
    expect(decision.clarification.suggestedRewrite).not.toMatch(/between \[Your Company LLC\] and \[Customer Inc\.\]/i);
  });

  it("three-party labeled commercial prompt suggests among A, B, and C brackets", () => {
    const decision = assessAgreementIntakeCapability(
      "We need a three-party services agreement for $25k over 90 days covering integration work. " +
        "Include liability caps and confidentiality.",
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("missing_named_parties");
    expect(decision.clarification.suggestedRewrite).toMatch(
      /among \[Party 1 Legal Name\], \[Party 2 Legal Name\], and \[Party 3 Legal Name\]/i,
    );
    expect(decision.clarification.suggestedRewrite).not.toMatch(/Party 5/i);
  });

  it("allows a clear 3-party among draft with fee and term", () => {
    const decision = assessAgreementIntakeCapability(
      "Draft a 6-month services agreement among Alpha Services LLC, Beta Operations Inc, and Gamma Partners LP " +
        "for $40,000 covering joint integration work. Include IP ownership and termination for convenience.",
    );
    expect(decision.ok).toBe(true);
  });

  it("four-party among draft proceeds; rewrite helpers use four brackets when parties missing", () => {
    const ok = assessAgreementIntakeCapability(
      "Draft a four-party services agreement among Alpha LLC, Beta Inc, Gamma Corp, and Delta LP " +
        "for $80k over 12 months for shared platform operations.",
    );
    expect(ok.ok).toBe(true);

    const missing = assessAgreementIntakeCapability(
      "Need a four-party SaaS subscription for about $120k ACV for 12 months with SOC 2 and liability caps.",
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe("missing_named_parties");
    expect(missing.clarification.suggestedRewrite).toMatch(
      /among \[Party 1 Legal Name\], \[Party 2 Legal Name\], \[Party 3 Legal Name\], and \[Party 4 Legal Name\]/i,
    );
  });

  it("caps 5+ entity / affiliate prompts at 2–4 signing parties", () => {
    const five = assessAgreementIntakeCapability(
      "Draft a services agreement among Alpha LLC, Beta Inc, Gamma Corp, Delta LP, and Echo Holdings LLC " +
        "for $50k over 6 months covering shared ops. Include confidentiality.",
    );
    expect(five.ok).toBe(false);
    if (five.ok) return;
    expect(five.code).toBe("party_count_cap");
    expect(five.clarification.title).toMatch(/2–4|2-4/i);
    expect(five.clarification.suggestedRewrite).toMatch(/among /i);
    expect(five.clarification.suggestedRewrite).toMatch(/Alpha LLC/);
    expect(five.clarification.suggestedRewrite).toMatch(/Delta LP/);
    expect(five.clarification.suggestedRewrite).not.toMatch(/Echo Holdings|Party 5/i);

    const affiliates = assessAgreementIntakeCapability(
      "Draft a SaaS subscription between Northstar LLC and Contoso Inc for $100k ACV. All affiliates will sign. Term 12 months.",
    );
    expect(affiliates.ok).toBe(false);
    if (affiliates.ok) return;
    expect(affiliates.code).toBe("party_count_cap");
  });

  it("does not account-branch on party-count salvage output", () => {
    const c = buildAgreementIntakeClarification(
      "Draft among A1 LLC, B2 Inc, C3 LP, D4 Corp, and E5 Ltd for $10k services over 30 days.",
    );
    expect(c?.kind).toBe("party_count_cap");
    const blob = `${c?.whatWeHeard.join(" ")} ${c?.suggestedRewrite}`;
    expect(blob).not.toMatch(/Anthem|Blanchard|047b01af|Genesis Dog|orgId|userId/i);
  });
});

describe("thin dump fail-open to starter (broad draftable signals)", () => {
  it("allows thin dump with hired-to pattern to fail-open to starter", () => {
    // This exact input was blocking with "I can draft this once I know who is agreeing"
    const decision = assessAgreementIntakeCapability(
      "I hired Mike to paint my office. We shook on it.",
    );
    // Should proceed (return ok: true) - fail-open to starter with targeted questions
    expect(decision.ok).toBe(true);
  });

  it("allows thin dump without hired/contracted verbs - deal with name", () => {
    // Must pass without requiring specific transaction verbs
    const decision = assessAgreementIntakeCapability(
      "need a painting deal with Mike for my office",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows thin dump without hired/contracted verbs - agreed with name", () => {
    // Must pass without requiring specific transaction verbs
    const decision = assessAgreementIntakeCapability("Mike is painting my office, we agreed");
    expect(decision.ok).toBe(true);
  });

  it("allows dump with just a name and scope", () => {
    const decision = assessAgreementIntakeCapability("Sarah will design my website");
    expect(decision.ok).toBe(true);
  });

  it("allows dump with just scope/work fragment", () => {
    const decision = assessAgreementIntakeCapability(
      "need someone to fix the broken fence in my yard",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows dump with exchange indicator", () => {
    const decision = assessAgreementIntakeCapability(
      "we have a deal for some consulting work",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows contracted-for pattern to fail-open", () => {
    const decision = assessAgreementIntakeCapability(
      "I contracted someone to do landscaping for my yard.",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows engaged-to pattern to fail-open", () => {
    const decision = assessAgreementIntakeCapability(
      "We engaged a consultant to review our marketing strategy.",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows retained-to pattern to fail-open", () => {
    const decision = assessAgreementIntakeCapability("I retained Sarah to handle my bookkeeping.");
    expect(decision.ok).toBe(true);
  });

  it("allows commissioned-to pattern to fail-open", () => {
    const decision = assessAgreementIntakeCapability(
      "I commissioned an artist to create a mural for our lobby.",
    );
    expect(decision.ok).toBe(true);
  });

  it("allows paying-for pattern to fail-open", () => {
    const decision = assessAgreementIntakeCapability(
      "I'm paying someone to fix my website issues.",
    );
    expect(decision.ok).toBe(true);
  });

  it("still blocks actual gibberish even if short", () => {
    // Pure gibberish should still be blocked
    const decision = assessAgreementIntakeCapability("asdfghjkl qwerty test");
    expect(decision.ok).toBe(false);
  });

  it("still blocks very short prompts without any draftable signal", () => {
    const decision = assessAgreementIntakeCapability("need help");
    expect(decision.ok).toBe(false);
  });

  it("still blocks empty-ish prompts via evaluateIntentionalCreateDraftSubmit", () => {
    // Very short prompts are blocked by the < 6 char check in evaluateIntentionalCreateDraftSubmit
    const decision = evaluateIntentionalCreateDraftSubmit("hello");
    expect(decision.action).toBe("block_capability");
  });
});
