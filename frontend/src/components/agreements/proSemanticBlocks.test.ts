import { describe, expect, it } from "vitest";
import {
  forbiddenSemanticFactForLine,
  extractProtectedCommercialClusters,
  reconstructProSectionsFromSemanticBlocks,
  renderSemanticBlock,
  stripForbiddenSemanticFactsFromText,
  textRetainsSemanticBlock,
} from "./proSemanticBlocks";
import { extractProtectedCommercialFacts, scoreCommercialSpecificity } from "./commercialSpecificity";

const TEST95_AI = `
AI automation services agreement.
Scope includes AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.
$120,000 total project fee.
40% build/configuration.
30% rollout/onboarding.
30% support/acceptance.
Optional $6,000/month support.
No guaranteed third-party AI uptime.
`.trim();

const TEST96_MARKETING = `
Marketing services agreement.
Scope includes paid advertising management, launch coordination, email marketing, analytics reporting, creative strategy, and campaign optimization.
$18,000 across 3 milestones over 4 months.
`.trim();

const TEST97_CONSULTING = `
Simple consulting/support agreement.
Scope includes operations consulting, recurring advisory calls, workflow recommendations, vendor coordination, and monthly reporting support.
$4,500/month.
15-day termination.
`.trim();

function scopeBlock(intake: string) {
  const block = extractProtectedCommercialClusters(intake).find((candidate) => candidate.id === "scope_block");
  expect(block).toBeTruthy();
  return block!;
}

function sectionedScope(sentence: string): string {
  return `
1. Purpose and Scope
${sentence}

2. Fees and Payment
Client will pay fees stated below.
`.trim();
}

