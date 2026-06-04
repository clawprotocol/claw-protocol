import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import { meetsPaidProDegradedRecoveryDisplayRequirements } from "./paidProPostCheckoutRenderGate";
import {
  previewPostCheckoutRecoverySotCommit,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "qa/paidProHardening/fixtures");
const TEST220_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: 8500, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

function buildTest220RecoveryBody(): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc. agree to AI workflow implementation.",
    "Fixed fee $8,500. Delaware law governs.",
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < 6_200) {
    body += `\nSection ${i + 1}. The parties shall perform services diligently and document deliverables. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\nCLIENT: Blue Canyon Analytics LLC\nSERVICE PROVIDER: Iron Vale Systems Inc.`;
}

describe("paidProPostCheckoutRecoveryAuthority", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("rejects short recovery bodies that pass 500-char usable gate but fail degraded display requirements", () => {
    const shortBody = "CONSULTING AGREEMENT\n\nBlue Canyon Analytics LLC and Iron Vale Systems Inc.\n$8,500 Delaware.\n".repeat(
      40,
    );
    expect(shortBody.length).toBeGreaterThan(500);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(shortBody, TEST220_INTAKE)).toBe(false);
    const preview = previewPostCheckoutRecoverySotCommit({
      body: shortBody,
      draft: structured,
      intakeText: TEST220_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(false);
    expect(preview.blockReason).toBe("recovery_display_plain_below_review_min");
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: shortBody,
      draft: structured,
      intakeText: TEST220_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(commit.committed).toBe(false);
    if (!commit.committed) {
      expect(commit.reason).toBe("recovery_display_plain_below_review_min");
    }
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("accepted degraded recovery commits paid Pro SoT and canonical snapshot metadata", () => {
    const body = buildTest220RecoveryBody();
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(body, TEST220_INTAKE)).toBe(true);
    const preview = previewPostCheckoutRecoverySotCommit({
      body,
      draft: structured,
      intakeText: TEST220_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body,
      draft: structured,
      intakeText: TEST220_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      reviewSessionId: "test259-recovery",
    });
    expect(commit.committed).toBe(true);
    if (commit.committed) {
      expect(commit.reviewCorpusLen).toBeGreaterThan(4_000);
      expect(hasPaidProSourceOfTruth()).toBe(true);
      expect(getPaidProSourceOfTruthText().trim().length).toBeGreaterThan(4_000);
      expect(typeof commit.canonicalSnapshotFrozen).toBe("boolean");
    }
  });
});
