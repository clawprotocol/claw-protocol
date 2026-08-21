import { beforeEach, describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import {
  buildPremiumRecipientCandidatesFromIntake,
  classifyLongPremiumHttpOutcome,
  clearFrozenPremiumSessionBodiesForTests,
  freezeAcceptedPremiumBodyForSession,
  getFrozenPremiumBodyForSession,
  isTruncatedKeepSoTResponse,
  resolvePremiumBodyAgainstSessionFreeze,
  shouldSuppressShortFallbackOverLongCandidate,
  TRUNCATED_KEEP_SOT_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";

function padToLen(core: string, minLen: number): string {
  let t = core;
  const clause = " The parties shall perform in good faith. ";
  while (t.length < minLen) t += clause;
  return t;
}

describe("premiumAcceptancePolicy", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
  });

  it("maps needs_details + 27k body to authoritative_draft_complete_with_recommended_clarifications", () => {
    const body = padToLen(buildIroncladPremiumFullDraftBody(), 27_000);
    const outcome = classifyLongPremiumHttpOutcome({
      documentText: body,
      missingMaterial: ["Confirm insurance certificate wording"],
      serverOutcome: "needs_details",
      fatalPlaceholderCount: 0,
      httpOk: true,
    });
    expect(outcome).toBe("authoritative_draft_complete_with_recommended_clarifications");
  });

  it("suppresses short fallback when long candidate is frozen", () => {
    expect(shouldSuppressShortFallbackOverLongCandidate(27_000, 4_205)).toBe(true);
    expect(shouldSuppressShortFallbackOverLongCandidate(12_000, 4_205)).toBe(false);
  });

  it("second shorter response does not overwrite frozen long body for session", () => {
    const longBody = padToLen("LONG CORPUS", 27_000);
    freezeAcceptedPremiumBodyForSession("gen-freeze-1", longBody, "server_full_draft");
    const resolved = resolvePremiumBodyAgainstSessionFreeze("gen-freeze-1", "SHORT".repeat(400), "fallback_preview");
    expect(resolved.usedFreeze).toBe(true);
    expect(resolved.body.length).toBeGreaterThan(20_000);
    expect(getFrozenPremiumBodyForSession("gen-freeze-1")?.body.length).toBeGreaterThan(20_000);
  });

  it("rejectPremiumBodyForProRender stays validate-only on long ironclad body", () => {
    const body = padToLen(buildIroncladPremiumFullDraftBody(), 27_000);
    const snapshot = body;
    const r = rejectPremiumBodyForProRender(body, {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      intakeLower: IRONCLAD_JOINT_ROLLOUT_INTAKE.toLowerCase(),
      partyNames: [...IRONCLAD_PARTIES],
    });
    expect(body).toBe(snapshot);
    expect(r.ok).toBe(true);
  });

  it("buildPremiumRecipientCandidatesFromIntake preserves five contacts with names and emails", () => {
    const rc = buildPremiumRecipientCandidatesFromIntake(IRONCLAD_PARTIES, IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(rc).toHaveLength(5);
    expect(rc.filter((c) => c.email.includes("@")).length).toBe(5);
    expect(rc.filter((c) => c.name.trim().length > 2).length).toBe(5);
    expect(rc.filter((c) => c.role.trim().length > 2).length).toBeGreaterThanOrEqual(4);
  });

  describe("isTruncatedKeepSoTResponse (PR #41 backend 200-keep)", () => {
    it("returns true for output_truncated with generation_ok=true, retryable=false, body >= 1600", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: 1600,
        }),
      ).toBe(true);
    });

    it("returns true for premium_generation_insufficient with generation_ok=true, retryable=false, body >= 1600", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "premium_generation_insufficient",
          documentTextLen: 2000,
        }),
      ).toBe(true);
    });

    it("returns false when generation_ok is false", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: false,
          retryable: true,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: 1600,
        }),
      ).toBe(false);
    });

    it("returns false when retryable is true", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: true,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: 1600,
        }),
      ).toBe(false);
    });

    it("returns false when generation_outcome is not degraded", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "ok",
          failureCode: "output_truncated",
          documentTextLen: 1600,
        }),
      ).toBe(false);
    });

    it("returns false when failure_code is not in truncated-keep set (e.g. json_parse)", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "json_parse",
          documentTextLen: 1600,
        }),
      ).toBe(false);
    });

    it("returns false when failure_code is airlock_blocked", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "airlock_blocked",
          documentTextLen: 1600,
        }),
      ).toBe(false);
    });

    it("returns false when document_text_len < 1600", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: 1599,
        }),
      ).toBe(false);
    });

    it("accepts 1600 exactly (boundary)", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: TRUNCATED_KEEP_SOT_MIN_LEN,
        }),
      ).toBe(true);
    });

    it("accepts 4000 (4k body)", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "premium_generation_insufficient",
          documentTextLen: 4000,
        }),
      ).toBe(true);
    });

    it("accepts 8000 (8k body)", () => {
      expect(
        isTruncatedKeepSoTResponse({
          generationOk: true,
          retryable: false,
          generationOutcome: "degraded",
          failureCode: "output_truncated",
          documentTextLen: 8000,
        }),
      ).toBe(true);
    });
  });
});
