import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canShowPremiumSuccess } from "./premiumSuccessGate";
import { resolveAgreementIntentContract } from "./agreementIntentContract";

/** Guardrails: post-checkout Pro must not surface these as default user-visible strings. */
const BANNED = [
  "quality gate",
  "couldn't finish the pro agreement cleanly",
  "not a finished pro agreement",
  "thin starter outline",
];

describe("AgreementBuilderIntake Pro copy guard", () => {
  it("source does not include banned post-checkout Pro phrases", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    for (const b of BANNED) {
      expect(s.toLowerCase().includes(b.toLowerCase()), `banned: ${b}`).toBe(false);
    }
  });
});

describe("canShowPremiumSuccess paid fallback", () => {
  it("allows success + signers for substantive stitched / fallback when flag set", () => {
    const intent = resolveAgreementIntentContract("We need a software build for the tenant portal.");
    const body = "x".repeat(600);
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: body,
      intakeText: "x",
      premiumPipelineSource: "fallback_preview_error",
      stale: false,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.state).toBe("premium_success");
    expect(r.signerCtaAllowed).toBe(true);
  });

  it("treats substantive body as success even for live preview render source when allowPaidSubstantiveStitch", () => {
    const intent = resolveAgreementIntentContract("Software and API build.");
    const body = "x".repeat(500);
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: body,
      intakeText: "x",
      premiumPipelineSource: "fallback_preview",
      stale: false,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.state).toBe("premium_success");
    expect(r.signerCtaAllowed).toBe(true);
  });

  it("still blocks when quality retry is active, even with substantive stitch allowed", () => {
    const intent = resolveAgreementIntentContract("x");
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: "x".repeat(600),
      intakeText: "x",
      premiumPipelineSource: "fallback_preview",
      stale: false,
      qualityRetryActive: true,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.signerCtaAllowed).toBe(false);
  });
});
