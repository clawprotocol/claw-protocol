import { describe, expect, it } from "vitest";
import { detectAgreementFamily } from "../agreementFamilyRouter";
import { resolveDeterministicIntentTitleAndSeed } from "../deterministicIntentTitleMapper";
import { isFounderEquityVestingIntent } from "../founderIntentRouter";
import { getSafeFallbackPartyLabels } from "../partyNameConfidence";
import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import {
  applyGuidedAnswerTransaction,
  buildGuidedSessionFromAgreement,
  extractDealVariables,
  getCurrentVariable,
  shouldRenderGuidedCompletionPanel,
} from "./index";
import { mergeGuidedSessionOnBaseRefresh } from "./guidedSessionPersistence";
import { detectContradictoryTerms } from "./detectContradictoryTerms";
import { validateAgreementIntegrity } from "./agreementIntegrityValidator";

import { CONTRACTOR_DEVELOPER_QA_INTAKE, contractorDeveloperBodyFixture } from "../qaManualTenPrompts";

describe("contractorDeveloperContradictionGuidedCompletion", () => {
  it("routes contractor developer intake to independent_contractor_agreement family", () => {
    expect(detectAgreementFamily(CONTRACTOR_DEVELOPER_QA_INTAKE)).toBe("independent_contractor_agreement");
  });

  it("does not classify founder-friendly contractor prompt as founder vesting", () => {
    expect(isFounderEquityVestingIntent(CONTRACTOR_DEVELOPER_QA_INTAKE)).toBe(false);
  });

  it("resolves Developer Contractor Agreement title, not Founder Vesting", () => {
    const hit = resolveDeterministicIntentTitleAndSeed(CONTRACTOR_DEVELOPER_QA_INTAKE);
    expect(hit).not.toBeNull();
    expect(hit!.title).toMatch(/Developer Contractor Agreement|Independent Contractor Agreement/i);
    expect(hit!.title).not.toMatch(/Founder Vesting/i);
  });

  it("detects IP and term contradictions as guided variables", () => {
    const signals = detectContradictoryTerms(CONTRACTOR_DEVELOPER_QA_INTAKE);
    const ids = signals.map((s) => s.id);
    expect(ids).toContain("ip_ownership_contradiction");
    expect(ids).toContain("term_structure_contradiction");
  });

  it("builds renderable guided session with contradiction questions first", () => {
    const body = contractorDeveloperBodyFixture();
    const vars = extractDealVariables({ intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE, body });
    expect(vars.length).toBeGreaterThanOrEqual(2);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
      body,
    });
    expect(session).not.toBeNull();
    expect(
      shouldRenderGuidedCompletionPanel({
        bodyUsable: true,
        session,
        materialItems: [],
        intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
        body,
      }),
    ).toBe(true);
    expect(session!.queue[0]).toBe("ip_ownership_contradiction");
    const current = getCurrentVariable(session!)!;
    expect(current.question).toMatch(/own the developer's work product/i);
    expect(current.suggestedDefaults.some((p) => p.id === "custom")).toBe(true);
    expect(current.suggestedDefaults.some((p) => p.id === "shared")).toBe(true);
  });

  it("session does not rewind after base refresh when Q1 answered", () => {
    const body = contractorDeveloperBodyFixture();
    const full = buildGuidedSessionFromAgreement({ intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE, body })!;
    const q1 = getCurrentVariable(full)!.id;
    const afterQ1 = applyGuidedAnswerTransaction(
      { ...full, sessionKey: "gen-c:fp-c" },
      q1,
      "Split IP structure",
    );
    const shrunk = buildGuidedSessionFromAgreement({
      intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
      body,
      materialItems: [],
    });
    const merged = mergeGuidedSessionOnBaseRefresh(afterQ1, shrunk, null, "gen-c:fp-c");
    expect(merged).not.toBeNull();
    expect(Object.values(merged!.answered).some((a) => /split ip/i.test(a))).toBe(true);
    expect(getCurrentVariable(merged!)?.id).not.toBe(q1);
  });

  it("empty guided invariant: material gaps without renderable session must not qualify for panel", () => {
    const emptySession = buildGuidedSessionFromAgreement({
      intakeRaw: "Generic business deal.",
      body: "1. Purpose.\nParties collaborate.\n2. Fees.\nNet 30 invoicing.\n3. Term.\nOne year.",
      materialItems: [],
    });
    const renderable = shouldRenderGuidedCompletionPanel({
      bodyUsable: true,
      session: emptySession,
      materialItems: [],
    });
    if (!emptySession || emptySession.queue.length === 0) {
      expect(renderable).toBe(false);
    }
  });

  it("never shows Needs-details messaging without Question 1 of renderable controls", () => {
    const body = contractorDeveloperBodyFixture();
    const session = buildGuidedSessionFromAgreement({ intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE, body })!;
    const renderable = shouldRenderGuidedCompletionPanel({ bodyUsable: true, session, body });
    const current = getCurrentVariable(session);
    if (renderable) {
      expect(session.queue.length).toBeGreaterThan(0);
      expect(current?.question.length).toBeGreaterThan(8);
      expect(current?.suggestedDefaults.length).toBeGreaterThan(0);
    } else {
      expect(current).toBeNull();
    }
  });

  it("uses Company and Contractor party fallbacks for contractor family", () => {
    expect(getSafeFallbackPartyLabels("independent_contractor_agreement")).toEqual(["Company", "Contractor"]);
  });

  it("integrity gate removes repeated compensation boilerplate outside compensation sections", () => {
    const out = applyClauseCoherenceEngine(contractorDeveloperBodyFixture());
    const hits = (
      out.text.match(/Compensation, invoicing, and payment timing will be documented/gi) || []
    ).length;
    expect(hits).toBeLessThanOrEqual(1);
  });

  it("hard gate fills empty contractor numbered headings", () => {
    const out = validateAgreementIntegrity(contractorDeveloperBodyFixture(), {
      intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
      surface: "test_contractor_headings",
      tier: "premium",
    });
    const emptyHeadingOnly = out.text.match(/^\s*\d+(?:\.\d+)?\s+[^.\n]+\.\s*$/gm) ?? [];
    for (const h of emptyHeadingOnly) {
      const idx = out.text.indexOf(h);
      const after = out.text.slice(idx + h.length, idx + h.length + 120).trim();
      expect(after.length).toBeGreaterThan(20);
    }
  });

  it("validateAgreementIntegrity strips manual signature scaffolding", () => {
    const out = validateAgreementIntegrity(contractorDeveloperBodyFixture(), {
      intakeRaw: CONTRACTOR_DEVELOPER_QA_INTAKE,
      surface: "test_contractor_integrity",
      tier: "premium",
    });
    expect(out.text).not.toMatch(/date of last signature below/i);
    expect(out.text).not.toMatch(/^\s*By:\s*_{3,}/m);
  });
});
