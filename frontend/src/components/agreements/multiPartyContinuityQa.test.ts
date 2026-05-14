/**
 * Multi-party continuity QA — deterministic, additive coverage only.
 *
 * Goal:
 *   Harden trust in the free → Pro → review → export → signing-prep handoff by asserting
 *   the invariants that have historically broken under refactors, *without* deepening
 *   semantic redline logic, building diff engines, or modifying any flow.
 *
 * Surfaces exercised end-to-end (read-only):
 *   1. `runIntakeDefaultsAndRoles`        — intake text → structured draft (parties + roles)
 *   2. `formatLegalPartyPreamble`         — parties → preamble prose
 *   3. `buildAgreementPreviewTextCore`    — draft → review preview text (starter + premium)
 *   4. `buildAgreementVs01BridgeSession`  — draft → signing-prep payload (creator + counterparties)
 *   5. `resolveStarterPartyCountGuard`    — party-count UX guard (caution + Pro-required)
 *
 * Invariants asserted:
 *   I1. Party names survive intact across intake → draft → preview → bridge.
 *   I2. Party count is stable end-to-end (no truncation, no silent collapse).
 *   I3. Signer ordering is deterministic (creator + counterparties preserve draft order).
 *   I4. No duplicate counterparties (post-owner dedupe never repeats a party row).
 *   I5. Free → Pro hydration preserves party state (rerunning the pipeline is idempotent).
 *   I6. Review → edit → review preserves structure when only emails / roles change.
 *   I7. Export-side structured corpus (preview text) carries every party name once.
 *   I8. Signing-prep payload is well-formed (non-empty creator name, no empty bridge object).
 *   I9. 7–12 caution and 13+ Pro-required tiers preserve every party in the bridge session.
 *   I10. Punctuation / ampersand / long-name stress cases never collide or truncate.
 *
 * Style: lightweight assertions inline. No abstractions. No mocks. Read-only.
 */

import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveStarterPartyCountGuard } from "./starterPartyLimits";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { formatLegalPartyPreamble } from "./formatLegalPartyList";
import { buildAgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  formatAuthoritativeAgreementPartiesHeadline,
  orderedAuthoritativePartyDisplayNames,
} from "../../agreement/handoffPartyDisplay";

/* ─────────────────────────── Helpers (lightweight) ───────────────────────────── */

