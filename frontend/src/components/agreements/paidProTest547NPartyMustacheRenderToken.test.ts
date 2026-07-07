/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  applyPaidProDocumentBoundaryAuthority,
  assertPaidProDocumentBoundaryAuthorityForFreeze,
} from "./paidProDocumentBoundaryAuthority";
import {
  enforceUserVisibleRenderTokenAuthority,
  scanUnresolvedRenderTokens,
} from "./userVisibleRenderTokenAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const P = [
  { legal: "Aurora Grid Systems LLC", role: "Client", signer: "Sarah Mitchell", title: "CEO", email: "contracts@auroragrid.com", addr: "100 Commerce Way, Tulsa, OK 74103" },
  { legal: "Basalt Freight Partners LLC", role: "Service Provider", signer: "Michael Torres", title: "President", email: "legal@basaltfreight.com", addr: "250 Innovation Drive, Austin, TX 78701" },
  { legal: "Cedar Point Analytics Inc", role: "Advisor", signer: "Dana Whitfield", title: "Managing Director", email: "ops@cedarpointanalytics.com", addr: "88 Lakeshore Blvd, Chicago, IL 60601" },
  { legal: "Delta Harbor Robotics LLC", role: "Integrator", signer: "Priya Nair", title: "COO", email: "notices@deltaharborrobotics.com", addr: "17 Seaport Lane, Boston, MA 02210" },
] as const;

const INTAKE = [
  `Create a professional technology services and AI integration agreement between the following four parties: ${P[0].legal}, ${P[1].legal}, ${P[2].legal}, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
  "Confidential. Texas law.",
].join("\n");

function draft(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "consulting_agreement",
    parties: P.map((p) => ({ name: p.legal, role: p.role, email: p.email, partyAddress: p.addr })) as never,
    purpose: "Platform integration, analytics, and logistics services across four parties.",
    payment_terms: "Milestone-based fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 240000, cadence: "monthly", valid: true },
  };
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

// Substantive four-party consulting corpus where parties 3 and 4 are referenced through MUSTACHE
// template variables ({{party_3}}, {{party_4}}, {{email_3}}, {{address_4}}) — exactly the leaked
// server tokens that the render-token authority previously failed to resolve (only slots 1-2), which
// blocked the substantive draft via document_boundary_blocked and fell back to the thin retry shell.
function buildFourPartyCorpus(): string {
  const para =
    "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties. Time is of the essence with respect to each material milestone, and no waiver shall be effective unless made in a signed writing. Each Party shall maintain complete and accurate books and records and shall cooperate reasonably in connection with any audit contemplated by this Agreement.";
  const topics = [
    "Services and Deliverables",
    "Compensation and Invoicing",
    "Term and Termination",
    "Confidentiality",
    "Data Security and Information Governance",
    "Intellectual Property",
    "Representations and Warranties",
    "Limitation of Liability",
    "Indemnification",
    "Insurance and Compliance",
    "Independent Contractor Status",
    "Assignment",
    "Force Majeure",
    "Dispute Resolution",
    "General Provisions",
  ];
  const clauses = topics.map((t, i) => `${i + 1}. ${t}. ${para} ${para}`).join("\n\n");
  return [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${P[0].legal} ("Client"), ${P[1].legal} ("Service Provider"), {{party_3}} ("Advisor"), and {{party_4}} ("Integrator").`,
    `The Advisor may be reached at {{email_3}} and the Integrator at {{address_4}}.`,
    "",
    clauses,
    "",
    `${topics.length + 1}. Notices`,
    ...P.flatMap((p) => [`If to ${p.legal}:`, p.legal, `Attn: ${p.signer}, ${p.title}`, `Email: ${p.email}`, "Address:", p.addr, ""]),
    `${topics.length + 2}. GOVERNING LAW`,
    "This Agreement is governed by the laws of the State of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...P.flatMap((p) => [`${p.role.toUpperCase()}: ${p.legal}`, "By: _________________________________", `Name: ${p.signer}`, `Title: ${p.title}`, ""]),
  ].join("\n");
}

