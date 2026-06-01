import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult, PremiumFullDraftResult } from "./premiumFullDraftApi";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem Blanchard, developer Sarah Collins, Oklahoma.
  $7,500 total. thirty days. May 1, 2026. two revision rounds. email notices ok.
`.trim();

function padProBody(core: string, minLen: number): string {
  let t = core;
  const clause =
    " The parties shall each perform. Confidentiality, IP, limitation of liability, and indemnity apply. ";
  while (t.length < minLen) t += clause;
  return t;
}

const longAcceptedDoc = padProBody(
  `
# Web Development Agreement
Parties: Client (Anthem Blanchard) and Developer (Sarah Collins) for CryptoSpaces.
Governing law: Oklahoma. Total $7,500. Effective May 1, 2026. Email notices. The parties shall cooperate.
  `,
  12_000,
);

const structured: ParsedDraftShape = {
  title: "Web Development Agreement",
  jurisdiction: "Oklahoma",
  parties: [
    { name: "Client", role: "party" },
    { name: "Developer", role: "party" },
  ],
  purpose: "Software and web development for CryptoSpaces.net.",
  payment_terms: "See intake.",
  duration: "12 months",
  due_date: null,
  effective_date: "May 1, 2026",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

const successFull: PremiumFullDraftResult = {
  title: "Web Development Agreement",
  agreement_family: "software_web_dev",
  document_text: longAcceptedDoc,
  key_terms_found: ["payment"],
  missing_material_info: [],
  generation_outcome: "ok",
};

const h = vi.hoisted(() => ({
  call: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: (): Promise<PremiumFullDraftApiResult> => {
      h.call += 1;
      if (h.call === 1) {
        return Promise.resolve({
          ok: false,
          failure_kind: "network",
          retryable: true,
          error_code: "network_changed",
          document_text: "",
          attemptCount: 2,
        });
      }
      return Promise.resolve({ ok: true, result: successFull });
    },
    postPremiumFullDraftOnce: () => Promise.resolve(successFull),
  };
});

describe("runPremiumCompletion network then success retry", () => {
  beforeEach(() => {
    h.call = 0;
  });

  it("second pipeline run after network failure can render authoritative Pro document", async () => {
    const first = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-retry-1",
      premiumRequestIntakeFingerprint: "fp-r1",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(first.premiumNetworkRetryable).toBe(true);
    expect(first.premiumNetworkLocalRecovery).toBe(true);
    expect(first.premiumRenderSource).toBe("premium_network_local_recovery");
    expect(first.winningPremiumBodyText.trim().length).toBeGreaterThan(500);

    const second = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-retry-2",
      premiumRequestIntakeFingerprint: "fp-r2",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(second.premiumRenderSource).toBe("server_full_draft");
    expect(second.winningPremiumBodyText.trim().length).toBeGreaterThan(8000);
  });
});
