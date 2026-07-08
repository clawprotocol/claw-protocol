/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  isAuthoritativeLegalEntityName,
  isStateLegalFormOnlyName,
} from "./paidProPartyNamePreserve";
import {
  isInvalidPartySlotLegalEntity,
  resolveAuthoritativeIntakePartyNames,
} from "./partySlotIdentityNormalize";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { scanUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

// The exact four-party prompt from the TEST550 production repro, where two parties carry a
// legal-form appositive ("a Texas LLC" / "an Illinois LLC"). A comma-split extractor previously
// promoted the bare "Texas LLC" / "Illinois LLC" fragment to phantom parties: signer setup showed
// Party 3 = "Texas LLC" (shifting Blue Harbor to slot 4 and dropping Iron Gate), notices/execution
// leaked those forms, and slot-mapped signer emails landed on the wrong entities.
const P = [
  { legal: "Redwood Biologics Inc", role: "Client", signer: "Emily Carter", title: "Chief Executive Officer", email: "emily.carter@redwoodbiologics.com", addr: "400 Genome Way, San Diego, CA 92121" },
  { legal: "Summit AI Consulting LLC", form: "a Texas LLC", role: "Service Provider", signer: "Daniel Brooks", title: "Managing Partner", email: "daniel.brooks@summitaiconsulting.com", addr: "1200 Congress Ave, Austin, TX 78701" },
  { legal: "Blue Harbor Systems LLC", form: "an Illinois LLC", role: "Service Provider", signer: "Sophia Martinez", title: "Director of Implementation", email: "sophia.martinez@blueharborsystems.com", addr: "55 Wacker Dr, Chicago, IL 60601" },
  { legal: "Iron Gate Security LLC", role: "Service Provider", signer: "Michael Reynolds", title: "Chief Security Officer", email: "michael.reynolds@irongatesecurity.com", addr: "9 Beacon St, Boston, MA 02108" },
] as const;

const EXPECTED_NAMES = P.map((p) => p.legal);
const LEAKED_FORMS = ["Texas LLC", "Illinois LLC", "a Texas LLC", "an Illinois LLC"];

const INTAKE = [
  "Create a professional technology services and AI integration agreement between the following four parties:",
  `${P[0].legal}, ${P[1].legal}, a Texas LLC, ${P[2].legal}, an Illinois LLC, and ${P[3].legal}.`,
  ...P.map((p) => `${p.legal}${"form" in p ? `, ${(p as { form: string }).form}` : ""}: ${p.signer}, ${p.title}, ${p.email}, ${p.addr}`),
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

// Substantive four-party corpus whose recital carries the legal-form appositives inline, and whose
// notices + execution blocks are keyed by the canonical entities.
function buildCorpus(): string {
  const para =
    "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties. Time is of the essence with respect to each material milestone, and no waiver shall be effective unless made in a signed writing. Each Party shall maintain complete and accurate books and records and shall cooperate reasonably in connection with any audit contemplated by this Agreement.";
  const topics = [
    "Services and Deliverables", "Compensation and Invoicing", "Term and Termination", "Confidentiality",
    "Data Security and Information Governance", "Intellectual Property", "Representations and Warranties",
    "Limitation of Liability", "Indemnification", "Insurance and Compliance", "Independent Contractor Status",
    "Assignment", "Force Majeure", "Dispute Resolution", "General Provisions",
  ];
  const clauses = topics.map((t, i) => `${i + 1}. ${t}. ${para} ${para}`).join("\n\n");
  return [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${P[0].legal} ("Client"), ${P[1].legal}, a Texas LLC ("Service Provider"), ${P[2].legal}, an Illinois LLC ("Service Provider"), and ${P[3].legal} ("Service Provider").`,
    "",
    clauses,
    "",
    `${topics.length + 1}. Notices`,
    ...P.flatMap((p) => [`If to ${p.legal}:`, p.legal, `Attn: ${p.signer}, ${p.title}`, `Email: ${p.email}`, "Address:", p.addr, ""]),
    `${topics.length + 2}. GOVERNING LAW`,
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...P.flatMap((p) => [`${p.role.toUpperCase()}: ${p.legal}`, "By: _________________________________", `Name: ${p.signer}`, `Title: ${p.title}`, ""]),
  ].join("\n");
}

afterEach(() => clearConsumedPaidProSignerMetadataAuthority());

describe("TEST550 — legal-form appositives never become party/notice/execution identities", () => {
  it("rejects '<state> <legal-form>' fragments but preserves real names containing a state word", () => {
    for (const leaked of LEAKED_FORMS) {
      expect(isStateLegalFormOnlyName(leaked)).toBe(true);
      expect(isAuthoritativeLegalEntityName(leaked)).toBe(false);
      expect(isInvalidPartySlotLegalEntity(leaked)).toBe(true);
    }
    // Distinctive names that merely contain a state token must survive.
    for (const real of ["Texas Instruments Inc", "New York Life Insurance Company", "Washington Post LLC", ...EXPECTED_NAMES]) {
      expect(isStateLegalFormOnlyName(real)).toBe(false);
      expect(isAuthoritativeLegalEntityName(real)).toBe(true);
    }
  });

  it("resolves the intake manifest to the four canonical parties (no phantom Texas/Illinois LLC)", () => {
    const names = resolveAuthoritativeIntakePartyNames(INTAKE);
    expect(names).toEqual(EXPECTED_NAMES);
    expect(names).not.toContain("Texas LLC");
    expect(names).not.toContain("Illinois LLC");
  });

  it("keeps signer emails bound to the correct entities (no slot shift onto a phantom party)", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: authorityParties(),
      source: "live_ui",
      hash: "t550",
      updatedAt: 0,
    });

    const raw = buildCorpus();
    const prepared = preparePaidProServerDocumentForAcceptance(raw, draft(), INTAKE).text;
    const safe = applyAcceptedProCorpusSafeDisplay(prepared, { draft: draft(), intakeText: INTAKE }).text;
    const boundary = applyPaidProDocumentBoundaryAuthority(safe, {
      draft: draft(),
      intakeText: INTAKE,
      parties: authorityParties(),
      draftPartyCount: 4,
      handoffPartySlots: 4,
    });

    expect(boundary.ok).toBe(true);
    expect(scanUnresolvedRenderTokens(boundary.text)).toEqual([]);

    // All four canonical entities are present.
    for (const name of EXPECTED_NAMES) expect(boundary.text).toContain(name);

    // No notice / execution identity heading for the leaked legal forms.
    expect(boundary.text).not.toMatch(/If to (?:an? )?(?:Texas|Illinois) LLC:/i);
    expect(boundary.text).not.toMatch(/SERVICE PROVIDER: (?:an? )?(?:Texas|Illinois) LLC\b/i);
    expect(boundary.text).not.toMatch(/^\s*(?:an? )?(?:Texas|Illinois) LLC\s*$/im);

    // Each signer email stays adjacent to its own entity's notice stanza — Sophia with Blue Harbor,
    // Michael with Iron Gate (the production drift landed them on Texas LLC / Blue Harbor).
    for (const p of P) {
      const stanza = new RegExp(`If to ${p.legal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[\\s\\S]{0,220}?${p.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      expect(boundary.text).toMatch(stanza);
    }
  });
});
