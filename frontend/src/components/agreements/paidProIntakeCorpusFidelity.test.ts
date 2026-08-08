import { describe, expect, it } from "vitest";
import { detectPaidProCorpusIntakeContamination } from "./paidProIntakeCorpusFidelity";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";

const COUNSEL_PREP = `Hey LawDog, I need help with a customer agreement issue.

We're trying to close a paid pilot with a mid-market customer. It's a 60-day pilot, about $15k, and if it goes well it should convert into a $150k-ish annual SaaS deal.

Can you help me figure out:
1. Whether we should push them back to our pilot order form/MSA/DPA setup or accept their pilot agreement with edits.
2. Which terms are actual deal risks vs. normal legal noise.
3. What positions I should take on liability, IP ownership, outputs, data use, termination, indemnity, audit rights, and SOC 2.

Please keep it practical and GTM-focused. I'm not looking for a law school memo.`;

const PIXELFORGE_BODY = `SERVICES AGREEMENT

1. Services and Project Term
Designer will provide product design services for Client's new mobile app UI during the six-week period starting on the Effective Date.

2. Compensation
Client will pay Designer a flat fee of $4,500 for the services.

9.1 Notices
If to Alex Rivera:
Alex Rivera

If to PixelForge Labs:
PixelForge Labs

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT: Alex Rivera
By: __________________________

SERVICE PROVIDER:
PixelForge Labs
By: __________________________
`;

const ACME_SAAS_REWRITE =
  "Draft a 60-day paid SaaS pilot agreement between Acme LLC and ZYX Corp for $15k. " +
  "If the pilot succeeds, it may convert to an annual SaaS subscription near $150k. " +
  "Cover liability caps, IP / work product, termination for convenience, audit rights, " +
  "most-favored pricing, indemnity, data deletion, and no model-training use of data. " +
  "Governing law: Texas.";

const ACME_SAAS_BODY = `SERVICES AGREEMENT

This Services Agreement is entered into between Acme LLC ("Client") and ZYX Corp ("Service Provider").

1. COMMERCIAL RELATIONSHIP & SCOPE
Service Provider will provide a 60-day pilot program for a SaaS solution.

2. FEES & SPEND CONTROLS
Client will pay $15,000 for the pilot. If successful, the parties may convert to an annual subscription near $150,000.

3. TERM & KEY DATES
Services Term is 60 days from the Effective Date.

9.1 Notices
If to Acme LLC:
Acme LLC

If to ZYX Corp:
ZYX Corp

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT: Acme LLC
By: __________________________

SERVICE PROVIDER:
ZYX Corp
By: __________________________
`;

describe("paidProIntakeCorpusFidelity", () => {
  it("flags PixelForge design corpus under SaaS pilot counsel-prep intake", () => {
    const result = detectPaidProCorpusIntakeContamination({
      intakeText: COUNSEL_PREP,
      corpusText: PIXELFORGE_BODY,
    });
    expect(result.contaminated).toBe(true);
    expect(result.reasons.some((r) => /Alex Rivera|PixelForge|economics_scope|counsel_prep/i.test(r))).toBe(
      true,
    );
  });

  it("does not flag matching design intake + design corpus", () => {
    const intake =
      "Create a services agreement between Alex Rivera and PixelForge Labs for mobile app UI design for 6 weeks at $4500.";
    const result = detectPaidProCorpusIntakeContamination({
      intakeText: intake,
      corpusText: PIXELFORGE_BODY,
    });
    expect(result.contaminated).toBe(false);
  });

  it("does not wipe matching Acme/ZYX SaaS rewrite + generated SaaS body", () => {
    const result = detectPaidProCorpusIntakeContamination({
      intakeText: ACME_SAAS_REWRITE,
      corpusText: ACME_SAAS_BODY,
    });
    expect(result.contaminated).toBe(false);
  });

  it("does not wipe Acme/ZYX SaaS body when stale longer counsel-prep is the compared intake", () => {
    // Retest failure mode: longest-wins session still held counsel-prep after rewrite generate.
    const result = detectPaidProCorpusIntakeContamination({
      intakeText: COUNSEL_PREP,
      corpusText: ACME_SAAS_BODY,
    });
    expect(result.contaminated).toBe(false);
    expect(result.reasons.some((r) => /Acme LLC|ZYX Corp/i.test(r))).toBe(true);
  });

  it("still wipes PixelForge body under a SaaS rewrite intake (economics mismatch)", () => {
    const result = detectPaidProCorpusIntakeContamination({
      intakeText: ACME_SAAS_REWRITE,
      corpusText: PIXELFORGE_BODY,
    });
    expect(result.contaminated).toBe(true);
    expect(result.reasons.some((r) => /economics_scope_mismatch/i.test(r))).toBe(true);
  });
});

describe("evaluateIntentionalCreateDraftSubmit", () => {
  it("blocks the retest counsel-prep prompt before any generate path", () => {
    const decision = evaluateIntentionalCreateDraftSubmit(COUNSEL_PREP);
    expect(decision.action).toBe("block_capability");
    if (decision.action === "block_capability") {
      expect(decision.message).toMatch(/negotiation|executable agreements/i);
      expect(decision.clarification.suggestedRewrite).toMatch(/Draft a .+ between/i);
    }
  });
});
