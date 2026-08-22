import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  assessStarterComplexityGate,
  assessStarterMultiPartyProRequirement,
  buildStarterProCheckoutPendingDraft,
  CREATE_FLOW_PREPARATION_FAILSAFE_MESSAGE,
  detectRevenueShareLanguage,
  isThreePlusLegalPartyGate,
  formatStarterMultiPartyGatePartyLines,
  NOT_SIMPLE_TWO_PARTY_PRO_GATE_TITLE,
  resolveStarterMultiPartyProGatePresentation,
  shouldFailSafeEmptyAuthorityPreparation,
} from "./starterMultiPartyProGate";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteFixtures";

export const TEST375_ROLE_LABEL_TWO_PARTY_INTAKE = `Client:
Blue Canyon Analytics LLC

Service Provider:
Harbor Peak Automation LLC

Simple consulting and implementation services.
12 month term.
Monthly payment.
Texas law.`;

const TWO_PARTY_INTAKE = `Consulting agreement between Acme LLC and Beta Corp.
Scope: monthly marketing support.
Payment: $5,000 per month.
Term: 12 months.
California law governs.`;

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

describe("starterComplexityGate", () => {
  it("gates Test371 quadrpartite labeled intake", () => {
    const gate = assessStarterComplexityGate(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties).toHaveLength(4);
    expect(gate.coordinatorName).toMatch(/Alex Morgan/i);
    expect(gate.keyTerms.length).toBeGreaterThan(0);
    expect(gate.hasRevenueShare).toBe(true);
    expect(gate.hasCoordinator).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });

  it("alias assessStarterMultiPartyProRequirement matches assessStarterComplexityGate", () => {
    expect(assessStarterMultiPartyProRequirement(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE).required).toBe(true);
  });

  it("does not gate ordinary two-party commercial intake", () => {
    const gate = assessStarterComplexityGate(TWO_PARTY_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.parties.length).toBeLessThanOrEqual(2);
  });

  it("detects revenue share language in Test371 intake", () => {
    expect(detectRevenueShareLanguage(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE)).toBe(true);
  });

  it("Pro checkout pending draft preserves four labeled parties without corrupted parse names", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(pending.parties).toHaveLength(4);
    expect(pending.parties.map((p) => p.name)).toContain("Pioneer Freight Solutions LLC");
    expect(pending.parties.map((p) => p.name)).not.toContain("SOFTWARE PLATFORM AGREEMENT");
    expect(pending.parties.map((p) => p.name)).not.toContain("licensing revenue will be shared");
  });

  it("free preview from Pro pending path must not surface corrupted party strings", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    const preview = buildAgreementPreviewText(pending, { starterPreview: true });
    expect(preview).not.toMatch(/SOFTWARE PLATFORM AGREEMENT/);
    expect(preview).not.toMatch(/licensing revenue will be shared/i);
  });

  it("two-party labeled blocks do not gate when no complexity signals", () => {
    const intake = `Party 1
Legal Entity: Acme LLC
Signer Name: Jane Doe

Party 2
Legal Entity: Beta Corp
Signer Name: John Smith

Scope: software support. Texas law governs.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(false);
  });

  it("coordinator block with two labeled parties gates free starter", () => {
    const intake = `Party 1
Legal Entity: Acme LLC
Signer Name: Jane Doe

Party 2
Legal Entity: Beta Corp
Signer Name: John Smith

Coordinator
Name: Pat Lee

Scope: joint venture coordination.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("coordinator_or_non_party_actor");
  });

  it("gates review workflow language", () => {
    const intake = `Agreement between Acme LLC and Beta Corp.
Both parties will use a review link and approval workflow before signing.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("review_approval_workflow");
  });

  it("gates joint venture structure with multiple parties", () => {
    const intake = `Party 1
Legal Entity: Alpha LLC
Signer Name: Alex

Party 2
Legal Entity: Beta LLC
Signer Name: Blake

Party 3
Legal Entity: Gamma LLC
Signer Name: Casey

Joint venture implementation partnership with multi-vendor fees.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });
});

