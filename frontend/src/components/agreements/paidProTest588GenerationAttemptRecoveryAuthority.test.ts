/** @vitest-environment jsdom */
/**
 * TEST588 — Paid Pro generation-attempt recovery authority.
 * Each generation attempt is classified only from its own wire/validation evidence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
import {
  beginPaidProGenerationAttempt,
  getActivePaidProGenerationAttemptId,
  isActivePaidProGenerationAttempt,
  rejectSupersededPaidProGenerationWrite,
  resolveCurrentAttemptPremiumValidationCorpus,
} from "./paidProGenerationAttemptAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  recordPremiumFullDraftCall,
  clearPremiumGenerationCallAudit,
} from "./paidProPremiumGenerationCallAudit";

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
    const body =
      clauses.length < topics.length
        ? `${clauses.length + 1}. ${t}. ${para}`
        : `${clauses.length + 1}. Additional Provisions. ${para}`;
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

async function runGeneration(docText: string, genId: string) {
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
  return runPremiumCompletion({
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
}

describe("TEST588 — generation-attempt recovery authority", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPremiumGenerationCallAudit();
    h.callIndex = 0;
  });

  it("A — failed attempt then clean attempt accepts server_full_draft (TEST552 sequence)", async () => {
    const clean = buildCorpus(6016, false);
    const thin = buildCorpus(6016, true);
    const first = await runGeneration(thin, "gen-A");
    expect(first.premiumRenderSource).not.toBe("server_full_draft");
    clearPartialPaidProAuthoritativeState();
    const second = await runGeneration(clean, "gen-B");
    expect(second.premiumRenderSource).toBe("server_full_draft");
    expect(second.winningPremiumBodyText.length).toBeGreaterThan(6000);
  }, 40_000);

  it("B — failed then failed keeps independent failure (no false success)", async () => {
    const thin = buildCorpus(6016, true);
    const first = await runGeneration(thin, "gen-f1");
    expect(first.premiumRenderSource).not.toBe("server_full_draft");
    clearPartialPaidProAuthoritativeState();
    const second = await runGeneration(thin, "gen-f2");
    expect(second.premiumRenderSource).not.toBe("server_full_draft");
  }, 40_000);

  it("D — same intake retry after failure can succeed without inherited rejection", async () => {
    const clean = buildCorpus(6016, false);
    await runGeneration(buildCorpus(6016, true), "gen-d1");
    clearPartialPaidProAuthoritativeState();
    const retry = await runGeneration(clean, "gen-d2");
    expect(retry.premiumRenderSource).toBe("server_full_draft");
  }, 40_000);

  it("R — each generation attempt establishes unique active identity", () => {
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-1", premiumRequestIntakeFingerprint: "fp-1" });
    expect(getActivePaidProGenerationAttemptId()).toBe("gen-1");
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-2", premiumRequestIntakeFingerprint: "fp-2" });
    expect(getActivePaidProGenerationAttemptId()).toBe("gen-2");
    expect(isActivePaidProGenerationAttempt("gen-1")).toBe(false);
    expect(isActivePaidProGenerationAttempt("gen-2")).toBe(true);
  });

  it("T — superseded attempt writes are rejected for authority", () => {
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-current", premiumRequestIntakeFingerprint: "fp" });
    expect(rejectSupersededPaidProGenerationWrite({ agreementGenerationId: "gen-stale" })).toBe(true);
    expect(rejectSupersededPaidProGenerationWrite({ agreementGenerationId: "gen-current" })).toBe(false);
  });

  it("validation corpus prefers current-attempt wire over display-prep mutations", () => {
    const wire = "y".repeat(6227);
    const processed = "x".repeat(6485);
    const resolved = resolveCurrentAttemptPremiumValidationCorpus({
      processedDoc: processed,
      wireDocumentText: wire,
      wireServerFullDocumentText: "",
      intakeText: INTAKE,
    });
    expect(resolved.source).toBe("wire");
    expect(resolved.text).toBe(wire);
  });

  it("audit ledger scopes duplicate checkout per generation identity", () => {
    expect(recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpA", agreementGenerationId: "genA" }).duplicateBlocked).toBe(false);
    expect(recordPremiumFullDraftCall({ reason: "checkout_completion", intakeFingerprint: "fpB", agreementGenerationId: "genB" }).duplicateBlocked).toBe(false);
  });
});
