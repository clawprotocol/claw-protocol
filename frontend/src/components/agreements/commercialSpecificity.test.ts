import { describe, expect, it } from "vitest";
import {
  containsForbiddenGenericScopeAbstraction,
  extractProtectedCommercialFacts,
  MINIMUM_COMMERCIAL_SPECIFICITY_SCORE,
  preserveProtectedCommercialFacts,
  scoreCommercialSpecificity,
} from "./commercialSpecificity";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import { applyProCorpusIntegrity } from "./proCorpusIntegrity";

const TEST94_INTAKE = `
AI automation services agreement.
Scope includes AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.
$120,000 total project fee.
40% build/configuration.
30% rollout/onboarding.
30% support/acceptance.
Optional $6,000/month continuing support after launch.
No guaranteed uptime for third-party AI platforms.
30-day termination.
Oklahoma law.
Notices by email.
`.trim();

const GENERIC_PRO_CORPUS = `
AI Automation Services Agreement

This Agreement is between ABC LLC ("Client") and Jordan Lee Consulting LLC ("Service Provider").

1. Purpose and Scope
The scope of services and deliverables under this Agreement are as set forth in the operative sections and schedules below.

2. Fees and Payment
Total project fee is $120,000 USD.
Schedule A phase allocation is 40% build/configuration, 30% rollout/onboarding, and 30% support/acceptance.

3. Confidentiality
Each Party will protect confidential information.

4. Ownership
Client owns deliverables after payment.

5. Support
No guaranteed uptime for third-party AI platforms.

6. Termination
Either Party may terminate on 30 days written notice.

7. Notices
Notices may be delivered by email.

8. Miscellaneous
This Agreement is governed by Oklahoma law.

9. Electronic Signatures
Electronic signatures are permitted.
`.trim();

function purposeSection(text: string): string {
  return text.match(/^\s*1\.\s+.*(?:Purpose|Scope|Services)[\s\S]*?(?=^\s*2\.\s+)/im)?.[0] ?? "";
}

function expectTest94ScopePreserved(text: string): void {
  const purpose = purposeSection(text);
  expect(purpose).toMatch(/AI workflow implementation/i);
  expect(purpose).toMatch(/dashboard setup/i);
  expect(purpose).toMatch(/automation support/i);
  expect(purpose).toMatch(/onboarding assistance/i);
  expect(purpose).toMatch(/light ongoing maintenance/i);
  expect(containsForbiddenGenericScopeAbstraction(purpose)).toBe(false);
  expect(purpose).not.toMatch(/scope as set forth below|services as applicable|operative sections and schedules below/i);
}

describe("commercialSpecificity", () => {
  it("extracts protected commercial facts and categories from test94 intake", () => {
    const facts = extractProtectedCommercialFacts(TEST94_INTAKE);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "scope", canonical: "AI workflow implementation" }),
        expect.objectContaining({ category: "deliverable", canonical: "dashboard setup" }),
        expect.objectContaining({ category: "support_model", canonical: "automation support" }),
        expect.objectContaining({ category: "support_model", canonical: "onboarding assistance" }),
        expect.objectContaining({ category: "support_model", canonical: "light ongoing maintenance" }),
        expect.objectContaining({ category: "support_model", canonical: "optional $6,000/month continuing support" }),
        expect.objectContaining({ category: "payment_structure", canonical: "$120,000 total project fee" }),
        expect.objectContaining({ category: "phase", canonical: "40% build/configuration" }),
        expect.objectContaining({ category: "phase", canonical: "30% rollout/onboarding" }),
        expect.objectContaining({ category: "phase", canonical: "30% support/acceptance" }),
        expect.objectContaining({
          category: "operational_constraint",
          canonical: "no guaranteed uptime for third-party AI platforms",
        }),
      ]),
    );
  });

  it("replaces generic Purpose/Scope abstraction with protected test94 scope facts", () => {
    const result = preserveProtectedCommercialFacts({
      text: GENERIC_PRO_CORPUS,
      intakeText: TEST94_INTAKE,
    });
    expect(result.repairs).toContain("commercial_specificity:scope_block_preserved");
    expectTest94ScopePreserved(result.text);
  });

  it("scores retained and missing protected facts against the 80% threshold", () => {
    const facts = extractProtectedCommercialFacts(TEST94_INTAKE);
    const compressed = `
1. Purpose and Scope
The services are as applicable and as described elsewhere.

2. Fees and Payment
Client will pay a total project fee.
`.trim();
    const score = scoreCommercialSpecificity(facts, compressed);
    expect(score.score).toBeLessThan(MINIMUM_COMMERCIAL_SPECIFICITY_SCORE);
    expect(score.retainedFacts.map((fact) => fact.canonical)).not.toContain("AI workflow implementation");
    expect(score.missingFacts.map((fact) => fact.canonical)).toEqual(
      expect.arrayContaining([
        "AI workflow implementation",
        "dashboard setup",
        "automation support",
        "onboarding assistance",
        "light ongoing maintenance",
      ]),
    );
  });

  it("canonicalizeProAgreementText preserves concrete test94 scope facts", () => {
    const result = canonicalizeProAgreementText(GENERIC_PRO_CORPUS, {
      intakeText: TEST94_INTAKE,
      surface: "test94_commercial_specificity",
    });
    expectTest94ScopePreserved(result.text);
    expect(result.text).toMatch(/\$120,000/);
    expect(result.text).toMatch(/40\s*%[\s\S]{0,100}30\s*%[\s\S]{0,100}30\s*%/i);
    expect(result.commercialSpecificity?.score).toBeGreaterThanOrEqual(MINIMUM_COMMERCIAL_SPECIFICITY_SCORE);
  });

  it("applyProCorpusIntegrity preserves concrete test94 scope facts", () => {
    const result = applyProCorpusIntegrity(GENERIC_PRO_CORPUS, {
      intakeText: TEST94_INTAKE,
      surface: "test94_integrity_specificity",
    });
    expect(result.report.ok).toBe(true);
    expect(result.report.commercialSpecificity.score).toBeGreaterThanOrEqual(MINIMUM_COMMERCIAL_SPECIFICITY_SCORE);
    expect(result.report.commercialSpecificity.score).toBe(100);
    expect(result.report.commercialSpecificity.retainedFacts.map((fact) => fact.canonical)).toContain(
      "optional $6,000/month continuing support",
    );
    expectTest94ScopePreserved(result.text);
  });

  it("canonical snapshots expose the commercial specificity score", () => {
    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "test94_snapshot_specificity",
      tier: "pro",
      candidates: [{ source: "finalized_guided_corpus", text: GENERIC_PRO_CORPUS }],
      intakeText: TEST94_INTAKE,
      minLen: 200,
    });
    expect(snapshot.integrityOk).toBe(true);
    expect(snapshot.commercialSpecificity.score).toBeGreaterThanOrEqual(MINIMUM_COMMERCIAL_SPECIFICITY_SCORE);
    expectTest94ScopePreserved(snapshot.canonicalText);
  });
});