describe("Test375 role-label two-party free starter", () => {
  it("allows Client/Service Provider labeled intake with monthly payment", () => {
    const gate = assessStarterComplexityGate(TEST375_ROLE_LABEL_TWO_PARTY_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.partyCount).toBe(2);
    expect(gate.parties).toHaveLength(2);
    expect(gate.parties).toEqual(
      expect.arrayContaining(["Blue Canyon Analytics LLC", "Harbor Peak Automation LLC"]),
    );
    expect(gate.hasMultiProviderPayment).toBe(false);
  });

  it("renders a simple two-party free starter draft from Test375 intake", () => {
    const draft = runIntakeDefaultsAndRoles(
      {
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: EMPTY_PAYMENT,
      },
      TEST375_ROLE_LABEL_TWO_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(assessStarterComplexityGate(TEST375_ROLE_LABEL_TWO_PARTY_INTAKE).required).toBe(false);
    expect(draft.parties.length).toBeGreaterThanOrEqual(2);
    const preview = buildAgreementPreviewText(draft, { starterPreview: true });
    expect(preview.length).toBeGreaterThan(200);
    expect(preview).toMatch(/Blue Canyon Analytics LLC/i);
    expect(preview).toMatch(/Harbor Peak Automation LLC/i);
  });

  it("does not gate generic monthly payment when party count is unresolved", () => {
    const intake = `Scope: consulting services.
Monthly payment.
12 month term.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(0);
    expect(gate.reasons).not.toContain("multi_provider_payment");
  });

  it("still gates revenue share with two parties", () => {
    const intake = `Client:
Acme LLC

Service Provider:
Beta Corp

Revenue share: 20% of licensing revenue to Beta Corp.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("revenue_share_or_allocation");
    expect(gate.partyCount).toBe(2);
  });
});

const UNNAMED_THREE_PARTY_NUMERIC =
  "Provide an NDA for 3 parties using Texas law for proprietary IP for the statutory limit";
const UNNAMED_THREE_PARTY_WORD = "Provide an NDA for three parties using Texas law for proprietary IP";

describe("explicit unnamed three-party Pro gate", () => {
  it("numeric 'for 3 parties' prompt resolves to three-party Pro gating", () => {
    const gate = assessStarterComplexityGate(UNNAMED_THREE_PARTY_NUMERIC);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(gate.partyCount).toBe(3);
    expect(isThreePlusLegalPartyGate(gate)).toBe(true);
    expect(resolveStarterMultiPartyProGatePresentation(gate).title).toBe(
      "This agreement includes 3 parties and requires Pro.",
    );
  });

  it("word-form 'for three parties' resolves to the same Pro gate", () => {
    const gate = assessStarterComplexityGate(UNNAMED_THREE_PARTY_WORD);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(isThreePlusLegalPartyGate(gate)).toBe(true);
  });

  it("unnamed parties stay actionable and never create a two-party review", () => {
    const gate = assessStarterComplexityGate(UNNAMED_THREE_PARTY_NUMERIC);
    expect(gate.parties.length).toBeLessThan(2);
    expect(gate.parties).not.toEqual(expect.arrayContaining(["Acme LLC", "Beta Corp"]));
    const pending = buildStarterProCheckoutPendingDraft(UNNAMED_THREE_PARTY_NUMERIC);
    expect(pending.parties.filter((p) => String(p.name || "").trim()).length).toBeLessThan(2);
  });

  it("empty-authority preparation cannot spin indefinitely", () => {
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "preparing_review",
        isGenerating: false,
        hasDraft: false,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + 8_000,
      }),
    ).toBe(true);
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "preparing_review",
        isGenerating: true,
        hasDraft: false,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + 60_000,
      }),
    ).toBe(false);
    expect(
      shouldFailSafeEmptyAuthorityPreparation({
        displayPhase: "preparing_review",
        isGenerating: false,
        hasDraft: true,
        hasAuthoritativeReviewBody: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + 8_000,
      }),
    ).toBe(false);
    expect(CREATE_FLOW_PREPARATION_FAILSAFE_MESSAGE).toBe(
      "We couldn't prepare the review. Add the party names and try again.",
    );
  });

  it("create intake applies the explicit multi-party Pro gate before capability or generation", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const homeIdx = intake.indexOf('handoffSource: "home_create_submit"');
    const homeBlock = intake.slice(Math.max(0, homeIdx - 2500), homeIdx);
    expect(homeBlock.indexOf("commitStarterMultiPartyProGate")).toBeGreaterThan(-1);
    expect(homeBlock.indexOf("commitStarterMultiPartyProGate")).toBeLessThan(
      homeBlock.indexOf("evaluateIntentionalCreateDraftSubmit"),
    );
    expect(intake).toContain("shouldFailSafeEmptyAuthorityPreparation");
    expect(intake).toContain("CREATE_FLOW_PREPARATION_FAILSAFE_MESSAGE");
    expect(intake).toContain('data-testid="create-flow-prep-failsafe"');
  });
});

