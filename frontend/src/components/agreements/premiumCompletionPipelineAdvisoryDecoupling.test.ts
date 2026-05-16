import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem Blanchard, developer Sarah Collins, Oklahoma.
  $7,500 total: $3,000 on start, $4,500 on final. thirty days. May 1, 2026. two (2) revision rounds.
  pre-existing code and libraries. Notices by electronic mail. Email notices ok.
`.trim();

function padProBody(core: string, minLen: number): string {
  const clause =
    " The parties shall each perform. Confidentiality, IP, limitation of liability, and indemnity apply. ";
  let t = core;
  while (t.length < minLen) t += clause;
  return t;
}

const h = vi.hoisted(() => {
  return {
    mockFull: null as PremiumFullDraftResult | null,
  };
});

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockFull
        ? Promise.resolve({ ok: true as const, result: h.mockFull })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_no_mock",
            document_text: "" as const,
            attemptCount: 0,
          }),
    postPremiumFullDraftOnce: () => (h.mockFull ? Promise.resolve(h.mockFull) : Promise.reject(new Error("no_mock"))),
  };
});

const longAcceptedDoc = padProBody(
  `
# Web Development Agreement

## Parties
**Client (Anthem Blanchard)** engages **Developer (Sarah Collins)** for the **CryptoSpaces** engagement.

Governing law: the laws of the **State of Oklahoma** (Oklahoma). Total **$7,500**; **$3,000** deposit, **$4,500** balance.
Final payment due within **thirty (30) days**; effective **May 1, 2026**. **Two revision** rounds. **Pre-existing** tools. **Notices** by **email** and **electronic mail**. Terms cover **confidential** use and **IP** between the **parties**. The parties **shall** cooperate.
    `,
  12_000,
);

const structured: ParsedDraftShape = {
  title: "Web Development & Services Agreement",
  jurisdiction: "Oklahoma",
  parties: [
    { name: "Client", role: "party" },
    { name: "Developer", role: "party" },
  ],
  purpose: "Software and web development for CryptoSpaces.net and related work.",
  payment_terms: "See intake for fee schedule.",
  duration: "As described in the statement of work",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

describe("runPremiumCompletion (advisory not in hot path)", () => {
  beforeEach(() => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    const v = validatePaidProOutput({ text: longAcceptedDoc, rawIntake: WEB_INTAKE, intentContract: contract, draft: null });
    if (!v.ok) {
      throw new Error("fixture doc should validate for paid pro: " + (v as { reasons?: string[] }).reasons?.join(","));
    }
    h.mockFull = {
      title: "Web Development & Services Agreement",
      agreement_family: "software_web_dev",
      document_text: longAcceptedDoc,
      key_terms_found: ["payment", "governing_law"],
      missing_material_info: [],
      generation_outcome: "ok",
    };
  });

  it("accepted server_full_draft leaves review / finalize / route null (advisory is deferred; 503 is non-blocking in UI)", async () => {
    const out = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-adv-b",
      premiumRequestIntakeFingerprint: "fp-adv-b",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe("server_full_draft");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(8000);
    expect(out.premiumReview).toBeNull();
    expect(out.premiumFinalizeAudit).toBeNull();
    expect(out.premiumReviewRoute).toBeNull();
  });
});
