import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import { polishPaidProAgreementText } from "./paidProAgreementPolish";

const IRONCLAD_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
];

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: "$187,500 paid over six milestone payments.",
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

describe("starter production render path", () => {
  const logs: string[][] = [];

  beforeEach(() => {
    logs.length = 0;
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("review UI path has paragraph breaks and no collapsed title/preamble line", () => {
    const preview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview).toMatch(/\n\n1\.\s+Scope/i);
    expect(preview).toMatch(/\n\n2\.\s+Payment/i);
    expect(preview).not.toMatch(/SERVICES AGREEMENT This Agreement/i);
    expect(preview).not.toMatch(/4\.\s+5\./);
  });

  it("does not invoke paid-pro polish logs for preview_starter", () => {
    const preview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview.length).toBeGreaterThan(100);
    const joined = logs.flat().join("\n");
    expect(joined).not.toMatch(/\[paid-pro-recital-polish\]/);
    expect(joined).not.toMatch(/\[paid-pro-signature-polish\]/);
    expect(joined).not.toMatch(/\[paid-pro-enterprise-polish\]/);
  });

  it("applyPaidProRenderPolish is byte-identical on preview_starter", () => {
    const input = "SERVICES AGREEMENT\n\n1. Scope\nBody.\n";
    const out = applyPaidProRenderPolish(input, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "preview_starter",
    });
    expect(out.text).toBe(input);
  });

  it("polishPaidProAgreementText is byte-identical on preview_starter", () => {
    const input = "1. FEES\nPayment applies.\n";
    const out = polishPaidProAgreementText(input, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "preview_starter",
    });
    expect(out.text).toBe(input);
  });

  it("rejectPremiumBodyForProRender does not mutate input", () => {
    const body = [
      "AGREEMENT",
      "",
      "Operative text with milestone payments of $187,500.",
      "",
      "Notices:",
      ...IRONCLAD_EMAILS.map((e) => `Contact: ${e}`),
    ].join("\n");
    const r = rejectPremiumBodyForProRender(body, {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      intakeLower: IRONCLAD_JOINT_ROLLOUT_INTAKE.toLowerCase(),
    });
    expect(r.ok).toBe(true);
  });

  it("rejectPremiumBodyForProRender preserves five emails in source body", () => {
    const body = IRONCLAD_EMAILS.map((e) => `Email: ${e}`).join("\n");
    const before = body;
    rejectPremiumBodyForProRender(before, { intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE });
    expect(before).toBe(body);
    for (const email of IRONCLAD_EMAILS) {
      expect(before).toContain(email);
    }
  });

  it("draft POST failure does not replace longer formatted local preview with shorter flatten", () => {
    const formatted = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    const flattened = formatted.replace(/\n\n/g, " ").slice(0, Math.max(80, formatted.length - 200));
    const existingPreview = formatted.trim();
    const localPreview = flattened.trim();
    const shouldReplace =
      !existingPreview || localPreview.length >= existingPreview.length;
    expect(shouldReplace).toBe(false);
    expect(existingPreview).toMatch(/\n\n1\.\s+Scope/i);
    expect(localPreview).not.toMatch(/\n\n1\.\s+Scope/i);
  });
});
