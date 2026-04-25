import { describe, expect, it } from "vitest";
import {
  buildActionAcknowledgementLine,
  buildAgreementIntakeDraft,
  getNextQuestion,
  isGuidedFieldSatisfied,
  resolveGuidedFlowId,
} from "./agreementIntakeDraftModel";
import { GUIDED_FLOW_CONFIGS } from "./guidedFlowConfig";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";

describe("guided flow routing", () => {
  it("NDA config field order matches product spec", () => {
    expect(GUIDED_FLOW_CONFIGS.nda.fieldOrder).toEqual([
      "parties",
      "confidential_scope",
      "confidentiality_structure",
      "duration",
      "extras",
    ]);
    expect(GUIDED_FLOW_CONFIGS.nda.actionAcknowledgement).toContain("NDA");
  });

  it("resolveGuidedFlowId routes NDA phrases", () => {
    const live = buildLiveDraftPreview("nda");
    expect(resolveGuidedFlowId("Simple NDA between two parties", live)).toBe("nda");
  });

  it("resolveGuidedFlowId prefers consulting + LLC over thin confidentiality matches", () => {
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC";
    const live = buildLiveDraftPreview(raw);
    expect(resolveGuidedFlowId(raw, live)).toBe("consulting");
  });

  it("getNextQuestion returns parties first for thin NDA starter", () => {
    const text = "Simple NDA between two parties";
    const live = buildLiveDraftPreview(text);
    const draft = buildAgreementIntakeDraft(text, live);
    const q = getNextQuestion(text, live, draft);
    expect(q).not.toBeNull();
    expect(q?.field).toBe("parties");
    expect(q?.question).toContain("parties");
  });

  it("buildActionAcknowledgementLine uses NDA script", () => {
    expect(buildActionAcknowledgementLine("Simple NDA between two parties")).toBe(
      "✓ Got it — starting a simple NDA",
    );
  });

  it("extras step accepts “draft now” and legacy “draft it” phrases for voice", () => {
    const live = buildLiveDraftPreview("x");
    const draft = buildAgreementIntakeDraft("", live);
    expect(isGuidedFieldSatisfied("extras", draft, "Draft now", live, {})).toBe(true);
    expect(isGuidedFieldSatisfied("extras", draft, "please draft it now", live, {})).toBe(true);
    expect(isGuidedFieldSatisfied("extras", draft, "draft it", live, {})).toBe(true);
  });
});
