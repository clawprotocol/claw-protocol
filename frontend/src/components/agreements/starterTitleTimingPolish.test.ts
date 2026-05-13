/**
 * Title + timing polish regression suite (post-Railway QA).
 *
 * Locks in:
 *   • Software / tech / SaaS / API / cloud agreements get specific canonical titles
 *     instead of falling back to "Consulting Agreement" or "Agreement".
 *   • Strategic-partnership / collaboration / co-development titles are honored as
 *     stated, without routing into LLC / operating-agreement governance.
 *   • Event-production / venue / sponsorship / conference-services agreements get
 *     event-aware titles AND event-aware timing labels ("Event Dates: …" instead
 *     of "Term: until …"). Cross-month and same-month event date ranges survive
 *     intake parsing without losing the year or the end day.
 *   • Existing services / NDA / lease / purchase timing remains unchanged.
 *   • Universal invariants from earlier hardening passes (party preservation, 7+12+13
 *     limits, no internal-process language) continue to hold.
 */

import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { resolveStarterPartyCountGuard } from "./starterPartyLimits";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

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

function runStarter(intake: string): {
  draft: ParsedDraftShape;
  partyNames: string[];
  preview: string;
} {
  const draft = runIntakeDefaultsAndRoles(blankParsedDraft(), intake, true, defaultIntakePartyRoleLabels());
  const partyNames = (draft.parties || []).map((p) => p.name);
  const preview = buildAgreementPreviewText(draft, { starterPreview: true });
  return { draft, partyNames, preview };
}

const SOFTWARE_INTEGRATION_INTAKE_12 = `Create a software integration and deployment agreement between Alpha Systems LLC, Beta Cloud LLC, Gamma Security LLC, Delta Hosting LLC, Echo Payments LLC, Foxtrot Data LLC, Harbor Networks LLC, Ivy Analytics LLC, Juniper Labs LLC, Kilo Automation LLC, Luna Support LLC, and Metro Consulting LLC.
Scope: enterprise software deployment, API integration, cloud migration, analytics dashboards, and support services.
Payment: $120,000.
Term: 9 months beginning July 1, 2026.
Governing law: Delaware.`;

const STRATEGIC_PARTNERSHIP_INTAKE_13 = `Create a multi-party strategic partnership agreement between Alpha Ventures LLC, Beta Holdings LLC, Gamma Capital LLC, Delta Advisors LLC, Echo Technologies LLC, Foxtrot Media LLC, Harbor Investments LLC, Ivy Operations LLC, Juniper Logistics LLC, Kilo Energy LLC, Luna Systems LLC, Metro Development LLC, and Nova Infrastructure LLC.
Purpose: coordinated infrastructure expansion, marketing collaboration, financing support, and operational integration.
Payment: proportional contribution obligations totaling $250,000.
Term: 18 months beginning August 1, 2026.
Governing law: New York.`;

const EVENT_PRODUCTION_INTAKE_7 = `Create a commercial event production agreement between Red Canyon Events LLC, Atlas Venue Group LLC, Summit Audio LLC, Nova Lighting LLC, Blue River Security LLC, Ember Catering LLC, and Horizon Staffing LLC.
Purpose: production and staffing for a multi-day business conference in Dallas, Texas.
Payment: $42,000.
Term: event dates September 12–15, 2026.
Governing law: Texas.`;

// ─── 1. Software / tech canonical titles (defect P1) ────────────────────────────

