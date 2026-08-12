import { describe, expect, it } from "vitest";
import {
  applyAcceptedProCorpusSafeDisplay,
} from "./acceptedProCorpusSafeDisplay";
import {
  analyzeTemplatePlaceholderFragments,
  finalizeUserVisibleAgreementPlainText,
} from "./agreementTemplatePlaceholderSafety";
import {
  establishAcceptedPremiumCanonicalCorpus,
  getAcceptedPremiumCanonicalText,
} from "./acceptedPremiumCanonicalCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
const MINIMAL_SERVICES_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import {
  isHarmlessEntityMetadataBracketToken,
  neutralizeHarmlessEntityMetadataPlaceholders,
} from "./harmlessEntityMetadataPlaceholders";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const structured: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Provider" },
  ],
  purpose: "AI workflow setup.",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

function padEntityMetadataBody(core: string, minLen = 6_500): string {
  // Varied pad lines so safe-display does not collapse repetitive filler below acceptance floors.
  const fillers = [
    " Provider will deliver AI workflow setup and related automation services for Client. ",
    " Client will pay Provider $5,000 as total consideration for the Services. ",
    " This Agreement is governed by the laws of the State of Texas without conflict rules. ",
    " The parties may execute this Agreement using electronic signatures and counterparts. ",
    " Confidential information remains protected and may be used only for the engagement. ",
    " Notices under this Agreement may be given by email to designated party representatives. ",
  ];
  let t = core;
  let i = 0;
  while (t.length < minLen) {
    t += fillers[i % fillers.length];
    i += 1;
  }
  return t;
}

const entityMetadataDraftCore = `
SERVICES AGREEMENT

This Agreement is between Red Mesa Logistics LLC, a [State] corporation with principal place of business at [Address], [State], and Harbor Peak Automation LLC, a [State] corporation with principal place of business at [Address], [State].

Scope: AI workflow setup and related professional services.
Fees: Client shall pay Provider $5,000.
Governing law: State of Texas.
Electronic signatures are permitted.

IN WITNESS WHEREOF, the parties execute this Agreement.
`;

describe("harmless entity metadata placeholders", () => {
  it("detects harmless entity-metadata bracket tokens", () => {
    expect(isHarmlessEntityMetadataBracketToken("[State]")).toBe(true);
    expect(isHarmlessEntityMetadataBracketToken("[Address]")).toBe(true);
    expect(isHarmlessEntityMetadataBracketToken("[state of incorporation]")).toBe(true);
    expect(isHarmlessEntityMetadataBracketToken("[CLIENT NAME]")).toBe(false);
  });

  it("neutralizes incorporation and address bracket phrases", () => {
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    const { text, repairs } = neutralizeHarmlessEntityMetadataPlaceholders(raw);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\[State\]|\[Address\]/);
    expect(text).toContain("Red Mesa Logistics LLC");
    expect(text).toContain("Harbor Peak Automation LLC");
    expect(text).toContain("$5,000");
    expect(text).toContain("State of Texas");
  });

  it("classifies entity-metadata brackets as non-fatal", () => {
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    const decisions = analyzeTemplatePlaceholderFragments(raw, {
      intakeRaw: MINIMAL_SERVICES_INTAKE,
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    const stateAddress = decisions.filter((d) => /\[State\]|\[Address\]/i.test(d.token));
    expect(stateAddress.length).toBeGreaterThan(0);
    expect(stateAddress.every((d) => !d.fatal)).toBe(true);
  });

  it("accepts long server_full_draft with entity-metadata placeholders after safe display", () => {
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    expect(raw.length).toBeGreaterThan(1_500);
    const safe = applyAcceptedProCorpusSafeDisplay(raw, {
      draft: structured,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    // Safe display may compact repetitive pad; placeholders must be gone and body still accept.
    expect(safe.text.length).toBeGreaterThan(800);
    expect(safe.text).not.toMatch(/\[State\]|\[Address\]/);
    const acc = rejectPremiumBodyForProRender(safe.text, {
      intakeText: MINIMAL_SERVICES_INTAKE,
      intakeLower: MINIMAL_SERVICES_INTAKE.toLowerCase(),
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(acc.ok, acc.reasons.join(", ")).toBe(true);
    expect(acc.reasons.some((r) => r.startsWith("placeholder:[State]"))).toBe(false);
  });

  it("finalizeUserVisibleAgreementPlainText passes after entity-metadata cleanup", () => {
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: MINIMAL_SERVICES_INTAKE,
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      surface: "premium_completion_pipeline",
      agreementFamily: "services_agreement",
    });
    expect(fin.ok, fin.remainingFatal.join(", ")).toBe(true);
    expect(fin.text).not.toMatch(/\[State\]|\[Address\]/);
  });

  it("establishes paidProSourceOfTruth from cleaned server draft", () => {
    clearPaidProSourceOfTruth();
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    const cleaned = applyAcceptedProCorpusSafeDisplay(raw, {
      draft: structured,
      intakeText: MINIMAL_SERVICES_INTAKE,
    }).text;
    expect(cleaned).not.toMatch(/\[State\]|\[Address\]/);
    markPaidProPipelineValidationPassed({ text: cleaned, source: "server_full_draft" });
    const record = establishPaidProSourceOfTruth({
      text: cleaned,
      draft: structured,
      intakeText: MINIMAL_SERVICES_INTAKE,
      source: "server_full_draft",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(record.text).not.toMatch(/\[State\]|\[Address\]/);
    expect(getPaidProDocumentForSurface("display")?.text).toBe(record.text);
    expect(getPaidProDocumentForSurface("copy")?.text).toBe(record.text);
    clearPaidProSourceOfTruth();
  });

  it("establishAcceptedPremiumCanonicalCorpus uses cleaned text for all surfaces", () => {
    clearPaidProSourceOfTruth();
    const raw = padEntityMetadataBody(entityMetadataDraftCore);
    const cleaned = applyAcceptedProCorpusSafeDisplay(raw, {
      draft: structured,
      intakeText: MINIMAL_SERVICES_INTAKE,
    }).text;
    expect(cleaned).not.toMatch(/\[State\]|\[Address\]/);
    markPaidProPipelineValidationPassed({ text: cleaned, source: "server_full_draft" });
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: cleaned,
      draft: structured,
      intakeText: MINIMAL_SERVICES_INTAKE,
      pipelineSource: "server_full_draft",
    });
    expect(record.text).not.toMatch(/\[State\]|\[Address\]/);
    expect(getAcceptedPremiumCanonicalText()).toBe(record.text);
    clearPaidProSourceOfTruth();
  });
});
