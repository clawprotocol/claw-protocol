/**
 * Unit tests for the starter / free party-count limits utility.
 *
 * Covers:
 *   • Threshold mapping (1–6 normal, 7–12 caution, 13+ requires_pro).
 *   • Public copy constants — no internal-process language.
 *   • Placeholder-name detection (placeholders never count toward limits).
 *   • `resolveStarterPartyCountGuard` returns a frozen, read-only payload that does NOT
 *     mutate / truncate the input array.
 *   • Routing guarantee for the 13+ state surfaces via `requiresProUpgrade`.
 */

import { describe, expect, it } from "vitest";

import {
  STARTER_NORMAL_PARTY_LIMIT,
  STARTER_PARTY_CAUTION_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_NOTICE,
  STARTER_PRO_REVIEW_PARTY_THRESHOLD,
  countRealParties,
  getStarterPartyCountNotice,
  getStarterPartyCountStatus,
  isPlaceholderPartyName,
  resolveStarterPartyCountGuard,
} from "./starterPartyLimits";

const realParty = (name: string) => ({ name });
const fillParties = (n: number, prefix = "Acme"): { name: string }[] =>
  Array.from({ length: n }, (_, i) => realParty(`${prefix} ${i + 1} LLC`));

describe("starterPartyLimits — constants", () => {
  it("hard thresholds match the published policy", () => {
    expect(STARTER_NORMAL_PARTY_LIMIT).toBe(6);
    expect(STARTER_PRO_REVIEW_PARTY_THRESHOLD).toBe(13);
  });

  it("public copy never references internal-process language", () => {
    const banned = /\b(?:parser|fallback|shell|internal|hard\s+cut|algorithm)\b/i;
    expect(STARTER_PARTY_CAUTION_NOTICE).not.toMatch(banned);
    expect(STARTER_PARTY_PRO_REQUIRED_NOTICE).not.toMatch(banned);
  });

  it("public copy mentions reviewing parties / Pro upgrade for the right states", () => {
    expect(STARTER_PARTY_CAUTION_NOTICE).toMatch(/review/i);
    expect(STARTER_PARTY_CAUTION_NOTICE).toMatch(/before sending/i);
    expect(STARTER_PARTY_PRO_REQUIRED_NOTICE).toMatch(/13\+/);
    expect(STARTER_PARTY_PRO_REQUIRED_NOTICE).toMatch(/LawDog Pro/);
  });
});

describe("getStarterPartyCountStatus", () => {
  it("0–6 parties → normal", () => {
    for (let n = 0; n <= 6; n += 1) {
      expect(getStarterPartyCountStatus(n)).toBe("normal");
    }
  });

  it("7 through 12 parties → caution", () => {
    for (let n = 7; n <= 12; n += 1) {
      expect(getStarterPartyCountStatus(n)).toBe("caution");
    }
  });

  it("13 and above → requires_pro", () => {
    for (const n of [13, 14, 20, 50, 100]) {
      expect(getStarterPartyCountStatus(n)).toBe("requires_pro");
    }
  });

  it("non-finite / negative inputs degrade safely to normal", () => {
    expect(getStarterPartyCountStatus(NaN)).toBe("normal");
    expect(getStarterPartyCountStatus(-1)).toBe("normal");
    // Non-finite (Infinity) is treated as the safe "normal" default rather than blocking
    // — the gate is data-driven, not a panic switch.
    expect(getStarterPartyCountStatus(Infinity)).toBe("normal");
  });

  it("getStarterPartyCountNotice mirrors the threshold map", () => {
    expect(getStarterPartyCountNotice("normal")).toBeNull();
    expect(getStarterPartyCountNotice("caution")).toBe(STARTER_PARTY_CAUTION_NOTICE);
    expect(getStarterPartyCountNotice("requires_pro")).toBe(STARTER_PARTY_PRO_REQUIRED_NOTICE);
  });
});

describe("isPlaceholderPartyName", () => {
  it("treats blank / generic / TBD rows as placeholders", () => {
    expect(isPlaceholderPartyName("")).toBe(true);
    expect(isPlaceholderPartyName("   ")).toBe(true);
    expect(isPlaceholderPartyName("Party A")).toBe(true);
    expect(isPlaceholderPartyName("party b")).toBe(true);
    expect(isPlaceholderPartyName("Party 3")).toBe(true);
    expect(isPlaceholderPartyName("Signer 2")).toBe(true);
    expect(isPlaceholderPartyName("Recipient")).toBe(true);
    expect(isPlaceholderPartyName("[Not yet specified]")).toBe(true);
    expect(isPlaceholderPartyName("Not yet specified")).toBe(true);
    expect(isPlaceholderPartyName("[TBD]")).toBe(true);
    expect(isPlaceholderPartyName("To be filled")).toBe(true);
    expect(isPlaceholderPartyName("Placeholder 1")).toBe(true);
    expect(isPlaceholderPartyName("Members of the LLC")).toBe(true);
  });

  it("treats real names / entities as non-placeholder", () => {
    expect(isPlaceholderPartyName("Apollo Data LLC")).toBe(false);
    expect(isPlaceholderPartyName("John Smith")).toBe(false);
    expect(isPlaceholderPartyName("First County Escrow Services")).toBe(false);
    expect(isPlaceholderPartyName("Beta Advisors")).toBe(false);
    expect(isPlaceholderPartyName("Smith Family Trust")).toBe(false);
  });
});