describe("starterComplexityGate two-party regression", () => {
  it("runIntakeDefaultsAndRoles on two-party intake still produces two parties", () => {
    const draft = runIntakeDefaultsAndRoles(
      {
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: EMPTY_PAYMENT,
      },
      TWO_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(assessStarterComplexityGate(TWO_PARTY_INTAKE).required).toBe(false);
    expect(draft.parties.length).toBeGreaterThanOrEqual(2);
    expect(draft.parties.length).toBeLessThanOrEqual(2);
  });
});

describe("casual dump starter complexity gate", () => {
  const FREE: string[] = [
    "Sarah will photograph our wedding on June 12. We agreed $1800 cash.",
    "nda between me and Jordan about the app idea",
    "can you write something for my lawn guy Luis, he starts monday",
    "me and Priya are splitting the etsy shop 50/50",
    "I sold my bike to Taylor for $200 cash",
    "pay Riley $40 a week to walk the dog",
    "I hired Mike to paint my office. We shook on it.",
    "deal with Sam",
    "need someone to fix the broken fence",
    "Hire Alex to build our shopify theme, $3k, two weeks",
    "Consulting for Red Mesa LLC, I am Anthem, they pay monthly",
  ];

  it.each(FREE)("required is false for casual two-party / scoped dump: %s", (dump) => {
    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(false);
    expect(gate.reasons).not.toContain("not_simple_two_party_deal");
  });

  it.each([
    "my dog is named Biscuit and the trucks are teal",
    "lol just testing this, pizza is great",
    "I need a contract",
    "I just want an nda",
  ])("stays gated as not a simple two-party deal: %s", (dump) => {
    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("not_simple_two_party_deal");
  });

  it("joint venture with four named entities stays multi-party gated", () => {
    const dump =
      "Joint venture between Acme LLC, Beta Inc, Gamma Partners, and Delta Holdings. Pool $2 million, 5 year term, New York law.";
    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(true);
    expect(
      gate.reasons.some((r) =>
        r === "three_plus_legal_parties" || r === "joint_venture_or_multi_vendor_structure",
      ),
    ).toBe(true);
    expect(gate.reasons).not.toContain("not_simple_two_party_deal");
  });
});

describe("visitor plus one named party free gate", () => {
  const FREE: Array<[string, string[]]> = [
    [
      "Red Mesa will redo my kitchen cabinets next month. We haven't talked money.",
      ["Red Mesa"],
    ],
    [
      "Jordan Hale hiring Pine Street Media LLC",
      ["Jordan Hale", "Pine Street Media LLC"],
    ],
    [
      "I'm Jordan Hale hiring Pine Street Media LLC",
      ["Jordan Hale", "Pine Street Media LLC"],
    ],
    ["my neighbor Priya is going to dogsit", ["Priya"]],
    ["Alex will mow my lawn", ["Alex"]],
  ];

  it.each(FREE)("does not gate visitor + named counterparty: %s", (dump, names) => {
    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(false);
    expect(gate.reasons).not.toContain("not_simple_two_party_deal");
    expect(gate.reasons).not.toContain("three_plus_legal_parties");
    for (const name of names) {
      expect(gate.parties.join(" ")).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    const lines = formatStarterMultiPartyGatePartyLines(gate.parties);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" ")).not.toMatch(/Multiple parties detected/i);
    expect(resolveStarterMultiPartyProGatePresentation(gate).title).not.toBe(
      NOT_SIMPLE_TWO_PARTY_PRO_GATE_TITLE,
    );
  });

  it("junk control still gates as not a free two-party deal", () => {
    const dump = "lol just testing this, pizza is great";
    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("not_simple_two_party_deal");
    expect(resolveStarterMultiPartyProGatePresentation(gate).title).toBe(
      NOT_SIMPLE_TWO_PARTY_PRO_GATE_TITLE,
    );
  });
});
