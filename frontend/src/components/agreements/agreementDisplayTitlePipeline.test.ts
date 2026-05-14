/**
 * Regression: agreement preview headings must never show accidental title corruption
 * (double leading letters, duplicated leading words, pasted duplicate full titles).
 *
 * Covers starter (free) and Pro live-preview paths — both use `resolveStarterDisplayTitle` /
 * `normalizeAgreementDisplayTitle` before the uppercase heading line.
 */

import { describe, expect, it } from "vitest";

import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";

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

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

/** User-visible heading line must not carry common accidental duplication artifacts. */
function assertHeadingLineHealthy(heading: string): void {
  const h = heading.trim();
  expect(h).not.toMatch(/^SSERVICES\b/i);
  expect(h).not.toMatch(/^AAGREEMENT\b/i);
  expect(h).not.toMatch(/^MMUTUAL\b/i);
  expect(h).not.toMatch(/^SSOFTWARE\b/i);
  if (h.length >= 24 && h.length % 2 === 0) {
    const half = h.length / 2;
    const a = h.slice(0, half).trim();
    const b = h.slice(half).trim();
    expect(a.toLowerCase()).not.toBe(b.toLowerCase());
  }
}

describe("agreement display title pipeline — poisoned draft.title", () => {
  const CASES = [
    {
      key: "services",
      intake:
        "Services agreement between Helix Labs LLC and Orbit Studios LLC. Fee $8,000 per month. Term 12 months. Work includes API integration, uptime monitoring, quarterly roadmap reviews, and security assessments.",
      poisonTitle: "SServices Agreement",
      headingPattern: /^SERVICES AGREEMENT$/i,
    },
    {
      key: "consulting",
      intake:
        "Consulting agreement between Alpha Advisors LLC and Beta Corp LLC. Advisor provides strategic guidance twice weekly. Monthly retainer $15,000. Term 12 months. Deliverables include board prep materials, diligence memo templates, and executive workshops.",
      poisonTitle: "CConsulting Agreement",
      headingPattern: /^CONSULTING AGREEMENT$/i,
    },
    {
      key: "nda",
      intake:
        "Mutual non-disclosure agreement between Helix Labs LLC and Orbit Studios LLC. Term 2 years. Confidential information includes product roadmaps, pricing, and customer lists.",
      poisonTitle: "MMutual Non-Disclosure Agreement",
      headingPattern: /MUTUAL\s+NON-DISCLOSURE\s+AGREEMENT/i,
    },
    {
      key: "software_integration",
      intake:
        "Software integration and deployment agreement between Alpha Systems LLC, Beta Cloud LLC, Gamma Security LLC, and Delta Hosting LLC. Fee $50,000. Milestones include environment provisioning, data migration, cutover support, and post-go-live hypercare.",
      poisonTitle: "SSoftware Integration Agreement",
      headingPattern: /SOFTWARE\s+INTEGRATION\s+AGREEMENT/i,
    },
  ] as const;

  for (const c of CASES) {
    it(`starter preview: ${c.key} heading heals "${c.poisonTitle}"`, () => {
      const draft = runIntake(c.intake);
      draft.title = c.poisonTitle;
      const body = buildAgreementPreviewText(draft, { starterPreview: true, intakeText: c.intake });
      const heading = firstNonEmptyLine(body);
      assertHeadingLineHealthy(heading);
      expect(heading).toMatch(c.headingPattern);
    });

    it(`Pro live preview: ${c.key} heading heals "${c.poisonTitle}"`, () => {
      const draft = runIntake(c.intake);
      draft.title = c.poisonTitle;
      const body = buildAgreementPreviewText(draft, {
        starterPreview: false,
        premiumDeliverablePreview: true,
        intakeText: c.intake,
      });
      const heading = firstNonEmptyLine(body);
      assertHeadingLineHealthy(heading);
      expect(heading).toMatch(c.headingPattern);
    });
  }

  it("collapses pasted duplicate full title in substantive heading (starter)", () => {
    const intake =
      "Services agreement between Helix Labs LLC and Orbit Studios LLC. Fee $8,000 per month. Term 12 months. Work includes API integration, uptime monitoring, quarterly roadmap reviews, and security assessments.";
    const draft = runIntake(intake);
    const dup = "Services AgreementServices Agreement";
    draft.title = dup;
    const body = buildAgreementPreviewText(draft, { starterPreview: true, intakeText: intake });
    const heading = firstNonEmptyLine(body);
    assertHeadingLineHealthy(heading);
    expect(heading).toMatch(/^SERVICES AGREEMENT$/i);
  });

  it("strips repeated first word before Agreement tail (starter)", () => {
    const intake =
      "Consulting agreement between Helix Labs LLC and Orbit Studios LLC. Retainer $12,000 per month. Term 18 months. Scope covers GTM strategy, hiring support, and vendor diligence.";
    const draft = runIntake(intake);
    draft.title = "Consulting Consulting Agreement";
    const body = buildAgreementPreviewText(draft, { starterPreview: true, intakeText: intake });
    const heading = firstNonEmptyLine(body);
    assertHeadingLineHealthy(heading);
    expect(heading).toMatch(/^CONSULTING AGREEMENT$/i);
  });
});
