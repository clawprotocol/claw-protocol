/** @vitest-environment jsdom */
/**
 * TEST563 — a substantive 40k+ `server_full_draft` that reaches `document_boundary_blocked` must
 * either freeze (when the boundary authority can safely repair it) or reject with a SPECIFIC,
 * non-collapsed reason that names the real defect. The live 42k failure was a genuinely unresolvable
 * user-visible render token (a degraded literal like `TBD`, or an unknown compound field like
 * `{{party_3_scope}}`) whose `contact.ok === false` boundary block collapsed to a bare
 * `document_boundary_blocked`, hiding the actual token strings.
 *
 * Also asserts old thin candidates from a prior failed attempt cannot compete with (overwrite) a
 * later substantive generation once it is freeze-latched.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies,
  freezeAcceptedPremiumBodyForSession,
} from "./premiumAcceptancePolicy";

const P = [
  { legal: "Redwood Biologics Inc", role: "Client", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121" },
  { legal: "Summit AI Consulting LLC", role: "Service Provider", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701" },
  { legal: "Blue Harbor Systems LLC", role: "Service Provider", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601" },
  { legal: "Iron Gate Security LLC", role: "Service Provider", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108" },
] as const;

const INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  `${P[0].legal}, ${P[1].legal}, ${P[2].legal}, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
  "Delaware governing law.",
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
  } as ParsedDraftShape;
}

function authorityParties(): PaidProSignerMetadataParty[] {
  return P.map((p, i) => ({
    partyIndex: i,
    partyLegalName: p.legal,
    signerEmail: p.email,
    signerName: p.signer,
    signerTitle: p.title,
    partyAddress: p.addr,
  }));
}

// Long operative body so the freeze candidate is a genuinely substantive 40k+ corpus (matching the
// live 42k `server_full_draft`), not a thin shell.
const para =
  "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties. Time is of the essence with respect to each material milestone, and no waiver shall be effective unless made in a signed writing. Each Party shall maintain complete and accurate books and records and shall cooperate reasonably in connection with any audit contemplated by this Agreement, and shall promptly remediate any deficiency identified in a written notice delivered under the notices provisions of this Agreement.";
const topics = [
  "Services and Deliverables", "Compensation and Invoicing", "Term and Termination", "Confidentiality",
  "Data Security and Information Governance", "Intellectual Property", "Representations and Warranties",
  "Limitation of Liability", "Indemnification", "Insurance and Compliance", "Independent Contractor Status",
  "Assignment", "Force Majeure", "Dispute Resolution", "General Provisions",
];

function clauseText(overrideBody?: (topicIndex: number) => string | null): string {
  return topics
    .map((t, i) => {
      const override = overrideBody?.(i);
      const body = override ?? `${para} ${para} ${para} ${para}`;
      return `${i + 1}. ${t}. ${body}`;
    })
    .join("\n\n");
}

function head(clauses: string): string[] {
  return [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${P[0].legal} ("Client"), ${P[1].legal} ("Service Provider"), ${P[2].legal} ("Service Provider"), and ${P[3].legal} ("Service Provider").`,
    "",
    clauses,
    "",
  ];
}
function noticesSection(): string[] {
  return [
    `${topics.length + 1}. Notices`,
    ...P.flatMap((p) => [`If to ${p.legal}:`, p.legal, `Attn: ${p.signer}, ${p.title}`, `Email: ${p.email}`, "Address:", p.addr, ""]),
  ];
}
function governingLaw(): string[] {
  return [`${topics.length + 2}. GOVERNING LAW`, "This Agreement is governed by the laws of the State of Delaware.", ""];
}
function executionBlock(): string[] {
  return [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...P.flatMap((p) => [`${p.role.toUpperCase()}: ${p.legal}`, "By: _________________________________", `Name: ${p.signer}`, `Title: ${p.title}`, ""]),
  ];
}

function cleanCorpus(): string {
  return [...head(clauseText()), ...noticesSection(), ...governingLaw(), ...executionBlock()].join("\n");
}
/** Substantive 40k+ corpus whose Compensation clause leaves a genuinely unresolvable degraded literal. */
function tbdLiteralCorpus(): string {
  const clauses = clauseText((i) => (i === 1 ? `Compensation shall be TBD. ${para} ${para} ${para} ${para}` : null));
  return [...head(clauses), ...noticesSection(), ...governingLaw(), ...executionBlock()].join("\n");
}

function freeze(corpus: string) {
  setConsumedPaidProSignerMetadataAuthority({ parties: authorityParties(), source: "live_ui", hash: "t563", updatedAt: 0 });
  const res = buildPaidProFreezeCandidate({
    text: corpus,
    draft: draft(),
    intakeText: INTAKE,
    source: "server_full_draft",
    surface: "test563",
  });
  clearConsumedPaidProSignerMetadataAuthority();
  return res;
}

afterEach(() => {
  clearConsumedPaidProSignerMetadataAuthority();
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
});

describe("TEST563 — document_boundary_blocked surfaces the real defect for a substantive 40k corpus", () => {
  it("freezes a substantive 40k+ corpus the boundary authority can safely repair (no blank review)", () => {
    const corpus = cleanCorpus();
    expect(corpus.length).toBeGreaterThan(40_000);
    const res = freeze(corpus);
    expect(res.ok).toBe(true);
    expect(res.rejectReason).toBeNull();
    expect(res.text.length).toBeGreaterThan(40_000);
  });

  it("rejects a substantive 40k+ corpus with an unresolvable render token using a SPECIFIC non-collapsed reason", () => {
    const corpus = tbdLiteralCorpus();
    expect(corpus.length).toBeGreaterThan(40_000);
    const res = freeze(corpus);
    expect(res.ok).toBe(false);
    // The real defect (the exact unresolved token) is named — not collapsed to a bare
    // `document_boundary_blocked`.
    expect(res.rejectReason).toMatch(/^document_boundary_blocked:unresolved_render_tokens:/);
    expect(res.rejectReason).toContain("TBD");
    expect(res.rejectReason).not.toBe("document_boundary_blocked");
  });

  it("old thin candidates from a prior failed attempt do not overwrite a later freeze-latched substantive generation", () => {
    const substantive = cleanCorpus();
    expect(substantive.length).toBeGreaterThan(40_000);

    // A prior attempt's thin body must not be treated as authority before a latch exists.
    const beforeLatch = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: "x".repeat(1224),
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
    });
    expect(beforeLatch.rejected).toBe(true);
    expect(beforeLatch.acceptedLen).toBe(0);

    // The later substantive generation establishes the freeze latch.
    freezeAcceptedPremiumBodyForSession("gen-563", substantive, "server_full_draft");

    // The stale thin candidate now loses to the latched substantive body: the guard returns the
    // substantive body, never the thin one.
    const afterLatch = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: "x".repeat(1224),
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
    });
    expect(afterLatch.rejected).toBe(true);
    // The guard returns the (trimmed) latched substantive body, never the thin 1224 candidate.
    expect(afterLatch.text.length).toBe(substantive.trim().length);
    expect(afterLatch.acceptedLen).toBe(substantive.trim().length);
    expect(afterLatch.text.length).toBeGreaterThan(40_000);
  });
});