afterEach(() => clearConsumedPaidProSignerMetadataAuthority());

describe("TEST547 — N-party mustache render tokens resolve from authority (no thin-shell fallback)", () => {
  it("resolves {{party_3}}/{{party_4}}/{{email_3}}/{{address_4}} for a substantive 4-party corpus", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: authorityParties(),
      source: "live_ui",
      hash: "x",
      updatedAt: 0,
    });

    const raw = buildFourPartyCorpus();
    // The leaked mustache tokens are genuinely present in the server body (preserved, not injected).
    expect(scanUnresolvedRenderTokens(raw).map((m) => m.token).sort()).toEqual(
      ["{{address_4}}", "{{email_3}}", "{{party_3}}", "{{party_4}}"].sort(),
    );

    const prepared = preparePaidProServerDocumentForAcceptance(raw, draft(), INTAKE).text;
    const safe = applyAcceptedProCorpusSafeDisplay(prepared, { draft: draft(), intakeText: INTAKE }).text;

    const boundary = applyPaidProDocumentBoundaryAuthority(safe, {
      draft: draft(),
      intakeText: INTAKE,
      parties: authorityParties(),
      draftPartyCount: 4,
      handoffPartySlots: 4,
    });

    // 1. Boundary authority passes and leaves no unresolved render tokens.
    expect(boundary.ok).toBe(true);
    expect(scanUnresolvedRenderTokens(boundary.text)).toEqual([]);

    // 2. Party 3 and party 4 identities are actually rendered (resolved from authority, not stripped).
    expect(boundary.text).toContain(P[2].legal);
    expect(boundary.text).toContain(P[3].legal);
    expect(boundary.text).toContain(P[2].email);
    expect(boundary.text).toContain(P[3].addr);

    // 3. The substantive candidate freezes without throwing document_boundary_blocked.
    expect(() =>
      assertPaidProDocumentBoundaryAuthorityForFreeze(raw, {
        draft: draft(),
        intakeText: INTAKE,
        parties: authorityParties(),
        draftPartyCount: 4,
        handoffPartySlots: 4,
        surface: "test547_freeze",
      }),
    ).not.toThrow();
  });

  it("still blocks a genuinely unresolvable template variable (no validation weakening)", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: authorityParties(),
      source: "live_ui",
      hash: "x",
      updatedAt: 0,
    });
    const body = `Section 1. The Service Provider shall deliver the {{scope_of_work}} to ${P[0].legal}.`;
    const res = enforceUserVisibleRenderTokenAuthority(body, {
      intakeRaw: INTAKE,
      partyNames: P.map((p) => p.legal),
      parties: authorityParties(),
      surface: "test547_control",
      blockOnUnresolved: false,
    });
    expect(res.unresolvedTokens).toContain("{{scope_of_work}}");
    expect(scanUnresolvedRenderTokens(res.text).map((m) => m.token)).toContain("{{scope_of_work}}");
  });

  it("resolves mustache party slots beyond four (party_5) when authority has the slot", () => {
    const five: PaidProSignerMetadataParty[] = [
      ...authorityParties(),
      { partyIndex: 4, partyLegalName: "Everest Signal Works LLC", signerEmail: "e@everest.com", signerName: "Owen Park", signerTitle: "VP", partyAddress: "5 Ridge Rd, Denver, CO 80202" },
    ];
    const res = enforceUserVisibleRenderTokenAuthority(
      "Section 1. Together with {{party_5}} at {{email_5}}, the parties agree.",
      { intakeRaw: INTAKE, partyNames: five.map((p) => p.partyLegalName), parties: five, surface: "test547_p5", blockOnUnresolved: false },
    );
    expect(scanUnresolvedRenderTokens(res.text)).toEqual([]);
    expect(res.text).toContain("Everest Signal Works LLC");
    expect(res.text).toContain("e@everest.com");
  });
});
