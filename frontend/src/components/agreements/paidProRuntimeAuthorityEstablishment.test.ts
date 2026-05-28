import { afterEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import {
  assertPremiumPurposeHandoffBlocked,
  assessPaidProRuntimeAuthority,
  isFalsePaidProAuthoritySourceLabel,
  normalizePaidProCorpusSourceLabel,
} from "./paidProRuntimeAuthorityEstablishment";
import { resolveVisibleProPaperBoundary } from "./visibleProPaperRenderBoundary";

const RED_MESA_PRO = [
  "AI WORKFLOW SETUP SERVICES AGREEMENT",
  "",
  "1. Parties. Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "2. Scope. AI workflow setup services.",
  "3. Payment. $5,000.",
  "4. Acceptance Review. Client may review deliverables.",
  "5. Ownership. Client owns work product upon payment.",
  "6. Confidentiality. Mutual confidentiality applies.",
  "7. Termination. Either party may terminate on notice.",
  "8. Governing Law. Texas.",
  "9. Electronic Signatures. The parties may sign electronically.",
  "10. Miscellaneous. Entire agreement, amendments in writing, counterparts, and severability.",
  " ".repeat(80),
  "Operative detail: Provider will configure automation workflows, CRM integrations, training, and support.",
  " ".repeat(80),
].join("\n");

const redMesaDraft: ParsedDraftShape = {
  title: "AI Workflow Setup Services Agreement",
  jurisdiction: "Texas",
  purpose: "AI workflow setup services",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  agreement_family: "consulting_agreement",
};

describe("paidProRuntimeAuthorityEstablishment", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("imports without circular dependency / TDZ", async () => {
    await expect(import("./paidProAuthorityConstants")).resolves.toMatchObject({
      SEND_HANDOFF_AUTHORITATIVE_MIN_LEN: 500,
    });
    const runtime = await import("./paidProRuntimeAuthorityEstablishment");
    expect(runtime.PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN).toBe(500);
    expect(typeof runtime.assessPaidProRuntimeAuthority).toBe("function");
    const handoff = await import("./sendHandoffAuthoritativeCorpus");
    expect(handoff.SEND_HANDOFF_AUTHORITATIVE_MIN_LEN).toBe(500);
    expect(typeof handoff.pickAuthoritativePlainForSendHandoff).toBe("function");
  });

  it("does not establish authority for live_generated_preview without server corpus", () => {
    const assessment = assessPaidProRuntimeAuthority({
      draft: { premium_render_source: "live_generated_preview" },
      premiumRenderSourceResolved: "live_generated_preview",
    });
    expect(assessment.established).toBe(false);
    expect(assessment.showFinalizingOnly).toBe(true);
    expect(assessment.canRenderProReviewShell).toBe(false);
    expect(assessment.canShowProCtas).toBe(false);
    expect(assessment.reason).toMatch(/live_preview_blocked|forbidden_render_source/);
  });

  it("establishes authority when paidProSourceOfTruth is frozen", () => {
    const frozen = establishPaidProSourceOfTruth({
      text: RED_MESA_PRO,
      draft: redMesaDraft,
      intakeText: "Red Mesa AI workflow $5,000 Texas electronic signatures",
    });
    expect(frozen.text.length).toBeGreaterThanOrEqual(PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const assessment = assessPaidProRuntimeAuthority({
      draft: { premium_render_source: "server_full_document_text" },
      premiumRenderSourceResolved: "server_full_document_text",
    });
    expect(assessment.established).toBe(true);
    expect(assessment.canRenderProReviewShell).toBe(true);
    expect(assessment.hasPaidProSourceOfTruth).toBe(true);
  });

  it("flags false paidProSourceOfTruth label when corpus is empty", () => {
    expect(
      isFalsePaidProAuthoritySourceLabel({
        source: "paidProSourceOfTruth",
        corpusLen: 22,
      }),
    ).toBe(true);
    expect(
      normalizePaidProCorpusSourceLabel({
        source: "paidProSourceOfTruth",
        corpusLen: 22,
      }),
    ).toBe("awaiting_authoritative_pro");
  });

  it("blocks premium purpose handoff in test mode", () => {
    const d: AgreementDraft = {
      id: "p1",
      title: "T",
      jurisdiction: "TX",
      parties: [],
      purpose: "short purpose only",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [],
      audit_log: [],
      premium_render_source: "live_generated_preview",
    };
    expect(() =>
      assertPremiumPurposeHandoffBlocked({
        draft: d,
        field: "purpose",
        text: d.purpose ?? "",
        surface: "test",
      }),
    ).toThrow(/premium-purpose-handoff-blocked/);
    expect(pickAuthoritativePlainForSendHandoff(d)).toBeNull();
  });

  it("Red Mesa live preview runtime shows finalizing not Pro paper", () => {
    const freeBody = "SERVICES AGREEMENT\n\nBetween Red Mesa and Harbor Peak for workflow setup.";
    const boundary = resolveVisibleProPaperBoundary({
      visiblePlain: freeBody,
      declaredSource: "live_generated_preview",
      candidates: [],
      intakeText: "Red Mesa Logistics LLC Harbor Peak Automation LLC AI workflow $5,000 Texas",
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(boundary.blocked).toBe(true);
    expect(boundary.showFinalizing).toBe(true);
    expect(boundary.plain).not.toBe(freeBody);
  });

  it("requires minimum corpus length constant aligned with send handoff", () => {
    expect(PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN).toBeGreaterThanOrEqual(500);
  });
});
