import { describe, expect, it } from "vitest";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import { applyProCorpusIntegrity, verifyProCorpusIntegrity, type ProCorpusIntegrityContext } from "./proCorpusIntegrity";
import type { GuidedSemanticFacts } from "./guidedDealCompletion/guidedAnswerSemanticMerger";

function semantic(overrides: Partial<GuidedSemanticFacts>): GuidedSemanticFacts {
  return {
    facts: {},
    paymentMode: "unknown",
    milestoneSplit: null,
    terminationDays: null,
    governingLaw: null,
    ...overrides,
  };
}

function section(text: string, title: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\d+\.\s+/.test(line.trim()) && title.test(line));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^\d+\.\s+/.test(line.trim()));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function outsideSection(text: string, title: RegExp): string {
  const own = section(text, title);
  return text.replace(own, "");
}

const AI_AUTOMATION_CONTEXT: ProCorpusIntegrityContext = {
  intakeText:
    "$120,000 total, 40% build/configuration, 30% rollout/onboarding, 30% support/acceptance, optional $6,000/month support, Oklahoma law, 30-day termination.",
  semanticFacts: semantic({
    paymentMode: "milestone_project",
    milestoneSplit: "40_30_30",
    terminationDays: 30,
    governingLaw: "Oklahoma",
    facts: {
      milestone_allocation: "40% build/configuration, 30% rollout/onboarding, 30% support/acceptance",
      payment_timing: "Net 30",
      monthly_fee: "$6,000/month optional support",
      governing_law: "Oklahoma",
      termination_notice: "30 days written notice",
    },
  }),
  surface: "test_ai_automation",
};

const AI_AUTOMATION_BAD = `AI Automation Services Agreement

1. Purpose and Scope
Provider will configure AI automation services.

2. Fees and Payment
Total project fee is $120,000 USD.
Schedule A phase allocation is build-heavy.
Milestone-based
Invoices are due Net 30 from receipt.
Invoices are due Net 30 from receipt unless a signed change order states otherwise.
Optional post-launch support is available for $6,000/month.

3. Support and Service Levels
Provider targets 99.9% uptime for production automation.
Schedule A phase allocation is 40% build/configuration, 30% rollout/onboarding, and 30% support/acceptance.

4. Term and Termination
Either party may terminate on 30 days written notice.

5. Miscellaneous
Governing law of the State of Oklahoma.

6. Electronic Signatures and Counterparts
The parties may execute this Agreement electronically and in counterparts.

IN WITNESS WHEREOF, the parties execute this Agreement.`;

const MARKETING_CONTEXT: ProCorpusIntegrityContext = {
  intakeText:
    "$18,000 across 3 milestones over 4 months. Texas law. Client has ad spend approval rights. Independent contractor.",
  semanticFacts: semantic({
    paymentMode: "milestone_project",
    milestoneSplit: "custom",
    governingLaw: "Texas",
    facts: {
      milestone_allocation: "$18,000 across 3 milestones over 4 months",
      governing_law: "Texas",
    },
  }),
  surface: "test_marketing",
};

const MARKETING_BAD = `Marketing Services Agreement

1. Purpose and Scope
Agency will provide campaign strategy and marketing services. Client approves ad spend before launch.

2.1 Deliverables.

2. Confidentiality
Texas law applies to this Agreement.

3. Support and Service Levels
Provider will maintain 99.9% software uptime.

4. Fees and Payment
Client will pay $18,000 across three milestones over four months.
Contractor represents that it has authority to enter this Agreement.
Contractor represents that it has authority to enter this Agreement.

5. Miscellaneous
Governing law of the State of Texas.

IN WITNESS WHEREOF, the parties execute this Agreement.`;

const CONSULTING_CONTEXT: ProCorpusIntegrityContext = {
  intakeText: "$4,500/month, month-to-month, 15-day termination, Delaware law.",
  semanticFacts: semantic({
    paymentMode: "monthly_retainer",
    terminationDays: 15,
    governingLaw: "Delaware",
    facts: {
      monthly_fee: "$4,500/month",
      termination_notice: "15 days written notice",
      governing_law: "Delaware",
    },
  }),
  surface: "test_consulting",
};

const CONSULTING_BAD = `Consulting and Support Agreement

1. Purpose and Scope
Consultant will provide month-to-month advisory support.

2. Term and Termination
Either party may terminate on O days written notice.
$4,500/month service fee.

3. Fees and Payment
Milestone-based
Client will pay $4,500/month.
Invoices are due Net 30.

4. Confidentiality
Each party shall protect confidential information.
Each party shall protect confidential information.

5. Ownership and Work Product
Client owns work product.
Client owns work product.

6. Notices
Notices may be sent by email to addresses on file.
Notices may be sent by email to addresses on file.

7. Miscellaneous
Governing law of the State of Delaware.

IN WITNESS WHEREOF, the parties execute this Agreement.`;

