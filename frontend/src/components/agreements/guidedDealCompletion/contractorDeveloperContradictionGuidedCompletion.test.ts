import { describe, expect, it } from "vitest";
import { detectAgreementFamily } from "../agreementFamilyRouter";
import { resolveDeterministicIntentTitleAndSeed } from "../deterministicIntentTitleMapper";
import { isFounderEquityVestingIntent } from "../founderIntentRouter";
import { getSafeFallbackPartyLabels } from "../partyNameConfidence";
import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import {
  buildGuidedSessionFromAgreement,
  extractDealVariables,
  getCurrentVariable,
  shouldRenderGuidedCompletionPanel,
} from "./index";
import { detectContradictoryTerms } from "./detectContradictoryTerms";
import { validateAgreementIntegrity } from "./agreementIntegrityValidator";

export const CONTRACTOR_DEVELOPER_QA_INTAKE =
  "Need a contractor agreement for a developer. They should own all their work product but we also need full exclusive ownership of everything they create. The arrangement is month-to-month but should automatically lock in for 3 years unless terminated. Need it simple and founder-friendly.";

export function contractorDeveloperBodyFixture(): string {
  return [
    "FOUNDER VESTING AGREEMENT",
    "This Agreement is between Party A and Party B.",
    "",
    "1. SERVICES",
    "Contractor will provide development services.",
    "",
    "1.2 Deliverables.",
    "",
    "2. COMPENSATION",
    "Compensation, invoicing, and payment timing will be documented in a schedule or written statement agreed before work begins.",
    "",
    "3. INTELLECTUAL PROPERTY",
    "3.1 Work Made for Hire; Assignment.",
    "Compensation, invoicing, and payment timing will be documented in a schedule or written statement agreed before work begins.",
    "3.5 No Conflicting Rights.",
    "",
    "6. WARRANTIES",
    "6.2 Contractor Warranties.",
    "",
    "7. TERM AND TERMINATION",
    "7.6 Effect of Termination.",
    "7.7 Survival.",
    "Survival and wind-down obligations apply as stated herein.",
    "",
    "IN WITNESS WHEREOF, the parties may execute this Agreement on the date of last signature below.",
    "By: ____________________",
  ].join("\n");
}

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
    const current = getCurrentVariable(session!)!;
    expect(current.question).toMatch(/own the developer's work product|month-to-month/i);
    expect(current.suggestedDefaults.some((p) => p.id === "custom")).toBe(true);
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
