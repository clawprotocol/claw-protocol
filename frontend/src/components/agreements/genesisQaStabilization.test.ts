import { describe, expect, it } from "vitest";
import {
  buildCanonicalAgreementSnapshot,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import {
  finalizeGuidedProAgreementCorpus,
  type GuidedFinalCorpusCandidate,
} from "./guidedDealCompletion/guidedFinalCorpusFinalizer";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import { buildGuidedVs01SigningHandoff } from "./guidedDealCompletion/guidedVs01SigningHandoff";
import type { GuidedCompletionSession } from "./guidedDealCompletion/types";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import {
  containsForbiddenGenericScopeAbstraction,
  extractProtectedCommercialFacts,
  scoreCommercialSpecificity,
} from "./commercialSpecificity";

type GenesisFixture = {
  name: string;
  intake: string;
  parties: [string, string];
  roles: [string, string];
  answers: Record<string, string>;
  corpus: string;
  expectedFacts: string[];
};

const LONG_SCOPE =
  "The parties will cooperate in good faith, maintain practical project records, and use commercially reasonable efforts to complete the services described in this Agreement. ";

function session(answers: Record<string, string>): GuidedCompletionSession {
  const ids = Object.keys(answers);
  return {
    sessionKey: "genesis:qa",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Q ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: answers,
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

function identities([client, provider]: [string, string], [clientRole, providerRole]: [string, string]): CanonicalPartyIdentity[] {
  return [
    {
      index: 0,
      partyDisplayName: client,
      email: "client@example.test",
      representativeName: "Client Signer",
      title: clientRole,
      blockHeading: "CLIENT",
      isIndividual: false,
    },
    {
      index: 1,
      partyDisplayName: provider,
      email: "provider@example.test",
      representativeName: "Provider Signer",
      title: providerRole,
      blockHeading: "SERVICE PROVIDER",
      isIndividual: false,
    },
  ];
}

function baseCorpus(f: GenesisFixture, sections: string): string {
  const [client, provider] = f.parties;
  return `
${f.name.toUpperCase()}

This Agreement is between ${client} ("Client") and ${provider} ("Service Provider").

1. Purpose and Scope
Service Provider will perform the services described below for Client. ${LONG_SCOPE.repeat(5)}

${sections}

9. Electronic Signatures
Electronic signatures and counterparts are permitted and have the same effect as originals.

IN WITNESS WHEREOF, the parties execute this Agreement.

CLIENT:
${client}
By: _________________________
Name: Client Signer
Title: ${f.roles[0]}

SERVICE PROVIDER:
${provider}
By: _________________________
Name: Provider Signer
Title: ${f.roles[1]}
`.trim();
}

const RAW_FIXTURES: GenesisFixture[] = [
  {
    name: "AI Automation Services Agreement",
    intake:
      "AI automation services between ABC LLC and Jordan Lee Consulting LLC. Scope includes AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance. $120,000 total project fee. 40% build/configuration. 30% rollout and onboarding. 30% support and acceptance. Optional $6,000/month support. No guaranteed third-party AI uptime. 30-day termination. Oklahoma law. Notices by email.",
    parties: ["ABC LLC", "Jordan Lee Consulting LLC"],
    roles: ["Manager", "Managing Member"],
    answers: {
      payment_timing: "Net 30",
      phase_payment_allocation: "40% build/configuration, 30% rollout/onboarding, 30% support/acceptance",
      project_fee_phase_confirmation: "$120,000 total project fee",
      saas_sla: "No guaranteed uptime for third-party AI platforms; commercially reasonable support only.",
      ip_ownership: "Client owns project deliverables; provider retains pre-existing tools.",
      renewal_notice: "30 days written notice",
      governing_law: "Oklahoma",
    },
    corpus: "",
    expectedFacts: [
      "AI workflow implementation",
      "dashboard setup",
      "automation support",
      "onboarding assistance",
      "light ongoing maintenance",
      "40% build/configuration",
      "30% rollout/onboarding",
      "30% support/acceptance",
      "optional $6,000/month continuing support",
      "no guaranteed uptime for third-party AI platforms",
    ],
  },
  {
    name: "Marketing Services Agreement",
    intake:
      "Marketing services agreement between MarketCo LLC and BrandCo LLC. Scope includes paid advertising management, launch coordination, email marketing, analytics reporting, creative strategy, and campaign optimization. $18,000 across 3 milestones over 4 months. Texas law. Email notices. 30-day termination.",
    parties: ["MarketCo LLC", "BrandCo LLC"],
    roles: ["CEO", "President"],
    answers: {
      payment_timing: "Net 30",
      phase_payment_allocation: "Three milestones over four months — $18,000 total",
      project_fee_phase_confirmation: "$18,000 total",
      renewal_notice: "30 days written notice",
      governing_law: "Texas",
    },
    corpus: "",
    expectedFacts: [
      "paid advertising management",
      "launch coordination",
      "email marketing",
      "analytics reporting",
      "creative strategy",
      "campaign optimization",
      "$18,000",
      "3 milestones",
      "4 months",
    ],
  },
  {
    name: "Consulting and Support Agreement",
    intake:
      "Simple consulting and support agreement between OpsCo LLC and Northstar Consulting LLC. Scope includes operations consulting, recurring advisory calls, workflow recommendations, vendor coordination, and monthly reporting support. $4,500/month, month-to-month. 15-day termination. Delaware law. Notices by email.",
    parties: ["OpsCo LLC", "Northstar Consulting LLC"],
    roles: ["COO", "Principal"],
    answers: {
      payment_structure: "Monthly retainer $4,500 per month",
      monthly_fee: "$4,500 per month",
      renewal_notice: "15 days written notice",
      governing_law: "Delaware",
    },
    corpus: "",
    expectedFacts: [
      "operations consulting",
      "recurring advisory calls",
      "workflow recommendations",
      "vendor coordination",
      "monthly reporting support",
      "$4,500/month",
      "15-day termination",
    ],
  },
];

const FIXTURES: GenesisFixture[] = RAW_FIXTURES.map((fixture) => {
  const isAi = /AI Automation/i.test(fixture.name);
  const isMarketing = /Marketing/i.test(fixture.name);
  const fee = isAi
    ? "Total project fee is $120,000 USD. Schedule A phase allocation: 40% build/configuration, 30% rollout and onboarding, 30% support and acceptance. Milestone-based payments are due on written acceptance of each phase deliverable. Invoices are due Net 30 from receipt."
    : isMarketing
      ? "Total fee is $18,000 USD across three milestones over four months. Invoices are due Net 30 from receipt."
      : "Client will pay Service Provider $4,500 per month as a monthly retainer. Invoices are due monthly.";
  const support = isAi
    ? "Optional post-go-live support may be purchased at $6,000 per month. No guaranteed uptime for third-party AI platforms; commercially reasonable support only."
    : isMarketing
      ? "Service Provider will provide reasonable campaign coordination support during the term."
      : "Service Provider will provide commercially reasonable consulting support during business hours.";
  const law = isAi ? "Oklahoma" : isMarketing ? "Texas" : "Delaware";
  const days = isAi || isMarketing ? "thirty (30)" : "fifteen (15)";
  return {
    ...fixture,
    corpus: baseCorpus(
      fixture,
      `
2. Fees and Payment
${fee}

3. Ownership
Client owns custom deliverables created for the engagement. Service Provider retains pre-existing tools, templates, know-how, and background materials.

4. Confidentiality
Each Party will protect confidential information using reasonable care and use it only for this Agreement.

5. Support
${support}

6. Termination
Either Party may terminate this Agreement on ${days} days written notice.

7. Notices
Formal notices may be delivered by email to the addresses on file.

8. Miscellaneous
This Agreement is governed by the laws of the State of ${law}.
`,
    ),
  };
});

function expectCleanGenesisCorpus(body: string): void {
  expect(body).not.toMatch(/\[(?:ORG|ADDRESS|PERSON|PARTY|CLIENT|PROVIDER)/i);
  expect(body).not.toMatch(/\bparty[_\s-]?[ab]\b/i);
  expect(body).not.toMatch(/Final review needs another pass|guided_corpus_finalize_failed|missingState/i);
  expect(body).not.toMatch(/scope as set forth below|operative sections and schedules below|to be agreed|services as applicable/i);
  expect(body).not.toMatch(
    /^\s*(?:99\.9%\s+uptime|Software development and bug fixes|Client gets perpetual license to embedded tools|On acceptance|Milestone[-\s]?based|Monthly\s+retainer|Net\s*(?:15|30)|Delaware|Texas|Oklahoma|Company owns project deliverables|Even\s+thirds|Build[-\s]?heavy)\.?\s*$/im,
  );
  expect(body).not.toMatch(/^\s*\d+\.\s+[^\n]+\n\s*(?=^\s*\d+\.\s+)/im);
  expect(containsForbiddenGenericScopeAbstraction(body)).toBe(false);
  expect((body.match(/^\s*\d+\.\s+Electronic Signatures\b/gim) ?? []).length).toBeLessThanOrEqual(1);
  expect((body.match(/Electronic signatures and counterparts are permitted/gi) ?? []).length).toBeLessThanOrEqual(1);
  expect((body.match(/\bThis Agreement is governed by the laws of the State\b/gi) ?? []).length).toBe(1);
  const normalizedLines = body
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(
      (line) =>
        line &&
        !/^\d+\.\s+/.test(line) &&
        !/^(?:by:|name:|title:|date:|client:|service provider:|signature:)/.test(line),
    );
  const duplicateLines = normalizedLines.filter((line, index) => normalizedLines.indexOf(line) !== index);
  expect(duplicateLines).toEqual([]);
  const fees = body.match(/2\.\s+Fees[\s\S]*?(?=^\s*3\.\s)/im)?.[0] ?? "";
  const support = body.match(/5\.\s+Support[\s\S]*?(?=^\s*6\.\s)/im)?.[0] ?? "";
  const misc = body.match(/^\s*\d+\.\s+Miscellaneous[\s\S]*?(?=^\s*\d+\.\s|\bIN WITNESS WHEREOF\b)/im)?.[0] ?? "";
  expect(fees).toMatch(/\b(?:fee|pay|invoice|retainer|milestone)\b/i);
  expect(fees).not.toMatch(/\bOklahoma|Texas|Delaware\b/i);
  expect(support).not.toMatch(/\bgoverned by the laws\b/i);
  expect(support).not.toMatch(/\$18,000|\$4,500|40\s*%|30\s*%/i);
  expect(misc).toMatch(/\bgoverned by the laws\b/i);
}

function expectCommercialRealism(fixture: GenesisFixture, body: string): void {
  const facts = extractProtectedCommercialFacts(fixture.intake, fixture.corpus);
  const score = scoreCommercialSpecificity(facts, body);
  expect(score.score).toBe(100);
  expect(score.missingFacts).toEqual([]);
  const retained = score.retainedFacts.map((fact) => fact.canonical);
  for (const expected of fixture.expectedFacts) {
    expect(retained).toContain(expected);
  }
}

describe("Genesis QA stabilization layer", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: input -> free draft -> Pro/guided facts -> signer setup -> frozen snapshot`, () => {
      const freeSnapshot = buildCanonicalAgreementSnapshot({
        surface: "genesis_free_fixture",
        tier: "starter",
        candidates: [{ source: "free_starter", text: fixture.corpus.slice(0, 1300) }],
        intakeText: fixture.intake,
        parties: fixture.parties.map((name) => ({ name })),
        minLen: 300,
      });
      expect(freeSnapshot.integrityOk).toBe(true);
      expect(freeSnapshot.canonicalText).not.toMatch(/\[ORG_|\[ADDRESS_|\bparty_a\b|\bparty_b\b/i);

      const signerIdentities = identities(fixture.parties, fixture.roles);
      const result = finalizeGuidedProAgreementCorpus({
        candidates: [{ source: "canonical_working_draft", body: fixture.corpus, paid: true } satisfies GuidedFinalCorpusCandidate],
        guidedSession: session(fixture.answers),
        signerIdentities,
        signerManifest: null,
        originalIntake: fixture.intake,
      });
      expect(result.ok).toBe(true);
      expectCleanGenesisCorpus(result.body);
      expectCommercialRealism(fixture, result.body);
      expect(result.body).toContain(fixture.parties[0]);
      expect(result.body).toContain(fixture.parties[1]);

      const snapshot = buildCanonicalAgreementSnapshot({
        surface: "genesis_final_review_fixture",
        tier: "pro",
        candidates: [{ source: "finalized_signer_applied_guided_corpus", text: result.body }],
        intakeText: fixture.intake,
        guidedSession: session(fixture.answers),
        parties: signerIdentities.map((id) => ({ name: id.partyDisplayName, role: id.blockHeading, email: id.email })),
        signerState: { complete: true, signerCount: signerIdentities.length, requireSignerBlocks: true },
      });
      const frozen = freezeCanonicalAgreementSnapshot(snapshot, "finalized_signer_applied_guided_corpus");
      expect(frozen).not.toBeNull();
      expect(frozen!.integrityOk).toBe(true);
      expectCommercialRealism(fixture, frozen!.canonicalText);

      const finalReview = resolveGuidedFinalReviewAuthoritativeBody({
        candidates: [{ source: "finalized_signer_applied_guided_corpus", body: frozen!.canonicalText }],
        signerIdentities,
        signingCorpusReady: true,
      });
      const handoff = buildGuidedVs01SigningHandoff({
        corpusText: frozen!.canonicalText,
        source: "finalized_signer_applied_guided_corpus",
        signerMetadata: null,
      });
      const reviewFirstSnapshot = buildCanonicalAgreementSnapshot({
        surface: "genesis_review_first_fixture",
        tier: "pro",
        candidates: [{ source: "accepted_review", text: frozen!.canonicalText }],
        intakeText: fixture.intake,
        guidedSession: session(fixture.answers),
        parties: signerIdentities.map((id) => ({ name: id.partyDisplayName, role: id.blockHeading, email: id.email })),
        signerState: { complete: true, signerCount: signerIdentities.length, requireSignerBlocks: true },
      });
      expect(finalReview.finalizedHash).toBe(frozen!.hash);
      expect(handoff.corpusHash).toBe(frozen!.hash);
      expect(reviewFirstSnapshot.hash).toBe(frozen!.hash);
      expect(finalReview.body).toBe(frozen!.canonicalText);
      expect(handoff.corpusText).toBe(frozen!.canonicalText);
      expect(reviewFirstSnapshot.canonicalText).toBe(frozen!.canonicalText);
    });
  }
});
