import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  logPremiumRecoveryAuthority,
  tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth,
} from "./paidProPostCheckoutRecoveryAuthority";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const pipelineSrc = readFileSync(join(__dirname, "premiumCompletionPipeline.ts"), "utf8");
const authoritySrc = readFileSync(join(__dirname, "paidProPostCheckoutRecoveryAuthority.ts"), "utf8");
const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

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

function buildRecoveryBody(): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "Fixed fee $8,500. Delaware law governs.",
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < 6_200) {
    body += `\nSection ${i + 1}. Services and deliverables. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\nCLIENT: Blue Canyon Analytics LLC\nSERVICE PROVIDER: Iron Vale Systems Inc.`;
}

describe("paidProRecoveryAuthorityTelemetry invariants", () => {
  it("pipeline premium_degraded_server_local_recovery uses recoveryCandidateEligible, not accepted", () => {
    const anchor = pipelineSrc.indexOf("if (localRecovery.ok && degradedRecoveryPreview?.eligible)");
    expect(anchor).toBeGreaterThan(-1);
    const block = pipelineSrc.slice(anchor, anchor + 900);
    expect(block).toContain('stage: "premium_degraded_server_local_recovery"');
    expect(block).toContain("recoveryCandidateEligible: true");
    expect(block).not.toMatch(/accepted:\s*true/);
  });

  it("[premium-recovery-authority] logs authoritativeSnapshotAssigned and canonicalSnapshotFrozen", () => {
    expect(authoritySrc).toContain("authoritativeSnapshotAssigned");
    expect(authoritySrc).toContain("canonicalSnapshotFrozen");
    expect(authoritySrc).not.toContain("authoritativeSnapshotCreated");
    expect(authoritySrc).toContain("canonicalSnapshotFrozen: Boolean(frozen?.hash)");
  });

  it("applySuccess degraded success assigns ref before logPremiumRecoveryAuthority accepted:true", () => {
    const start = intakeSrc.indexOf('surface: "applySuccess_degraded_server_local_recovery"');
    expect(start).toBeGreaterThan(-1);
    const blockStart = intakeSrc.lastIndexOf("if (!sotCommit.committed)", start) > 0
      ? intakeSrc.lastIndexOf("paidCheckoutCompletedRef.current = true", start)
      : start;
    const block = intakeSrc.slice(blockStart - 80, start + 1200);
    const refAssign = block.indexOf("authoritativeAgreementSnapshotRef.current = committedText");
    const successLog = block.indexOf("logPremiumRecoveryAuthority");
    expect(refAssign).toBeGreaterThan(-1);
    expect(successLog).toBeGreaterThan(refAssign);
    const logPayload = block.slice(successLog, successLog + 450);
    expect(logPayload).toContain("accepted: true");
    expect(logPayload).toContain("authoritativeSnapshotAssigned: true");
    expect(logPayload).toContain("canonicalSnapshotFrozen: sotCommit.canonicalSnapshotFrozen");
    expect(block).toContain("setPremiumPostCheckoutPhase(null)");
  });

  it("SoT commit can succeed with canonicalSnapshotFrozen false without blocking phase clear", () => {
    clearPaidProSourceOfTruth();
    const body = buildRecoveryBody();
    const intake =
      "Consulting between Blue Canyon Analytics LLC and Iron Vale Systems Inc. $8,500 Delaware.";
    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body,
      draft: structured,
      intakeText: intake,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(commit.committed).toBe(true);
    if (commit.committed) {
      expect(commit.record.text.length).toBeGreaterThan(500);
      expect(typeof commit.canonicalSnapshotFrozen).toBe("boolean");
    }
  });

  it("logPremiumRecoveryAuthority accepted:true requires authoritativeSnapshotAssigned in payload shape", () => {
    expect(() =>
      logPremiumRecoveryAuthority({
        surface: "test",
        accepted: true,
        adoptedToSoT: true,
        authoritativeSnapshotAssigned: true,
        canonicalSnapshotFrozen: false,
        blockedReason: null,
        reviewCorpusLen: 5000,
      }),
    ).not.toThrow();
  });
});
