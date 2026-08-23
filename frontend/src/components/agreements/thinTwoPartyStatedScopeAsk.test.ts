/**
 * Live #90 keep + new hole: a thin two-party dump that already states parties + scope
 * must skip the too-thin suggested-draft dead-end, then ASK missing tenets
 * before any free starter paint (never a hollow Party A/B landing).
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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { buildWeCapturedSummaryBullets } from "./intakeWhatWeUnderstood";
import {
  buildLocalMissingTenetQuestions,
  getRequiredClarificationTopics,
  scoreFiveTenets,
} from "./proAgreementFiveTenets";
import {
  assessStarterComplexityGate,
  emptyStarterCheckoutPendingShell,
  shouldResolveStarterHomeTransitionToReviewReady,
} from "./starterMultiPartyProGate";
import {
  evaluateFreeStarterMissingTenetAsk,
  extractStatedTwoPartyHiringPair,
  isValidFreeStarterLanding,
  mergeNumberedTenetAnswersIntoIntake,
  seedStatedTwoPartyNamesOnHollowDraft,
  shouldAskMissingTenetsBeforeFreePaint,
  ensureStatedTwoPartyHiringNamesInBody,
} from "./freeStarterMissingTenetAsk";
import {
  isVisibleMissingTenetAskLanding,
  shouldShowPaidSessionGeneratingOverlay,
} from "./paidProPaidSessionLanding";
import { applyPreGenerationIntakeDefaults } from "./intakeClarificationPolicy";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import {
  draftHasPlaceholderParties,
  getDraftFirstReviewBlocker,
} from "./reviewPlaceholderGuard";
import { resolveFreeStarterReviewBody } from "./freeStarterReviewBodyResolver";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";

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

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s must ask missing payment/term/law BEFORE free paint",
    (_label, dump) => {
      expect(shouldAskMissingTenetsBeforeFreePaint(dump)).toBe(true);
      const ask = evaluateFreeStarterMissingTenetAsk(dump);
      expect(ask.action).toBe("ask");
      if (ask.action !== "ask") return;
      expect(ask.topics).toEqual(["payment", "term", "governing_law"]);
      expect(ask.topics.length).toBeGreaterThanOrEqual(2);
      expect(ask.topics.length).toBeLessThanOrEqual(5);
      expect(ask.questions.join(" ")).toMatch(/how much is paid/i);
      expect(ask.questions.join(" ")).toMatch(/how long does this agreement/i);
      expect(ask.questions.join(" ")).toMatch(/which state's law/i);
      expect(ask.questions.join(" ")).not.toMatch(/purpose or scope/i);
      expect(ask.questions.join(" ")).not.toMatch(/who are the parties/i);
      assertNoInventedTermOrFourPartyAmong(ask.questions.join(" "));
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s hollow Party A/B + empty payment/law is not a valid free landing",
    (_label, dump) => {
      const hollow = `SERVICES AGREEMENT

This Agreement (“Agreement”) is entered into by and between: Party A ("Client") and Party B ("Service Provider") (collectively, the “Parties”).

1. Scope of Services / Purpose
This agreement covers design a logo and brand kit.

2. Payment Terms

3. Services Term and Effective Date
Effective Date: upon full execution by both parties

4. Governing Law
`;
      expect(isValidFreeStarterLanding(hollow, dump)).toBe(false);
      expect(isValidFreeStarterLanding("", dump)).toBe(false);
      expect(hollow).toMatch(/\bParty A\b/);
      expect(hollow).toMatch(/\bParty B\b/);
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s after answers skips ask and uses stated names (not Party A/B or 60-day)",
    (_label, dump) => {
      const ask = evaluateFreeStarterMissingTenetAsk(dump);
      expect(ask.action).toBe("ask");
      if (ask.action !== "ask") return;
      const answered = mergeNumberedTenetAnswersIntoIntake(
        dump,
        ask.topics,
        "1. $4,500 flat on delivery\n2. 6 weeks\n3. Texas",
      );
      expect(shouldAskMissingTenetsBeforeFreePaint(answered)).toBe(false);
      expect(evaluateFreeStarterMissingTenetAsk(answered).action).toBe("paint");
      const score = scoreFiveTenets(answered);
      expect(score.payment).toBe(true);
      expect(score.term).toBe(true);
      expect(score.governingLaw).toBe(true);
      expect(score.isComplete).toBe(true);
      expect(answered).not.toMatch(/\b60[-\s]?day\b/i);
      const pair = extractStatedTwoPartyHiringPair(dump);
      expect(pair).not.toBeNull();
      expect(pair?.map((p) => p.name).join(" ")).toMatch(/Priya Shah|Marcus Thompson/);
      expect(pair?.map((p) => p.name).join(" ")).toMatch(/Diego Alvarez|Elena Rodriguez/);
      expect(pair).toHaveLength(2);
      const hollowDraft = {
        ...emptyStarterCheckoutPendingShell(),
        parties: [
          { name: "Party A", role: "Client" },
          { name: "Party B", role: "Service Provider" },
        ],
      };
      const seeded = seedStatedTwoPartyNamesOnHollowDraft(hollowDraft, dump);
      expect(seeded.parties.map((p) => p.name).join(" ")).not.toMatch(/\bParty A\b/i);
      expect(seeded.parties.map((p) => p.name).join(" ")).not.toMatch(/\bParty B\b/i);
      assertNoInventedTermOrFourPartyAmong(seeded.parties.map((p) => p.name).join(", "));

      const inferred = tryInferNamedPartiesFromIntake(answered);
      expect(inferred).not.toBeNull();
      expect(inferred).toHaveLength(2);
      expect(extractStatedTwoPartyHiringPair(answered)).toEqual(extractStatedTwoPartyHiringPair(dump));
    },
  );

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s after answers paints stated names (not Party A/B) and CTA is not Add party names",
    (_label, dump) => {
      const ask = evaluateFreeStarterMissingTenetAsk(dump);
      expect(ask.action).toBe("ask");
      if (ask.action !== "ask") return;
      const answered = mergeNumberedTenetAnswersIntoIntake(
        dump,
        ask.topics,
        "1. $2,400 due on signing\n2. 30 days starting August 22, 2026\n3. Texas",
      );
      expect(extractStatedTwoPartyHiringPair(answered)).not.toBeNull();
      expect(extractStatedTwoPartyHiringPair(answered)).toHaveLength(2);

      const hollowDraft = {
        ...emptyStarterCheckoutPendingShell(),
        title: "Services Agreement",
        parties: [
          { name: "Party A", role: "Client" },
          { name: "Party B", role: "Service Provider" },
        ],
        purpose: "design a logo and brand kit",
      };
      const seeded = seedStatedTwoPartyNamesOnHollowDraft(hollowDraft, answered);
      const afterDefaults = runIntakeDefaultsAndRoles(
        seeded,
        answered,
        true,
        defaultIntakePartyRoleLabels(),
      );
      const afterPre = applyPreGenerationIntakeDefaults(afterDefaults, answered);
      const paintedDraft = seedStatedTwoPartyNamesOnHollowDraft(afterPre, answered);

      const partyBlob = paintedDraft.parties.map((p) => p.name).join(" ");
      expect(paintedDraft.parties).toHaveLength(2);
      expect(partyBlob).toMatch(/Priya Shah|Marcus Thompson/);
      expect(partyBlob).toMatch(/Diego Alvarez|Elena Rodriguez/);
      expect(partyBlob).not.toMatch(/\bParty A\b/i);
      expect(partyBlob).not.toMatch(/\bParty B\b/i);
      assertNoInventedTermOrFourPartyAmong(partyBlob);

      const body = ensureStatedTwoPartyHiringNamesInBody(
        buildStarterAgreementPreviewForReview(paintedDraft, { intakeText: answered }),
        answered,
      );
      expect(body).toMatch(/Priya Shah|Marcus Thompson/);
      expect(body).toMatch(/Diego Alvarez|Elena Rodriguez/);
      expect(body).toMatch(/Northline Studio|Apex Consulting|Harbor Marks|Brightwave/);
      expect(partyBlob).toMatch(/Northline Studio|Apex Consulting|Harbor Marks|Brightwave/);
      expect(body).not.toMatch(/\bParty A\b/i);
      expect(body).not.toMatch(/\bParty B\b/i);
      expect(body).toMatch(/\$2,400|2,400/);
      expect(body).toMatch(/30 days|August 22/);
      expect(body).toMatch(/Texas/i);
      assertNoInventedTermOrFourPartyAmong(body);

      expect(draftHasPlaceholderParties(paintedDraft)).toBe(false);
      expect(
        getDraftFirstReviewBlocker(paintedDraft, {
          userVisibleFullDocumentPlain: body,
          intakeText: answered,
        }),
      ).not.toBe("party_placeholder");

      const resolved = resolveFreeStarterReviewBody({
        draft: paintedDraft,
        rawIntake: answered,
      });
      expect(resolved.body).toMatch(/Priya Shah|Marcus Thompson/);
      expect(resolved.body).toMatch(/Diego Alvarez|Elena Rodriguez/);
      expect(resolved.body).toMatch(/Northline Studio|Apex Consulting|Harbor Marks|Brightwave/);
      expect(resolved.body).not.toMatch(/\bParty A\b/i);
      expect(resolved.body).not.toMatch(/\bParty B\b/i);
    },
  );

  it("create path evaluates the missing-tenet ask before free paint", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toContain("evaluateFreeStarterMissingTenetAsk");
    expect(src).toContain("beginFreeMissingTenetAsk");
    const parseStart = src.indexOf("const runProductionLocalDraftParse");
    expect(parseStart).toBeGreaterThan(0);
    const askAt = src.indexOf("beginFreeMissingTenetAsk", parseStart);
    const beginGen = src.indexOf("beginStarterDraftGeneration();", parseStart);
    expect(askAt).toBeGreaterThan(parseStart);
    expect(beginGen).toBeGreaterThan(askAt);
    const firstSeed = src.indexOf("seedStatedTwoPartyNamesOnHollowDraft", parseStart);
    const defaultsAt = src.indexOf("runIntakeDefaultsAndRoles", parseStart);
    const preAt = src.indexOf("applyIntakePreGenerationDefaults", parseStart);
    const reseedAt = src.indexOf("seedStatedTwoPartyNamesOnHollowDraft", defaultsAt);
    expect(firstSeed).toBeGreaterThan(parseStart);
    expect(defaultsAt).toBeGreaterThan(firstSeed);
    expect(preAt).toBeGreaterThan(defaultsAt);
    expect(reseedAt).toBeGreaterThan(preAt);
  });

  it.each(THIN_TWO_PARTY_STATED_SCOPE)(
    "%s ask landing hides Preparing/Building overlay (inputs stay clickable)",
    (_label, dump) => {
      const ask = evaluateFreeStarterMissingTenetAsk(dump);
      expect(ask.action).toBe("ask");
      if (ask.action !== "ask") return;
      expect(ask.questions.length).toBeGreaterThanOrEqual(2);
      expect(ask.questions.length).toBeLessThanOrEqual(5);

      const askVisible = isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: ask.questions.length,
      });
      expect(askVisible).toBe(true);
      expect(
        shouldShowPaidSessionGeneratingOverlay({
          phase: "processing",
          hasVisibleDealBody: false,
          hasVisibleAskLanding: askVisible,
        }),
      ).toBe(false);
      expect(
        shouldShowPaidSessionGeneratingOverlay({
          phase: "awaiting_gaps",
          hasVisibleDealBody: false,
          hasVisibleAskLanding: askVisible,
        }),
      ).toBe(false);
      expect(
        shouldResolveStarterHomeTransitionToReviewReady({
          draft: null,
          createUiStage: "INPUT",
          createFlowPhase: "capturing_input",
          isGenerating: true,
          missingTenetAskVisible: askVisible,
        }),
      ).toBe(true);
    },
  );

  it("still shows generating overlay when there is no ask and no painted deal", () => {
    expect(
      isVisibleMissingTenetAskLanding({
        phase: "processing",
        freeStarterAskQuestionCount: 0,
        paidGapQuestionCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody: false,
        hasVisibleAskLanding: false,
      }),
    ).toBe(true);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "generating_draft",
        isGenerating: true,
        missingTenetAskVisible: false,
      }),
    ).toBe(false);
  });

  it("create path dismisses Preparing when beginFreeMissingTenetAsk lands the ask", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toContain("missingTenetAskVisible");
    expect(src).toContain("hasVisibleAskLanding");
    expect(src).toContain("isVisibleMissingTenetAskLanding");
    const beginAsk = src.indexOf("const beginFreeMissingTenetAsk");
    expect(beginAsk).toBeGreaterThan(0);
    const beginAskEnd = src.indexOf("const resolvePaidCreateGateBypassContext", beginAsk);
    const beginAskBody = src.slice(beginAsk, beginAskEnd);
    expect(beginAskBody).toContain('onHomeGuidedTransitionPhase?.("review_ready")');
  });
});
