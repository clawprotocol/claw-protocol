import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canShowPremiumSuccess } from "./premiumSuccessGate";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

/** Guardrails: post-checkout Pro must not surface these as default user-visible strings. */
const BANNED = [
  "quality gate",
  "couldn't finish the pro agreement cleanly",
  "not a finished pro agreement",
  "thin starter outline",
];

/** Canonical substantive corpus that remains review-ready after tip normalize. */
const SUBSTANTIVE_BODY = expandOperativeCorpusWithUniqueSupplements(
  SHARED_ACCEPTED_PAID_BODY,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
);

describe("AgreementBuilderIntake Pro copy guard", () => {
  it("source does not include banned post-checkout Pro phrases", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    for (const b of BANNED) {
      expect(s.toLowerCase().includes(b.toLowerCase()), `banned: ${b}`).toBe(false);
    }
  });

  it("parseDraft distinguishes basic vs premium parse timeout abort reasons", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("basic_parse_timeout");
    expect(s).toContain("premium_parse_timeout");
  });
});

describe("canShowPremiumSuccess paid fallback", () => {
  it("allows success + signers for substantive stitched body when flag set", () => {
    const intent = resolveAgreementIntentContract("We need a software build for the tenant portal.");
    expect(SUBSTANTIVE_BODY.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: SUBSTANTIVE_BODY,
      intakeText: "x",
      // Tip blocks ineligible fallback_* pipelines even with stitch; use an eligible source.
      premiumPipelineSource: "server_full_draft",
      stale: false,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.state).toBe("premium_success");
    expect(r.signerCtaAllowed).toBe(true);
  });

  it("treats substantive body as success even for live preview render source when allowPaidSubstantiveStitch", () => {
    const intent = resolveAgreementIntentContract("Software and API build.");
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: SUBSTANTIVE_BODY,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.state).toBe("premium_success");
    expect(r.signerCtaAllowed).toBe(true);
  });

  it("rejects ineligible fallback_preview pipeline even with substantive stitch body", () => {
    const intent = resolveAgreementIntentContract("Software and API build.");
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: SUBSTANTIVE_BODY,
      intakeText: "x",
      premiumPipelineSource: "fallback_preview",
      stale: false,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.state).toBe("premium_retry_available");
    expect(r.signerCtaAllowed).toBe(false);
  });

  it("still blocks when quality retry is active, even with substantive stitch allowed", () => {
    const intent = resolveAgreementIntentContract("x");
    const r = canShowPremiumSuccess({
      intentContract: intent,
      renderSource: "live_generated_preview",
      validation: { ok: true, reasons: [] },
      documentText: SUBSTANTIVE_BODY,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
      qualityRetryActive: true,
      allowPaidSubstantiveStitch: true,
    });
    expect(r.signerCtaAllowed).toBe(false);
  });
});