describe("proSemanticBlocks", () => {
  it("test95 extracts and renders AI automation scope as one atomic block", () => {
    const block = scopeBlock(TEST95_AI);
    expect(block.archetype).toBe("ai_automation_services");
    expect(block.atomic).toBe(true);
    expect(block.ownerSection).toBe("purpose");
    expect(block.requiredPhrases).toEqual([
      "AI workflow implementation",
      "dashboard setup",
      "automation support",
      "onboarding assistance",
      "light ongoing maintenance",
    ]);
    const rendered = renderSemanticBlock(block);
    for (const phrase of block.requiredPhrases) expect(rendered).toMatch(new RegExp(phrase, "i"));
    expect(textRetainsSemanticBlock(block, sectionedScope(rendered))).toBe(true);
  });

  it("test96 extracts and renders marketing scope as one atomic block", () => {
    const block = scopeBlock(TEST96_MARKETING);
    expect(block.archetype).toBe("marketing_services");
    expect(block.requiredPhrases).toEqual([
      "paid advertising management",
      "launch coordination",
      "email marketing",
      "analytics reporting",
      "creative strategy",
      "campaign optimization",
    ]);
    expect(textRetainsSemanticBlock(block, sectionedScope(renderSemanticBlock(block)))).toBe(true);
  });

  it("test97 extracts and renders consulting scope as one atomic block", () => {
    const block = scopeBlock(TEST97_CONSULTING);
    expect(block.archetype).toBe("consulting_support");
    expect(block.requiredPhrases).toEqual([
      "operations consulting",
      "recurring advisory calls",
      "workflow recommendations",
      "vendor coordination",
      "monthly reporting support",
    ]);
    expect(textRetainsSemanticBlock(block, sectionedScope(renderSemanticBlock(block)))).toBe(true);
  });

  it("does not count isolated words as retained cluster meaning", () => {
    const scattered = `
1. Purpose and Scope
Service Provider will provide AI workflow implementation.

2. Fees and Payment
Dashboard setup fees are included.

5. Support
Automation support, onboarding assistance, and light ongoing maintenance are listed outside scope.
`.trim();
    const facts = extractProtectedCommercialFacts(TEST95_AI);
    const score = scoreCommercialSpecificity(facts, scattered);
    expect(score.missingClusters.map((block) => block.id)).toContain("scope_block");
    expect(score.score).toBeLessThan(100);
  });

  it("renders atomic payment blocks with complete commercial structure", () => {
    const aiMilestone = extractProtectedCommercialClusters(TEST95_AI).find((block) => block.id === "milestone_block");
    expect(aiMilestone).toBeTruthy();
    expect(renderSemanticBlock(aiMilestone!)).toMatch(
      /40%\s+build\/configuration; \(b\) 30%\s+rollout\/onboarding; and \(c\) 30%\s+support\/acceptance/i,
    );

    const marketingMilestone = extractProtectedCommercialClusters(TEST96_MARKETING).find((block) => block.id === "milestone_block");
    expect(marketingMilestone).toBeTruthy();
    const marketingRendered = renderSemanticBlock(marketingMilestone!);
    expect(marketingRendered).toMatch(/\$18,000 total/i);
    expect(marketingRendered).toMatch(/3 milestones/i);
    expect(marketingRendered).toMatch(/4-month engagement term/i);
    expect(marketingRendered).not.toMatch(/monthly arrears/i);

    const consultingMonthly = extractProtectedCommercialClusters(TEST97_CONSULTING).find((block) => block.id === "monthly_fee_block");
    expect(consultingMonthly).toBeTruthy();
    const consultingRendered = renderSemanticBlock(consultingMonthly!);
    expect(consultingRendered).toMatch(/\$4,500\/month/i);
    expect(consultingRendered).toMatch(/month-to-month/i);
    expect(consultingRendered).not.toMatch(/milestone/i);
  });

  it("classifies and strips archetype-forbidden semantic facts", () => {
    expect(forbiddenSemanticFactForLine("Provider will maintain 99.9% uptime for production automation components.", "marketing_services", "paid advertising management")).toBe("uptime_target");
    expect(forbiddenSemanticFactForLine("Schedule A phase allocation is 40% build/configuration.", "monthly_consulting", "$4,500/month month-to-month")).toBe("project_phase_allocation");
    expect(forbiddenSemanticFactForLine("Client owns hardware and pays data center site costs.", "ai_automation_services", "AI workflow implementation")).toBe("hardware_ownership");

    const stripped = stripForbiddenSemanticFactsFromText(
      "1. Purpose and Scope\nProvider will maintain 99.9% uptime for production automation components.\nMarketing services continue.",
      "marketing_services",
      "paid advertising management",
    );
    expect(stripped.text).not.toMatch(/99\.9%|production automation components/i);
    expect(stripped.repairs).toContain("forbidden_semantic_fact:uptime_target");
  });

  it("forbids generic abstraction as a scope block replacement", () => {
    const block = scopeBlock(TEST96_MARKETING);
    const generic = `
1. Purpose and Scope
The scope is as set forth below in the operative sections and schedules below.

2. Fees and Payment
$18,000 across 3 milestones over 4 months.
`.trim();
    expect(textRetainsSemanticBlock(block, generic)).toBe(false);
    const score = scoreCommercialSpecificity(extractProtectedCommercialFacts(TEST96_MARKETING), generic);
    expect(score.missingClusters.map((candidate) => candidate.id)).toContain("scope_block");
  });

  it("reconstructs AI automation sections from semantic blocks and removes malformed fragments", () => {
    const dirty = `
AI Automation Services Agreement

1. Purpose and Scope
The scope is as set forth below.
3.1 and 4.3, deliverables are misplaced.

2. Confidentiality
2.5 Taxes are due by Client.

3. Fees and Payment
The project milestone allocation is 40% build/configuration and 30% rollout/onboarding.

4. Support
No guaranteed third-party AI uptime.

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim();
    const result = reconstructProSectionsFromSemanticBlocks(dirty, {
      intakeText: TEST95_AI,
      draftText: dirty,
      archetype: "ai_automation_services",
    });
    expect(result.text).toMatch(/1\. Purpose and Scope[\s\S]*AI workflow implementation[\s\S]*dashboard setup[\s\S]*light ongoing maintenance/i);
    expect(result.text).toMatch(/2\. Fees and Payment[\s\S]*40%\s+build\/configuration[\s\S]*30%\s+rollout\/onboarding[\s\S]*30%\s+support\/acceptance/i);
    expect(result.text).not.toMatch(/3\.1 and 4\.3|2\.5 Taxes|scope is as set forth below/i);
    expect(result.text).toMatch(/IN WITNESS WHEREOF/i);
  });

  it("reconstructs marketing and consulting sections without wrong-archetype fragments", () => {
    const marketing = reconstructProSectionsFromSemanticBlocks(
      `
Marketing Services Agreement

1. Purpose and Scope
Services as applicable.
Each Party represents that it has authority Services are broad.

2. Fees and Payment
2.5 Client Approvals must occur in Fees.
The project phase allocation includes 3 milestones.

5. Support
Provider will maintain 99.9% uptime for production automation components.
`.trim(),
      { intakeText: TEST96_MARKETING, archetype: "marketing_services" },
    );
    expect(marketing.text).toMatch(/paid advertising management[\s\S]*campaign optimization/i);
    expect(marketing.text).toMatch(/\$18,000 total across 3 milestones over the 4-month engagement term/i);
    expect(marketing.text).not.toMatch(/99\.9%|production automation components|Client Approvals|Each Party represents/i);
    expect(marketing.text).not.toMatch(/The project phase allocation includes 3 milestones/i);

    const consulting = reconstructProSectionsFromSemanticBlocks(
      `
Consulting and Support Agreement

1. Purpose and Scope
The services are as applicable.

2. Fees and Payment
Milestone-based payments apply.
Client will pay $4,500/month.

6. Termination
Either Party may terminate on 15 days written notice' notice.
`.trim(),
      { intakeText: TEST97_CONSULTING, archetype: "monthly_consulting" },
    );
    expect(consulting.text).toMatch(/operations consulting[\s\S]*monthly reporting support/i);
    expect(consulting.text).toMatch(/\$4,500\/month on a month-to-month basis/i);
    expect(consulting.text).toMatch(/15-day termination|15 days/i);
    expect(consulting.text).not.toMatch(/Milestone-based|written notice' notice|services are as applicable/i);
  });
});
