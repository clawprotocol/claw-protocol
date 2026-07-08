/** @vitest-environment jsdom */
/**
 * TEST552 — the recurring "empty Review" regression.
 *
 * Root cause: `paidProPremiumGenerationCallAudit` is a process-global ledger that is NEVER cleared
 * in production (`clearPremiumGenerationCallAudit` is test-only). Its duplicate-checkout rule and
 * the `assertAtMostOneCheckoutPremiumGenerationCall` invariant both counted checkout calls
 * per-process. So the SECOND `checkout_completion` generation in a tab (a genuinely new generation,
 * or a re-entry after a prior failed attempt) was mislabelled a duplicate. The pipeline then
 * short-circuited the network call (`duplicate_checkout_premium_call`, document_text ""), which
 * starves the corpus-selection path and renders a thin local `fallback_preview` — the empty Review.
 *
 * The fix scopes duplicate detection AND the invariant to the current generation identity
 * (agreementGenerationId, or intake fingerprint fallback). Same-generation double-fires and armed
 * explicit retries are unchanged; a genuinely new generation always fires the network and reaches
 * the substantive server corpus.
 *
 * These tests prove: (a) the scoped-dedup unit contract, and (b) end-to-end, that a substantive
 * server_full_draft survives selection/validation/render on a second distinct generation with NO
 * audit clear in between (previously it collapsed to fallback_preview).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  armExplicitPremiumGenerationRetry,
  assertAtMostOneCheckoutPremiumGenerationCall,
  clearPremiumGenerationCallAudit,
  recordPremiumFullDraftCall,
} from "./paidProPremiumGenerationCallAudit";

describe("TEST552 — generation-call audit is scoped per generation, not per process", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
  });

  it("blocks a same-generation double-fire but never a genuinely new generation", () => {
    // First checkout for generation A fires.
    expect(
      recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpA", agreementGenerationId: "genA" }).duplicateBlocked,
    ).toBe(false);
    // A React re-mount double-fire for the SAME generation is still blocked (dedup preserved).
    expect(
      recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpA", agreementGenerationId: "genA" }).duplicateBlocked,
    ).toBe(true);
    // A genuinely NEW generation (different id) must NOT be blocked by the stale prior ledger.
    expect(
      recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpB", agreementGenerationId: "genB" }).duplicateBlocked,
    ).toBe(false);
    // The per-generation invariant tolerates multiple distinct generations in one tab.
    expect(() => assertAtMostOneCheckoutPremiumGenerationCall()).not.toThrow();
  });

  it("throws only when the SAME generation records two accepted checkout calls", () => {
    // Force two accepted checkout records for one generation by arming a retry between them
    // (arming bypasses the duplicate block, so both are recorded under the same identity).
    recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpA", agreementGenerationId: "genA" });
    armExplicitPremiumGenerationRetry();
    recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpA", agreementGenerationId: "genA" });
    expect(() => assertAtMostOneCheckoutPremiumGenerationCall()).toThrow(/duplicate_premium_full_draft_checkout/);
  });
});

const P = [
  { legal: "Redwood Biologics Inc", role: "Client", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121", signer: "Emily Carter", title: "Chief Executive Officer" },
  { legal: "Summit AI Consulting LLC", role: "Service Provider", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701", signer: "Daniel Brooks", title: "Managing Partner" },
  { legal: "Blue Harbor Systems LLC", role: "Service Provider", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601", signer: "Sophia Martinez", title: "Director of Implementation" },
  { legal: "Iron Gate Security LLC", role: "Service Provider", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108", signer: "Michael Reynolds", title: "Chief Security Officer" },
] as const;

const INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  `${P[0].legal}, ${P[1].legal}, ${P[2].legal}, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
  "Include services, compensation, confidentiality, IP, indemnification, insurance, termination, notices, Delaware governing law, execution blocks for all four parties.",
].join("\n");

function draft(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: P.map((p) => ({ name: p.legal, role: p.role, email: p.email, partyAddress: p.addr })) as never,
    purpose: "AI workflow automation, ERP integration, and cybersecurity services across four parties.",
    payment_terms: "Milestone-based fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 480000, cadence: "monthly", valid: true },
  };
}

function buildCorpus(targetLen: number, thin: boolean): string {
  const para =
    "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties. Time is of the essence with respect to each material milestone, and no waiver shall be effective unless made in a signed writing.";
  const topics = thin
    ? ["Services and Deliverables", "Compensation and Invoicing", "Term and Termination", "General Provisions"]
    : [
      "Services and Deliverables", "Compensation and Invoicing", "Term and Termination", "Confidentiality",
      "Data Security and Information Governance", "Intellectual Property", "Representations and Warranties",
      "Limitation of Liability", "Indemnification", "Insurance and Compliance", "Independent Contractor Status",
      "Assignment", "Force Majeure", "Dispute Resolution", "General Provisions",
    ];
  const head = [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${P[0].legal} ("Client"), ${P[1].legal} ("Service Provider"), ${P[2].legal} ("Service Provider"), and ${P[3].legal} ("Service Provider").`,
    "",
  ];
  const tail = [
    "",
    `${topics.length + 1}. Notices`,
    ...P.flatMap((p) => [`If to ${p.legal}:`, p.legal, `Attn: ${p.signer}, ${p.title}`, `Email: ${p.email}`, "Address:", p.addr, ""]),
    `${topics.length + 2}. GOVERNING LAW`,
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...P.flatMap((p) => [`${p.role.toUpperCase()}: ${p.legal}`, "By: _________________________________", `Name: ${p.signer}`, `Title: ${p.title}`, ""]),
  ];
  const clauses: string[] = [];
  let cur = [...head, "", ...tail].join("\n").length;
  while (cur < targetLen) {
    const t = topics[clauses.length % topics.length];
    const body = clauses.length < topics.length ? `${clauses.length + 1}. ${t}. ${para}` : `${clauses.length + 1}. Additional Provisions. ${para}`;
    clauses.push(body);
    cur += body.length + 2;
  }
  return [...head, clauses.join("\n\n"), ...tail].join("\n");
}

const h = vi.hoisted(() => ({ mockResponses: [] as PremiumFullDraftResult[], callIndex: 0 }));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r = h.mockResponses[h.callIndex] ?? h.mockResponses[h.mockResponses.length - 1];
      h.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({ ok: false as const, failure_kind: "http" as const, retryable: false, error_code: "no_mock", document_text: "" as const, attemptCount: 0 });
    },
    postPremiumFullDraftOnce: () => {
      const r = h.mockResponses[h.callIndex] ?? h.mockResponses[h.mockResponses.length - 1];
      h.callIndex += 1;
      return r ? Promise.resolve(r) : Promise.reject(new Error("no_mock"));
    },
  };
});

async function runGeneration(docText: string, genId: string): Promise<{ len: number; src: string; body: string }> {
  h.callIndex = 0;
  h.mockResponses = [
    {
      title: "Consulting Services Agreement",
      agreement_family: "consulting_agreement",
      document_text: docText,
      key_terms_found: ["payment"],
      missing_material_info: [],
      generation_outcome: "degraded",
    } as unknown as PremiumFullDraftResult,
  ];
  const out = await runPremiumCompletion({
    intakeText: INTAKE,
    originalUserIntakeRawForMerge: INTAKE,
    structuredDraft: draft(),
    simpleProductFlow: true,
    partyRoleLabels: defaultIntakePartyRoleLabels(),
    userGapAnswers: null,
    agreementGenerationId: genId,
    premiumRequestIntakeFingerprint: `fp-${genId}`,
    isPremiumRequestStillValid: () => true,
    parseDraft: async () => draft(),
  });
  return {
    len: out.winningPremiumBodyText.trim().length,
    src: out.premiumRenderSource ?? "?",
    body: out.winningPremiumBodyText,
  };
}

describe("TEST552 — substantive server corpus survives a subsequent distinct generation", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    h.callIndex = 0;
  });

  it(
    "a good clean corpus is NOT degraded to fallback_preview by a prior failed attempt's stale audit",
    async () => {
      const clean = buildCorpus(6016, false);
      const thin = buildCorpus(6016, true);

      // Attempt 1 (generation A): a thin degraded corpus that cannot reach substantive review.
      const first = await runGeneration(thin, "gen-A");
      expect(first.src).not.toBe("server_full_draft");

      // Production RETRY clears only the safe-display cache — the generation-call audit persists.
      clearPartialPaidProAuthoritativeState();

      // Attempt 2 (generation B, a new generation, unarmed checkout): the substantive server corpus
      // must win. Before the fix this collapsed to a ~3.7k fallback_preview (empty Review) because
      // the network call was suppressed as a "duplicate" checkout.
      const second = await runGeneration(clean, "gen-B");
      expect(second.src).toBe("server_full_draft");
      expect(second.len).toBeGreaterThan(6000);
      // The rendered body is the substantive server corpus, not a thin local preview.
      for (const p of P) expect(second.body).toContain(p.legal);
    },
    20_000,
  );
});
