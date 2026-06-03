import { afterEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import {
  getPaidProDocumentForSurface,
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  buildDefaultProVisiblePaperCandidates,
  buildVisibleProPaperCollisionForensics,
  isForbiddenPaidProVisiblePaperSource,
  normalizeVisibleProPaperComparePlain,
  PAID_PRO_VISIBLE_PAPER_FINALIZING_MESSAGE,
  resolveVisibleProPaperBoundary,
  setVisibleProPaperDiagnosticsForceEnabledForTests,
  stripHtmlToPlainForProPaperCompare,
} from "./visibleProPaperRenderBoundary";

const RED_MESA_INTAKE =
  "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup services. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";

const RED_MESA_FREE = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Red Mesa and Harbor Peak for workflow setup.",
  "Fee: $5,000. Texas law. Electronic signatures allowed.",
].join("\n");

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
  " ".repeat(1200),
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

describe("visibleProPaperRenderBoundary", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    setVisibleProPaperDiagnosticsForceEnabledForTests(false);
  });

  it("rejects accepted_review as paid Pro visible source", () => {
    const candidates = buildDefaultProVisiblePaperCandidates({
      acceptedReviewText: RED_MESA_FREE,
      paidProSourceOfTruthText: RED_MESA_PRO,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: RED_MESA_FREE,
      declaredSource: "accepted_review",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.blocked).toBe(true);
    expect(res.showFinalizing).toBe(true);
    expect(res.plain).not.toBe(RED_MESA_FREE);
    expect(isForbiddenPaidProVisiblePaperSource("accepted_review")).toBe(true);
  });

  it("rejects free_starter as paid Pro visible source", () => {
    const candidates = buildDefaultProVisiblePaperCandidates({
      freeStarterText: RED_MESA_FREE,
      paidProSourceOfTruthText: RED_MESA_PRO,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: RED_MESA_FREE,
      declaredSource: "free_starter",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.isFreeBodyMatch).toBe(true);
    expect(res.plain).not.toBe(RED_MESA_FREE);
  });

  it("recovers to authoritative Pro instead of showing degraded free body when paid Pro is established", () => {
    clearPaidProSourceOfTruth();
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const record = getPaidProSourceOfTruth()!;
    expect(record.text).toBe(acceptedText);
    const candidates = buildDefaultProVisiblePaperCandidates({
      freeStarterText: RED_MESA_FREE,
      paidProSourceOfTruthText: record.text,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: RED_MESA_FREE,
      declaredSource: "rendered_preview",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.plain).not.toBe(RED_MESA_FREE);
    expect(res.plain === "" || res.plain === record.text).toBe(true);
    if (res.plain === "") {
      expect(res.showFinalizing).toBe(true);
      expect(PAID_PRO_VISIBLE_PAPER_FINALIZING_MESSAGE).toContain("Finalizing");
    }
    clearPaidProSourceOfTruth();
  });

  it("allows authoritative paid Pro body when established", () => {
    clearPaidProSourceOfTruth();
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const record = getPaidProSourceOfTruth()!;
    const candidates = buildDefaultProVisiblePaperCandidates({
      paidProSourceOfTruthText: record.text,
      freeStarterText: RED_MESA_FREE,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: record.text,
      declaredSource: "paid_pro_review_surface",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.blocked).toBe(false);
    expect(res.plain).toBe(record.text);
    expect(res.collision).toBeNull();
    clearPaidProSourceOfTruth();
  });

  it("does not report hash_mismatch when render plain matches SoT but HTML strip would differ", () => {
    clearPaidProSourceOfTruth();
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const record = getPaidProSourceOfTruth()!;
    const renderPlain = normalizeVisibleProPaperComparePlain(record.text);
    const html = buildPremiumAgreementReadonlyHtml(renderPlain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      suppressDocumentIntelligenceCallouts: true,
      forceEmbeddedCorpusSignature: true,
    });
    const htmlStrip = stripHtmlToPlainForProPaperCompare(html);
    expect(htmlStrip).not.toBe(renderPlain);

    const candidates = buildDefaultProVisiblePaperCandidates({
      paidProSourceOfTruthText: record.text,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: renderPlain,
      declaredSource: "paid_pro_review_surface",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.collision).not.toBe("hash_mismatch_authoritative");
    expect(res.plain).toBe(record.text);

    const forensics = buildVisibleProPaperCollisionForensics({
      renderedPlain: renderPlain,
      declaredSource: "paid_pro_review_surface",
      candidates,
      htmlRoundTripPlain: htmlStrip,
    });
    expect(forensics).toBeNull();
  });

  it("reports hash_mismatch and forensics for true plain-text drift", () => {
    clearPaidProSourceOfTruth();
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const record = getPaidProSourceOfTruth()!;
    const drifted = `${record.text}\n\nEXTRA DRIFT LINE.`;
    const candidates = buildDefaultProVisiblePaperCandidates({
      paidProSourceOfTruthText: record.text,
    });
    const res = resolveVisibleProPaperBoundary({
      visiblePlain: drifted,
      declaredSource: "paid_pro_review_surface",
      candidates,
      intakeText: RED_MESA_INTAKE,
      draft: redMesaDraft,
      paidProReviewSurface: true,
    });
    expect(res.collision).toBe("hash_mismatch_authoritative");
    expect(res.plain).toBe(record.text);

    const forensics = buildVisibleProPaperCollisionForensics({
      renderedPlain: drifted,
      declaredSource: "paid_pro_review_surface",
      candidates,
    });
    expect(forensics).not.toBeNull();
    expect(forensics!.authoritativeHash).toBe(record.hash);
    expect(forensics!.renderedPlainHash).not.toBe(record.hash);
    expect(forensics!.firstDiffOffset).toBeGreaterThan(0);
    expect(forensics!.normalizedComparison).toMatch(/first_diff_at=/);
    expect(forensics!.responsibleLayer).toContain("renderPlain");
  });

  it("review surface plain matches SoT when signer metadata is not applied", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const source = getPaidProSourceOfTruth();
    expect(source).not.toBeNull();
    const review = getPaidProDocumentForSurface("review", {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(review?.text).toBe(source!.text);
    expect(review?.hash).toBe(source!.hash);
    expect(normalizeVisibleProPaperComparePlain(review!.text)).toBe(
      normalizeVisibleProPaperComparePlain(acceptedText),
    );
  });
});
