import { describe, expect, it } from "vitest";
import { NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../../../compliance/disclosureCopy";
import type { GuidedCompletionSession } from "./types";
import {
  applyGuidedPostApplyLightPolish,
  buildConsolidatedGuidedRegenerationPrompt,
  detectDuplicateTopicSectionHeadings,
  guidedAnswersPresentInBody,
  materialRewriteHintForGuidedAnswer,
  validateGuidedBulkRegenerationLength,
  validateGuidedPostApplyQuality,
  validateDisclaimerPreserved,
} from "./guidedPostApplyQuality";
import { validateGuidedBulkRegeneration } from "./guidedBulkRegeneration";

function sessionStub(queue: string[], answered: Record<string, string>): GuidedCompletionSession {
  return {
    variables: queue.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question for ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement", "generic_business_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.5,
      affectsSections: [],
    })),
    queue,
    answered,
    skipped: new Set(),
    currentIndex: queue.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: queue.length,
  };
}

function proDraftBody(family: "services" | "nda" | "marketing"): string {
  const disclaimer = `${PRODUCT_NOT_LAW_FIRM}\n${NOT_LEGAL_ADVICE}\n`;
  const title =
    family === "nda"
      ? "MUTUAL NON-DISCLOSURE AGREEMENT"
      : family === "marketing"
        ? "MARKETING SERVICES AGREEMENT"
        : "PROFESSIONAL SERVICES AGREEMENT";
  const section = (n: string, heading: string, body: string) => `${n}. ${heading}\n${body}\n\n`;
  return (
    disclaimer +
    `${title}\n\n` +
    section(
      "1",
      "Services and Scope",
      "Provider will deliver the scoped professional services described in the statement of work with commercially reasonable skill and care consistent with industry standards.",
    ) +
    section(
      "2",
      "Fees and Payment",
      "Client will pay a total fee of $10,000 invoiced net 30 days from receipt of each undisputed invoice for services rendered under this Agreement.",
    ) +
    section(
      "3",
      "Confidentiality",
      "Each party will protect the other party's confidential information using reasonable measures and will use such information only for purposes of performing under this Agreement.",
    ) +
    section(
      "4",
      "Ownership and Work Product",
      "Upon full payment, deliverables created specifically for Client under this Agreement will be owned by Client, subject to Provider's background intellectual property license.",
    ) +
    section(
      "5",
      "Support Expectations",
      "Provider will offer business-hours support with commercially reasonable response times for production incidents affecting deliverables covered by this Agreement.",
    ) +
    section(
      "6",
      "Term and Termination",
      "Either party may terminate this Agreement for convenience upon thirty (30) days' prior written notice to the other party, subject to accrued payment obligations.",
    ) +
    "Schedule A Commercial Terms\nPhase 1: $5,000 due on project kickoff; remaining fees tied to milestone acceptance as described in Section 2.\n"
  );
}

describe("guidedPostApplyQuality", () => {
  it("bulk prompt stresses rewrite-in-place, anti-bloat, and disclaimer preservation", () => {
    const session = sessionStub(["payment_timing", "sla_uptime"], {
      payment_timing: "Monthly $6,000 net 15",
      sla_uptime: "99.9% monthly uptime",
    });
    const prompt = buildConsolidatedGuidedRegenerationPrompt({
      intakeText: "Automation support $6k/mo",
      session,
    });
    expect(prompt).toMatch(/authoritative regeneration/i);
    expect(prompt).toMatch(/do NOT pad length/i);
    expect(prompt).toMatch(/NOT_LEGAL_ADVICE|Not legal advice/i);
    expect(prompt).toMatch(/Monthly \$6,000 net 15/);
    expect(prompt).toMatch(/99\.9%/);
    expect(materialRewriteHintForGuidedAnswer("sla_uptime", "99.9% monthly uptime")).toMatch(/Section 5/);
  });

  it("light polish collapses triple newlines and drops exact duplicate paragraphs", () => {
    const before = "x".repeat(100);
    const dup = "Provider shall invoice Client within fifteen (15) days of milestone acceptance.";
    const after = `1. Services\n\n${dup}\n\n\n${dup}\n\n\n\n2. Fees`;
    const polished = applyGuidedPostApplyLightPolish(before, after);
    expect(polished).not.toMatch(/\n{3,}/);
    expect((polished.match(new RegExp(dup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length).toBe(1);
  });

  it("rejects placeholder regression vs initial Pro draft", () => {
    const before = proDraftBody("services");
    const after = before.replace("net 30", "payment timing: to be confirmed");
    const session = sessionStub(["payment_timing"], { payment_timing: "Net 15 monthly $6,000" });
    const r = validateGuidedPostApplyQuality(before, after, session);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("placeholder_regression");
  });

  it("accepts post-guided body with guided answers in operative sections", () => {
    const before = proDraftBody("nda");
    const after = before
      .replace(
        "net 30 days from receipt",
        "net 15 days from receipt; monthly retainer of $6,000",
      )
      .replace(
        "business-hours support with commercially reasonable response times",
        "99.9% monthly uptime target with service credits for material downtime",
      );
    const session = sessionStub(["payment_timing", "sla_uptime"], {
      payment_timing: "Monthly $6,000 net 15",
      sla_uptime: "99.9% monthly uptime",
    });
    const polished = applyGuidedPostApplyLightPolish(before, after);
    const presence = guidedAnswersPresentInBody(session, polished);
    expect(presence.ok).toBe(true);
    const r = validateGuidedPostApplyQuality(before, polished, session);
    expect(r.ok).toBe(true);
    expect(r.metrics.afterLen).toBeGreaterThanOrEqual(before.length * 0.72);
  });

  it("rejects duplicate numbered topic sections (fees/support stacked)", () => {
    const before = proDraftBody("marketing");
    const after =
      before +
      "\n\n7. Fees and Payment\nDuplicate fee block.\n\n8. Support Expectations\nDuplicate SLA block.\n";
    const dupes = detectDuplicateTopicSectionHeadings(after);
    expect(dupes.length).toBeGreaterThan(0);
    const r = validateGuidedPostApplyQuality(before, after, null);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("duplicate_topic_sections"))).toBe(true);
  });

  it("rejects bloated post-guided output vs initial draft", () => {
    const before = proDraftBody("services");
    const after = before + "\n\n" + "Boilerplate padding. ".repeat(400);
    const len = validateGuidedBulkRegenerationLength(before, after);
    expect(len.ok).toBe(false);
    expect(len.reasons).toContain("output_bloated_vs_initial");
  });

  it("preserves LawDog disclaimers when present in initial draft", () => {
    const before = proDraftBody("services");
    const after = before
      .replace(NOT_LEGAL_ADVICE, "")
      .replace(PRODUCT_NOT_LAW_FIRM, "")
      .replace(/not legal advice/gi, "")
      .replace(/not a law firm/gi, "");
    expect(validateDisclaimerPreserved(before, after)).toBe(false);
    const r = validateGuidedPostApplyQuality(before, after, null);
    expect(r.reasons).toContain("disclaimer_stripped");
  });

  it("validateGuidedBulkRegeneration runs polish + session quality gate", () => {
    const before = proDraftBody("services");
    const session = sessionStub(["payment_timing"], { payment_timing: "Monthly $6,000 net 15" });
    const good = before.replace(
      "net 30 days from receipt",
      "net 15 days from receipt; monthly retainer of $6,000",
    );
    expect(validateGuidedBulkRegeneration(before, good, session).ok).toBe(true);
    const bad = "short";
    expect(validateGuidedBulkRegeneration(before, bad, session).ok).toBe(false);
  });
});
