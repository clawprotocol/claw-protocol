/**
 * Live #89 hole: a thin two-party dump that already states parties + scope
 * must take the missing-tenet ask path — not the too-thin suggested-draft dead-end.
 *
 * Universal rule: two human parties + a concrete work description
 * (e.g. "design a logo and brand kit") is not too-thin. Ask only missing
 * tenets (payment, term, governing law). Do not invent a duration or
 * inflate person+company into four contracting parties.
 */
import { describe, expect, it } from "vitest";
import {
  assessAgreementIntakeCapability,
  buildAgreementIntakeClarification,
  evaluateIntentionalCreateDraftSubmit,
  hasSubstantiveDealPurpose,
} from "./agreementIntakeClarification";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { buildWeCapturedSummaryBullets } from "./intakeWhatWeUnderstood";
import {
  buildLocalMissingTenetQuestions,
  getRequiredClarificationTopics,
  scoreFiveTenets,
} from "./proAgreementFiveTenets";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";

const PRIYA_DIEGO_LOGO_BRAND =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";

const MARCUS_ELENA_MARKETING =
  "Marcus Thompson of Apex Consulting Group is hiring Elena Rodriguez of Brightwave Marketing Agency to run a marketing campaign.";

const THIN_TWO_PARTY_STATED_SCOPE = [
  ["Priya/Diego logo+brand kit", PRIYA_DIEGO_LOGO_BRAND],
  ["Marcus/Elena marketing campaign", MARCUS_ELENA_MARKETING],
] as const;

function assertNoInventedTermOrFourPartyAmong(text: string | null | undefined): void {
  const blob = text || "";
  expect(blob).not.toMatch(/\b60[-\s]?day\b/i);
  expect(blob).not.toMatch(
    /\bamong\s+[^.]{0,160},\s+[^.]{0,80},\s+and\s+[^.]{0,80}/i,
  );
}

describe("thin two-party dump with stated scope (live #89)", () => {
  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s is a stated purpose, not too-thin",
    (_label, dump) => {
      expect(hasSubstantiveDealPurpose(dump)).toBe(true);
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s proceeds past the capability / suggested-draft gate",
    (_label, dump) => {
      const clarification = buildAgreementIntakeClarification(dump);
      expect(clarification).toBeNull();

      const decision = assessAgreementIntakeCapability(dump);
      expect(decision.ok).toBe(true);

      const submit = evaluateIntentionalCreateDraftSubmit(dump);
      expect(submit.action).toBe("proceed");
      if (submit.action === "proceed") {
        expect(submit.text).toBe(dump);
      }
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s asks only missing tenets (payment, term, law) — not scope or parties",
    (_label, dump) => {
      const score = scoreFiveTenets(dump);
      expect(score.parties).toBe(true);
      expect(score.scope).toBe(true);
      expect(score.payment).toBe(false);
      expect(score.term).toBe(false);
      expect(score.governingLaw).toBe(false);

      const topics = getRequiredClarificationTopics(dump);
      expect(topics).toEqual(["payment", "term", "governing_law"]);
      expect(topics).not.toContain("scope");
      expect(topics).not.toContain("parties");
      expect(topics.length).toBeGreaterThanOrEqual(2);
      expect(topics.length).toBeLessThanOrEqual(5);

      const qs = buildLocalMissingTenetQuestions(dump);
      expect(qs.length).toBeGreaterThanOrEqual(2);
      expect(qs.length).toBeLessThanOrEqual(5);
      expect(qs.join(" ")).toMatch(/how much is paid/i);
      expect(qs.join(" ")).toMatch(/how long does this agreement/i);
      expect(qs.join(" ")).toMatch(/which state's law/i);
      expect(qs.join(" ")).not.toMatch(/purpose or scope/i);
      expect(qs.join(" ")).not.toMatch(/who are the parties/i);
      assertNoInventedTermOrFourPartyAmong(qs.join(" "));
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s does not invent 60-day or a four-party among-rewrite",
    (_label, dump) => {
      const clarification = buildAgreementIntakeClarification(dump);
      expect(clarification?.suggestedRewrite ?? null).toBeNull();
      assertNoInventedTermOrFourPartyAmong(clarification?.suggestedRewrite);
      assertNoInventedTermOrFourPartyAmong(clarification?.whatWeHeard?.join(" "));
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s stays a free two-party deal (not 3+ party Pro)",
    (_label, dump) => {
      const gate = assessStarterComplexityGate(dump);
      expect(gate.required).toBe(false);
      expect(gate.reasons).not.toContain("three_plus_legal_parties");
      expect(gate.reasons).not.toContain("not_simple_two_party_deal");
      expect(gate.partyCount).toBeLessThan(3);
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s summary recognizes stated scope (not Still needed)",
    (_label, dump) => {
      const structured = parseIntakeToStructuredAgreement(dump);
      expect(structured.scope.length).toBeGreaterThan(8);
      expect(structured.scopeSignalPresent).toBe(true);
      expect(structured.scope.toLowerCase()).toMatch(/logo and brand kit|marketing campaign/);

      const live = buildLiveDraftPreview(dump);
      const bullets = buildWeCapturedSummaryBullets(dump, live);
      const scope = bullets.find((b) => b.kind === "scope");
      expect(scope?.displayValue).not.toMatch(/still needed/i);
      expect(scope?.displayValue.toLowerCase()).toMatch(/logo and brand kit|marketing campaign/);
      expect(scope?.provenance).not.toBe("still_needed");
    },
  );

  it("still blocks a true too-thin between-shell with no work description", () => {
    const decision = assessAgreementIntakeCapability(
      "Draft an agreement between Alpha and Beta about stuff.",
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("needs_commercial_basics");
  });
});
