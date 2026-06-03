import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  isPaidProFinishedAgreement,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { shouldTreatPremiumReviewFailureAsNonfatal } from "./paidProPremiumReviewNetworkGuard";
import { isPremiumFullDraftNetworkFailure } from "./premiumFullDraftApi";
import {
  evaluatePremiumAdvisorySkipAfterAuthoritativeAccept,
  shouldSkipPremiumAdvisoryAfterAuthoritativeAccept,
} from "./premiumAdvisorySkipAfterAuthority";
import { fetchPremiumAdvisoryEnrichmentAfterAccept } from "./premiumAdvisoryPostAccept";

const postPremiumAgreementReviewWithRetry = vi.hoisted(() =>
  vi.fn(async () => {
    if (import.meta.env.MODE === "test") return null;
    return {
      strengths: ["ok"],
      missing_or_weak_terms: [],
      questions_for_user: [],
      suggested_clause_upgrades: [],
      priority_score: 50,
    };
  }),
);
const postPremiumFinalizeAuditWithRetry = vi.hoisted(() =>
  vi.fn(async () => (import.meta.env.MODE === "test" ? null : null)),
);
const postPremiumReviewRouteWithRetry = vi.hoisted(() =>
  vi.fn(async () => (import.meta.env.MODE === "test" ? null : null)),
);

vi.mock("./premiumAgreementReviewApi", () => ({
  postPremiumAgreementReviewWithRetry,
  buildContextForReview: () => ({}),
}));
vi.mock("./premiumFinalizeAuditApi", () => ({
  postPremiumFinalizeAuditWithRetry,
  buildPremiumFinalizeAuditContext: () => ({}),
}));
vi.mock("./premiumReviewRouteApi", () => ({
  postPremiumReviewRouteWithRetry,
}));

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem, developer Sarah, Oklahoma.
  $7,500 total: $3,000 on start, $4,500 on final. thirty days. May 1, 2026. two (2) revision rounds.
  pre-existing code. Notices by email.
`.trim();

function padProBody(core: string, minLen: number): string {
  const clause =
    " The parties shall each perform. Confidentiality, IP, limitation of liability, and indemnity apply. ";
  let t = core;
  while (t.length < minLen) t += clause;
  return t;
}

function buildPaidProDraft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Delaware",
    agreement_family: "services_agreement",
    parties: [
      { name: "Acme LLC", role: "Client" },
      { name: "Beta Inc.", role: "Service Provider" },
    ],
    purpose: "Consulting services",
    payment_terms: "$10,000",
    duration: "12 months",
    due_date: null,
    effective_date: "Jan 1, 2026",
    payment: emptyPayment,
  };
}

function establishTestPaidProSot(body: string, draft: ParsedDraftShape): void {
  establishPaidProSourceOfTruth({
    text: body,
    draft,
    intakeText: "Consulting between Acme LLC and Beta Inc. for workflow automation services.",
  });
}

describe("fetchPremiumAdvisoryEnrichmentAfterAccept", () => {
  const draft = buildPaidProDraft();

  beforeEach(() => {
    vi.unstubAllEnvs();
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
    postPremiumAgreementReviewWithRetry.mockClear();
    postPremiumFinalizeAuditWithRetry.mockClear();
    postPremiumReviewRouteWithRetry.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("completes without throw when follow-on calls return null in test mode", async () => {
    const doc = "y".repeat(2000);
    const out = await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft,
      rawIntakeForSot: "intake",
      userGapAnswers: null,
      winningBodyText: doc,
    });
    expect(out.premiumReview).toBeNull();
    expect(out.premiumFinalizeAudit).toBeNull();
    expect(out.premiumReviewRoute).toBeNull();
  });

  it("skips advisory HTTP when SoT, invariant, and review corpus are ready", async () => {
    const body = padProBody(
      [
        "CONSULTING AGREEMENT",
        "",
        "This Agreement is between Acme LLC and Beta Inc.",
        "",
        "1. SCOPE",
        "Services.",
        "",
        "IN WITNESS WHEREOF",
        "",
        "CLIENT: Acme LLC",
        "By: _________________________",
        "",
        "SERVICE PROVIDER: Beta Inc.",
        "By: _________________________",
      ].join("\n"),
      1200,
    );
    establishTestPaidProSot(body, draft);
    expect(shouldSkipPremiumAdvisoryAfterAuthoritativeAccept()).toBe(true);
    expect(resolvePaidProReviewRenderPlain().trim().length).toBeGreaterThanOrEqual(500);

    vi.stubEnv("MODE", "production");
    const hashBefore = hashPaidProCorpus(getPaidProSourceOfTruthText());
    const out = await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft,
      rawIntakeForSot: "intake",
      userGapAnswers: null,
      winningBodyText: body,
    });
    expect(out.premiumReview).toBeNull();
    expect(hashPaidProCorpus(getPaidProSourceOfTruthText())).toBe(hashBefore);
    expect(postPremiumAgreementReviewWithRetry).not.toHaveBeenCalled();
    expect(postPremiumFinalizeAuditWithRetry).not.toHaveBeenCalled();
    expect(postPremiumReviewRouteWithRetry).not.toHaveBeenCalled();
  });

  it("allows advisory HTTP when Paid Pro SoT is not established", async () => {
    const doc = "y".repeat(2000);
    expect(shouldSkipPremiumAdvisoryAfterAuthoritativeAccept()).toBe(false);
    vi.stubEnv("MODE", "production");
    await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft,
      rawIntakeForSot: "intake",
      userGapAnswers: null,
      winningBodyText: doc,
    });
    expect(postPremiumAgreementReviewWithRetry).toHaveBeenCalled();
    expect(postPremiumFinalizeAuditWithRetry).toHaveBeenCalled();
    expect(postPremiumReviewRouteWithRetry).toHaveBeenCalled();
  });

  it("logs skip diagnostic only when QA verbose/perf trace is enabled", async () => {
    const body = padProBody("CONSULTING AGREEMENT\n\n1. SCOPE\nWork.\n\nIN WITNESS WHEREOF\n\nAcme\nBeta", 1200);
    establishTestPaidProSot(body, draft);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft,
      rawIntakeForSot: "intake",
      userGapAnswers: null,
      winningBodyText: body,
    });
    expect(info.mock.calls.some((c) => c[0] === "[premium-advisory-skip-after-authority]")).toBe(false);
    info.mockRestore();
  });
});

describe("premium advisory skip gate", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("evaluatePremiumAdvisorySkipAfterAuthoritativeAccept reports reason when SoT missing", () => {
    expect(evaluatePremiumAdvisorySkipAfterAuthoritativeAccept()).toMatchObject({
      skip: false,
      reason: "no_paid_pro_sot",
    });
  });
});

describe("post-accept authority (advisory 503 is irrelevant to paid-pro gate)", () => {
  it("rejected_paid_corpus still blocks finished pro", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    const lead = `
