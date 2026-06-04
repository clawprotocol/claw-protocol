import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "../../partyRoleIntake";
import { runPremiumCompletion } from "../../premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "../../premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "../../premiumNetworkRecoveryLocalDraft";
import { previewPostCheckoutRecoverySotCommit } from "../../paidProPostCheckoutRecoveryAuthority";
import {
  paidProCheckoutCompletionHasVisibleOutcome,
  PREMIUM_USABLE_BODY_MIN_LEN,
} from "../../premiumPostCheckoutApplyEligible";
import { countStructuralFatals } from "../../premiumAcceptancePolicy";
import { rejectPremiumBodyForProRender } from "../../premiumFullDraftClientAcceptance";
import { assessPaidProMutualConsultingProfessionalStructure } from "../../paidProMutualConsultingQualityFloor";
import { countPaidProExecutionBlocks } from "../../paidProExecutionBlockAuthority";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const TEST210_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest210.intake.txt"), "utf8").trim();

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "Consulting and implementation.",
  payment_terms: "$8,500 milestone.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

/** Server corpus that fails client gates (banned contamination) without early degraded-filler stripping. */
function buildTest210RejectedDegradedServerBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc. agree to consulting and implementation support.",
    "",
  ].join("\n");
  const bannedMarkers = [
    "[claw_full_draft_expansion_v1]",
    "internal generation",
    "gap-trace",
    "sparse-prompt premium expansion",
  ];
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. ${bannedMarkers[i % bannedMarkers.length]} The parties shall perform diligently. `;
    i += 1;
  }
  return body;
}

/** Long corpus for direct client-gate assertions only. */
const rejectedDegradedDoc = buildTest210RejectedDegradedServerBody(8_062);

const h = vi.hoisted(() => {
  /** Short degraded server body so normalized wire text does not suppress local recovery (Test259-class). */
  const pipelineMockRejectedLen = 320;
  const doc = buildTest210RejectedDegradedServerBody(pipelineMockRejectedLen);
  return {
    mockResult: {
      title: "Mutual Consulting Agreement",
      agreement_family: "services_agreement",
      document_text: doc,
      server_full_document_text: doc,
      key_terms_found: [] as string[],
      missing_material_info: [] as string[],
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    } satisfies PremiumFullDraftResult,
  };
});

vi.mock("../../premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve({ ok: true as const, result: h.mockResult }),
    postPremiumFullDraftOnce: () => Promise.resolve(h.mockResult),
  };
});

describe("paidProHardening test210 degraded server recovery", () => {
  beforeEach(() => {
    const doc = buildTest210RejectedDegradedServerBody(320);
    h.mockResult.document_text = doc;
    h.mockResult.server_full_document_text = doc;
  });

  it("rejects the mocked server corpus at client gates (structural fatals)", () => {
    const acc = rejectPremiumBodyForProRender(rejectedDegradedDoc, {
      intakeLower: TEST210_INTAKE.toLowerCase(),
      intakeText: TEST210_INTAKE,
      partyNames: structured.parties?.map((p) => p.name) ?? null,
    });
    expect(acc.ok).toBe(false);
    expect(countStructuralFatals(acc.reasons)).toBeGreaterThanOrEqual(4);
  });

  it("HTTP 200 degraded + rejected_paid_corpus yields local recovery — not empty FAILED corpus", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST210_INTAKE,
      originalUserIntakeRawForMerge: TEST210_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test210",
      premiumRequestIntakeFingerprint: "fp-test210",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumDegradedServerRecoverable).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.serverGenerationDegraded?.code).toBe("json_parse");
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);

    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: out.winningPremiumBodyText,
      rawIntake: TEST210_INTAKE,
      draft: structured,
    });
    expect(structure.applies).toBe(true);
    expect(structure.ok).toBe(true);

    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBeGreaterThanOrEqual(1);

    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: out.winningPremiumBodyText,
      draft: out.premiumDraft,
      intakeText: TEST210_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);
  });
});