describe("Software / tech canonical titles", () => {
  it("software integration and deployment agreement → Software Integration Agreement (not Consulting Agreement); 12 parties preserved", () => {
    const { draft, partyNames } = runStarter(SOFTWARE_INTEGRATION_INTAKE_12);
    expect(draft.title).toMatch(/^(Software Integration|Software Services) Agreement$/i);
    expect(draft.title).not.toMatch(/^Consulting Agreement$/i);
    expect(draft.title).not.toMatch(/^Agreement$/i);
    expect(draft.title).not.toMatch(/^Business Agreement$/i);
    // All 12 entities preserved (cardinality invariant).
    expect(partyNames).toContain("Alpha Systems LLC");
    expect(partyNames).toContain("Metro Consulting LLC");
    expect(partyNames.length).toBe(12);
  });

  it("plain web development agreement → Web Development Agreement; 2 parties intact", () => {
    const { draft, partyNames } = runStarter(
      "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000 over 90 days.",
    );
    expect(draft.title).toMatch(/^Web Development Agreement$/i);
    expect(partyNames.length).toBe(2);
  });

  it("multi-party web development agreement → Web Development Agreement; 4 signers preserved", () => {
    const intake =
      "Web development agreement between FoundryCo Inc., Apollo Data LLC, Beacon Studios LLC, and Atlas Cloud LLC. Fee $40,000.";
    const { draft, partyNames } = runStarter(intake);
    expect(draft.title).toMatch(/^Web Development Agreement$/i);
    expect(partyNames.length).toBe(4);
  });

  it("SaaS implementation agreement → SaaS Implementation Agreement", () => {
    const { draft } = runStarter(
      "SaaS implementation agreement between Apex Cloud LLC and Beacon Health Systems Inc. Fee $80,000. Term 6 months.",
    );
    expect(draft.title).toMatch(/^SaaS Implementation Agreement$/i);
  });

  it("API integration agreement → API Integration Agreement", () => {
    const { draft } = runStarter(
      "API integration agreement between Apex Cloud LLC and Beacon Trading Inc. Fee $25,000. Delaware law.",
    );
    expect(draft.title).toMatch(/^API Integration Agreement$/i);
  });

  it("technology services agreement → Technology Services Agreement (not generic Services Agreement)", () => {
    const { draft } = runStarter(
      "Technology services agreement between Apex Cloud LLC and Beacon Trading Inc. Fee $25,000.",
    );
    expect(draft.title).toMatch(/^Technology Services Agreement$/i);
  });

  it("cloud migration agreement → Cloud Migration Agreement", () => {
    const { draft } = runStarter(
      "Cloud migration agreement between Apex Cloud LLC and Beacon Health Systems Inc. Fee $60,000. Term 4 months.",
    );
    expect(draft.title).toMatch(/^Cloud Migration Agreement$/i);
  });

  it("software services agreement → Software Services Agreement", () => {
    const { draft } = runStarter(
      "Software services agreement between Apex Cloud LLC and Beacon Trading Inc. Fee $35,000.",
    );
    expect(draft.title).toMatch(/^Software Services Agreement$/i);
  });
});

// ─── 2. Strategic-partnership / collaboration titles (defect P2) ────────────────

describe("Strategic partnership / collaboration canonical titles", () => {
  it("strategic partnership agreement → Strategic Partnership Agreement; 13 parties preserved + Pro-required guard fires", () => {
    const { draft, partyNames } = runStarter(STRATEGIC_PARTNERSHIP_INTAKE_13);
    expect(draft.title).toMatch(/^Strategic Partnership Agreement$/i);
    expect(draft.title).not.toMatch(/^Agreement$/i);
    expect(draft.title).not.toMatch(/^Business Agreement$/i);
    // Cardinality preserved.
    expect(partyNames).toContain("Alpha Ventures LLC");
    expect(partyNames).toContain("Nova Infrastructure LLC");
    expect(partyNames.length).toBe(13);
    // Party-count guard still fires Pro-required at 13 — title polish must not affect routing.
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.realCount).toBe(13);
    expect(guard.status).toBe("requires_pro");
    expect(guard.requiresProUpgrade).toBe(true);
  });

  it("collaboration agreement → Collaboration Agreement; does NOT route as LLC/operating agreement", () => {
    const { draft } = runStarter(
      "Collaboration agreement between Alpha Studios LLC, Beacon Media LLC, and Atlas Productions LLC. Joint marketing for Q3 2026 launch.",
    );
    expect(draft.title).toMatch(/^Collaboration Agreement$/i);
    expect(draft.agreement_family).not.toBe("operating_agreement");
  });

  it("commercial collaboration agreement → Commercial Collaboration Agreement", () => {
    const { draft } = runStarter(
      "Commercial collaboration agreement between Alpha Studios LLC and Beacon Media LLC. Q3 2026 launch.",
    );
    expect(draft.title).toMatch(/^Commercial Collaboration Agreement$/i);
  });

  it("co-development agreement → Co-Development Agreement", () => {
    const { draft } = runStarter(
      "Co-development agreement between Alpha Labs LLC and Atlas Bio Inc. Joint development of diagnostic platform.",
    );
    expect(draft.title).toMatch(/^Co-Development Agreement$/i);
  });

  it("ordinary 'partner' wording in a single party name does NOT route to operating-agreement / partnership", () => {
    const { draft } = runStarter(
      "Consulting agreement between Apollo Data LLC and Beacon Partners Inc. Fee $7,500/month.",
    );
    expect(draft.agreement_family).not.toBe("operating_agreement");
    expect(draft.title).toMatch(/^Consulting Agreement$/i);
  });
});