describe("pro corpus integrity layer", () => {
  it("A. AI automation keeps 40/30/30 in Fees and governing law in Miscellaneous only", () => {
    const result = canonicalizeProAgreementText(AI_AUTOMATION_BAD, AI_AUTOMATION_CONTEXT);

    expect(result.text).not.toMatch(/build-heavy/i);
    expect(result.text).not.toMatch(/even thirds/i);
    expect(result.text).not.toMatch(/^Milestone-based$/im);
    expect(result.text.match(/Net 30/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(section(result.text, /Fees and Payment/i)).toMatch(/40\s*% build\/configuration/i);
    expect(outsideSection(result.text, /Fees and Payment/i)).not.toMatch(/40\s*% build\/configuration/i);
    expect(section(result.text, /Miscellaneous|Governing Law/i)).toMatch(/Oklahoma/i);
    expect(outsideSection(result.text, /Miscellaneous|Governing Law/i)).not.toMatch(/Oklahoma/i);
    expect(section(result.text, /Fees and Payment/i)).toMatch(/\$120,000/i);
    expect(section(result.text, /Fees and Payment/i)).toMatch(/\$6,000\/month/i);
  });

  it("B. Marketing services strips bare headings, duplicate contractor boilerplate, and unrequested SLA", () => {
    const result = canonicalizeProAgreementText(MARKETING_BAD, MARKETING_CONTEXT);

    expect(result.text).not.toMatch(/^2\.1\s+Deliverables\.?\s*$/im);
    expect((result.text.match(/Contractor represents that it has authority/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect(result.text).not.toMatch(/99\.9% software uptime|SLA/i);
    expect(section(result.text, /Fees and Payment/i)).toMatch(/\$18,000.*three milestones/i);
    expect(section(result.text, /Miscellaneous|Governing Law/i)).toMatch(/Texas/i);
    expect(outsideSection(result.text, /Miscellaneous|Governing Law/i)).not.toMatch(/Texas/i);
  });

  it("C. Monthly consulting keeps monthly fee and termination in their sections with no milestone/O-days", () => {
    const result = canonicalizeProAgreementText(CONSULTING_BAD, CONSULTING_CONTEXT);

    expect(result.text).not.toMatch(/Milestone-based|milestone/i);
    expect(result.text).not.toMatch(/\bO days\b|\b0 days\b/i);
    expect(section(result.text, /Fees and Payment/i)).toMatch(/\$4,500\/month/i);
    expect(outsideSection(result.text, /Fees and Payment/i)).not.toMatch(/\$4,500\/month/i);
    expect(section(result.text, /Term and Termination/i)).toMatch(/15 days written notice/i);
    expect(outsideSection(result.text, /Term and Termination/i)).not.toMatch(/15 days written notice/i);
    expect(section(result.text, /Miscellaneous|Governing Law/i)).toMatch(/Delaware/i);
    expect(outsideSection(result.text, /Miscellaneous|Governing Law/i)).not.toMatch(/Delaware/i);
    expect((result.text.match(/protect confidential information/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect((result.text.match(/Client owns work product/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect((result.text.match(/Notices may be sent by email/gi) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("D. Manual payment clause collision updates invoice timing in Fees without touching unrelated clauses", () => {
    const body = `Professional Services Agreement

1. Purpose and Scope
Provider will deliver the custom workflow described in Exhibit A.

2. Fees and Payment
Client will pay the fixed service fee. Invoices are due Net 15.

3. Confidentiality
Provider may reference Client's public trademark only with written approval.

4. Term and Termination
Either party may terminate on 30 days written notice.

5. Miscellaneous
Governing law of the State of Texas.

Net 30

IN WITNESS WHEREOF, the parties execute this Agreement.`;
    const result = canonicalizeProAgreementText(body, {
      intakeText: "Guided answer changes invoice timing to Net 30.",
      semanticFacts: semantic({
        paymentMode: "unknown",
        facts: { payment_timing: "Net 30" },
      }),
      surface: "test_manual_collision",
    });

    expect(section(result.text, /Fees and Payment/i)).toMatch(/Net 30/i);
    expect(outsideSection(result.text, /Fees and Payment/i)).not.toMatch(/^Net 30$/im);
    expect(result.text).toMatch(/public trademark only with written approval/i);
    expect((result.text.match(/Net 30/gi) ?? []).length).toBe(1);
  });

  it("E. Multi-party fixture keeps signer block coherent and removes placeholders/role leakage", () => {
    const body = `Multi-Party Services Agreement

This Agreement is between party_a and party_b, Alpha LLC, Beta LLC, and Gamma LLC.

1. Purpose and Scope
The Company will receive services from the Service Provider.

2. Fees and Payment
Invoices are due Net 30.

3. Miscellaneous
Governing law of the State of Texas.

4. Signature Blocks
IN WITNESS WHEREOF, the parties execute this Agreement.

CLIENT:
By: ______________________

SERVICE PROVIDER:
By: ______________________

5. Signature Blocks
IN WITNESS WHEREOF, the parties execute this Agreement.

CLIENT:
By: ______________________`;

    const result = canonicalizeProAgreementText(body, {
      canonicalPartyNames: ["ClientCo LLC", "ProviderCo LLC", "Alpha LLC", "Beta LLC", "Gamma LLC"],
      canonicalRoles: ["Client", "Service Provider"],
      surface: "test_multi_party",
    });

    expect(result.text).not.toMatch(/\bparty_a\b|\bparty_b\b/i);
    expect(result.text).not.toMatch(/\bThe Company\b|\bCompany will\b/);
    expect((result.text.match(/^\d+\.\s+Signature Blocks/gim) ?? []).length).toBeLessThanOrEqual(1);
    expect(result.text).toMatch(/CLIENT:/);
    expect(result.text).toMatch(/SERVICE PROVIDER:/);
  });

  it("reports verification counters and warnings deterministically", () => {
    const applied = applyProCorpusIntegrity(MARKETING_BAD, MARKETING_CONTEXT);
    const report = verifyProCorpusIntegrity(applied.text, MARKETING_CONTEXT, applied.report.counters);

    expect(report.ok).toBe(true);
    expect(report.archetype).toBe("marketing_services");
    expect(report.counters.removedArchetypeContradictions).toBeGreaterThanOrEqual(1);
    expect(report.counters.removedSemanticDuplicates).toBeGreaterThanOrEqual(1);
  });

  it("removes archetype-forbidden semantic facts and preserves atomic payment structures", () => {
    const marketing = canonicalizeProAgreementText(
      `Marketing Services Agreement

1. Purpose and Scope
Agency will provide paid advertising management, launch coordination, email marketing, analytics reporting, creative strategy, and campaign optimization.

2. Fees and Payment
Client will pay $18,000 total across 3 milestones over 4 months.
Client will pay monthly arrears.

3. Support
Provider will maintain 99.9% uptime for production automation components.

4. Miscellaneous
Texas law applies.`,
      {
        intakeText:
          "Marketing services: paid advertising management, launch coordination, email marketing, analytics reporting, creative strategy, campaign optimization. $18,000 across 3 milestones over 4 months. Texas law.",
        surface: "test_forbidden_marketing",
      },
    );
    expect(marketing.text).not.toMatch(/99\.9% uptime|production automation components/i);
    expect(marketing.text).not.toMatch(/monthly arrears/i);
    expect(section(marketing.text, /Fees and Payment/i)).toMatch(/\$18,000 total.*3 milestones.*4-month/i);
    expect(marketing.text).not.toMatch(/The project phase allocation includes 3 milestones/i);

    const consulting = canonicalizeProAgreementText(
      `Consulting and Support Agreement

1. Purpose and Scope
Consultant will provide operations consulting, recurring advisory calls, workflow recommendations, vendor coordination, and monthly reporting support.

2. Fees and Payment
Client will pay $4,500/month.
Milestone-based payments apply.
Schedule A phase allocation is 40% build/configuration, 30% rollout/onboarding, and 30% support/acceptance.

3. Termination
Either party may terminate on 15 days written notice.

4. Miscellaneous
Delaware law applies.`,
      {
        intakeText:
          "Operations consulting, recurring advisory calls, workflow recommendations, vendor coordination, monthly reporting support. $4,500/month, month-to-month. 15-day termination. Delaware law.",
        semanticFacts: CONSULTING_CONTEXT.semanticFacts,
        surface: "test_forbidden_consulting",
      },
    );
    expect(consulting.text).not.toMatch(/milestone|phase allocation|build\/configuration|rollout\/onboarding|support\/acceptance/i);
    expect(section(consulting.text, /Fees and Payment/i)).toMatch(/\$4,500\/month.*month-to-month/i);

    const ai = canonicalizeProAgreementText(
      `AI Automation Services Agreement

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.

2. Fees and Payment
Client will pay $120,000 total.
The project milestone allocation is 40% build/configuration and 30% rollout/onboarding.

3. Support
No guaranteed third-party AI uptime.

4. Miscellaneous
Oklahoma law applies.`,
      {
        intakeText:
          "AI workflow implementation, dashboard setup, automation support, onboarding assistance, light ongoing maintenance. $120,000 total. 40% build/configuration, 30% rollout/onboarding, 30% support/acceptance. No guaranteed third-party AI uptime. Oklahoma law.",
        surface: "test_atomic_ai_payment",
      },
    );
    expect(section(ai.text, /Fees and Payment/i)).toMatch(/40%\s+build\/configuration/i);
    expect(section(ai.text, /Fees and Payment/i)).toMatch(/30%\s+rollout\/onboarding/i);
    expect(section(ai.text, /Fees and Payment/i)).toMatch(/30%\s+support\/acceptance/i);
  });
});
