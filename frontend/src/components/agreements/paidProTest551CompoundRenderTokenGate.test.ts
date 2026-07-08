/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import {
  enforceUserVisibleRenderTokenAuthority,
  scanUnresolvedRenderTokens,
} from "./userVisibleRenderTokenAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";

// TEST551 — a degraded server draft for a four-party consulting agreement leaked COMPOUND
// per-party template variables ({{party_3_name}}, {{party_4_name}}, {{party_3_email}} …). The
// render-token resolver only matched the bare `party_N` mustache form (TEST547), so the compound
// form survived unresolved and the placeholder gate rejected the substantive 40k corpus
// (pipeline_placeholder_blocked → client_gates_rejected → thin retry shell). These tokens are
// resolvable from the frozen party authority; genuine content tokens must still block.
const P = [
  { legal: "Redwood Biologics Inc", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121" },
  { legal: "Summit AI Consulting LLC", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701" },
  { legal: "Blue Harbor Systems LLC", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601" },
  { legal: "Iron Gate Security LLC", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108" },
] as const;

const INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  `${P[0].legal}, ${P[1].legal}, ${P[2].legal}, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
  "Delaware governing law.",
].join("\n");

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

function build40kCorpus(): string {
  const para =
    "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties. Time is of the essence with respect to each material milestone, and no waiver shall be effective unless made in a signed writing. Each Party shall maintain complete and accurate books and records and shall cooperate reasonably in connection with any audit contemplated by this Agreement, and shall provide such further assurances as may be reasonably requested from time to time.";
  const topics = [
    "Services and Deliverables", "Compensation and Invoicing", "Term and Termination", "Confidentiality",
    "Data Security and Information Governance", "Intellectual Property", "Representations and Warranties",
    "Limitation of Liability", "Indemnification", "Insurance and Compliance", "Independent Contractor Status",
    "Assignment", "Force Majeure", "Dispute Resolution", "General Provisions", "Compliance with Laws",
    "Audit Rights", "Subcontracting", "Publicity", "Survival",
  ];
  const clauses = topics.map((t, i) => `${i + 1}. ${t}.\n${para}\n${para}\n${para}`).join("\n\n");
  return [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${P[0].legal} ("Client"), ${P[1].legal} ("Service Provider"), {{party_3_name}} ("Service Provider"), and {{party_4_name}} ("Service Provider").`,
    "",
    clauses,
    "",
    `${topics.length + 1}. Notices`,
    `If to ${P[0].legal}: ${P[0].email}`,
    `If to ${P[1].legal}: ${P[1].email}`,
    `If to {{party_3_name}}: {{party_3_email}}`,
    `If to {{party_4_name}}: {{party_4_email}}`,
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    "",
    ...P.flatMap((p) => [`${p.legal}`, "By: _________________________________", `Name: ${p.signer}`, `Title: ${p.title}`, "Date: ______________", ""]),
  ].join("\n");
}

afterEach(() => clearConsumedPaidProSignerMetadataAuthority());

describe("TEST551 — compound {{party_N_field}} render tokens resolve without weakening the gate", () => {
  it("resolves compound / role / recipient / signatory mustache tokens from authority", () => {
    const ctx = {
      intakeRaw: INTAKE,
      partyNames: P.map((p) => p.legal),
      parties: authorityParties(),
      surface: "test551_units",
      blockOnUnresolved: false,
    };
    const cases: Array<[string, string]> = [
      ["{{party_3_name}}", P[2].legal],
      ["{{party_4_name}}", P[3].legal],
      ["{{party_2_address}}", P[1].addr],
      ["{{party_3_title}}", P[2].title],
      ["{{party_4_signer}}", P[3].signer],
      ["{{client_name}}", P[0].legal],
      ["{{provider_name}}", P[1].legal],
      ["{{recipient_email_3}}", P[2].email],
      ["{{signatory_name_4}}", P[3].signer],
    ];
    for (const [token, expected] of cases) {
      const res = enforceUserVisibleRenderTokenAuthority(`Section 5. Regarding ${token} the Parties agree.`, ctx);
      expect(scanUnresolvedRenderTokens(res.text)).toEqual([]);
      expect(res.text).toContain(expected);
    }
  });

  it("accepts the substantive 40k four-party corpus (both pipeline surfaces) with parties 3/4 rendered", () => {
    setConsumedPaidProSignerMetadataAuthority({ parties: authorityParties(), source: "live_ui", hash: "t551", updatedAt: 0 });
    const raw = build40kCorpus();
    expect(raw.length).toBeGreaterThan(30_000);
    // The compound tokens are genuinely present in the raw (server-preserved) corpus.
    expect(new Set(scanUnresolvedRenderTokens(raw).map((m) => m.token))).toEqual(
      new Set(["{{party_3_name}}", "{{party_4_name}}", "{{party_3_email}}", "{{party_4_email}}"]),
    );

    for (const surface of ["premium_completion_pipeline", "premium_completion_pipeline:preserved_recovery"]) {
      const ph = finalizeUserVisibleAgreementPlainText(raw, {
        intakeRaw: INTAKE,
        partyNames: P.map((p) => p.legal),
        agreementFamily: "consulting_agreement",
        surface,
      });
      expect(ph.ok).toBe(true);
      expect(ph.remainingFatal).toEqual([]);
      expect(scanUnresolvedRenderTokens(ph.text)).toEqual([]);
      expect(ph.text).toContain(P[2].legal);
      expect(ph.text).toContain(P[3].legal);
    }
  });

  it("still blocks a genuinely unresolved content token (no validation weakening)", () => {
    setConsumedPaidProSignerMetadataAuthority({ parties: authorityParties(), source: "live_ui", hash: "t551", updatedAt: 0 });
    const ctx = {
      intakeRaw: INTAKE,
      partyNames: P.map((p) => p.legal),
      parties: authorityParties(),
      surface: "test551_control",
      blockOnUnresolved: false,
    };
    for (const token of ["{{scope_of_work}}", "{{payment_terms}}", "{{party_3_scope}}"]) {
      const res = enforceUserVisibleRenderTokenAuthority(`Section 2. The Provider shall deliver ${token} to ${P[0].legal}.`, ctx);
      expect(res.unresolvedTokens).toContain(token);
      expect(scanUnresolvedRenderTokens(res.text).map((m) => m.token)).toContain(token);
    }
  });
});
