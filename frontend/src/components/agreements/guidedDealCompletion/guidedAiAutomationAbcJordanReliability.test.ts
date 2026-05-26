import { describe, expect, it } from "vitest";
import { ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE } from "../qaManualTenPrompts";
import { finalizePremiumIdentityCorpusInPreview } from "../premiumIdentityCorpusPreviewGuard";
import { repairAgreementTemplatePlaceholders } from "../agreementTemplatePlaceholderSafety";
import {
  buildGuidedSessionFromAgreement,
  getCurrentVariable,
} from "./guidedCompletionEngine";
import {
  corpusSatisfiesGuidedVariable,
  filterManifestMissingWithSemanticEvidence,
  semanticFactsToGuidedAnswerPrefill,
} from "./guidedSemanticManifestValidation";
import { extractGuidedSemanticFacts } from "./guidedAnswerSemanticMerger";
import { validateFinalGuidedProCorpusBeforeFreeze } from "./guidedFinalCorpusFinalizer";
import { parseGuidedIntakeFacts } from "./guidedIntakeFactPrefill";

const CANONICAL_PARTIES = ["ABC LLC", "Jordan Lee Consulting LLC"] as const;

const ABC_JORDAN_CORPUS = `
AI AUTOMATION SERVICES AGREEMENT

1. Services and Scope
Service Provider will deliver AI automation, workflow, and dashboard services for Client.

2. Fees and Payment
Total project fee is $120,000 USD.
Schedule A phase allocation: 40% build/configuration, 30% rollout and onboarding, 30% support and acceptance.
Milestone-based payments are due on written acceptance of each phase deliverable.
Invoices are due Net 30 from receipt.

3. Support
Optional post-go-live support may be purchased at $6,000 per month.
No guaranteed uptime for third-party AI platforms; commercially reasonable support only.

4. Ownership
Client owns project deliverables; Service Provider retains pre-existing tools and know-how.

6. Termination
Either Party may terminate on thirty (30) days written notice.

7. Notices
Formal notices may be delivered by email to the addresses on file.

8. Miscellaneous
This Agreement is governed by the laws of the State of Oklahoma.

IN WITNESS WHEREOF, the parties execute this Agreement.

ABC LLC
By: _________________________

Jordan Lee Consulting LLC
By: _________________________
`.trim();

const ORG_PLACEHOLDER_CORPUS = `
Between [ORG_1] ("Client") and [ORG_2] ("Service Provider").
Total project fee is $120,000 USD.
40% build/configuration, 30% rollout/onboarding, 30% support/acceptance.
`.trim();

describe("ABC / Jordan Lee guided finalization reliability", () => {
  it("parses intake facts for 40/30/30, Oklahoma, and no uptime guarantee", () => {
    const facts = parseGuidedIntakeFacts(ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE);
    expect(facts.milestoneSplit403030).toBe(true);
    expect(facts.paymentMode).toBe("milestone_project");
    expect(facts.governingLaw).toBe("Oklahoma");
    expect(facts.noThirdPartyUptimeGuarantee).toBe(true);
    expect(facts.terminationDays).toBe(30);
  });

  it("guided session skips intake-specified questions and pre-answers payment facts", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
      body: ABC_JORDAN_CORPUS,
    });
    expect(session).not.toBeNull();
    expect(session!.queue).not.toContain("phase_payment_allocation");
    expect(session!.queue).not.toContain("payment_structure");
    expect(session!.answered.phase_payment_allocation).toMatch(/40\s*%/i);
    expect(session!.answered.payment_structure).toMatch(/milestone/i);
    const current = getCurrentVariable(session!);
    if (current) {
      expect(current.id).not.toBe("phase_payment_allocation");
      expect(current.id).not.toBe("payment_structure");
    }
  });

  it("semantic facts satisfy manifest payment fields without false missingState", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
      body: ABC_JORDAN_CORPUS,
    });
    const semantic = extractGuidedSemanticFacts(session, ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE);
    expect(semantic.paymentMode).toBe("milestone_project");
    expect(semantic.milestoneSplit).toBe("40_30_30");

    const prefill = semanticFactsToGuidedAnswerPrefill(semantic, ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE);
    expect(prefill.phase_payment_allocation).toMatch(/40\s*%/i);
    expect(prefill.payment_structure).toMatch(/milestone/i);

    expect(
      corpusSatisfiesGuidedVariable(
        "phase_payment_allocation",
        ABC_JORDAN_CORPUS,
        semantic,
        ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
      ),
    ).toBe(true);
    expect(
      corpusSatisfiesGuidedVariable(
        "payment_structure",
        ABC_JORDAN_CORPUS,
        semantic,
        ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
      ),
    ).toBe(true);

    const filtered = filterManifestMissingWithSemanticEvidence({
      missing: ["phase_payment_allocation", "payment_structure"],
      body: ABC_JORDAN_CORPUS,
      guidedSession: session,
      originalIntake: ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
    });
    expect(filtered).toEqual([]);

    const validation = validateFinalGuidedProCorpusBeforeFreeze({
      body: ABC_JORDAN_CORPUS,
      guidedSession: session,
      originalIntake: ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
    });
    expect(validation.ok).toBe(true);
    expect(validation.missing).not.toContain("phase_payment_allocation");
    expect(validation.missing).not.toContain("payment_structure");
  });

  it("hydrates [ORG_1]/[ORG_2] when canonical parties are known", () => {
    const repaired = finalizePremiumIdentityCorpusInPreview(
      ORG_PLACEHOLDER_CORPUS,
      CANONICAL_PARTIES,
      ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
    );
    expect(repaired).toContain("ABC LLC");
    expect(repaired).toContain("Jordan Lee Consulting LLC");
    expect(repaired).not.toMatch(/\[ORG_/i);
  });

  it("repairAgreementTemplatePlaceholders hydrates org slots from intake context", () => {
    const { text } = repairAgreementTemplatePlaceholders(ORG_PLACEHOLDER_CORPUS, {
      intakeRaw: ABC_JORDAN_AI_AUTOMATION_FINALIZATION_QA_INTAKE,
      partyNames: [...CANONICAL_PARTIES],
    });
    expect(text).not.toMatch(/\[ORG_/i);
    expect(text).toMatch(/ABC LLC/);
    expect(text).toMatch(/Jordan Lee Consulting LLC/);
  });
});
