/**
 * Regression: Pro full-document preview must not surface raw [ORG_n] tokens, and
 * {@link getDraftFirstReviewBlocker} must consult the same user-visible corpus string.
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildAgreementPreviewText,
  hydrateIdentityPlaceholdersInAgreementPreviewPlain,
} from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  draftHasPlaceholderFieldsForRecipients,
  getDraftFirstReviewBlocker,
} from "./reviewPlaceholderGuard";
import {
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import * as previewFromDraft from "./agreementPreviewFromDraft";

const EXACT_SOFTWARE_INTEGRATION_PROMPT =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. Fee $47,500. Term 4 months. Governing law Oklahoma. Include confidentiality, ownership of deliverables after payment, termination rights, dispute resolution, and electronic signatures.";

const CORRUPT_PRO_BODY = `
SOFTWARE INTEGRATION AGREEMENT

Between [ORG_1] and Beacon Operations and [ORG_6].

The parties [ORG_1], [ORG_3], and Smith & [ORG_4] agree to integrate systems.

Signature page:
_________________________
[ORG_1]

_________________________
[ORG_3]

_________________________
Smith & [ORG_4]

_________________________
Coastal Reserve Partners Lp

${"—".repeat(520)}
`.trim();

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

function runStarterIntake(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(blankParsed(), intake, true, defaultIntakePartyRoleLabels());
}

const twoPartyBase = (parties: ParsedDraftShape["parties"]): ParsedDraftShape => ({
  title: "Software Integration Agreement",
  jurisdiction: "Oklahoma",
  parties,
  purpose: "Integration scope.",
  payment_terms: "Fee $47,500.",
  duration: "4 months",
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: true },
});

describe("premium identity corpus + preview guard", () => {
  it("detects unresolved identity tokens in raw full document before display hydration (structured parties look fine)", () => {
    const draft = twoPartyBase([
      { name: "Jane Smith", role: "party" },
      { name: "Acme LLC", role: "party" },
    ]);
    const raw = `${"x".repeat(500)} [ORG_1]`;
    expect(textContainsUnresolvedIdentityPlaceholders(raw)).toBe(true);
    expect(draftHasPlaceholderFieldsForRecipients(draft)).toBe(false);
    expect(getDraftFirstReviewBlocker(draft)).toBe(null);
  });

  it("fail-closed: getDraftFirstReviewBlocker reports identity_placeholder_in_corpus when hydration is a no-op", () => {
    const spy = vi.spyOn(previewFromDraft, "hydrateIdentityPlaceholdersInAgreementPreviewPlain").mockImplementation((t) => t);
    const draft = twoPartyBase([
      { name: "Jane Smith", role: "party" },
      { name: "Acme LLC", role: "party" },
    ]);
    const raw = `${"x".repeat(500)} [ORG_1]`;
    expect(getDraftFirstReviewBlocker(draft, { userVisibleFullDocumentPlain: raw })).toBe("identity_placeholder_in_corpus");
    spy.mockRestore();
  });

  it("buildAgreementPreviewText (paid authoritative path) strips [ORG_*] and preserves all five authoritative parties", () => {
    const structured = runStarterIntake(EXACT_SOFTWARE_INTEGRATION_PROMPT);
    expect(structured.parties?.length).toBe(5);
    const out = buildAgreementPreviewText(structured, {
      starterPreview: false,
      premiumDeliverablePreview: true,
      intakeText: EXACT_SOFTWARE_INTEGRATION_PROMPT,
      paidAuthoritativeProBody: CORRUPT_PRO_BODY,
    });
    expect(textContainsUnresolvedIdentityPlaceholders(out)).toBe(false);
    expect(out).not.toMatch(/\[ORG_/i);
    const lower = out.toLowerCase();
    expect(lower).toContain("foundryco");
    expect(lower).toContain("beacon operations");
    expect(lower).toContain("apollo data services");
    expect(out).toMatch(/Smith\s*&\s*Wesson/i);
    expect(lower).toContain("coastal reserve partners");
    expect(out).not.toMatch(/Smith\s*&\s*Smith\s*&/i);
  });

  it("hydrateIdentityPlaceholdersInAgreementPreviewPlain matches authoritative slot order for mixed fragments", () => {
    const structured = runStarterIntake(EXACT_SOFTWARE_INTEGRATION_PROMPT);
    const hydrated = hydrateIdentityPlaceholdersInAgreementPreviewPlain(
      CORRUPT_PRO_BODY,
      structured,
      EXACT_SOFTWARE_INTEGRATION_PROMPT,
    );
    expect(textContainsUnresolvedIdentityPlaceholders(hydrated)).toBe(false);
    expect(hydrated).not.toMatch(/\[ORG_/i);
  });

  it("getDraftFirstReviewBlocker is clean once the same string is display-hydrated", () => {
    const structured = runStarterIntake(EXACT_SOFTWARE_INTEGRATION_PROMPT);
    const preview = buildAgreementPreviewText(structured, {
      starterPreview: false,
      premiumDeliverablePreview: true,
      intakeText: EXACT_SOFTWARE_INTEGRATION_PROMPT,
      paidAuthoritativeProBody: CORRUPT_PRO_BODY,
    });
    expect(getDraftFirstReviewBlocker(structured, { userVisibleFullDocumentPlain: preview })).toBe(null);
  });

  it("signature-style lines contain real party names only (no raw tokens)", () => {
    const structured = runStarterIntake(EXACT_SOFTWARE_INTEGRATION_PROMPT);
    const hydrated = substitutePartyPlaceholdersInUserFacingText(
      CORRUPT_PRO_BODY,
      EXACT_SOFTWARE_INTEGRATION_PROMPT,
      (structured.parties || []).map((p) => p.name),
    );
    expect(hydrated).not.toMatch(/\[ORG_/i);
    expect(hydrated.toLowerCase()).toContain("foundryco");
    expect(hydrated).toMatch(/Smith\s*&\s*Wesson/i);
  });
});
