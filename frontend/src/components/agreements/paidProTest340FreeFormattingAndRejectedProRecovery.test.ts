/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStarterAgreementPreviewForReview,
} from "./agreementPreviewFromDraft";
import {
  shouldBlockPaidProCanonicalFreezeOnApiFailure,
} from "./paidProApiFailureAuthorityGuard";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
} from "./paidProPostCheckoutRenderGate";
import {
  previewPostCheckoutRecoverySotCommit,
} from "./paidProPostCheckoutRecoveryAuthority";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  paidProCheckoutCompletionHasVisibleOutcome,
  PREMIUM_USABLE_BODY_MIN_LEN,
} from "./premiumPostCheckoutApplyEligible";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  enrichStarterPreviewPartiesFromIntake,
} from "./starterOpeningPartyPreserve";
import { starterPreviewHasParagraphSectionBreaks } from "./starterPreviewFormatting";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

/** QA corpus: HTTP 200 degraded/json_parse ~6.2k that fails client gates but must not suppress local recovery. */
function buildTest340RejectedDegradedServerBody(targetLen: number): string {
  const header = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
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
    body += `\nSection ${i + 1}. ${bannedMarkers[i % bannedMarkers.length]} Oklahoma governing law and $48,000 monthly fee. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF\nCLIENT: ${RED_MESA}\nSERVICE PROVIDER: ${HARBOR_PEAK}`;
}

const TEST340_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test340Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "party" },
      { name: HARBOR_PEAK, role: "party" },
    ],
    purpose:
      "AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

const h = vi.hoisted(() => {
  const redMesa = "Red Mesa Logistics LLC";
  const harborPeak = "Harbor Peak Automation LLC";
  const header = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${redMesa} ("Client") and ${harborPeak} ("Service Provider").`,
    "",
  ].join("\n");
  const bannedMarkers = [
    "[claw_full_draft_expansion_v1]",
    "internal generation",
    "gap-trace",
    "sparse-prompt premium expansion",
  ];
  let doc = header;
  let i = 0;
  while (doc.length < 6_241) {
    doc += `\nSection ${i + 1}. ${bannedMarkers[i % bannedMarkers.length]} Oklahoma governing law and $48,000 monthly fee. `;
    i += 1;
  }
  doc = `${doc}\n\nIN WITNESS WHEREOF\nCLIENT: ${redMesa}\nSERVICE PROVIDER: ${harborPeak}`;
  return {
    mockResult: {
      title: "Services Agreement",
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

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve({ ok: true as const, result: h.mockResult }),
    postPremiumFullDraftOnce: () => Promise.resolve(h.mockResult),
  };
});

describe("paidProTest340FreeFormattingAndRejectedProRecovery", () => {
  beforeEach(() => {
    h.mockResult.document_text = buildTest340RejectedDegradedServerBody(6_241);
    h.mockResult.server_full_document_text = h.mockResult.document_text;
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("free starter keeps Client / Service Provider roles and paragraph section breaks", () => {
    const draft = enrichStarterPreviewPartiesFromIntake(test340Draft(), TEST340_INTAKE);
    expect(draft.parties?.map((p) => p.role)).toEqual(["Client", "Service Provider"]);

    const preview = buildStarterAgreementPreviewForReview(draft, { intakeText: TEST340_INTAKE });
    const opening = preview.slice(0, 900);
    expect(opening).toContain(RED_MESA);
    expect(opening).toContain(HARBOR_PEAK);
    expect(opening).not.toMatch(/\("party"\)/i);
    expect(opening).toMatch(/\("Client"\)|\("Service Provider"\)/);
    expect(starterPreviewHasParagraphSectionBreaks(preview)).toBe(true);
    expect(preview).toMatch(/\n\n1\.\s+/);
    expect(preview).toMatch(/\n\n2\.\s+/);
    expect(preview).not.toMatch(
      /1\.\s+Scope of Services[\s\S]{0,120}2\.\s+Payment Terms[\s\S]{0,120}3\.\s+/,
    );
  });

  it("degraded recovery display requirements follow intake parties, jurisdiction, and payment", () => {
    const tooShort = "SERVICES AGREEMENT\n\nRed Mesa and Harbor Peak.\n";
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(tooShort, TEST340_INTAKE)).toBe(false);

    const missingParties = [
      "SERVICES AGREEMENT",
      "",
      "Acme Corp and Beta LLC agree to services.",
      "Fixed fee $48,000. Oklahoma law governs.",
      "",
    ].join("\n");
    let paddedMissing = missingParties;
    let j = 1;
    while (paddedMissing.length <= PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
      paddedMissing += `\n${j}. Generic clause without named parties.\n`;
      j += 1;
    }
    paddedMissing += `\nIN WITNESS WHEREOF\nCLIENT: Acme\nSERVICE PROVIDER: Beta`;
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(paddedMissing, TEST340_INTAKE)).toBe(false);

    const stitchedRecovery = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
      "",
      "1. Scope of Services",
      "Provider shall perform AI workflow consulting and implementation support.",
      "",
      "2. Payment",
      "Fixed fee of $48,000 paid monthly.",
      "",
      "3. Governing Law",
      "Oklahoma law governs.",
      "",
    ].join("\n");
    let padded = stitchedRecovery;
    let i = 1;
    while (padded.length <= PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
      padded += `\n${i}. Additional operative clause for milestone delivery and acceptance review.\n`;
      i += 1;
    }
    padded += `\nIN WITNESS WHEREOF\nCLIENT: ${RED_MESA}\nSERVICE PROVIDER: ${HARBOR_PEAK}`;
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(padded, TEST340_INTAKE)).toBe(true);
  });

  it("HTTP 200 degraded json_parse at ~6.2k routes to local recovery instead of empty rejected_paid_corpus", async () => {
    const { buildPremiumPostCheckoutLocalRecoveryProDraft } = await import("./premiumNetworkRecoveryLocalDraft");
    const lr = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: test340Draft(),
      rawIntake: TEST340_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(lr.ok, lr.reasons.join(",")).toBe(true);
    expect(lr.body.length).toBeGreaterThan(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
    expect(countPaidProExecutionBlocks(lr.body)).toBe(1);
    expect(lr.body.toLowerCase()).toContain("oklahoma");
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(lr.body, TEST340_INTAKE)).toBe(true);

    const out = await runPremiumCompletion({
      intakeText: TEST340_INTAKE,
      originalUserIntakeRawForMerge: TEST340_INTAKE,
      structuredDraft: test340Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test340",
      premiumRequestIntakeFingerprint: "fp-test340",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test340Draft(),
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.serverGenerationDegraded?.code).toBe("json_parse");
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBeGreaterThanOrEqual(1);

    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: out.winningPremiumBodyText,
      draft: out.premiumDraft,
      intakeText: TEST340_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);
    expect(recoveryPreview.displayPlainLen).toBeGreaterThan(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
  });

  it("blocks canonical freeze on rejected_paid_corpus without eligible recovery corpus", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: "rejected_paid_corpus",
        corpusLen: 792,
        corpusSource: "canonical_working_draft",
        hasEligibleRecoveryCorpus: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
        corpusLen: 5_200,
        corpusSource: "canonical_working_draft",
        hasEligibleRecoveryCorpus: true,
      }),
    ).toBe(false);
  });
});
