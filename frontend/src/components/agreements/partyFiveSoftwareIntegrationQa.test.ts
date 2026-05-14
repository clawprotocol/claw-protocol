import { describe, expect, it } from "vitest";

import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildAgreementPreviewText,
  hydrateIdentityPlaceholdersInAgreementPreviewPlain,
} from "./agreementPreviewFromDraft";
import { resolvePremiumRefineApplyOutcome } from "./premiumRefineLateFeeFallback";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  formatAuthoritativeAgreementPartiesHeadline,
  orderedAuthoritativePartyDisplayNames,
} from "../../agreement/handoffPartyDisplay";
import { buildAgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";

const SOFTWARE_INTEGRATION_INTAKE =
  "Create a software integration agreement between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP. Fee $47,500. Term 4 months. Governing law Oklahoma. Include confidentiality, ownership of deliverables after payment, termination rights, dispute resolution, and electronic signatures.";

const PRODUCTION_TERMINATION_INSTR =
  "Revise the termination section to require forty-five (45) days' prior written notice for termination for convenience instead of thirty (30) days. Keep all other commercial, payment, ownership, confidentiality, governing law, dispute resolution, signature, party identity, and project scope terms unchanged.";

const LEAKY_PREMIUM_BODY = `
SOFTWARE INTEGRATION AGREEMENT

This Software Integration Agreement is entered into as of May 1, 2026, by and among Beacon Operations and Party F, Foundryco Inc.., Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners Lp.

${"y".repeat(520)}
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

function runIntake(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(blankParsed(), intake, true, defaultIntakePartyRoleLabels());
}

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

/** Same shape as production premium-refine surgical fallback integration tests. */
function buildFivePartySoftwareIntegrationDocWithThirtyDayConvenience(): string {
  const filler = "Supporting operational text. ".repeat(650);
  const parties =
    "This Software Integration Agreement (the \"Agreement\") is entered into among FoundryCo Inc., " +
    "Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, " +
    "and Coastal Reserve Partners LP.";
  return [
    "# Software Integration Agreement",
    "",
    "## Parties",
    parties,
    "",
    "## Fees and Payment",
    "The Client shall pay a fixed project fee of US$68,500 in accordance with the payment schedule.",
    "",
    "## Term",
    "The initial term of this Agreement is four (4) months from the Effective Date.",
    "",
    "## Governing Law",
    "This Agreement shall be governed by the laws of the State of Oklahoma, without regard to conflicts of law principles.",
    "",
    "## Termination",
    "### Termination for Cause",
    "A party may terminate this Agreement for material breach, subject to a cure period of fifteen (15) calendar days following written notice of the breach.",
    "",
    "### Termination for Convenience",
    "Any Party may terminate its participation in this Agreement for convenience upon thirty (30) days' prior written notice to the other Parties.",
    "",
    "## Notices",
    "Day-to-day project communications may occur by email. Formal notices under Article 10 shall be delivered as set forth in that Article.",
    "",
    "## General",
    filler.trim(),
    "",
    "## Signatures",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    "",
    "FoundryCo Inc.",
    "Beacon Operations And Logistics Group LLC",
    "Apollo Data Services LLC",
    "Smith & Wesson Holdings LLC",
    "Coastal Reserve Partners LP",
  ].join("\n\n");
}

function convenienceClauseWindowAfterConvenienceHeading(visible: string): string {
  const parts = visible.split(/###\s*Termination\s+for\s+Convenience/i);
  if (parts.length < 2) return visible;
  const tail = parts[1] ?? "";
  return (tail.split(/###|(?=\n##\s)/)[0] ?? tail).slice(0, 3200);
}

describe("Five-party software integration prompt — casing in draft, previews, summaries, signatures", () => {
  it("draft.parties carry exact FoundryCo Inc. and Coastal Reserve Partners LP (no Foundryco / Partners Lp)", () => {
    const draft = runIntake(SOFTWARE_INTEGRATION_INTAKE);
    expect(draft.parties.length).toBeGreaterThanOrEqual(5);
    const joined = (draft.parties || []).map((p) => p.name).join("\n");
    expect(joined).toContain("FoundryCo Inc.");
    expect(joined).toContain("Coastal Reserve Partners LP");
    expect(joined).not.toContain("Foundryco");
    expect(joined).not.toMatch(/Partners Lp\b/);
  });

  it("premium preview + edited leaky preview hydrate to exact casing", () => {
    const draft = runIntake(SOFTWARE_INTEGRATION_INTAKE);
    const preview = buildAgreementPreviewText(draft, {
      starterPreview: false,
      premiumDeliverablePreview: true,
      intakeText: SOFTWARE_INTEGRATION_INTAKE,
      paidAuthoritativeProBody: LEAKY_PREMIUM_BODY,
    });
    expect(preview).toContain("FoundryCo Inc.");
    expect(preview).toContain("Coastal Reserve Partners LP");
    expect(preview).not.toContain("Foundryco");
    expect(preview).not.toMatch(/Partners Lp\b/);

    const hydratedLeaky = hydrateIdentityPlaceholdersInAgreementPreviewPlain(
      LEAKY_PREMIUM_BODY,
      draft,
      SOFTWARE_INTEGRATION_INTAKE,
    );
    expect(hydratedLeaky).toContain("FoundryCo Inc.");
    expect(hydratedLeaky).toContain("Coastal Reserve Partners LP");
    expect(hydratedLeaky).not.toContain("Foundryco");
    expect(hydratedLeaky).not.toMatch(/Partners Lp\b/);
  });

  it("signing bridge and send-style headline use exact casing from intake-normalized draft.parties", () => {
    const draft = runIntake(SOFTWARE_INTEGRATION_INTAKE);
    const ad = toAgreementDraft(draft, "ag_sign");
    const bridge = buildAgreementVs01BridgeSession({
      agreementId: ad.id,
      vs01DocumentId: "doc_test",
      draft: ad,
    });
    const allBridgeNames = [bridge.creatorName, ...bridge.counterparties.map((c) => c.name)];
    for (const n of [
      "FoundryCo Inc.",
      "Beacon Operations And Logistics Group LLC",
      "Apollo Data Services LLC",
      "Smith & Wesson Holdings LLC",
      "Coastal Reserve Partners LP",
    ]) {
      expect(allBridgeNames).toContain(n);
    }

    const headline = formatAuthoritativeAgreementPartiesHeadline(ad.parties, SOFTWARE_INTEGRATION_INTAKE);
    expect(headline).toContain("FoundryCo Inc.");
    expect(headline).toContain("Coastal Reserve Partners LP");
    expect(headline).not.toContain("Foundryco");
    expect(headline).not.toMatch(/Partners Lp\b/);
  });

  it("handoff ordered names recover intake casing when persisted party rows briefly drift", () => {
    const draft = runIntake(SOFTWARE_INTEGRATION_INTAKE);
    const ad = toAgreementDraft(draft, "ag_drift");
    const parties = [...(ad.parties || [])];
    const iFoundry = parties.findIndex((p) => /foundry/i.test(p.name));
    const iCoastal = parties.findIndex((p) => /coastal/i.test(p.name));
    expect(iFoundry).toBeGreaterThanOrEqual(0);
    expect(iCoastal).toBeGreaterThanOrEqual(0);
    if (parties[iFoundry]) parties[iFoundry] = { ...parties[iFoundry]!, name: "Foundryco Inc." };
    if (parties[iCoastal]) parties[iCoastal] = { ...parties[iCoastal]!, name: "Coastal Reserve Partners Lp" };
    const drift: AgreementDraft = { ...ad, parties };

    const ordered = orderedAuthoritativePartyDisplayNames(drift.parties, SOFTWARE_INTEGRATION_INTAKE);
    expect(ordered).toContain("FoundryCo Inc.");
    expect(ordered).toContain("Coastal Reserve Partners LP");
    expect(ordered.join("\n")).not.toContain("Foundryco");
    expect(ordered.join("\n")).not.toMatch(/Partners Lp\b/);
  });
});

describe("Five-party software integration — termination convenience 30→45 visible corpus", () => {
  it("hydrated final visible text shows forty-five (45) days, not thirty (30) convenience phrasing, and a single convenience subclause", () => {
    const doc = buildFivePartySoftwareIntegrationDocWithThirtyDayConvenience();
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: doc,
      baselineText: doc,
      baselineLen: doc.length,
      summaryChanges: [PRO_REFINE_UNAVAILABLE_USER_MESSAGE],
      userInstruction: PRODUCTION_TERMINATION_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(true);

    const draft = runIntake(SOFTWARE_INTEGRATION_INTAKE);
    const visible = hydrateIdentityPlaceholdersInAgreementPreviewPlain(
      resolved.finalText,
      draft,
      SOFTWARE_INTEGRATION_INTAKE,
    );

    const win = convenienceClauseWindowAfterConvenienceHeading(visible);
    expect(win).toMatch(/forty-five\s*\(\s*45\s*\)/i);
    expect(win).not.toMatch(/thirty\s*\(\s*30\s*\)\s*days['']?\s+prior\s+written\s+notice/i);
    expect((visible.match(/###\s*Termination\s+for\s+Convenience/gi) || []).length).toBe(1);
    expect((visible.match(/^##\s+Termination\s*$/gim) || []).length).toBe(1);

    expect(visible).toContain("FoundryCo Inc.");
    expect(visible).toContain("Coastal Reserve Partners LP");
  });
});
