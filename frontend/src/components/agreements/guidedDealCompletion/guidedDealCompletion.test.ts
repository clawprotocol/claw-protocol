import { describe, expect, it } from "vitest";
import {
  CONSULTING_DEV_QA_INTAKE,
  consultingAuthoritativeBodyFixture,
  defectiveProBodyFixture,
  growthAdvisorDefectiveBodyFixture,
  LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
  LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
  lighthouseApexMigrationBodyFixture,
  QA_MANUAL_TEN_PROMPTS,
  semanticallyIncompleteProBodyFixture,
} from "../qaManualTenPrompts";
import { CONTRACTOR_DEVELOPER_QA_INTAKE, contractorDeveloperBodyFixture } from "../qaManualTenPrompts";
import {
  buildMaterialMissingItems,
  formatMaterialItemsForRevisePanel,
} from "../proAgreementCompleteness/revisionQuestionEngine";
import { enrichDealVariableFromIntake, RECOMMEND_PILL_ID, resolveRecommendForMe } from "./intakeRecommendationEngine";
import { GUIDED_COMPLETION_HEADING } from "./friendlyProCompletionCopy";
import {
  computeCanRenderGuidedQuestions,
  finalizeTaglineForGuidedState,
  GUIDED_NEUTRAL_REVIEW_COPY,
  mayShowCompleteAgreementBelowCopy,
  mayShowNeedsDetailsMessaging,
} from "./canRenderGuidedQuestions";
import { resolveGuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import {
  enforceNeedsDetailsGuidedInvariant,
  resolveDisplayReadinessWithGuidedInvariant,
  shouldRenderGuidedCompletionPanel,
  shouldShowGuidedNeedsDetailsMessaging,
  variableHasSelectableAnswerPath,
} from "./shouldRenderGuidedCompletionPanel";
import { finalizeAgreementOutput } from "../agreementOutputQuality/agreementOutputQualityPipeline";
import { validateAgreementIntegrity } from "./agreementIntegrityValidator";
import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import {
  applyGuidedAnswer,
  applyGuidedAnswerTransaction,
  buildGuidedSessionFromAgreement,
  formatRefineInstructionForAnswer,
  frozenQuestionTotal,
  getCurrentVariable,
  isGuidedCompletionComplete,
  skipGuidedVariable,
  whatChangedLineForGuidedVariable,
  normalizeWhatChangedDisplayLine,
} from "./guidedCompletionEngine";
import { resolveGuidedAnswerForPill } from "./guidedAnswerResolution";
import { extractDealVariables } from "./missingVariableExtractor";
import { suggestedDefaultsForVariable } from "./suggestedDefaultsEngine";
import { prioritizeDealVariables } from "./variablePrioritizationLayer";
import {
  friendlyLowConfidenceCopy,
  GUIDED_CUSTOM_INSTRUCTION_PLACEHOLDER,
  sanitizeProUserMessage,
  shouldPreferGuidedCompletionOverRetry,
} from "./friendlyProCompletionCopy";
import {
  buildGuidedSessionKey,
  lockGuidedSession,
  mergeGuidedSessionOnBaseRefresh,
  preserveGuidedSessionProgress,
} from "./guidedSessionPersistence";
import { applyProBodyHardIntegrityGate } from "./proBodyHardIntegrityGate";
import { referralDefectiveBodyFixture } from "../qaManualTenPrompts";
import type { DealVariable } from "./types";

describe("guidedDealCompletion", () => {
  it("extracts typed actionable variables from material items", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "SaaS MSA. Uptime and payment timing not specified.",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test_guided",
      tier: "premium",
    });
    const vars = extractDealVariables({
      intakeRaw: "SaaS MSA. Uptime and payment timing not specified.",
      body: fin.text,
      materialItems: fin.materialMissingItems,
    });
    expect(vars.length).toBeGreaterThan(0);
    expect(vars[0]?.label).not.toMatch(/agreement is vague/i);
    expect(vars[0]?.question.length).toBeGreaterThan(10);
    expect(vars[0]?.suggestedDefaults.length).toBeGreaterThan(0);
  });

  it("prioritizes critical variables ahead of optional polish", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "Referral partner agreement. Revenue share not specified.",
      surface: "test_guided_prio",
      tier: "premium",
    });
    const vars = extractDealVariables({
      body: fin.text,
      materialItems: fin.materialMissingItems,
    });
    const ordered = prioritizeDealVariables(vars);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first && last && first.severity === "critical" && last.severity === "optional") {
      expect(ordered.indexOf(first)).toBeLessThan(ordered.indexOf(last));
    }
  });

  it("builds one-at-a-time session with completeness percent", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: "Consulting agreement. Fee structure not specified.",
      body: defectiveProBodyFixture(),
      materialItems: [
        {
          id: "payment_timing",
          label: "Payment timing",
          question: "When are invoices due?",
          severity: "material",
          agreementFamily: "vendor",
          whyItMatters: "Defines cash collection.",
          suggestedAnswerFormat: "e.g. Net 30, upon milestone acceptance",
          canProceedWithoutAnswer: true,
          affectsSections: ["payment"],
        },
      ],
    });
    expect(session).not.toBeNull();
    expect(session!.queue.length).toBeGreaterThan(0);
    expect(session!.completenessPercent).toBeGreaterThanOrEqual(0);
    expect(getCurrentVariable(session!)).not.toBeNull();
  });

  it("advances session on answer and formats refine instruction", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: "MSA",
      body: "1. Services.\nProvider delivers SaaS.",
      materialItems: [
        {
          id: "saas_sla",
          label: "Uptime target",
          question: "What uptime SLA should apply?",
          severity: "material",
          agreementFamily: "saas_msa",
          whyItMatters: "Sets availability expectations.",
          suggestedAnswerFormat: "e.g. 99.9% uptime, 4h critical response",
          canProceedWithoutAnswer: true,
          affectsSections: ["sla"],
        },
      ],
    });
    const cur = getCurrentVariable(session!);
    expect(cur).not.toBeNull();
    const instruction = formatRefineInstructionForAnswer(cur!, "99.9% monthly uptime");
    expect(instruction).toContain("99.9%");
    const next = applyGuidedAnswer(session!, cur!.id, "99.9% monthly uptime");
    expect(Object.keys(next.answered)).toHaveLength(1);
    expect(isGuidedCompletionComplete(next)).toBe(true);
  });

  it("prefers guided completion over retry when body is usable", () => {
    expect(
      shouldPreferGuidedCompletionOverRetry({
        hasUsableBody: true,
        structuralCatastrophic: false,
        variableCount: 3,
      }),
    ).toBe(true);
    expect(
      shouldPreferGuidedCompletionOverRetry({
        hasUsableBody: true,
        structuralCatastrophic: true,
        variableCount: 3,
      }),
    ).toBe(false);
  });

  it("sanitizes internal QA messages from user-facing copy", () => {
    expect(
      sanitizeProUserMessage("The agreement should read like an employment contractor document."),
    ).toBeNull();
    const copy = friendlyLowConfidenceCopy(
      buildGuidedSessionFromAgreement({
        intakeRaw: "Referral",
        body: "1. Referral.\nPartner refers customers.",
        materialItems: [
          {
            id: "referral_economics",
            label: "Revenue share",
            question: "How should referral payments work?",
            severity: "critical",
            agreementFamily: "referral",
            whyItMatters: "Defines compensation.",
            suggestedAnswerFormat: "e.g. 10% net revenue, 30-day payout",
            canProceedWithoutAnswer: false,
            affectsSections: ["compensation"],
          },
        ],
      })!,
      true,
    );
    expect(copy.title).toContain("almost done");
    expect(copy.body).not.toMatch(/employment contractor/i);
  });

  it("validateAgreementIntegrity dedupes repeated invoice boilerplate", () => {
    const invoice =
      "Invoices shall reference the applicable milestone and be due within thirty (30) days of receipt.";
    const raw = `1. PAYMENT.\n${invoice}\n\n3. CONFIDENTIALITY.\n${invoice}\n\n4. TERM.\nTwelve months.`;
    const out = validateAgreementIntegrity(raw, {
      intakeRaw: "Consulting",
      surface: "test_integrity",
      tier: "premium",
    });
    const hits = (out.text.match(/Invoices shall reference/gi) || []).length;
    expect(hits).toBeLessThanOrEqual(1);
  });

  it("clause coherence engine removes duplicate good-faith sentences", () => {
    const line =
      "The Parties shall perform their obligations in good faith and in accordance with this Agreement.";
    const raw = `1. SCOPE.\nScope here.\n\n${line}\n\n${line}`;
    const { text } = applyClauseCoherenceEngine(raw);
    expect((text.match(/good faith/gi) || []).length).toBeLessThanOrEqual(1);
  });

  it("keeps guided queue length stable when material extraction shrinks on rerender", () => {
    const key = buildGuidedSessionKey("gen-stable", "fp-abc");
    const fourItems = [
      "payment_timing",
      "referral_economics",
      "governing_venue",
      "saas_sla",
    ] as const;
    const material = fourItems.map((id) => ({
      id,
      label: id.replace(/_/g, " "),
      question: `Question for ${id}?`,
      severity: "material" as const,
      agreementFamily: "saas_msa" as const,
      whyItMatters: "Matters.",
      suggestedAnswerFormat: "e.g. terms",
      canProceedWithoutAnswer: true,
      affectsSections: ["general"],
    }));
    const full = buildGuidedSessionFromAgreement({
      intakeRaw: "SaaS MSA",
      body: "1. Services.\nHosted software.",
      materialItems: material,
    })!;
    const locked = lockGuidedSession(full, key);
    expect(locked.sessionKey).toBe(key);
    expect(locked.frozenTotalQuestions).toBe(4);
    expect(locked.variables.length).toBeGreaterThan(0);
    const persisted = {
      sessionKey: key,
      frozenTotalQuestions: 4,
      queue: [...fourItems],
      variables: full.variables,
      answered: {},
      skippedIds: [] as string[],
      currentIndex: 0,
      agreementFamily: "saas_msa" as const,
    };

    const shrunk = buildGuidedSessionFromAgreement({
      intakeRaw: "SaaS MSA",
      body: "1. Services.\nHosted software.",
      materialItems: material.slice(0, 2),
    });
    const merged = mergeGuidedSessionOnBaseRefresh(
      locked,
      shrunk,
      persisted,
      key,
    );
    expect(merged).not.toBeNull();
    expect(frozenQuestionTotal(merged!)).toBe(4);
    expect(merged!.queue.length).toBe(4);
  });

  it("exposes selectable Custom pill defaults for referral economics", () => {
    const pills = suggestedDefaultsForVariable({
      id: "referral_economics",
      category: "referral_economics",
      family: "referral",
    });
    const custom = pills.find((p) => p.id === "custom");
    expect(custom).toBeDefined();
    expect(custom!.label).toBe("Custom");
  });

  it("formats custom guided answers without prefilling user textarea placeholder", () => {
    expect(GUIDED_CUSTOM_INSTRUCTION_PLACEHOLDER).toContain("Add anything important LawDog should know");
    expect(GUIDED_CUSTOM_INSTRUCTION_PLACEHOLDER).not.toContain("Update the agreement to reflect");
  });

  it("maps referral compensation answer to accurate what-changed copy", () => {
    const vars: DealVariable[] = [
      {
        id: "referral_economics",
        category: "referral_economics",
        label: "Revenue share",
        question: "How should referral payments work?",
        severity: "critical",
        suggestedDefaults: [],
        agreementImpact: "",
        requiredForExecution: true,
        applicableAgreementFamilies: ["referral"],
        uiControlType: "pills",
        currentValue: null,
        confidence: 0.4,
        affectsSections: [],
      },
    ];
    expect(whatChangedLineForGuidedVariable("referral_economics", vars)).toBe(
      "Added referral compensation terms.",
    );
  });

  it("growth advisor prompt produces no empty sections or banned orphan phrases", () => {
    const growth = QA_MANUAL_TEN_PROMPTS.find((p) => p.id === "growth-advisor")!;
    const out = validateAgreementIntegrity(growthAdvisorDefectiveBodyFixture(), {
      intakeRaw: growth.intake,
      surface: "test_growth_advisor",
      tier: "premium",
    });
    expect(out.text).not.toMatch(/unless a different period is stated in a schedule/i);
    expect(out.text).not.toMatch(/intentionally left for completion before signing/i);
    expect(out.text).not.toMatch(/implementation plan and milestone payments/i);
    const invoicingBlock = out.text.match(/2\.3 Invoicing and Payment\.[\s\S]{0,200}/)?.[0] ?? "";
    expect(invoicingBlock.length).toBeGreaterThan(60);
    expect(invoicingBlock).toMatch(/Compensation|payment|Schedule/i);
    const confidentialityBlock = out.text.match(/4\.1 Confidentiality Obligations\.[\s\S]{0,200}/)?.[0] ?? "";
    expect(confidentialityBlock.length).toBeGreaterThan(60);
    expect(confidentialityBlock).toMatch(/Confidential/i);
    expect(out.text.length).toBeGreaterThan(200);
  });

  it("normalizes Schedule A or uses compensation stub for growth advisor", () => {
    const growth = QA_MANUAL_TEN_PROMPTS.find((p) => p.id === "growth-advisor")!;
    const out = validateAgreementIntegrity(growthAdvisorDefectiveBodyFixture(), {
      intakeRaw: growth.intake,
      surface: "test_schedule_a",
      tier: "premium",
    });
    const looseBulletsOnly =
      /^\s*[-•]\s+10% revenue share/im.test(out.text) && !/\bSCHEDULE\s+A\b/i.test(out.text);
    expect(looseBulletsOnly).toBe(false);
    expect(
      out.text.includes("Specific compensation mechanics will be completed in Schedule A") ||
        /\bSCHEDULE\s+A\b/i.test(out.text),
    ).toBe(true);
  });

  it("preserves progress after answering question 1 when base shrinks on rerender", () => {
    const key = buildGuidedSessionKey("gen-q1", "fp-q1");
    const items = ["referral_economics", "payment_timing", "governing_venue"] as const;
    const material = items.map((id) => ({
      id,
      label: id.replace(/_/g, " "),
      question: `Q for ${id}?`,
      severity: "material" as const,
      agreementFamily: "referral" as const,
      whyItMatters: "Matters.",
      suggestedAnswerFormat: "e.g.",
      canProceedWithoutAnswer: true,
      affectsSections: ["general"],
    }));
    const full = buildGuidedSessionFromAgreement({
      intakeRaw: "Referral partner",
      body: "1. Referral.\nPartner refers.",
      materialItems: material,
    })!;
    const afterQ1 = applyGuidedAnswer(full, "referral_economics", "10% net revenue");
    const merged = mergeGuidedSessionOnBaseRefresh(
      afterQ1,
      buildGuidedSessionFromAgreement({
        intakeRaw: "Referral partner",
        body: "1. Referral.\nPartner refers.",
        materialItems: material.slice(0, 1),
      }),
      {
        sessionKey: key,
        frozenTotalQuestions: 3,
        queue: [...items],
        variables: full.variables,
        answered: afterQ1.answered,
        skippedIds: [],
        currentIndex: afterQ1.currentIndex,
        agreementFamily: "referral",
      },
      key,
    );
    expect(merged).not.toBeNull();
    expect(frozenQuestionTotal(merged!)).toBe(3);
    expect(merged!.answered.referral_economics).toBe("10% net revenue");
    expect(getCurrentVariable(merged!)?.id).toBe("payment_timing");
  });

  it("skip advances to next variable on question 2", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: "Referral",
      body: "1. Referral.\nPartner refers.",
      materialItems: [
        {
          id: "referral_economics",
          label: "Revenue share",
          question: "How should referral payments work?",
          severity: "critical",
          agreementFamily: "referral",
          whyItMatters: "Defines compensation.",
          suggestedAnswerFormat: "e.g. 10%",
          canProceedWithoutAnswer: false,
          affectsSections: ["compensation"],
        },
        {
          id: "payment_timing",
          label: "Payment timing",
          question: "When are referral fees paid?",
          severity: "material",
          agreementFamily: "referral",
          whyItMatters: "Cash flow.",
          suggestedAnswerFormat: "e.g. Net 30",
          canProceedWithoutAnswer: true,
          affectsSections: ["payment"],
        },
      ],
    })!;
    const skippedFirst = skipGuidedVariable(session, "referral_economics");
    expect(getCurrentVariable(skippedFirst)?.id).toBe("payment_timing");
  });

  it("referral hard gate removes global invoice splices and fills empty headings", () => {
    const intake = "Referral partner introduces enterprise accounts. Revenue share not finalized.";
    const out = applyProBodyHardIntegrityGate(referralDefectiveBodyFixture(), {
      intakeRaw: intake,
      surface: "test_referral_hard",
    });
    const invoiceHits = (out.text.match(/Invoices will be sent to the billing contact/gi) || []).length;
    expect(invoiceHits).toBeLessThanOrEqual(1);
    expect(out.text).not.toMatch(/^\s*By:\s*_{3,}/m);
    expect(out.text).not.toMatch(/\bSIGNATURES\b/i);
    const protection = out.text.match(/2\.6 Protection Period\.[\s\S]{0,180}/)?.[0] ?? "";
    expect(protection.length).toBeGreaterThan(50);
    expect(protection).toMatch(/protected|twelve|Schedule A/i);
    const confidentiality = out.text.match(/6\.1 Confidentiality Obligations\.[\s\S]{0,220}/)?.[0] ?? "";
    expect(confidentiality.length).toBeGreaterThan(60);
    expect(confidentiality).toMatch(/Confidential Information/i);
  });

  it("preserveGuidedSessionProgress never shrinks frozen queue", () => {
    const key = buildGuidedSessionKey("gen-p", "fp-p");
    const prev = lockGuidedSession(
      {
        variables: [],
        queue: ["a", "b", "c"],
        answered: { a: "yes" },
        skipped: new Set(),
        currentIndex: 1,
        completenessPercent: 50,
        agreementFamily: "referral",
        frozenTotalQuestions: 3,
        sessionKey: key,
      },
      key,
    );
    const incoming = lockGuidedSession(
      {
        variables: [],
        queue: ["a"],
        answered: {},
        skipped: new Set(),
        currentIndex: 0,
        completenessPercent: 40,
        agreementFamily: "referral",
        frozenTotalQuestions: 1,
        sessionKey: key,
      },
      key,
    );
    const kept = preserveGuidedSessionProgress(prev, incoming);
    expect(kept.queue).toEqual(["a", "b", "c"]);
    expect(kept.frozenTotalQuestions).toBe(3);
    expect(kept.answered.a).toBe("yes");
  });

  it("finalizeAgreementOutput removes banned phrases from defective Pro body", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "Growth advisor for startup. Revenue share on intros.",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test_finalize_growth",
      tier: "premium",
    });
    expect(fin.text).not.toMatch(/unless a different period is stated in a schedule/i);
    expect(fin.text).not.toMatch(/^\s*signature\.\s*$/im);
  });

  it("consulting dev QA intake yields guided payment, support, and scope questions", () => {
    const body = consultingAuthoritativeBodyFixture();
    const material = buildMaterialMissingItems({ intakeRaw: CONSULTING_DEV_QA_INTAKE, body });
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body,
      materialItems: material,
    });
    expect(session).not.toBeNull();
    const ids = session!.variables.map((v) => v.id);
    expect(ids).toContain("payment_structure");
    expect(ids).toContain("support_obligations");
    expect(ids).toContain("scope_change_approval");
    expect(session!.queue.length).toBeGreaterThanOrEqual(3);
    expect(session!.queue.length).toBeLessThanOrEqual(5);
    const firstQ = getCurrentVariable(session!)?.question ?? "";
    expect(firstQ).toMatch(
      /How should the developer be paid|Who should own the work product|total contract fee/i,
    );
    expect(getCurrentVariable(session!)?.suggestedDefaults.some((p) => p.id === "custom")).toBe(true);
  });

  it("does not use legalistic revise-panel bullet wall as primary copy for consulting gaps", () => {
    const material = buildMaterialMissingItems({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
    });
    const wall = formatMaterialItemsForRevisePanel(material);
    expect(wall).toMatch(/Confirm these deal terms/i);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
      materialItems: material,
    })!;
    expect(GUIDED_COMPLETION_HEADING).toBe("Complete your agreement");
    expect(getCurrentVariable(session)?.question).not.toMatch(/Confirm invoice due date/i);
  });

  it("keeps frozen question count stable across rerender for consulting session", () => {
    const material = buildMaterialMissingItems({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
    });
    const key = buildGuidedSessionKey("consulting-gen", "fp-dev");
    const full = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
      materialItems: material,
    })!;
    const locked = lockGuidedSession(full, key);
    expect(frozenQuestionTotal(locked)).toBe(locked.queue.length);
    const shrunk = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
      materialItems: material.slice(0, 1),
    });
    const merged = mergeGuidedSessionOnBaseRefresh(locked, shrunk, null, key);
    expect(frozenQuestionTotal(merged!)).toBe(locked.frozenTotalQuestions);
  });

  it("resolveRecommendForMe returns intake-aware choices for payment structure", () => {
    const material = buildMaterialMissingItems({ intakeRaw: CONSULTING_DEV_QA_INTAKE, body: "" });
    const vars = extractDealVariables({ intakeRaw: CONSULTING_DEV_QA_INTAKE, body: "", materialItems: material });
    const payment = vars.find((v) => v.id === "payment_structure");
    expect(payment).toBeDefined();
    const rec = resolveRecommendForMe(payment!, CONSULTING_DEV_QA_INTAKE);
    expect(rec.explanation).toMatch(/evolving|milestone|retainer/i);
    expect(rec!.primary.value.length).toBeGreaterThan(0);
    expect(rec!.alternatives.length).toBeLessThanOrEqual(2);
    expect(rec!.explanation).not.toMatch(/legally should|you must legally/i);
  });

  it("enriches variables with coaching, pill help, and recommend pill", () => {
    const material = buildMaterialMissingItems({ intakeRaw: CONSULTING_DEV_QA_INTAKE, body: "" });
    const vars = extractDealVariables({ intakeRaw: CONSULTING_DEV_QA_INTAKE, body: "", materialItems: material });
    const payment = vars.find((v) => v.id === "payment_structure")!;
    const enriched = enrichDealVariableFromIntake(payment, CONSULTING_DEV_QA_INTAKE);
    expect(enriched.agreementImpact).toMatch(/payment structure|scope expands/i);
    expect(enriched.suggestedDefaults.some((p) => p.id === RECOMMEND_PILL_ID)).toBe(true);
    expect(enriched.pillExplanations?.hourly).toMatch(/time worked/i);
    expect(enriched.agreementImpact).not.toMatch(/legally should/i);
  });

  it("skip and custom pill remain available on consulting guided session", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
      materialItems: buildMaterialMissingItems({
        intakeRaw: CONSULTING_DEV_QA_INTAKE,
        body: consultingAuthoritativeBodyFixture(),
      }),
    })!;
    const first = getCurrentVariable(session)!;
    expect(first.suggestedDefaults.find((p) => p.id === "custom")).toBeDefined();
    const skipped = skipGuidedVariable(session, first.id);
    expect(getCurrentVariable(skipped)?.id).not.toBe(first.id);
  });

  it("maps guided consulting answers to accurate what-changed lines", () => {
    expect(whatChangedLineForGuidedVariable("payment_structure", [])).toMatch(/payment structure/i);
    expect(whatChangedLineForGuidedVariable("support_obligations", [])).toMatch(/support obligations/i);
    expect(whatChangedLineForGuidedVariable("scope_change_approval", [])).toMatch(/evolving scope/i);
    expect(whatChangedLineForGuidedVariable("ip_ownership_contradiction", [])).toMatch(/IP ownership/i);
  });

  it("normalizeWhatChangedDisplayLine strips duplicate prefix", () => {
    expect(normalizeWhatChangedDisplayLine("What changed: What changed: Added payment.")).toBe("Added payment.");
    expect(normalizeWhatChangedDisplayLine("What changed: Added payment.")).toBe("Added payment.");
  });

  it("applyGuidedAnswerTransaction advances from Q1 to Q2 in frozen queue", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
      body: contractorDeveloperBodyFixture(),
      materialItems: [],
    })!;
    const q1 = getCurrentVariable(session)!.id;
    const afterQ1 = applyGuidedAnswerTransaction(session, q1, "Company owns deliverables");
    expect(Object.keys(afterQ1.answered)).toContain(q1);
    const q2 = getCurrentVariable(afterQ1);
    expect(q2).not.toBeNull();
    expect(q2!.id).not.toBe(q1);
    expect(frozenQuestionTotal(afterQ1)).toBe(session.queue.length);
  });

  it("shared pill resolves to non-empty structured IP instruction", () => {
    const vars = extractDealVariables({ intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE, body: "" });
    const ip =
      vars.find((v) => v.id === "ip_ownership_contradiction") ??
      vars.find((v) => v.id === "ip_ownership")!;
    const sharedPill = ip.suggestedDefaults.find((p) => p.id === "shared");
    const res = resolveGuidedAnswerForPill(ip, "shared", "Shared / custom", sharedPill?.value ?? "");
    expect(res.action).toBe("apply");
    if (res.action === "apply") {
      expect(res.instructionAnswer.length).toBeGreaterThan(80);
    }
  });

  it("consulting authoritative body integrity removes orphan LOL and duplicate direct damages", () => {
    const out = validateAgreementIntegrity(consultingAuthoritativeBodyFixture(), {
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      surface: "test_consulting_integrity",
      tier: "premium",
    });
    const directHits = (out.text.match(/Direct damages are limited/gi) || []).length;
    expect(directHits).toBeLessThanOrEqual(1);
    expect(out.text).not.toMatch(/^\s*By:\s*_{3,}/m);
    expect(out.text.length).toBeGreaterThan(800);
  });

  it("prefers guided completion when material gaps exist even if variable queue not yet built", () => {
    expect(
      shouldPreferGuidedCompletionOverRetry({
        hasUsableBody: true,
        variableCount: 0,
        materialGapCount: 4,
      }),
    ).toBe(true);
  });

  it("consulting dev prompt is registered in manual QA corpus", () => {
    const p = QA_MANUAL_TEN_PROMPTS.find((x) => x.id === "consulting-dev-qa");
    expect(p?.intake).toContain("workflow systems");
  });

  it("needs-details invariant downgrades readiness when panel is not renderable", () => {
    expect(resolveDisplayReadinessWithGuidedInvariant("needs_details", false)).toBe("ready_for_review");
    expect(enforceNeedsDetailsGuidedInvariant({ readiness: "needs_details", session: null }).showNeedsDetailsMessaging).toBe(
      false,
    );
    expect(shouldShowGuidedNeedsDetailsMessaging(false)).toBe(false);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONSULTING_DEV_QA_INTAKE,
      body: consultingAuthoritativeBodyFixture(),
    });
    const renderable = shouldRenderGuidedCompletionPanel({ bodyUsable: true, session, body: consultingAuthoritativeBodyFixture() });
    if (renderable) {
      expect(shouldShowGuidedNeedsDetailsMessaging(true)).toBe(true);
    }
  });

  it("shouldRenderGuidedCompletionPanel is false when session queue is empty", () => {
    expect(
      shouldRenderGuidedCompletionPanel({
        bodyUsable: true,
        session: null,
        materialItems: [{ id: "x", label: "x", question: "Confirm something?", severity: "material", agreementFamily: "generic_business_agreement", whyItMatters: "x", suggestedAnswerFormat: "x", canProceedWithoutAnswer: true, affectsSections: [] }],
      }),
    ).toBe(false);
  });
});