describe("countRealParties", () => {
  it("returns 0 for null/undefined/empty", () => {
    expect(countRealParties(null)).toBe(0);
    expect(countRealParties(undefined)).toBe(0);
    expect(countRealParties([])).toBe(0);
  });

  it("counts only non-placeholder rows", () => {
    const parties = [
      realParty("Apollo Data LLC"),
      { name: "Party A" },
      realParty("John Smith"),
      { name: "Party B" },
      realParty("Beta Advisors"),
    ];
    expect(countRealParties(parties)).toBe(3);
  });

  it("does not mutate the input array", () => {
    const parties = [
      realParty("Apollo Data LLC"),
      { name: "Party A" },
      realParty("John Smith"),
    ];
    const snapshot = parties.map((p) => ({ ...p }));
    countRealParties(parties);
    expect(parties).toEqual(snapshot);
  });
});

describe("resolveStarterPartyCountGuard — exact threshold cases (regression spec)", () => {
  it("6 real parties → no warning, no block", () => {
    const guard = resolveStarterPartyCountGuard(fillParties(6));
    expect(guard.realCount).toBe(6);
    expect(guard.status).toBe("normal");
    expect(guard.notice).toBeNull();
    expect(guard.requiresProUpgrade).toBe(false);
    expect(guard.showCaution).toBe(false);
  });

  it("7 real parties → caution, no block, all parties preserved", () => {
    const parties = fillParties(7);
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(7);
    expect(guard.totalCount).toBe(7);
    expect(guard.status).toBe("caution");
    expect(guard.notice).toBe(STARTER_PARTY_CAUTION_NOTICE);
    expect(guard.requiresProUpgrade).toBe(false);
    expect(guard.showCaution).toBe(true);
    // Non-mutation: array unchanged
    expect(parties.length).toBe(7);
  });

  it("12 real parties → caution, no block, all parties preserved", () => {
    const parties = fillParties(12);
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(12);
    expect(guard.status).toBe("caution");
    expect(guard.notice).toBe(STARTER_PARTY_CAUTION_NOTICE);
    expect(guard.requiresProUpgrade).toBe(false);
    expect(parties.length).toBe(12);
  });

  it("13 real parties → requires_pro, all parties preserved", () => {
    const parties = fillParties(13);
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(13);
    expect(guard.status).toBe("requires_pro");
    expect(guard.notice).toBe(STARTER_PARTY_PRO_REQUIRED_NOTICE);
    expect(guard.requiresProUpgrade).toBe(true);
    expect(guard.showCaution).toBe(false);
    expect(parties.length).toBe(13);
  });

  it("25 real parties → requires_pro, all parties preserved (no truncation)", () => {
    const parties = fillParties(25);
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(25);
    expect(guard.status).toBe("requires_pro");
    expect(guard.requiresProUpgrade).toBe(true);
    expect(parties.length).toBe(25);
  });
});

describe("resolveStarterPartyCountGuard — placeholder handling", () => {
  it("placeholder rows are NOT counted toward the limit (real=2 vs total=8)", () => {
    const parties = [
      realParty("Apollo Data LLC"),
      realParty("Atlas Partners"),
      { name: "Party A" },
      { name: "Party B" },
      { name: "Party C" },
      { name: "Party 4" },
      { name: "[Not yet specified]" },
      { name: "TBD" },
    ];
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.totalCount).toBe(8);
    expect(guard.realCount).toBe(2);
    expect(guard.status).toBe("normal");
    expect(guard.requiresProUpgrade).toBe(false);
  });

  it("a 13-row draft made entirely of placeholders does NOT trigger Pro-required", () => {
    const placeholders = Array.from({ length: 13 }, (_, i) => ({
      name: i % 2 === 0 ? `Party ${i + 1}` : "[Not yet specified]",
    }));
    const guard = resolveStarterPartyCountGuard(placeholders);
    expect(guard.realCount).toBe(0);
    expect(guard.status).toBe("normal");
  });

  it("13 real parties + a few placeholders still trips Pro-required", () => {
    const parties = [
      ...fillParties(13, "Real"),
      { name: "Party A" },
      { name: "Party B" },
    ];
    const guard = resolveStarterPartyCountGuard(parties);
    expect(guard.realCount).toBe(13);
    expect(guard.status).toBe("requires_pro");
    expect(guard.requiresProUpgrade).toBe(true);
  });
});

describe("resolveStarterPartyCountGuard — cardinality preservation invariant", () => {
  it("never truncates / replaces / reorders the party array", () => {
    const parties = fillParties(15);
    const before = parties.map((p) => p.name);
    resolveStarterPartyCountGuard(parties);
    resolveStarterPartyCountGuard(parties);
    const after = parties.map((p) => p.name);
    expect(after).toEqual(before);
    expect(parties.length).toBe(15);
  });

  it("requires_pro routing surfaces via requiresProUpgrade — UI uses this to force the existing Pro checkout entry point", () => {
    // 13+ parties must yield requiresProUpgrade=true; the rendering layer (AgreementBuilderIntake)
    // forces showUpgradeToFullDraftOnReview to true on this signal so the primary CTA flips
    // to `continue_basic_draft`, which calls `launchUpgradeCheckoutFromStarterDraft` →
    // `beginAdvancedFullDraftCheckout` → `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}`.
    const guard = resolveStarterPartyCountGuard(fillParties(13));
    expect(guard.requiresProUpgrade).toBe(true);
    expect(guard.notice).toMatch(/LawDog Pro/i);
  });
});