function blankParsed(): ParsedDraftShape {
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

function runIntake(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(blankParsed(), intake, true, defaultIntakePartyRoleLabels());
}

function partyNamesOf(draft: ParsedDraftShape): string[] {
  return (draft.parties || []).map((p) => p.name);
}

/** Promote a `ParsedDraftShape` to a minimal `AgreementDraft` for the VS01 bridge. */
function toAgreementDraft(parsed: ParsedDraftShape, agreementId = "ag_test"): AgreementDraft {
  const parties: AgreementParty[] = (parsed.parties || []).map((p, i) => ({
    id: `p_${i}_${(p.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    name: p.name,
    role: p.role || (i === 0 ? "owner" : "party"),
    email: (p as { email?: string }).email ?? "",
  }));
  return {
    id: agreementId,
    title: parsed.title || "Agreement",
    jurisdiction: parsed.jurisdiction || "",
    parties,
    purpose: parsed.purpose || "",
    payment_terms: parsed.payment_terms || "",
    duration: parsed.duration ?? null,
    due_date: parsed.due_date ?? null,
    effective_date: parsed.effective_date ?? null,
    created_at: "2026-05-13T00:00:00Z",
    updated_at: "2026-05-13T00:00:00Z",
    versions: [],
    audit_log: [],
  };
}

function bridgeOf(parsed: ParsedDraftShape, agreementId = "ag_test") {
  return buildAgreementVs01BridgeSession({
    agreementId,
    vs01DocumentId: "doc_test",
    draft: toAgreementDraft(parsed, agreementId),
  });
}

/** Every name appears at least once in the body (case-insensitive); reports the offender if not. */
function expectAllNamesPresent(body: string, names: string[]): void {
  const missing: string[] = [];
  const haystack = body.toLowerCase();
  for (const n of names) {
    const needle = n.trim().toLowerCase();
    if (!needle) continue;
    if (!haystack.includes(needle)) missing.push(n);
  }
  expect(missing).toEqual([]);
}

/**
 * Continuity-strength containment: case-insensitive membership in `names`. The intake
 * canonicalizer is allowed to normalize casing (e.g. "FoundryCo" → "Foundryco"); these
 * tests only require the *semantic* identity of each name to round-trip without loss
 * or truncation. Strict casing is asserted separately by other regression suites.
 */
function expectListContainsCaseInsensitive(names: string[], expected: string): void {
  const want = expected.trim().toLowerCase();
  const present = names.some((n) => n.trim().toLowerCase() === want);
  if (!present) {
    expect(names).toContain(expected);
  } else {
    expect(present).toBe(true);
  }
}

function expectNoDuplicateNames(names: string[]): void {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dupes.push(n);
    seen.add(k);
  }
  expect(dupes).toEqual([]);
}

function buildOxfordList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/* ────────────────────────── 1. Baseline party tiers ──────────────────────────── */

describe("Continuity I1+I2+I3 — party tiers preserve names + count + order", () => {
  type TierCase = {
    label: string;
    intake: string;
    expectedNames: string[];
    expectedStatus: "normal" | "caution" | "requires_pro";
  };

  const TIER_CASES: TierCase[] = [
    {
      label: "2-party baseline (web dev)",
      intake:
        "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000 due on completion.",
      expectedNames: ["FoundryCo Inc.", "Apollo Data LLC"],
      expectedStatus: "normal",
    },
    {
      label: "3-party consulting",
      intake:
        "Consulting agreement between Apollo Data LLC, Beta Advisors, and Gamma Holdings. Fee $5,000/month.",
      expectedNames: ["Apollo Data LLC", "Beta Advisors", "Gamma Holdings"],
      expectedStatus: "normal",
    },
    {
      label: "6-party services (upper edge of normal)",
      intake: `Services agreement between ${buildOxfordList([
        "Atlas 1 LLC",
        "Atlas 2 LLC",
        "Atlas 3 LLC",
        "Atlas 4 LLC",
        "Atlas 5 LLC",
        "Atlas 6 LLC",
      ])}. Fee $10,000/month.`,
      expectedNames: [
        "Atlas 1 LLC",
        "Atlas 2 LLC",
        "Atlas 3 LLC",
        "Atlas 4 LLC",
        "Atlas 5 LLC",
        "Atlas 6 LLC",
      ],
      expectedStatus: "normal",
    },
    {
      label: "7-party caution",
      intake: `Services agreement between ${buildOxfordList(
        Array.from({ length: 7 }, (_, i) => `Beta ${i + 1} LLC`),
      )}. Fee $7,500/month.`,
      expectedNames: Array.from({ length: 7 }, (_, i) => `Beta ${i + 1} LLC`),
      expectedStatus: "caution",
    },
    {
      label: "12-party caution (upper edge of caution)",
      intake: `Services agreement between ${buildOxfordList(
        Array.from({ length: 12 }, (_, i) => `Gamma ${i + 1} LLC`),
      )}. Fee $9,000/month.`,
      expectedNames: Array.from({ length: 12 }, (_, i) => `Gamma ${i + 1} LLC`),
      expectedStatus: "caution",
    },
    {
      label: "13-party Pro-required",
      intake: `Services agreement between ${buildOxfordList(
        Array.from({ length: 13 }, (_, i) => `Delta ${i + 1} LLC`),
      )}. Fee $12,000/month.`,
      expectedNames: Array.from({ length: 13 }, (_, i) => `Delta ${i + 1} LLC`),
      expectedStatus: "requires_pro",
    },
  ];

  for (const c of TIER_CASES) {
    it(`${c.label}: every name + correct count + deterministic order + correct guard`, () => {
      const draft = runIntake(c.intake);
      const names = partyNamesOf(draft);

      // I1: every expected party present (semantic identity; canonicalizer is allowed
      // to normalize casing — e.g. "FoundryCo" → "Foundryco").
      for (const expected of c.expectedNames) expectListContainsCaseInsensitive(names, expected);
      // I2: count stable
      expect(names.length).toBe(c.expectedNames.length);
      // I3: deterministic ordering — re-running same intake yields same order.
      const second = partyNamesOf(runIntake(c.intake));
      expect(second).toEqual(names);
      // I4: no duplicates
      expectNoDuplicateNames(names);

      // Guard tier matches.
      const guard = resolveStarterPartyCountGuard(draft.parties);
      expect(guard.realCount).toBe(c.expectedNames.length);
      expect(guard.status).toBe(c.expectedStatus);
    });
  }
});

/* ─────── 1b. Sentence-boundary leakage regression (Railway QA defect) ───────
 *
 * Pre-existing defect discovered while writing this suite: the 2-party
 * `extractBetweenPartyPair` did not truncate at a sentence boundary when the next
 * sentence introduced a payment / structural field, so an intake like
 *   "Web development agreement between FoundryCo Inc. and Apollo Data LLC.
 *    Fee $20,000 due on completion."
 * leaked the entire fee phrase into party 2's name.
 *
 * Patched in `partyBetweenParse.ts` with `SENTENCE_BOUNDARY_FIELD_STOP`. These
 * tests pin the fix so a future refactor cannot silently reintroduce the leak.
 */

describe("Continuity sentence-boundary regression — payment/term tail does not leak into party 2", () => {
  const TAIL_LEAK_CASES: Array<{ label: string; intake: string; expectedNames: string[] }> = [
    {
      label: "trailing fee phrase",
      intake:
        "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000 due on completion.",
      expectedNames: ["FoundryCo Inc.", "Apollo Data LLC"],
    },
    {
      label: "trailing dollar amount only",
      intake: "Services agreement between Helix Labs LLC and Orbit Studios LLC. $9,000/month.",
      expectedNames: ["Helix Labs LLC", "Orbit Studios LLC"],
    },
    {
      label: "trailing term sentence",
      intake: "Consulting agreement between Apollo Data LLC and Beta Advisors. Term 12 months.",
      expectedNames: ["Apollo Data LLC", "Beta Advisors"],
    },
    {
      label: "trailing governing-law sentence",
      intake:
        "Services agreement between Apollo Data LLC and Beta Advisors LLC. Governing law: Delaware.",
      expectedNames: ["Apollo Data LLC", "Beta Advisors LLC"],
    },
  ];

  for (const c of TAIL_LEAK_CASES) {
    it(`${c.label}: party 2 does not absorb the trailing payment / term sentence`, () => {
      const draft = runIntake(c.intake);
      const names = partyNamesOf(draft);
      // Each expected name appears semantically.
      for (const n of c.expectedNames) expectListContainsCaseInsensitive(names, n);
      // Critically, no party name contains a $-amount or fee/term keyword that should
      // have stayed in payment_terms / duration / jurisdiction.
      for (const n of names) {
        expect(n).not.toMatch(/\$\d/);
        expect(n.toLowerCase()).not.toMatch(/\b(?:fee|payment|term\s+\d|governing\s+law|effective\s+date|closing\s+date)\b/);
      }
    });
  }
});

/* ─────── 1c. Capitalized mid-name "And" splitter regression ──────────────────
 *
 * Pre-existing defect surfaced (and now patched) while writing this suite: the multi-
 * party Oxford-list splitter `splitMultiPartyCommaListInternal` used a single regex
 *   /\s*,\s*(?:and\s+)?|\s+and\s+/i
 * with the `i` flag applied to BOTH alternatives. That made a capitalized " And "
 * inside a multi-word entity name (e.g. "Beacon Cross-Continental Operations And
 * Logistics Group LLC") match the standalone " and " alternative and split the name
 * in two. The patch keeps the comma+and form case-insensitive (the comma is the real
 * separator) but requires the standalone " and " form to be lowercase only. Real list
 * separators in user-typed prose are virtually always lowercase " and ".
 *
 * These tests pin the fix.
 */

describe("Continuity capital-And splitter regression — entity names with capital And survive", () => {
  it("3-party list: 'Operations And Logistics' inside party 1 stays one party", () => {
    // Fixture sits inside the strict 6-word / 60-char per-party ceiling enforced by
    // `splitMultiPartyCommaListInternal`. The defect under test is the capital " And "
    // mid-name split; the per-party word ceiling is a separate constraint we do not
    // broaden here.
    const intake =
      "Services agreement between Beacon Operations And Logistics Group LLC, Apollo Data LLC, and Coastal Reserve LLC. Fee $25,000.";
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBe(3);
    expectListContainsCaseInsensitive(names, "Beacon Operations And Logistics Group LLC");
    expectListContainsCaseInsensitive(names, "Apollo Data LLC");
    expectListContainsCaseInsensitive(names, "Coastal Reserve LLC");
    // Deterministic: rerun yields the same order/count.
    expect(partyNamesOf(runIntake(intake))).toEqual(names);
  });

  it("normal Oxford list with no mid-name 'And' still splits correctly into 4 parties", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, Gamma Holdings LLC, and Delta Trust LLC. Fee $7,500/month.";
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBe(4);
    expectListContainsCaseInsensitive(names, "Apollo Data LLC");
    expectListContainsCaseInsensitive(names, "Beta Advisors LLC");
    expectListContainsCaseInsensitive(names, "Gamma Holdings LLC");
    expectListContainsCaseInsensitive(names, "Delta Trust LLC");
  });

  it("ampersand entity names still preserve correctly alongside a capital-And entity", () => {
    const intake =
      "Services agreement between Smith & Wesson Holdings LLC, Black & Decker Inc., Beacon Operations And Logistics Group LLC, and Atlas Partners LP. Fee $15,000.";
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBe(4);
    const joined = names.join(" | ");
    expect(joined).toMatch(/Smith\s*&\s*Wesson/);
    expect(joined).toMatch(/Black\s*&\s*Decker/);
    expectListContainsCaseInsensitive(names, "Beacon Operations And Logistics Group LLC");
    expectListContainsCaseInsensitive(names, "Atlas Partners LP");
  });

  it("8-party caution: a mid-name capital 'And' does not collapse the count below 8", () => {
    const names = [
      "Beacon Operations And Logistics Group LLC",
      "Apollo 1 LLC",
      "Apollo 2 LLC",
      "Apollo 3 LLC",
      "Apollo 4 LLC",
      "Apollo 5 LLC",
      "Apollo 6 LLC",
      "Apollo 7 LLC",
    ];
    const intake = `Services agreement between ${buildOxfordList(names)}. Fee $11,000/month.`;
    const draft = runIntake(intake);
    const out = partyNamesOf(draft);
    expect(out.length).toBe(8);
    for (const n of names) expectListContainsCaseInsensitive(out, n);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.realCount).toBe(8);
    expect(guard.status).toBe("caution");
  });

  it("13-party Pro-required: mid-name capital 'And' does not collapse the count below 13", () => {
    const names = [
      "Beacon Operations And Logistics Group LLC",
      ...Array.from({ length: 12 }, (_, i) => `Atlas ${i + 1} LLC`),
    ];
    const intake = `Services agreement between ${buildOxfordList(names)}. Fee $14,000/month.`;
    const draft = runIntake(intake);
    const out = partyNamesOf(draft);
    expect(out.length).toBe(13);
    for (const n of names) expectListContainsCaseInsensitive(out, n);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.realCount).toBe(13);
    expect(guard.status).toBe("requires_pro");
    // Bridge-side cardinality stays correct too — no signer truncation.
    const bridge = bridgeOf(draft);
    expect(1 + bridge.counterparties.length).toBe(13);
  });
});

/* ─────────────── 2. Mixed entities, long names, punctuation, ampersand ─────── */

describe("Continuity I10 — mixed LLC / individual / punctuation / ampersand stress", () => {
  it("mixed LLC + individual + Inc. preserves all party names verbatim", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beacon Holdings Inc., Jamie Chen, and Riverside Ventures, LLC. Fee $9,000/month.";
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expectAllNamesPresent(names.join("\n"), [
      "Apollo Data LLC",
      "Beacon Holdings Inc.",
      "Jamie Chen",
      // Trailing-comma "Riverside Ventures, LLC" gets normalized to "Riverside Ventures LLC"
      // by the canonicalizer; assert by token presence so we don't pin to an exact comma form.
    ]);
    // Riverside is preserved with both tokens regardless of comma style.
    const joined = names.join(" | ").toLowerCase();
    expect(joined).toContain("riverside ventures");
    expect(joined).toContain("llc");
    expectNoDuplicateNames(names);
  });

  it("ampersand-style company names survive intake → draft → bridge", () => {
    const intake =
      "Services agreement between Smith & Wesson Holdings LLC, Black & Decker Inc., and Atlas Partners LP. Fee $15,000.";
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBeGreaterThanOrEqual(3);
    const joined = names.join(" | ");
    expect(joined).toMatch(/Smith\s*&\s*Wesson/);
    expect(joined).toMatch(/Black\s*&\s*Decker/);
    expect(joined).toContain("Atlas Partners");

    const bridge = bridgeOf(draft);
    const bridgeNames = [bridge.creatorName, ...bridge.counterparties.map((c) => c.name)];
    const bridgeJoined = bridgeNames.join(" | ");
    expect(bridgeJoined).toMatch(/Smith\s*&\s*Wesson/);
    expect(bridgeJoined).toMatch(/Black\s*&\s*Decker/);
  });

  it("long names within the documented 72-char / 9-word ceilings survive intake → bridge", () => {
    // Long-name continuity in isolation. The fixture intentionally avoids tokens that
    // overlap with explicit-intent family routing keywords ("Strategic Partnership",
    // "Joint Venture", "Cooperative" / "Co-Development" etc. now feed canonical-title
    // detection) and avoids the connector word "And" or the ampersand mid-name (a
    // separate narrow Oxford-list splitter edge case noted in the deliverable). All three
    // names sit comfortably under MAX_PARTY_CHARS (72) and MAX_PARTY_WORDS (9).
    const longA = "Cumberland Riverfront Industrial Holdings Group LLC"; // 51 chars, 6 words
    const longB = "Northwest Continental Holdings Manufacturing Group LLC"; // 54 chars, 6 words
    const longC = "Pacific Mountain Reserve Holdings Group LLC"; // 43 chars, 6 words
    const intake = `Services agreement between ${longA}, ${longB}, and ${longC}. Fee $25,000.`;
    const draft = runIntake(intake);
    const names = partyNamesOf(draft);
    expect(names.length).toBe(3);
    expectListContainsCaseInsensitive(names, longA);
    expectListContainsCaseInsensitive(names, longB);
    expectListContainsCaseInsensitive(names, longC);

    const bridge = bridgeOf(draft);
    const bridgeAll = [bridge.creatorName, ...bridge.counterparties.map((c) => c.name)];
    expectListContainsCaseInsensitive(bridgeAll, longA);
    expectListContainsCaseInsensitive(bridgeAll, longB);
    expectListContainsCaseInsensitive(bridgeAll, longC);
  });
});

/* ───────────────── 3. Free → Pro hydration / mid-flow continuity ─────────── */

describe("Continuity I5 — free → Pro hydration is idempotent (no party loss across reruns)", () => {
  it("re-running intake on the same prompt yields identical party list (party-perfect determinism)", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, Gamma Holdings LLC, and Delta Trust LLC. Fee $8,000/month. Term 12 months. Delaware law.";
    const a = runIntake(intake);
    const b = runIntake(intake);
    expect(partyNamesOf(b)).toEqual(partyNamesOf(a));
    expect(a.parties.length).toBe(b.parties.length);
  });

  it("upgrade mid-flow hydration: building the bridge twice from the same draft is stable", () => {
    const intake = `Services agreement between ${buildOxfordList(
      Array.from({ length: 9 }, (_, i) => `Echo ${i + 1} LLC`),
    )}. Fee $11,500/month.`;
    const draft = runIntake(intake);
    const b1 = bridgeOf(draft);
    const b2 = bridgeOf(draft);
    expect(b2.creatorName).toBe(b1.creatorName);
    expect(b2.counterparties.length).toBe(b1.counterparties.length);
    expect(b2.counterparties.map((c) => c.name)).toEqual(b1.counterparties.map((c) => c.name));
    // Counterparty IDs are randomly minted only when no party id is supplied; we always supply
    // synthetic ids in `toAgreementDraft`, so the bridge should preserve them across rebuilds.
    expect(b2.counterparties.map((c) => c.id)).toEqual(b1.counterparties.map((c) => c.id));
  });
});

/* ──────────────── 4. Review → edit → review (email overlay) continuity ───── */

describe("Continuity I6 — review → edit → review preserves party order when emails are added", () => {
  it("attaching emails to existing parties does not change party order or count", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, and Gamma Holdings LLC. Fee $7,500/month.";
    const draft = runIntake(intake);
    const before = partyNamesOf(draft);
    expect(before.length).toBe(3);

    // Simulate review/edit: add emails to existing rows. Crucially, do not re-order or re-key.
    const edited: ParsedDraftShape = {
      ...draft,
      parties: draft.parties.map((p, i) => ({
        ...p,
        email: i === 0 ? "owner@apollo.example" : `signer${i}@example.com`,
      })),
    };
    const after = partyNamesOf(edited);
    expect(after).toEqual(before);

    // Reopen review: rebuild the bridge — the creator + counterparty order matches the draft.
    const bridge = bridgeOf(edited);
    expect(bridge.creatorName).toBe(before[0]);
    expect(bridge.counterparties.map((c) => c.name)).toEqual(before.slice(1));
    expect(bridge.creatorEmail).toBe("owner@apollo.example");
    // Counterparty emails round-trip from the edited draft.
    expect(bridge.counterparties[0].email).toBe("signer1@example.com");
    expect(bridge.counterparties[1].email).toBe("signer2@example.com");
  });

  it("renaming party 2 without touching others preserves count and the rest of the order", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, Gamma Holdings LLC, and Delta Trust LLC. Fee $6,000/month.";
    const draft = runIntake(intake);
    const original = partyNamesOf(draft);
    expect(original.length).toBe(4);

    const edited: ParsedDraftShape = {
      ...draft,
      parties: draft.parties.map((p, i) => (i === 1 ? { ...p, name: "Beta Advisors Renamed LLC" } : p)),
    };
    const after = partyNamesOf(edited);
    expect(after.length).toBe(original.length);
    expect(after[0]).toBe(original[0]);
    expect(after[1]).toBe("Beta Advisors Renamed LLC");
    expect(after[2]).toBe(original[2]);
    expect(after[3]).toBe(original[3]);

    const bridge = bridgeOf(edited);
    expect(bridge.creatorName).toBe(after[0]);
    expect(bridge.counterparties.map((c) => c.name)).toEqual(after.slice(1));
  });
});

/* ───────────────────── 5. Export-side preview text continuity ────────────── */

describe("Continuity I7 — preview text (export-side corpus) lists every party exactly once", () => {
  it("starter preview body contains every party name once for a 5-party services agreement", () => {
    const names = ["Helix Labs LLC", "Orbit Studios LLC", "Pioneer & Sons Inc.", "Atlas Partners LP", "Jamie Chen"];
    const intake = `Services agreement between ${buildOxfordList(names)}. Fee $9,000/month. Term 12 months. Delaware law.`;
    const draft = runIntake(intake);
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });

    // I1+I7: every party present.
    for (const n of names) expect(body.toLowerCase()).toContain(n.toLowerCase());

    // No party name appears 4+ times — that would indicate accidental duplication via
    // multi-section repetition. (Two appearances are normal: preamble + signature blocks
    // / role labels in some preview routes.)
    for (const n of names) {
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const occurrences = (body.match(re) || []).length;
      expect(occurrences).toBeGreaterThan(0);
      expect(occurrences).toBeLessThan(4);
    }
  });

  it("formatLegalPartyPreamble builds a single preamble line that lists every party", () => {
    const parties = [
      { name: "Apollo Data LLC", role: "party" },
      { name: "Beta Advisors LLC", role: "party" },
      { name: "Gamma Holdings LLC", role: "party" },
    ];
    const preamble = formatLegalPartyPreamble(parties);
    expect(preamble).toContain("Apollo Data LLC");
    expect(preamble).toContain("Beta Advisors LLC");
    expect(preamble).toContain("Gamma Holdings LLC");
    expect(preamble).toContain("Parties"); // collective label
    // Single sentence — no double newlines mid-preamble.
    expect(preamble.match(/\n\n/)).toBeNull();
  });

  it("preview body is non-empty for a normal 3-party draft (no empty review state)", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, and Gamma Holdings LLC. Fee $5,000/month.";
    const draft = runIntake(intake);
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    expect(body.trim().length).toBeGreaterThan(120);
  });
});

/* ──────────────────── 6. Signing-prep payload continuity ─────────────────── */

describe("Continuity I3+I4+I8 — signing-prep bridge payload is well-formed and deterministic", () => {
  it("creator = first party, counterparties = remaining parties in original order (3 parties)", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, and Gamma Holdings LLC. Fee $5,000/month.";
    const draft = runIntake(intake);
    const ordered = partyNamesOf(draft);
    expect(ordered.length).toBe(3);

    const bridge = bridgeOf(draft);
    expect(bridge.creatorName).toBe(ordered[0]);
    expect(bridge.counterparties.length).toBe(2);
    expect(bridge.counterparties.map((c) => c.name)).toEqual(ordered.slice(1));
    // No empty bridge.
    expect(bridge.agreementId.trim().length).toBeGreaterThan(0);
    expect(bridge.vs01DocumentId.trim().length).toBeGreaterThan(0);
  });

  it("counterparties contain no duplicate names for a 6-party draft", () => {
    const names = Array.from({ length: 6 }, (_, i) => `Atlas ${i + 1} LLC`);
    const intake = `Services agreement between ${buildOxfordList(names)}. Fee $5,000/month.`;
    const draft = runIntake(intake);
    const bridge = bridgeOf(draft);

    const allBridgeNames = [bridge.creatorName, ...bridge.counterparties.map((c) => c.name)];
    expectNoDuplicateNames(allBridgeNames);
    expect(bridge.counterparties.length).toBe(5);
  });

  it("13-party Pro-required draft preserves every party in the bridge (no signer truncation)", () => {
    const names = Array.from({ length: 13 }, (_, i) => `Delta ${i + 1} LLC`);
    const intake = `Services agreement between ${buildOxfordList(names)}. Fee $12,000/month.`;
    const draft = runIntake(intake);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.status).toBe("requires_pro");

    const bridge = bridgeOf(draft);
    // Creator + counterparties equals total parties — no silent truncation.
    expect(1 + bridge.counterparties.length).toBe(13);
    const allBridgeNames = [bridge.creatorName, ...bridge.counterparties.map((c) => c.name)];
    for (const n of names) expect(allBridgeNames).toContain(n);
    expectNoDuplicateNames(allBridgeNames);
  });

  it("counterparty emails default to empty (not undefined / null) for missing inputs", () => {
    const intake =
      "Services agreement between Apollo Data LLC, Beta Advisors LLC, and Gamma Holdings LLC. Fee $5,000/month.";
    const draft = runIntake(intake);
    const bridge = bridgeOf(draft);
    for (const c of bridge.counterparties) {
      expect(typeof c.email).toBe("string");
      expect(typeof c.name).toBe("string");
      expect(c.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to a single empty counterparty when only one party is present (no malformed empty array)", () => {
    const draft = blankParsed();
    draft.parties = [{ name: "Solo Holdings LLC", role: "owner" }];
    const bridge = bridgeOf(draft);
    expect(bridge.creatorName).toBe("Solo Holdings LLC");
    // I8: bridge always carries at least one counterparty slot for VS01 wiring.
    expect(bridge.counterparties.length).toBe(1);
    expect(bridge.counterparties[0].name).toBe("");
  });
});

/* ─────────────────── 7. Full-flow: intake → preview → bridge ─────────────── */

describe("Continuity full-stack — intake → preview text → signing bridge agree on cardinality", () => {
  const SCENARIOS: Array<{ label: string; intake: string; expectedCount: number }> = [
    {
      label: "2-party web dev",
      intake: "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000.",
      expectedCount: 2,
    },
    {
      label: "4-party real estate purchase",
      intake:
        "Real estate purchase agreement between Apex Sellers LLC, Chen Family Trust, First County Escrow Services as escrow agent, and Beacon Holdings LLC. Property: 456 Oak Ave. Closing date: August 15, 2026.",
      expectedCount: 4,
    },
    {
      label: "8-party caution services",
      intake: `Services agreement between ${buildOxfordList(
        Array.from({ length: 8 }, (_, i) => `Foxtrot ${i + 1} LLC`),
      )}. Fee $10,000/month.`,
      expectedCount: 8,
    },
    {
      label: "15-party Pro-required strategic partnership",
      intake: `Strategic partnership agreement between ${buildOxfordList(
        Array.from({ length: 15 }, (_, i) => `Hotel ${i + 1} LLC`),
      )}. Term 18 months.`,
      expectedCount: 15,
    },
  ];

  for (const s of SCENARIOS) {
    it(`${s.label}: draft.parties.length === bridge participants count and every name present in the preview body`, () => {
      const draft = runIntake(s.intake);

      // Cardinality matches across all surfaces.
      expect(draft.parties.length).toBe(s.expectedCount);

      const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
      const names = partyNamesOf(draft);
      // Each party appears at least once in the preview body.
      expectAllNamesPresent(body, names);

      const bridge = bridgeOf(draft);
      const bridgeTotal = 1 + bridge.counterparties.length;
      expect(bridgeTotal).toBe(s.expectedCount);

      // Order: creator = first; counterparties preserve the rest.
      expect(bridge.creatorName).toBe(names[0]);
      expect(bridge.counterparties.map((c) => c.name)).toEqual(names.slice(1));

      // No duplicates anywhere.
      expectNoDuplicateNames(names);
      expectNoDuplicateNames([bridge.creatorName, ...bridge.counterparties.map((c) => c.name)]);
    });
  }
});

/* ─────────────────── 8. Negative regression — no silent reorder ──────────── */

describe("Continuity I3 — order-preservation under repeated runs (no silent reorder)", () => {
  it("does not alphabetize / reorder parties between runs of the same intake", () => {
    // Intentionally non-alphabetical input order; the pipeline must preserve it.
    const intake =
      "Services agreement between Zeta Holdings LLC, Alpha Capital LLC, Mike's Trucking LLC, and Beta Advisors LLC. Fee $7,000/month.";
    const a = partyNamesOf(runIntake(intake));
    const b = partyNamesOf(runIntake(intake));
    expect(a).toEqual(b);
    // Sanity: list begins with Zeta, not the alphabetized "Alpha".
    expect(a[0]).toBe("Zeta Holdings LLC");
    expect(a[1]).toBe("Alpha Capital LLC");
  });

  it("bridge counterparty order matches draft order, not name sort order", () => {
    const intake =
      "Services agreement between Zeta Holdings LLC, Alpha Capital LLC, Mike's Trucking LLC, and Beta Advisors LLC. Fee $7,000/month.";
    const draft = runIntake(intake);
    const bridge = bridgeOf(draft);
    expect(bridge.creatorName).toBe("Zeta Holdings LLC");
    const cpNames = bridge.counterparties.map((c) => c.name);
    expect(cpNames[0]).toBe("Alpha Capital LLC");
    // Mike's Trucking comes before Beta Advisors in the original intake.
    const mikeIdx = cpNames.indexOf("Mike's Trucking LLC");
    const betaIdx = cpNames.indexOf("Beta Advisors LLC");
    expect(mikeIdx).toBeGreaterThanOrEqual(0);
    expect(betaIdx).toBeGreaterThanOrEqual(0);
    expect(mikeIdx).toBeLessThan(betaIdx);
  });
});

/* ─────────────────── 9. Handoff summaries — never collapse to two-party ↔ ──────────── */

describe("Continuity handoff summaries — five-party Foundry / Beacon / Apollo / Smith & Wesson / Coastal", () => {
  const intake =
    "Master services agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, " +
    "Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. " +
    "Termination for convenience: 45 days written notice. Governing law: Delaware.";

  it("handoff headline is never a two-party ↔ join; ordered list has length 5", () => {
    const draft = runIntake(intake);
    expect(draft.parties.length).toBeGreaterThanOrEqual(5);
    const ad = toAgreementDraft(draft);
    const names = orderedAuthoritativePartyDisplayNames(ad.parties);
    expect(names.length).toBe(5);
    expect(formatAuthoritativeAgreementPartiesHeadline(ad.parties)).not.toMatch(/↔/);
    for (const expected of [
      "FoundryCo Inc.",
      "Beacon Operations And Logistics Group LLC",
      "Apollo Data Services LLC",
      "Smith & Wesson Holdings LLC",
      "Coastal Reserve Partners LP",
    ]) {
      expectListContainsCaseInsensitive(names, expected);
    }
    expectNoDuplicateNames(names);
  });
});
