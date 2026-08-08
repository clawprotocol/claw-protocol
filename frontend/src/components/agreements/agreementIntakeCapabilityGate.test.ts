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

describe("buildAgreementIntakeClarification", () => {
  it("extracts retest pilot economics into the suggested rewrite", () => {
    const c = buildAgreementIntakeClarification(COUNSEL_PREP_PILOT);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("counsel_prep");
    expect(c!.whatWeHeard.some((h) => /60-day|\$15k|mid-market|negotiation/i.test(h))).toBe(true);
    expect(c!.primaryCtaLabel).toMatch(/suggested draft request/i);
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