// ─── 3. Event production family + timing labels (defect P3) ─────────────────────

describe("Event production canonical title and timing", () => {
  it("commercial event production agreement → Event Production Agreement (or Commercial Event Production Agreement)", () => {
    const { draft } = runStarter(EVENT_PRODUCTION_INTAKE_7);
    expect(draft.title).toMatch(/^(Commercial )?Event Production Agreement$/i);
    expect(draft.title).not.toMatch(/^Agreement$/i);
    expect(draft.title).not.toMatch(/^Business Agreement$/i);
  });

  it("event date range 'September 12–15, 2026' renders under an Event Dates label (not 'until September 15, 2026')", () => {
    const { draft, preview } = runStarter(EVENT_PRODUCTION_INTAKE_7);
    expect(draft.duration).toMatch(/September\s+12[-–]15,\s*2026/);
    // The preview must surface the range under an event-aware label, NOT collapse to "until <end-date>".
    expect(preview).toMatch(/Event Dates:\s+September\s+12[-–]15,\s*2026/);
    expect(preview).not.toMatch(/Term:\s+until\s+September\s+15,\s*2026/i);
    // Section heading is event-aware.
    expect(preview).toMatch(/Event Term and Effective Date/i);
  });

  it("cross-month event date range survives intake without losing the second month or year", () => {
    const intake = `Event production agreement between Red Canyon Events LLC and Atlas Venue Group LLC.
Term: event dates August 30 – September 2, 2026.
Governing law: California.`;
    const { draft, preview } = runStarter(intake);
    expect(draft.title).toMatch(/^Event Production Agreement$/i);
    expect(draft.duration).toMatch(/August\s+30/);
    expect(draft.duration).toMatch(/September\s+2/);
    expect(draft.duration).toMatch(/2026/);
    expect(preview).toMatch(/Event Dates:.*August\s+30.*September\s+2.*2026/);
  });

  it("venue agreement → Venue Agreement, event-aware timing labels", () => {
    const { draft, preview } = runStarter(
      "Venue agreement between Atlas Venue Group LLC and Beacon Conferences LLC. Term: event dates October 5–7, 2026. Texas law.",
    );
    expect(draft.title).toMatch(/^Venue Agreement$/i);
    expect(preview).toMatch(/Event Term and Effective Date/i);
  });

  it("sponsorship agreement → Sponsorship Agreement", () => {
    const { draft } = runStarter(
      "Sponsorship agreement between Apex Cola Inc. and Atlas Conferences LLC. Term: event dates April 10–12, 2026.",
    );
    expect(draft.title).toMatch(/^Sponsorship Agreement$/i);
  });

  it("ordinary employment-staffing agreement is NOT classified as event production", () => {
    const { draft } = runStarter(
      "Staffing agreement between Apollo Recruiting LLC and Beacon Health Inc. Fee $4,500/month for 12 months. Delaware law.",
    );
    expect(draft.title).not.toMatch(/Event Production Agreement/i);
    expect(draft.title).not.toMatch(/Event Staffing Agreement/i);
  });
});