# Web Development Agreement

## Parties
**Client (Anthem Blanchard)** engages **Developer (Sarah Collins)** for the **CryptoSpaces** engagement.

Governing law: the laws of the **State of Oklahoma** (Oklahoma). Total **$7,500**; **$3,000** deposit, **$4,500** balance.
Final payment due within **thirty (30) days**; effective **May 1, 2026**. **Two revision** rounds. **Pre-existing** tools. **Notices** by **email** and **electronic mail**. Terms cover **confidential** use and **IP** between the **parties**. The parties **shall** cooperate.
    `;
    const text = padProBody(lead, 12_000);
    const v = validatePaidProOutput({ text, rawIntake: WEB_INTAKE, intentContract: contract, draft: null });
    expect(v.ok).toBe(true);
    const r = isPaidProFinishedAgreement({
      text,
      rawIntake: WEB_INTAKE,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "rejected_paid_corpus",
      stale: false,
      intentContract: contract,
    });
    expect(r.ok).toBe(false);
  });

  it("server_full_draft with validated body still produces finished pro (advisory failures are irrelevant to this gate)", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    const lead = `
# Web Development Agreement

## Parties
**Client (Anthem Blanchard)** engages **Developer (Sarah Collins)** for the **CryptoSpaces** engagement.

Governing law: the laws of the **State of Oklahoma** (Oklahoma). Total **$7,500**; **$3,000** deposit, **$4,500** balance.
Final payment due within **thirty (30) days**; effective **May 1, 2026**. **Two revision** rounds. **Pre-existing** tools. **Notices** by **email** and **electronic mail**. Terms cover **confidential** use and **IP** between the **parties**. The parties **shall** cooperate.
    `;
    const text = padProBody(lead, 12_000);
    const v = validatePaidProOutput({ text, rawIntake: WEB_INTAKE, intentContract: contract, draft: null });
    expect(v.ok).toBe(true);
    const r = isPaidProFinishedAgreement({
      text,
      rawIntake: WEB_INTAKE,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "server_full_draft",
      stale: false,
      intentContract: contract,
    });
    expect(r.ok).toBe(true);
  });

  it("premium-review network failure remains nonfatal when SoT is established", () => {
    const err = new Error("Failed to fetch: net::ERR_NETWORK_CHANGED");
    expect(isPremiumFullDraftNetworkFailure(err)).toBe(true);
    expect(
      shouldTreatPremiumReviewFailureAsNonfatal({
        paidProSourceOfTruthEstablished: true,
        err,
      }),
    ).toBe(true);
  });
});
