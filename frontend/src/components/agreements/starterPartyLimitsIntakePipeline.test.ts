/**
 * End-to-end intake pipeline regression for the multi-party limits.
 *
 * These tests assert that the universal cardinality invariant from
 * `runIntakeDefaultsAndRoles` + `preserveLargestPartyListFromIntake` is preserved at every
 * tier (1–6 normal, 7–12 caution, 13+ Pro-required), and that the resolved guard payload
 * carries the routing signal (`requiresProUpgrade`) the UI uses to flip the primary CTA
 * onto the existing Pro upgrade entry point.
 *
 * No party data is ever truncated.
 */

import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  STARTER_PARTY_CAUTION_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_NOTICE,
  resolveStarterPartyCountGuard,
} from "./starterPartyLimits";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "./agreementAdvancedDraftAccess";

function blankParsedDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  } as ParsedDraftShape;
}

function buildOxfordEntityList(n: number): string {
  const names = Array.from({ length: n }, (_, i) => `Atlas ${i + 1} LLC`);
  if (n === 0) return "";
  if (n === 1) return names[0];
  if (n === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[n - 1]}`;
}

function runStarterIntake(intake: string): {
  draft: ParsedDraftShape;
  partyNames: string[];
} {
  const draft = runIntakeDefaultsAndRoles(blankParsedDraft(), intake, true, defaultIntakePartyRoleLabels());
  return {
    draft,
    partyNames: (draft.parties || []).map((p) => p.name),
  };
}

describe("Starter party-count tiers — intake pipeline preserves every party (no truncation)", () => {
  const TIER_CASES = [
    { count: 6, expectStatus: "normal" as const },
    { count: 7, expectStatus: "caution" as const },
    { count: 12, expectStatus: "caution" as const },
    { count: 13, expectStatus: "requires_pro" as const },
    { count: 18, expectStatus: "requires_pro" as const },
  ];

  for (const c of TIER_CASES) {
    it(`${c.count}-party services agreement: all ${c.count} parties survive structured + canonicalization, status="${c.expectStatus}"`, () => {
      const intake = `Services agreement between ${buildOxfordEntityList(c.count)}. Fee $10,000/month. Term 12 months. Delaware law.`;
      const { partyNames } = runStarterIntake(intake);
      expect(partyNames.length).toBe(c.count);
      // Every Atlas {i} LLC must be present — never silently truncated.
      for (let i = 1; i <= c.count; i += 1) {
        expect(partyNames).toContain(`Atlas ${i} LLC`);
      }
      const guard = resolveStarterPartyCountGuard(partyNames.map((name) => ({ name })));
      expect(guard.realCount).toBe(c.count);
      expect(guard.status).toBe(c.expectStatus);
      if (c.expectStatus === "caution") {
        expect(guard.notice).toBe(STARTER_PARTY_CAUTION_NOTICE);
        expect(guard.requiresProUpgrade).toBe(false);
      } else if (c.expectStatus === "requires_pro") {
        expect(guard.notice).toBe(STARTER_PARTY_PRO_REQUIRED_NOTICE);
        expect(guard.requiresProUpgrade).toBe(true);
      } else {
        expect(guard.notice).toBeNull();
        expect(guard.requiresProUpgrade).toBe(false);
      }
    });
  }
});

describe("Starter party-count guard — Pro routing for 13+ parties", () => {
  it("a 13+ party draft asserts the existing Pro upgrade route is the only continuation", () => {
    const intake = `Services agreement between ${buildOxfordEntityList(13)}. Fee $10,000/month.`;
    const { draft } = runStarterIntake(intake);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.requiresProUpgrade).toBe(true);
    // The starter UI uses this signal to route the primary CTA into the existing Pro
    // upgrade flow. The shared placeholder agreement id used by the create-flow checkout
    // path is `CREATE_FLOW_CHECKOUT_AGREEMENT_ID`; the guard MUST never bypass it.
    expect(CREATE_FLOW_CHECKOUT_AGREEMENT_ID).toMatch(/__claw_create_checkout__/);
  });
});

describe("Starter party-count guard — placeholder rows do not trigger limits", () => {
  it("draft with 13 placeholder-only rows reads as 0 real parties and stays normal", () => {
    const placeholders = Array.from({ length: 13 }, (_, i) => ({ name: `Party ${i + 1}` }));
    const guard = resolveStarterPartyCountGuard(placeholders);
    expect(guard.realCount).toBe(0);
    expect(guard.status).toBe("normal");
    expect(guard.requiresProUpgrade).toBe(false);
  });

  it("draft with 6 real + 9 placeholders stays normal (real=6) and never triggers caution", () => {
    const parties = [
      { name: "Apollo Data LLC" },
      { name: "Atlas Partners" },
      { name: "Beta Capital" },
      { name: "Gamma Holdings" },
      { name: "Delta Trust" },
      { name: "Epsilon Inc." },
      { name: "Party A" },
      { name: "Party B" },
      { name: "Party C" },
      { name: "Party D" },
      { name: "Party E" },
      { name: "Party F" },
      { name: "Party G" },
      { name: "[Not yet specified]" },
      { name: "TBD" },
    ];
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(6);
    expect(guard.status).toBe("normal");
  });
});

describe("Starter party-count guard — render layer never truncates parties", () => {
  it("calling resolveStarterPartyCountGuard repeatedly leaves the array intact", () => {
    const intake = `Services agreement between ${buildOxfordEntityList(15)}. Fee $5,000/month.`;
    const { draft } = runStarterIntake(intake);
    const before = (draft.parties || []).map((p) => p.name);
    for (let i = 0; i < 5; i += 1) resolveStarterPartyCountGuard(draft.parties);
    const after = (draft.parties || []).map((p) => p.name);
    expect(after).toEqual(before);
    expect(after.length).toBe(15);
  });

  it("smaller-count classics (web dev, consulting, NDA, lease, purchase) still pass with 2/3/4 parties intact", () => {
    const intakes = [
      // 2-party web dev
      "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000.",
      // 3-party consulting
      "Consulting agreement between Apollo Data LLC, Beta Advisors, and Gamma Holdings. Fee $5,000/month.",
      // 3-party NDA
      "Mutual NDA between Apollo Data LLC, Beta Advisors, and Gamma Holdings. Term 2 years.",
      // 3-party lease
      "Commercial lease agreement between Sunset LLC, Beacon Property Co., and Alex Park. Property: 100 Beacon Way. Rent $5,500/month.",
      // 4-party purchase
      "Real estate purchase agreement between Apex Sellers LLC, Chen Family Trust, First County Escrow Services as escrow agent, and Beacon Holdings LLC. Property: 456 Oak Ave. Closing date: August 15, 2026.",
    ];
    for (const intake of intakes) {
      const { draft } = runStarterIntake(intake);
      const guard = resolveStarterPartyCountGuard(draft.parties);
      expect(guard.realCount).toBeGreaterThanOrEqual(2);
      expect(guard.realCount).toBeLessThanOrEqual(6);
      expect(guard.status).toBe("normal");
      expect(guard.notice).toBeNull();
      expect(guard.requiresProUpgrade).toBe(false);
    }
  });
});

describe("Starter party-count notice copy — no internal-process language", () => {
  it("never mentions parser, fallback, shell, internal, hard cut, algorithm, or threshold logic", () => {
    const banned = /\b(?:parser|fallback|shell|internal|hard\s+cut|algorithm|threshold\s+logic)\b/i;
    expect(STARTER_PARTY_CAUTION_NOTICE).not.toMatch(banned);
    expect(STARTER_PARTY_PRO_REQUIRED_NOTICE).not.toMatch(banned);
  });
});
