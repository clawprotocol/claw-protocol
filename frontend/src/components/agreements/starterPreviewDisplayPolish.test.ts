/**
 * Starter-preview display polish — additive deterministic regressions.
 *
 * Pins the four presentation-layer behaviors hardened in this pass:
 *   1. Canonical agreement titles render in the starter preview heading instead of
 *      generic fallbacks ("AGREEMENT", "DOCUMENT", "[NOT YET SPECIFIED]"). The display
 *      layer reuses the already-derived `agreement_family` + intake metadata via
 *      `resolveCanonicalAgreementTitle` — no parsing is performed at display time.
 *   2. The generic fallback still renders safely when no family or intake is available.
 *   3. Party-name casing is restored from the original intake text when the canonicalizer
 *      flattened intentional casing (e.g. "FoundryCo Inc." stays as "FoundryCo Inc.").
 *      The restoration is conservative — it never demotes a canonical form to a less-
 *      capitalized user variant.
 *   4. Family-aware timing labels remain correct (event / lease / purchase / services /
 *      generic).
 *
 * No routes, endpoints, payloads, signing flows, export flows, proof flows, review
 * orchestration, persistence behavior, or premium/free gating are touched by these
 * tests — they assert pure presentation strings on the existing builder.
 */

import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";

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

function preview(intake: string): string {
  const draft = runIntake(intake);
  return buildAgreementPreviewTextCore(draft, { starterPreview: true, intakeText: intake });
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

/* ──────────────────────── 1. Canonical titles in heading ────────────────────── */

describe("Display polish — canonical titles render in starter heading", () => {
  const TITLE_CASES: Array<{ label: string; intake: string; expectedTitle: RegExp }> = [
    {
      label: "web development → Web Development Agreement",
      intake:
        "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000.",
      expectedTitle: /^WEB DEVELOPMENT AGREEMENT$/,
    },
    {
      label: "software integration → Software Integration Agreement",
      intake:
        "Software integration and deployment agreement between Alpha Systems LLC, Beta Cloud LLC, Gamma Security LLC, and Delta Hosting LLC. Fee $50,000.",
      expectedTitle: /SOFTWARE INTEGRATION AGREEMENT/,
    },
    {
      label: "saas implementation → SaaS Implementation Agreement",
      intake:
        "SaaS implementation agreement between Helix Labs LLC and Orbit Studios LLC. Fee $30,000.",
      expectedTitle: /SAAS IMPLEMENTATION AGREEMENT/,
    },
    {
      label: "event production → Event Production Agreement",
      intake:
        "Commercial event production agreement between Red Canyon Events LLC, Atlas Venue Group LLC, and Summit Audio LLC. Term: event dates September 12–15, 2026.",
      expectedTitle: /EVENT PRODUCTION AGREEMENT/,
    },
    {
      label: "strategic partnership → Strategic Partnership Agreement",
      intake:
        "Multi-party strategic partnership agreement between Alpha Ventures LLC, Beta Holdings LLC, and Gamma Capital LLC. Term 18 months.",
      expectedTitle: /STRATEGIC PARTNERSHIP AGREEMENT/,
    },
    {
      label: "mutual NDA → Mutual Non-Disclosure Agreement",
      intake:
        "Mutual non-disclosure agreement between Helix Labs LLC and Orbit Studios LLC. Term 2 years.",
      expectedTitle: /MUTUAL NON-DISCLOSURE AGREEMENT/,
    },
    {
      label: "purchase → Real Estate Purchase Agreement",
      intake:
        "Real estate purchase agreement between Apex Sellers LLC and Beacon Holdings LLC. Closing date August 15, 2026.",
      expectedTitle: /REAL\s+ESTATE\s+PURCHASE\s+AGREEMENT|PURCHASE\s+AGREEMENT/,
    },
  ];

  for (const c of TITLE_CASES) {
    it(`${c.label}: heading is canonical, never bare AGREEMENT / [NOT YET SPECIFIED]`, () => {
      const body = preview(c.intake);
      const heading = firstNonEmptyLine(body);
      expect(heading).toMatch(c.expectedTitle);
      expect(heading).not.toBe("AGREEMENT");
      expect(heading).not.toBe("DOCUMENT");
      expect(heading).not.toBe("[NOT YET SPECIFIED]");
    });
  }
});

/* ─────────────────────── 2. Generic fallback safety ─────────────────────────── */

describe("Display polish — generic fallback is safe and deterministic", () => {
  it("renders the [Not yet specified] placeholder when no family + no usable intake", () => {
    const draft = blankParsed();
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    // The MISSING placeholder is the existing safe fallback — display layer never
    // synthesizes a heading when no metadata is available.
    expect(firstNonEmptyLine(body)).toBe("[NOT YET SPECIFIED]");
  });

  it("renders a family canonical heading when a family is set but title is empty", () => {
    const draft = blankParsed();
    draft.agreement_family = "services_agreement";
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    // CANONICAL_TITLE_FOR_FAMILY[services_agreement] = "Services Agreement"
    expect(firstNonEmptyLine(body)).toBe("SERVICES AGREEMENT");
  });

  it("preserves a substantive parsed title verbatim (never re-derives over a real title)", () => {
    const draft = blankParsed();
    draft.title = "Apollo Strategic Partnership Agreement 2026";
    draft.agreement_family = "generic_business_agreement";
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    expect(firstNonEmptyLine(body)).toBe("APOLLO STRATEGIC PARTNERSHIP AGREEMENT 2026");
  });
});

/* ───────────────────── 3. Party-name casing fidelity ────────────────────────── */

describe("Display polish — party-name casing is restored from original intake", () => {
  it("preserves 'FoundryCo Inc.' (intentional internal capitalization) in the preview body", () => {
    const intake =
      "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000.";
    const body = preview(intake);
    expect(body).toContain("FoundryCo Inc.");
    // Canonicalizer-flattened "Foundryco Inc." should NOT appear in the rendered preview.
    expect(body).not.toMatch(/\bFoundryco Inc\./);
  });

  it("preserves 'iCloud Holdings LLC' (lower-then-capital) when present in intake", () => {
    const intake =
      "Services agreement between iCloud Holdings LLC and Apollo Data LLC. Fee $5,000/month.";
    const body = preview(intake);
    expect(body).toContain("iCloud Holdings LLC");
    expect(body).not.toMatch(/\bIcloud Holdings LLC\b/);
  });

  it("does NOT demote canonical 'Smith And Wesson Holdings LLC' to a lowercase-and intake variant", () => {
    // If the canonicalizer upgraded "smith and wesson holdings llc" (all-lower) to a
    // properly-cased canonical, restoration must NOT regress it back to lowercase.
    const draft = blankParsed();
    draft.title = "Services Agreement";
    draft.agreement_family = "services_agreement";
    draft.parties = [
      { name: "Smith And Wesson Holdings LLC", role: "party" },
      { name: "Apollo Data LLC", role: "party" },
    ];
    const body = buildAgreementPreviewTextCore(draft, {
      starterPreview: true,
      intakeText: "services agreement between smith and wesson holdings llc and apollo data llc",
    });
    expect(body).toContain("Smith And Wesson Holdings LLC");
    expect(body).not.toContain("smith and wesson holdings llc");
  });

  it("falls back gracefully when no intake is supplied (returns canonical name unchanged)", () => {
    const draft = blankParsed();
    draft.title = "Services Agreement";
    draft.agreement_family = "services_agreement";
    draft.parties = [
      { name: "Apollo Data LLC", role: "party" },
      { name: "Beta Advisors LLC", role: "party" },
    ];
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    expect(body).toContain("Apollo Data LLC");
    expect(body).toContain("Beta Advisors LLC");
  });
});

/* ─────────────────── 4. Family-aware timing labels (regressed) ──────────────── */

describe("Display polish — family-aware timing labels stay correct", () => {
  it("event production → 'Event Dates' label", () => {
    const intake =
      "Commercial event production agreement between Red Canyon Events LLC, Atlas Venue Group LLC, and Summit Audio LLC. Term: event dates September 12–15, 2026.";
    const body = preview(intake);
    expect(body).toMatch(/Event Dates:/);
    expect(body).not.toMatch(/^Term:\s+until\s+September\s+15/m);
  });

  it("services → 'Services Term' label, no Event/Closing/Lease labels", () => {
    const intake =
      "Services agreement between Apollo Data LLC and Beta Advisors LLC. Fee $5,000/month. Term 12 months. Delaware law.";
    const body = preview(intake);
    expect(body).toMatch(/Services Term:/);
    expect(body).not.toMatch(/Event Dates:/);
    expect(body).not.toMatch(/Lease Term:/);
    expect(body).not.toMatch(/Closing Date:/);
  });

  it("lease → 'Lease Term' label", () => {
    const intake =
      "Commercial lease agreement between Sunset LLC and Alex Park. Property: 100 Beacon Way. Rent $5,500/month. Term 36 months commencing July 1, 2026.";
    const body = preview(intake);
    expect(body).toMatch(/Lease Term:/);
    expect(body).not.toMatch(/Services Term:/);
  });

  it("purchase → 'Closing Date' label", () => {
    const intake =
      "Real estate purchase agreement between Apex Sellers LLC and Beacon Holdings LLC. Property: 456 Oak Ave. Closing date: August 15, 2026.";
    const body = preview(intake);
    expect(body).toMatch(/Closing Date:|Closing window:/);
  });

  it("generic fallback remains 'Term'", () => {
    const draft = blankParsed();
    draft.title = "Custom Agreement";
    draft.agreement_family = "generic_business_agreement";
    draft.parties = [
      { name: "Apollo Data LLC", role: "party" },
      { name: "Beta Advisors LLC", role: "party" },
    ];
    draft.duration = "12 months";
    const body = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    expect(body).toMatch(/^Term:\s+12 months$/m);
  });
});

/* ──────────────────── 5. No regressions in continuity surface ───────────────── */

describe("Display polish — does not regress continuity invariants", () => {
  it("multi-party preview body still lists every party for a 7-party caution draft", () => {
    const names = Array.from({ length: 7 }, (_, i) => `Atlas ${i + 1} LLC`);
    const intake = `Services agreement between ${names.slice(0, -1).join(", ")}, and ${
      names[names.length - 1]
    }. Fee $7,500/month.`;
    const body = preview(intake);
    for (const n of names) expect(body).toContain(n);
  });

  it("13-party Pro-required draft preserves every party in the rendered preview", () => {
    const names = Array.from({ length: 13 }, (_, i) => `Delta ${i + 1} LLC`);
    const intake = `Services agreement between ${names.slice(0, -1).join(", ")}, and ${
      names[names.length - 1]
    }. Fee $12,000/month.`;
    const body = preview(intake);
    for (const n of names) expect(body).toContain(n);
  });

  it("no public banned-internal-process language leaks into the rendered preview", () => {
    const intake =
      "Services agreement between Apollo Data LLC and Beta Advisors LLC. Fee $5,000/month.";
    const body = preview(intake);
    const banned =
      /\b(?:parser|fallback|shell|internal|algorithm|threshold\s+logic|edit\s+in\s+review|specified\s+in\s+review|refined\s+in\s+review)\b/i;
    expect(body).not.toMatch(banned);
  });
});
