import { describe, expect, it } from "vitest";
import {
  isPaidProFinishedAgreement,
  isUnacceptablePipelineProSource,
  rejectCrossPromptContamination,
  rejectPaidProStitchedOrThinShell,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";

describe("paid pro corpus acceptance", () => {
  it("rejects estate intake with founder/vesting/60-40 body (cross-prompt)", () => {
    const rawIntake = "My siblings need rules for dad's estate tonight.";
    const t =
      "The parties agree to a 60/40 vesting arrangement between two founders and a four-year cliff for founder equity.";
    const x = rejectCrossPromptContamination(t, rawIntake.toLowerCase());
    expect(x.ok).toBe(false);
    const v = validatePaidProOutput({ text: t, rawIntake });
    expect(v.ok).toBe(false);
  });

  it("rejects stitched LawDog pro preview intro as paid output", () => {
    const rawIntake = "We need a simple referral agreement for two parties.";
    const t =
      "This LawDog Pro preview organizes your structured fields into fuller sections for serious review.\n\n1. Scope\n2. Payment\n3. Term\n4. Law\n5. Termination";
    const s = rejectPaidProStitchedOrThinShell(t, rawIntake);
    expect(s.ok).toBe(false);
  });

  it("flags unacceptable pipeline sources for pro", () => {
    expect(isUnacceptablePipelineProSource("fallback_preview")).toBe(true);
    expect(isUnacceptablePipelineProSource("rejected_paid_corpus")).toBe(true);
    expect(isUnacceptablePipelineProSource("stale_intake")).toBe(true);
    expect(isUnacceptablePipelineProSource("server_full_draft")).toBe(false);
  });

  it("pro surface fails when readonly is server but pipeline is fallback (not a finished pro agreement)", () => {
    const text =
      "This LawDog Pro preview organizes your structured fields into fuller sections for serious review.\n\nBody text that would otherwise be long enough.";
    const r = isPaidProFinishedAgreement({
      text: text,
      rawIntake: "Referral: 20% to Party B on cleared deposits.",
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "fallback_preview",
      stale: false,
    });
    expect(r.ok).toBe(false);
  });
});
