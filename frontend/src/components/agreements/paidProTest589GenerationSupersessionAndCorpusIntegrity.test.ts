/** @vitest-environment jsdom */
/**
 * TEST589 — Paid Pro generation supersession and accepted-corpus integrity authority.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { assessPaidProAcceptedCorpusPreservationProof } from "./paidProAcceptedCorpusIntegrity";
import {
  PAID_PRO_AUTHORITATIVE_WRITE_SURFACES,
  guardPaidProAuthoritativeWrite,
} from "./paidProAuthoritativeWriteGuard";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
import {
  beginPaidProGenerationAttempt,
  cancelPaidProGenerationAttempt,
  getActivePaidProGenerationAttemptSequence,
  markPaidProGenerationAttemptTerminal,
  readPaidProGenerationAttemptTerminalOutcome,
  rejectSupersededPaidProGenerationWrite,
} from "./paidProGenerationAttemptAuthority";
import { tryCommitProGenerationAdoption, readProGenerationAdoption } from "./paidProGenerationAdoption";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  freezeAcceptedPremiumBodyForSession,
  getFrozenPremiumBodyForSession,
} from "./premiumAcceptancePolicy";
import { commitPaidProPipelineValidationAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";

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

describe("TEST589 — generation supersession and accepted-corpus integrity", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPremiumGenerationCallAudit();
    h.callIndex = 0;
  });

  it("A — TEST552 continuity: failed attempt then clean current attempt produces server_full_draft", async () => {
    const clean = buildCorpus(6016, false);
    const thin = buildCorpus(6016, true);
    const first = await runGeneration(thin, "gen-589-a1");
    expect(first.premiumRenderSource).not.toBe("server_full_draft");
    clearPartialPaidProAuthoritativeState();
    const second = await runGeneration(clean, "gen-589-a2");
    expect(second.premiumRenderSource).toBe("server_full_draft");
    expect(second.winningPremiumBodyText.length).toBeGreaterThan(6000);
  }, 40_000);

  it("B — stale attempt sequence cannot adopt after supersession", () => {
    const first = beginPaidProGenerationAttempt({ agreementGenerationId: "gen-b1", premiumRequestIntakeFingerprint: "fp-b1" });
    const staleSeq = first.attemptSequence;
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-b2", premiumRequestIntakeFingerprint: "fp-b2" });
    const body = buildCorpus(6016, false);
    const commit = tryCommitProGenerationAdoption({
      generationId: "gen-b1",
      intakeFingerprint: "fp-b1",
      body,
      source: "server_full_draft",
      attemptSequence: staleSeq,
    });
    expect(commit.committed).toBe(false);
    expect(commit.reason).toBe("superseded_attempt");
  });

  it("C — stale attempt cannot freeze session body after supersession", () => {
    const first = beginPaidProGenerationAttempt({ agreementGenerationId: "gen-c1", premiumRequestIntakeFingerprint: "fp-c1" });
    const staleSeq = first.attemptSequence;
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-c2", premiumRequestIntakeFingerprint: "fp-c2" });
    freezeAcceptedPremiumBodyForSession("gen-c2", buildCorpus(6016, false), "server_full_draft", staleSeq);
    expect(getFrozenPremiumBodyForSession("gen-c2")).toBeNull();
  });

  it("D — cancelled attempt rejects authoritative validation acceptance", () => {
    const ctx = beginPaidProGenerationAttempt({ agreementGenerationId: "gen-d1", premiumRequestIntakeFingerprint: "fp-d1" });
    cancelPaidProGenerationAttempt({ agreementGenerationId: "gen-d1", attemptSequence: ctx.attemptSequence });
    commitPaidProPipelineValidationAcceptance({
      text: buildCorpus(6016, false),
      source: "server_full_draft",
      agreementGenerationId: "gen-d1",
      attemptSequence: ctx.attemptSequence,
    });
    expect(readPaidProGenerationAttemptTerminalOutcome({ attemptSequence: ctx.attemptSequence })).toBe("cancelled");
  });

  it("E — duplicate terminalization is idempotent", () => {
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-e1", premiumRequestIntakeFingerprint: "fp-e1" });
    expect(
      markPaidProGenerationAttemptTerminal({
        agreementGenerationId: "gen-e1",
        outcome: "frozen",
      }),
    ).toBe(true);
    expect(
      markPaidProGenerationAttemptTerminal({
        agreementGenerationId: "gen-e1",
        outcome: "rejected",
      }),
    ).toBe(false);
    expect(readPaidProGenerationAttemptTerminalOutcome({ agreementGenerationId: "gen-e1" })).toBe("frozen");
  });

  it("J — wire-valid corpus with deleted confidentiality is blocked before freeze", () => {
    const wire = buildCorpus(6016, false);
    const stripped = wire.replace(/confidential/gi, "removed-term");
    const v = validatePaidProOutput({
      text: wire,
      rawIntake: INTAKE,
      draft: draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok).toBe(true);
    const proof = assessPaidProAcceptedCorpusPreservationProof({
      wireText: wire,
      freezeCandidateText: stripped,
      rawIntake: INTAKE,
      draft: draft(),
      pipelineSource: "server_full_draft",
    });
    expect(proof.ok).toBe(false);
    expect(proof.reasons.some((r) => r.includes("confidentiality"))).toBe(true);
  });

  it("I — formatting-only prepared mismatch can preserve wire-authorizing topics", () => {
    const wire = buildCorpus(6016, false);
    const formatted = `${wire}\n\n`;
    const proof = assessPaidProAcceptedCorpusPreservationProof({
      wireText: wire,
      freezeCandidateText: formatted,
      rawIntake: INTAKE,
      draft: draft(),
      pipelineSource: "server_full_draft",
    });
    expect(proof.ok).toBe(true);
  });

  it("O — four-party professional corpus preserves coverage through acceptance", async () => {
    const clean = buildCorpus(6016, false);
    const result = await runGeneration(clean, "gen-589-o");
    expect(result.premiumRenderSource).toBe("server_full_draft");
    expect(result.winningPremiumBodyText).toMatch(/Redwood Biologics Inc/);
    expect(result.winningPremiumBodyText).toMatch(/Iron Gate Security LLC/);
    expect(result.winningPremiumBodyText).toMatch(/Confidentiality|confidential/i);
  }, 40_000);

  it("T — guard coverage for enumerated authoritative write surfaces", () => {
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-t-current", premiumRequestIntakeFingerprint: "fp-t" });
    const stale = getActivePaidProGenerationAttemptSequence() - 1;
    for (const surface of PAID_PRO_AUTHORITATIVE_WRITE_SURFACES) {
      expect(
        guardPaidProAuthoritativeWrite({
          agreementGenerationId: "gen-t-current",
          attemptSequence: stale > 0 ? stale : 0,
          surface,
        }).allowed,
      ).toBe(stale > 0 ? false : true);
    }
    expect(rejectSupersededPaidProGenerationWrite({ agreementGenerationId: "gen-t-stale" })).toBe(true);
  });

  it("R — superseded attempt remains observable with terminal outcome", () => {
    const a = beginPaidProGenerationAttempt({ agreementGenerationId: "gen-r1", premiumRequestIntakeFingerprint: "fp-r1" });
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-r2", premiumRequestIntakeFingerprint: "fp-r2" });
    expect(readPaidProGenerationAttemptTerminalOutcome({ attemptSequence: a.attemptSequence })).toBe("superseded");
    expect(readProGenerationAdoption("gen-r1")).toBeNull();
  });
});