// ─── 4. Existing family timing labels remain intact (regression locks) ──────────

describe("Existing family timing labels remain unchanged", () => {
  it("normal services agreement uses Services Term (not event labels)", () => {
    const { preview } = runStarter(
      "Services agreement between Apollo Data LLC and Beacon Health Inc. Fee $5,000/month. Term 12 months. Delaware law.",
    );
    expect(preview).toMatch(/Services Term/);
    expect(preview).not.toMatch(/Event Dates/);
    expect(preview).not.toMatch(/Event Term/);
  });

  it("real estate purchase agreement still uses Closing labels", () => {
    const { preview } = runStarter(
      "Real estate purchase agreement between Apex Sellers LLC and Beacon Holdings LLC. Property: 456 Oak Ave. Closing date: August 15, 2026.",
    );
    expect(preview).toMatch(/Closing/);
    expect(preview).not.toMatch(/Event Dates/);
  });

  it("commercial lease agreement still uses Lease Term / Commencement labels", () => {
    const { preview } = runStarter(
      "Commercial lease agreement between Sunset LLC and Alex Park. Property: 123 Main St. Rent: $4,500/month. Term 24 months beginning July 1, 2026.",
    );
    expect(preview).toMatch(/Lease Term/);
    expect(preview).toMatch(/Commencement Date/);
    expect(preview).not.toMatch(/Event Dates/);
  });

  it("mutual NDA still canonicalizes to Mutual Non-Disclosure Agreement", () => {
    const { draft } = runStarter(
      "Mutual NDA between Alpha LLC and Beta Inc. Confidentiality term: 3 years. Delaware law.",
    );
    expect(draft.title).toMatch(/^Mutual Non-Disclosure Agreement$/i);
  });
});

// ─── 5. Party-count thresholds remain unchanged ─────────────────────────────────

describe("7-party caution and 13-party Pro-required behavior unchanged after title polish", () => {
  it("7-party event production agreement → caution (no block), all parties preserved, event title", () => {
    const { draft, partyNames } = runStarter(EVENT_PRODUCTION_INTAKE_7);
    expect(partyNames.length).toBe(7);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.realCount).toBe(7);
    expect(guard.status).toBe("caution");
    expect(guard.requiresProUpgrade).toBe(false);
    expect(draft.title).toMatch(/Event Production Agreement/i);
  });

  it("13-party strategic partnership → requires_pro, all parties preserved, partnership title", () => {
    const { draft, partyNames } = runStarter(STRATEGIC_PARTNERSHIP_INTAKE_13);
    expect(partyNames.length).toBe(13);
    const guard = resolveStarterPartyCountGuard(draft.parties);
    expect(guard.realCount).toBe(13);
    expect(guard.status).toBe("requires_pro");
    expect(guard.requiresProUpgrade).toBe(true);
    expect(draft.title).toMatch(/Strategic Partnership Agreement/i);
  });
});

// ─── 6. Public output never leaks internal-process language ─────────────────────

describe("Starter preview never leaks internal-process language", () => {
  const banned = /\b(?:parser|fallback|shell|internal|algorithm|threshold\s+logic|edit\s+in\s+review|specified\s+in\s+review|refined\s+in\s+review)\b/i;
  const samples = [
    SOFTWARE_INTEGRATION_INTAKE_12,
    STRATEGIC_PARTNERSHIP_INTAKE_13,
    EVENT_PRODUCTION_INTAKE_7,
    "Web development agreement between FoundryCo Inc. and Apollo Data LLC. Fee $20,000.",
    "Mutual NDA between Alpha LLC and Beta Inc. Confidentiality term: 3 years.",
    "Real estate purchase agreement between Apex Sellers LLC and Beacon Holdings LLC. Property: 12 Oak Ave. Closing date: August 15, 2026.",
  ];
  for (const intake of samples) {
    it(`no banned words for "${intake.slice(0, 60)}…"`, () => {
      const { preview } = runStarter(intake);
      expect(preview).not.toMatch(banned);
    });
  }
});