describe("canRenderGuidedQuestions UI invariant", () => {
  const migrationBody = lighthouseApexMigrationBodyFixture();

  it("lighthouse loose intake: canRenderGuidedQuestions true and first question is selectable", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      body: migrationBody,
    })!;
    expect(
      computeCanRenderGuidedQuestions({ bodyUsable: true, session, guidedPanelMounted: true }),
    ).toBe(true);
    const current = getCurrentVariable(session)!;
    expect(variableHasSelectableAnswerPath(current)).toBe(true);
    expect(current.question.trim().length).toBeGreaterThan(8);
    expect(
      ["project_fee_phase_confirmation", "total_fee_confirmation", "phase_payment_allocation", "supplemental_schedule_confirmation"],
    ).toContain(current.id);
  });

  it("never shows Needs details or below-copy when guided queue is not renderable", () => {
    const offState = resolveGuidedCompletionRenderState({
      bodyText: "",
      guidedSession: null,
      panelMountedSurface: null,
      bodyUsable: false,
      rawReadiness: "needs_details",
    });
    expect(mayShowNeedsDetailsMessaging(offState)).toBe(false);
    expect(mayShowCompleteAgreementBelowCopy(offState)).toBe(false);
    const neutralState = resolveGuidedCompletionRenderState({
      bodyText: migrationBody,
      panelMountedSurface: null,
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(finalizeTaglineForGuidedState(3, "needs_details", neutralState)).toBe(GUIDED_NEUTRAL_REVIEW_COPY);
    expect(finalizeTaglineForGuidedState(3, "needs_details", neutralState)).not.toMatch(/Complete your agreement/i);
    expect(finalizeTaglineForGuidedState(3, "needs_details", neutralState)).not.toMatch(/Tighten the items below/i);
  });

  it("semantic placeholders without literal TBD still enable canRenderGuidedQuestions", () => {
    const body = semanticallyIncompleteProBodyFixture();
    const session = buildGuidedSessionFromAgreement({
      body,
      intakeRaw: "Services agreement. Fee maybe $50k.",
    })!;
    expect(computeCanRenderGuidedQuestions({ bodyUsable: true, session })).toBe(true);
  });

  it("malformed pasted phase table with TBD/??? generates fee/phase guided variables", () => {
    const vars = extractDealVariables({
      intakeRaw: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      body: migrationBody,
    });
    expect(vars.some((v) => v.id === "project_fee_phase_confirmation")).toBe(true);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      body: migrationBody,
    })!;
    expect(session.queue.length).toBeGreaterThan(0);
  });

  it("lighthouse canonical intake still builds renderable guided session", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
      body: migrationBody,
    })!;
    expect(computeCanRenderGuidedQuestions({ bodyUsable: true, session })).toBe(true);
  });

  it("hard gate removes duplicate indemnity fragments and orphan survival lines from services body", () => {
    const dupBody = [
      migrationBody,
      "",
      "9. INDEMNITY",
      "Provider will indemnify Client for third-party claims arising from negligence.",
      "",
      "9. INDEMNITY",
      "Provider will indemnify Client for third-party claims arising from negligence.",
      "",
      "Survival and wind-down obligations apply as stated herein.",
    ].join("\n");
    const out = applyProBodyHardIntegrityGate(dupBody, {
      intakeRaw: LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
      agreementFamily: "services_agreement",
      surface: "pro",
    });
    const indemnityHits = (out.text.match(/Provider will indemnify Client for third-party claims/gi) || []).length;
    expect(indemnityHits).toBeLessThanOrEqual(1);
    expect(out.text).not.toMatch(/\n\s*Survival and wind-down[^\n]+\n\s*IN WITNESS/i);
  });
});
